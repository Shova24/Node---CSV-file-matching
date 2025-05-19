const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { Worker } = require('worker_threads');

const app = express();
const PORT = 3000;

// Multer setup
const upload = multer({ dest: 'uploads/' });
app.use(express.static('public'));

function runWorker(file1Path, file2Path) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(path.join(__dirname, 'match-worker.js'), {
      workerData: { file1Path, file2Path }
    });

    worker.on('message', (data) => {
      if (data && data.error) return reject(new Error(data.error));
      resolve(data);
    });

    worker.on('error', reject);
    worker.on('exit', code => {
      if (code !== 0) reject(new Error(`Worker stopped with exit code ${code}`));
    });
  });
}

// Route to upload and process CSVs
app.post(
  '/upload',
  upload.fields([
    { name: 'file1', maxCount: 1 },
    { name: 'file2', maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      if (!req.files || !req.files.file1 || !req.files.file2) {
        return res.status(400).send('Both files are required');
      }

      const file1Path = req.files.file1[0].path;
      const file2Path = req.files.file2[0].path;
      const outputPath = path.join(__dirname, 'matched.csv');

      console.log('Processing request:');
      console.log('File1:', req.files.file1[0].originalname);
      console.log('File2:', req.files.file2[0].originalname);

      try {
        // Use worker thread
        const matchedData = await runWorker(file1Path, file2Path);
        console.log('Matched data:', `Matched ${matchedData.length} rows`);

        if (!matchedData || matchedData.length === 0) {
          return res.status(400).send('No data could be generated. Please check your CSV files format.');
        }

        const headers = Object.keys(matchedData[0]);
        let csvContent = headers.join(',') + '\n';

        matchedData.forEach(row => {
          const rowContent = headers.map(header => {
            const value = row[header] || '';
            return value.includes(',') || value.includes('"') 
              ? `"${value.replace(/"/g, '""')}"`
              : value;
          }).join(',');
          csvContent += rowContent + '\n';
        });

        fs.writeFileSync(outputPath, csvContent);

        res.download(outputPath, 'matched.csv', (err) => {
          if (err) {
            console.error('Download error:', err);
            return res.status(500).send('Error downloading the matched file');
          }

          setTimeout(() => {
            try {
              fs.unlinkSync(file1Path);
              fs.unlinkSync(file2Path);
              fs.unlinkSync(outputPath);
              console.log('Temporary files cleaned up');
            } catch (cleanupErr) {
              console.error('Error cleaning up files:', cleanupErr);
            }
          }, 5000);
        });
      } catch (processingError) {
        console.error('CSV processing error:', processingError);
        return res.status(500).send(`Error processing CSV files: ${processingError.message}`);
      }
    } catch (err) {
      console.error('General error:', err);
      res.status(500).send(`Error processing request: ${err.message}`);
    }
  }
);

app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});

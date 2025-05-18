const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const fastcsv = require('fast-csv');

const app = express();
const PORT = 3000;

// Multer setup for uploads
const upload = multer({ dest: 'uploads/' });

app.use(express.static('public')); // Serve index.html

function normalize(str) {
  return str.trim().toLowerCase();
}

// CSV Matching Logic
function matchCSVColumns(file1Path, file2Path) {
  return new Promise((resolve, reject) => {
    try {
      const file1Content = fs.readFileSync(file1Path, 'utf8');
      const file2Content = fs.readFileSync(file2Path, 'utf8');

      const file1Lines = file1Content.trim().split('\n');
      const file2Lines = file2Content.trim().split('\n');

      if (file1Lines.length === 0 || file2Lines.length === 0) {
        return reject(new Error('One or both files are empty'));
      }

      const file1Headers = file1Lines[0].split(',').map(h => h.trim()).filter(Boolean);
      const file2Headers = file2Lines[0].split(',').map(h => h.trim()).filter(Boolean);

      const headerIndexMap = {};
      file2Headers.forEach((header, index) => {
        headerIndexMap[normalize(header)] = index;
      });

      const matchedData = [];

      // Process all data rows in file2
      for (let i = 1; i < file2Lines.length; i++) {
        const line = file2Lines[i].trim();
        if (!line) continue; // Skip empty lines

        const rowCells = line.split(',');

        const resultRow = {};
        file1Headers.forEach(header => {
          const normalized = normalize(header);
          const index = headerIndexMap[normalized];
          resultRow[header] = (index !== undefined && index < rowCells.length)
            ? rowCells[index].trim()
            : '';
        });

        matchedData.push(resultRow);
      }

      resolve(matchedData);
    } catch (error) {
      reject(error);
    }
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
        // Process the CSV files
        const matchedData = await matchCSVColumns(file1Path, file2Path);
        console.log('Matched data:', JSON.stringify(matchedData, null, 2));

        if (!matchedData || matchedData.length === 0) {
          return res.status(400).send('No data could be generated. Please check your CSV files format.');
        }

        // Get headers from the result
        const headers = Object.keys(matchedData[0]);
        
        // Create the CSV content directly
        let csvContent = headers.join(',') + '\n';
        
        matchedData.forEach(row => {
          const rowContent = headers.map(header => {
            const value = row[header] || '';
            // Quote values with commas or quotes
            return value.includes(',') || value.includes('"') 
              ? `"${value.replace(/"/g, '""')}"` 
              : value;
          }).join(',');
          csvContent += rowContent + '\n';
        });
        
        // Write the CSV file
        fs.writeFileSync(outputPath, csvContent);
        
        console.log('CSV file written successfully');
        console.log('CSV content:', csvContent);
        
        // Send the file for download
        res.download(outputPath, 'matched.csv', (err) => {
          if (err) {
            console.error('Download error:', err);
            return res.status(500).send('Error downloading the matched file');
          }
          
          // Clean up files after a delay
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

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
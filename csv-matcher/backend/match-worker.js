// match-worker.js
const { parentPort, workerData } = require('worker_threads');
const fs = require('fs');

function normalize(str) {
  return str.trim().toLowerCase();
}

function matchCSVColumns(file1Path, file2Path) {
  const file1Content = fs.readFileSync(file1Path, 'utf8');
  const file2Content = fs.readFileSync(file2Path, 'utf8');

  const file1Lines = file1Content.trim().split('\n');
  const file2Lines = file2Content.trim().split('\n');

  const file1Headers = file1Lines[0].split(',').map(h => h.trim()).filter(Boolean);
  const file2Headers = file2Lines[0].split(',').map(h => h.trim()).filter(Boolean);

  const headerIndexMap = {};
  file2Headers.forEach((header, index) => {
    headerIndexMap[normalize(header)] = index;
  });

  const matchedData = [];

  for (let i = 1; i < file2Lines.length; i++) {
    const line = file2Lines[i].trim();
    if (!line) continue;

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

  return matchedData;
}

try {
  const result = matchCSVColumns(workerData.file1Path, workerData.file2Path);
  parentPort.postMessage(result);
} catch (err) {
  parentPort.postMessage({ error: err.message });
}

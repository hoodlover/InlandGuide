// Stamps frontend/src/data/master-status.json for a scheduled auto-publish.
//
// The manual (browser) publish records when the master workbook was pushed
// live; the scheduled job has no browser, so this does the same thing locally:
// hashes the workbook at EXCEL_PATH, counts the freshly-exported lanes, and
// writes the current time as publishedAt. Because publishedAt always changes,
// there is always something to commit, so every 9am/3pm run refreshes the
// "Rail data updated" stamp and redeploys.

import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const dataDir = resolve(root, 'frontend/src/data');

// Read EXCEL_PATH from backend/.env (same value refresh-data.js uses).
function readExcelPath() {
  const env = readFileSync(resolve(root, 'backend/.env'), 'utf8');
  const line = env.split(/\r?\n/).find(l => /^\s*EXCEL_PATH\s*=/.test(l));
  if (!line) throw new Error('EXCEL_PATH is not set in backend/.env');
  return line.replace(/^\s*EXCEL_PATH\s*=/, '').trim().replace(/^"(.*)"$/, '$1');
}

const excelPath = readExcelPath();
const workbook = readFileSync(excelPath); // throws if the synced master is missing
const sourceHash = createHash('sha256').update(workbook).digest('hex').toUpperCase();

const lanes = JSON.parse(readFileSync(resolve(dataDir, 'lanes.json'), 'utf8'));

writeFileSync(
  resolve(dataDir, 'master-status.json'),
  `${JSON.stringify({ publishedAt: new Date().toISOString(), sourceHash, laneCount: lanes.length }, null, 2)}\n`,
);

console.log(`Stamped master-status.json — ${lanes.length} lanes, master ${sourceHash.slice(0, 12)}.`);

// Stamps frontend/src/data/master-status.json for a scheduled auto-publish.
//
// The manual (browser) publish records when the master workbook was pushed
// live; the scheduled job has no browser, so this does the same thing locally:
// uses the exact validated workbook selected by refresh-data.js, counts the
// freshly-exported lanes, and writes the current time as publishedAt. The
// orchestrator calls this only after detecting a real data change.

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const dataDir = resolve(root, 'frontend/src/data');
const source = JSON.parse(readFileSync(resolve(root, 'backend/.last-master-source.json'), 'utf8'));
const lanes = JSON.parse(readFileSync(resolve(dataDir, 'lanes.json'), 'utf8'));
if (source.schema !== 1 || !/^[A-F0-9]{64}$/.test(source.sourceHash || '')) {
  throw new Error('The validated master source record is missing or invalid.');
}
if (!Array.isArray(lanes) || lanes.length < 100 || lanes.length > 1000 || source.laneCount !== lanes.length) {
  throw new Error('The exported lane count is outside the safe range or does not match its source record.');
}

writeFileSync(
  resolve(dataDir, 'master-status.json'),
  `${JSON.stringify({ publishedAt: new Date().toISOString(), sourceHash: source.sourceHash, laneCount: lanes.length }, null, 2)}\n`,
);

console.log(`Stamped master-status.json — ${lanes.length} lanes from ${source.kind}, master ${source.sourceHash.slice(0, 12)}.`);

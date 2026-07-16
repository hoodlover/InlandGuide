import { gunzipSync } from 'node:zlib';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const encoded = process.env.MASTER_PAYLOAD || '';
if (!encoded || encoded.length > 60000 || !/^[A-Za-z0-9+/=]+$/.test(encoded)) {
  throw new Error('MASTER_PAYLOAD is missing or invalid.');
}

const payload = JSON.parse(gunzipSync(Buffer.from(encoded, 'base64')).toString('utf8'));
if (payload.schema !== 1 || !/^[A-F0-9]{64}$/.test(payload.sourceHash || '')) throw new Error('Unsupported master payload.');
if (!Array.isArray(payload.lanes) || payload.lanes.length < 100 || payload.lanes.length > 1000) throw new Error('Master lane count is outside the safe range.');
if (!payload.holidays || !payload.portmc || !payload.portServices) throw new Error('Master payload is incomplete.');

for (const lane of payload.lanes) {
  if (!/^(US|CA|MX)[A-Z]{3}$/.test(String(lane.pol || '')) || !lane.name || !lane.rampMC) {
    throw new Error('Master payload contains an invalid calculator lane.');
  }
}

const dataDir = resolve(root, 'frontend/src/data');
const existingStatusPath = resolve(dataDir, 'master-status.json');
let existingStatus = {};
try { existingStatus = JSON.parse(readFileSync(existingStatusPath, 'utf8')); } catch { /* first publish */ }
const publishedAt = existingStatus.sourceHash === payload.sourceHash
  ? existingStatus.publishedAt
  : new Date().toISOString();

const writeJson = (name, value) => writeFileSync(resolve(dataDir, name), `${JSON.stringify(value, null, 2)}\n`);
writeJson('lanes.json', payload.lanes);
writeJson('holidays.json', payload.holidays);
writeJson('portmc.json', payload.portmc);
writeJson('port-services.json', payload.portServices);
writeJson('master-status.json', {
  publishedAt,
  sourceHash: payload.sourceHash,
  laneCount: payload.lanes.length,
});

console.log(`Validated ${payload.lanes.length} lanes from master ${payload.sourceHash.slice(0, 12)}.`);

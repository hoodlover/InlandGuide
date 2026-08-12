// Validates the rename payload from the Managers Hub (Rename ports &
// terminals) and writes frontend/src/data/name-overrides.json. Display names
// only — no lane, holiday, or terminal-routing data is touched, so a bad
// rename can never break a calculation.
import { gunzipSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const encoded = process.env.NAMES_PAYLOAD || '';
if (!encoded || encoded.length > 60000 || !/^[A-Za-z0-9+/=]+$/.test(encoded)) {
  throw new Error('NAMES_PAYLOAD is missing or invalid.');
}

const payload = JSON.parse(gunzipSync(Buffer.from(encoded, 'base64')).toString('utf8'));
if (payload.schema !== 1 || typeof payload.ports !== 'object' || typeof payload.terminals !== 'object') {
  throw new Error('Unsupported rename payload.');
}

// Strips control characters and collapses whitespace; a label is 1–80 chars.
const cleanLabel = (value) => {
  const clean = String(value ?? '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x1f\x7f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
  if (!clean) throw new Error('A rename value is empty after cleaning.');
  return clean;
};

// Each override group validates its keys against the shape its source system
// uses. Groups absent from older payloads simply publish as empty.
const GROUPS = {
  ports: /^(US|CA|MX)[A-Z]{3}$/,                       // POL loccode
  terminals: /^[A-Za-z0-9][A-Za-z0-9 /&.\-]{0,39}$/,   // PORTMC matchcode ("MAHER 008", "FENIX")
  ramps: /^[A-Za-z0-9][A-Za-z0-9 /&.\-]{0,39}\|[^|]{2,60}$/, // "RAMPMC|CITY"
  canadaPorts: /^[a-z0-9][a-z0-9-]{1,39}$/,            // schedule slug ("montreal")
  canadaCities: /^[^|]{2,60}$/,                        // published city name
};

const result = {};
for (const [group, keyPattern] of Object.entries(GROUPS)) {
  const entries = payload[group] || {};
  if (typeof entries !== 'object' || Array.isArray(entries)) throw new Error(`Rename group '${group}' is not a map.`);
  if (Object.keys(entries).length > 500) throw new Error(`Rename group '${group}' is unexpectedly large.`);
  result[group] = {};
  for (const [key, label] of Object.entries(entries)) {
    if (!keyPattern.test(String(key))) throw new Error(`Invalid ${group} key in rename payload: ${key}`);
    result[group][key] = cleanLabel(label);
  }
}

const sortedEntries = (map) => Object.fromEntries(Object.entries(map).sort(([a], [b]) => a.localeCompare(b)));
writeFileSync(
  resolve(root, 'frontend/src/data/name-overrides.json'),
  `${JSON.stringify({
    _comment: "Manager-editable display names, published from the Managers Hub (Rename ports & terminals). 'ports' = POL loccode -> Port of Loading dropdown label. 'terminals' = PORTMC matchcode -> SSY/Terminal dropdown label. 'ramps' = 'RAMPMC|CITY' -> rail ramp label (e.g. 'NS / Landers'). 'canadaPorts' = schedule slug -> Canada tab port name. 'canadaCities' = published city -> Canada tab city label. Display only — every underlying code stays untouched so lanes keep matching the master workbook and schedule snapshots.",
    ...Object.fromEntries(Object.keys(GROUPS).map(group => [group, sortedEntries(result[group])])),
  }, null, 2)}\n`,
);

console.log(Object.keys(GROUPS).map(group => `${group}: ${Object.keys(result[group]).length}`).join(', '));

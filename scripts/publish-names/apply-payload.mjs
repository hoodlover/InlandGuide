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

const ports = {};
for (const [pol, label] of Object.entries(payload.ports)) {
  if (!/^(US|CA|MX)[A-Z]{3}$/.test(pol)) throw new Error(`Invalid port loccode in rename payload: ${pol}`);
  ports[pol] = cleanLabel(label);
}

const terminals = {};
for (const [code, label] of Object.entries(payload.terminals)) {
  // PORTMC matchcodes look like "MAHER 008" or "FENIX" — keep this permissive
  // but bounded, since the master owns the real code list.
  if (!/^[A-Za-z0-9][A-Za-z0-9 /&.\-]{0,39}$/.test(String(code))) {
    throw new Error(`Invalid terminal matchcode in rename payload: ${code}`);
  }
  terminals[code] = cleanLabel(label);
}

if (Object.keys(ports).length > 200 || Object.keys(terminals).length > 500) {
  throw new Error('The rename payload is unexpectedly large.');
}

const sortedEntries = (map) => Object.fromEntries(Object.entries(map).sort(([a], [b]) => a.localeCompare(b)));
writeFileSync(
  resolve(root, 'frontend/src/data/name-overrides.json'),
  `${JSON.stringify({
    _comment: 'Manager-editable display names for the calculator dropdowns, published from the Managers Hub (Rename ports & terminals). Display only — every underlying code stays untouched so lanes keep matching the master workbook.',
    ports: sortedEntries(ports),
    terminals: sortedEntries(terminals),
  }, null, 2)}\n`,
);

console.log(`Validated ${Object.keys(ports).length} port and ${Object.keys(terminals).length} terminal display names.`);

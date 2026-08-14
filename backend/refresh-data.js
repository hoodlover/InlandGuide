// Regenerates the bundled data snapshot + banner images used by the single-file app.
// Run via RefreshApp.bat (which then rebuilds InlandCutoffGuide.html).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const XLSX = require('xlsx');
const sharp = require('sharp');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'frontend/src/data');
const SOURCE_STATUS_PATH = path.join(__dirname, '.last-master-source.json');
const REQUIRED_SHEETS = ['DATABASE', 'HOLIDAYS', 'PORTMC', 'PORTSERVICES'];
const MIN_WORKBOOK_BYTES = 10 * 1024;
const MIN_LANES = 100;
const MAX_LANES = 1000;
const STABILITY_RETRIES = 3;
const STABILITY_DELAY_MS = 2000;

const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const writeJson = (name, value) => fs.writeFileSync(path.join(DATA_DIR, name), `${JSON.stringify(value, null, 2)}\n`);

function readStableWorkbook(candidate) {
  let lastError;
  for (let attempt = 1; attempt <= STABILITY_RETRIES; attempt += 1) {
    try {
      if (!candidate.path || !fs.existsSync(candidate.path)) throw new Error('file does not exist');
      const before = fs.statSync(candidate.path);
      if (!before.isFile()) throw new Error('path is not a file');
      if (before.size < MIN_WORKBOOK_BYTES) throw new Error(`file is only ${before.size} bytes`);

      const buffer = fs.readFileSync(candidate.path);
      const after = fs.statSync(candidate.path);
      if (buffer.length !== before.size || before.size !== after.size || before.mtimeMs !== after.mtimeMs) {
        throw new Error('file changed while it was being read');
      }

      const wb = XLSX.read(buffer, { type: 'buffer' });
      const missingSheets = REQUIRED_SHEETS.filter(name => !wb.Sheets[name]);
      if (missingSheets.length) throw new Error(`missing sheet(s): ${missingSheets.join(', ')}`);
      return { ...candidate, wb, buffer, stat: after };
    } catch (error) {
      lastError = error;
      if (attempt < STABILITY_RETRIES) sleep(STABILITY_DELAY_MS);
    }
  }
  throw lastError;
}

function buildMasterData(wb) {
  const rows = XLSX.utils.sheet_to_json(wb.Sheets.DATABASE, { header: 1 });
  const lanes = [];
  let inData = false;
  for (let i = 0; i < rows.length; i += 1) {
    if (rows[i][0] === 'STARTDATA') { inData = true; continue; }
    if (rows[i][0] === 'ENDDATA' || !inData) continue;
    if (rows[i][0] && rows[i][0] !== 'POL LOCCODE') {
      lanes.push({
        pol: rows[i][0], ssy: rows[i][1], name: rows[i][2], loccode: rows[i][3],
        rampMC: rows[i][4], rampCutTime: rows[i][5],
        transit: parseFloat(rows[i][6]) || 0, window: parseFloat(rows[i][7]) || 0,
        ssyAdjustment: parseFloat(rows[i][8]) || 0, reefer: rows[i][9],
        windowReefer: parseFloat(rows[i][10]) || 0,
      });
    }
  }
  if (lanes.length < MIN_LANES || lanes.length > MAX_LANES) {
    throw new Error(`produced ${lanes.length} lanes; safe range is ${MIN_LANES}-${MAX_LANES}`);
  }
  for (const lane of lanes) {
    if (!/^(US|CA|MX)[A-Z]{3}$/.test(String(lane.pol || '')) || !lane.name || !lane.rampMC) {
      throw new Error('contains an invalid calculator lane');
    }
  }

  const holRows = XLSX.utils.sheet_to_json(wb.Sheets.HOLIDAYS, { header: 1 });
  const holidays = {};
  for (const row of holRows) {
    const country = row[0];
    const serial = row[2];
    if ((country === 'US' || country === 'CA' || country === 'MX') && typeof serial === 'number') {
      const date = XLSX.SSF.parse_date_code(serial);
      const iso = `${date.y}-${String(date.m).padStart(2, '0')}-${String(date.d).padStart(2, '0')}`;
      (holidays[country] = holidays[country] || []).push(iso);
    }
  }
  Object.keys(holidays).forEach(country => holidays[country].sort());

  const mcRows = XLSX.utils.sheet_to_json(wb.Sheets.PORTMC, { header: 1 });
  const mc = {};
  for (const row of mcRows) {
    const pol = String(row[0] || '').trim();
    const terminal = String(row[2] || '').trim();
    if (!/^(US|CA|MX)[A-Z]{3}$/.test(pol) || !terminal) continue;
    if (!mc[pol]) mc[pol] = new Map();
    if (!mc[pol].has(terminal)) mc[pol].set(terminal, new Set());
    String(row[1] || '').split(',').forEach(service => {
      const trimmed = service.trim();
      if (trimmed) mc[pol].get(terminal).add(trimmed);
    });
  }
  const termOfSSY = (pol, ssy) => {
    const terminals = mc[pol];
    if (terminals) {
      for (const [code, services] of terminals) if (services.has(ssy)) return code;
    }
    return null;
  };
  const portmc = {};
  for (const pol of Object.keys(mc).sort()) {
    const terminals = mc[pol];
    const portLanes = lanes.filter(lane => lane.pol === pol);
    if (!portLanes.length) continue;
    const tokens = new Set();
    portLanes.forEach(lane => String(lane.ssy).split(',').forEach(service => {
      const trimmed = service.trim();
      if (trimmed && trimmed !== 'ALL') tokens.add(trimmed);
    }));
    const mode = [...tokens].every(service => termOfSSY(pol, service) !== null) ? 'terminal' : 'ssy';
    portmc[pol] = {
      mode,
      terminals: [...terminals].map(([code, services]) => ({ code, ssys: [...services] })),
    };
  }

  const serviceRows = XLSX.utils.sheet_to_json(wb.Sheets.PORTSERVICES, { header: 1 });
  const portServices = {};
  for (const row of serviceRows) {
    const pol = String(row[0] || '').trim();
    if (!/^(US|CA|MX)[A-Z]{3}$/.test(pol)) continue;
    if (!portServices[pol]) portServices[pol] = [];
    String(row[1] || '').split(',').forEach(value => {
      const service = value.trim();
      if (service && !portServices[pol].includes(service)) portServices[pol].push(service);
    });
  }

  return { lanes, holidays, portmc, portServices };
}

// 1) Export the Excel DATABASE sheet -> frontend/src/data/lanes.json
// Two master sources: EXCEL_PATH (the OneDrive-synced SharePoint copy — kept
// fresh automatically while the owner is signed in) and EXCEL_PATH_FALLBACK
// (the Z: network share the manual Managers Hub publish deposits to). The
// SharePoint copy is always tried first. Z: is used only when the primary copy
// is missing, still syncing, unreadable, or fails workbook/data validation.
const candidates = [
  { kind: 'primary', path: process.env.EXCEL_PATH },
  { kind: 'fallback', path: process.env.EXCEL_PATH_FALLBACK },
].filter(candidate => candidate.path);

let selected;
let masterData;
const candidateErrors = [];
for (const candidate of candidates) {
  try {
    const loaded = readStableWorkbook(candidate);
    const data = buildMasterData(loaded.wb);
    selected = loaded;
    masterData = data;
    break;
  } catch (error) {
    const message = `${candidate.kind} master rejected (${candidate.path}): ${error.message}`;
    candidateErrors.push(message);
    console.warn(`  WARNING: ${message}`);
  }
}
if (!selected || !masterData) {
  console.error(`ERROR: no valid master workbook. ${candidateErrors.join(' | ')}`);
  process.exit(1);
}

fs.mkdirSync(DATA_DIR, { recursive: true });
writeJson('lanes.json', masterData.lanes);
writeJson('holidays.json', masterData.holidays);
writeJson('portmc.json', masterData.portmc);
writeJson('port-services.json', masterData.portServices);

const sourceStatus = {
  schema: 1,
  kind: selected.kind,
  sourceHash: crypto.createHash('sha256').update(selected.buffer).digest('hex').toUpperCase(),
  fileSize: selected.stat.size,
  modifiedAt: selected.stat.mtime.toISOString(),
  selectedAt: new Date().toISOString(),
  laneCount: masterData.lanes.length,
};
fs.writeFileSync(SOURCE_STATUS_PATH, `${JSON.stringify(sourceStatus, null, 2)}\n`);

console.log(`  Master: ${selected.kind} ${selected.path}`);
console.log(`  Data: validated ${masterData.lanes.length} lanes from ${selected.stat.size} bytes`);
console.log(`  Holidays: ${Object.entries(masterData.holidays).map(([country, dates]) => `${country}=${dates.length}`).join(', ')}`);
console.log(`  PORTMC: ${Object.keys(masterData.portmc).length} ports`);
console.log(`  PORTSERVICES: ${Object.keys(masterData.portServices).length} POL service rules`);

// 2) Convert the current banners (from /public) to WebP and embed as data URIs.
// The 10-minute watcher skips this deterministic image work; RefreshApp.bat
// still performs it when rebuilding the complete offline guide manually.
const publicDir = path.join(ROOT, 'public');

async function toWebpDataUri(file) {
  const buf = await sharp(path.join(publicDir, file)).webp({ quality: 82 }).toBuffer();
  return 'data:image/webp;base64,' + buf.toString('base64');
}

const refreshBanners = async () => {
  const topUri = await toWebpDataUri('truck-highway-sunset.png'); // truck banner on top (unchanged)
  const botUri = await toWebpDataUri('train-bridge.png');         // vessel-bridge banner on bottom
  const botImgUri = await toWebpDataUri('ob-bot.png'); // OB the OPS-BASE BOT (mobile gatekeeper)
  const banners =
    '// Images embedded as WebP data URIs so the app builds into a single self-contained file.\n' +
    '// Auto-generated by backend/refresh-data.js — do not edit by hand.\n' +
    'export const bannerTop = "' + topUri + '";\n' +
    'export const bannerBottom = "' + botUri + '";\n' +
    'export const obBot = "' + botImgUri + '";\n';
  const assetsDir = path.join(ROOT, 'frontend/src/assets');
  fs.mkdirSync(assetsDir, { recursive: true });
  fs.writeFileSync(path.join(assetsDir, 'banners.js'), banners);
  console.log('  Images: converted to WebP + embedded (banners + ob-bot)');
};

if (process.argv.includes('--skip-banners')) {
  console.log('  Images: skipped for scheduled data check');
} else {
  refreshBanners().catch(error => {
    console.error(`ERROR: image refresh failed: ${error.message}`);
    process.exitCode = 1;
  });
}

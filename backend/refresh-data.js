// Regenerates the bundled data snapshot + banner images used by the single-file app.
// Run via RefreshApp.bat (which then rebuilds InlandCutoffGuide.html).
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const sharp = require('sharp');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const ROOT = path.join(__dirname, '..');

// 1) Export the Excel DATABASE sheet -> frontend/src/data/lanes.json
const excelPath = process.env.EXCEL_PATH;
if (!excelPath || !fs.existsSync(excelPath)) {
  console.error('ERROR: Excel not found at EXCEL_PATH:', excelPath);
  process.exit(1);
}

const wb = XLSX.readFile(excelPath);
const rows = XLSX.utils.sheet_to_json(wb.Sheets['DATABASE'], { header: 1 });
const lanes = [];
let inData = false;
for (let i = 0; i < rows.length; i++) {
  if (rows[i][0] === 'STARTDATA') { inData = true; continue; }
  if (rows[i][0] === 'ENDDATA' || !inData) continue;
  if (rows[i][0] && rows[i][0] !== 'POL LOCCODE') {
    lanes.push({
      pol: rows[i][0], ssy: rows[i][1], name: rows[i][2], loccode: rows[i][3],
      rampMC: rows[i][4], rampCutTime: rows[i][5],
      transit: parseFloat(rows[i][6]) || 0, window: parseFloat(rows[i][7]) || 0,
      ssyAdjustment: parseFloat(rows[i][8]) || 0, reefer: rows[i][9],
      windowReefer: parseFloat(rows[i][10]) || 0
    });
  }
}
const dataDir = path.join(ROOT, 'frontend/src/data');
fs.mkdirSync(dataDir, { recursive: true });
fs.writeFileSync(path.join(dataDir, 'lanes.json'), JSON.stringify(lanes, null, 2));
console.log('  Data: wrote ' + lanes.length + ' lanes');

// 1b) Export the HOLIDAYS sheet -> frontend/src/data/holidays.json, grouped by country.
const holRows = XLSX.utils.sheet_to_json(wb.Sheets['HOLIDAYS'], { header: 1 });
const holidays = {};
for (const r of holRows) {
  const country = r[0];
  const serial = r[2];
  if ((country === 'US' || country === 'CA' || country === 'MX') && typeof serial === 'number') {
    const d = XLSX.SSF.parse_date_code(serial);
    const iso = d.y + '-' + String(d.m).padStart(2, '0') + '-' + String(d.d).padStart(2, '0');
    (holidays[country] = holidays[country] || []).push(iso);
  }
}
Object.keys(holidays).forEach(c => holidays[c].sort());
fs.writeFileSync(path.join(dataDir, 'holidays.json'), JSON.stringify(holidays, null, 2));
console.log('  Holidays: wrote ' + Object.entries(holidays).map(([c, a]) => c + '=' + a.length).join(', '));

// 1c) Export the PORTMC sheet -> frontend/src/data/portmc.json.
// PORTMC maps each POL's SSY service codes to its loading terminal (matchcode).
// For ports with 2+ terminals we tag a mode:
//   'terminal' — every non-"ALL" DATABASE SSY token maps to a terminal, so the
//                terminal picker can represent the port cleanly (JAX, NYC, HOU,
//                MXLZC, ORF, SEA, TIW, CAMTR, CAVAN). Whether the terminal also
//                changes the dates is automatic from the lanes.
//   'ssy'      — the port has SSY codes that don't all belong to a terminal
//                (LAX, LGB), so it keeps the SSY picker. (terminal-info.json can
//                override a port to 'terminal' — e.g. LAX.)
const mcRows = XLSX.utils.sheet_to_json(wb.Sheets['PORTMC'], { header: 1 });
const mc = {}; // pol -> Map(terminalCode -> Set(ssys)), preserving first-seen order
for (const r of mcRows) {
  const pol = String(r[0] || '').trim();
  const term = String(r[2] || '').trim();
  if (!/^(US|CA|MX)[A-Z]{3}$/.test(pol) || !term) continue;
  if (!mc[pol]) mc[pol] = new Map();
  if (!mc[pol].has(term)) mc[pol].set(term, new Set());
  String(r[1] || '').split(',').forEach(s => { const t = s.trim(); if (t) mc[pol].get(term).add(t); });
}
const termOfSSY = (pol, ssy) => { const m = mc[pol]; if (m) for (const [code, set] of m) if (set.has(ssy)) return code; return null; };
const portmc = {};
for (const pol of Object.keys(mc).sort()) {
  const m = mc[pol];
  if (m.size < 2) continue;                                   // single terminal → no picker
  const ls = lanes.filter(l => l.pol === pol);
  if (!ls.length) continue;
  // 'terminal' when every non-"ALL" DATABASE token maps to a terminal; else 'ssy'.
  const tokens = new Set();
  ls.forEach(l => String(l.ssy).split(',').forEach(s => { const t = s.trim(); if (t && t !== 'ALL') tokens.add(t); }));
  const mode = [...tokens].every(t => termOfSSY(pol, t) !== null) ? 'terminal' : 'ssy';
  portmc[pol] = { mode, terminals: [...m].map(([code, set]) => ({ code, ssys: [...set] })) };
}
fs.writeFileSync(path.join(dataDir, 'portmc.json'), JSON.stringify(portmc, null, 2) + '\n');
console.log('  PORTMC: wrote ' + Object.keys(portmc).length + ' multi-terminal ports (' +
  Object.entries(portmc).filter(([, v]) => v.mode === 'terminal').map(([p]) => p).join(', ') + ' terminal-mode)');

// 1d) Export the PORTSERVICES sheet -> frontend/src/data/port-services.json.
// This is the workbook's POL-level rule for whether an SSY/terminal choice is
// needed. A sole "ALL" stays automatic; an explicit service list shows the
// picker as soon as the POL is selected (before the inland city is selected).
const serviceRows = XLSX.utils.sheet_to_json(wb.Sheets['PORTSERVICES'], { header: 1 });
const portServices = {};
for (const r of serviceRows) {
  const pol = String(r[0] || '').trim();
  if (!/^(US|CA|MX)[A-Z]{3}$/.test(pol)) continue;
  if (!portServices[pol]) portServices[pol] = [];
  String(r[1] || '').split(',').forEach(s => {
    const service = s.trim();
    if (service && !portServices[pol].includes(service)) portServices[pol].push(service);
  });
}
fs.writeFileSync(path.join(dataDir, 'port-services.json'), JSON.stringify(portServices, null, 2) + '\n');
console.log('  PORTSERVICES: wrote ' + Object.keys(portServices).length + ' POL service rules');

// 2) Convert the current banners (from /public) to WebP and embed as data URIs.
const publicDir = path.join(ROOT, 'public');

async function toWebpDataUri(file) {
  const buf = await sharp(path.join(publicDir, file)).webp({ quality: 82 }).toBuffer();
  return 'data:image/webp;base64,' + buf.toString('base64');
}

(async () => {
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
})();

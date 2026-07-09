const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const os = require('os');
const XLSX = require('xlsx');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend/dist')));

let dbCache = {
  lastLoaded: null,
  data: null
};

const EXCEL_FILE_PATH = process.env.EXCEL_PATH;
const CACHE_REFRESH_INTERVAL = 5 * 60 * 1000;

function loadExcelData() {
  try {
    if (!fs.existsSync(EXCEL_FILE_PATH)) {
      console.error('Excel file not found at:', EXCEL_FILE_PATH);
      return false;
    }

    const workbook = XLSX.readFile(EXCEL_FILE_PATH);
    const dbSheet = workbook.Sheets['DATABASE'];
    const dbData = XLSX.utils.sheet_to_json(dbSheet, { header: 1 });
    
    dbCache.data = parseDatabase(dbData);
    dbCache.lastLoaded = new Date();
    
    console.log('✓ Excel loaded:', dbCache.data.length, 'lanes');
    return true;
  } catch (error) {
    console.error('Error loading Excel:', error.message);
    return false;
  }
}

function parseDatabase(rows) {
  const lanes = [];
  let inData = false;

  for (let i = 0; i < rows.length; i++) {
    if (rows[i][0] === 'STARTDATA') {
      inData = true;
      continue;
    }
    if (rows[i][0] === 'ENDDATA' || !inData) continue;

    if (rows[i][0]) {
      lanes.push({
        pol: rows[i][0],
        ssy: rows[i][1],
        name: rows[i][2],
        loccode: rows[i][3],
        rampMC: rows[i][4],
        rampCutTime: rows[i][5],
        transit: parseFloat(rows[i][6]) || 0,
        window: parseFloat(rows[i][7]) || 0,
        ssyAdjustment: parseFloat(rows[i][8]) || 0,
        reefer: rows[i][9],
        windowReefer: parseFloat(rows[i][10]) || 0
      });
    }
  }

  return lanes;
}

// Map ramp MC code prefixes to the railroad that operates them.
// Unmatched codes fall back to the raw code (see railroadFromCode).
const RAILROAD_PREFIXES = [
  { prefix: 'UNIONP', name: 'Union Pacific' },
  { prefix: 'YUSENT', name: 'Union Pacific' },
  { prefix: 'NORFOL', name: 'Norfolk Southern' },
  { prefix: 'SYNCRE', name: 'Norfolk Southern' },
  { prefix: 'CPR', name: 'CP Rail' },
  { prefix: 'CANADI', name: 'CP Rail' },
  { prefix: 'IOWAIN', name: 'CP Rail' },
  { prefix: 'SOOLIN', name: 'CP Rail' },
  { prefix: 'CNR', name: 'CN Rail' },
  { prefix: 'CSX', name: 'CSX' },
  { prefix: 'APPREG', name: 'CSX' },
  { prefix: 'BURLIN', name: 'Burlington Northern' }
];

function railroadFromCode(code) {
  if (!code) return null;
  const upper = String(code).trim().toUpperCase();
  const match = RAILROAD_PREFIXES.find(r => upper.startsWith(r.prefix));
  return match ? match.name : null;
}

function formatCutTime(value) {
  if (value === null || value === undefined || value === '') return value;

  // Excel time-only cells come through as a fraction of a 24h day (0.5 = noon).
  // Convert those to a readable clock time; pass through already-formatted strings.
  let fractionOfDay = null;

  if (typeof value === 'number') {
    fractionOfDay = value % 1;
  } else if (value instanceof Date) {
    fractionOfDay = (value.getHours() * 60 + value.getMinutes()) / (24 * 60);
  } else {
    return value; // already a string like "16:00" or "4:00 PM"
  }

  const totalMinutes = Math.round(fractionOfDay * 24 * 60);
  let hours = Math.floor(totalMinutes / 60) % 24;
  const minutes = totalMinutes % 60;
  const period = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;

  return `${hours}:${String(minutes).padStart(2, '0')} ${period}`;
}

// A lane's ssy cell may be "ALL" or a comma-list of codes (e.g. "PS5,WC1,FTP").
// Match when the lane covers ALL services or its list contains the chosen code.
function laneCoversSSY(laneSSY, ssy) {
  const val = String(laneSSY).trim();
  if (val === 'ALL') return true;
  return val.split(',').map(s => s.trim()).includes(ssy);
}

function calculateERDLRD(pol, startCity, ssy, portCutDate, reefer = 'N') {
  const lanes = dbCache.data.filter(l =>
    l.pol === pol &&
    l.name === startCity &&
    laneCoversSSY(l.ssy, ssy)
  );

  if (lanes.length === 0) {
    return { error: 'Lane not found' };
  }

  const lane = lanes[0];
  let transit = lane.transit + lane.ssyAdjustment;
  let reeferAdj = 0;
  
  if (reefer === 'Y' && lane.reefer !== 'N') {
    reeferAdj = lane.windowReefer;
  }

  const [py, pm, pd] = String(portCutDate).split('-').map(Number);
  let portCut = new Date(py, pm - 1, pd);
  
  let lrd = new Date(portCut);
  lrd.setDate(lrd.getDate() - transit);
  
  if (lrd.getDay() === 6) lrd.setDate(lrd.getDate() - 1);
  else if (lrd.getDay() === 0) lrd.setDate(lrd.getDate() - 2);

  let erd = new Date(lrd);
  erd.setDate(erd.getDate() - lane.window - reeferAdj);
  
  if (erd.getDay() === 6) erd.setDate(erd.getDate() - 1);
  else if (erd.getDay() === 0) erd.setDate(erd.getDate() - 2);

  return {
    erd: erd.toLocaleDateString('en-US', { weekday: 'short', month: '2-digit', day: '2-digit' }),
    lrd: lrd.toLocaleDateString('en-US', { weekday: 'short', month: '2-digit', day: '2-digit' }),
    rampCutTime: formatCutTime(lane.rampCutTime),
    rampMC: lane.rampMC,
    railroad: railroadFromCode(lane.rampMC)
  };
}

app.post('/api/lookup', (req, res) => {
  const { pol, startCity, ssy, portCutDate, reefer } = req.body;

  if (!pol || !startCity || !ssy || !portCutDate) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const result = calculateERDLRD(pol, startCity, ssy, portCutDate, reefer || 'N');
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/ports', (req, res) => {
  const ports = [...new Set(dbCache.data.map(l => l.pol))].sort();
  res.json(ports);
});

app.get('/api/cities/:pol', (req, res) => {
  const cities = [...new Set(dbCache.data.filter(l => l.pol === req.params.pol).map(l => l.name))].sort();
  res.json(cities);
});

app.get('/api/ssy/:pol', (req, res) => {
  const city = req.query.city;
  const tokens = new Set();
  dbCache.data
    .filter(l => l.pol === req.params.pol && (!city || l.name === city))
    .forEach(l => {
      // Split comma-listed codes so each SSY shows once, deduped across lanes.
      String(l.ssy).split(',').forEach(s => {
        const t = s.trim();
        if (t) tokens.add(t);
      });
    });
  res.json([...tokens].sort());
});

app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok',
    lanes: dbCache.data.length,
    lastLoad: dbCache.lastLoaded
  });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/dist/index.html'));
});

function start() {
  console.log('');
  console.log('🚀 Inland Cutoff Guide - Backend Starting');
  console.log('📁 Excel Path:', EXCEL_FILE_PATH);
  console.log('');
  
  if (!loadExcelData()) {
    console.error('❌ Failed to load Excel file');
    process.exit(1);
  }

  setInterval(loadExcelData, CACHE_REFRESH_INTERVAL);

  app.listen(PORT, '0.0.0.0', () => {
    const nets = os.networkInterfaces();
    let lan = null;
    for (const name of Object.keys(nets)) {
      for (const net of nets[name] || []) {
        if (net.family === 'IPv4' && !net.internal) { lan = net.address; break; }
      }
      if (lan) break;
    }
    console.log('✓ Server running');
    console.log('  Local:   http://localhost:' + PORT);
    if (lan) console.log('  Network: http://' + lan + ':' + PORT + '   <-- share this link with others');
    console.log('');
  });
}

start();

module.exports = app;
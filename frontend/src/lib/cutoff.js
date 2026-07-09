// Client-side port of the backend calculation logic.
// The data is a committed snapshot exported from the Excel DATABASE sheet.
import rawLanes from '../data/lanes.json';
import holidays from '../data/holidays.json';

// Drop the spreadsheet header row and any blank rows.
const lanes = rawLanes.filter(
  l => l.pol && l.pol !== 'POL LOCCODE' && l.name && l.name !== 'NAME'
);

// Holiday lookup sets by country code (US/CA/MX), matching the Excel HOLIDAYS sheet.
const HOLIDAY_SETS = Object.fromEntries(
  Object.entries(holidays).map(([country, list]) => [country, new Set(list)])
);

function toISO(date) {
  return date.getFullYear() + '-' +
    String(date.getMonth() + 1).padStart(2, '0') + '-' +
    String(date.getDate()).padStart(2, '0');
}

// Roll a date backward until it lands on a business day (skip weekends AND holidays),
// mirroring the Excel behaviour of nudging cutoffs off non-working days.
function rollBackToBusinessDay(date, country) {
  const hols = HOLIDAY_SETS[country] || new Set();
  while (date.getDay() === 6 || date.getDay() === 0 || hols.has(toISO(date))) {
    date.setDate(date.getDate() - 1);
  }
  return date;
}

// Map ramp MC code prefixes to the railroad that operates them.
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

export function railroadFromCode(code) {
  if (!code) return null;
  const upper = String(code).trim().toUpperCase();
  const match = RAILROAD_PREFIXES.find(r => upper.startsWith(r.prefix));
  return match ? match.name : null;
}

export function formatCutTime(value) {
  if (value === null || value === undefined || value === '') return value;

  // Excel time-only cells come through as a fraction of a 24h day (0.5 = noon).
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

// Parse a "YYYY-MM-DD" string as a LOCAL date (not UTC), so the day never shifts
// backward in western timezones. `new Date("2026-07-20")` would be UTC midnight.
function parseLocalDate(str) {
  const [y, m, d] = String(str).split('-').map(Number);
  return new Date(y, m - 1, d);
}

// A lane's ssy cell may be "ALL" or a comma-list of codes (e.g. "PS5,WC1,FTP").
function laneCoversSSY(laneSSY, ssy) {
  const val = String(laneSSY).trim();
  if (val === 'ALL') return true;
  return val.split(',').map(s => s.trim()).includes(ssy);
}

export function getPorts() {
  const all = [...new Set(lanes.map(l => l.pol))].sort();
  const us = all.filter(p => p.startsWith('US'));
  const ca = all.filter(p => p.startsWith('CA'));
  const mx = all.filter(p => p.startsWith('MX'));
  const other = all.filter(p => !/^(US|CA|MX)/.test(p));

  // US ports A–Z, with the Mexico port(s) inserted right above USNYC.
  const ordered = [];
  for (const p of us) {
    if (p === 'USNYC') ordered.push(...mx);
    ordered.push(p);
  }
  if (!us.includes('USNYC')) ordered.push(...mx); // safety if USNYC ever missing

  // Canada ports go at the very bottom.
  return [...ordered, ...other, ...ca];
}

export function getCities(pol) {
  return [...new Set(lanes.filter(l => l.pol === pol).map(l => l.name))].sort();
}

export function getSSY(pol, city) {
  const tokens = new Set();
  lanes
    .filter(l => l.pol === pol && (!city || l.name === city))
    .forEach(l => {
      String(l.ssy).split(',').forEach(s => {
        const t = s.trim();
        if (t) tokens.add(t);
      });
    });
  return [...tokens].sort();
}

export function calculateERDLRD(pol, startCity, ssy, portCutDate, reefer = 'N') {
  const matched = lanes.filter(l =>
    l.pol === pol &&
    l.name === startCity &&
    laneCoversSSY(l.ssy, ssy)
  );

  if (matched.length === 0) {
    return { error: 'Lane not found' };
  }

  const lane = matched[0];
  let transit = lane.transit + lane.ssyAdjustment;
  let reeferAdj = 0;
  if (reefer === 'Y' && lane.reefer !== 'N') {
    reeferAdj = lane.windowReefer;
  }

  const country = String(pol).slice(0, 2); // US / CA / MX -> which holiday calendar
  const portCut = parseLocalDate(portCutDate);

  const lrd = new Date(portCut);
  lrd.setDate(lrd.getDate() - transit);
  rollBackToBusinessDay(lrd, country);

  const erd = new Date(lrd);
  erd.setDate(erd.getDate() - lane.window - reeferAdj);
  rollBackToBusinessDay(erd, country);

  return {
    erd: erd.toLocaleDateString('en-US', { weekday: 'short', month: '2-digit', day: '2-digit' }),
    lrd: lrd.toLocaleDateString('en-US', { weekday: 'short', month: '2-digit', day: '2-digit' }),
    rampCutTime: formatCutTime(lane.rampCutTime),
    rampMC: lane.rampMC,
    railroad: railroadFromCode(lane.rampMC)
  };
}

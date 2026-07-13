// Client-side port of the backend calculation logic.
// The data is a committed snapshot exported from the Excel DATABASE sheet.
import rawLanes from '../data/lanes.json';
import holidays from '../data/holidays.json';
import terminals from '../data/terminals.json';

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
  { prefix: 'CPR', name: 'CP Rail (CPKC)' },
  { prefix: 'CANADI', name: 'CP Rail (CPKC)' },
  { prefix: 'IOWAIN', name: 'CP Rail (CPKC)' },
  { prefix: 'SOOLIN', name: 'CP Rail (CPKC)' },
  { prefix: 'CNR', name: 'CN Rail' },
  { prefix: 'CSX', name: 'CSX' },
  { prefix: 'APPREG', name: 'CSX' },
  { prefix: 'SCIPDI', name: 'CSX' },
  { prefix: 'BURLIN', name: 'Burlington Northern' },
  // Reuse existing canonical names so a railroad displays consistently across lanes.
  { prefix: 'DUNCAN', name: 'Union Pacific' },
  { prefix: 'SAVSER', name: 'Union Pacific' },
  { prefix: 'SOUTHC', name: 'Norfolk Southern' },
  { prefix: 'VIRGIN', name: 'Norfolk Southern' },
  { prefix: 'BLUER', name: 'CSX' }, // Gainesville, GA yard — CSX-operated
  { prefix: 'KANSAS', name: 'CP Rail (CPKC)' },
  { prefix: 'OUACHI', name: 'CP Rail (CPKC)' },
  { prefix: 'GEORGI', name: 'Savannah Port Terminal Railroad' },
  { prefix: 'FLORID', name: 'Florida East Coast Railway' },
  { prefix: 'MOBILE', name: 'Terminal Railway Alabama' }
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

// Ports grouped by country for a dropdown with divider headings:
// Canada first, United States in the middle, Mexico at the bottom.
export function getPortGroups() {
  const all = [...new Set(lanes.map(l => l.pol))].sort();
  const us = all.filter(p => p.startsWith('US'));
  const ca = all.filter(p => p.startsWith('CA'));
  const mx = all.filter(p => p.startsWith('MX'));
  const other = all.filter(p => !/^(US|CA|MX)/.test(p));

  const groups = [];
  if (us.length) groups.push({ label: 'United States', ports: us });
  if (ca.length) groups.push({ label: 'Canada', ports: ca });
  if (mx.length) groups.push({ label: 'Mexico', ports: mx });
  if (other.length) groups.push({ label: 'Other', ports: other });
  return groups;
}

export function getCities(pol) {
  return [...new Set(lanes.filter(l => l.pol === pol).map(l => l.name))].sort();
}

// Display-only loccode lookup. Pulls the loccode already present in the data
// (we do NOT modify the underlying database). Overrides pin the code for a few
// cities that appear with more than one loccode across lanes.
const LOCCODE_OVERRIDES = {
  'SAINT LOUIS, MO': 'USSTL',
  'SASKATOON, SK': 'CASAK',
};

export function getLoccode(name) {
  if (LOCCODE_OVERRIDES[name]) return LOCCODE_OVERRIDES[name];
  const row = lanes.find(l => l.name === name && l.loccode);
  return row ? String(row.loccode).trim() : '';
}

// "DETROIT, MI - USDET" for the picker and the copied result (falls back to the
// bare city name if no loccode is on file).
export function cityLabel(name) {
  const code = getLoccode(name);
  return code ? `${name} - ${code}` : name;
}

// "railroad / terminal" label per ramp, sourced from data/terminals.json (keyed
// by rampMC code; a couple of shared codes are disambiguated by city). This is the
// exact string dropped at the top of the copied notes. Falls back to the city.
const normCode = (c) => String(c || '').trim().replace(/\s+/g, ' ');
const TERMINAL_BY_RAMP = new Map();
const TERMINAL_BY_RAMP_CITY = new Map();
for (const t of terminals) {
  const key = normCode(t.rampMC);
  TERMINAL_BY_RAMP.set(key, t.label);
  TERMINAL_BY_RAMP_CITY.set(key + '|' + String(t.city).trim().toUpperCase(), t.label);
}

export function getRailTerminal(rampMC, city) {
  const key = normCode(rampMC);
  const byCity = TERMINAL_BY_RAMP_CITY.get(key + '|' + String(city || '').trim().toUpperCase());
  return byCity || TERMINAL_BY_RAMP.get(key) || city || '';
}

// Just the railroad abbreviation (e.g. "NS", "UP", "CPKC") — the part before the
// " / " in the terminal label. Falls back to the prefix-based railroad name.
export function getRail(rampMC, city) {
  const label = getRailTerminal(rampMC, city);
  const i = label.indexOf(' / ');
  return i >= 0 ? label.slice(0, i).trim() : (railroadFromCode(rampMC) || label);
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

// A few inland ramps need extra transit days added by the user (a 3–7 day picker).
const EXTRA_DAY_CITIES = ['COUNCIL BLUFFS', 'MINNEAPOLIS'];
export function cityNeedsExtraDays(name) {
  const n = String(name || '').toUpperCase();
  return EXTRA_DAY_CITIES.some(c => n.includes(c));
}
// Per-city default for the extra-days picker (Minneapolis 3, Council Bluffs 5).
export function defaultExtraDays(name) {
  const n = String(name || '').toUpperCase();
  if (n.includes('MINNEAPOLIS')) return '3';
  return '5';
}

export function calculateERDLRD(pol, startCity, ssy, portCutDate, reefer = 'N', extraDays = 0) {
  const matched = lanes.filter(l =>
    l.pol === pol &&
    l.name === startCity &&
    laneCoversSSY(l.ssy, ssy)
  );

  if (matched.length === 0) {
    return { error: 'Lane not found' };
  }

  const lane = matched[0];
  let transit = lane.transit + lane.ssyAdjustment + (Number(extraDays) || 0);
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
    erd: erd.toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric' }),
    lrd: lrd.toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric' }),
    rampCutTime: formatCutTime(lane.rampCutTime),
    rampMC: lane.rampMC,
    railroad: railroadFromCode(lane.rampMC)
  };
}

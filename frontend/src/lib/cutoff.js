// Client-side port of the backend calculation logic.
// The data is a committed snapshot exported from the Excel DATABASE sheet.
import rawLanes from '../data/lanes.json';

// Drop the spreadsheet header row and any blank rows.
const lanes = rawLanes.filter(
  l => l.pol && l.pol !== 'POL LOCCODE' && l.name && l.name !== 'NAME'
);

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

// A lane's ssy cell may be "ALL" or a comma-list of codes (e.g. "PS5,WC1,FTP").
function laneCoversSSY(laneSSY, ssy) {
  const val = String(laneSSY).trim();
  if (val === 'ALL') return true;
  return val.split(',').map(s => s.trim()).includes(ssy);
}

export function getPorts() {
  return [...new Set(lanes.map(l => l.pol))].sort();
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

  const portCut = new Date(portCutDate);

  const lrd = new Date(portCut);
  lrd.setDate(lrd.getDate() - transit);
  if (lrd.getDay() === 6) lrd.setDate(lrd.getDate() - 1);
  else if (lrd.getDay() === 0) lrd.setDate(lrd.getDate() - 2);

  const erd = new Date(lrd);
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

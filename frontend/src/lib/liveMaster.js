import * as XLSX from 'xlsx';
import { formatCutTime, railroadFromCode } from './cutoff';

const LIVE_MASTER_URL = 'http://127.0.0.1:47833/live-master';

function isoFromExcel(serial) {
  if (typeof serial !== 'number') return '';
  const date = XLSX.SSF.parse_date_code(serial);
  return date ? `${date.y}-${String(date.m).padStart(2, '0')}-${String(date.d).padStart(2, '0')}` : '';
}

function readLiveData(workbook) {
  for (const name of ['DATABASE', 'HOLIDAYS', 'PORTSERVICES']) {
    if (!workbook.Sheets[name]) throw new Error(`The live workbook is missing its ${name} sheet.`);
  }

  const rows = XLSX.utils.sheet_to_json(workbook.Sheets.DATABASE, { header: 1, raw: true });
  const lanes = [];
  let inData = false;
  for (const row of rows) {
    if (row[0] === 'STARTDATA') { inData = true; continue; }
    if (row[0] === 'ENDDATA') break;
    if (!inData || !row[0] || row[0] === 'POL LOCCODE') continue;
    lanes.push({
      pol: String(row[0]).trim(), ssy: String(row[1] || '').trim(), name: String(row[2] || '').trim(),
      loccode: String(row[3] || '').trim(), rampMC: String(row[4] || '').trim(), rampCutTime: row[5],
      transit: Number(row[6]) || 0, window: Number(row[7]) || 0, ssyAdjustment: Number(row[8]) || 0,
      reefer: String(row[9] || '').trim(), windowReefer: Number(row[10]) || 0,
    });
  }
  if (lanes.length < 100) throw new Error('The live workbook did not contain a complete lane table.');

  const holidays = {};
  for (const row of XLSX.utils.sheet_to_json(workbook.Sheets.HOLIDAYS, { header: 1, raw: true })) {
    const country = String(row[0] || '').trim();
    const iso = isoFromExcel(row[2]);
    if (['US', 'CA', 'MX'].includes(country) && iso) (holidays[country] ||= []).push(iso);
  }

  const portServices = {};
  for (const row of XLSX.utils.sheet_to_json(workbook.Sheets.PORTSERVICES, { header: 1, raw: true })) {
    const pol = String(row[0] || '').trim();
    if (!/^(US|CA|MX)[A-Z]{3}$/.test(pol)) continue;
    portServices[pol] ||= [];
    String(row[1] || '').split(',').map(value => value.trim()).filter(Boolean).forEach(service => {
      if (!portServices[pol].includes(service)) portServices[pol].push(service);
    });
  }
  return { lanes, holidays, portServices };
}

function toISO(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function parseLocalDate(value) {
  const [year, month, day] = String(value).split('-').map(Number);
  return new Date(year, month - 1, day);
}

function laneCoversSSY(laneValue, wanted) {
  const tokens = String(laneValue || '').split(',').map(value => value.trim().toUpperCase());
  return tokens.includes('ALL') || tokens.includes(String(wanted || '').trim().toUpperCase());
}

function rollBack(date, holidaySet) {
  while (date.getDay() === 0 || date.getDay() === 6 || holidaySet.has(toISO(date))) date.setDate(date.getDate() - 1);
}

export async function loadLiveMaster() {
  const response = await fetch(`${LIVE_MASTER_URL}?t=${Date.now()}`, { cache: 'no-store' });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || 'The live Z: master workbook could not be read.');
  }
  const workbook = XLSX.read(await response.arrayBuffer(), { type: 'array' });
  return {
    ...readLiveData(workbook),
    source: response.headers.get('X-ERD-Source') || 'Z: live master',
    modified: response.headers.get('X-ERD-Modified') || '',
  };
}

export function calculateFromLiveMaster(live, bridgeData, cutoffDate) {
  const pol = String(bridgeData.polLocode || '').trim().toUpperCase();
  const wantedName = String(bridgeData.startCity || '').trim().toUpperCase();
  const wantedCode = String(bridgeData.startLocode || '').trim().toUpperCase();
  const cityLanes = live.lanes.filter(lane => lane.pol === pol &&
    (lane.name.toUpperCase() === wantedName || lane.loccode.toUpperCase() === wantedCode));
  if (!cityLanes.length) throw new Error(`The live master has no ${bridgeData.startCity || wantedCode} → ${pol} lane.`);

  const services = live.portServices[pol] || [];
  const service = services.length === 1 && services[0] === 'ALL' ? 'ALL' : bridgeData.motService;
  const lane = cityLanes.find(item => laneCoversSSY(item.ssy, service));
  if (!lane) throw new Error(`The live master has no ${cityLanes[0].name} → ${pol} (${service || 'no SSY'}) lane.`);

  const country = pol.slice(0, 2);
  const holidaySet = new Set(live.holidays[country] || []);
  const lrd = parseLocalDate(cutoffDate);
  lrd.setDate(lrd.getDate() - lane.transit - lane.ssyAdjustment);
  rollBack(lrd, holidaySet);
  const erd = new Date(lrd);
  erd.setDate(erd.getDate() - lane.window);
  rollBack(erd, holidaySet);

  return {
    startCity: lane.name,
    result: {
      erd: erd.toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric' }),
      lrd: lrd.toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric' }),
      rampCutTime: formatCutTime(lane.rampCutTime), rampMC: lane.rampMC, railroad: railroadFromCode(lane.rampMC),
    },
  };
}

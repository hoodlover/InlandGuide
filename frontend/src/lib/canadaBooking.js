import { formatDate, generatedAt, getCities, getCutoff, getCutTime, getERD, getPortInfo, getVessels, getVesselMeta } from './cpkc';

export const CANADA_RAIL_LINKS = {
  'CP Rail': 'https://www.cpkcr.com/en/customer-resources/shipping-guides-resources#id-AAAB963170242246EEC2726E8F39E78F:~:text=Port%20schedules',
  'CN Rail': 'https://www.cn.ca/en/customer-centre/prices-tariffs-transit-times/terminal-to-port-service-grid',
};

function norm(value) {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function cityKey(value) {
  return norm(String(value || '').replace(/,\s*[A-Z]{2}\s*$/, '').replace(/\s*\(.*?\)\s*$/, ''));
}

function scheduleSlug(data) {
  const pol = norm(data.polLocode);
  const rail = data.canadianRail;
  const terminal = norm(data.departureTerminal);
  if (pol === 'CAVAN') return rail === 'CN Rail' ? 'centerm' : 'metro-vancouver';
  if (pol === 'CAPRR' && rail === 'CN Rail') return 'prince-rupert';
  if (pol === 'CASJB' && rail === 'CP Rail') return 'saint-john';
  if (pol === 'CAMTR' && rail === 'CP Rail') return 'montreal';
  if (pol === 'CAMTR' && rail === 'CN Rail') {
    if (terminal.includes('CAST')) return 'montreal-cast';
    if (terminal.includes('VIAU')) return 'montreal-viau';
    if (terminal.includes('RACINE')) return 'montreal-racine';
  }
  return '';
}

export function calculateCanadaBooking(data) {
  const slug = scheduleSlug(data);
  const railLink = CANADA_RAIL_LINKS[data.canadianRail] || '';
  if (!slug) throw new Error(`This ${data.canadianRail || 'Canadian rail'} terminal is not mapped to a stored schedule yet.`);
  const info = getPortInfo(slug);
  const wantedVessel = norm(data.vessel);
  const vessel = getVessels(slug).find(name => {
    const candidate = norm(name);
    return candidate === wantedVessel || candidate.startsWith(wantedVessel) || wantedVessel.startsWith(candidate);
  });
  if (!vessel) throw new Error(`${data.vessel || 'This vessel'} is not listed in the latest ${info?.name || slug} schedule. Open the ${data.canadianRail} link to verify it.`);
  const wantedCity = cityKey(data.startCity);
  const city = getCities(slug).find(name => cityKey(name) === wantedCity);
  if (!city) throw new Error(`${data.startCity || 'This starting city'} is not listed in the latest ${info?.name || slug} schedule.`);
  const cutoff = getCutoff(slug, vessel, city);
  if (!cutoff) throw new Error(`${vessel} has no published ${city} cutoff in the latest ${info?.name || slug} schedule.`);
  const meta = getVesselMeta(slug, vessel);
  const ref = info?.generatedAt || generatedAt;
  return {
    result: {
      erd: getERD(slug, vessel, city),
      lrd: formatDate(cutoff, ref),
      rampCutTime: getCutTime(slug, city),
      returnTerminal: city,
      equipmentType: data.equipmentType || '',
      isReefer: Boolean(data.isReefer),
      canadianRail: data.canadianRail,
      railPortCutoff: formatDate(meta?.railPortCutoff || '', ref),
      scheduleName: info?.name || slug,
      scheduleRunDate: info?.runDate || '',
      railLink,
    },
    source: `${info?.name || slug} schedule`,
    modified: info?.generatedAt || generatedAt,
  };
}

import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCN, parseCPKC } from './refresh.mjs';

const item = (s, x, y) => ({ s, x, y });
const cnPage = [
  item('Last updated: 10-26-2026 07:25', 0, 300),
  item('DETROIT', 300, 220), item('MEMPHIS', 500, 220),
  item('Cut-off/Limite', 300, 200), item('ERD/DRPP', 400, 200),
  item('Cut-off/Limite', 500, 200), item('ERD/DRPP', 600, 200),
  item('TSINGTAO EXPRESS', 0, 180), item('06-Nov', 150, 180),
  item('Mon, Oct-26', 300, 180), item('21-Oct', 400, 180),
  item('Mon, Oct-26', 500, 180), item('21-Oct', 600, 180),
  item('1600 hrs', 150, 100), item('1500 hrs', 300, 100),
  item('1600hrs', 500, 100),
];
const cnPort = { slug: 'prince-rupert', name: 'Prince Rupert', rail: 'CN' };

test('CN preserves paired cutoff/ERD columns and cutoff times without a space', () => {
  const port = parseCN([cnPage], cnPort);
  assert.deepEqual(port.cities, ['DETROIT', 'MEMPHIS']);
  assert.deepEqual(port.cutTimes, { DETROIT: '1500 hrs', MEMPHIS: '1600hrs' });
  assert.equal(port.vessels[0].railPortCutoff, '06-Nov');
  assert.equal(port.vessels[0].cutoffs.MEMPHIS, 'Mon, Oct-26');
  assert.equal(port.vessels[0].erds.MEMPHIS, '21-Oct');
});

test('CN merges destinations across pages without duplicating the vessel', () => {
  const second = cnPage.map(i => ({ ...i, s: i.s === 'DETROIT' ? 'CHICAGO' : i.s === 'MEMPHIS' ? 'JOLIET' : i.s }));
  const port = parseCN([cnPage, second], cnPort);
  assert.equal(port.vessels.length, 1);
  assert.deepEqual(Object.keys(port.vessels[0].cutoffs), ['DETROIT', 'MEMPHIS', 'CHICAGO', 'JOLIET']);
});

test('CN reads Montreal clock times and keeps weekend exceptions', () => {
  const page = cnPage.map(i => ({ ...i, s: i.s === '1500 hrs' ? '15:00' : i.s === '1600hrs' ? '1700 hrs (1500 Sat & Sun)' : i.s === '1600 hrs' ? '06:00' : i.s }));
  assert.deepEqual(parseCN([page], cnPort).cutTimes, { DETROIT: '15:00', MEMPHIS: '1700 hrs (1500 Sat & Sun)' });
});

test('CN retains month-first ERDs exactly as published', () => {
  const page = cnPage.map(i => ({ ...i, s: i.s === '21-Oct' ? 'Oct-21' : i.s }));
  assert.equal(parseCN([page], cnPort).vessels[0].erds.MEMPHIS, 'Oct-21');
});

test('CN rejects colliding dates instead of moving them to a neighboring ramp', () => {
  assert.throws(() => parseCN([[...cnPage, item('22-Oct', 601, 180)]], cnPort), /collided/);
});

function cpPage(cutoff) {
  return [
    item('Oct 26 2026 10:27', 0, 300),
    item('Vessel Name', 0, 220), item('Comments', 200, 220),
    item('Detroit', 400, 220), item('Bensenville', 600, 220),
    item('MONTREAL EXPRESS', 0, 180), item(cutoff, 400, 180),
    item('Fri 23-Oct 17:00', 600, 180),
  ];
}
const cpPort = { slug: 'montreal', name: 'Montreal', rail: 'CPKC' };

test('CP accepts Excel datetimes alongside formatted cutoff dates', () => {
  const port = parseCPKC([cpPage('10/23/2026 3:00:00 PM')], cpPort);
  assert.equal(port.vessels[0].cutoffs.Detroit, '10/23/2026 3:00:00 PM');
  assert.equal(port.vessels[0].cutoffs.Bensenville, 'Fri 23-Oct 17:00');
});

test('CP preserves a railroad calendar typo without failing the entire port', () => {
  const port = parseCPKC([cpPage('9/31/2026 12:00:00 PM')], cpPort);
  assert.equal(port.vessels[0].cutoffs.Detroit, '9/31/2026 12:00:00 PM');
});

test('CP rejects non-date text in a cutoff column', () => {
  assert.throws(() => parseCPKC([cpPage('misaligned text')], cpPort), /non-date value/);
});

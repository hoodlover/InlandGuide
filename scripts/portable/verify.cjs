// Exercise the packaged runtime against copies of the master, never the real file.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const http = require('node:http');
const app = path.resolve(process.argv[2]);
const source = path.resolve(process.argv[3]);
const XLSX = require(path.join(app, 'node_modules/xlsx'));
const { readStableWorkbook, buildMasterData } = require(path.join(app, 'master-workbook'));
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'inland-portable-verify-'));
const fixture = path.join(temp, 'OneDrive - Hapag-Lloyd AG', 'Region North America - Inland', 'InlandCutoffGuide.xlsm');
fs.mkdirSync(path.dirname(fixture), { recursive: true });
fs.copyFileSync(source, fixture);
const expected = buildMasterData(readStableWorkbook({ path: fixture }).wb);
const port = 48972;
const base = `http://127.0.0.1:${port}`;
const child = spawn(path.join(app, 'node.exe'), [path.join(app, 'server.cjs')], {
  env: { ...process.env, INLAND_PORTABLE_PORT: String(port), USERPROFILE: temp, OneDriveCommercial: '' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let log = '';
child.stdout.on('data', b => log += b);
child.stderr.on('data', b => log += b);
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function injected() {
  const res = await fetch(base);
  assert.equal(res.status, 200);
  const html = await res.text();
  const payload = JSON.parse(html.match(/window\.__INLAND_PORTABLE__=(.*?);<\/script>/s)[1]);
  return { html, payload };
}
(async () => {
  try {
    let ready = false;
    for (let i = 0; i < 50; i++) {
      try { ready = (await (await fetch(`${base}/health`)).json()).app === 'inland-guide-portable'; } catch {}
      if (ready) break;
      await delay(100);
    }
    assert.ok(ready, log);
    const first = await injected();
    assert.deepEqual(first.payload.data, expected);
    assert.ok(first.html.indexOf('window.__INLAND_PORTABLE__=') < first.html.indexOf('<script type="module"'));
    const assets = [...first.html.matchAll(/(?:\.\/|\/)([a-zA-Z0-9_-]+\.(?:png|webp|jpg))/g)].map(m => m[1]);
    for (const asset of new Set(assets)) assert.equal((await fetch(`${base}/${asset}`)).status, 200, asset);
    const wb = XLSX.readFile(fixture);
    const rows = XLSX.utils.sheet_to_json(wb.Sheets.DATABASE, { header: 1 });
    const index = rows.findIndex(row => row[0] === expected.lanes[0].pol && row[2] === expected.lanes[0].name);
    assert.ok(index >= 0);
    const oldTransit = expected.lanes[0].transit;
    const cell = XLSX.utils.encode_cell({ r: index, c: 6 });
    wb.Sheets.DATABASE[cell] = { t: 'n', v: oldTransit + 2 };
    XLSX.writeFile(wb, fixture);
    const changed = await (await fetch(`${base}/portable-status`)).json();
    assert.ok(changed.ok);
    assert.notEqual(changed.sourceHash, first.payload.sourceHash);
    assert.equal((await injected()).payload.data.lanes[0].transit, oldTransit + 2);
    fs.unlinkSync(fixture);
    let res = await fetch(base);
    assert.equal(res.status, 503);
    assert.match(await res.text(), /Sync the Inland Guide master/);
    assert.equal((await (await fetch(`${base}/portable-status`)).json()).ok, false);
    fs.writeFileSync(fixture, 'not a workbook');
    res = await fetch(base);
    assert.equal(res.status, 503);
    assert.match(await res.text(), /did not pass validation/);
    fs.copyFileSync(source, fixture);
    assert.deepEqual((await injected()).payload.data, expected);
    const alternate = path.join(temp, 'Hapag-Lloyd AG', 'Region North America - Documents', 'Inland', 'InlandCutoffGuide.xlsm');
    fs.mkdirSync(path.dirname(alternate), { recursive: true });
    fs.renameSync(fixture, alternate);
    assert.deepEqual((await injected()).payload.data, expected);
    assert.equal((await fetch(`${base}/api/refresh`, { method: 'POST' })).status, 503);
    const foreignHostStatus = await new Promise((resolve, reject) => {
      const request = http.get(`${base}/health`, { headers: { Host: 'other.example' } }, res => { res.resume(); resolve(res.statusCode); });
      request.on('error', reject);
    });
    assert.equal(foreignHostStatus, 403);
    const retired = await (await fetch(`${base}/retired.html`)).text();
    assert.match(retired, /Extract All/);
    assert.match(retired, /Z:\\Rail Tools by Lance\\Inland Guide Lookup Tool/);
    assert.doesNotMatch(retired, /location\.replace/);
    console.log(`PASS: ${expected.lanes.length} master lanes, holidays, port mappings/services, ${new Set(assets).size} image assets, changed master, missing/invalid master, recovery, local-only API, soft-block instructions.`);
  } finally {
    child.kill();
    fs.rmSync(temp, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

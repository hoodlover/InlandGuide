const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const { unzipSync } = require('../frontend/node_modules/fflate');
const { readStableWorkbook, buildMasterData } = require('../backend/master-workbook');
const root = path.resolve(process.argv[2]);
const normalize = archive => Object.fromEntries(Object.entries(archive).map(([name, bytes]) => [name.replace(/\\/g, '/'), bytes]));
const before = normalize(unzipSync(fs.readFileSync(path.join(root, 'original-GOT-ERD-Tool-v1.0.18.zip'))));
const after = normalize(unzipSync(fs.readFileSync(path.join(root, 'ERD Tool', 'GOT-ERD-Tool-v1.0.18.zip'))));
let identical = 0;
for (const [name, bytes] of Object.entries(before)) {
  assert.ok(after[name], `Missing runtime file: ${name}`);
  if (name.endsWith('Launch-Floating-Erd.ps1')) continue;
  assert.deepEqual(Buffer.from(after[name]), Buffer.from(bytes), name);
  identical++;
}
assert.ok(Object.keys(after).some(name => name.endsWith('master-source.json')));
const original = buildMasterData(readStableWorkbook({ path: 'Z:\\InlandCutoffGuide-DontTouch\\InlandCutoffGuideMASTER.xlsm' }).wb);
const copy = buildMasterData(readStableWorkbook({ path: path.join(root, 'ERD Tool', 'master.xlsm') }).wb);
assert.deepEqual(copy, original);
for (const [name, bytes] of Object.entries(after)) {
  // The bundled HTML contains unused old manager help text; runtime paths
  // are supplied by the local launcher/config, not that text.
  if (!/\.(ps1|json|exe|dll)$/.test(name)) continue;
  const buffer = Buffer.from(bytes);
  assert.ok(!buffer.includes(Buffer.from('InlandCutoffGuide-DontTouch')) &&
    !buffer.includes(Buffer.from('InlandCutoffGuide-DontTouch', 'utf16le')), `${name} still depends on old folder`);
}
console.log(`PASS: ${identical} original runtime files identical; launcher/config changed. ${copy.lanes.length} master lanes validated. Runtime master paths no longer use the old folder.`);

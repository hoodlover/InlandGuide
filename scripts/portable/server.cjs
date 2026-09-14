const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const { readStableWorkbook, buildMasterData } = require('./master-workbook');

const SHAREPOINT = 'https://hlag.sharepoint.com/sites/RegionNorthAmerica/Shared%20Documents/Inland';
const PORT = Number(process.env.INLAND_PORTABLE_PORT || 48971);
const home = process.env.USERPROFILE;
let cached;
let lastRequest = Date.now();
function candidates() {
  const roots = new Set([
    path.join(home, 'OneDrive - Hapag-Lloyd AG'),
    path.join(home, 'Hapag-Lloyd AG'),
    process.env.OneDriveCommercial,
  ].filter(Boolean));
  // OneDrive can sync a library either below OneDrive or the organisation folder.
  const found = new Set();
  for (const root of roots) {
    found.add(path.join(root, 'Region North America - Inland', 'InlandCutoffGuide.xlsm'));
    found.add(path.join(root, 'Region North America - Documents', 'Inland', 'InlandCutoffGuide.xlsm'));
    found.add(path.join(root, 'Inland', 'InlandCutoffGuide.xlsm'));
    let entries = [];
    try { entries = fs.readdirSync(root, { withFileTypes: true }); } catch {}
    for (const entry of entries.filter(e => e.isDirectory() && /Region North America/i.test(e.name))) {
      found.add(path.join(root, entry.name, 'InlandCutoffGuide.xlsm'));
      found.add(path.join(root, entry.name, 'Inland', 'InlandCutoffGuide.xlsm'));
    }
  }
  return [...found];
}
function master() {
  const errors = [];
  for (const file of candidates().filter(f => fs.existsSync(f))) {
    try {
      const stat = fs.statSync(file);
      if (cached && cached.file === file && cached.size === stat.size && cached.mtime === stat.mtimeMs) return cached.payload;
      const loaded = readStableWorkbook({ path: file });
      const data = buildMasterData(loaded.wb);
      const payload = {
        data, sourceHash: crypto.createHash('sha256').update(loaded.buffer).digest('hex'),
        modifiedAt: loaded.stat.mtime.toISOString(),
      };
      cached = { file, size: loaded.stat.size, mtime: loaded.stat.mtimeMs, payload };
      return payload;
    } catch (error) { errors.push(error.message); }
  }
  throw new Error(errors.length ? 'The synced master is not ready or did not pass validation. Let OneDrive finish syncing, then try again.' : 'The Inland SharePoint master has not been synced to this computer yet.');
}
const escapeHtml = text => text.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function missingPage(message) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Inland Guide — sync the master</title><style>body{font:18px/1.6 Arial;background:#002d72;color:white;padding:40px}main{max-width:720px;margin:auto}a,button{display:inline-block;background:#ff6600;color:white;padding:12px;border:0;border-radius:6px;font:inherit;text-decoration:none}li{margin:12px 0}</style></head><body><main><h1>Sync the Inland Guide master</h1><p>${escapeHtml(message)}</p><ol><li>Open the Inland SharePoint folder and sign in with your work account.</li><li>Choose <strong>Sync</strong> (it may be under the three-dot menu) and allow Microsoft OneDrive to open.</li><li>Wait for <strong>InlandCutoffGuide.xlsm</strong> to finish syncing. For offline use, right-click it in File Explorer and choose <strong>Always keep on this device</strong>.</li><li>Come back here and click Try again.</li></ol><p><a href="${SHAREPOINT}" target="_blank" rel="noopener">Open Inland on SharePoint</a> <button onclick="location.reload()">Try again</button></p><p>No master file selection is needed. The guide reads the synced workbook without changing it.</p></main></body></html>`;
}
const server = http.createServer((req, res) => {
  lastRequest = Date.now();
  const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
  // Do not expose this local service through a different browser origin.
  if (req.headers.host !== `127.0.0.1:${PORT}` && req.headers.host !== `localhost:${PORT}`) {
    res.writeHead(403, headers); return res.end();
  }
  const route = new URL(req.url, `http://127.0.0.1:${PORT}`).pathname;
  if (route === '/health') {
    res.writeHead(200, { ...headers, 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ app: 'inland-guide-portable', version: 1, directory: __dirname }));
  }
  if (route === '/shutdown' && req.method === 'POST' && req.headers['x-inland-launcher'] === '1') {
    res.writeHead(200, { ...headers, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    server.close(() => process.exit(0));
    return;
  }
  if (route === '/' || route === '/index.html' || route === '/portable-status') {
    try {
      const payload = master();
      if (route === '/portable-status') {
        res.writeHead(200, { ...headers, 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: true, sourceHash: payload.sourceHash, modifiedAt: payload.modifiedAt }));
      }
      const json = JSON.stringify(payload).replace(/</g, '\\u003c');
      const html = fs.readFileSync(path.join(__dirname, 'web', 'index.html'), 'utf8')
        .replace('<head>', `<head><script>window.__INLAND_PORTABLE__=${json};</script>`);
      res.writeHead(200, { ...headers, 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(html);
    } catch (error) {
      res.writeHead(503, { ...headers, 'Content-Type': route === '/portable-status' ? 'application/json' : 'text/html; charset=utf-8' });
      return res.end(route === '/portable-status' ? JSON.stringify({ ok: false, message: error.message }) : missingPage(error.message));
    }
  }
  // Portable use has no manager publishing or usage-tracking server.
  if (route.startsWith('/api/')) {
    res.writeHead(503, { ...headers, 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: false, error: 'This feature needs the online guide. Portable lookups use the synced master.' }));
  }
  const assets = { '/favicon.webp': 'image/webp', '/favicon-32.png': 'image/png', '/favicon-192.png': 'image/png', '/apple-touch-icon.png': 'image/png', '/retired.html': 'text/html; charset=utf-8', '/retirement-logo.png': 'image/png', '/retirement-erd-guide.png': 'image/png' };
  if (/^\/[a-zA-Z0-9_-]+\.(png|webp|jpg|jpeg|svg|ico)$/.test(route)) {
    const mime = { '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
    assets[route] = mime[path.extname(route)];
  }
  if (assets[route]) {
    const file = path.join(__dirname, 'web', route.slice(1));
    if (fs.existsSync(file)) { res.writeHead(200, { ...headers, 'Content-Type': assets[route] }); return res.end(fs.readFileSync(file)); }
  }
  res.writeHead(404, headers); res.end();
});
server.listen(PORT, '127.0.0.1', () => console.log(`Inland Guide portable listening on http://127.0.0.1:${PORT}`));
server.on('error', error => { console.error(error.message); process.exit(1); });
// Browser polls keep an open guide alive; stop once unused for 30 minutes.
setInterval(() => { if (Date.now() - lastRequest > 30 * 60 * 1000) server.close(() => process.exit(0)); }, 60000).unref();

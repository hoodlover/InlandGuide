// Scheduled auto-publish orchestrator (run hourly from 9am through 3pm by
// AutoPublish.bat and Windows Task Scheduler).
//
// Regenerates the calculator data from the master workbook. Only when the
// exported rail data actually changes does it stamp the publish time, rebuild
// the live + offline guides, and push to main so Vercel redeploys. Designed to
// run safely on a machine that is ALSO used for dev:
//   - never resets or discards anything; only commits the generated files
//     (frontend/src/data, version.json, InlandCutoffGuide.html)
//   - if the push is rejected (someone/the CPKC bot pushed first), it rebases
//     with --autostash so any of your uncommitted work is preserved, then
//     retries once. A genuine conflict aborts cleanly and is logged — nothing
//     is forced and no work is lost.

import { execSync } from 'node:child_process';
import { copyFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const frontend = resolve(root, 'frontend');

const run = (cmd, cwd = root) => execSync(cmd, { cwd, stdio: 'inherit' });
const tryRun = (cmd, cwd = root) => {
  try { execSync(cmd, { cwd, stdio: 'inherit' }); return true; }
  catch { return false; }
};
// git diff --cached --quiet exits 0 when nothing is staged.
const nothingStaged = () => tryRun('git diff --cached --quiet');
const log = (m) => console.log(`[auto-publish] ${m}`);
const masterDataPaths = [
  'frontend/src/data/lanes.json',
  'frontend/src/data/holidays.json',
  'frontend/src/data/portmc.json',
  'frontend/src/data/port-services.json',
];
const masterDataUnchanged = () =>
  tryRun(`git diff --quiet -- ${masterDataPaths.join(' ')}`);

try {
  log('sync local main to latest (fast-forward only, non-destructive)');
  run('git fetch origin main');
  tryRun('git merge --ff-only origin/main'); // harmless if it can't ff; we proceed

  log('export calculator data from the master workbook');
  run('node backend/refresh-data.js');
  tryRun('git checkout -- frontend/src/assets/banners.js'); // drop deterministic banner re-encode

  if (masterDataUnchanged()) {
    log('master data unchanged — no timestamp, build, commit, deployment, or user update prompt');
    process.exit(0);
  }

  log('stamp the publish time');
  run('node scripts/auto-publish/stamp-status.mjs');

  log('rebuild live + offline guides');
  run('node gen-version.mjs', frontend);
  run('npm run build', frontend);
  copyFileSync(resolve(frontend, 'dist/index.html'), resolve(root, 'InlandCutoffGuide.html'));

  log('stage generated files');
  run('git add frontend/src/data frontend/src/version.json InlandCutoffGuide.html');
  if (nothingStaged()) { log('nothing to publish — done'); process.exit(0); }

  run('git commit -m "Auto-publish master data (scheduled)"');

  log('push to main');
  if (!tryRun('git push origin main')) {
    log('push rejected — rebasing onto latest (preserving any uncommitted work)');
    if (!tryRun('git pull --rebase --autostash origin main')) {
      tryRun('git rebase --abort');
      throw new Error('Could not integrate remote changes (conflict). Skipped this run; nothing pushed.');
    }
    run('git push origin main');
  }

  log('done — Vercel will deploy shortly');
} catch (err) {
  console.error(`[auto-publish] FAILED: ${err.message}`);
  process.exit(1);
}

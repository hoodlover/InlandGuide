// Writes src/version.json from FULL local git history: "<days>.<hours>.<commits>".
// The automated "cpkc-refresh-bot" commits are excluded so the version reflects
// only real (human) work. Needs full history — Vercel/Actions shallow-clone, so
// the COMMITTED version.json is what ships (regenerate this locally / in the
// refresh workflow, which checks out with fetch-depth: 0).
import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const BOTS = new Set(['cpkc-refresh-bot', 'master-db-bot']);

function version() {
  // author \x1f unix-ts \x1f short-date, one line per commit.
  const rows = execSync('git log --date=short --format=%an%x1f%at%x1f%ad', { encoding: 'utf8' })
    .trim().split('\n').filter(Boolean)
    .map(l => l.split('\x1f'))
    .filter(([author]) => !BOTS.has(author));

  const commits = rows.length;
  const days = new Set(rows.map(r => r[2])).size;
  const ts = rows.map(r => Number(r[1])).filter(Boolean).sort((a, b) => a - b);

  const GAP = 2 * 3600, FIRST = 2 * 3600;
  let secs = 0;
  for (let i = 0; i < ts.length; i++) {
    if (i === 0) { secs += FIRST; continue; }
    const g = ts[i] - ts[i - 1];
    secs += g < GAP ? g : FIRST;
  }
  return `${days}.${Math.round(secs / 3600)}.${commits}`;
}

writeFileSync(new URL('./src/version.json', import.meta.url), JSON.stringify({ version: version() }) + '\n');
console.log('version.json →', version());

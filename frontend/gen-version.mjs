// Writes src/version.json from FULL local git history: "<days>.<hours>.<commits>".
// Run this locally before building/committing — do NOT wire it into `npm run build`,
// because Vercel does a shallow clone (only ~10 commits) and would produce wrong
// numbers. The committed version.json is what ships, so the web + offline match.
import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

function version() {
  const commits = execSync('git rev-list --count HEAD', { encoding: 'utf8' }).trim();
  const dates = execSync('git log --date=short --format=%ad', { encoding: 'utf8' }).trim().split('\n').filter(Boolean);
  const days = new Set(dates).size;
  const ts = execSync('git log --format=%at', { encoding: 'utf8' }).trim().split('\n').map(Number).filter(Boolean).sort((a, b) => a - b);
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

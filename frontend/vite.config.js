import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'
import { execSync } from 'node:child_process'

// Version tells the story: "<days touched>.<est hours>.<commits>". Days = distinct
// commit dates; est hours = session estimate (consecutive commits <2h apart count
// as continuous work, +2h to open each session); commits = total. Build-time only.
function versionString() {
  try {
    const commits = execSync('git rev-list --count HEAD', { encoding: 'utf8' }).trim();
    const dates = execSync('git log --date=short --format=%ad', { encoding: 'utf8' }).trim().split('\n').filter(Boolean);
    const daysTouched = new Set(dates).size;
    const ts = execSync('git log --format=%at', { encoding: 'utf8' }).trim().split('\n').map(Number).filter(Boolean).sort((a, b) => a - b);
    const GAP = 2 * 3600, FIRST = 2 * 3600;
    let secs = 0;
    for (let i = 0; i < ts.length; i++) {
      if (i === 0) { secs += FIRST; continue; }
      const g = ts[i] - ts[i - 1];
      secs += g < GAP ? g : FIRST;
    }
    return `${daysTouched}.${Math.round(secs / 3600)}.${commits}`;
  } catch {
    return '0.0.0';
  }
}

// Builds the whole app (JS, CSS, images, data) into ONE self-contained index.html
// that runs by double-clicking — no server needed.
export default defineConfig({
  plugins: [react(), viteSingleFile()],
  define: {
    __APP_VERSION__: JSON.stringify(versionString()),
  },
  base: './',
  server: {
    port: 3000
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    assetsInlineLimit: 100000000,
    cssCodeSplit: false
  }
})

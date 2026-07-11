import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'
import { execSync } from 'node:child_process'

// The app version IS the total commit count. Computed at build time; falls back
// to Vercel's VERCEL_GIT_COMMIT_SHA depth or 0 if git history isn't available.
function commitCount() {
  try {
    return execSync('git rev-list --count HEAD', { encoding: 'utf8' }).trim();
  } catch {
    return '0';
  }
}

// Builds the whole app (JS, CSS, images, data) into ONE self-contained index.html
// that runs by double-clicking — no server needed.
export default defineConfig({
  plugins: [react(), viteSingleFile()],
  define: {
    __COMMIT_COUNT__: JSON.stringify(commitCount()),
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

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'

// Builds the whole app (JS, CSS, images, data) into ONE self-contained index.html
// that runs by double-clicking — no server needed.
export default defineConfig({
  plugins: [react(), viteSingleFile()],
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

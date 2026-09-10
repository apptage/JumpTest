import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// Chrome extension build (MV3). Two entries: the popup page and the module
// service worker. Shares the repo's env files (VITE_SUPABASE_*) and imports
// the shared src/api/timeLogs.js — nothing else from the web app.
//   npm run build:extension  →  extension/dist  →  chrome://extensions → Load unpacked
export default defineConfig({
  root: path.resolve(__dirname, 'extension'),
  base: './',                                            // relative asset URLs (chrome-extension://)
  envDir: __dirname,
  publicDir: path.resolve(__dirname, 'extension/public'), // manifest.json copied as-is
  plugins: [react()],
  build: {
    outDir: path.resolve(__dirname, 'extension/dist'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: path.resolve(__dirname, 'extension/popup.html'),
        background: path.resolve(__dirname, 'extension/src/background.js'),
      },
      output: {
        format: 'es',                       // manifest declares "type": "module"
        entryFileNames: '[name].js',        // background.js must sit at dist root
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
});

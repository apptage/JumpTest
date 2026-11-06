#!/usr/bin/env node
/** Chrome extension (MV3) — esbuild bundle. Output: extension/dist */
import * as esbuild from 'esbuild';
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvFile } from './env-file.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'extension/dist');

for (const [k, v] of Object.entries(loadEnvFile(path.join(root, '.env.local')))) {
  if (v !== undefined && v !== '') process.env[k] ??= v;
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY');
  process.exit(1);
}

const define = {
  'process.env.NEXT_PUBLIC_SUPABASE_URL': JSON.stringify(url),
  'process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY': JSON.stringify(key),
  'process.env.NODE_ENV': JSON.stringify('production'),
  // the rest of src/env.public.js — the extension doesn't use these, but they
  // must be defined or `process` throws in the service worker
  'process.env.NEXT_PUBLIC_APP_ENV': JSON.stringify(process.env.NEXT_PUBLIC_APP_ENV ?? ''),
  'process.env.NEXT_PUBLIC_FIREBASE_API_KEY': JSON.stringify(process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? ''),
  'process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN': JSON.stringify(process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? ''),
  'process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID': JSON.stringify(process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? ''),
  'process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET': JSON.stringify(process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? ''),
  'process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID': JSON.stringify(process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? ''),
  'process.env.NEXT_PUBLIC_FIREBASE_APP_ID': JSON.stringify(process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? ''),
  'process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY': JSON.stringify(process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY ?? ''),
};

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

const rawImportPlugin = {
  name: 'raw-import',
  setup(build) {
    build.onResolve({ filter: /\?raw$/ }, (args) => ({
      path: path.join(args.resolveDir, args.path.replace(/\?raw$/, '')),
      namespace: 'raw-text',
    }));
    build.onLoad({ filter: /.*/, namespace: 'raw-text' }, (args) => ({
      contents: `export default ${JSON.stringify(readFileSync(args.path, 'utf8'))}`,
      loader: 'js',
    }));
  },
};

await esbuild.build({
  entryPoints: {
    popup: path.join(root, 'extension/src/popup/main.jsx'),
    background: path.join(root, 'extension/src/background.js'),
  },
  outdir: dist,
  entryNames: '[name]',
  chunkNames: 'chunks/[name]-[hash]',
  assetNames: 'assets/[name]-[hash]',
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: ['chrome109'],
  jsx: 'automatic',
  define,
  plugins: [rawImportPlugin],
  logLevel: 'info',
});

copyFileSync(path.join(root, 'extension/public/manifest.json'), path.join(dist, 'manifest.json'));

writeFileSync(
  path.join(dist, 'popup.html'),
  `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="color-scheme" content="dark" />
    <title>Miaro Verify Time Log</title>
    <link rel="stylesheet" href="./popup.css" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./popup.js"></script>
  </body>
</html>
`,
);

console.log('Extension built → extension/dist (Load unpacked in chrome://extensions)');

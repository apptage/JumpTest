#!/usr/bin/env node
/**
 * Ensures `.env.local` exists for local Next.js / extension / Supabase CLI.
 * - Uses existing .env.local if present
 * - Otherwise migrates from legacy .env.production.local or .env.staging.local
 * - Otherwise copies from .env.example
 * Skips work on CI / Vercel (those inject env vars).
 */
import { copyFileSync, existsSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

if (process.env.CI || process.env.VERCEL) {
  console.log('env:sync skipped (CI/Vercel — use platform environment variables)');
  process.exit(0);
}

const localPath = join(root, '.env.local');

if (existsSync(localPath)) {
  console.log('Using .env.local');
  process.exit(0);
}

const legacy = [
  join(root, '.env.production.local'),
  join(root, '.env.staging.local'),
];
for (const legacyPath of legacy) {
  if (existsSync(legacyPath)) {
    copyFileSync(legacyPath, localPath);
    console.log(`Created .env.local from ${basename(legacyPath)} (migrate to a single local file)`);
    process.exit(0);
  }
}

const examplePath = join(root, '.env.example');
if (!existsSync(examplePath)) {
  console.error('Missing .env.example — add it to the repo or create .env.local manually');
  process.exit(1);
}

copyFileSync(examplePath, localPath);
console.log('Created .env.local from .env.example — add your Supabase keys');

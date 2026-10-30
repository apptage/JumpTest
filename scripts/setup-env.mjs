#!/usr/bin/env node
/**
 * Local dev helper: bootstrap .env.local from .env / .env.production / .env.example.
 * Skipped on CI and Vercel — those environments inject env vars directly.
 */
import { copyFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

if (process.env.CI || process.env.VERCEL) {
  console.log('env:sync skipped (CI/Vercel — using platform environment variables)');
  process.exit(0);
}

const localPath = join(root, '.env.local');

if (existsSync(localPath)) {
  console.log('Using existing .env.local');
  process.exit(0);
}

const sources = ['.env', '.env.production', '.env.example'];
for (const name of sources) {
  const src = join(root, name);
  if (!existsSync(src)) continue;
  copyFileSync(src, localPath);
  console.log(`Created .env.local from ${name} — add your Supabase keys if still placeholders`);
  process.exit(0);
}

console.warn('No .env.local, .env, .env.production, or .env.example found. Create .env.local with NEXT_PUBLIC_SUPABASE_*');

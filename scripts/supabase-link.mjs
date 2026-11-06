#!/usr/bin/env node
/**
 * Links Supabase CLI using SUPABASE_PROJECT_REF from .env.local
 */
import { execSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const setup = spawnSync(process.execPath, ['scripts/setup-env.mjs'], {
  cwd: root,
  encoding: 'utf8',
});
if (setup.status !== 0) process.exit(setup.status ?? 1);

const envFile = join(root, '.env.local');

if (!existsSync(envFile)) {
  console.error(`Missing .env.local. Run: npm run env:sync`);
  process.exit(1);
}

const content = readFileSync(envFile, 'utf8');
const match = content.match(/^SUPABASE_PROJECT_REF=(.+)$/m);
const ref = match?.[1]?.trim();

if (!ref || ref.startsWith('YOUR_')) {
  console.error('Set SUPABASE_PROJECT_REF in .env.local (Supabase Dashboard → Project Settings → General → Reference ID)');
  process.exit(1);
}

console.log(`Linking Supabase CLI to ${ref}…`);
execSync(`supabase link --project-ref ${ref}`, { cwd: root, stdio: 'inherit' });

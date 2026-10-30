#!/usr/bin/env node
/**
 * Links Supabase CLI to SUPABASE_PROJECT_REF from local env files.
 */
import { execSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvFile } from './env-file.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

spawnSync(process.execPath, ['scripts/setup-env.mjs'], { cwd: root, stdio: 'inherit' });

const envPaths = ['.env.local', '.env.production', '.env', '.env.production.local'];
let ref;
for (const name of envPaths) {
  const path = join(root, name);
  if (!existsSync(path)) continue;
  const env = loadEnvFile(path);
  ref = env.SUPABASE_PROJECT_REF;
  if (ref && !ref.startsWith('YOUR_')) break;
}

if (!ref || ref.startsWith('YOUR_')) {
  console.error('Set SUPABASE_PROJECT_REF in .env.local or .env.production');
  process.exit(1);
}

console.log(`Linking Supabase project ref: ${ref}`);
execSync(`supabase link --project-ref ${ref}`, { cwd: root, stdio: 'inherit' });

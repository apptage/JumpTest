#!/usr/bin/env node
/**
 * Links Supabase CLI to the project ref in .env.<mode>.local (SUPABASE_PROJECT_REF).
 */
import { execSync, spawnSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const setup = spawnSync(process.execPath, ['scripts/setup-env.mjs'], {
  cwd: root,
  encoding: 'utf8',
});
if (setup.status !== 0) process.exit(setup.status ?? 1);

const mode = setup.stdout.trim().split('\n').pop();
const envFile = join(root, `.env.${mode}.local`);

if (!existsSync(envFile)) {
  console.error(`Missing ${envFile}. Run: npm run env:sync`);
  process.exit(1);
}

const content = readFileSync(envFile, 'utf8');
const match = content.match(/^SUPABASE_PROJECT_REF=(.+)$/m);
const ref = match?.[1]?.trim();

if (!ref || ref.startsWith('YOUR_')) {
  console.error(`Set SUPABASE_PROJECT_REF in .env.${mode}.local first.`);
  console.error('Find it in Supabase Dashboard → Project Settings → General → Reference ID');
  process.exit(1);
}

console.log(`Linking Supabase CLI to ${ref} (${mode})…`);
execSync(`supabase link --project-ref ${ref}`, { cwd: root, stdio: 'inherit' });

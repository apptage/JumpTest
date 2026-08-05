#!/usr/bin/env node
/**
 * Creates .env.<mode>.local from the branch-matched example if missing.
 *   main    → production → .env.production.local
 *   staging → staging    → .env.staging.local
 */
import { execSync } from 'node:child_process';
import { copyFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function currentBranch() {
  try {
    return execSync('git rev-parse --abbrev-ref HEAD', {
      cwd: root,
      encoding: 'utf8',
    }).trim();
  } catch {
    return 'staging';
  }
}

const branch = currentBranch();
const mode = branch === 'main' ? 'production' : 'staging';
const example = join(root, `.env.${mode}.example`);
const target = join(root, `.env.${mode}.local`);

if (!existsSync(example)) {
  console.error(`Missing template: .env.${mode}.example`);
  process.exit(1);
}

if (existsSync(target)) {
  console.log(`Using existing .env.${mode}.local (${mode} / ${branch} branch)`);
} else {
  copyFileSync(example, target);
  console.log(`Created .env.${mode}.local — add your Supabase keys from GammaQuality${mode === 'staging' ? '-Staging' : ''}`);
}

console.log(`Mode: ${mode} | Branch: ${branch}`);
process.stdout.write(mode);

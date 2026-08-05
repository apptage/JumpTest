#!/usr/bin/env node
/**
 * Runs a command with the Vite mode matching the current git branch.
 * Usage: node scripts/with-env.mjs vite | node scripts/with-env.mjs vite build
 */
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const userArgs = process.argv.slice(2);

if (userArgs.length === 0) {
  console.error('Usage: node scripts/with-env.mjs <command> [args...]');
  process.exit(1);
}

const setup = spawnSync(process.execPath, ['scripts/setup-env.mjs'], {
  cwd: root,
  encoding: 'utf8',
});

if (setup.status !== 0) {
  process.stderr.write(setup.stderr || '');
  process.exit(setup.status ?? 1);
}

const mode = setup.stdout.trim().split('\n').pop();
const [cmd, ...args] = userArgs;

const result = spawnSync(cmd, ['--mode', mode, ...args], {
  cwd: root,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

process.exit(result.status ?? 1);

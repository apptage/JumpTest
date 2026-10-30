#!/usr/bin/env node
/**
 * Runs a command with the env file matching the current git branch.
 *   Next app:     node scripts/with-env.mjs next dev | next build | next start
 *   Extension:    node scripts/with-env.mjs extension-build
 */
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvFile } from './env-file.mjs';

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
const envFile = join(root, `.env.${mode}.local`);
const [cmd, ...args] = userArgs;

const branchEnv = loadEnvFile(envFile);
const childEnv = { ...process.env, ...branchEnv };

let result;
if (cmd === 'next') {
  result = spawnSync('next', args, {
    cwd: root,
    stdio: 'inherit',
    env: childEnv,
    shell: process.platform === 'win32',
  });
} else if (cmd === 'extension-build') {
  result = spawnSync(process.execPath, ['scripts/build-extension.mjs'], {
    cwd: root,
    stdio: 'inherit',
    env: childEnv,
  });
} else {
  console.error(`Unknown command: ${cmd}`);
  process.exit(1);
}

process.exit(result.status ?? 1);

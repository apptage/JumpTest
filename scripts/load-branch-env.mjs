import { execSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvFile } from './env-file.mjs';
import { applyPublicEnvAliases } from './public-env.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

export function branchEnvMode() {
  try {
    const branch = execSync('git rev-parse --abbrev-ref HEAD', {
      cwd: root,
      encoding: 'utf8',
    }).trim();
    return branch === 'main' ? 'production' : 'staging';
  } catch {
    return 'staging';
  }
}

/** Load branch-matched `.env.<mode>.local` (+ `.env.local`) into process.env for Next.js. */
export function loadBranchEnvIntoProcess() {
  const mode = branchEnvMode();
  const branchFile = join(root, `.env.${mode}.local`);
  const branchEnv = applyPublicEnvAliases(loadEnvFile(branchFile));
  for (const [key, value] of Object.entries(branchEnv)) {
    if (value !== undefined && value !== '') process.env[key] ??= value;
  }

  const dotLocal = applyPublicEnvAliases(loadEnvFile(join(root, '.env.local')));
  for (const [key, value] of Object.entries(dotLocal)) {
    if (value !== undefined && value !== '') process.env[key] = value;
  }
}

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvFile } from './env-file.mjs';
import { applyPublicEnvAliases } from './public-env.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Load local env files into process.env (no-op on Vercel when files are absent). */
export function loadBranchEnvIntoProcess() {
  const isProd = process.env.NODE_ENV === 'production';
  const ordered = isProd
    ? ['.env', '.env.production', '.env.production.local', '.env.local']
    : ['.env', '.env.local', '.env.production.local', '.env.staging.local', '.env.production'];

  for (const name of ordered) {
    const fileEnv = applyPublicEnvAliases(loadEnvFile(join(root, name)));
    for (const [key, value] of Object.entries(fileEnv)) {
      if (value !== undefined && value !== '') process.env[key] ??= value;
    }
  }
}

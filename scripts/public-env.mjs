/** Public client env suffixes (inlined into the Next.js bundle at build time). */
export const PUBLIC_ENV_SUFFIXES = [
  'APP_ENV',
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'FIREBASE_API_KEY',
  'FIREBASE_AUTH_DOMAIN',
  'FIREBASE_PROJECT_ID',
  'FIREBASE_STORAGE_BUCKET',
  'FIREBASE_MESSAGING_SENDER_ID',
  'FIREBASE_APP_ID',
  'FIREBASE_VAPID_KEY',
];

/** Read a public env value from process.env (supports legacy prefixed keys on Vercel). */
export function readPublicEnv(suffix) {
  const primary = `NEXT_PUBLIC_${suffix}`;
  if (process.env[primary]) return process.env[primary];
  const legacy = `VITE_${suffix}`;
  if (process.env[legacy]) return process.env[legacy];
  return '';
}

export function nextClientEnvBlock() {
  return Object.fromEntries(
    PUBLIC_ENV_SUFFIXES.map((suffix) => [`NEXT_PUBLIC_${suffix}`, readPublicEnv(suffix)]),
  );
}

/** Copy legacy-prefixed public keys to NEXT_PUBLIC_* in a flat env map. */
export function applyPublicEnvAliases(env) {
  const out = { ...env };
  for (const [key, value] of Object.entries(env)) {
    const match = /^VITE_(.+)$/.exec(key);
    if (match && !out[`NEXT_PUBLIC_${match[1]}`]) {
      out[`NEXT_PUBLIC_${match[1]}`] = value;
    }
  }
  return out;
}

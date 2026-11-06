/** Public env vars for the Next.js client bundle (NEXT_PUBLIC_* only).
    Spelled out in full on purpose: the bundlers inline only literal
    `process.env.NEXT_PUBLIC_X` references, so a computed process.env[key] is
    undefined in the browser. Add new vars here (and to build-extension.mjs). */
const PUBLIC_ENV = {
  APP_ENV: process.env.NEXT_PUBLIC_APP_ENV,
  SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  FIREBASE_API_KEY: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  FIREBASE_AUTH_DOMAIN: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  FIREBASE_PROJECT_ID: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  FIREBASE_STORAGE_BUCKET: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  FIREBASE_MESSAGING_SENDER_ID: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  FIREBASE_APP_ID: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  FIREBASE_VAPID_KEY: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY,
};

export function publicEnv(name) {
  return PUBLIC_ENV[name] || undefined;
}

export function appEnvName() {
  return publicEnv('APP_ENV') || process.env.NODE_ENV || 'development';
}

export function isDevBuild() {
  return process.env.NODE_ENV === 'development';
}

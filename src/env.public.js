/** Public env vars for the Next.js client bundle (NEXT_PUBLIC_* only). */
export function publicEnv(name) {
  const key = `NEXT_PUBLIC_${name}`;
  if (typeof process !== 'undefined' && process.env[key]) return process.env[key];
  return undefined;
}

export function appEnvName() {
  return publicEnv('APP_ENV') || process.env.NODE_ENV || 'development';
}

export function isDevBuild() {
  return process.env.NODE_ENV === 'development';
}

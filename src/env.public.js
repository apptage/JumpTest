/** Dev-only helpers (use static NEXT_PUBLIC_* in client modules that need inlining). */
export function isDevBuild() {
  return process.env.NODE_ENV === 'development';
}

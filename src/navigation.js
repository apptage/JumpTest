/** App Router paths for the main workspace (Next.js). */
export const APP_PAGES = [
  'dashboard',
  'projecthub',
  'releases',
  'bugs',
  'wbs',
  'projects',
  'analytics',
  'users',
  'teams',
  'settings',
];

export function pageFromPathname(pathname) {
  if (!pathname || pathname === '/') return 'dashboard';
  const segment = pathname.replace(/^\//, '').split('/')[0];
  return APP_PAGES.includes(segment) ? segment : null;
}

export function pathForPage(page) {
  return page === 'dashboard' ? '/' : `/${page}`;
}

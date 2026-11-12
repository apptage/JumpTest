/** App Router paths for the main workspace (Next.js). */
export const APP_PAGES = [
  'dashboard',
  'projecthub',
  'releases',
  'bugs',
  'wbs',
  'analytics',
  'users',
  'teams',
  'brands',
  'settings',
];

// old links to the retired Manage Projects page open Projects instead
const PAGE_ALIASES = { projects: 'projecthub' };

export function pageFromPathname(pathname) {
  if (!pathname || pathname === '/') return 'dashboard';
  const segment = pathname.replace(/^\//, '').split('/')[0];
  if (PAGE_ALIASES[segment]) return PAGE_ALIASES[segment];
  return APP_PAGES.includes(segment) ? segment : null;
}

export function pathForPage(page) {
  return page === 'dashboard' ? '/' : `/${page}`;
}

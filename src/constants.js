/* Release statuses */
export const STATUSES = {
  in_qa: { label: 'In QA', color: '#3b82f6', icon: '🔍' },
  pending: { label: 'Pending', color: '#f59e0b', icon: '⏳' },
  qa_complete: { label: 'QA Complete', color: '#10b981', icon: '✅' },
  bug_repeat: { label: 'Repeat Bug', color: '#f43f5e', icon: '🐛' },
};
export const STATUS_ORDER = ['in_qa', 'pending', 'qa_complete', 'bug_repeat'];

/* Release delivery types */
export const RELEASE_TYPES = {
  apk: { label: 'APK', icon: '📦' },
  testflight: { label: 'TestFlight', icon: '✈️' },
  web: { label: 'Web Link', icon: '🌐' },
};
export const RELEASE_TYPE_ORDER = ['apk', 'testflight', 'web'];

/* Project types & platforms */
export const PROJECT_TYPES = ['mobile', 'web'];
export const PLATFORMS = ['Android', 'iOS', 'Web', 'Both'];

/* A mobile project covers Android + iOS; a web project covers Web. */
export function platformForProjectType(type) {
  return type === 'web' ? 'Web' : 'Both';
}

/* Within a project, a release's platform follows how it's delivered. */
export function platformForReleaseType(releaseType) {
  if (releaseType === 'apk') return 'Android';
  if (releaseType === 'testflight') return 'iOS';
  return 'Web';
}

/* Which release types make sense for each project type. */
export const RELEASE_TYPES_BY_PROJECT = {
  mobile: ['apk', 'testflight'],
  web: ['web'],
};

/* Friendly label — "Both" reads as "Android & iOS". */
export function platformLabel(platform) {
  return platform === 'Both' ? 'Android & iOS' : platform;
}

/* Bug severity */
export const SEVERITIES = {
  critical: { label: 'Critical', color: '#f43f5e' },
  major: { label: 'Major', color: '#f59e0b' },
  minor: { label: 'Minor', color: '#6b7280' },
};
export const SEVERITY_ORDER = ['critical', 'major', 'minor'];

/* Bug status workflow */
export const BUG_STATUSES = {
  open: { label: 'Open', color: '#f43f5e' },
  in_progress: { label: 'In Progress', color: '#3b82f6' },
  fixed: { label: 'Fixed', color: '#8b5cf6' },
  verified: { label: 'Verified', color: '#10b981' },
};
export const BUG_STATUS_ORDER = ['open', 'in_progress', 'fixed', 'verified'];

/* Roles */
export const ROLES = ['Developer', 'QA', 'Admin'];
export const ROLE_COLORS = {
  QA: '#3b82f6',
  Developer: '#22c55e',
  Admin: '#ff6a1a',
};

/* Org restriction */
export const ALLOWED_EMAIL_DOMAIN = 'jumppace.com';
export function emailDomainOk(email) {
  return email.trim().toLowerCase().endsWith(`@${ALLOWED_EMAIL_DOMAIN}`);
}

/* Release links — APKs and builds are shared as links (not file uploads).
   Temporary/expiring hosts like WeTransfer are rejected. */
export const BLOCKED_LINK_HOSTS = ['wetransfer.com', 'we.tl'];

export function linkIssue(url) {
  const u = (url || '').trim();
  if (!u) return 'A download link is required';
  if (!/^https?:\/\/.+/i.test(u)) return 'Enter a valid URL starting with https://';
  let host;
  try {
    host = new URL(u).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return 'Enter a valid URL';
  }
  if (BLOCKED_LINK_HOSTS.some((h) => host === h || host.endsWith('.' + h))) {
    return 'WeTransfer links expire — use a permanent hosting link (Drive, S3, Play Console, etc.)';
  }
  return null;
}

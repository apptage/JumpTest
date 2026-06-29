/* Release statuses */
export const STATUSES = {
  in_qa: { label: 'In QA', color: '#64748b', icon: '🔍' },
  pending: { label: 'Pending', color: '#d97706', icon: '⏳' },
  qa_complete: { label: 'QA Complete', color: '#16a34a', icon: '✅' },
  bug_repeat: { label: 'Repeat Bug', color: '#dc2626', icon: '🐛' },
};
export const STATUS_ORDER = ['in_qa', 'pending', 'qa_complete', 'bug_repeat'];

/* Release delivery types */
export const RELEASE_TYPES = {
  apk: { label: 'APK', icon: '📦' },
  testflight: { label: 'TestFlight', icon: '✈️' },
  web: { label: 'Web Link', icon: '🌐' },
};
export const RELEASE_TYPE_ORDER = ['apk', 'testflight', 'web'];

/* Project types — a project may have a web app, a mobile app, or both. */
export const PROJECT_TYPES = ['web', 'mobile', 'both'];
export function projectTypeLabel(type) {
  if (type === 'both') return 'Web & Mobile';
  if (type === 'web') return 'Web';
  return 'Mobile';
}

/* The two platform contexts data is segregated by. */
export const RELEASE_PLATFORMS = ['Web', 'Mobile'];

/* Which platform contexts a project exposes. */
export function platformsForProjectType(type) {
  if (type === 'web') return ['Web'];
  if (type === 'mobile') return ['Mobile'];
  return ['Web', 'Mobile'];
}

/* Which delivery types are valid within a platform context. */
export const RELEASE_TYPES_BY_PLATFORM = {
  Web: ['web'],
  Mobile: ['apk', 'testflight'],
};

/* A release's platform context follows how it's delivered. */
export function platformForReleaseType(releaseType) {
  return releaseType === 'web' ? 'Web' : 'Mobile';
}

/* release.platform is already 'Web' | 'Mobile' — show it as-is. */
export function platformLabel(platform) {
  return platform || '—';
}

/* Release environments */
export const ENVIRONMENTS = ['Production', 'Staging'];

/* How long a developer may edit/delete their own release after creating it. */
export const EDIT_WINDOW_HOURS = 8;
export function withinEditWindow(release) {
  const start = release.createdAt || release.date;
  if (!start) return false;
  const hrs = (Date.now() - new Date(start).getTime()) / 3_600_000;
  return !Number.isNaN(hrs) && hrs <= EDIT_WINDOW_HOURS;
}

/* ---- SLA thresholds (hours) by release status ---- */
export const SLA_HOURS = { pending: 24, in_qa: 72 };
export const BUG_SLA_DAYS = 5;

/* level: null (ok) | 'warn' (>=75% of SLA) | 'over' (past SLA) */
export function slaLevel(status, sinceISO) {
  const limit = SLA_HOURS[status];
  if (!limit || !sinceISO) return null;
  const hrs = (Date.now() - new Date(sinceISO).getTime()) / 3_600_000;
  if (Number.isNaN(hrs)) return null;
  if (hrs >= limit) return 'over';
  if (hrs >= limit * 0.75) return 'warn';
  return null;
}

export function bugSlaLevel(status, createdISO) {
  if (status === 'verified' || !createdISO) return null;
  const days = (Date.now() - new Date(createdISO).getTime()) / 86_400_000;
  if (Number.isNaN(days)) return null;
  if (days >= BUG_SLA_DAYS) return 'over';
  if (days >= BUG_SLA_DAYS * 0.75) return 'warn';
  return null;
}

export const SLA_COLORS = { warn: '#d97706', over: '#dc2626' };

/* compact "3h" / "2d" duration from a start ISO to now (or to endISO) */
export function humanizeSince(startISO, endISO) {
  if (!startISO) return '—';
  const end = endISO ? new Date(endISO).getTime() : Date.now();
  const ms = end - new Date(startISO).getTime();
  if (Number.isNaN(ms) || ms < 0) return '—';
  const h = ms / 3_600_000;
  if (h < 1) return `${Math.max(1, Math.round(ms / 60_000))}m`;
  if (h < 48) return `${Math.round(h)}h`;
  return `${Math.round(h / 24)}d`;
}

/* Bug severity */
export const SEVERITIES = {
  critical: { label: 'Critical', color: '#dc2626' },
  major: { label: 'Major', color: '#d97706' },
  minor: { label: 'Minor', color: '#64748b' },
};
export const SEVERITY_ORDER = ['critical', 'major', 'minor'];

/* Bug status workflow */
export const BUG_STATUSES = {
  open: { label: 'Open', color: '#dc2626' },
  in_progress: { label: 'In Progress', color: '#2563eb' },
  fixed: { label: 'Fixed', color: '#d97706' },
  disputed: { label: 'Needs Clarification', color: '#7c3aed' },
  verified: { label: 'Verified', color: '#16a34a' },
};
export const BUG_STATUS_ORDER = ['open', 'in_progress', 'fixed', 'disputed', 'verified'];

/* Which part of a Web project a release targets. */
export const RELEASE_COMPONENTS = ['Web Application', 'Admin Dashboard', 'Landing Page', 'Other'];

/* Component / architecture tags a bug can carry (one or more). */
export const BUG_TAGS = [
  'Mobile Frontend',
  'Web Frontend',
  'Backend API',
  'Database',
  'Admin Dashboard',
  'Landing Page',
  'Authentication',
  'Notifications',
  'Design / UI',
  'Performance',
  'Other',
];

/* Feature / Epic a bug belongs to. */
export const BUG_FEATURES = [
  'Authentication',
  'Notifications',
  'Payments',
  'Dashboard',
  'Reports',
  'User Management',
  'Chat',
  'Settings',
  'Other',
];

/* Outcomes when a bug is closed without a code fix (QA quality insights). */
export const BUG_RESOLUTIONS = ['Not a Bug', 'Out of Scope', 'Cannot Reproduce', 'Duplicate'];

/* Roles */
export const ROLES = ['Developer', 'QA', 'Team Lead', 'Admin'];
export const ROLE_COLORS = {
  QA: '#2563eb',
  Developer: '#16a34a',
  'Team Lead': '#d97706',
  Admin: '#2563eb',
};
/* Roles a Team Lead is allowed to assign within their own team. */
export const TEAM_ASSIGNABLE_ROLES = ['Developer', 'QA'];

/* Org restriction */
export const ALLOWED_EMAIL_DOMAIN = 'jumppace.com';
export function emailDomainOk(email) {
  return email.trim().toLowerCase().endsWith(`@${ALLOWED_EMAIL_DOMAIN}`);
}

/* Release links — APKs and builds are shared as links (not file uploads).
   WeTransfer is rejected because its links expire. */
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

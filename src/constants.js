/* Release statuses — explicit QA lifecycle.
   qa_pending → qa_in_progress → qa_done → approved | sent_back; closed is terminal. */
export const STATUSES = {
  qa_pending: { label: 'QA Pending', color: '#d97706', icon: '⏳' },
  qa_in_progress: { label: 'QA In Progress', color: '#6366F1', icon: '🔍' },
  qa_done: { label: 'QA Done', color: '#7c3aed', icon: '📋' },
  approved: { label: 'Approved', color: '#16a34a', icon: '✅' },
  sent_back: { label: 'Sent Back', color: '#dc2626', icon: '↩️' },
  closed: { label: 'Closed', color: '#64748b', icon: '🗄️' },
};
export const STATUS_ORDER = ['qa_pending', 'qa_in_progress', 'qa_done', 'approved', 'sent_back', 'closed'];

/* Allowed forward transitions (QA / manager driven). sent_back is resolved by
   the developer submitting a follow-up release, not by an in-place transition. */
export const STATUS_TRANSITIONS = {
  qa_pending: ['qa_in_progress'],
  qa_in_progress: ['qa_done'],
  qa_done: ['approved', 'sent_back'],
  approved: [],
  sent_back: [],
  closed: [],
};
export function nextStatuses(status) {
  return STATUS_TRANSITIONS[status] || [];
}
/* Friendly action label for a transition target. */
export const TRANSITION_LABELS = {
  qa_in_progress: 'Start QA',
  qa_done: 'Mark QA Done',
  approved: 'Approve',
  sent_back: 'Send Back',
};

/* Statuses that occupy an open QA cycle (shown on the active board). */
export const ACTIVE_STATUSES = ['qa_pending', 'qa_in_progress', 'qa_done', 'sent_back'];
export function isActiveStatus(s) {
  return ACTIVE_STATUSES.includes(s);
}
export function isClosedStatus(s) {
  return s === 'closed';
}
/* A release is read-only once it has been superseded/closed. */
export function isReadOnly(release) {
  return release?.status === 'closed';
}

/* Version helpers — one canonical way to store and render a release version.
   Store the bare number (no leading "v"); render with exactly one "v". This
   fixes the "vv1.0.1" double-prefix (users typed the v AND the UI prepended one)
   and stays defensive against legacy rows that already contain a leading v. */
export function normalizeVersion(v) {
  return String(v || '').trim().replace(/^v+\s*/i, '');
}
export function formatVersion(v) {
  const s = normalizeVersion(v);
  return s ? `v${s}` : '';
}

/* Release delivery types */
export const RELEASE_TYPES = {
  apk: { label: 'APK', icon: '📦' },
  testflight: { label: 'TestFlight', icon: '✈️' },
  web: { label: 'Web Link', icon: '🌐' },
};
export const RELEASE_TYPE_ORDER = ['apk', 'testflight', 'web'];

/* Project types — a project may have a web app, a mobile app, or both, or be a
   CMS project (website / landing page / API integration), which has no WBS. */
export const PROJECT_TYPES = ['web', 'mobile', 'both', 'cms'];
export function projectTypeLabel(type) {
  if (type === 'both') return 'Web & Mobile';
  if (type === 'web') return 'Web';
  if (type === 'cms') return 'CMS';
  return 'Mobile';
}
export function isCmsProject(project) {
  return project?.type === 'cms';
}

/* The two platform contexts data is segregated by. */
export const RELEASE_PLATFORMS = ['Web', 'Mobile'];

/* Which platform contexts a project exposes. */
export function platformsForProjectType(type) {
  if (type === 'web' || type === 'cms') return ['Web'];
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
export const SLA_HOURS = { qa_pending: 24, qa_in_progress: 72, qa_done: 48 };
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

/* Blocking severities — the QA release gate. A release can only be Approved with
   NO open blocking bug; WBS task reconciliation uses the SAME rule (a task with
   an open blocking bug stays In Progress; minor bugs don't block completion). */
export const BLOCKING_SEVERITIES = ['critical', 'major'];
export function isBlockingSeverity(sev) {
  return BLOCKING_SEVERITIES.includes(sev);
}
// an OPEN blocking bug = active (not verified) AND blocking severity
export function isOpenBlockingBug(bug) {
  return bug && bug.status !== 'verified' && isBlockingSeverity(bug.severity);
}

/* Bug status workflow */
export const BUG_STATUSES = {
  open: { label: 'Open', color: '#dc2626' },
  in_progress: { label: 'In Progress', color: '#6366F1' },
  fixed: { label: 'Fixed', color: '#d97706' },
  disputed: { label: 'Needs Clarification', color: '#7c3aed' },
  // a developer proposed closing the bug (Not a Bug / Out of Scope / Duplicate);
  // held here until a Team Lead approves or rejects the decision
  pending_tl: { label: 'Pending TL Verification', color: '#0891b2' },
  verified: { label: 'Verified', color: '#16a34a' },
};
export const BUG_STATUS_ORDER = ['open', 'in_progress', 'fixed', 'disputed', 'pending_tl', 'verified'];

/* Single global definition of bug lifecycle buckets — used by every page/metric.
   Active = still needs work/verification; Closed = verified (done). */
export const ACTIVE_BUG_STATUSES = ['open', 'in_progress', 'disputed', 'fixed', 'pending_tl'];
export const CLOSED_BUG_STATUSES = ['verified'];
export function isActiveBug(bug) {
  return CLOSED_BUG_STATUSES.indexOf(bug.status) === -1;
}
export function isClosedBug(bug) {
  return CLOSED_BUG_STATUSES.indexOf(bug.status) !== -1;
}

/* Which part of a Web project a release targets. */
export const RELEASE_COMPONENTS = ['Web Application', 'Admin Panel', 'Landing Page', 'Other'];

/* The WBS platform bucket a release's work belongs to, derived from its
   Platform + Component (spec: Mobile → Mobile App; Web → the component name —
   Web Application / Admin Panel / Landing Page / the custom 'Other' name). This
   is what the Submit modal matches against the project's WBS platform tags. */
export function wbsPlatformForRelease(platform, component) {
  if (platform === 'Web') return String(component || '').trim();
  return 'Mobile App';
}

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

/* Resolutions a developer may propose. Unlike QA, a developer's choice is not
   applied immediately — it parks the bug in `pending_tl` for Team Lead review. */
export const DEV_DISPUTE_RESOLUTIONS = ['Not a Bug', 'Out of Scope', 'Duplicate'];

/* ---- WBS (Work Breakdown Structure) ---- */
/* WBS is a FLAT item model (see fixes16.sql): one status per item, no
   backend/frontend tracks, platform_type + module are free-text grouping tags. */
export const WBS_STATUSES = {
  not_started: { label: 'Not Started', color: '#64748b' },
  in_progress: { label: 'In Progress', color: '#d97706' },
  in_qa: { label: 'In QA', color: '#6366F1' },
  completed: { label: 'Completed', color: '#16a34a' },
  blocked: { label: 'Blocked', color: '#dc2626' },
};
export const WBS_STATUS_ORDER = ['not_started', 'in_progress', 'in_qa', 'completed', 'blocked'];

/* Work tracks — every WBS item belongs to one, and all of them count toward a
   project's completion. `sqa` = only SQA can mark the item Completed (enforced by
   the wbs_items_guard_completion trigger); design and marketing aren't SQA-tested. */
export const WBS_TRACKS = {
  scope: { label: 'Original scope', sqa: true },
  improvements: { label: 'Improvements & feedback', sqa: true, hint: 'Improvement points, client feedback and requested changes.' },
  upsell: { label: 'Upsell modules', sqa: true, hint: 'Modules sold on top of the original scope.' },
  design: { label: 'Design', sqa: false, hint: 'Design work. A Team Lead or Admin marks it Completed.' },
  marketing: { label: 'Marketing', sqa: false, hint: 'Marketing tasks. A Team Lead or Admin marks them Completed.' },
  support: { label: 'Ongoing support', sqa: true, hint: 'Every new requirement, change and task the client shares after launch.' },
};
/* QA status of one story point, shown beside its work status. Worked out by
   wbsQaStatus (shared/wbsMetrics.js) from its releases, bugs and SQA sign-off. */
export const WBS_QA_STATUSES = {
  not_submitted: { label: 'Not submitted', tone: 'neutral' },
  awaiting: { label: 'Awaiting QA', tone: 'warning' },
  testing: { label: 'In testing', tone: 'info' },
  review: { label: 'In review', tone: 'info' },
  failed: { label: 'Failed', tone: 'danger' },
  sent_back: { label: 'Sent back', tone: 'danger' },
  retest: { label: 'Needs re-test', tone: 'warning' },
  passed_sent_back: { label: 'Passed, sent back', tone: 'warning' },
  no_record: { label: 'No QA record', tone: 'warning' },
  approved: { label: 'QA approved', tone: 'success' },
  not_required: { label: 'Not required', tone: 'neutral' },
};
export const WBS_QA_STATUS_ORDER = ['not_submitted', 'awaiting', 'testing', 'review', 'failed', 'sent_back', 'retest', 'passed_sent_back', 'no_record', 'approved', 'not_required'];
export const WBS_TRACK_ORDER = ['scope', 'improvements', 'upsell', 'design', 'marketing', 'support'];
export function wbsTrackLabel(track) {
  return WBS_TRACKS[track]?.label || WBS_TRACKS.scope.label;
}
export function isSqaTrack(track) {
  return WBS_TRACKS[track]?.sqa !== false;
}
/* Statuses this user may pick for an item ([] = read-only).
   SQA signs off SQA-tracked items; managers run everything except that sign-off
   (they can still reopen a completed item); developers can't touch in_qa/completed. */
export function wbsStatusChoices({ track, status, role, canManage }) {
  const gated = isSqaTrack(track);
  if (role === 'QA') return gated ? WBS_STATUS_ORDER : [];
  if (canManage) return gated ? WBS_STATUS_ORDER.filter((s) => s !== 'completed' || status === 'completed') : WBS_STATUS_ORDER;
  if (role === 'Developer') return status === 'in_qa' || status === 'completed' ? [] : WBS_DEV_STATUSES;
  return [];
}
// statuses a developer may set directly (QA drives in_qa/completed via releases)
export const WBS_DEV_STATUSES = ['not_started', 'in_progress', 'blocked'];

// Normalize a raw spreadsheet status string (e.g. 'Complete', 'In Progress',
// 'Done', '') to a WBS status enum key. Empty / unknown → 'not_started'.
export function normalizeWbsStatus(raw) {
  const s = String(raw ?? '').trim().toLowerCase();
  if (!s) return 'not_started';
  if (['complete', 'completed', 'done', 'finished'].includes(s)) return 'completed';
  if (['in progress', 'in-progress', 'inprogress', 'wip', 'ongoing', 'started'].includes(s)) return 'in_progress';
  if (['in qa', 'qa', 'testing', 'in testing', 'in review', 'review'].includes(s)) return 'in_qa';
  if (['blocked', 'on hold', 'hold', 'stuck'].includes(s)) return 'blocked';
  if (['not started', 'not-started', 'todo', 'to do', 'pending', 'backlog', 'new'].includes(s)) return 'not_started';
  // already a valid enum key (e.g. 'in_progress')? keep it; else default
  const key = s.replace(/[\s-]+/g, '_');
  return WBS_STATUS_ORDER.includes(key) ? key : 'not_started';
}

// project_type on projects (fixes16). `type` ('mobile'/'web') stays for legacy use.
export const WBS_PROJECT_TYPES = [
  { value: 'mobile_app', label: 'Mobile App' },
  { value: 'web_app', label: 'Web App' },
  { value: 'admin_panel', label: 'Admin Panel' },
  { value: 'other', label: 'Other' },
];
export function wbsProjectTypeLabel(v) {
  return WBS_PROJECT_TYPES.find((t) => t.value === v)?.label || 'Other';
}
// suggested platform-type grouping tags (free text — used only as datalist hints)
export const WBS_PLATFORM_TYPES = ['Mobile App', 'Web App', 'Admin Panel', 'Other'];
export const WBS_PRIORITIES = ['Low', 'Medium', 'High'];

/* Preset scope packs — standard software modules used to seed a WBS fast.
   Each pack becomes a module (name) with a baseline set of item titles. Users
   pick a pack in the Bulk Add modal; it drops in as a `## <name>` block they can
   trim before importing. */
export const WBS_PRESETS = [
  {
    key: 'auth',
    name: 'Authentication',
    items: [
      'Onboarding Screens', 'Signup with Email', 'Login', 'OTP Verification', 'Resend OTP',
      'Google Login', 'Apple Login', 'Forgot Password', 'Reset Password', 'Logout',
    ],
  },
  {
    key: 'profile',
    name: 'Profile Management',
    items: [
      'View Profile', 'Edit Profile', 'Avatar Upload', 'Change Password',
      'Notification Settings', 'Delete Account',
    ],
  },
  {
    key: 'ecommerce',
    name: 'E-Commerce & Payment',
    items: [
      'Product Catalog', 'Product Details', 'Search & Filter', 'Cart', 'Checkout',
      'Payment Gateway', 'Order History', 'Refunds',
    ],
  },
  {
    key: 'notifications',
    name: 'Notifications',
    items: ['Push Notifications', 'In-App Notifications', 'Email Notifications', 'Notification Preferences'],
  },
  {
    key: 'admin',
    name: 'Admin Panel',
    items: ['User Management', 'Roles & Permissions', 'Dashboard & Analytics', 'Audit Logs', 'App Settings'],
  },
];

/* ---- CMS projects (type 'cms') — no WBS ----
   Work comes in as tasks, each from an AM, PMO or the SEO team, through
   Basecamp / CRM / a group. New builds also follow the development journey. */
export const CMS_KINDS = {
  website: { label: 'Website / Landing page' },
  api_integration: { label: 'API Integration' },
};
export const CMS_KIND_ORDER = ['website', 'api_integration'];
export function cmsKindLabel(kind) {
  return CMS_KINDS[kind]?.label || CMS_KINDS.website.label;
}
export const CMS_REQUESTERS = {
  am: { label: 'AM' },
  pmo: { label: 'PMO' },
  seo: { label: 'SEO team' },
};
export const CMS_CHANNELS = {
  basecamp: { label: 'Basecamp' },
  crm: { label: 'CRM' },
  group: { label: 'Group' },
  other: { label: 'Other' },
};
/* Task categories per CMS kind, and who may assign each one. */
export const CMS_TASK_CATEGORIES = {
  existing_changes: { label: 'Existing project changes', kind: 'website', requesters: ['am', 'pmo'] },
  major_functionality: { label: 'Existing project major functionality', kind: 'website', requesters: ['am', 'pmo'] },
  recovery: { label: 'Website recovery', kind: 'website', requesters: ['am', 'pmo'] },
  blogs: { label: 'Blogs uploading', kind: 'website', requesters: ['seo', 'pmo'] },
  seo_speed: { label: 'Website SEO / speed optimization', kind: 'website', requesters: ['seo', 'pmo'] },
  app_landing: { label: 'App landing page', kind: 'website', requesters: ['am', 'pmo'] },
  api_integration: { label: 'Website API integration', kind: 'api_integration', requesters: ['am', 'pmo'] },
};
export const CMS_TASK_CATEGORY_ORDER = ['existing_changes', 'major_functionality', 'recovery', 'blogs', 'seo_speed', 'app_landing', 'api_integration'];
export function cmsCategoriesForKind(kind) {
  const k = kind || 'website';
  return CMS_TASK_CATEGORY_ORDER.filter((c) => CMS_TASK_CATEGORIES[c].kind === k);
}
export function cmsCategoryLabel(c) {
  return CMS_TASK_CATEGORIES[c]?.label || c;
}
export const CMS_TASK_STATUSES = {
  todo: { label: 'To do', tone: 'neutral' },
  in_progress: { label: 'In progress', tone: 'warning' },
  in_review: { label: 'In review', tone: 'info' },
  done: { label: 'Done', tone: 'success' },
  on_hold: { label: 'On hold', tone: 'danger' },
};
export const CMS_TASK_STATUS_ORDER = ['todo', 'in_progress', 'in_review', 'done', 'on_hold'];
/* The development journey of a new website / landing page, in order. */
export const CMS_JOURNEY = [
  { key: 'template_selection', label: 'Template selection', hint: 'Landing page / website template selection' },
  { key: 'landing_development', label: 'Landing page development' },
  { key: 'subpages', label: 'Subpages creation' },
  { key: 'prelaunch_api', label: 'Pre-launch API integration' },
  { key: 'review_revisions', label: 'Review & revisions', hint: 'Website review & revisions' },
  { key: 'prelaunch_qa', label: 'Pre-launch testing & QA' },
  { key: 'deployment', label: 'Deployment (go-live)', hint: 'Website deployment' },
  { key: 'postlaunch_api', label: 'Post-launch API integration' },
  { key: 'handover', label: 'Final testing & handover' },
];
export const CMS_STAGE_STATUSES = {
  pending: { label: 'Not started', tone: 'neutral' },
  in_progress: { label: 'In progress', tone: 'warning' },
  done: { label: 'Done', tone: 'success' },
  skipped: { label: 'Skipped', tone: 'neutral' },
};
export const CMS_STAGE_STATUS_ORDER = ['pending', 'in_progress', 'done', 'skipped'];

/* Roles. ('Manager' was retired and merged into Admin — see fixes24.sql.) */
export const ROLES = ['Developer', 'QA', 'Team Lead', 'Admin'];
export const ROLE_COLORS = {
  QA: '#6366F1',
  Developer: '#16a34a',
  'Team Lead': '#d97706',
  Admin: '#6366F1',
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

export function linkIssue(url, required = true) {
  const u = (url || '').trim();
  // When the link is optional (e.g. a TestFlight build, distributed via App Store
  // Connect), an empty value is fine — but a provided value is still validated.
  if (!u) return required ? 'A download link is required' : null;
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

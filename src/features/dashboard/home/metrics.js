/* Dashboard metrics — plain numbers and plain sentences for each role.
   Pure functions over the already-scoped data, so every number on the page
   comes from one place. Bugs here are the LIVE set (bugs on active releases),
   the same set the Bugs page shows: "open bugs" and "blocking bugs" always
   agree with each other and with the Bugs page. */
import { isActiveBug, slaLevel, bugSlaLevel, isBlockingSeverity, STATUSES } from '@/constants.js';
import { statusSince } from '@shared/ui-kit.jsx';
import { filterBugs } from '@shared/filters.js';
import { computeProjectSummaries, computeReleaseMetrics } from '@shared/releaseMetrics.js';

const DAY = 86_400_000;
export const ageDays = (iso, now = Date.now()) => (iso ? Math.max(0, Math.floor((now - new Date(iso).getTime()) / DAY)) : 0);
export const ageText = (days) => (days <= 0 ? 'today' : days === 1 ? '1 day' : `${days} days`);
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const SEV_RANK = { critical: 0, major: 1, minor: 2 };
const PRIORITY_RANK = { High: 0, Medium: 1, Low: 2 };

/* ---------- shared context ---------- */
export function buildContext({ releases, bugs, projects, profiles, tasks = [], now = Date.now() }) {
  const releaseById = Object.fromEntries(releases.map((r) => [r.id, r]));
  const projectById = Object.fromEntries(projects.map((p) => [p.id, p]));
  const profileById = Object.fromEntries(profiles.map((p) => [p.id, p]));
  const live = filterBugs(bugs, {}, { releaseById, projectById });
  const activeBugs = live.filter(isActiveBug);
  const activeReleases = releases.filter((r) => r.status !== 'closed');
  return { releases, bugs, projects, profiles, tasks, now, releaseById, projectById, profileById, live, activeBugs, activeReleases };
}

export const bugOwnerId = (ctx, b) => ctx.releaseById[b.releaseId]?.submittedById || null;
export const isBlockingBug = (b) => isActiveBug(b) && isBlockingSeverity(b.severity);
const needsDevWork = (b) => b.status === 'open' || b.status === 'in_progress';
export const releaseLabel = (ctx, r) => `${ctx.projectById[r.projectId]?.name || 'Project'} v${String(r.version || '').replace(/^v/i, '')}`;

/* ---------- tasks (WBS items + CMS tasks), normalised ---------- */
const WBS_TASK = { not_started: ['todo', 'Not started'], in_progress: ['doing', 'In progress'], in_qa: ['review', 'In QA'], blocked: ['blocked', 'Blocked'] };
const CMS_TASK = { todo: ['todo', 'To do'], in_progress: ['doing', 'In progress'], in_review: ['review', 'In review'], on_hold: ['blocked', 'On hold'] };

function parseDue(v) {
  if (!v) return null;
  const s = String(v).trim();
  const t = /^\d{4}-\d{2}-\d{2}/.test(s) ? new Date(`${s.slice(0, 10)}T23:59:59`) : new Date(s);
  return Number.isNaN(t.getTime()) ? null : t;
}

// open (unfinished) tasks only
export function normaliseTasks(wbsItems = [], cmsTasks = []) {
  const out = [];
  wbsItems.forEach((i) => {
    const s = WBS_TASK[i.status];
    if (!s || i.type === 'module') return;
    out.push({ id: `w-${i.id}`, kind: 'wbs', projectId: i.projectId, title: i.title, state: s[0], statusLabel: s[1], priority: i.priority || null, due: parseDue(i.estimatedCompletionDate), assignedTo: i.assignedTo });
  });
  cmsTasks.forEach((t) => {
    const s = CMS_TASK[t.status];
    if (!s) return;
    out.push({ id: `c-${t.id}`, kind: 'cms', projectId: t.projectId, title: t.title, state: s[0], statusLabel: s[1], priority: t.priority || null, due: parseDue(t.dueDate), assignedTo: t.assignedTo });
  });
  return out;
}
export const isOverdue = (t, now = Date.now()) => !!t.due && t.due.getTime() < now && t.state !== 'review';
export const dueSoon = (t, now = Date.now()) => !!t.due && t.due.getTime() >= now && t.due.getTime() - now < 7 * DAY && t.state !== 'review';
export function sortTasks(tasks, now = Date.now()) {
  return tasks.slice().sort((a, b) =>
    (isOverdue(b, now) - isOverdue(a, now))
    || ((a.state === 'blocked') ? -1 : 0) - ((b.state === 'blocked') ? -1 : 0)
    || (PRIORITY_RANK[a.priority] ?? 3) - (PRIORITY_RANK[b.priority] ?? 3)
    || (a.due ? a.due.getTime() : Infinity) - (b.due ? b.due.getTime() : Infinity));
}

/* ---------- where work is waiting (replaces the Pipeline panel) ---------- */
function stage(key, label, owner, items, sinceOf, overdueOf, tone) {
  const ages = items.map((x) => ageDays(sinceOf(x)));
  return {
    key, label, owner, tone, count: items.length, items,
    oldestDays: ages.length ? Math.max(...ages) : 0,
    overdue: overdueOf ? items.filter(overdueOf).length : 0,
  };
}
export function releaseFlow(ctx, releases = ctx.activeReleases) {
  const by = (s) => releases.filter((r) => r.status === s);
  const over = (r) => slaLevel(r.status, statusSince(r)) === 'over';
  const decidedSince = ctx.now - 30 * DAY;
  const approved30 = ctx.releases.filter((r) => r.status === 'approved' && new Date(r.qaCompletedAt || r.statusChangedAt || r.createdAt).getTime() >= decidedSince).length;
  return {
    stages: [
      stage('qa_pending', 'Waiting for QA', 'QA', by('qa_pending'), statusSince, over, 'warning'),
      stage('qa_in_progress', 'Being tested', 'QA', by('qa_in_progress'), statusSince, over, 'info'),
      stage('qa_done', 'Tested, awaiting sign-off', 'QA / Lead', by('qa_done'), statusSince, over, 'info'),
      stage('sent_back', 'Sent back for fixes', 'Developer', by('sent_back'), statusSince, null, 'danger'),
    ],
    done: { label: 'Approved in the last 30 days', count: approved30 },
  };
}
export function bugFlow(ctx, bugs = ctx.activeBugs) {
  const by = (fn) => bugs.filter(fn);
  const over = (b) => bugSlaLevel(b.status, b.createdAt) === 'over';
  const since = ctx.now - 30 * DAY;
  const closed30 = ctx.bugs.filter((b) => !isActiveBug(b) && b.verifiedAt && new Date(b.verifiedAt).getTime() >= since).length;
  const created = (b) => b.createdAt;
  return {
    stages: [
      stage('dev', 'Waiting for a fix', 'Developer', by(needsDevWork), created, over, 'danger'),
      stage('disputed', 'Needs clarification', 'Dev + QA', by((b) => b.status === 'disputed'), created, over, 'warning'),
      stage('fixed', 'Fixed, waiting for re-test', 'QA', by((b) => b.status === 'fixed'), created, over, 'info'),
      stage('pending_tl', 'Waiting for Team Lead', 'Team Lead', by((b) => b.status === 'pending_tl'), created, over, 'info'),
    ],
    done: { label: 'Closed in the last 30 days', count: closed30 },
  };
}

/* ---------- weekly trend (paired bars) ---------- */
function weekStarts(n, now) {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // Monday
  return Array.from({ length: n }, (_, i) => new Date(d.getTime() - (n - 1 - i) * 7 * DAY));
}
function bucket(starts, dates) {
  const counts = starts.map(() => 0);
  const first = starts[0].getTime();
  dates.forEach((iso) => {
    if (!iso) return;
    const t = new Date(iso).getTime();
    if (t < first) return;
    const i = Math.min(starts.length - 1, Math.floor((t - first) / (7 * DAY)));
    counts[i] += 1;
  });
  return counts;
}
export function weeklyTrend(ctx, mode = 'bugs', weeks = 8) {
  const starts = weekStarts(weeks, ctx.now);
  const labels = starts.map((d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
  let a; let b; let names; let sentence;
  if (mode === 'bugs') {
    a = bucket(starts, ctx.bugs.map((x) => x.createdAt));
    b = bucket(starts, ctx.bugs.filter((x) => !isActiveBug(x)).map((x) => x.verifiedAt));
    names = ['Bugs found', 'Bugs closed'];
    const found = a.slice(-4).reduce((s, n) => s + n, 0);
    const closed = b.slice(-4).reduce((s, n) => s + n, 0);
    sentence = found === 0 && closed === 0
      ? { tone: 'neutral', text: 'No bugs found or closed in the last 4 weeks.' }
      : closed >= found
        ? { tone: 'success', text: `Bugs are being closed faster than they are found: ${closed} closed vs ${found} found in the last 4 weeks.` }
        : { tone: 'danger', text: `The bug backlog is growing: ${found} found vs ${closed} closed in the last 4 weeks.` };
  } else {
    a = bucket(starts, ctx.releases.map((x) => x.createdAt));
    b = bucket(starts, ctx.releases.filter((x) => x.status === 'approved').map((x) => x.qaCompletedAt || x.statusChangedAt));
    names = ['Builds submitted', 'Builds approved'];
    const sub = a.slice(-4).reduce((s, n) => s + n, 0);
    const ok = b.slice(-4).reduce((s, n) => s + n, 0);
    sentence = sub === 0
      ? { tone: 'neutral', text: 'No builds submitted in the last 4 weeks.' }
      : { tone: ok >= sub * 0.6 ? 'success' : 'warning', text: `${ok} of ${sub} builds submitted in the last 4 weeks have been approved so far.` };
  }
  return { labels, series: [{ name: names[0], data: a }, { name: names[1], data: b }], sentence };
}

/* ---------- headline rates (last 30 days vs the 30 before) ---------- */
export function passRate30(ctx, releases = ctx.releases) {
  const win = (from, to) => releases.filter((r) => {
    const t = new Date(r.createdAt).getTime();
    return t >= ctx.now - from * DAY && t < ctx.now - to * DAY;
  });
  const cur = computeReleaseMetrics(win(30, 0), ctx.bugs);
  const prev = computeReleaseMetrics(win(60, 30), ctx.bugs);
  return {
    pct: cur.decided ? cur.passRate : null,
    decided: cur.decided,
    change: cur.decided && prev.decided ? cur.passRate - prev.passRate : null,
  };
}
export function turnaround30(ctx, releases = ctx.releases) {
  const done = releases.filter((r) => r.qaCompletedAt && new Date(r.qaCompletedAt).getTime() >= ctx.now - 30 * DAY && r.createdAt);
  if (!done.length) return null;
  const avg = done.reduce((s, r) => s + (new Date(r.qaCompletedAt) - new Date(r.createdAt)) / DAY, 0) / done.length;
  return Math.round(avg * 10) / 10;
}

/* ---------- project health ---------- */
const HEALTH_RANK = { 'At risk': 0, 'Needs fixes': 1, 'In QA': 2, 'On track': 3, Idle: 4, 'No builds': 5 };
export function projectHealth(ctx, projects = ctx.projects) {
  const sums = computeProjectSummaries(ctx.releases, ctx.live);
  const lastActivity = {};
  ctx.releases.forEach((r) => {
    const t = new Date(r.statusChangedAt || r.createdAt).getTime();
    if (!lastActivity[r.projectId] || t > lastActivity[r.projectId]) lastActivity[r.projectId] = t;
  });
  const tasksBy = {};
  ctx.tasks.forEach((t) => (tasksBy[t.projectId] = tasksBy[t.projectId] || []).push(t));
  const rows = projects.map((p) => {
    const s = sums[p.id] || { builds: 0, inQa: 0, openBugs: 0, blockingBugs: 0, status: { label: 'No builds', tone: 'neutral' } };
    const overdue = (tasksBy[p.id] || []).filter((t) => isOverdue(t, ctx.now)).length;
    let status = s.status;
    if (p.type === 'cms') status = (tasksBy[p.id] || []).length ? { label: overdue ? 'At risk' : 'On track', tone: overdue ? 'danger' : 'success' } : { label: 'Idle', tone: 'neutral' };
    const reasons = [];
    if (s.blockingBugs) reasons.push(plural(s.blockingBugs, 'blocking bug'));
    else if (s.openBugs) reasons.push(plural(s.openBugs, 'open bug'));
    if (s.inQa) reasons.push(`${plural(s.inQa, 'build')} in QA`);
    if (status.label === 'Needs fixes') reasons.push('latest build sent back');
    if (overdue) reasons.push(plural(overdue, 'overdue task'));
    if (!reasons.length) reasons.push(status.label === 'No builds' ? 'no builds yet' : status.label === 'On track' ? 'latest build approved' : 'nothing in progress');
    return { project: p, status, reason: reasons.join(' · '), openBugs: s.openBugs, blocking: s.blockingBugs, inQa: s.inQa, overdue, last: lastActivity[p.id] || null };
  });
  rows.sort((a, b) => (HEALTH_RANK[a.status.label] ?? 9) - (HEALTH_RANK[b.status.label] ?? 9) || b.blocking - a.blocking || b.openBugs - a.openBugs);
  const tally = {};
  rows.forEach((r) => (tally[r.status.label] = (tally[r.status.label] || 0) + 1));
  return { rows, tally };
}

/* ---------- people & workload ---------- */
/* Workload is graded against the group's typical (median) load, so the labels
   stay meaningful whether the whole org is quiet or flat out. */
export const LOAD_LEVELS = {
  available: { label: 'Available', tone: 'success' },
  light: { label: 'Light', tone: 'success' },
  normal: { label: 'Normal', tone: 'neutral' },
  heavy: { label: 'Heavy', tone: 'warning' },
  overloaded: { label: 'Overloaded', tone: 'danger' },
};
export function loadLevel(score, median) {
  if (score <= 0) return LOAD_LEVELS.available;
  const m = Math.max(median, 3); // a small team's quiet week shouldn't make 4 items look heavy
  const ratio = score / m;
  if (ratio < 0.5) return LOAD_LEVELS.light;
  if (ratio <= 1.5) return LOAD_LEVELS.normal;
  if (ratio <= 2.5) return LOAD_LEVELS.heavy;
  return LOAD_LEVELS.overloaded;
}
export function peopleWorkload(ctx, people) {
  const rows = people
    .filter((p) => p.role !== 'Admin')
    .map((p) => {
      const myBuilds = ctx.activeReleases.filter((r) => r.submittedById === p.id);
      const inQa = myBuilds.filter((r) => ['qa_pending', 'qa_in_progress', 'qa_done'].includes(r.status)).length;
      const sentBack = myBuilds.filter((r) => r.status === 'sent_back').length;
      const bugsToFix = ctx.activeBugs.filter((b) => bugOwnerId(ctx, b) === p.id && (needsDevWork(b) || b.status === 'disputed'));
      const reviews = ctx.activeReleases.filter((r) => r.assignedQa === p.id && (r.status === 'qa_pending' || r.status === 'qa_in_progress')).length;
      const retests = p.role === 'QA' ? ctx.activeBugs.filter((b) => b.status === 'fixed' && ctx.releaseById[b.releaseId]?.assignedQa === p.id).length : 0;
      const tasks = ctx.tasks.filter((t) => t.assignedTo === p.id);
      const tasksActive = tasks.filter((t) => t.state === 'doing' || t.state === 'blocked').length;
      const overdue = tasks.filter((t) => isOverdue(t, ctx.now)).length;
      const blocking = bugsToFix.filter((b) => isBlockingSeverity(b.severity)).length;
      const score = inQa + sentBack * 2 + bugsToFix.length * 0.5 + blocking * 0.5 + reviews * 2 + retests * 0.5 + tasksActive + overdue;
      return { person: p, inQa, sentBack, bugsToFix: bugsToFix.length, blocking, reviews, retests, tasks: tasks.length, tasksActive, overdue, score };
    });
  const busy = rows.map((r) => r.score).filter((n) => n > 0).sort((a, b) => a - b);
  const median = busy.length ? busy[Math.floor(busy.length / 2)] : 0;
  return rows
    .map((r) => ({ ...r, level: loadLevel(r.score, median) }))
    .sort((a, b) => b.score - a.score || a.person.name.localeCompare(b.person.name));
}

/* ---------- needs attention (what to do now) ----------
   item: { id, level: 'over'|'warn'|'info', count, title, detail, action: { label, release?, page? } } */
function oldestRelease(list) {
  return list.slice().sort((a, b) => new Date(statusSince(a)) - new Date(statusSince(b)))[0];
}
function releaseItem(ctx, id, level, list, title, detail, page = 'releases') {
  if (!list.length) return null;
  const r = oldestRelease(list);
  return {
    id, level, count: list.length, title,
    detail: `${detail} Oldest: ${releaseLabel(ctx, r)}, ${ageText(ageDays(statusSince(r), ctx.now))}.`,
    action: list.length === 1 ? { label: 'Open build', release: r.id } : { label: 'View builds', page },
  };
}
function bugItem(ctx, id, level, list, title, detail) {
  if (!list.length) return null;
  const b = list.slice().sort((x, y) => (SEV_RANK[x.severity] ?? 3) - (SEV_RANK[y.severity] ?? 3) || new Date(x.createdAt) - new Date(y.createdAt))[0];
  return {
    id, level, count: list.length, title,
    detail: `${detail} ${list.length === 1 ? '' : 'Most urgent: '}"${b.title}" (${releaseLabel(ctx, ctx.releaseById[b.releaseId] || {})}).`,
    action: list.length === 1 ? { label: 'Open bug', release: b.releaseId } : { label: 'View bugs', page: 'bugs' },
  };
}
function taskItem(id, level, list, title, detail) {
  if (!list.length) return null;
  return { id, level, count: list.length, title, detail: `${detail} First: "${list[0].title}".`, action: { label: 'Open WBS', page: list[0].kind === 'cms' ? 'projecthub' : 'wbs' } };
}
const RANK = { over: 0, warn: 1, info: 2 };
const finish = (items) => items.filter(Boolean).sort((a, b) => RANK[a.level] - RANK[b.level]);

export function attentionForAdmin(ctx, { teams = [], health, people }) {
  const overSla = ctx.activeReleases.filter((r) => slaLevel(r.status, statusSince(r)) === 'over');
  const unassigned = ctx.activeReleases.filter((r) => r.status === 'qa_pending' && !r.assignedQa);
  const atRisk = health.rows.filter((r) => r.status.label === 'At risk');
  const agingBugs = ctx.activeBugs.filter((b) => bugSlaLevel(b.status, b.createdAt) === 'over');
  const pendingTl = ctx.activeBugs.filter((b) => b.status === 'pending_tl');
  const overloaded = people.filter((p) => p.level.label === 'Overloaded');
  const qaByTeam = new Set(ctx.profiles.filter((p) => p.role === 'QA').map((p) => p.teamId));
  const noQa = teams.filter((t) => !qaByTeam.has(t.id) && ctx.activeReleases.some((r) => ctx.projectById[r.projectId]?.teamId === t.id && (r.status === 'qa_pending' || r.status === 'qa_in_progress')));
  const overdueTasks = ctx.tasks.filter((t) => isOverdue(t, ctx.now));
  return finish([
    atRisk.length && { id: 'risk', level: 'over', count: atRisk.length, title: `${plural(atRisk.length, 'project')} at risk`, detail: `They have critical or major bugs still open: ${atRisk.slice(0, 3).map((r) => r.project.name).join(', ')}${atRisk.length > 3 ? '…' : ''}.`, action: { label: 'See projects', page: 'projecthub' } },
    releaseItem(ctx, 'sla', 'over', overSla, `${plural(overSla.length, 'build')} waiting too long in QA`, 'Past the QA time limit (24h to start, 72h to test).'),
    noQa.length && { id: 'noqa', level: 'over', count: noQa.length, title: `${plural(noQa.length, 'team')} without a QA tester`, detail: `${noQa.map((t) => t.name).join(', ')} ${noQa.length === 1 ? 'has' : 'have'} builds waiting but no one to test them.`, action: { label: 'Manage teams', page: 'teams' } },
    releaseItem(ctx, 'unassigned', 'warn', unassigned, `${plural(unassigned.length, 'build')} with no tester assigned`, 'Nobody has picked these up yet.'),
    bugItem(ctx, 'aging', 'warn', agingBugs, `${plural(agingBugs.length, 'bug')} open for more than 5 days`, 'Past the bug fix time limit.'),
    overloaded.length && { id: 'load', level: 'warn', count: overloaded.length, title: `${plural(overloaded.length, 'person', 'people')} overloaded`, detail: `${overloaded.slice(0, 3).map((w) => w.person.name).join(', ')}${overloaded.length > 3 ? ' and others' : ''}: well over 2× the typical load. Consider moving work to someone with room.`, action: { label: 'See users', page: 'users' } },
    taskItem('tasks', 'warn', overdueTasks, `${plural(overdueTasks.length, 'task')} past their due date`, 'Across all projects.'),
    bugItem(ctx, 'tl', 'info', pendingTl, `${plural(pendingTl.length, 'bug decision')} waiting for Team Leads`, 'Developers marked these as not a bug, duplicate or out of scope.'),
  ]);
}

export function attentionForLead(ctx, { me, people }) {
  const pendingTl = ctx.activeBugs.filter((b) => b.status === 'pending_tl');
  const sentBack = ctx.activeReleases.filter((r) => r.status === 'sent_back');
  const overSla = ctx.activeReleases.filter((r) => slaLevel(r.status, statusSince(r)) === 'over');
  const unassigned = ctx.activeReleases.filter((r) => r.status === 'qa_pending' && !r.assignedQa);
  const disputed = ctx.activeBugs.filter((b) => b.status === 'disputed');
  const blocking = ctx.activeBugs.filter(isBlockingBug).filter(needsDevWork);
  const overdueTasks = sortTasks(ctx.tasks.filter((t) => isOverdue(t, ctx.now)), ctx.now);
  const blockedTasks = ctx.tasks.filter((t) => t.state === 'blocked');
  const overloaded = people.filter((p) => p.level.label === 'Overloaded' && p.person.id !== me.id);
  const idle = people.filter((p) => p.level.label === 'Available' && p.person.id !== me.id);
  return finish([
    bugItem(ctx, 'tl', 'over', pendingTl, `${plural(pendingTl.length, 'bug decision')} waiting for you`, 'A developer says these are not bugs, duplicates or out of scope. Approve or reject.'),
    bugItem(ctx, 'blocking', 'over', blocking, `${plural(blocking.length, 'blocking bug')} not fixed yet`, 'Critical or major bugs stop a build from being approved.'),
    releaseItem(ctx, 'sla', 'over', overSla, `${plural(overSla.length, 'build')} waiting too long in QA`, 'Past the QA time limit.'),
    releaseItem(ctx, 'sentback', 'warn', sentBack, `${plural(sentBack.length, 'build')} sent back to the team`, 'QA returned these. A fixed build needs to be submitted.'),
    releaseItem(ctx, 'unassigned', 'warn', unassigned, `${plural(unassigned.length, 'build')} with no tester`, 'Assign a QA tester so testing can start.'),
    bugItem(ctx, 'disputed', 'warn', disputed, `${plural(disputed.length, 'bug')} need clarification`, 'Developer and QA disagree. They may need your call.'),
    taskItem('tasks', 'warn', overdueTasks, `${plural(overdueTasks.length, 'task')} overdue`, 'Past their estimated completion date.'),
    taskItem('blocked', 'warn', blockedTasks, `${plural(blockedTasks.length, 'task')} blocked`, 'Someone is stuck and may need help.'),
    overloaded.length && { id: 'load', level: 'warn', count: overloaded.length, title: `${plural(overloaded.length, 'team member')} overloaded`, detail: `${overloaded.map((w) => w.person.name).slice(0, 3).join(', ')}${idle.length ? `. Available: ${idle.map((w) => w.person.name).slice(0, 3).join(', ')}` : ''}.`, action: { label: 'See team', page: 'users' } },
  ]);
}

export function attentionForDeveloper(ctx, { me }) {
  const mine = (b) => bugOwnerId(ctx, b) === me.id;
  const myBugs = ctx.activeBugs.filter(mine);
  const blocking = myBugs.filter((b) => needsDevWork(b) && isBlockingSeverity(b.severity));
  const minor = myBugs.filter((b) => needsDevWork(b) && !isBlockingSeverity(b.severity));
  const disputed = myBugs.filter((b) => b.status === 'disputed');
  const sentBack = ctx.activeReleases.filter((r) => r.submittedById === me.id && r.status === 'sent_back');
  const myTasks = ctx.tasks.filter((t) => t.assignedTo === me.id);
  const overdue = sortTasks(myTasks.filter((t) => isOverdue(t, ctx.now)), ctx.now);
  const soon = sortTasks(myTasks.filter((t) => dueSoon(t, ctx.now)), ctx.now);
  const blocked = myTasks.filter((t) => t.state === 'blocked');
  const waiting = ctx.activeReleases.filter((r) => r.submittedById === me.id && slaLevel(r.status, statusSince(r)) === 'over');
  return finish([
    bugItem(ctx, 'blocking', 'over', blocking, `Fix ${plural(blocking.length, 'blocking bug')}`, 'Critical or major bugs on your builds. Your build cannot be approved until they are fixed.'),
    releaseItem(ctx, 'sentback', 'over', sentBack, `${plural(sentBack.length, 'build')} sent back to you`, 'Fix the reported bugs and submit a new build.'),
    taskItem('overdue', 'over', overdue, `${plural(overdue.length, 'task')} overdue`, 'Past the estimated completion date. Finish it or update the date.'),
    bugItem(ctx, 'disputed', 'warn', disputed, `Reply on ${plural(disputed.length, 'bug')} that need clarification`, 'QA is waiting for your answer.'),
    bugItem(ctx, 'minor', 'warn', minor, `Fix ${plural(minor.length, 'minor bug')}`, 'They do not block approval, but they still count against your builds.'),
    taskItem('blocked', 'warn', blocked, `${plural(blocked.length, 'task')} marked blocked`, 'Tell your Team Lead what you need.'),
    taskItem('soon', 'info', soon, `${plural(soon.length, 'task')} due this week`, 'Plan for these next.'),
    releaseItem(ctx, 'waiting', 'info', waiting, `${plural(waiting.length, 'build')} waiting long for QA`, 'Not your action, but you may want to nudge QA.'),
  ]);
}

export function attentionForQa(ctx, { me }) {
  const mineOpen = ctx.activeReleases.filter((r) => r.assignedQa === me.id && (r.status === 'qa_pending' || r.status === 'qa_in_progress'));
  const overSla = mineOpen.filter((r) => slaLevel(r.status, statusSince(r)) === 'over');
  const unassigned = ctx.activeReleases.filter((r) => r.status === 'qa_pending' && !r.assignedQa);
  const retest = ctx.activeBugs.filter((b) => b.status === 'fixed' && (ctx.releaseById[b.releaseId]?.assignedQa === me.id || b.createdById === me.id));
  const disputed = ctx.activeBugs.filter((b) => b.status === 'disputed' && b.createdById === me.id);
  const signoff = ctx.activeReleases.filter((r) => r.assignedQa === me.id && r.status === 'qa_done');
  return finish([
    releaseItem(ctx, 'sla', 'over', overSla, `${plural(overSla.length, 'build')} of yours past the QA time limit`, 'Start or finish testing these first.'),
    bugItem(ctx, 'retest', 'warn', retest, `Re-test ${plural(retest.length, 'fixed bug')}`, 'Developers say these are fixed. Verify or reopen them.'),
    bugItem(ctx, 'disputed', 'warn', disputed, `${plural(disputed.length, 'bug')} you reported need clarification`, 'The developer has a question.'),
    releaseItem(ctx, 'queue', 'warn', unassigned, `${plural(unassigned.length, 'build')} waiting for a tester`, 'Nobody has picked these up yet.'),
    releaseItem(ctx, 'signoff', 'info', signoff, `${plural(signoff.length, 'build')} tested, awaiting sign-off`, 'Approve or send back.'),
  ]);
}

export const STATUS_LABEL = (s) => STATUSES[s]?.label || s;

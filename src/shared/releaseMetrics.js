/* Shared release metrics — cycle cohort, QA rates, bottlenecks, workload.
   All computed from the SAME filtered release + bug datasets so every widget
   reconciles. */
import { isActiveStatus, slaLevel } from '@/constants.js';
import { avgDaysBetween, statusSince } from '@shared/ui-kit.jsx';
import { isActiveBug } from '@/constants.js';
import { elapsedMs } from '@/api/timeLogs.js';

const isBlocking = (b) => isActiveBug(b) && (b.severity === 'critical' || b.severity === 'major');

// QA quality + velocity. One consistent denominator ("decided") for all rates.
export function computeReleaseMetrics(releasesF, bugsF, ctx = {}) {
  const releaseById = ctx.releaseById || {};
  const blocked = new Set(bugsF.filter(isBlocking).map((b) => b.releaseId));

  const submitted = releasesF.length;
  const approved = releasesF.filter((r) => r.status === 'approved' && !blocked.has(r.id)).length;
  // sent_back, or "approved" releases still carrying blocking bugs, count as not-passed
  const rejected = releasesF.filter(
    (r) => r.status === 'sent_back' || (r.status === 'approved' && blocked.has(r.id))
  ).length;
  const decided = approved + rejected;
  const passRate = decided ? Math.round((approved / decided) * 100) : 0;
  const rejRate = decided ? Math.round((rejected / decided) * 100) : 0;

  // one cohort for ALL cycle stages → cycleDays ≈ assignTime + qaTime
  const cohort = releasesF.filter(
    (r) => r.status === 'approved' && r.createdAt && r.qaAssignedAt && r.qaCompletedAt
  );
  const cycleDays = avgDaysBetween(cohort, 'createdAt', 'qaCompletedAt');
  const assignTime = avgDaysBetween(cohort, 'createdAt', 'qaAssignedAt');
  const qaTime = avgDaysBetween(cohort, 'qaAssignedAt', 'qaCompletedAt');

  const prodBugs = bugsF.filter(
    (b) => (releaseById[b.releaseId]?.environment || 'Production') === 'Production'
  ).length;
  const carriedBugs = bugsF.filter((b) => b.carriedForward).length;
  const carryRate = bugsF.length ? Math.round((carriedBugs / bugsF.length) * 100) : 0;
  const verifiedIters = bugsF.filter((b) => b.status === 'verified').map((b) => b.iteration || 1);
  const avgIterations = verifiedIters.length
    ? (verifiedIters.reduce((s, n) => s + n, 0) / verifiedIters.length).toFixed(1)
    : null;

  return {
    blocked,
    submitted,
    approved,
    rejected,
    decided,
    passRate,
    rejRate,
    cohort,
    cycleDays,
    assignTime,
    qaTime,
    prodBugs,
    carriedBugs,
    carryRate,
    avgIterations,
  };
}

// Bottlenecks aggregated BY PROJECT first (deduped), then release detail.
export function computeBottlenecks(releasesF, bugsF, ctx = {}) {
  const { projectsById = {}, profilesById = {}, profiles = [], teams = [], teamFilter = 'all' } = ctx;
  const OPEN_BUG_THRESHOLD = 5;
  const BLOCKING_THRESHOLD = 3;
  const out = [];

  // SLA-overdue releases (single aggregated line)
  const overSla = releasesF.filter((r) => slaLevel(r.status, statusSince(r)) === 'over');
  if (overSla.length)
    out.push({ level: 'over', text: `${overSla.length} release(s) past their SLA (Pending / In QA).` });

  // active bugs per release, then aggregate per project
  const activeByRelease = {};
  const blockingByRelease = {};
  bugsF.filter(isActiveBug).forEach((b) => {
    activeByRelease[b.releaseId] = (activeByRelease[b.releaseId] || 0) + 1;
    if (b.severity === 'critical' || b.severity === 'major')
      blockingByRelease[b.releaseId] = (blockingByRelease[b.releaseId] || 0) + 1;
  });
  const byProject = {}; // projectId -> { total, releases:[{version, n}] }
  releasesF.forEach((r) => {
    const n = activeByRelease[r.id] || 0;
    if (!n) return;
    const p = (byProject[r.projectId] = byProject[r.projectId] || { total: 0, releases: [] });
    p.total += n;
    p.releases.push({ version: r.version, n, blocking: blockingByRelease[r.id] || 0 });
  });
  Object.entries(byProject).forEach(([pid, info]) => {
    const name = projectsById[pid]?.name || 'A project';
    const worst = info.releases.slice().sort((a, b) => b.n - a.n)[0];
    const blocking = info.releases.reduce((s, r) => s + r.blocking, 0);
    if (info.total >= OPEN_BUG_THRESHOLD || blocking >= BLOCKING_THRESHOLD) {
      out.push({
        level: 'over',
        text:
          `${name} — ${info.total} active bug${info.total === 1 ? '' : 's'} across ${info.releases.length} release${info.releases.length === 1 ? '' : 's'}` +
          (worst ? ` (worst: v${worst.version} — ${worst.n})` : '') +
          (blocking ? ` · ${blocking} Major/Critical` : ''),
      });
    }
  });

  // bugs needing clarification (single aggregated line)
  const disputed = bugsF.filter((b) => b.status === 'disputed');
  if (disputed.length) {
    const rels = new Set(disputed.map((b) => b.releaseId)).size;
    out.push({
      level: 'warn',
      text: `${disputed.length} bug(s) need clarification across ${rels} release(s) — blocked communication.`,
    });
  }

  // reviewer overload
  const reviewerLoad = {};
  releasesF.forEach((r) => {
    if (r.assignedQa && (r.status === 'qa_pending' || r.status === 'qa_in_progress'))
      reviewerLoad[r.assignedQa] = (reviewerLoad[r.assignedQa] || 0) + 1;
  });
  Object.entries(reviewerLoad)
    .filter(([, n]) => n > 3)
    .forEach(([id, n]) =>
      out.push({ level: 'warn', text: `${profilesById[id]?.name || 'A tester'} — ${n} release${n === 1 ? '' : 's'} awaiting review` })
    );

  // teams with releases waiting but no QA
  const qaCountByTeam = {};
  profiles.forEach((p) => {
    if (p.role === 'QA') qaCountByTeam[p.teamId] = (qaCountByTeam[p.teamId] || 0) + 1;
  });
  (teamFilter === 'all' ? teams : teams.filter((t) => t.id === teamFilter)).forEach((t) => {
    const waiting = releasesF.some(
      (r) => projectsById[r.projectId]?.teamId === t.id && (r.status === 'qa_pending' || r.status === 'qa_in_progress')
    );
    if (waiting && !qaCountByTeam[t.id])
      out.push({ level: 'over', text: `${t.name} has releases waiting but no QA testers.` });
  });

  // developer overload (active bugs on their releases)
  const devOpen = {};
  bugsF.filter(isActiveBug).forEach((b) => {
    const dev = releasesF.find((r) => r.id === b.releaseId)?.submittedById;
    if (dev) devOpen[dev] = (devOpen[dev] || 0) + 1;
  });
  Object.entries(devOpen)
    .filter(([, n]) => n > 8)
    .forEach(([id, n]) =>
      out.push({ level: 'warn', text: `${profilesById[id]?.name || 'A developer'} — ${n} active bug${n === 1 ? '' : 's'} assigned` })
    );

  return out;
}

// Role-based workload — no mixed OR: QA counts bugs they filed; developers
// count active bugs on the releases they own.
export function computeWorkload(profiles, releasesF, bugsF, teamFilter = 'all') {
  return profiles
    .filter((p) => p.role !== 'Admin' && (teamFilter === 'all' || p.teamId === teamFilter))
    .map((m) => {
      const mineReleaseIds = new Set(releasesF.filter((r) => r.submittedById === m.id).map((r) => r.id));
      const openBugs =
        m.role === 'QA'
          ? bugsF.filter((b) => b.createdById === m.id && isActiveBug(b)).length
          : bugsF.filter((b) => mineReleaseIds.has(b.releaseId) && isActiveBug(b)).length;
      return {
        m,
        activeReleases: releasesF.filter((r) => r.submittedById === m.id && isActiveStatus(r.status)).length,
        pendingReviews: releasesF.filter(
          (r) => r.assignedQa === m.id && (r.status === 'qa_pending' || r.status === 'qa_in_progress')
        ).length,
        openBugs,
      };
    })
    .filter((w) => w.activeReleases || w.pendingReviews || w.openBugs)
    .sort((a, b) => b.pendingReviews + b.activeReleases - (a.pendingReviews + a.activeReleases));
}

/* Per-project bird's-eye summary for the Projects grid: build count, latest
   build's QA status, open / resolved bugs, and one derived project status.
   Bugs map to projects through their release. */
const QA_OPEN = ['qa_pending', 'qa_in_progress', 'qa_done'];
export function computeProjectSummaries(releases, bugs) {
  const out = {};
  const get = (pid) =>
    (out[pid] = out[pid] || { builds: 0, latest: null, inQa: 0, openBugs: 0, resolvedBugs: 0, blockingBugs: 0 });
  const projectOfRelease = {};
  const ts = (r) => new Date(r.createdAt || r.date || 0).getTime();

  releases.forEach((r) => {
    if (!r.projectId) return;
    projectOfRelease[r.id] = r.projectId;
    const s = get(r.projectId);
    s.builds += 1;
    if (QA_OPEN.includes(r.status)) s.inQa += 1;
    // latest build — prefer one still in play over a superseded (closed) one
    const cur = s.latest;
    const better =
      !cur ||
      (cur.status === 'closed' && r.status !== 'closed') ||
      ((cur.status === 'closed') === (r.status === 'closed') && ts(r) > ts(cur));
    if (better) s.latest = r;
  });

  bugs.forEach((b) => {
    const pid = projectOfRelease[b.releaseId];
    if (!pid) return;
    const s = get(pid);
    if (isActiveBug(b)) {
      s.openBugs += 1;
      if (isBlocking(b)) s.blockingBugs += 1;
    } else s.resolvedBugs += 1;
  });

  Object.values(out).forEach((s) => {
    s.status =
      !s.builds ? { label: 'No builds', tone: 'neutral' }
      : s.blockingBugs ? { label: 'At risk', tone: 'danger' }
      : s.inQa ? { label: 'In QA', tone: 'info' }
      : s.latest?.status === 'sent_back' ? { label: 'Needs fixes', tone: 'warning' }
      : s.latest?.status === 'approved' ? { label: 'On track', tone: 'success' }
      : { label: 'Idle', tone: 'neutral' };
  });
  return out;
}

/* Per-user overview for the Users grid. Projects = membership ∪ projects they
   logged time on. Hours include running/paused timers at their current elapsed.
   Developers are measured on the builds they submitted; QA on the builds they
   reviewed and the bugs they filed (same split as computeWorkload). */
const QA_REVIEWED = ['qa_done', 'approved', 'sent_back', 'closed'];
export function computeUserSummaries(profiles, { releases = [], bugs = [], projectMembers = [], timeLogs = [] } = {}) {
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  const out = {};
  profiles.forEach((p) => {
    out[p.id] = { projects: new Set(), hours: 0, hoursWeek: 0, builds: 0, openBugsOnBuilds: 0, passRate: null, reviewed: 0, pendingReviews: 0, bugsFiled: 0 };
  });
  projectMembers.forEach((m) => out[m.userId]?.projects.add(m.projectId));
  timeLogs.forEach((l) => {
    const s = out[l.userId];
    if (!s) return;
    const h = l.hours != null ? l.hours : elapsedMs(l) / 3600000;
    s.hours += h;
    if (l.logDate >= weekAgo) s.hoursWeek += h;
    if (l.projectId) s.projects.add(l.projectId);
  });

  const bugsByRelease = {};
  bugs.forEach((b) => (bugsByRelease[b.releaseId] = bugsByRelease[b.releaseId] || []).push(b));
  const mine = {};
  releases.forEach((r) => {
    if (out[r.submittedById]) (mine[r.submittedById] = mine[r.submittedById] || []).push(r);
    const qa = out[r.assignedQa];
    if (qa) {
      if (QA_REVIEWED.includes(r.status)) qa.reviewed += 1;
      else if (r.status === 'qa_pending' || r.status === 'qa_in_progress') qa.pendingReviews += 1;
    }
  });
  Object.entries(mine).forEach(([uid, rs]) => {
    const s = out[uid];
    const bs = rs.flatMap((r) => bugsByRelease[r.id] || []);
    const m = computeReleaseMetrics(rs, bs);
    s.builds = rs.length;
    s.openBugsOnBuilds = bs.filter(isActiveBug).length;
    s.passRate = m.decided ? m.passRate : null;
  });
  bugs.forEach((b) => {
    if (out[b.createdById]) out[b.createdById].bugsFiled += 1;
  });

  Object.values(out).forEach((s) => {
    s.projectCount = s.projects.size;
    s.hours = Math.round(s.hours * 10) / 10;
    s.hoursWeek = Math.round(s.hoursWeek * 10) / 10;
  });
  return out;
}

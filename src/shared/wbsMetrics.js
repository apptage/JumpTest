/* WBS metrics for the Manager Command Center — completion %, blocked work, and
   platform-milestone risk, plus a composite delivery-health score.

   Inputs are the camelCase-mapped shapes from api.js:
     wbs item    → { platformType, module, status, type, estimatedCompletionDate, priority, assignedTo }
     platform tgt→ { platformType, completionDate, deploymentDate }   // 'YYYY-MM-DD' | ''
   status keys: not_started | in_progress | in_qa | completed | blocked. */

import { WBS_TRACK_ORDER, wbsTrackLabel, isActiveBug, isSqaTrack, isBlockingSeverity, formatVersion } from '@/constants.js';

const workItems = (items) => (items || []).filter((i) => i.type !== 'milestone');

/* done/total as a %, never rounding up to a false 100: 223 of 224 reads 99%. */
export function capPct(done, total) {
  if (!total) return 0;
  return done >= total ? 100 : Math.min(99, Math.round((done / total) * 100));
}

/* Bugs that count toward completion: skip superseded (closed) releases, whose
   leftover bugs would otherwise hold a project below 100% forever. */
export function liveBugs(bugs, releaseById) {
  return (bugs || []).filter((b) => releaseById[b.releaseId]?.status !== 'closed');
}

/* The ONE definition of how complete a project is: every story point on every
   track, plus every reported bug. Each counts once, so client feedback or a new
   bug pulls the number down until it's actually closed. */
export function computeWorkCompletion(items, bugs = []) {
  const work = workItems(items);
  const done = work.filter((i) => i.status === 'completed').length;
  const resolved = (bugs || []).filter((b) => !isActiveBug(b)).length;
  const bugTotal = (bugs || []).length;
  const total = work.length + bugTotal;
  const finished = done + resolved;
  const byTrack = WBS_TRACK_ORDER.map((track) => {
    const rows = work.filter((i) => (i.track || 'scope') === track);
    const d = rows.filter((i) => i.status === 'completed').length;
    return { track, total: rows.length, done: d, pct: capPct(d, rows.length) };
  });
  // one row per interface, whichever tab its work sits on. Spelling variants of a
  // name merge. Untagged work reads as its own track (Design, Marketing, …).
  const interfaces = new Map();
  work.forEach((i) => {
    const name = String(i.platformType ?? i.platform ?? '').trim();
    const track = i.track || 'scope';
    const label = name || (track === 'scope' ? 'General' : wbsTrackLabel(track));
    const key = label.toLowerCase();
    const row = interfaces.get(key) || { key, label, total: 0, done: 0 };
    row.total += 1;
    if (i.status === 'completed') row.done += 1;
    interfaces.set(key, row);
  });
  const byInterface = [...interfaces.values()].map((r) => ({ ...r, pct: capPct(r.done, r.total) }));
  return { pct: capPct(finished, total), total, done: finished, open: total - finished, byTrack, byInterface, bugs: { total: bugTotal, resolved, open: bugTotal - resolved } };
}

/* QA status of one story point → { key, detail, canBulkApprove }.
   canBulkApprove = only waiting on SQA's sign-off, so "Approve all" may take it.
   Anything failed, being tested or never submitted needs an individual decision.
   links = its releases [{ version, status, createdAt, qaCompletedAt }];
   openBugs = its open bugs. The newest release still in play decides; a release
   being tested outranks an earlier approval, because that's the live question. */
export function wbsQaStatus(item, links = [], openBugs = []) {
  if (!isSqaTrack(item.track)) return { key: 'not_required', detail: 'Design and marketing work isn’t tested by SQA.' };
  const byNewest = links.slice().sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  const latest = byNewest.find((l) => l.status !== 'closed') || byNewest[0];
  const on = (l) => (l ? `on ${formatVersion(l.version)}` : '');
  const blocking = openBugs.filter((b) => isBlockingSeverity(b.severity)).length;
  if (blocking) return { key: 'failed', detail: `${blocking} open Major/Critical bug${blocking === 1 ? '' : 's'}.` };
  if (latest?.status === 'qa_pending') return { key: 'awaiting', detail: `Waiting for QA ${on(latest)}.` };
  if (latest?.status === 'qa_in_progress') return { key: 'testing', detail: `Being tested ${on(latest)}.` };
  if (latest?.status === 'qa_done') return { key: 'review', detail: `Tested ${on(latest)}, awaiting the verdict.` };
  if (item.status === 'completed') {
    if (item.qaApprovedAt) return { key: 'approved', detail: 'Signed off by SQA in the WBS.', at: item.qaApprovedAt, by: item.qaApprovedBy };
    const approved = byNewest.find((l) => l.status === 'approved' || (l.status === 'closed' && l.qaCompletedAt));
    if (latest?.status === 'sent_back') return { key: 'passed_sent_back', detail: `No serious bugs, but ${formatVersion(latest.version)} was sent back rather than approved.` };
    if (approved) return { key: 'approved', detail: `Approved ${on(approved)}.`, at: approved.qaCompletedAt };
    return { key: 'no_record', detail: 'Marked Completed with no release or SQA sign-off on record.', canBulkApprove: true };
  }
  if (latest?.status === 'sent_back') return { key: 'sent_back', detail: `${formatVersion(latest.version)} was sent back.` };
  if (latest?.status === 'approved') return { key: 'retest', detail: `Approved ${on(latest)}, then reopened.` };
  if (item.status === 'in_qa') return { key: 'awaiting', detail: 'Waiting for SQA to approve.', canBulkApprove: !latest };
  return { key: 'not_submitted', detail: 'Not submitted for QA yet.' };
}

/* Completion % for a set of WBS items (milestones excluded). */
export function wbsPct(items) {
  const work = workItems(items);
  if (!work.length) return 0;
  return capPct(work.filter((i) => i.status === 'completed').length, work.length);
}

/* Days from today to an ISO date ('YYYY-MM-DD'); negative = in the past. null if unparseable. */
function daysUntil(iso, todayMs) {
  if (!iso) return null;
  const ms = Date.parse(`${iso}T00:00`);
  if (Number.isNaN(ms)) return null;
  return Math.round((ms - todayMs) / 86_400_000);
}

/* Milestone risk for one platform target vs today + that platform's completion.
   → 'none' (no dates) | 'on_track' | 'at_risk' (≤7 days out, not done) | 'overdue' */
export function milestoneRiskFor(target, platformPct, todayMs) {
  if (!target) return 'none';
  const done = platformPct >= 100;
  let worst = 'none';
  for (const iso of [target.completionDate, target.deploymentDate]) {
    const d = daysUntil(iso, todayMs);
    if (d == null) continue;
    let r;
    if (done) r = 'on_track';
    else if (d < 0) r = 'overdue';
    else if (d <= 7) r = 'at_risk';
    else r = 'on_track';
    const rank = { none: 0, on_track: 1, at_risk: 2, overdue: 3 };
    if (rank[r] > rank[worst]) worst = r;
  }
  return worst;
}

/* Health for ONE project's WBS. items/targets are that project's rows; bugs are
   its live bugs (see liveBugs). pct is whole-project completion; platform and
   module percentages stay story points only. */
export function computeProjectWbsHealth(items, targets = [], todayMs = 0, bugs = []) {
  const work = workItems(items);
  const total = work.length;
  const completed = work.filter((i) => i.status === 'completed').length;
  const blocked = work.filter((i) => i.status === 'blocked').length;
  const inQa = work.filter((i) => i.status === 'in_qa').length;
  const completion = computeWorkCompletion(items, bugs);
  const pct = completion.pct;

  // rollup by module (for "top complete / top blocked")
  const modMap = new Map();
  work.forEach((i) => {
    const key = i.module || 'General';
    const m = modMap.get(key) || { module: key, total: 0, completed: 0, blocked: 0 };
    m.total += 1;
    if (i.status === 'completed') m.completed += 1;
    if (i.status === 'blocked') m.blocked += 1;
    modMap.set(key, m);
  });
  const byModule = [...modMap.values()].map((m) => ({ ...m, pct: capPct(m.completed, m.total) }));

  // rollup by platform + milestone risk
  const platMap = new Map();
  work.forEach((i) => {
    const key = i.platformType || 'Ungrouped';
    const p = platMap.get(key) || { platform: key, total: 0, completed: 0 };
    p.total += 1;
    if (i.status === 'completed') p.completed += 1;
    platMap.set(key, p);
  });
  const norm = (s) => String(s || '').trim().toLowerCase();
  const byPlatform = [...platMap.values()].map((p) => {
    const ppct = capPct(p.completed, p.total);
    const target = (targets || []).find((t) => norm(t.platformType) === norm(p.platform)) || null;
    return { ...p, pct: ppct, target, risk: milestoneRiskFor(target, ppct, todayMs) };
  });
  // worst milestone risk across the project's platforms
  const rank = { none: 0, on_track: 1, at_risk: 2, overdue: 3 };
  const milestoneRisk = byPlatform.reduce((worst, p) => (rank[p.risk] > rank[worst] ? p.risk : worst), 'none');

  return { pct, total, completed, blocked, inQa, byModule, byPlatform, milestoneRisk, completion, hasWbs: total > 0 };
}

/* Org-wide WBS summary across projects. `perProject` = [{ projectId, name, health }]. */
export function computeOrgWbsSummary(perProject = []) {
  const wbsProjects = perProject.filter((p) => p.health?.hasWbs);
  const avgPct = wbsProjects.length
    ? Math.round(wbsProjects.reduce((a, p) => a + p.health.pct, 0) / wbsProjects.length)
    : 0;
  const atRiskProjects = wbsProjects.filter(
    (p) => p.health.milestoneRisk === 'overdue' || p.health.milestoneRisk === 'at_risk' || p.health.blocked > 0
  );
  const totalBlocked = wbsProjects.reduce((a, p) => a + p.health.blocked, 0);
  return { avgPct, wbsProjectCount: wbsProjects.length, atRiskProjects, totalBlocked };
}

/* Composite delivery health — WBS completion is the PRIMARY signal; serious
   quality/schedule problems escalate it. Returns { level, label, tone }.
   WBS grading (only when the project HAS a WBS — wbsPct != null; a project with
   no WBS is judged on quality/schedule only, never penalized for missing one):
     ≥ 75% → on track   ·   30–74% → behind   ·   < 30% (incl 0%) → far behind
   0% now counts (an item-bearing WBS at 0% done is 'far behind', not ignored). */
export function computeCompositeHealth({ wbsPct = null, openBugs = 0, critical = 0, passRate = null, milestoneRisk = 'none' } = {}) {
  // base level from WBS completion: 0 healthy | 1 attention | 2 at-risk
  let base;
  if (wbsPct == null) base = 0;          // no WBS on this project
  else if (wbsPct >= 75) base = 0;       // on track
  else if (wbsPct >= 30) base = 1;       // behind → needs attention
  else base = 1;                         // far behind (0–29%) → attention (not auto-red)

  // serious problems escalate the level (≥2 problems → jump two levels)
  let esc = 0;
  if (critical > 0) esc += 1;
  if (openBugs >= 15) esc += 1;
  if (milestoneRisk === 'overdue') esc += 1;
  if (passRate != null && passRate < 55) esc += 1;

  const lvl = Math.min(2, base + (esc >= 2 ? 2 : esc >= 1 ? 1 : 0));
  if (lvl >= 2) return { level: 'at_risk', label: 'At risk', tone: 'danger' };
  if (lvl >= 1) return { level: 'attention', label: 'Needs attention', tone: 'warning' };
  return { level: 'healthy', label: 'Healthy', tone: 'success' };
}

/* Plain-language milestone-risk label + tone. */
export function milestoneLabel(risk) {
  return (
    { overdue: { label: 'Overdue', tone: 'danger' }, at_risk: { label: 'At risk', tone: 'warning' }, on_track: { label: 'On track', tone: 'success' }, none: { label: '—', tone: 'neutral' } }[
      risk
    ] || { label: '—', tone: 'neutral' }
  );
}

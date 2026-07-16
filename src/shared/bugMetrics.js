/* Shared bug aggregation + aging. All bug KPIs derive from a single filtered
   dataset (filterBugs), never from a raw bugs array. */
import { isActiveBug, isClosedBug, bugSlaLevel, SEVERITY_ORDER, BUG_STATUS_ORDER } from '@/constants.js';

export { isActiveBug, isClosedBug };

// Totals + breakdowns for a filtered bug set. Invariant: active + closed = total.
export function aggregateBugMetrics(bugsF) {
  const byStatus = {};
  BUG_STATUS_ORDER.forEach((s) => (byStatus[s] = 0));
  const bySeverity = {};
  SEVERITY_ORDER.forEach((s) => (bySeverity[s] = 0));
  let active = 0;
  let closed = 0;
  bugsF.forEach((b) => {
    byStatus[b.status] = (byStatus[b.status] || 0) + 1;
    bySeverity[b.severity] = (bySeverity[b.severity] || 0) + 1;
    if (isClosedBug(b)) closed += 1;
    else active += 1;
  });
  return { total: bugsF.length, active, closed, byStatus, bySeverity };
}

/* Workflow buckets — the ONE mapping from internal statuses to the words users
   see everywhere (Bugs page, Analytics, Manager dashboard). Groups by who holds
   the ball so a manager reads the pipeline in seconds:
     needsDev    — bugs still requiring developer work (open + in progress + needs clarification)
     awaitingQa  — bugs waiting on QA / Team-Lead verification (fixed + pending TL)
     verified    — fully verified / closed
   needsDev + awaitingQa === active (not verified). */
export function bugWorkflow(m) {
  const s = m.byStatus || {};
  return {
    total: m.total,
    needsDev: (s.open || 0) + (s.in_progress || 0) + (s.disputed || 0),
    awaitingQa: (s.fixed || 0) + (s.pending_tl || 0),
    verified: s.verified || 0,
  };
}

// NOTE: dedup-by-bugKey aggregation was removed in the "one bug = one record"
// refactor (fixes15.sql). Each logical bug is now a single row, so counts come
// straight from aggregateBugMetrics — no dedup needed.

// Dev-only sanity check: totals must reconcile. Because every page derives from
// the same filterBugs() pipeline, identical filters yield identical datasets;
// this guards the aggregation invariants (active + closed = total, status sum = total).
export function assertBugReconcile(bugsF, label = '') {
  if (typeof import.meta === 'undefined' || !import.meta.env?.DEV) return;
  const m = aggregateBugMetrics(bugsF);
  const statusSum = Object.values(m.byStatus).reduce((s, n) => s + n, 0);
  if (m.active + m.closed !== m.total || statusSum !== m.total) {
    // eslint-disable-next-line no-console
    console.warn(`[metrics] bug reconcile FAILED (${label})`, { ...m, statusSum });
  }
}

// Aging = ACTIVE bugs from the ALREADY-FILTERED set that are at/over SLA,
// oldest first. Callers must pass the same filtered dataset the table uses.
export function agingBugs(bugsF, limit) {
  const a = bugsF
    .filter((b) => isActiveBug(b) && bugSlaLevel(b.status, b.createdAt))
    .sort((x, y) => new Date(x.createdAt).getTime() - new Date(y.createdAt).getTime());
  return limit ? a.slice(0, limit) : a;
}

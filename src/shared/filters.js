/* Single source of truth for bug + release filtering.
   Every page (Bugs, Analytics, dashboards) MUST filter through these functions
   so identical filters always yield identical datasets. No page-level custom
   filtering logic is allowed.

   TWO shared bug datasets — the only two that exist (see the app's scope model):
     • liveBugs (filterBugs)   — bugs on ACTIVE (non-closed) releases only. This
       is the Bugs page's operational working board. Because a bug MOVES to its
       current release under one-bug-one-record, a superseded build keeps only
       the verified bugs that were resolved there, which the live board hides.
     • historicalBugs          — bugs across ALL releases (active + closed). This
       is the Analytics dataset: complete project history. Note that ACTIVE bugs
       never sit on a closed release, so "Active Bugs" is identical in both; the
       datasets differ only by the resolved/verified bugs on superseded builds.

   Date semantics: bugs filtered by bug.createdAt, releases by release.date. A
   filter object may set any subset of keys; unset keys ('all' / '') don't
   constrain. Context supplies the release/project lookups a bug needs.
*/
import { isClosedStatus } from '@/constants.js';

const any = (v) => v == null || v === '' || v === 'all';

// shared predicate for everything EXCEPT the closed-release rule
function matchBug(b, rel, proj, f, term) {
  if (!any(f.status) && b.status !== f.status) return false;
  if (!any(f.severity) && b.severity !== f.severity) return false;
  if (!any(f.platform) && rel.platform !== f.platform) return false;
  if (!any(f.tag) && !(b.tags || []).includes(f.tag)) return false;
  if (!any(f.feature) && (b.feature || 'Unassigned') !== f.feature) return false;
  if (!any(f.project) && rel.projectId !== f.project) return false;
  if (!any(f.team) && (proj?.teamId || '') !== f.team) return false;
  if (!any(f.environment) && (rel.environment || 'Production') !== f.environment) return false;
  if (!any(f.developer) && rel.submittedById !== f.developer) return false;
  if (!any(f.qa) && rel.assignedQa !== f.qa) return false;
  if (f.from && (b.createdAt || '').slice(0, 10) < f.from) return false;
  if (f.to && (b.createdAt || '').slice(0, 10) > f.to) return false;
  if (term) {
    const name = proj?.name || '';
    if (!b.title.toLowerCase().includes(term) && !name.toLowerCase().includes(term)) return false;
  }
  return true;
}

// LIVE dataset — active (non-closed) releases only. Used by the Bugs page.
export function filterBugs(bugs, f = {}, ctx = {}) {
  const { releaseById = {}, projectById = {} } = ctx;
  const term = (f.search || '').trim().toLowerCase();
  return bugs.filter((b) => {
    const rel = releaseById[b.releaseId];
    if (!rel || isClosedStatus(rel.status)) return false;
    return matchBug(b, rel, projectById[rel.projectId], f, term);
  });
}

// HISTORICAL dataset — every release (active + closed). Used by Analytics.
export function historicalBugs(bugs, f = {}, ctx = {}) {
  const { releaseById = {}, projectById = {} } = ctx;
  const term = (f.search || '').trim().toLowerCase();
  return bugs.filter((b) => {
    const rel = releaseById[b.releaseId];
    if (!rel) return false;
    return matchBug(b, rel, projectById[rel.projectId], f, term);
  });
}

export function filterReleases(releases, f = {}, ctx = {}) {
  const { projectById = {} } = ctx;
  return releases.filter((r) => {
    const proj = projectById[r.projectId];
    if (!any(f.team) && (proj?.teamId || '') !== f.team) return false;
    if (!any(f.project) && r.projectId !== f.project) return false;
    if (!any(f.platform) && r.platform !== f.platform) return false;
    if (!any(f.environment) && (r.environment || 'Production') !== f.environment) return false;
    if (!any(f.developer) && r.submittedById !== f.developer) return false;
    if (!any(f.qa) && r.assignedQa !== f.qa) return false;
    if (f.version && f.version.trim() && !r.version.toLowerCase().includes(f.version.trim().toLowerCase()))
      return false;
    if (f.from && r.date < f.from) return false;
    if (f.to && r.date > f.to) return false;
    return true;
  });
}

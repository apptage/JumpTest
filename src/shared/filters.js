/* Single source of truth for bug + release filtering.
   Every page (Bugs, Analytics, dashboards) MUST filter through these functions
   so identical filters always yield identical datasets. No page-level custom
   filtering logic is allowed.

   Date semantics (unified & documented):
     - bugs are filtered by bug.createdAt
     - releases are filtered by release.date
   Bugs on closed (superseded) releases are excluded everywhere: their unresolved
   bugs were carried onto the successor release, so counting both double-counts.

   A filter object may set any subset of keys; unset keys ('all' / '') don't
   constrain. Context supplies the release/project lookups a bug needs to resolve
   its project / platform / team / developer / QA.
*/
import { isClosedStatus } from '@/constants.js';

const any = (v) => v == null || v === '' || v === 'all';

export function filterBugs(bugs, f = {}, ctx = {}) {
  const { releaseById = {}, projectById = {} } = ctx;
  const term = (f.search || '').trim().toLowerCase();
  return bugs.filter((b) => {
    const rel = releaseById[b.releaseId];
    if (!rel) return false;
    if (isClosedStatus(rel.status)) return false; // carried-forward dedup
    const proj = projectById[rel.projectId];
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

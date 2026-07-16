/* ReleaseHistory — a complete, filterable, per-release audit table shared by
   both analytics views. It renders whatever releases it's given, so ROLE SCOPING
   is the caller's job: Admins pass every release; Team Leads pass only their
   team's (both already do — the analytics data is pre-scoped upstream).

   Bug counts are HISTORICALLY ACCURATE: they come from bug_history (which never
   changes), NOT from live bugs (a carried-forward bug now MOVES to the new build
   under the one-bug-one-record model, so the live count on an old build would
   under-report). Per release: Reported = bugs first found on this build,
   Carried In = bugs that moved onto it, Bugs = the total this build handled.
   Full movement for any bug is on its Bug Timeline. */
import { useEffect, useState } from 'react';
import * as api from '@/api.js';
import { DataTable, Pill } from '@shared/dashboard-kit.jsx';
import { STATUSES, formatVersion } from '@/constants.js';

const STATUS_TONE = {
  qa_pending: 'warning',
  qa_in_progress: 'info',
  qa_done: 'info',
  approved: 'success',
  sent_back: 'danger',
  closed: 'neutral',
};

const fmtDate = (iso) => (iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—');
const fmtDay = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' }) : '—');

export function ReleaseHistory({ releases, projectsById, profilesById, onRowClick, pageSize = 12 }) {
  // historical per-release bug counts (from bug_history — see api.fetchReleaseBugStats)
  const [stats, setStats] = useState({});
  useEffect(() => {
    let cancelled = false;
    api
      .fetchReleaseBugStats()
      .then((m) => !cancelled && setStats(m || {}))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const name = (id) => (id ? profilesById[id]?.name || '—' : '—');

  const rows = (releases || [])
    .map((r) => {
      const s = stats[r.id] || { reported: 0, carried: 0, total: 0 };
      const submitted = r.createdAt || (r.date ? `${r.date}T00:00:00Z` : null);
      const cycle =
        r.qaCompletedAt && submitted
          ? (new Date(r.qaCompletedAt).getTime() - new Date(submitted).getTime()) / 86_400_000
          : null;
      return {
        id: r.id,
        release: r,
        project: projectsById[r.projectId]?.name || '—',
        platform: r.platform || '—',
        component: r.component || '—',
        version: r.version,
        environment: r.environment || 'Production',
        status: r.status,
        submittedBy: r.submittedBy || name(r.submittedById),
        qa: name(r.assignedQa),
        submitted,
        qaDone: r.qaCompletedAt || null,
        cycle,
        bugs: s.total,
        reported: s.reported,
        carried: s.carried,
      };
    })
    .sort((a, b) => new Date(b.submitted || 0).getTime() - new Date(a.submitted || 0).getTime());

  const columns = [
    { label: 'Project', render: (r) => <span style={{ fontWeight: 600 }}>{r.project}</span> },
    { label: 'Platform', render: (r) => r.platform },
    { label: 'Component', render: (r) => r.component },
    { label: 'Version', render: (r) => <span className="tnum">{formatVersion(r.version)}</span> },
    { label: 'Env', render: (r) => r.environment },
    {
      label: 'Status',
      render: (r) => <Pill label={STATUSES[r.status]?.label || r.status} tone={STATUS_TONE[r.status] || 'neutral'} />,
    },
    { label: 'Submitted by', render: (r) => r.submittedBy },
    { label: 'QA', render: (r) => r.qa },
    { label: 'Submitted', render: (r) => <span style={{ whiteSpace: 'nowrap' }}>{fmtDate(r.submitted)}</span> },
    { label: 'QA done', render: (r) => <span style={{ whiteSpace: 'nowrap' }}>{fmtDay(r.qaDone)}</span> },
    { label: 'QA cycle time', render: (r) => (r.cycle == null ? '—' : `${r.cycle.toFixed(1)}d`) },
    { label: 'Bugs handled', render: (r) => r.bugs },
    { label: 'Reported here', render: (r) => r.reported },
    { label: 'Carried in', render: (r) => (r.carried ? <Pill label={r.carried} tone="warning" /> : 0) },
  ];

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(r) => r.id}
      searchText={(r) => `${r.project} v${r.version} ${r.submittedBy} ${r.qa} ${r.platform} ${r.component}`}
      searchPlaceholder="Search releases (project, version, person…)"
      onRowClick={onRowClick}
      pageSize={pageSize}
    />
  );
}

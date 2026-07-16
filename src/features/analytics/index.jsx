/* Analytics feature — release/QA metrics dashboard + history/changelog.
   Moved verbatim out of ReleaseTracker.jsx (Phase 0 mechanical split). */
export { ManagerDashboard } from './ManagerDashboard.jsx';
import { useState, useMemo } from 'react';
import { card, inputStyle, ghostButton, ModalShell, StatusBadge, Avatar } from '@/ui.jsx';
import { PageHeader, Kpi, AnSection, avgDaysBetween } from '@shared/ui-kit.jsx';
import { SubTabs, Donut, StackedBar, SegmentedTimeline, Pill } from '@shared/dashboard-kit.jsx';
import { IconSliders } from '@/icons.jsx';
import { historicalBugs, filterReleases } from '@shared/filters.js';
import { computeReleaseMetrics, computeWorkload } from '@shared/releaseMetrics.js';
import { assertBugReconcile, aggregateBugMetrics, bugWorkflow } from '@shared/bugMetrics.js';
import { ScopeSummary } from '@shared/scope-summary.jsx';
import { ReleaseHistory } from './ReleaseHistory.jsx';
import {
  STATUSES,
  SEVERITIES,
  SEVERITY_ORDER,
  BUG_STATUSES,
  BUG_STATUS_ORDER,
  isActiveStatus,
  formatVersion,
  BUG_RESOLUTIONS,
  ENVIRONMENTS,
  RELEASE_TYPES,
  RELEASE_PLATFORMS,
} from '@/constants.js';

export function AnalyticsModal({ projects, releases, bugs, profiles, teams, isAdmin, embedded, onClose, onOpenHistory }) {
  const projectsById = useMemo(() => {
    const m = {};
    projects.forEach((p) => (m[p.id] = p));
    return m;
  }, [projects]);
  const profilesById = useMemo(() => {
    const m = {};
    profiles.forEach((p) => (m[p.id] = p));
    return m;
  }, [profiles]);

  const [f, setF] = useState({
    team: 'all',
    project: 'all',
    platform: 'all',
    environment: 'all',
    developer: 'all',
    qa: 'all',
    version: '',
    from: '',
    to: '',
  });
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const [matrixTab, setMatrixTab] = useState('dev');
  const reset = () =>
    setF({ team: 'all', project: 'all', platform: 'all', environment: 'all', developer: 'all', qa: 'all', version: '', from: '', to: '' });

  // ---- HISTORICAL dataset: Analytics reports the COMPLETE project history, so
  //      it counts bugs across ALL releases (active + closed), unlike the Bugs
  //      page which shows the live board only. Same shared services either way.
  const releaseById = {};
  releases.forEach((r) => (releaseById[r.id] = r));
  const relF = filterReleases(releases, f, { projectById: projectsById });
  const bugsF = historicalBugs(bugs, f, { releaseById, projectById: projectsById });
  assertBugReconcile(bugsF, 'analytics'); // dev-only reconcile guard

  // One bug = one row, so metrics come straight off the filtered set — no dedup.
  const bugMetricsF = aggregateBugMetrics(bugsF);
  const overallHistorical = historicalBugs(bugs, {}, { releaseById, projectById: projectsById });
  const filteredActive = bugMetricsF.active;
  const overallMetrics = aggregateBugMetrics(overallHistorical);
  const overallActive = overallMetrics.active;
  const carriedF = bugsF.filter((b) => b.carriedForward).length;
  const wfF = bugWorkflow(bugMetricsF);

  // active-filter breadcrumb for the scope summary
  const crumbLabel = (id) => profilesById[id]?.name || id;
  const scopeCrumbs = [];
  if (isAdmin && f.team !== 'all') scopeCrumbs.push((teams || []).find((t) => t.id === f.team)?.name || 'Team');
  if (f.project !== 'all') scopeCrumbs.push(projectsById[f.project]?.name || 'Project');
  if (f.platform !== 'all') scopeCrumbs.push(f.platform);
  if (f.environment !== 'all') scopeCrumbs.push(f.environment);
  if (f.developer !== 'all') scopeCrumbs.push(crumbLabel(f.developer));
  if (f.qa !== 'all') scopeCrumbs.push(crumbLabel(f.qa));
  if (f.version && f.version.trim()) scopeCrumbs.push(`v${f.version.trim()}`);
  if (f.from || f.to) scopeCrumbs.push(`${f.from || '…'} → ${f.to || '…'}`);

  const metrics = computeReleaseMetrics(relF, bugsF, { releaseById });
  const blockedReleaseIds = metrics.blocked;
  const { submitted, approved, rejected, decided, passRate, rejRate, cycleDays, prodBugs, carriedBugs, carryRate, avgIterations } = metrics;
  const toAssign = metrics.assignTime; // one shared cohort → cycleDays ≈ toAssign + assignToDone
  const assignToDone = metrics.qaTime;

  // completed-per-month chart source (approved releases; broader than the cycle cohort)
  const completed = relF.filter((r) => r.status === 'approved' && r.qaCompletedAt);

  // completed per month (last 6)
  const months = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    months.push({ key, label: d.toLocaleString(undefined, { month: 'short' }), n: 0 });
  }
  completed.forEach((r) => {
    const k = (r.qaCompletedAt || '').slice(0, 7);
    const m = months.find((x) => x.key === k);
    if (m) m.n += 1;
  });
  const maxMonth = Math.max(1, ...months.map((m) => m.n));

  // ---- workload (shared, project-aggregated) ----
  const wlMembers = computeWorkload(profiles, relF, bugsF, f.team);

  // ---- QA quality (resolution outcomes) ----
  const resCounts = {};
  BUG_RESOLUTIONS.forEach((r) => (resCounts[r] = 0));
  bugsF.forEach((b) => {
    if (b.resolution && resCounts[b.resolution] !== undefined) resCounts[b.resolution] += 1;
  });
  const totalBugs = bugsF.length;
  const invalidTotal = BUG_RESOLUTIONS.reduce((s, r) => s + resCounts[r], 0);
  const invalidPct = totalBugs ? Math.round((invalidTotal / totalBugs) * 100) : 0;

  // ---- distributions (charts) ----
  const sevDist = SEVERITY_ORDER.map((s) => ({
    key: s,
    label: SEVERITIES[s].label,
    color: SEVERITIES[s].color,
    n: bugsF.filter((b) => b.severity === s).length,
  }));
  const statusDist = BUG_STATUS_ORDER.map((s) => ({
    key: s,
    label: BUG_STATUSES[s].label,
    color: BUG_STATUSES[s].color,
    n: bugsF.filter((b) => b.status === s).length,
  }));
  const closedBugs = bugsF.filter((b) => b.status === 'verified').length;
  const openBugsCount = bugsF.length - closedBugs;

  // ---- developer & QA performance ----
  const relSubmitter = {};
  relF.forEach((r) => (relSubmitter[r.id] = r.submittedById));
  const devPerf = profiles
    .filter((p) => p.role !== 'QA' && (f.team === 'all' || p.teamId === f.team))
    .map((d) => {
      const myRel = relF.filter((r) => r.submittedById === d.id);
      const myRelIds = new Set(myRel.map((r) => r.id));
      const onMyRel = bugsF.filter((b) => myRelIds.has(b.releaseId));
      return {
        id: d.id,
        name: d.name,
        submitted: myRel.length,
        // queue: bugs waiting on the developer to fix
        awaitingFix: onMyRel.filter((b) => ['open', 'in_progress', 'disputed'].includes(b.status)).length,
        active: myRel.filter((r) => isActiveStatus(r.status)).length,
        openBugs: onMyRel.filter((b) => b.status !== 'verified').length,
      };
    })
    .filter((d) => d.submitted || d.openBugs)
    .sort((a, b) => b.awaitingFix - a.awaitingFix || b.submitted - a.submitted);

  const qaPerf = profiles
    .filter((p) => p.role === 'QA' && (f.team === 'all' || p.teamId === f.team))
    .map((q) => {
      const assigned = relF.filter((r) => r.assignedQa === q.id);
      const appr = assigned.filter((r) => r.status === 'approved' && !blockedReleaseIds.has(r.id)).length;
      const rej = assigned.filter(
        (r) => r.status === 'sent_back' || (r.status === 'approved' && blockedReleaseIds.has(r.id))
      ).length;
      const dec = appr + rej;
      const reportedIds = new Set(bugsF.filter((b) => b.createdById === q.id).map((b) => b.id));
      return {
        id: q.id,
        name: q.name,
        tested: assigned.length,
        reported: reportedIds.size,
        approveRate: dec ? Math.round((appr / dec) * 100) : 0,
        rejectRate: dec ? Math.round((rej / dec) * 100) : 0,
        // queues: releases pending review, in QA, and fixes awaiting re-verification
        pendingQa: assigned.filter((r) => r.status === 'qa_pending').length,
        inQa: assigned.filter((r) => r.status === 'qa_in_progress').length,
        awaitingVerify: bugsF.filter((b) => b.createdById === q.id && b.status === 'fixed').length,
      };
    })
    .filter((q) => q.tested || q.reported || q.awaitingVerify)
    .sort((a, b) => b.inQa + b.pendingQa - (a.inQa + a.pendingQa));

  // ---- per-project table ----
  const rows = projects
    .filter((p) => f.team === 'all' || p.teamId === f.team)
    .map((p) => {
      const rel = relF.filter((r) => r.projectId === p.id);
      const bugCount = bugsF.filter((b) => releaseById[b.releaseId]?.projectId === p.id).length;
      const avg = avgDaysBetween(
        rel.filter((r) => r.status === 'approved' && r.qaCompletedAt),
        'createdAt',
        'qaCompletedAt'
      );
      const reps = rel.filter((r) => r.status === 'sent_back').length;
      return { project: p, n: rel.length, bugCount, avg, rejRate: rel.length ? Math.round((reps / rel.length) * 100) : 0 };
    })
    .filter((r) => r.n > 0);

  const fSel = { ...inputStyle, width: 'auto', padding: '6px 8px', fontSize: 12 };
  const devs = profiles.filter((p) => p.role !== 'QA');
  const qas = profiles.filter((p) => p.role === 'QA');
  const th = {
    textAlign: 'left',
    fontSize: 11,
    fontWeight: 600,
    color: 'var(--color-text-secondary)',
    padding: '7px 8px',
    borderBottom: '1px solid var(--color-border-primary)',
  };
  const td = { fontSize: 12, padding: '8px 8px', borderBottom: '1px solid var(--color-border-primary)' };

  // combined "Team Members" filter — maps one picker onto the dev/qa filter keys
  const memberValue =
    f.developer !== 'all' ? `dev:${f.developer}` : f.qa !== 'all' ? `qa:${f.qa}` : 'all';
  const onMember = (val) => {
    const [kind, id] = val.split(':');
    if (kind === 'dev') setF((s) => ({ ...s, developer: id, qa: 'all' }));
    else if (kind === 'qa') setF((s) => ({ ...s, developer: 'all', qa: id }));
    else setF((s) => ({ ...s, developer: 'all', qa: 'all' }));
  };
  const sevSegments = sevDist.map((s) => ({ label: s.label, value: s.n, color: s.color }));
  const statusSegments = statusDist.map((s) => ({ label: s.label, value: s.n, color: s.color }));
  const secHead = {
    fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase',
    color: 'var(--color-text-tertiary)', marginBottom: 10,
  };
  const avatarCell = (name, role) => (
    <td style={{ ...td, fontWeight: 500 }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
        <Avatar name={name} role={role} size={24} />
        {name}
      </span>
    </td>
  );
  // guide: an assignee carrying >20 open bugs is a bottleneck → soft amber pill
  const overloadCell = (n) =>
    n > 20 ? (
      <td style={td}><Pill label={String(n)} tone="warning" /></td>
    ) : (
      <td style={{ ...td, color: n ? 'var(--danger)' : undefined }}>{n}</td>
    );

  const devTable =
    devPerf.length === 0 ? (
      <div style={{ fontSize: 12.5, color: 'var(--color-text-tertiary)', padding: '8px 2px' }}>No developer activity.</div>
    ) : (
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={th}>Developer</th>
              <th style={th}>Releases</th>
              <th style={th}>Needs Dev</th>
              <th style={th}>Active Releases</th>
              <th style={th}>Active Bugs</th>
            </tr>
          </thead>
          <tbody>
            {devPerf.map((d) => (
              <tr key={d.id} className="mgr-row">
                {avatarCell(d.name, 'Developer')}
                <td style={td}>{d.submitted}</td>
                <td style={{ ...td, color: d.awaitingFix ? 'var(--danger)' : undefined, fontWeight: d.awaitingFix > 5 ? 700 : 400 }}>{d.awaitingFix}</td>
                <td style={td}>{d.active}</td>
                {overloadCell(d.openBugs)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );

  const qaTable =
    qaPerf.length === 0 ? (
      <div style={{ fontSize: 12.5, color: 'var(--color-text-tertiary)', padding: '8px 2px' }}>No QA activity.</div>
    ) : (
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={th}>QA engineer</th>
              <th style={th}>Reported</th>
              <th style={th}>Approve</th>
              <th style={th}>Reject</th>
              <th style={th}>Pending</th>
              <th style={th}>In QA</th>
              <th style={th}>Verify</th>
            </tr>
          </thead>
          <tbody>
            {qaPerf.map((q) => (
              <tr key={q.id} className="mgr-row">
                {avatarCell(q.name, 'QA')}
                <td style={td}>{q.reported}</td>
                <td style={{ ...td, color: 'var(--success)' }}>{q.approveRate}%</td>
                <td style={{ ...td, color: 'var(--danger)' }}>{q.rejectRate}%</td>
                <td style={td}>{q.pendingQa}</td>
                <td style={{ ...td, color: q.inQa > 3 ? 'var(--danger)' : undefined, fontWeight: q.inQa > 3 ? 700 : 400 }}>{q.inQa}</td>
                <td style={{ ...td, color: q.awaitingVerify ? 'var(--warning)' : undefined }}>{q.awaitingVerify}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );

  const wlTable =
    wlMembers.length === 0 ? (
      <div style={{ fontSize: 12.5, color: 'var(--color-text-tertiary)', padding: '8px 2px' }}>No active assignments.</div>
    ) : (
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={th}>Member</th>
              <th style={th}>Role</th>
              <th style={th}>Active Releases</th>
              <th style={th}>Pending Reviews</th>
              <th style={th}>Active Bugs</th>
            </tr>
          </thead>
          <tbody>
            {wlMembers.map((w) => (
              <tr key={w.m.id} className="mgr-row">
                {avatarCell(w.m.name, w.m.role)}
                <td style={td}>{w.m.role}</td>
                <td style={td}>{w.activeReleases}</td>
                <td style={{ ...td, color: w.pendingReviews > 3 ? 'var(--danger)' : undefined, fontWeight: w.pendingReviews > 3 ? 700 : 400 }}>{w.pendingReviews}</td>
                {overloadCell(w.openBugs)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );

  const body = (
    <>
      {/* filter ribbon — minimalist, funnel-anchored */}
      <div
        style={{
          display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap',
          padding: '9px 12px', marginBottom: 18,
          background: 'var(--color-background-primary)',
          border: '1px solid #E2E8F0', borderRadius: 10,
        }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--color-text-secondary)', fontSize: 12, fontWeight: 600, paddingRight: 8, borderRight: '1px solid var(--color-border-tertiary)' }}>
          <IconSliders size={15} /> Filters
        </span>
        {isAdmin && (
          <select style={fSel} value={f.team} onChange={(e) => set('team', e.target.value)}>
            <option value="all">All teams</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        )}
        <select style={fSel} value={f.project} onChange={(e) => set('project', e.target.value)}>
          <option value="all">All projects</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <select style={fSel} value={f.platform} onChange={(e) => set('platform', e.target.value)}>
          <option value="all">All platforms</option>
          {RELEASE_PLATFORMS.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
        <select style={fSel} value={f.environment} onChange={(e) => set('environment', e.target.value)}>
          <option value="all">All environments</option>
          {ENVIRONMENTS.map((e) => (
            <option key={e} value={e}>{e}</option>
          ))}
        </select>
        {/* combined Team Members (developers + QA) */}
        <select style={fSel} value={memberValue} onChange={(e) => onMember(e.target.value)} title="Team member">
          <option value="all">All team members</option>
          <optgroup label="Developers">
            {devs.map((p) => (
              <option key={p.id} value={`dev:${p.id}`}>{p.name}</option>
            ))}
          </optgroup>
          <optgroup label="QA">
            {qas.map((p) => (
              <option key={p.id} value={`qa:${p.id}`}>{p.name}</option>
            ))}
          </optgroup>
        </select>
        <input style={{ ...fSel, width: 110 }} value={f.version} placeholder="Version…" onChange={(e) => set('version', e.target.value)} />
        <input style={fSel} type="date" value={f.from} onChange={(e) => set('from', e.target.value)} title="From" />
        <input style={fSel} type="date" value={f.to} onChange={(e) => set('to', e.target.value)} title="To" />
        <button style={{ ...ghostButton, padding: '6px 12px', fontSize: 12, marginLeft: 'auto' }} onClick={reset}>
          Reset
        </button>
      </div>

      {/* dataset scope — Analytics reports the whole project history */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, fontSize: 12 }}>
        <span style={{ fontWeight: 700, padding: '2px 9px', borderRadius: 999, background: 'var(--brand-soft)', color: 'var(--brand-strong)' }}>
          Scope: Entire Project History
        </span>
        <span style={{ color: 'var(--color-text-tertiary)' }}>Metrics include all releases (active and closed).</span>
      </div>

      {/* what scope do these numbers represent? */}
      <ScopeSummary shown={filteredActive} total={overallActive} noun="currently active bugs" crumbs={scopeCrumbs} />

      <div className="an-workspace">
        {/* LEFT — performance & data trends */}
        <div style={{ minWidth: 0 }}>

      {/* release overview KPIs */}
      <AnSection title="Release Overview">
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Kpi label="Total Releases" value={submitted} />
          <Kpi label="QA Approved Releases" value={approved} sub={`${passRate}% pass rate`} color="var(--success)" />
          <Kpi label="Returned for Rework" value={rejected} sub={`${rejRate}% of decided`} color="var(--danger)" />
          <Kpi
            label="Average Release Cycle"
            value={cycleDays == null ? 'In progress' : `${cycleDays.toFixed(1)}d`}
            sub="submit → QA done"
          />
          <Kpi
            label="Production Bugs"
            value={prodBugs}
            sub="on production builds"
            color={prodBugs > 0 ? 'var(--danger)' : undefined}
          />
          <Kpi
            label="Carried Forward Bugs"
            value={carriedBugs}
            sub={`${carryRate}% of bugs${avgIterations ? ` · ~${avgIterations} builds to verify` : ''}`}
            color={carryRate >= 30 ? 'var(--warning)' : undefined}
          />
        </div>
      </AnSection>

      {/* Bug workflow — who holds the ball; one bug = one row (straight counts). */}
      <AnSection title="Bug Workflow">
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Kpi label="Total Bugs" value={wfF.total} sub="in scope" />
          <Kpi label="Needs Development" value={wfF.needsDev} sub="with the developer" color={wfF.needsDev ? 'var(--danger)' : undefined} />
          <Kpi label="Awaiting QA" value={wfF.awaitingQa} sub="waiting for QA" color={wfF.awaitingQa ? 'var(--warning)' : undefined} />
          <Kpi label="Verified Bugs" value={wfF.verified} sub="closed" color="var(--success)" />
          <Kpi label="Carried Forward Bugs" value={carriedF} sub="from a prior build" color={carriedF ? 'var(--warning)' : undefined} />
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--color-text-tertiary)', marginTop: 8, lineHeight: 1.5 }}>
          {scopeCrumbs.length > 0 ? 'Filtered scope above.' : 'Whole scope.'} Overall (all-time, unfiltered):{' '}
          <strong>{overallMetrics.total}</strong> total bugs · <strong>{overallMetrics.active}</strong> currently active ·{' '}
          <strong>{overallMetrics.closed}</strong> verified. Each bug is a single record — a carried-forward bug
          moves to the new build, it isn’t copied, so every count is a straight row count.
        </div>
      </AnSection>

      {/* cycle stages as a segmented timeline + velocity trend */}
      <AnSection title="Release Speed">
        <div style={{ ...card, padding: 16, marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)' }}>QA Cycle Time</span>
            <span className="tnum" style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700 }}>
              {cycleDays == null ? '—' : `${cycleDays.toFixed(1)}d total`}
            </span>
          </div>
          <SegmentedTimeline
            segments={[
              { label: 'Submit → QA assigned', value: toAssign || 0, color: '#94A3B8' },
              { label: 'QA assigned → QA complete', value: assignToDone || 0, color: '#0D9488' },
            ]}
          />
        </div>
        <div style={{ ...card, padding: 14 }}>
          <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 10 }}>
            Releases completed / month
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 80 }}>
            {months.map((m) => (
              <div key={m.key} style={{ flex: 1, textAlign: 'center' }}>
                <div style={{ height: `${(m.n / maxMonth) * 64}px`, background: 'var(--brand)', borderRadius: 4, minHeight: 2 }} title={`${m.n} completed`} />
                <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginTop: 4 }}>{m.label}</div>
              </div>
            ))}
          </div>
        </div>
      </AnSection>

      {/* Delays, Bug Breakdown & QA Quality now live in the sticky sidebar → */}

      {/* consolidated resource matrix — Developers / QA / Workload */}
      <AnSection title="Resource Matrix">
        <SubTabs
          tabs={[
            ['dev', `Developers${devPerf.length ? ` (${devPerf.length})` : ''}`],
            ['qa', `QA${qaPerf.length ? ` (${qaPerf.length})` : ''}`],
            ['wl', `Workload${wlMembers.length ? ` (${wlMembers.length})` : ''}`],
          ]}
          active={matrixTab}
          onChange={setMatrixTab}
        />
        {matrixTab === 'dev' ? devTable : matrixTab === 'qa' ? qaTable : wlTable}
      </AnSection>

      {/* per-project */}
      <AnSection title="By project">
        {rows.length === 0 ? (
          <div style={{ fontSize: 12.5, color: 'var(--color-text-tertiary)' }}>No releases match the filters.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={th}>Project</th>
                  <th style={th}>Releases</th>
                  <th style={th}>Bugs</th>
                  <th style={th}>Avg cycle</th>
                  <th style={th}>Rejection</th>
                  <th style={th}></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.project.id}>
                    <td style={{ ...td, fontWeight: 500 }}>{r.project.name}</td>
                    <td style={td}>{r.n}</td>
                    <td style={td}>{r.bugCount}</td>
                    <td style={td}>{r.avg == null ? '—' : `${r.avg.toFixed(1)}d`}</td>
                    <td style={td}>{r.rejRate}%</td>
                    <td style={td}>
                      <button
                        onClick={() => onOpenHistory(r.project)}
                        style={{ background: 'none', border: 'none', color: 'var(--brand)', cursor: 'pointer', fontSize: 12, fontFamily: 'inherit' }}
                      >
                        History
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </AnSection>

      <AnSection title="Release History">
        <div style={{ fontSize: 11.5, color: 'var(--color-text-tertiary)', marginBottom: 10 }}>
          Every release in the current scope (all statuses). Every bug exists only once — a carried-forward
          bug <strong>moves</strong> to the new build, it isn’t copied. Bug counts here are historical (from
          each bug’s timeline): reported on this build vs. carried in, and they don’t change as bugs move on.
          Notes, changelog and WBS tasks live on each release — click a row to open it.
        </div>
        <ReleaseHistory
          releases={relF}
          projectsById={projectsById}
          profilesById={profilesById}
          onRowClick={(r) => onOpenHistory(projectsById[r.projectId])}
        />
      </AnSection>

        </div>
        {/* end LEFT */}

        {/* RIGHT — sticky quality sidebar (operational "Delays & Attention"
            now lives on the Bugs page; Analytics stays historical) */}
        <aside className="an-side">

          <div className="mgr-card" style={{ ...card, padding: 14 }}>
            <div style={secHead}>Bug Breakdown</div>
            <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 10 }}>By severity</div>
            <Donut segments={sevSegments} centerValue={totalBugs} centerLabel="bugs" />
            <div style={{ height: 1, background: 'var(--color-border-primary)', margin: '14px 0' }} />
            <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 10 }}>By status</div>
            <StackedBar segments={statusSegments} />
            <div style={{ height: 1, background: 'var(--color-border-primary)', margin: '14px 0' }} />
            <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 10 }}>Active vs Verified</div>
            <StackedBar
              segments={[
                { label: 'Active', value: openBugsCount, color: 'var(--danger)' },
                { label: 'Verified', value: closedBugs, color: 'var(--success)' },
              ]}
            />
          </div>

          <div className="mgr-card" style={{ ...card, padding: 14 }}>
            <div style={secHead}>QA Quality Insights</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginBottom: 10 }}>
              {BUG_RESOLUTIONS.map((r) => (
                <div key={r} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12 }}>
                  <span style={{ color: 'var(--color-text-secondary)' }}>{r}</span>
                  <span className="tnum">
                    <b>{resCounts[r]}</b>{' '}
                    <span style={{ color: 'var(--color-text-tertiary)', fontSize: 11 }}>
                      {totalBugs ? Math.round((resCounts[r] / totalBugs) * 100) : 0}%
                    </span>
                  </span>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', lineHeight: 1.5 }}>
              {invalidPct}% of reported bugs were closed without a code fix.
              {invalidPct >= 30
                ? ' A high share can signal unclear requirements or outdated specs — worth a process review rather than blaming individuals.'
                : ''}
            </div>
          </div>
        </aside>
      </div>
      {/* end an-workspace */}

      <div style={{ fontSize: 10.5, color: 'var(--color-text-tertiary)', marginBottom: 12 }}>
        Release-speed and attention metrics use submission, QA-assigned and QA-complete timestamps recorded from now on;
        releases created before tracking are excluded from stage averages.
      </div>
    </>
  );

  if (embedded)
    return (
      <>
        <PageHeader title="Analytics" subtitle="Release speed, quality, workload and delays" />
        {body}
      </>
    );

  return (
    <ModalShell onClose={onClose} title="Analytics" maxWidth={860}>
      {body}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button style={ghostButton} onClick={onClose}>
          Close
        </button>
      </div>
    </ModalShell>
  );
}

/* ================================================================== */
/* History + changelog export                                         */
/* ================================================================== */

function buildChangelog(project, releases) {
  const done = releases
    .filter((r) => r.status === 'approved')
    .sort((a, b) => (a.date < b.date ? 1 : -1));
  const lines = [`# ${project.name} — Changelog`, ''];
  if (done.length === 0) lines.push('_No QA-complete releases yet._');
  done.forEach((r) => {
    lines.push(`## v${r.version} — ${r.date}`);
    lines.push(`Platform: ${r.platform} · ${r.environment || 'Production'} · Type: ${r.releaseType}`);
    lines.push('');
    lines.push(r.releaseNotes || '_No notes_');
    lines.push('');
  });
  return lines.join('\n');
}

export function HistoryModal({ project, releases, showToast, onClose }) {
  const sorted = [...releases].sort((a, b) => (a.date < b.date ? 1 : -1));

  async function copyChangelog() {
    const text = buildChangelog(project, releases);
    try {
      await navigator.clipboard.writeText(text);
      showToast('Changelog copied to clipboard');
    } catch {
      showToast('Clipboard blocked — use Download instead', 'error');
    }
  }

  function downloadChangelog() {
    const text = buildChangelog(project, releases);
    const blob = new Blob([text], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.name.replace(/\s+/g, '-').toLowerCase()}-changelog.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <ModalShell
      onClose={onClose}
      title={`${project.name} — history`}
      maxWidth={560}
      right={
        <div style={{ display: 'flex', gap: 6 }}>
          <button style={{ ...ghostButton, padding: '6px 10px', fontSize: 12 }} onClick={copyChangelog}>
            Copy changelog
          </button>
          <button style={{ ...ghostButton, padding: '6px 10px', fontSize: 12 }} onClick={downloadChangelog}>
            Download .md
          </button>
        </div>
      }
    >
      {sorted.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
          No releases for this project yet.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {sorted.map((r, i) => (
            <div
              key={r.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '12px 0',
                borderBottom:
                  i === sorted.length - 1
                    ? 'none'
                    : '0.5px solid var(--color-border-primary)',
              }}
            >
              <div
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: STATUSES[r.status]?.color || '#64748b',
                  flexShrink: 0,
                }}
              />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 500 }}>
                  {formatVersion(r.version)}{' '}
                  <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--color-text-secondary)' }}>
                    {RELEASE_TYPES[r.releaseType]?.label}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>
                  {r.platform} · {r.environment || 'Production'} · {r.date} · {r.submittedBy}
                </div>
              </div>
              <StatusBadge status={r.status} />
            </div>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
        <button style={ghostButton} onClick={onClose}>
          Close
        </button>
      </div>
    </ModalShell>
  );
}

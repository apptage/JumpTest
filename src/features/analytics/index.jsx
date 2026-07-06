/* Analytics feature — release/QA metrics dashboard + history/changelog.
   Moved verbatim out of ReleaseTracker.jsx (Phase 0 mechanical split). */
import { useState, useMemo } from 'react';
import { card, inputStyle, ghostButton, ModalShell, StatusBadge } from '@/ui.jsx';
import { PageHeader, Kpi, DistBars, AnSection, avgDaysBetween, statusSince } from '@shared/ui-kit.jsx';
import {
  STATUSES,
  SEVERITIES,
  SEVERITY_ORDER,
  BUG_STATUSES,
  BUG_STATUS_ORDER,
  slaLevel,
  isActiveStatus,
  isClosedStatus,
  SLA_COLORS,
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
  const reset = () =>
    setF({ team: 'all', project: 'all', platform: 'all', environment: 'all', developer: 'all', qa: 'all', version: '', from: '', to: '' });

  const relF = releases.filter((r) => {
    const proj = projectsById[r.projectId];
    if (f.team !== 'all' && (proj?.teamId || '') !== f.team) return false;
    if (f.project !== 'all' && r.projectId !== f.project) return false;
    if (f.platform !== 'all' && r.platform !== f.platform) return false;
    if (f.environment !== 'all' && (r.environment || 'Production') !== f.environment) return false;
    if (f.developer !== 'all' && r.submittedById !== f.developer) return false;
    if (f.qa !== 'all' && r.assignedQa !== f.qa) return false;
    if (f.version.trim() && !r.version.toLowerCase().includes(f.version.trim().toLowerCase())) return false;
    if (f.from && r.date < f.from) return false;
    if (f.to && r.date > f.to) return false;
    return true;
  });
  const relIds = new Set(relF.map((r) => r.id));
  // bugs on closed (superseded) releases were carried onto their successor —
  // exclude them from bug metrics so carried bugs aren't counted twice.
  const closedRelIds = new Set(relF.filter((r) => isClosedStatus(r.status)).map((r) => r.id));
  const bugsF = bugs.filter((b) => relIds.has(b.releaseId) && !closedRelIds.has(b.releaseId));

  // a release is "blocked" while it still has open Major/Critical bugs
  const blockedReleaseIds = new Set(
    bugsF
      .filter((b) => b.status !== 'verified' && (b.severity === 'critical' || b.severity === 'major'))
      .map((b) => b.releaseId)
  );

  // ---- QA quality (based on real outcome, not just submission) ----
  const submitted = relF.length;
  const approved = relF.filter((r) => r.status === 'approved' && !blockedReleaseIds.has(r.id)).length;
  // bug_repeat, or "approved" releases that still carry blocking bugs, count as not-passed
  const rejected = relF.filter(
    (r) => r.status === 'sent_back' || (r.status === 'approved' && blockedReleaseIds.has(r.id))
  ).length;
  const decided = approved + rejected;
  const passRate = decided ? Math.round((approved / decided) * 100) : 0;
  const rejRate = decided ? Math.round((rejected / decided) * 100) : 0;

  // ---- velocity ----
  const completed = relF.filter((r) => r.status === 'approved' && r.qaCompletedAt);
  // total cycle is only meaningful once a release has gone through QA assignment
  const cycleDays = avgDaysBetween(
    completed.filter((r) => r.qaAssignedAt),
    'createdAt',
    'qaCompletedAt'
  );
  const toAssign = avgDaysBetween(
    relF.filter((r) => r.qaAssignedAt),
    'createdAt',
    'qaAssignedAt'
  );
  const assignToDone = avgDaysBetween(
    completed.filter((r) => r.qaAssignedAt),
    'qaAssignedAt',
    'qaCompletedAt'
  );

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

  // ---- production defects (bugs reported against Production-env releases) ----
  const prodBugs = bugsF.filter((b) => (relById(b.releaseId)?.environment || 'Production') === 'Production').length;
  function relById(id) {
    return relF.find((r) => r.id === id);
  }

  // ---- bug lineage: carry-forward rate + avg iterations to verify ----
  const carriedBugs = bugsF.filter((b) => b.carriedForward).length;
  const carryRate = bugsF.length ? Math.round((carriedBugs / bugsF.length) * 100) : 0;
  const verifiedIters = bugsF.filter((b) => b.status === 'verified').map((b) => b.iteration || 1);
  const avgIterations = verifiedIters.length
    ? (verifiedIters.reduce((s, n) => s + n, 0) / verifiedIters.length).toFixed(1)
    : null;

  // ---- workload ----
  const wlMembers = profiles
    .filter((p) => p.role !== 'Admin' && (f.team === 'all' || p.teamId === f.team))
    .map((m) => {
      const mine = new Set(relF.filter((r) => r.submittedById === m.id).map((r) => r.id));
      return {
        m,
        activeReleases: relF.filter((r) => r.submittedById === m.id && isActiveStatus(r.status)).length,
        pendingReviews: relF.filter(
          (r) => r.assignedQa === m.id && (r.status === 'qa_pending' || r.status === 'qa_in_progress')
        ).length,
        openBugs: bugsF.filter(
          (b) => (b.createdById === m.id || mine.has(b.releaseId)) && b.status !== 'verified'
        ).length,
      };
    })
    .filter((w) => w.activeReleases || w.pendingReviews || w.openBugs)
    .sort((a, b) => b.pendingReviews + b.activeReleases - (a.pendingReviews + a.activeReleases));

  // ---- bottlenecks ----
  const bottlenecks = [];
  const overSla = relF.filter((r) => slaLevel(r.status, statusSince(r)) === 'over');
  if (overSla.length)
    bottlenecks.push({ level: 'over', text: `${overSla.length} release(s) past their SLA (Pending/In QA).` });
  const reviewerLoad = {};
  relF.forEach((r) => {
    if (r.assignedQa && (r.status === 'qa_pending' || r.status === 'qa_in_progress'))
      reviewerLoad[r.assignedQa] = (reviewerLoad[r.assignedQa] || 0) + 1;
  });
  Object.entries(reviewerLoad)
    .filter(([, n]) => n > 3)
    .forEach(([id, n]) =>
      bottlenecks.push({
        level: 'warn',
        text: `${profilesById[id]?.name || 'A tester'} has ${n} active reviews — possibly overloaded.`,
      })
    );
  const qaCountByTeam = {};
  profiles.forEach((p) => {
    if (p.role === 'QA') qaCountByTeam[p.teamId] = (qaCountByTeam[p.teamId] || 0) + 1;
  });
  (f.team === 'all' ? teams : teams.filter((t) => t.id === f.team)).forEach((t) => {
    const waiting = relF.some(
      (r) => projectsById[r.projectId]?.teamId === t.id && (r.status === 'qa_pending' || r.status === 'qa_in_progress')
    );
    if (waiting && !qaCountByTeam[t.id])
      bottlenecks.push({ level: 'over', text: `${t.name} has releases waiting but no QA testers.` });
  });
  const disputedBugs = bugsF.filter((b) => b.status === 'disputed');
  if (disputedBugs.length) {
    const rels = new Set(disputedBugs.map((b) => b.releaseId)).size;
    bottlenecks.push({
      level: 'warn',
      text: `${disputedBugs.length} bug(s) need clarification across ${rels} release(s) — blocked communication.`,
    });
  }
  // releases drowning in open bugs / blocking bugs
  const OPEN_BUG_THRESHOLD = 5;
  const BLOCKING_THRESHOLD = 3;
  relF.forEach((r) => {
    const rbugs = bugsF.filter((b) => b.releaseId === r.id && b.status !== 'verified');
    const blocking = rbugs.filter((b) => b.severity === 'critical' || b.severity === 'major').length;
    const label = `v${r.version} · ${projectsById[r.projectId]?.name || ''}`;
    if (rbugs.length >= OPEN_BUG_THRESHOLD)
      bottlenecks.push({ level: 'over', text: `${label} has ${rbugs.length} open bugs — stuck in QA.` });
    else if (blocking >= BLOCKING_THRESHOLD)
      bottlenecks.push({ level: 'over', text: `${label} has ${blocking} unresolved Major/Critical bugs.` });
  });
  // developers overloaded with open bugs on their releases
  const devOpen = {};
  bugsF
    .filter((b) => b.status !== 'verified')
    .forEach((b) => {
      const dev = relById(b.releaseId)?.submittedById;
      if (dev) devOpen[dev] = (devOpen[dev] || 0) + 1;
    });
  Object.entries(devOpen)
    .filter(([, n]) => n > 8)
    .forEach(([id, n]) =>
      bottlenecks.push({
        level: 'warn',
        text: `${profilesById[id]?.name || 'A developer'} has ${n} open bugs to fix — possibly overloaded.`,
      })
    );

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
      const bugCount = bugsF.filter((b) => relById(b.releaseId)?.projectId === p.id).length;
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

  const body = (
    <>
      {/* filters */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
        {isAdmin && (
          <select style={fSel} value={f.team} onChange={(e) => set('team', e.target.value)}>
            <option value="all">All teams</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        )}
        <select style={fSel} value={f.project} onChange={(e) => set('project', e.target.value)}>
          <option value="all">All projects</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <select style={fSel} value={f.platform} onChange={(e) => set('platform', e.target.value)}>
          <option value="all">All platforms</option>
          {RELEASE_PLATFORMS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <select style={fSel} value={f.environment} onChange={(e) => set('environment', e.target.value)}>
          <option value="all">All environments</option>
          {ENVIRONMENTS.map((e) => (
            <option key={e} value={e}>
              {e}
            </option>
          ))}
        </select>
        <select style={fSel} value={f.developer} onChange={(e) => set('developer', e.target.value)}>
          <option value="all">All developers</option>
          {devs.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <select style={fSel} value={f.qa} onChange={(e) => set('qa', e.target.value)}>
          <option value="all">All QA</option>
          {qas.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <input
          style={{ ...fSel, width: 110 }}
          value={f.version}
          placeholder="Version…"
          onChange={(e) => set('version', e.target.value)}
        />
        <input style={fSel} type="date" value={f.from} onChange={(e) => set('from', e.target.value)} title="From" />
        <input style={fSel} type="date" value={f.to} onChange={(e) => set('to', e.target.value)} title="To" />
        <button style={{ ...ghostButton, padding: '6px 12px', fontSize: 12 }} onClick={reset}>
          Reset
        </button>
      </div>

      {/* QA quality + velocity KPIs */}
      <AnSection title="Release Quality">
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Kpi label="Submitted" value={submitted} />
          <Kpi label="Approved" value={approved} sub={`${passRate}% passed QA`} color="var(--success)" />
          <Kpi label="Sent back" value={rejected} sub={`${rejRate}% returned to dev`} color="var(--danger)" />
          <Kpi
            label="Avg release time"
            value={cycleDays == null ? 'In progress' : `${cycleDays.toFixed(1)}d`}
            sub="submit → QA done"
          />
          <Kpi
            label="Production Defects"
            value={prodBugs}
            sub="bugs reported in production"
            color={prodBugs > 0 ? 'var(--danger)' : undefined}
          />
          <Kpi
            label="Carried forward"
            value={carriedBugs}
            sub={`${carryRate}% of bugs${avgIterations ? ` · ~${avgIterations} builds to verify` : ''}`}
            color={carryRate >= 30 ? 'var(--warning)' : undefined}
          />
        </div>
      </AnSection>

      {/* cycle stages + velocity trend */}
      <AnSection title="Release Speed">
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ ...card, padding: 14, flex: '1 1 240px' }}>
            <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 8 }}>
              Average stage duration (days)
            </div>
            {[
              ['Submission → QA assigned', toAssign],
              ['QA assigned → QA complete', assignToDone],
              ['Total cycle', cycleDays],
            ].map(([label, v]) => (
              <div key={label} style={{ marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
                  <span>{label}</span>
                  <span className="tnum" style={{ color: 'var(--color-text-secondary)' }}>
                    {v == null ? '—' : `${v.toFixed(1)}d`}
                  </span>
                </div>
                <div style={{ height: 6, borderRadius: 999, background: 'var(--color-background-secondary)' }}>
                  <div
                    style={{
                      height: '100%',
                      borderRadius: 999,
                      background: 'var(--brand)',
                      width: `${Math.min(100, ((v || 0) / Math.max(0.1, cycleDays || 1)) * 100)}%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
          <div style={{ ...card, padding: 14, flex: '1 1 240px' }}>
            <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 10 }}>
              Releases completed / month
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 80 }}>
              {months.map((m) => (
                <div key={m.key} style={{ flex: 1, textAlign: 'center' }}>
                  <div
                    style={{
                      height: `${(m.n / maxMonth) * 64}px`,
                      background: 'var(--brand)',
                      borderRadius: 4,
                      minHeight: 2,
                    }}
                    title={`${m.n} completed`}
                  />
                  <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginTop: 4 }}>{m.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </AnSection>

      {/* bottlenecks */}
      <AnSection title="Delays & Attention Needed">
        {bottlenecks.length === 0 ? (
          <div style={{ fontSize: 12.5, color: 'var(--color-text-tertiary)' }}>
            No bottlenecks detected for the current filters.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {bottlenecks.map((b, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 9,
                  padding: '9px 11px',
                  background: 'var(--color-background-secondary)',
                  border: '1px solid var(--color-border-tertiary)',
                  borderRadius: 8,
                  fontSize: 12.5,
                }}
              >
                <span
                  style={{ width: 8, height: 8, borderRadius: 999, background: SLA_COLORS[b.level], flexShrink: 0 }}
                />
                {b.text}
              </div>
            ))}
          </div>
        )}
      </AnSection>

      {/* QA quality insights */}
      <AnSection title="QA Quality Insights">
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
          {BUG_RESOLUTIONS.map((r) => (
            <Kpi
              key={r}
              label={r}
              value={resCounts[r]}
              sub={`${totalBugs ? Math.round((resCounts[r] / totalBugs) * 100) : 0}% of bugs`}
            />
          ))}
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--color-text-tertiary)', lineHeight: 1.5 }}>
          {invalidPct}% of reported bugs were closed without a code fix.
          {invalidPct >= 30
            ? ' A high share can signal unclear requirements or outdated specs — worth a process review rather than blaming individuals.'
            : ''}
        </div>
      </AnSection>

      {/* charts */}
      <AnSection title="Bug Breakdown">
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ ...card, padding: 14, flex: '1 1 240px' }}>
            <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 10 }}>
              By severity
            </div>
            <DistBars items={sevDist} />
          </div>
          <div style={{ ...card, padding: 14, flex: '1 1 240px' }}>
            <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 10 }}>
              By status
            </div>
            <DistBars items={statusDist} />
          </div>
          <div style={{ ...card, padding: 14, flex: '1 1 200px' }}>
            <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 10 }}>
              Open vs Closed
            </div>
            <DistBars
              items={[
                { key: 'open', label: 'Open', color: 'var(--danger)', n: openBugsCount },
                { key: 'closed', label: 'Closed', color: 'var(--success)', n: closedBugs },
              ]}
            />
          </div>
        </div>
      </AnSection>

      {/* developer insights */}
      <AnSection title="Developer Insights">
        {devPerf.length === 0 ? (
          <div style={{ fontSize: 12.5, color: 'var(--color-text-tertiary)' }}>No developer activity.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={th}>Developer</th>
                  <th style={th}>Releases submitted</th>
                  <th style={th}>Awaiting fix</th>
                  <th style={th}>Active releases</th>
                  <th style={th}>Open bugs</th>
                </tr>
              </thead>
              <tbody>
                {devPerf.map((d) => (
                  <tr key={d.id}>
                    <td style={{ ...td, fontWeight: 500 }}>{d.name}</td>
                    <td style={td}>{d.submitted}</td>
                    <td style={{ ...td, color: d.awaitingFix ? 'var(--danger)' : undefined, fontWeight: d.awaitingFix > 5 ? 700 : 400 }}>
                      {d.awaitingFix}
                    </td>
                    <td style={td}>{d.active}</td>
                    <td style={{ ...td, color: d.openBugs ? 'var(--danger)' : undefined }}>{d.openBugs}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </AnSection>

      {/* QA insights */}
      <AnSection title="QA Insights">
        {qaPerf.length === 0 ? (
          <div style={{ fontSize: 12.5, color: 'var(--color-text-tertiary)' }}>No QA activity.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={th}>QA engineer</th>
                  <th style={th}>Bugs reported</th>
                  <th style={th}>Approval rate</th>
                  <th style={th}>Rejection rate</th>
                  <th style={th}>Pending QA</th>
                  <th style={th}>In QA</th>
                  <th style={th}>Awaiting verify</th>
                </tr>
              </thead>
              <tbody>
                {qaPerf.map((q) => (
                  <tr key={q.id}>
                    <td style={{ ...td, fontWeight: 500 }}>{q.name}</td>
                    <td style={td}>{q.reported}</td>
                    <td style={{ ...td, color: 'var(--success)' }}>{q.approveRate}%</td>
                    <td style={{ ...td, color: 'var(--danger)' }}>{q.rejectRate}%</td>
                    <td style={td}>{q.pendingQa}</td>
                    <td style={{ ...td, color: q.inQa > 3 ? 'var(--danger)' : undefined, fontWeight: q.inQa > 3 ? 700 : 400 }}>
                      {q.inQa}
                    </td>
                    <td style={{ ...td, color: q.awaitingVerify ? 'var(--warning)' : undefined }}>{q.awaitingVerify}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </AnSection>

      {/* workload */}
      <AnSection title="Workload by team member">
        {wlMembers.length === 0 ? (
          <div style={{ fontSize: 12.5, color: 'var(--color-text-tertiary)' }}>No active assignments.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={th}>Member</th>
                  <th style={th}>Role</th>
                  <th style={th}>Active releases</th>
                  <th style={th}>Pending reviews</th>
                  <th style={th}>Open bugs</th>
                </tr>
              </thead>
              <tbody>
                {wlMembers.map((w) => (
                  <tr key={w.m.id}>
                    <td style={{ ...td, fontWeight: 500 }}>{w.m.name}</td>
                    <td style={td}>{w.m.role}</td>
                    <td style={td}>{w.activeReleases}</td>
                    <td style={{ ...td, color: w.pendingReviews > 3 ? 'var(--danger)' : undefined, fontWeight: w.pendingReviews > 3 ? 700 : 400 }}>
                      {w.pendingReviews}
                    </td>
                    <td style={td}>{w.openBugs}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
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
                  v{r.version}{' '}
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

/* Manager Dashboard — the Analytics command center for Admins (manager == admin).
   Presentation follows the house design kit (see DESIGN_GUIDE.md). All numbers
   come from the shared metrics layer; nothing is fabricated. */
import { useState, useMemo } from 'react';
import { card, ModalShell, StatusBadge, SeverityBadge, Avatar, inputStyle } from '@/ui.jsx';
import { PageHeader, sideHead } from '@shared/ui-kit.jsx';
import { historicalBugs, filterReleases } from '@shared/filters.js';
import { computeReleaseMetrics, computeBottlenecks, computeWorkload } from '@shared/releaseMetrics.js';
import { aggregateBugMetrics, bugWorkflow, isActiveBug } from '@shared/bugMetrics.js';
import { ReleaseHistory } from './ReleaseHistory.jsx';
import {
  SubTabs, Segmented, StatBig, StatSmall, PassRing, Pill, AlertCard, Chevron, DataTable, passTone,
} from '@shared/dashboard-kit.jsx';
import { isClosedStatus, formatVersion } from '@/constants.js';

const ymd = (d) => d.toISOString().slice(0, 10);
function rangeWindow(range, from, to) {
  const now = new Date();
  if (range === 'week') { const d = new Date(now); d.setDate(d.getDate() - 7); return { from: ymd(d), to: ymd(now) }; }
  if (range === 'month') return { from: ymd(new Date(now.getFullYear(), now.getMonth(), 1)), to: ymd(now) };
  if (range === '3months') return { from: ymd(new Date(now.getFullYear(), now.getMonth() - 2, 1)), to: ymd(now) };
  return { from: from || '', to: to || '' };
}
function projectHealth(open, critical, passRate) {
  if (critical >= 5 || open >= 30 || passRate < 55) return { label: 'At Risk', tone: 'danger' };
  if (critical >= 1 || open >= 10 || passRate < 75) return { label: 'Needs Attention', tone: 'warning' };
  return { label: 'Healthy', tone: 'success' };
}
const BUG_STATUS_LABEL = { open: 'Open', in_progress: 'In Progress', fixed: 'Fixed', disputed: 'Needs Clarification', verified: 'Verified' };

export function ManagerDashboard({ projects, releases, bugs, profiles, teams, projectsById, profilesById, onOpenRelease }) {
  const [tab, setTab] = useState('overview');
  const [range, setRange] = useState('month');
  const [cFrom, setCFrom] = useState('');
  const [cTo, setCTo] = useState('');
  const [teamFilter, setTeamFilter] = useState('all');
  const [member, setMember] = useState(null);

  const releaseById = useMemo(() => Object.fromEntries(releases.map((r) => [r.id, r])), [releases]);
  const teamsById = useMemo(() => Object.fromEntries(teams.map((t) => [t.id, t])), [teams]);

  const win = rangeWindow(range, cFrom, cTo);
  const ctxR = { projectById: projectsById };
  const ctxB = { releaseById, projectById: projectsById };

  // HISTORICAL dataset — all releases (active + closed) = complete project history
  const relAll = filterReleases(releases, {}, ctxR);
  const bugsAll = historicalBugs(bugs, {}, ctxB);
  const relRange = filterReleases(releases, { from: win.from, to: win.to }, ctxR);

  const mAll = computeReleaseMetrics(relAll, bugsAll, { releaseById });
  const mRange = computeReleaseMetrics(relRange, bugsAll, { releaseById });
  const bugAgg = aggregateBugMetrics(bugsAll);
  // One bug = one row — straight counts, no dedup.
  const carriedAll = bugsAll.filter((b) => b.carriedForward).length;
  const wfAll = bugWorkflow(bugAgg);

  const devs = profiles.filter((p) => p.role === 'Developer');
  const qas = profiles.filter((p) => p.role === 'QA');
  const activeCritical = bugsAll.filter((b) => isActiveBug(b) && b.severity === 'critical').length;
  const prodBugs = bugsAll.filter((b) => (releaseById[b.releaseId]?.environment || 'Production') === 'Production').length;

  const teamRows = teams.map((t) => {
    const pids = new Set(projects.filter((p) => p.teamId === t.id).map((p) => p.id));
    const trel = relAll.filter((r) => pids.has(r.projectId));
    const tbugs = bugsAll.filter((b) => pids.has(releaseById[b.releaseId]?.projectId));
    const tm = computeReleaseMetrics(trel, tbugs, { releaseById });
    return { id: t.id, name: t.name, projects: pids.size, releases: trel.length, pass: tm.passRate, decided: tm.decided,
      open: tbugs.filter(isActiveBug).length, critical: tbugs.filter((b) => isActiveBug(b) && b.severity === 'critical').length, cycle: tm.cycleDays };
  });

  const memberRows = profiles.filter((p) => p.role !== 'Admin').map((p) => {
    const isQa = p.role === 'QA';
    const theirRel = relAll.filter((r) => (isQa ? r.assignedQa === p.id : r.submittedById === p.id));
    const relIds = new Set(theirRel.map((r) => r.id));
    const reported = bugsAll.filter((b) => b.createdById === p.id);
    const openOnTheirs = bugsAll.filter((b) => isActiveBug(b) && (isQa ? b.createdById === p.id : relIds.has(b.releaseId))).length;
    const pm = computeReleaseMetrics(theirRel, bugsAll, { releaseById });
    return { p, isQa, teamId: p.teamId, teamName: teamsById[p.teamId]?.name || '—',
      activeProjects: new Set(theirRel.filter((r) => !isClosedStatus(r.status)).map((r) => r.projectId)).size,
      releases: theirRel.length, reported: reported.length, open: openOnTheirs, pass: pm.passRate, decided: pm.decided };
  });
  const memberShown = teamFilter === 'all' ? memberRows : memberRows.filter((m) => m.teamId === teamFilter);

  const projectRows = projects.map((p) => {
    const prel = relAll.filter((r) => r.projectId === p.id);
    const active = prel.filter((r) => !isClosedStatus(r.status)).sort((a, b) => (a.date < b.date ? 1 : -1))[0];
    const pbugs = bugsAll.filter((b) => releaseById[b.releaseId]?.projectId === p.id);
    const open = pbugs.filter(isActiveBug).length;
    const crit = pbugs.filter((b) => isActiveBug(b) && b.severity === 'critical').length;
    const pm = computeReleaseMetrics(prel, pbugs, { releaseById });
    const rate = pm.decided ? pm.passRate : 100;
    return { id: p.id, name: p.name, team: teamsById[p.teamId]?.name || '—', active, open, crit, rate, decided: pm.decided, health: projectHealth(open, crit, rate) };
  });

  const workload = computeWorkload(profiles, relAll, bugsAll, 'all');

  const attention = (() => {
    const items = computeBottlenecks(relAll, bugsAll, { projectsById, profilesById, profiles, teams, teamFilter: 'all' });
    let best = null;
    devs.forEach((d) => {
      const dm = computeReleaseMetrics(relAll.filter((r) => r.submittedById === d.id), bugsAll, { releaseById });
      if (dm.decided >= 3 && (!best || dm.passRate > best.rate)) best = { name: d.name, rate: dm.passRate };
    });
    if (best) items.push({ level: 'ok', text: `${best.name} has kept a ${best.rate}% approval rate.` });
    return items;
  })();

  const pipelineStages = [
    { key: 'qa_pending', label: 'QA Pending', tone: 'warning' },
    { key: 'qa_in_progress', label: 'In QA', tone: 'info' },
    { key: 'qa_done', label: 'Awaiting Verify', tone: 'info' },
    { key: 'approved', label: 'Approved', tone: 'success' },
    { key: 'sent_back', label: 'Sent Back', tone: 'danger' },
    { key: 'closed', label: 'Closed', tone: 'neutral' },
  ].map((s) => ({ ...s, count: relAll.filter((r) => r.status === s.key).length }));

  return (
    <>
      <PageHeader title="Manager Dashboard" subtitle="Department-wide command center" />
      <SubTabs
        tabs={[['overview', 'Overview'], ['teams', 'Team Performance'], ['projects', 'Project Health'], ['analytics', 'Release & Bug Analytics']]}
        active={tab}
        onChange={setTab}
      />

      {/* dataset scope — executive reporting over the whole project history */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, fontSize: 12 }}>
        <span style={{ fontWeight: 700, padding: '2px 9px', borderRadius: 999, background: 'var(--brand-soft)', color: 'var(--brand-strong)' }}>
          Scope: Entire Project History
        </span>
        <span style={{ color: 'var(--color-text-tertiary)' }}>Metrics include all releases (active and closed).</span>
      </div>

      {tab === 'overview' && (
        <>
          {attention.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ ...sideHead, marginBottom: 10 }}>Attention required</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}>
                {attention.map((a, i) => <AlertCard key={i} level={a.level}>{a.text}</AlertCard>)}
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
            <Segmented options={[['week', 'This week'], ['month', 'This month'], ['3months', 'Last 3 months'], ['custom', 'Custom']]} value={range} onChange={setRange} />
            {range === 'custom' && (
              <>
                <input type="date" style={{ ...inputStyle, width: 'auto', padding: '6px 10px', fontSize: 12 }} value={cFrom} onChange={(e) => setCFrom(e.target.value)} />
                <input type="date" style={{ ...inputStyle, width: 'auto', padding: '6px 10px', fontSize: 12 }} value={cTo} onChange={(e) => setCTo(e.target.value)} />
              </>
            )}
          </div>

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
            <StatBig label="Projects" value={projects.length} accent="var(--brand)" />
            <StatBig label="Currently Active Bugs" value={bugAgg.active} accent="var(--danger)" />
            <StatBig label="Critical Bugs" value={activeCritical} accent={activeCritical ? 'var(--danger)' : 'var(--success)'} />
            <StatBig label="Average Release Cycle" value={mAll.cycleDays == null ? '—' : `${mAll.cycleDays.toFixed(1)}d`} accent="var(--brand)" />
            <PassRing pct={mAll.passRate} label="Overall QA pass rate" sub="approved ÷ decided" />
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20 }}>
            <StatSmall label="Teams" value={teams.length} />
            <StatSmall label="Developers" value={devs.length} />
            <StatSmall label="QA Engineers" value={qas.length} />
            <StatSmall label="Releases" value={relRange.length} sub="in range" />
            <StatSmall label="QA Approved" value={mRange.approved} color="var(--success)" sub="in range" />
            <StatSmall label="Returned for Rework" value={mRange.rejected} color={mRange.rejected ? 'var(--danger)' : undefined} sub="in range" />
            <StatSmall label="Production Bugs" value={prodBugs} color={prodBugs ? 'var(--danger)' : undefined} />
          </div>

          <div style={{ ...sideHead, marginBottom: 10 }}>Release pipeline</div>
          <Chevron stages={pipelineStages} />
        </>
      )}

      {tab === 'teams' && (
        <>
          <div style={{ ...sideHead, marginBottom: 10 }}>Team performance</div>
          <div style={{ marginBottom: 22 }}>
            <DataTable
              rows={teamRows}
              rowKey={(r) => r.id}
              columns={[
                { label: 'Team', render: (r) => <span style={{ fontWeight: 600 }}>{r.name}</span> },
                { label: 'Projects', render: (r) => r.projects },
                { label: 'Releases', render: (r) => r.releases },
                { label: 'Approval', render: (r) => (r.decided ? <Pill label={`${r.pass}%`} tone={passTone(r.pass)} /> : '—') },
                { label: 'Active Bugs', render: (r) => (r.open ? <Pill label={r.open} tone="danger" /> : 0) },
                { label: 'Critical', render: (r) => (r.critical ? <Pill label={r.critical} tone="danger" /> : 0) },
                { label: 'Avg release', render: (r) => (r.cycle == null ? '—' : `${r.cycle.toFixed(1)}d`) },
              ]}
            />
          </div>

          <div style={{ ...sideHead, marginBottom: 10 }}>Team member performance — click a person for full detail</div>
          <DataTable
            rows={memberShown}
            rowKey={(r) => r.p.id}
            searchText={(r) => r.p.name}
            searchPlaceholder="Search members…"
            onRowClick={(r) => setMember(r.p)}
            toolbar={<Segmented options={[['all', 'All teams'], ...teams.map((t) => [t.id, t.name])]} value={teamFilter} onChange={setTeamFilter} />}
            columns={[
              { label: 'Member', render: (r) => <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><Avatar name={r.p.name} size={24} /><span style={{ fontWeight: 600 }}>{r.p.name}</span></span> },
              { label: 'Role', render: (r) => <Pill label={r.p.role} tone={r.isQa ? 'info' : 'neutral'} /> },
              { label: 'Team', render: (r) => r.teamName },
              { label: 'Active projects', render: (r) => r.activeProjects },
              { label: 'Releases / Bugs', render: (r) => (r.isQa ? `${r.reported} reported` : `${r.releases} releases`) },
              { label: 'Active Bugs', render: (r) => (r.isQa ? '—' : r.open ? <Pill label={r.open} tone="danger" /> : 0) },
              { label: 'Approval', render: (r) => (r.decided ? <Pill label={`${r.pass}%`} tone={passTone(r.pass)} /> : '—') },
            ]}
          />
        </>
      )}

      {tab === 'projects' && (
        <>
          <div style={{ ...sideHead, marginBottom: 10 }}>Project health</div>
          <DataTable
            rows={projectRows}
            rowKey={(r) => r.id}
            searchText={(r) => r.name}
            searchPlaceholder="Search projects…"
            columns={[
              { label: 'Project', render: (r) => <span style={{ fontWeight: 600 }}>{r.name}</span> },
              { label: 'Team', render: (r) => r.team },
              { label: 'Active release', render: (r) => (r.active ? <span style={{ fontFamily: 'var(--font-mono)' }}>v{r.active.version}</span> : '—') },
              { label: 'Active Bugs', render: (r) => (r.open ? <Pill label={r.open} tone="danger" /> : 0) },
              { label: 'Critical', render: (r) => (r.crit ? <Pill label={r.crit} tone="danger" /> : 0) },
              { label: 'Pass rate', render: (r) => (r.decided ? <Pill label={`${r.rate}%`} tone={passTone(r.rate)} /> : '—') },
              { label: 'Health', render: (r) => <Pill label={r.health.label} tone={r.health.tone} /> },
            ]}
          />
        </>
      )}

      {tab === 'analytics' && (
        <>
          <div style={{ ...sideHead, marginBottom: 10 }}>Monthly trends</div>
          <div style={{ marginBottom: 22 }}><MonthlyCombo releases={relAll} bugs={bugsAll} /></div>

          <div style={{ ...sideHead, marginBottom: 10 }}>Bug Workflow</div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
            <StatSmall label="Total Bugs" value={wfAll.total} />
            <StatSmall label="Needs Development" value={wfAll.needsDev} color={wfAll.needsDev ? 'var(--danger)' : undefined} />
            <StatSmall label="Awaiting QA" value={wfAll.awaitingQa} color={wfAll.awaitingQa ? 'var(--warning)' : undefined} />
            <StatSmall label="Verified Bugs" value={wfAll.verified} color="var(--success)" />
            <StatSmall label="Carried Forward Bugs" value={carriedAll} color={carriedAll ? 'var(--warning)' : undefined} />
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--color-text-tertiary)', marginBottom: 22, lineHeight: 1.5 }}>
            Each bug is a single record — a carried-forward bug moves to the new build rather than being copied,
            so every count is a straight row count that reconciles with the KPIs.
          </div>

          <div style={{ ...sideHead, marginBottom: 10 }}>By severity &amp; environment</div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 22 }}>
            <StatSmall label="Critical Bugs" value={bugAgg.bySeverity.critical || 0} color={bugAgg.bySeverity.critical ? 'var(--danger)' : undefined} />
            <StatSmall label="Major Bugs" value={bugAgg.bySeverity.major || 0} />
            <StatSmall label="Minor Bugs" value={bugAgg.bySeverity.minor || 0} />
            <StatSmall label="Production Bugs" value={prodBugs} color={prodBugs ? 'var(--danger)' : undefined} />
          </div>

          <div style={{ ...sideHead, marginBottom: 10 }}>Release history — every release</div>
          <div style={{ fontSize: 11.5, color: 'var(--color-text-tertiary)', marginBottom: 10 }}>
            Complete audit across all teams and projects. Every bug exists only once — a carried-forward bug
            <strong> moves</strong> to the new build. Bug counts are historical (from each bug’s timeline):
            reported on this build vs. carried in, and they don’t change as bugs move on. Click a row to open the release.
          </div>
          <div style={{ marginBottom: 22 }}>
            <ReleaseHistory
              releases={relAll}
              projectsById={projectsById}
              profilesById={profilesById}
              onRowClick={(r) => onOpenRelease(r.id)}
              pageSize={15}
            />
          </div>

          <div style={{ ...sideHead, marginBottom: 10 }}>Workload</div>
          <DataTable
            rows={workload}
            rowKey={(w) => w.m.id}
            searchText={(w) => w.m.name}
            searchPlaceholder="Search members…"
            columns={[
              { label: 'Member', render: (w) => <span style={{ fontWeight: 600 }}>{w.m.name}</span> },
              { label: 'Team', render: (w) => teamsById[w.m.teamId]?.name || '—' },
              {
                label: 'Current workload',
                render: (w) => {
                  const parts = [];
                  if (w.activeReleases) parts.push(`${w.activeReleases} active release${w.activeReleases === 1 ? '' : 's'}`);
                  if (w.pendingReviews) parts.push(`${w.pendingReviews} under review`);
                  if (w.openBugs) parts.push(`${w.openBugs} bug${w.openBugs === 1 ? '' : 's'} to fix`);
                  const heavy = w.openBugs > 8 || w.pendingReviews > 3 || w.activeReleases > 3;
                  return <span style={{ color: heavy ? 'var(--danger)' : 'var(--color-text-secondary)', fontWeight: heavy ? 600 : 400 }}>{parts.join(' · ') || 'idle'}</span>;
                },
              },
            ]}
          />
        </>
      )}

      {member && (
        <MemberModal member={member} releases={relAll} bugs={bugsAll} projectsById={projectsById} teamsById={teamsById} onOpenRelease={onOpenRelease} onClose={() => setMember(null)} />
      )}
    </>
  );
}

function MonthlyCombo({ releases, bugs }) {
  const months = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, label: d.toLocaleString(undefined, { month: 'short' }), sub: 0, app: 0, bug: 0 });
  }
  const find = (k) => months.find((m) => m.key === k);
  releases.forEach((r) => {
    const s = find((r.date || '').slice(0, 7)); if (s) s.sub += 1;
    if (r.status === 'approved') { const a = find((r.qaCompletedAt || r.date || '').slice(0, 7)); if (a) a.app += 1; }
  });
  bugs.forEach((b) => { const m = find((b.createdAt || '').slice(0, 7)); if (m) m.bug += 1; });
  const W = 620, H = 220, pad = 34;
  const maxRel = Math.max(1, ...months.flatMap((m) => [m.sub, m.app]));
  const maxBug = Math.max(1, ...months.map((m) => m.bug));
  const x = (i) => pad + (i * (W - 2 * pad)) / (months.length - 1);
  const yRel = (v) => H - pad - (v / maxRel) * (H - 2 * pad);
  const yBug = (v) => H - pad - (v / maxBug) * (H - 2 * pad);
  const line = (key) => months.map((m, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${yRel(m[key])}`).join(' ');
  const bw = 16;
  return (
    <div style={{ ...card, padding: 16 }}>
      <div style={{ overflowX: 'auto' }}>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', minWidth: 480, height: 'auto' }}>
          {months.map((m, i) => (
            <rect key={m.key} x={x(i) - bw / 2} y={yBug(m.bug)} width={bw} height={H - pad - yBug(m.bug)} rx="3" fill="var(--danger)" opacity="0.18" />
          ))}
          <path d={line('sub')} fill="none" stroke="var(--brand)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
          <path d={line('app')} fill="none" stroke="var(--success)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
          {months.map((m, i) => (
            <g key={m.key}>
              <circle cx={x(i)} cy={yRel(m.sub)} r="3.5" fill="var(--brand)" />
              <circle cx={x(i)} cy={yRel(m.app)} r="3.5" fill="var(--success)" />
              <text x={x(i)} y={H - 10} textAnchor="middle" fontSize="11" fill="var(--color-text-tertiary)">{m.label}</text>
            </g>
          ))}
        </svg>
      </div>
      <div style={{ display: 'flex', gap: 14, marginTop: 8 }}>
        {[['Submitted', 'var(--brand)'], ['Approved', 'var(--success)'], ['Bugs reported', 'var(--danger)']].map(([l, c]) => (
          <span key={l} style={{ fontSize: 11.5, color: 'var(--color-text-secondary)', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: c }} /> {l}
          </span>
        ))}
      </div>
    </div>
  );
}

function MemberModal({ member, releases, bugs, projectsById, teamsById, onOpenRelease, onClose }) {
  const isQa = member.role === 'QA';
  const theirRel = releases.filter((r) => (isQa ? r.assignedQa === member.id : r.submittedById === member.id));
  const relIds = new Set(theirRel.map((r) => r.id));
  const theirBugs = bugs.filter((b) => (isQa ? b.createdById === member.id : relIds.has(b.releaseId)));
  const projIds = [...new Set(theirRel.map((r) => r.projectId))];
  const approved = theirRel.filter((r) => r.status === 'approved').length;
  const sentBack = theirRel.filter((r) => r.status === 'sent_back').length;

  return (
    <ModalShell onClose={onClose} title={member.name} maxWidth={640}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <Avatar name={member.name} size={40} />
        <div>
          <div style={{ fontSize: 12.5, color: 'var(--color-text-secondary)' }}>{member.role} · {teamsById[member.teamId]?.name || 'No team'}</div>
          <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>{member.email}</div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
        <StatSmall label={isQa ? 'Releases tested' : 'Releases'} value={theirRel.length} />
        <StatSmall label="QA Approved" value={approved} color="var(--success)" />
        <StatSmall label="Returned for Rework" value={sentBack} color={sentBack ? 'var(--danger)' : undefined} />
        <StatSmall label={isQa ? 'Bugs reported' : 'Active Bugs'} value={isQa ? theirBugs.length : theirBugs.filter(isActiveBug).length} />
      </div>
      <div style={{ ...sideHead, marginBottom: 8 }}>Assigned projects</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
        {projIds.length ? projIds.map((id) => <Pill key={id} label={projectsById[id]?.name || 'Unknown'} tone="neutral" />) : <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>None</span>}
      </div>
      <div style={{ ...sideHead, marginBottom: 8 }}>{isQa ? 'Review history' : 'Release history'}</div>
      <div style={{ ...card, padding: '2px 0', marginBottom: 16, maxHeight: 220, overflowY: 'auto' }}>
        {theirRel.length === 0 ? <div style={{ padding: '10px 12px', fontSize: 12, color: 'var(--color-text-tertiary)' }}>No releases.</div> : theirRel.slice(0, 40).map((r) => (
          <div key={r.id} className="mgr-row" onClick={() => { onClose(); onOpenRelease(r.id); }} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderTop: '1px solid var(--color-border-primary)', cursor: 'pointer' }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5, fontWeight: 600 }}>{formatVersion(r.version)}</span>
            <span style={{ fontSize: 12, color: 'var(--color-text-secondary)', flex: 1 }}>{projectsById[r.projectId]?.name}</span>
            <StatusBadge status={r.status} />
            <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{r.date}</span>
          </div>
        ))}
      </div>
      <div style={{ ...sideHead, marginBottom: 8 }}>Bug history</div>
      <div style={{ ...card, padding: '2px 0', maxHeight: 200, overflowY: 'auto' }}>
        {theirBugs.length === 0 ? <div style={{ padding: '10px 12px', fontSize: 12, color: 'var(--color-text-tertiary)' }}>No bugs.</div> : theirBugs.slice(0, 40).map((b) => (
          <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderTop: '1px solid var(--color-border-primary)' }}>
            <SeverityBadge severity={b.severity} />
            <span style={{ fontSize: 12.5, flex: 1, minWidth: 0 }}>{b.title}</span>
            <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{BUG_STATUS_LABEL[b.status] || b.status}</span>
          </div>
        ))}
      </div>
    </ModalShell>
  );
}

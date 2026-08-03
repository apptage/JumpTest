/* Manager Command Center — a hierarchical DRILL-DOWN pipeline, not a flat table
   dump: Team Overview → Developer → Project → Releases/Bugs/Health. Context
   auto-filters as you drill (pick a developer → everything scopes to them). Rows
   open read-only detail panels — never the operational DetailModal. */
import { useState, useMemo, useEffect } from 'react';
import * as api from '@/api.js';
import { card, ModalShell, Avatar, inputStyle } from '@/ui.jsx';
import { PageHeader, sideHead } from '@shared/ui-kit.jsx';
import { DataTable, Pill } from '@shared/dashboard-kit.jsx';
import { BugTimeline } from '@shared/bug-actions.jsx';
import { computeReleaseMetrics } from '@shared/releaseMetrics.js';
import { computeProjectWbsHealth, computeCompositeHealth, milestoneLabel, wbsPct } from '@shared/wbsMetrics.js';
import {
  STATUSES, SEVERITIES, BUG_STATUSES, formatVersion, isClosedStatus, isActiveBug, humanizeSince,
} from '@/constants.js';

const fmtDate = (d) => {
  if (!d) return '—';
  const dt = new Date(String(d).length <= 10 ? `${d}T00:00` : d);
  return Number.isNaN(dt.getTime()) ? '—' : dt.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
};
const daysBetween = (a, b) => { if (!a || !b) return null; const d = (new Date(b).getTime() - new Date(a).getTime()) / 86_400_000; return Number.isNaN(d) ? null : d; };
const HEALTH_RANK = { healthy: 0, attention: 1, at_risk: 2 };

/* thin progress bar */
function Bar({ pct }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 120 }}>
      <div style={{ flex: 1, height: 6, borderRadius: 999, background: 'var(--color-background-secondary)', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', borderRadius: 999, background: 'var(--brand)' }} />
      </div>
      <span className="tnum" style={{ fontSize: 11.5, color: 'var(--color-text-secondary)', minWidth: 30, textAlign: 'right' }}>{pct}%</span>
    </div>
  );
}
function HealthDot({ tone }) {
  const c = tone === 'success' ? 'var(--success)' : tone === 'warning' ? 'var(--warning)' : 'var(--danger)';
  return <span style={{ display: 'inline-block', width: 9, height: 9, borderRadius: '50%', background: c }} />;
}

export function CommandCenter({ projects, releases, bugs, profiles, teams, projectsById, profilesById }) {
  const [nav, setNav] = useState({ level: 'team' }); // { level, devId?, projectId?, from? }
  const [teamF, setTeamF] = useState('all');
  const [panel, setPanel] = useState(null);
  const [wbs, setWbs] = useState({ items: [], targets: [], loading: true });
  useEffect(() => {
    let cancelled = false;
    const ids = projects.map((p) => p.id);
    Promise.all([api.fetchWbsItemsForProjects(ids), api.fetchWbsPlatformTargetsForProjects(ids)])
      .then(([items, targets]) => !cancelled && setWbs({ items, targets, loading: false }))
      .catch(() => !cancelled && setWbs({ items: [], targets: [], loading: false }));
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects.map((p) => p.id).join(',')]);

  const nowMs = useMemo(() => Date.now(), []);
  const releaseById = useMemo(() => Object.fromEntries(releases.map((r) => [r.id, r])), [releases]);
  const teamsById = useMemo(() => Object.fromEntries(teams.map((t) => [t.id, t])), [teams]);
  const name = (id) => profilesById[id]?.name || '—';
  const devs = useMemo(() => profiles.filter((p) => p.role === 'Developer'), [profiles]);

  // ---- per-project rollup (health + active release + bugs) ----
  const projRows = useMemo(() => projects.map((p) => {
    const rel = releases.filter((r) => r.projectId === p.id).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    const pbugs = bugs.filter((b) => releaseById[b.releaseId]?.projectId === p.id);
    const items = wbs.items.filter((i) => i.projectId === p.id);
    const targets = wbs.targets.filter((t) => t.projectId === p.id);
    const wh = computeProjectWbsHealth(items, targets, nowMs);
    const openBugs = pbugs.filter(isActiveBug);
    const critical = openBugs.filter((b) => b.severity === 'critical').length;
    const active = rel.find((r) => !isClosedStatus(r.status)) || null;
    // canonical pass rate — SAME formula Analytics uses (approved-with-blocking-bugs
    // counts as rejected), so every dashboard reports the same number.
    const m = computeReleaseMetrics(rel, pbugs, { releaseById });
    const passRate = m.decided ? m.passRate : null;
    const health = computeCompositeHealth({ wbsPct: wh.hasWbs ? wh.pct : null, openBugs: openBugs.length, critical, passRate, milestoneRisk: wh.milestoneRisk });
    const pendingQa = rel.filter((r) => r.status === 'qa_pending').length;
    return { p, rel, pbugs, items, wh, openBugs: openBugs.length, critical, active, passRate, health, pendingQa, qaName: active?.assignedQa ? name(active.assignedQa) : '—' };
  }), [projects, releases, bugs, wbs.items, wbs.targets, releaseById, nowMs]);
  const projRowById = useMemo(() => Object.fromEntries(projRows.map((r) => [r.p.id, r])), [projRows]);

  // ---- per-developer rollup ----
  const devRows = useMemo(() => devs.map((d) => {
    const projIds = new Set();
    releases.forEach((r) => { if (r.submittedById === d.id) projIds.add(r.projectId); });
    wbs.items.forEach((i) => { if (i.assignedTo === d.id) projIds.add(i.projectId); });
    const projs = [...projIds].map((id) => projRowById[id]).filter(Boolean);
    const openBugs = projs.reduce((a, pr) => a + pr.pbugs.filter((b) => pr.rel.some((r) => r.submittedById === d.id && r.id === b.releaseId) && isActiveBug(b)).length, 0);
    const pendingQa = projs.reduce((a, pr) => a + pr.rel.filter((r) => r.submittedById === d.id && r.status === 'qa_pending').length, 0);
    const worst = projs.reduce((w, pr) => (HEALTH_RANK[pr.health.level] > HEALTH_RANK[w] ? pr.health.level : w), 'healthy');
    const health = { level: worst, label: { healthy: 'On track', attention: 'Needs attention', at_risk: 'At risk' }[worst], tone: { healthy: 'success', attention: 'warning', at_risk: 'danger' }[worst] };
    return { d, projs, openBugs, pendingQa, health };
  }).filter((dr) => dr.projs.length), [devs, releases, wbs.items, projRowById]);

  // team scope
  const inTeam = (teamId) => teamF === 'all' || teamId === teamF;
  const scopedProjRows = projRows.filter((r) => inTeam(r.p.teamId));
  const scopedDevRows = devRows.filter((dr) => inTeam(dr.d.teamId));

  const crumb = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginBottom: 16, flexWrap: 'wrap' }}>
      <button onClick={() => setNav({ level: 'team' })} style={crumbBtn(nav.level === 'team')}>Team Overview</button>
      {nav.level === 'developer' && <><Chev /><span style={{ fontWeight: 600 }}>{name(nav.devId)}</span></>}
      {nav.level === 'project' && (
        <>
          {nav.from === 'developer' && <><Chev /><button onClick={() => setNav({ level: 'developer', devId: nav.devId })} style={crumbBtn(false)}>{name(nav.devId)}</button></>}
          <Chev /><span style={{ fontWeight: 600 }}>{projectsById[nav.projectId]?.name}</span>
        </>
      )}
      {nav.level === 'team' && (
        <>
          <span style={{ flex: 1 }} />
          <select style={{ ...inputStyle, width: 'auto', padding: '6px 10px', fontSize: 12 }} value={teamF} onChange={(e) => setTeamF(e.target.value)}>
            <option value="all">All teams</option>
            {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </>
      )}
    </div>
  );

  const openProject = (projectId, from) => setNav({ level: 'project', projectId, from, devId: nav.devId });

  return (
    <>
      <PageHeader title="Command Center" subtitle="Team → Developer → Project drill-down" />
      {crumb}

      {nav.level === 'team' && (
        <TeamOverview
          devRows={scopedDevRows} projRows={scopedProjRows} teamsById={teamsById} wbsLoading={wbs.loading}
          onDeveloper={(id) => setNav({ level: 'developer', devId: id })}
          onProject={(id) => openProject(id, 'team')}
        />
      )}

      {nav.level === 'developer' && (
        <DeveloperView
          dev={profilesById[nav.devId]} row={devRows.find((r) => r.d.id === nav.devId)} teamsById={teamsById}
          onProject={(id) => openProject(id, 'developer')}
        />
      )}

      {nav.level === 'project' && (
        <ProjectView
          row={projRowById[nav.projectId]}
          dev={nav.from === 'developer' ? profilesById[nav.devId] : null}
          profilesById={profilesById} wbsLoading={wbs.loading}
          onRelease={(r) => setPanel({ kind: 'release', data: r })}
          onBug={(b) => setPanel({ kind: 'bug', data: b })}
        />
      )}

      {panel?.kind === 'release' && <ReleasePanel release={panel.data} bugs={bugs.filter((b) => b.releaseId === panel.data.id)} projectsById={projectsById} profilesById={profilesById} onClose={() => setPanel(null)} />}
      {panel?.kind === 'bug' && <BugPanel bug={panel.data} releaseById={releaseById} projectsById={projectsById} profilesById={profilesById} onClose={() => setPanel(null)} />}
    </>
  );
}

const crumbBtn = (active) => ({ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: active ? 700 : 500, color: active ? 'var(--color-text-primary)' : 'var(--brand)' });
const Chev = () => <span style={{ color: 'var(--color-text-tertiary)' }}>›</span>;

/* Actionable summary for a (developer, project) — the 10-second "read column 5"
   signal, driven by the developer's active build then project health. */
function summarize(pr, devActive) {
  const active = devActive || pr.active;
  const bugs = pr.openBugs;
  const s = active?.status;
  if (s === 'sent_back') return { tone: 'danger', label: 'STUCK IN QA', reason: `Build sent back${bugs ? ` · ${bugs} open bug${bugs === 1 ? '' : 's'}` : ''}.` };
  if (s === 'qa_pending') return { tone: 'warning', label: 'WAITING FOR QA', reason: `Submitted ${fmtDate(active.createdAt || active.date)} · pending review.` };
  if (s === 'qa_in_progress') return { tone: 'warning', label: 'IN QA', reason: 'Under QA review.' };
  if (s === 'qa_done') return { tone: 'warning', label: 'QA DONE', reason: 'Awaiting sign-off.' };
  if (pr.health.level === 'at_risk') return { tone: 'danger', label: 'AT RISK', reason: `${bugs} open bug${bugs === 1 ? '' : 's'}${pr.wh.hasWbs ? ` · WBS ${pr.wh.pct}%` : ''}.` };
  if (pr.health.level === 'attention') return { tone: 'warning', label: 'NEEDS ATTENTION', reason: `${bugs} open bug${bugs === 1 ? '' : 's'}${pr.wh.hasWbs ? ` · WBS ${pr.wh.pct}%` : ''}.` };
  return { tone: 'success', label: 'ON TRACK', reason: bugs ? `${bugs} open bug${bugs === 1 ? '' : 's'}.` : 'Released · 0 bugs.' };
}
const toneBg = (t) => (t === 'success' ? 'var(--tone-success-bg)' : t === 'warning' ? 'var(--tone-warning-bg)' : 'var(--tone-danger-bg)');
const toneFg = (t) => (t === 'success' ? 'var(--tone-success-fg)' : t === 'warning' ? 'var(--tone-warning-fg)' : 'var(--tone-danger-fg)');

/* the 5-column pipeline grid */
const STRIP_COLS = 'minmax(0, 1.3fr) minmax(0, 1.2fr) minmax(0, 1fr) minmax(0, 1.4fr)';

function BugsCell({ pr }) {
  const [hover, setHover] = useState(false);
  const top = pr.openBugs ? pr.pbugs.filter(isActiveBug).slice(0, 3) : [];
  const tone = pr.critical ? 'danger' : pr.openBugs ? 'warning' : 'success';
  return (
    <div style={{ position: 'relative' }} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 600, color: pr.openBugs ? (pr.critical ? 'var(--danger)' : 'var(--warning)') : 'var(--color-text-secondary)' }}>
        <HealthDot tone={tone} />{pr.openBugs} bug{pr.openBugs === 1 ? '' : 's'} open
      </span>
      <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 2 }}>{pr.critical} critical</div>
      {hover && top.length > 0 && (
        <div style={{ position: 'absolute', top: '100%', left: 0, zIndex: 20, marginTop: 4, minWidth: 200, ...card, boxShadow: 'var(--shadow-md)', padding: 8 }}>
          {top.map((b) => (
            <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, padding: '3px 2px' }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: SEVERITIES[b.severity]?.color || 'var(--danger)', flexShrink: 0 }} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.title}</span>
            </div>
          ))}
          {pr.openBugs > 3 && <div style={{ fontSize: 10.5, color: 'var(--color-text-tertiary)', marginTop: 3 }}>+{pr.openBugs - 3} more</div>}
        </div>
      )}
    </div>
  );
}

/* one project line inside a developer strip */
function ProjectLine({ pr, dev, wbsLoading, onProject }) {
  const [open, setOpen] = useState(false);
  const devReleases = pr.rel.filter((r) => r.submittedById === dev.id);
  const devActive = devReleases.find((r) => !isClosedStatus(r.status)) || pr.active;
  const sum = summarize(pr, devActive);
  const qaName = devActive?.assignedQa ? (pr.qaName) : '—';
  return (
    <div style={{ borderTop: '1px solid var(--color-border-primary)' }}>
      <div style={{ display: 'grid', gridTemplateColumns: STRIP_COLS, gap: 14, alignItems: 'center', padding: '12px 0' }}>
        {/* project + WBS */}
        <div>
          <button onClick={() => setOpen((v) => !v)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)', textAlign: 'left' }}>
            {pr.p.name} <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>{open ? '▾' : '▸'}</span>
          </button>
          <div style={{ marginTop: 6 }}>{pr.wh.hasWbs ? <Bar pct={pr.wh.pct} /> : <span style={{ fontSize: 11.5, color: 'var(--color-text-tertiary)' }}>{wbsLoading ? 'loading…' : 'no WBS'}</span>}</div>
        </div>
        {/* active release + QA */}
        <div>
          {devActive ? (
            <>
              <div className="tnum" style={{ fontSize: 13, fontWeight: 600 }}>{formatVersion(devActive.version)} <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--color-text-tertiary)' }}>{devActive.environment || 'Production'}</span></div>
              <div style={{ fontSize: 11.5, color: 'var(--color-text-secondary)', marginTop: 2 }}>QA: {qaName}</div>
              <div style={{ marginTop: 4 }}><Pill label={STATUSES[devActive.status]?.label || devActive.status} tone={devActive.status === 'approved' ? 'success' : devActive.status === 'sent_back' ? 'danger' : isClosedStatus(devActive.status) ? 'neutral' : 'warning'} /></div>
            </>
          ) : <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>No active build</span>}
        </div>
        {/* bugs */}
        <BugsCell pr={pr} />
        {/* actionable summary */}
        <button onClick={() => onProject(pr.p.id)} style={{ textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 700, padding: '3px 10px', borderRadius: 999, background: toneBg(sum.tone), color: toneFg(sum.tone) }}>
            <HealthDot tone={sum.tone} />{sum.label}
          </span>
          <div style={{ fontSize: 11.5, color: 'var(--color-text-secondary)', marginTop: 4, lineHeight: 1.4 }}>{sum.reason}</div>
        </button>
      </div>
      {open && (
        <div style={{ padding: '0 0 12px 12px' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-tertiary)', marginBottom: 6 }}>Release history</div>
          {devReleases.length === 0 ? <div style={{ fontSize: 11.5, color: 'var(--color-text-tertiary)' }}>None.</div> : devReleases.map((r) => (
            <div key={r.id} style={{ display: 'flex', gap: 10, fontSize: 11.5, padding: '3px 0' }}>
              <span className="tnum" style={{ minWidth: 90, fontWeight: 600 }}>{formatVersion(r.version)}</span>
              <span style={{ color: 'var(--color-text-tertiary)' }}>{STATUSES[r.status]?.label || r.status}</span>
              <span style={{ color: 'var(--color-text-tertiary)' }}>{fmtDate(r.createdAt || r.date)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DeveloperStrip({ row, teamsById, wbsLoading, onDeveloper, onProject }) {
  const { d, projs } = row;
  return (
    <div style={{ ...card, padding: 0, marginBottom: 14, overflow: 'hidden' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '210px 1fr', gap: 0 }}>
        {/* developer column */}
        <div style={{ padding: 16, borderRight: '1px solid var(--color-border-primary)', background: 'var(--color-background-secondary)' }}>
          <button onClick={() => onDeveloper(d.id)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left' }}>
            <Avatar name={d.name} size={34} />
            <div>
              <div style={{ fontSize: 13.5, fontWeight: 700 }}>{d.name}</div>
              <div style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>{teamsById[d.teamId]?.name || 'No team'}</div>
            </div>
          </button>
          <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>{projs.length} project{projs.length === 1 ? '' : 's'}</span>
            {row.openBugs > 0 && <span style={{ fontSize: 11, color: 'var(--danger)', fontWeight: 600 }}>{row.openBugs} bugs</span>}
          </div>
        </div>
        {/* project lines */}
        <div style={{ padding: '0 16px' }}>
          {projs.map((pr) => <ProjectLine key={pr.p.id} pr={pr} dev={d} wbsLoading={wbsLoading} onProject={onProject} />)}
        </div>
      </div>
    </div>
  );
}

/* ---------- Level 1: Team Overview (Kanban pipeline) ---------- */
function TeamOverview({ devRows, projRows, teamsById, wbsLoading, onDeveloper, onProject }) {
  // projects not owned by any developer strip — surface so nothing is hidden
  const stripped = new Set();
  devRows.forEach((dr) => dr.projs.forEach((pr) => stripped.add(pr.p.id)));
  const orphanProjects = projRows.filter((r) => !stripped.has(r.p.id));
  return (
    <>
      {/* column headers */}
      <div style={{ display: 'grid', gridTemplateColumns: '210px 1fr', marginBottom: 6 }}>
        <div style={{ ...sideHead, paddingLeft: 16 }}>Developer</div>
        <div style={{ display: 'grid', gridTemplateColumns: STRIP_COLS, gap: 14, paddingLeft: 16 }}>
          <span style={sideHead}>Assigned projects</span>
          <span style={sideHead}>Active release & QA</span>
          <span style={sideHead}>Bugs & health</span>
          <span style={sideHead}>Actionable summary</span>
        </div>
      </div>

      {devRows.length === 0 ? (
        <div style={{ ...card, padding: 24, textAlign: 'center', fontSize: 13, color: 'var(--color-text-tertiary)' }}>No developers with assigned projects.</div>
      ) : (
        devRows.map((row) => <DeveloperStrip key={row.d.id} row={row} teamsById={teamsById} wbsLoading={wbsLoading} onDeveloper={onDeveloper} onProject={onProject} />)
      )}

      {orphanProjects.length > 0 && (
        <div style={{ marginTop: 18 }}>
          <div style={{ ...sideHead, marginBottom: 8 }}>Projects with no active developer</div>
          <div style={{ ...card, padding: '4px 14px' }}>
            {orphanProjects.map((r, i) => (
              <button key={r.p.id} onClick={() => onProject(r.p.id)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '9px 0', border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', borderTop: i === 0 ? 'none' : '1px solid var(--color-border-primary)' }}>
                <span style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{r.p.name}</span>
                {r.wh.hasWbs && <span style={{ width: 120 }}><Bar pct={r.wh.pct} /></span>}
                <span style={{ fontSize: 12, color: r.openBugs ? 'var(--danger)' : 'var(--color-text-tertiary)' }}>{r.openBugs} bugs</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 }}><HealthDot tone={r.health.tone} />{r.health.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

/* ---------- Level 2: Developer View ---------- */
function DeveloperView({ dev, row, teamsById, onProject }) {
  if (!dev || !row) return <div style={{ fontSize: 13, color: 'var(--color-text-tertiary)' }}>No data for this developer.</div>;
  return (
    <>
      <div style={{ ...card, padding: 18, marginBottom: 18, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <Avatar name={dev.name} size={44} />
        <div style={{ flex: 1, minWidth: 160 }}>
          <div style={{ fontSize: 17, fontWeight: 700 }}>{dev.name}</div>
          <div style={{ fontSize: 12.5, color: 'var(--color-text-secondary)' }}>{dev.role} · {teamsById[dev.teamId]?.name || 'No team'}</div>
        </div>
        <div style={{ display: 'flex', gap: 20, fontSize: 13 }}>
          <div><div style={{ fontSize: 22, fontWeight: 700, fontFamily: 'var(--font-display)' }}>{row.projs.length}</div><div style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>projects</div></div>
          <div><div style={{ fontSize: 22, fontWeight: 700, fontFamily: 'var(--font-display)', color: row.openBugs ? 'var(--danger)' : undefined }}>{row.openBugs}</div><div style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>open bugs</div></div>
          <div><div style={{ fontSize: 22, fontWeight: 700, fontFamily: 'var(--font-display)' }}>{row.pendingQa}</div><div style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>pending QA</div></div>
        </div>
      </div>

      <div style={{ ...sideHead, marginBottom: 10 }}>Assigned projects</div>
      <DataTable
        rows={row.projs} rowKey={(r) => r.p.id} searchText={(r) => r.p.name} searchPlaceholder="Search projects…" onRowClick={(r) => onProject(r.p.id)}
        columns={[
          { label: 'Project', render: (r) => <span style={{ fontWeight: 600 }}>{r.p.name}</span> },
          { label: 'Active release', render: (r) => (r.active ? <span className="tnum">{formatVersion(r.active.version)} <span style={{ color: 'var(--color-text-tertiary)', fontSize: 11 }}>{STATUSES[r.active.status]?.label}</span></span> : '—') },
          { label: 'Open bugs', render: (r) => (r.critical ? <span style={{ color: 'var(--danger)', fontWeight: 700 }}>{r.openBugs} ({r.critical} crit)</span> : r.openBugs), tdStyle: { textAlign: 'right' }, thStyle: { textAlign: 'right' } },
          { label: 'WBS', render: (r) => (r.wh.hasWbs ? <Bar pct={r.wh.pct} /> : '—') },
          { label: 'Health', render: (r) => <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><HealthDot tone={r.health.tone} />{r.health.label}</span> },
        ]}
      />
    </>
  );
}

/* ---------- Level 3: Project View ---------- */
function ProjectView({ row, dev, profilesById, wbsLoading, onRelease, onBug }) {
  if (!row) return <div style={{ fontSize: 13, color: 'var(--color-text-tertiary)' }}>No data for this project.</div>;
  const { p } = row;
  const name = (id) => profilesById[id]?.name || '—';
  const devId = dev?.id || null;

  // Drilled in via a developer → auto-scope releases + bugs to their work.
  const rel = devId ? row.rel.filter((r) => r.submittedById === devId) : row.rel;
  const relIds = new Set(rel.map((r) => r.id));
  const pbugs = devId ? row.pbugs.filter((b) => relIds.has(b.releaseId)) : row.pbugs;
  const openBugs = pbugs.filter(isActiveBug);
  const critical = openBugs.filter((b) => b.severity === 'critical').length;
  // canonical pass rate (same as Analytics) over the scoped release set
  const relById = Object.fromEntries(rel.map((r) => [r.id, r]));
  const m = computeReleaseMetrics(rel, pbugs, { releaseById: relById });
  const passRate = m.decided ? m.passRate : null;

  // WBS scoped to the developer's OWN assigned items when they own any in this
  // project; otherwise fall back to the project-wide WBS (assignment not set).
  const devItems = devId ? row.items.filter((i) => i.assignedTo === devId) : [];
  const useDevWbs = devId && devItems.length > 0;
  const scopedWork = (useDevWbs ? devItems : row.items).filter((i) => i.type !== 'milestone');
  const hasWbs = scopedWork.length > 0;
  const pct = useDevWbs ? wbsPct(devItems) : row.wh.pct;
  const blocked = useDevWbs ? devItems.filter((i) => i.status === 'blocked').length : row.wh.blocked;
  const milestoneRisk = row.wh.milestoneRisk;
  const health = computeCompositeHealth({ wbsPct: hasWbs ? pct : null, openBugs: openBugs.length, critical, passRate, milestoneRisk });
  const ml = milestoneLabel(milestoneRisk);
  return (
    <>
      {/* health header */}
      <div style={{ ...card, padding: 18, marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
          <span style={{ fontSize: 17, fontWeight: 700 }}>{p.name}</span>
          {devId && <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--brand)', background: 'var(--brand-soft)', padding: '2px 9px', borderRadius: 999 }}>Scoped to {dev.name}</span>}
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 11px', borderRadius: 999, fontSize: 12, fontWeight: 600, background: health.tone === 'success' ? 'var(--tone-success-bg)' : health.tone === 'warning' ? 'var(--tone-warning-bg)' : 'var(--tone-danger-bg)', color: health.tone === 'success' ? 'var(--tone-success-fg)' : health.tone === 'warning' ? 'var(--tone-warning-fg)' : 'var(--tone-danger-fg)' }}>
            <HealthDot tone={health.tone} />{health.label}
          </span>
          {milestoneRisk !== 'none' && <Pill label={`Milestone: ${ml.label}`} tone={ml.tone} />}
        </div>
        <div style={{ display: 'flex', gap: 26, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 200 }}>
            <div style={{ fontSize: 11.5, color: 'var(--color-text-secondary)', marginBottom: 4 }}>WBS completion{useDevWbs ? ' (their items)' : ''}</div>
            {hasWbs ? <Bar pct={pct} /> : <span style={{ fontSize: 12.5, color: 'var(--color-text-tertiary)' }}>{wbsLoading ? 'Loading…' : 'No WBS'}</span>}
          </div>
          <Stat label="Bug density" value={`${openBugs.length} open`} sub={`${critical} critical`} danger={critical > 0} />
          <Stat label="WBS blocked" value={blocked} danger={blocked > 0} />
          <Stat label="Pass rate" value={passRate == null ? '—' : `${passRate}%`} />
        </div>
      </div>

      {/* releases pipeline */}
      <div style={{ ...sideHead, marginBottom: 10 }}>Releases</div>
      <div style={{ marginBottom: 22 }}>
        <DataTable
          rows={rel} rowKey={(r) => r.id} searchText={(r) => r.version} searchPlaceholder="Search releases…" onRowClick={onRelease}
          columns={[
            { label: 'Version', render: (r) => <span className="tnum" style={{ fontWeight: 600 }}>{formatVersion(r.version)}</span> },
            { label: 'Env', render: (r) => r.environment || 'Production' },
            { label: 'Submitted by', render: (r) => r.submittedBy || name(r.submittedById) },
            { label: 'QA', render: (r) => name(r.assignedQa) },
            { label: 'QA status', render: (r) => <Pill label={STATUSES[r.status]?.label || r.status} tone={r.status === 'approved' ? 'success' : r.status === 'sent_back' ? 'danger' : isClosedStatus(r.status) ? 'neutral' : 'info'} /> },
            { label: 'Submitted', render: (r) => fmtDate(r.createdAt || r.date), tdStyle: { whiteSpace: 'nowrap' } },
          ]}
        />
      </div>

      {/* bugs */}
      <div style={{ ...sideHead, marginBottom: 10 }}>Bugs</div>
      <DataTable
        rows={pbugs.slice().sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))} rowKey={(b) => b.id} searchText={(b) => b.title} searchPlaceholder="Search bugs…" onRowClick={onBug}
        columns={[
          { label: 'Bug', render: (b) => <span style={{ fontWeight: 500 }}>{b.title}</span> },
          { label: 'Severity', render: (b) => <span style={{ color: SEVERITIES[b.severity]?.color, fontWeight: 600 }}>{SEVERITIES[b.severity]?.label || b.severity}</span> },
          { label: 'Status', render: (b) => <Pill label={BUG_STATUSES[b.status]?.label || b.status} tone={b.status === 'verified' ? 'success' : 'neutral'} /> },
          { label: 'Reporter', render: (b) => name(b.createdById) },
          { label: 'Resolve time', render: (b) => { const d = daysBetween(b.createdAt, b.verifiedAt); return d == null ? '—' : `${d.toFixed(1)}d`; }, tdStyle: { textAlign: 'right' }, thStyle: { textAlign: 'right' } },
        ]}
      />
    </>
  );
}
function Stat({ label, value, sub, danger }) {
  return (
    <div>
      <div style={{ fontSize: 11.5, color: 'var(--color-text-secondary)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'var(--font-display)', color: danger ? 'var(--danger)' : undefined }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{sub}</div>}
    </div>
  );
}

/* ---------- read-only detail panels ---------- */
function Field({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '7px 0', borderBottom: '1px solid var(--color-border-primary)' }}>
      <span style={{ fontSize: 12.5, color: 'var(--color-text-secondary)' }}>{label}</span>
      <span style={{ fontSize: 12.5, fontWeight: 500, textAlign: 'right' }}>{value}</span>
    </div>
  );
}

function ReleasePanel({ release: r, bugs, projectsById, profilesById, onClose }) {
  const [tasks, setTasks] = useState([]);
  useEffect(() => { let c = false; api.fetchReleaseTasks(r.id).then((t) => !c && setTasks(t)).catch(() => {}); return () => { c = true; }; }, [r.id]);
  const name = (id) => profilesById[id]?.name || '—';
  return (
    <ModalShell onClose={onClose} title={`${formatVersion(r.version)} · ${projectsById[r.projectId]?.name || ''}`} subtitle={`${r.platform}${r.component ? ` · ${r.component}` : ''} · ${r.environment || 'Production'} · ${STATUSES[r.status]?.label || r.status}`} maxWidth={640}>
      <Field label="Submitted by" value={r.submittedBy || name(r.submittedById)} />
      <Field label="QA" value={name(r.assignedQa)} />
      <Field label="Submitted" value={fmtDate(r.createdAt || r.date)} />
      <Field label="QA completed" value={fmtDate(r.qaCompletedAt)} />
      {r.closedAt && <Field label="Closed" value={fmtDate(r.closedAt)} />}
      <Field label="Bugs on this build" value={bugs.length} />
      {r.releaseNotes && (
        <div style={{ marginTop: 12 }}>
          <div style={{ ...sideHead, marginBottom: 6 }}>Release notes</div>
          <div style={{ fontSize: 12.5, whiteSpace: 'pre-wrap', color: 'var(--color-text-secondary)' }}>{r.releaseNotes}</div>
        </div>
      )}
      {tasks.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div style={{ ...sideHead, marginBottom: 6 }}>WBS tasks ({tasks.length})</div>
          <div style={{ ...card, padding: '4px 12px' }}>{tasks.map((t, i) => <div key={t.id} style={{ fontSize: 12.5, padding: '6px 0', borderBottom: i === tasks.length - 1 ? 'none' : '1px solid var(--color-border-primary)' }}>{t.taskName}</div>)}</div>
        </div>
      )}
      {bugs.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div style={{ ...sideHead, marginBottom: 6 }}>Bugs ({bugs.length})</div>
          <div style={{ ...card, padding: '4px 12px' }}>
            {bugs.map((b, i) => (
              <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, padding: '6px 0', borderBottom: i === bugs.length - 1 ? 'none' : '1px solid var(--color-border-primary)' }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: SEVERITIES[b.severity]?.color || 'var(--danger)' }} />
                <span style={{ flex: 1 }}>{b.title}</span>
                <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{BUG_STATUSES[b.status]?.label || b.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </ModalShell>
  );
}

function BugPanel({ bug: b, releaseById, projectsById, profilesById, onClose }) {
  const [comments, setComments] = useState([]);
  useEffect(() => { let c = false; api.fetchBugComments(b.id).then((x) => !c && setComments(x)).catch(() => {}); return () => { c = true; }; }, [b.id]);
  const rel = releaseById[b.releaseId];
  const name = (id) => profilesById[id]?.name || '—';
  const ttr = daysBetween(b.createdAt, b.verifiedAt);
  return (
    <ModalShell onClose={onClose} title={b.title} subtitle={`${SEVERITIES[b.severity]?.label || b.severity} · ${BUG_STATUSES[b.status]?.label || b.status}`} maxWidth={640}>
      <Field label="Reporter" value={name(b.createdById)} />
      <Field label="Release" value={rel ? `${formatVersion(rel.version)} · ${projectsById[rel.projectId]?.name || ''}` : '—'} />
      <Field label="Created" value={fmtDate(b.createdAt)} />
      <Field label="Verified" value={fmtDate(b.verifiedAt)} />
      <Field label="Time to resolve" value={ttr == null ? '—' : `${ttr.toFixed(1)}d`} />
      {b.carriedForward && <Field label="Carried forward" value="Yes" />}
      {b.resolution && <Field label="Resolution" value={b.resolution} />}
      {b.description && (
        <div style={{ marginTop: 12 }}>
          <div style={{ ...sideHead, marginBottom: 6 }}>Description</div>
          <div style={{ fontSize: 12.5, whiteSpace: 'pre-wrap', color: 'var(--color-text-secondary)' }}>{b.description}</div>
        </div>
      )}
      {b.screenshotUrl && <div style={{ marginTop: 12 }}><a href={b.screenshotUrl} target="_blank" rel="noreferrer" style={{ fontSize: 12.5 }}>View screenshot ↗</a></div>}
      <div style={{ marginTop: 14 }}><BugTimeline bugId={b.id} releasesById={releaseById} /></div>
      {comments.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div style={{ ...sideHead, marginBottom: 6 }}>Comments ({comments.length})</div>
          <div style={{ ...card, padding: '4px 12px' }}>
            {comments.map((c, i) => (
              <div key={c.id} style={{ padding: '7px 0', borderBottom: i === comments.length - 1 ? 'none' : '1px solid var(--color-border-primary)' }}>
                <div style={{ fontSize: 11.5, color: 'var(--color-text-tertiary)' }}>{c.authorName} · {humanizeSince(c.createdAt)}</div>
                <div style={{ fontSize: 12.5 }}>{c.body}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </ModalShell>
  );
}

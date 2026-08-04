/* Project Hub — the member-facing planning layer ABOVE releases. One destination
   per project: Overview (health rollup) · Plan (WBS) · Builds · Team · Bugs.
   It plans and links work but never bypasses the QA gate — submit still picks WBS
   tasks into a release, and WBS-done ≠ release-approved, pass-rate ≠ WBS %.

   Reuses existing building blocks: computeProjectWbsHealth / computeCompositeHealth
   (wbsMetrics), computeReleaseMetrics, WbsPage (Plan), ReleaseHistory (Builds),
   ProjectMembersSection (Team) and filterBugs (Bugs). WBS isn't loaded globally, so
   the hub fetches it per-project the same way the Command Center does. */
import { useState, useEffect } from 'react';
import * as api from '@/api.js';
import { card, ghostButton, primaryButton, Avatar, StatusBadge, SeverityBadge, TypeBadge, CountBadge, inputStyle } from '@/ui.jsx';
import { SubTabs, DataTable, Pill, StatCard, TONES } from '@shared/dashboard-kit.jsx';
import { relativeTime, StatusAge } from '@shared/ui-kit.jsx';
import { computeProjectWbsHealth, computeCompositeHealth, milestoneLabel } from '@shared/wbsMetrics.js';
import { computeReleaseMetrics } from '@shared/releaseMetrics.js';
import { filterBugs } from '@shared/filters.js';
import { isActiveBug, isActiveStatus, isClosedStatus, formatVersion } from '@/constants.js';
import { IconPackage, IconBug, IconTree, IconFolder } from '@/icons.jsx';
import { WbsPage } from '@features/wbs';
import { ReleaseHistory } from '@features/analytics/ReleaseHistory.jsx';
import { ProjectMembersSection } from '@features/admin';

function HealthDot({ tone = 'neutral', size = 10 }) {
  const t = TONES[tone] || TONES.neutral;
  return <span style={{ width: size, height: size, borderRadius: 999, background: t.fg, display: 'inline-block', flexShrink: 0 }} />;
}

const panelHead = { fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700, letterSpacing: 'var(--tracking-tight)' };
const panelSub = { fontSize: 11.5, color: 'var(--color-text-tertiary)', marginTop: 2 };

/* ---- project picker (shown when no project is selected) ---- */
function ProjectPicker({ projects, releases, bugs, releaseById, onOpen }) {
  const rows = projects.map((p) => {
    const rel = releases.filter((r) => r.projectId === p.id);
    const pbugs = bugs.filter((b) => releaseById[b.releaseId]?.projectId === p.id);
    const open = pbugs.filter(isActiveBug).length;
    const active = rel.find((r) => !isClosedStatus(r.status)) || null;
    return { p, builds: rel.length, open, active };
  });
  return (
    <div className="anim-in" style={{ maxWidth: 1460, margin: '0 auto' }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 26, fontWeight: 800, margin: 0, letterSpacing: '-0.02em' }}>Projects</h1>
        <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', margin: '5px 0 0' }}>
          Open a project to plan work, track builds, and see its health in one place.
        </p>
      </div>
      {rows.length === 0 ? (
        <div style={{ ...card, padding: 48, textAlign: 'center' }}>
          <div style={{ display: 'inline-flex', marginBottom: 10, color: 'var(--color-text-tertiary)' }}><IconFolder size={30} /></div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>No projects yet</div>
          <div style={{ fontSize: 12.5, color: 'var(--color-text-tertiary)', marginTop: 4 }}>You're not a member of any project.</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
          {rows.map(({ p, builds, open, active }) => (
            <button
              key={p.id}
              onClick={() => onOpen(p.id)}
              className="mgr-card clickable"
              style={{ ...card, padding: 18, textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', flexDirection: 'column', gap: 12 }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ display: 'inline-flex', color: 'var(--brand)' }}><IconPackage size={18} /></span>
                <span style={{ fontSize: 15, fontWeight: 700, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                {p.type && <TypeBadge type={p.type} />}
              </div>
              <div style={{ display: 'flex', gap: 16, fontSize: 12 }}>
                <span style={{ color: 'var(--color-text-secondary)' }}>{builds} build{builds === 1 ? '' : 's'}</span>
                <span style={{ color: open ? 'var(--danger)' : 'var(--color-text-secondary)', fontWeight: open ? 600 : 400 }}>{open} open bug{open === 1 ? '' : 's'}</span>
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--color-text-tertiary)' }}>
                {active ? <>Active build v{formatVersion(active.version)} · {active.platform}</> : 'No active build'}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---- Overview tab ---- */
function OverviewTab({ project, rel, pbugs, wh, wbsLoading, openBugs, critical, active, passRate, health, profilesById, onOpenRelease, onTab }) {
  const ms = milestoneLabel(wh.milestoneRisk);
  return (
    <div>
      {/* health banner */}
      <div style={{ ...card, padding: 18, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <HealthDot tone={health.tone} size={14} />
        <div style={{ flex: 1, minWidth: 180 }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>{health.label}</div>
          <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>Composite health — WBS progress, open bugs & QA pass rate combined</div>
        </div>
        <Pill label={ms.label} tone={ms.tone} />
      </div>

      {/* KPI row */}
      <div className="dash-kpis" style={{ marginBottom: 16 }}>
        <StatCard label="WBS Progress" value={wbsLoading ? '…' : wh.hasWbs ? `${wh.pct}%` : '—'} foot={wh.hasWbs ? `${wh.completed}/${wh.total} TASKS` : 'NO WBS YET'} />
        <StatCard label="Open Bugs" value={openBugs.length.toLocaleString()} foot={`${critical} CRITICAL`} />
        <StatCard label="Builds" value={rel.length.toLocaleString()} foot="ALL TIME" />
        <StatCard label="Pass Rate" value={passRate != null ? `${passRate}%` : '—'} foot="QA DECISIONS" />
        <StatCard label="Blocked Tasks" value={wbsLoading ? '…' : (wh.blocked || 0).toLocaleString()} foot="WBS BLOCKED" />
      </div>

      <div className="dash-mid">
        {/* active build + WBS by platform */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ ...card, padding: 18 }}>
            <div style={panelHead}>Active build</div>
            {active ? (
              <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 15, fontWeight: 700 }}>v{formatVersion(active.version)}</span>
                <StatusBadge status={active.status} />
                <StatusAge release={active} />
                <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{active.platform}</span>
                <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>
                  QA: {active.assignedQa ? profilesById[active.assignedQa]?.name || '—' : 'Unassigned'}
                </span>
                <span style={{ flex: 1 }} />
                <button style={ghostButton} onClick={() => onOpenRelease(active.id)}>Open</button>
              </div>
            ) : (
              <div style={{ marginTop: 10, fontSize: 12.5, color: 'var(--color-text-tertiary)' }}>No active build — everything is closed or approved.</div>
            )}
          </div>

          <div style={{ ...card, padding: 18 }}>
            <div style={panelHead}>WBS by platform</div>
            <div style={panelSub}>Completion vs milestone target</div>
            {wbsLoading ? (
              <div style={{ marginTop: 14, fontSize: 12.5, color: 'var(--color-text-tertiary)' }}>Loading WBS…</div>
            ) : !wh.hasWbs ? (
              <div style={{ marginTop: 14, fontSize: 12.5, color: 'var(--color-text-tertiary)' }}>
                No WBS for this project yet. <button style={{ ...ghostButton, padding: '4px 10px', marginLeft: 6 }} onClick={() => onTab('plan')}>Open Plan</button>
              </div>
            ) : (
              <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 14 }}>
                {wh.byPlatform.map((pl) => {
                  const risk = milestoneLabel(pl.risk);
                  return (
                    <div key={pl.platform}>
                      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
                        <span style={{ fontSize: 13, fontWeight: 500 }}>{pl.platform}</span>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                          {pl.risk && pl.risk !== 'none' && <Pill label={risk.label} tone={risk.tone} />}
                          <span className="tnum" style={{ fontSize: 12.5, color: 'var(--color-text-secondary)' }}>{pl.pct}%</span>
                        </span>
                      </div>
                      <div style={{ height: 6, borderRadius: 999, background: 'var(--color-background-secondary)', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${Math.max(2, pl.pct)}%`, borderRadius: 999, background: 'var(--brand)' }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* WBS by module */}
        <div style={{ ...card, padding: 18 }}>
          <div style={panelHead}>WBS by module</div>
          <div style={panelSub}>Progress per feature area</div>
          {wbsLoading ? (
            <div style={{ marginTop: 14, fontSize: 12.5, color: 'var(--color-text-tertiary)' }}>Loading…</div>
          ) : !wh.hasWbs || wh.byModule.length === 0 ? (
            <div style={{ marginTop: 14, fontSize: 12.5, color: 'var(--color-text-tertiary)' }}>No modules yet.</div>
          ) : (
            <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 12, maxHeight: 360, overflowY: 'auto' }}>
              {wh.byModule.map((mod) => (
                <div key={mod.module}>
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 5 }}>
                    <span style={{ fontSize: 12.5, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{mod.module}</span>
                    <span className="tnum" style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                      {mod.completed}/{mod.total}{mod.blocked ? ` · ${mod.blocked} blocked` : ''}
                    </span>
                  </div>
                  <div style={{ height: 5, borderRadius: 999, background: 'var(--color-background-secondary)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${Math.max(3, mod.pct)}%`, borderRadius: 999, background: mod.blocked ? 'var(--danger)' : 'var(--brand)' }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---- Team tab: workload strip + full member manager ---- */
function TeamTab({ project, members, profiles, profilesById, wbsItems, rel, pbugs, timeLogs = [], canManage, currentUser, isSubmitting, onAddMember, onUpdateMember, onRemoveMember }) {
  const memberRows = members.map((mem) => {
    const prof = profilesById[mem.userId];
    const assigned = wbsItems.filter((i) => i.assignedTo === mem.userId).length;
    const activeBuilds = rel.filter((r) => r.submittedById === mem.userId && isActiveStatus(r.status)).length;
    const openBugs = pbugs.filter((b) => b.createdById === mem.userId && isActiveBug(b)).length;
    const logged = timeLogs.filter((l) => l.userId === mem.userId).reduce((s, l) => s + l.hours, 0);
    return { mem, prof, assigned, activeBuilds, openBugs, logged };
  });
  return (
    <div>
      <div style={{ ...card, padding: 18, marginBottom: 16 }}>
        <div style={panelHead}>Workload on this project</div>
        <div style={panelSub}>WBS tasks assigned · active builds · open bugs raised</div>
        {memberRows.length === 0 ? (
          <div style={{ marginTop: 14, fontSize: 12.5, color: 'var(--color-text-tertiary)' }}>No members yet.</div>
        ) : (
          <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {memberRows.map(({ mem, prof, assigned, activeBuilds, openBugs }) => (
              <div key={mem.id} className="mgr-row" style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '8px 8px', borderRadius: 8 }}>
                <Avatar name={prof?.name || '—'} size={28} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{prof?.name || 'Unknown'}</div>
                  <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{prof?.role || mem.projectRole}{mem.accessType === 'support' ? ' · support' : ''}</div>
                </div>
                <span style={{ fontSize: 11.5, color: 'var(--color-text-secondary)' }} title="WBS tasks assigned"><IconTree size={13} /> {assigned}</span>
                <span style={{ fontSize: 11.5, color: 'var(--color-text-secondary)' }} title="Active builds"><IconPackage size={13} /> {activeBuilds}</span>
                <span style={{ fontSize: 11.5, color: openBugs ? 'var(--danger)' : 'var(--color-text-secondary)' }} title="Open bugs raised"><IconBug size={13} /> {openBugs}</span>
                <span style={{ fontSize: 11.5, color: 'var(--color-text-secondary)', minWidth: 40, textAlign: 'right' }} title="Hours logged">{logged ? `${logged}h` : '—'}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <ProjectMembersSection
        project={project}
        profiles={profiles}
        members={members}
        canManage={canManage}
        currentUser={currentUser}
        isSubmitting={isSubmitting}
        onAddMember={onAddMember}
        onUpdateMember={onUpdateMember}
        onRemoveMember={onRemoveMember}
      />
    </div>
  );
}

/* ---- Bugs tab: project-scoped live bug list ---- */
const BUG_TONE = { open: 'danger', in_progress: 'warning', disputed: 'warning', fixed: 'info', pending_tl: 'info', verified: 'success' };
function BugsTab({ projectId, bugs, releaseById, projectsById, onOpenRelease }) {
  const rows = filterBugs(bugs, { project: projectId }, { releaseById, projectById: projectsById });
  const columns = [
    { label: 'Bug', render: (b) => <span style={{ fontWeight: 500 }}>{b.title}</span> },
    { label: 'Severity', render: (b) => <SeverityBadge severity={b.severity} /> },
    { label: 'Status', render: (b) => <Pill label={(b.status || '').replace(/_/g, ' ')} tone={BUG_TONE[b.status] || 'neutral'} /> },
    { label: 'Build', render: (b) => (releaseById[b.releaseId] ? `v${formatVersion(releaseById[b.releaseId].version)}` : '—') },
    { label: 'Reported', render: (b) => b.createdBy || '—', thStyle: { whiteSpace: 'nowrap' } },
    { label: 'Age', render: (b) => <span style={{ color: 'var(--color-text-tertiary)' }}>{relativeTime(new Date(b.createdAt).getTime())}</span> },
  ];
  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(b) => b.id}
      searchText={(b) => `${b.title} ${b.createdBy || ''}`}
      searchPlaceholder="Search bugs…"
      onRowClick={(b) => b.releaseId && onOpenRelease(b.releaseId)}
    />
  );
}

/* ---- Time tab: log hours + per-member rollup (requires fixes21.sql) ---- */
function TimeTab({ projectId, user, wbsItems, logs, loading, profilesById, canManage, onReload, showToast }) {
  const today = new Date().toISOString().slice(0, 10);
  const [hours, setHours] = useState('');
  const [date, setDate] = useState(today);
  const [wbsItemId, setWbsItemId] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const taskItems = wbsItems.filter((i) => i.type !== 'milestone');
  const itemLabel = (id) => {
    const it = wbsItems.find((i) => i.id === id);
    return it ? (it.title || it.module || 'Task') : null;
  };

  const total = logs.reduce((s, l) => s + l.hours, 0);
  const byUser = {};
  logs.forEach((l) => { byUser[l.userId] = (byUser[l.userId] || 0) + l.hours; });
  const memberRollup = Object.entries(byUser)
    .map(([uid, h]) => ({ uid, h, name: profilesById[uid]?.name || 'Unknown' }))
    .sort((a, b) => b.h - a.h);

  async function submit() {
    const h = Number(hours);
    if (!h || h <= 0) { showToast?.('Enter hours greater than 0.', 'error'); return; }
    if (h > 24) { showToast?.('A single entry can’t exceed 24 hours.', 'error'); return; }
    setBusy(true);
    try {
      await api.createTimeLog({ projectId, wbsItemId: wbsItemId || null, hours: h, logDate: date, note, userId: user.id });
      setHours(''); setNote(''); setWbsItemId('');
      showToast?.('Time logged');
      await onReload();
    } catch (e) {
      showToast?.(e.message, 'error');
    } finally {
      setBusy(false);
    }
  }
  async function remove(id) {
    try { await api.deleteTimeLog(id); await onReload(); }
    catch (e) { showToast?.(e.message, 'error'); }
  }

  const fieldLabel = { fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 5, display: 'block' };

  return (
    <div className="dash-mid">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ ...card, padding: 18 }}>
          <div style={panelHead}>Log time</div>
          <div style={panelSub}>Record hours against this project — optionally against a WBS task</div>
          <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 12 }}>
            <div>
              <label style={fieldLabel}>Hours</label>
              <input style={inputStyle} type="number" min="0" step="0.25" value={hours} placeholder="e.g. 2.5" onChange={(e) => setHours(e.target.value)} />
            </div>
            <div>
              <label style={fieldLabel}>Date</label>
              <input style={inputStyle} type="date" max={today} value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={fieldLabel}>WBS task (optional)</label>
              <select style={inputStyle} value={wbsItemId} onChange={(e) => setWbsItemId(e.target.value)}>
                <option value="">— No specific task —</option>
                {taskItems.map((i) => <option key={i.id} value={i.id}>{(i.module ? i.module + ' · ' : '') + (i.title || 'Task')}</option>)}
              </select>
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={fieldLabel}>Note (optional)</label>
              <input style={inputStyle} value={note} placeholder="What did you work on?" onChange={(e) => setNote(e.target.value)} />
            </div>
          </div>
          <button style={{ ...primaryButton(busy), marginTop: 14 }} disabled={busy} onClick={submit}>{busy ? 'Logging…' : 'Log time'}</button>
        </div>

        <div style={{ ...card, padding: 18 }}>
          <div style={panelHead}>Entries</div>
          {loading ? (
            <div style={{ marginTop: 12, fontSize: 12.5, color: 'var(--color-text-tertiary)' }}>Loading…</div>
          ) : logs.length === 0 ? (
            <div style={{ marginTop: 12, fontSize: 12.5, color: 'var(--color-text-tertiary)' }}>No time logged yet. Log your first entry above.</div>
          ) : (
            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 420, overflowY: 'auto' }}>
              {logs.map((l) => {
                const mine = l.userId === user.id;
                return (
                  <div key={l.id} className="mgr-row" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 8px', borderRadius: 8 }}>
                    <span className="tnum" style={{ fontSize: 13, fontWeight: 700, minWidth: 44 }}>{l.hours}h</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {itemLabel(l.wbsItemId) ? <span style={{ fontWeight: 500 }}>{itemLabel(l.wbsItemId)}</span> : <span style={{ color: 'var(--color-text-tertiary)' }}>General</span>}
                        {l.note ? <span style={{ color: 'var(--color-text-secondary)' }}> — {l.note}</span> : ''}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
                        {profilesById[l.userId]?.name || 'Unknown'} · {l.logDate}
                      </div>
                    </div>
                    {(mine || canManage) && (
                      <button onClick={() => remove(l.id)} style={{ ...ghostButton, padding: '4px 9px', fontSize: 11, color: 'var(--danger)', borderColor: 'transparent' }}>Remove</button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div style={{ ...card, padding: 18 }}>
        <div style={panelHead}>Totals</div>
        <div style={panelSub}>Hours logged on this project</div>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 30, fontWeight: 700, marginTop: 12 }}>{total}h</div>
        <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 11 }}>
          {memberRollup.length === 0 ? (
            <div style={{ fontSize: 12.5, color: 'var(--color-text-tertiary)' }}>No contributors yet.</div>
          ) : memberRollup.map((r) => (
            <div key={r.uid} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Avatar name={r.name} size={26} />
              <span style={{ flex: 1, fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
              <span className="tnum" style={{ fontSize: 12.5, fontWeight: 700 }}>{r.h}h</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ================================================================== */
/* ProjectHub — picker + per-project tabbed workspace                  */
/* ================================================================== */
export function ProjectHub({
  user, projects, releases, bugs, profiles, projectMembers,
  projectsById, profilesById, releaseById, canManage, isSubmitting,
  showToast, onOpenRelease, onSubmit, onAddMember, onUpdateMember, onRemoveMember,
  projectId = null, onSelectProject,
}) {
  // Selection is controlled by the parent so other pages (e.g. Command Center)
  // can deep-link straight to a project. Falls back to local state if no
  // controller is wired.
  const [localSel, setLocalSel] = useState(null);
  const selId = onSelectProject ? projectId : localSel;
  const setSel = onSelectProject || setLocalSel;
  const [tab, setTab] = useState('overview');
  const [wbs, setWbs] = useState({ items: [], targets: [], loading: false });
  const [timeLogs, setTimeLogs] = useState({ list: [], loading: false });

  const project = selId ? projectsById[selId] : null;

  useEffect(() => {
    if (!selId) { setWbs({ items: [], targets: [], loading: false }); return; }
    let cancelled = false;
    setWbs((w) => ({ ...w, loading: true }));
    Promise.all([
      api.fetchWbsItemsForProjects([selId]),
      api.fetchWbsPlatformTargetsForProjects([selId]),
    ])
      .then(([items, targets]) => { if (!cancelled) setWbs({ items, targets, loading: false }); })
      .catch(() => { if (!cancelled) setWbs({ items: [], targets: [], loading: false }); });
    return () => { cancelled = true; };
  }, [selId]);

  useEffect(() => {
    if (!selId) { setTimeLogs({ list: [], loading: false }); return; }
    let cancelled = false;
    setTimeLogs((t) => ({ ...t, loading: true }));
    api.fetchTimeLogsForProject(selId)
      .then((list) => { if (!cancelled) setTimeLogs({ list, loading: false }); })
      .catch(() => { if (!cancelled) setTimeLogs({ list: [], loading: false }); });
    return () => { cancelled = true; };
  }, [selId]);

  const reloadTime = () =>
    api.fetchTimeLogsForProject(selId).then((list) => setTimeLogs({ list, loading: false })).catch(() => {});

  if (!project) {
    return <ProjectPicker projects={projects} releases={releases} bugs={bugs} releaseById={releaseById} onOpen={(id) => { setSel(id); setTab('overview'); }} />;
  }

  // ---- per-project rollup (mirrors Command Center projRows) ----
  const nowMs = Date.now();
  const rel = releases.filter((r) => r.projectId === selId).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const pbugs = bugs.filter((b) => releaseById[b.releaseId]?.projectId === selId);
  const wh = computeProjectWbsHealth(wbs.items, wbs.targets, nowMs);
  const openBugs = pbugs.filter(isActiveBug);
  const critical = openBugs.filter((b) => b.severity === 'critical').length;
  const active = rel.find((r) => !isClosedStatus(r.status)) || null;
  const m = computeReleaseMetrics(rel, pbugs, { releaseById });
  const passRate = m.decided ? m.passRate : null;
  const health = computeCompositeHealth({ wbsPct: wh.hasWbs ? wh.pct : null, openBugs: openBugs.length, critical, passRate, milestoneRisk: wh.milestoneRisk });
  const members = projectMembers.filter((mm) => mm.projectId === selId);

  const tabs = [
    ['overview', 'Overview'],
    ['plan', 'Plan (WBS)'],
    ['builds', 'Builds'],
    ['time', 'Time'],
    ['team', `Team${members.length ? ` (${members.length})` : ''}`],
    ['bugs', `Bugs${openBugs.length ? ` (${openBugs.length})` : ''}`],
  ];

  return (
    <div className="anim-in" style={{ maxWidth: 1460, margin: '0 auto' }}>
      {/* breadcrumb + header */}
      <button style={{ ...ghostButton, padding: '5px 11px', marginBottom: 14 }} onClick={() => setSel(null)}>← All projects</button>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ display: 'inline-flex', color: 'var(--brand)' }}><IconPackage size={22} /></span>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0, letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: 10 }}>
              {project.name}
              {project.type && <TypeBadge type={project.type} />}
            </h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
              <HealthDot tone={health.tone} />
              <span style={{ fontSize: 12.5, color: 'var(--color-text-secondary)' }}>{health.label}</span>
            </div>
          </div>
        </div>
        <button style={{ ...primaryButton(false) }} onClick={onSubmit}>Submit release</button>
      </div>

      <SubTabs tabs={tabs} active={tab} onChange={setTab} />

      {tab === 'overview' && (
        <OverviewTab
          project={project} rel={rel} pbugs={pbugs} wh={wh} wbsLoading={wbs.loading}
          openBugs={openBugs} critical={critical} active={active} passRate={passRate}
          health={health} profilesById={profilesById} onOpenRelease={onOpenRelease} onTab={setTab}
        />
      )}
      {tab === 'plan' && (
        <WbsPage user={user} projects={[project]} profiles={profiles} showToast={showToast} />
      )}
      {tab === 'builds' && (
        rel.length === 0 ? (
          <div style={{ ...card, padding: 40, textAlign: 'center', color: 'var(--color-text-tertiary)' }}>No builds submitted for this project yet.</div>
        ) : (
          <ReleaseHistory releases={rel} projectsById={projectsById} profilesById={profilesById} onRowClick={(r) => onOpenRelease(r.id)} />
        )
      )}
      {tab === 'time' && (
        <TimeTab
          projectId={selId} user={user} wbsItems={wbs.items} logs={timeLogs.list} loading={timeLogs.loading}
          profilesById={profilesById} canManage={canManage} onReload={reloadTime} showToast={showToast}
        />
      )}
      {tab === 'team' && (
        <TeamTab
          project={project} members={members} profiles={profiles} profilesById={profilesById}
          wbsItems={wbs.items} rel={rel} pbugs={pbugs} timeLogs={timeLogs.list} canManage={canManage} currentUser={user}
          isSubmitting={isSubmitting} onAddMember={onAddMember} onUpdateMember={onUpdateMember} onRemoveMember={onRemoveMember}
        />
      )}
      {tab === 'bugs' && (
        <BugsTab projectId={selId} bugs={bugs} releaseById={releaseById} projectsById={projectsById} onOpenRelease={onOpenRelease} />
      )}
    </div>
  );
}

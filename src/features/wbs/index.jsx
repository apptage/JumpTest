/* WBS feature — multi-platform work-breakdown: internal view, live progress,
   and in-portal structural editing (platforms / modules / tasks). */
import { useState, useEffect, useCallback, useRef } from 'react';
import * as api from '@/api.js';
import { parseWbsFile } from '@/wbs.js';
import { card, inputStyle, ghostButton, primaryButton } from '@/ui.jsx';
import { PageHeader, Empty, sideHead } from '@shared/ui-kit.jsx';
import { StatSmall } from '@shared/dashboard-kit.jsx';
import {
  WBS_STATUSES,
  WBS_STATUS_ORDER,
  WBS_DEV_STATUSES,
  SEVERITIES,
  BUG_STATUSES,
} from '@/constants.js';

export function WbsBadge({ status }) {
  const s = WBS_STATUSES[status] || { label: status, color: '#64748b' };
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        fontSize: 11,
        fontWeight: 600,
        color: s.color,
        background: `${s.color}1a`,
        border: `1px solid ${s.color}33`,
        padding: '2px 8px',
        borderRadius: 999,
        whiteSpace: 'nowrap',
      }}
    >
      {s.label}
    </span>
  );
}

export function wbsPct(tasks) {
  // each task counts backend + frontend as two units
  let done = 0;
  let total = 0;
  tasks.forEach((t) => {
    total += 2;
    if (t.backendStatus === 'complete') done += 1;
    if (t.frontendStatus === 'complete') done += 1;
  });
  return total ? Math.round((done / total) * 100) : 0;
}

// derive a section/group target date = the latest parseable est date of its tasks
export function latestEst(tasks) {
  let best = null;
  let bestStr = '';
  tasks.forEach((t) => {
    const s = t.estDate || t.est_date || t.est || '';
    if (!s) return;
    const ms = Date.parse(s);
    if (Number.isNaN(ms)) {
      if (!best && !bestStr) bestStr = s; // keep a free-form target if nothing parses
      return;
    }
    if (best == null || ms > best) {
      best = ms;
      bestStr = s;
    }
  });
  return bestStr;
}

function WbsTrackCell({ status, locked, canEdit, onChange }) {
  if (locked || !canEdit) return <WbsBadge status={status} />;
  return (
    <select
      value={status}
      onChange={(e) => onChange(e.target.value)}
      style={{ ...inputStyle, width: 'auto', padding: '4px 6px', fontSize: 11.5 }}
    >
      {WBS_DEV_STATUSES.map((s) => (
        <option key={s} value={s}>
          {WBS_STATUSES[s].label}
        </option>
      ))}
    </select>
  );
}

function WbsTaskRow({ task, canEdit, onUpdate, bugs = [], manage = null }) {
  const [editing, setEditing] = useState(false);
  const [c, setC] = useState(task.devComments);
  const beLocked = task.backendStatus === 'in_qa' || task.backendStatus === 'complete';
  const feLocked = task.frontendStatus === 'in_qa' || task.frontendStatus === 'complete';
  return (
    <div style={{ padding: '9px 12px', borderTop: '1px solid var(--color-border-primary)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, fontWeight: 500, flex: 1, minWidth: 140 }}>
          {task.name}
          {bugs.length > 0 && (
            <span
              title={`${bugs.length} open bug(s) on this task`}
              style={{
                marginLeft: 8,
                fontSize: 10.5,
                fontWeight: 700,
                color: 'var(--danger)',
                background: '#dc26261a',
                borderRadius: 999,
                padding: '1px 7px',
              }}
            >
              {bugs.length} bug{bugs.length === 1 ? '' : 's'}
            </span>
          )}
        </span>
        <span style={{ fontSize: 10.5, color: 'var(--color-text-secondary)', width: 56 }}>BE</span>
        <WbsTrackCell
          status={task.backendStatus}
          locked={beLocked}
          canEdit={canEdit}
          onChange={(v) => onUpdate(task, { backend_status: v })}
        />
        <span style={{ fontSize: 10.5, color: 'var(--color-text-secondary)', width: 56 }}>FE</span>
        <WbsTrackCell
          status={task.frontendStatus}
          locked={feLocked}
          canEdit={canEdit}
          onChange={(v) => onUpdate(task, { frontend_status: v })}
        />
        {task.estDate && (
          <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{task.estDate}</span>
        )}
        {manage}
      </div>
      <div style={{ marginTop: 6 }}>
        {editing ? (
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <textarea
              style={{ ...inputStyle, resize: 'vertical', fontSize: 12 }}
              rows={2}
              value={c}
              placeholder="Developer comment (internal)…"
              onChange={(e) => setC(e.target.value)}
            />
            <button
              style={ghostButton}
              onClick={() => {
                onUpdate(task, { dev_comments: c });
                setEditing(false);
              }}
            >
              Save
            </button>
          </div>
        ) : (
          <div style={{ fontSize: 11.5, color: 'var(--color-text-tertiary)' }}>
            {task.devComments ? (
              <span>
                <span style={{ fontWeight: 600 }}>Note: </span>
                {task.devComments}{' '}
              </span>
            ) : null}
            {canEdit && (
              <button
                onClick={() => {
                  setC(task.devComments);
                  setEditing(true);
                }}
                style={{ background: 'none', border: 'none', color: 'var(--brand)', cursor: 'pointer', fontSize: 11.5, fontFamily: 'inherit', padding: 0 }}
              >
                {task.devComments ? 'edit' : '+ add note'}
              </button>
            )}
          </div>
        )}
      </div>
      {bugs.length > 0 && (
        <div style={{ marginTop: 7, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {bugs.map((b) => (
            <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11.5 }}>
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: (SEVERITIES[b.severity] || {}).color || 'var(--danger)',
                  flexShrink: 0,
                }}
              />
              <span style={{ color: 'var(--color-text-secondary)', flex: 1 }}>{b.title}</span>
              <span style={{ fontSize: 10.5, color: 'var(--color-text-tertiary)' }}>
                {(BUG_STATUSES[b.status] || {}).label || b.status}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// tiny control button used across the editor
function Ctl({ label, title, onClick, disabled, danger }) {
  return (
    <button
      title={title}
      disabled={disabled}
      onClick={onClick}
      style={{
        ...ghostButton,
        padding: '2px 7px',
        fontSize: 11,
        opacity: disabled ? 0.4 : 1,
        color: danger ? '#dc2626' : 'var(--color-text-secondary)',
        borderColor: danger ? '#dc262644' : undefined,
      }}
    >
      {label}
    </button>
  );
}

export function WbsPage({ user, projects, showToast }) {
  const [projectId, setProjectId] = useState(projects[0]?.id || '');
  const [tree, setTree] = useState({ platforms: [] });
  const [bugsByTask, setBugsByTask] = useState({});
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [activePlatformId, setActivePlatformId] = useState(null);
  const [statusF, setStatusF] = useState('all');
  const [q, setQ] = useState('');
  const fileRef = useRef(null);

  // projects can be empty on first mount (data still loading after login) —
  // pick the first project once the list actually arrives, not just at init.
  useEffect(() => {
    if (!projectId && projects[0]?.id) setProjectId(projects[0].id);
  }, [projects, projectId]);

  const project = projects.find((p) => p.id === projectId) || null;
  const canManage =
    user.role === 'Admin' || (user.role === 'Team Lead' && project && project.teamId === user.teamId);
  const canEdit = user.role === 'Developer' || canManage;

  const load = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const t = await api.fetchWbsTree(projectId);
      setTree(t);
      const ids = t.platforms
        .flatMap((p) => [...p.modules.flatMap((m) => m.tasks), ...p.milestones])
        .map((x) => x.id);
      try {
        const linked = await api.fetchBugsByTaskIds(ids);
        const m = {};
        linked.forEach((b) => (m[b.wbsTaskId] = m[b.wbsTaskId] || []).push(b));
        setBugsByTask(m);
      } catch (_) {
        setBugsByTask({});
      }
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [projectId, showToast]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!tree.platforms.length) return;
    if (!tree.platforms.some((p) => p.id === activePlatformId)) setActivePlatformId(tree.platforms[0].id);
  }, [tree, activePlatformId]);

  const run = async (fn, msg) => {
    try {
      await fn();
      if (msg) showToast(msg);
      await load();
    } catch (e) {
      showToast(e.message, 'error');
    }
  };

  async function onFile(e) {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    try {
      const parsed = await parseWbsFile(file);
      if (!parsed.length) throw new Error('No tasks detected in the spreadsheet.');
      const r = await api.importWbs(projectId, parsed);
      showToast(
        `Imported: +${r.addedTasks} task(s), +${r.addedModules} module(s), +${r.addedPlatforms} platform(s)`
      );
      await load();
    } catch (err) {
      showToast(err.message || 'Import failed', 'error');
    } finally {
      setBusy(false);
    }
  }

  const updateTask = (task, patch) => run(() => api.updateWbsTask(task.id, patch));

  const reorder = (items, idx, dir, apiFn) => {
    const j = idx + dir;
    if (j < 0 || j >= items.length) return;
    const ids = items.map((x) => x.id);
    [ids[idx], ids[j]] = [ids[j], ids[idx]];
    run(() => apiFn(ids));
  };

  // ---- structural edit handlers (Team-Lead / Admin) ----
  const ask = (label, initial = '') => {
    const v = window.prompt(label, initial);
    return v == null ? null : v.trim();
  };
  const addPlatform = () => {
    const name = ask('New platform name');
    if (name) run(() => api.createWbsPlatform(projectId, { name, position: tree.platforms.length }), 'Platform added');
  };
  const renamePlatform = (p) => {
    const name = ask('Rename platform', p.name);
    if (name && name !== p.name) run(() => api.updateWbsPlatform(p.id, { name }));
  };
  const deletePlatform = (p) => {
    if (window.confirm(`Delete platform "${p.name}" with its ${p.modules.length} module(s) and their tasks? Release history is preserved.`))
      run(() => api.deleteWbsPlatform(p.id), 'Platform deleted');
  };
  const addModule = (p) => {
    const name = ask('New module name');
    if (name) run(() => api.createWbsModule(projectId, p.id, { name, position: p.modules.length }), 'Module added');
  };
  const renameModule = (m) => {
    const name = ask('Rename module', m.name);
    if (name && name !== m.name) run(() => api.updateWbsModule(m.id, { name }));
  };
  const deleteModule = (m) => {
    if (window.confirm(`Delete module "${m.name}" with its ${m.tasks.length} task(s)? Release history is preserved.`))
      run(() => api.deleteWbsModule(m.id), 'Module deleted');
  };
  const moveModule = (m, toPlatform) =>
    run(() => api.moveWbsModule(m.id, toPlatform.id, toPlatform.name, toPlatform.modules.length), 'Module moved');
  const addTask = (p, m) => {
    const name = ask('New task name');
    if (!name) return;
    const est = ask('Estimated date (optional)') || '';
    run(
      () => api.createWbsTask(projectId, { platformId: p.id, moduleId: m.id, name, estDate: est, platformName: p.name, moduleName: m.name, position: m.tasks.length }),
      'Task added'
    );
  };
  const addMilestone = (p) => {
    const name = ask('New milestone name');
    if (!name) return;
    const est = ask('Target date (optional)') || '';
    run(
      () => api.createWbsTask(projectId, { platformId: p.id, type: 'milestone', name, estDate: est, platformName: p.name, position: p.milestones.length }),
      'Milestone added'
    );
  };
  const renameTask = (t) => {
    const name = ask('Rename task', t.name);
    if (name && name !== t.name) run(() => api.updateWbsTask(t.id, { name }));
  };
  const editTaskDate = (t) => {
    const est = ask('Estimated date', t.estDate || '');
    if (est != null) run(() => api.updateWbsTask(t.id, { est_date: est }));
  };
  const deleteTask = (t) => {
    if (window.confirm(`Delete task "${t.name}"? Release history keeps its name.`))
      run(() => api.deleteWbsTask(t.id), 'Task deleted');
  };
  const moveTask = (t, toModule, platform) =>
    run(
      () => api.moveWbsTask(t.id, { moduleId: toModule.id, platformId: platform.id, platformName: platform.name, moduleName: toModule.name, position: toModule.tasks.length }),
      'Task moved'
    );
  const deleteWholeWbs = () => {
    if (window.confirm('Delete the ENTIRE WBS for this project (all platforms, modules, tasks)? Release history is preserved. This cannot be undone.'))
      run(() => api.deleteWbs(projectId), 'WBS deleted');
  };

  const platforms = tree.platforms;
  const active = platforms.find((p) => p.id === activePlatformId) || platforms[0] || null;
  const overall = wbsPct(platforms.flatMap((p) => p.modules.flatMap((m) => m.tasks)));
  const matches = (t) =>
    (statusF === 'all' || t.backendStatus === statusF || t.frontendStatus === statusF) &&
    (!q.trim() || t.name.toLowerCase().includes(q.trim().toLowerCase()));

  const fSel = { ...inputStyle, width: 'auto', padding: '7px 10px', fontSize: 12 };

  return (
    <>
      <PageHeader title="WBS" subtitle="Work breakdown structure — multi-platform, editable" />

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14, alignItems: 'center' }}>
        <select style={fSel} value={projectId} onChange={(e) => setProjectId(e.target.value)}>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} {p.wbsEnabled ? '• WBS' : ''}
            </option>
          ))}
        </select>
        <select style={fSel} value={statusF} onChange={(e) => setStatusF(e.target.value)}>
          <option value="all">All statuses</option>
          {WBS_STATUS_ORDER.map((s) => (
            <option key={s} value={s}>
              {WBS_STATUSES[s].label}
            </option>
          ))}
        </select>
        <input style={{ ...fSel, flex: '1 1 160px' }} value={q} placeholder="Search tasks…" onChange={(e) => setQ(e.target.value)} />
        {canManage && (
          <>
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }} onChange={onFile} />
            <button style={primaryButton(busy)} disabled={busy} onClick={() => fileRef.current?.click()}>
              {busy ? 'Importing…' : platforms.length ? 'Re-import (adds new)' : 'Upload WBS'}
            </button>
            {platforms.length > 0 && (
              <button style={{ ...ghostButton, color: '#dc2626', borderColor: '#dc262644' }} onClick={deleteWholeWbs}>
                Delete WBS
              </button>
            )}
          </>
        )}
      </div>

      {platforms.length > 0 && (() => {
        const allTasks = platforms.flatMap((p) => p.modules.flatMap((m) => m.tasks));
        const anyTrack = (t, s) => t.backendStatus === s || t.frontendStatus === s;
        const done = allTasks.filter((t) => t.backendStatus === 'complete' && t.frontendStatus === 'complete').length;
        const inQa = allTasks.filter((t) => anyTrack(t, 'in_qa')).length;
        const inProg = allTasks.filter(
          (t) => (anyTrack(t, 'in_progress') || anyTrack(t, 'in_qa')) && !(t.backendStatus === 'complete' && t.frontendStatus === 'complete')
        ).length;
        return (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
            <StatSmall label="Platforms" value={platforms.length} />
            <StatSmall label="Tasks" value={allTasks.length} />
            <StatSmall label="In progress" value={inProg} color={inProg ? 'var(--brand)' : undefined} />
            <StatSmall label="In QA" value={inQa} color={inQa ? 'var(--warning)' : undefined} />
            <StatSmall label="Complete" value={done} color="var(--success)" />
          </div>
        );
      })()}

      {platforms.length > 0 && (
        <div style={{ ...card, padding: 16, marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>Overall project progress</span>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700, color: 'var(--brand)' }}>{overall}%</span>
          </div>
          <div style={{ height: 10, borderRadius: 999, background: 'var(--color-background-secondary)', overflow: 'hidden' }}>
            <div style={{ width: `${overall}%`, height: '100%', borderRadius: 999, background: 'var(--brand)' }} />
          </div>
        </div>
      )}

      {/* platform tabs */}
      {platforms.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14, alignItems: 'center' }}>
          {platforms.map((p, i) => {
            const pct = wbsPct(p.modules.flatMap((m) => m.tasks));
            const on = active && p.id === active.id;
            return (
              <button
                key={p.id}
                onClick={() => setActivePlatformId(p.id)}
                style={{
                  padding: '7px 12px',
                  fontSize: 12.5,
                  fontWeight: 600,
                  borderRadius: 999,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  color: on ? '#fff' : 'var(--color-text-primary)',
                  background: on ? 'var(--brand)' : 'var(--color-background-primary)',
                  border: `1px solid ${on ? 'var(--brand)' : 'var(--color-border-tertiary)'}`,
                }}
              >
                {p.name} · {pct}%
              </button>
            );
          })}
          {canManage && <Ctl label="+ Platform" title="Add a platform" onClick={addPlatform} />}
        </div>
      )}

      {loading ? (
        <div style={{ fontSize: 13, color: 'var(--color-text-tertiary)' }}>Loading…</div>
      ) : platforms.length === 0 ? (
        <Empty>
          {canManage
            ? 'No WBS yet — upload an Excel/CSV or add a platform to start.'
            : 'This project has no WBS yet.'}
          {canManage && (
            <div style={{ marginTop: 10 }}>
              <button style={ghostButton} onClick={addPlatform}>+ Add platform</button>
            </div>
          )}
        </Empty>
      ) : active ? (
        <>
          {/* platform manage strip */}
          {canManage && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
              <span style={{ ...sideHead, margin: 0 }}>{active.name}</span>
              <Ctl label="Rename" onClick={() => renamePlatform(active)} />
              <Ctl label="◀" title="Move left" disabled={platforms.indexOf(active) === 0} onClick={() => reorder(platforms, platforms.indexOf(active), -1, api.reorderWbsPlatforms)} />
              <Ctl label="▶" title="Move right" disabled={platforms.indexOf(active) === platforms.length - 1} onClick={() => reorder(platforms, platforms.indexOf(active), 1, api.reorderWbsPlatforms)} />
              <Ctl label="+ Module" onClick={() => addModule(active)} />
              <Ctl label="+ Milestone" onClick={() => addMilestone(active)} />
              <Ctl label="Delete platform" danger onClick={() => deletePlatform(active)} />
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {active.modules.map((m, mi) => {
              const shown = m.tasks.filter(matches);
              return (
                <div key={m.id} style={{ ...card, padding: 0, overflow: 'hidden' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 14px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 13.5, fontWeight: 600, flex: 1 }}>{m.name}</span>
                    {latestEst(m.tasks) && (
                      <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>Target {latestEst(m.tasks)}</span>
                    )}
                    <span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>
                      {m.tasks.length} task{m.tasks.length === 1 ? '' : 's'} · {wbsPct(m.tasks)}%
                    </span>
                    {canManage && (
                      <>
                        <Ctl label="▲" title="Move up" disabled={mi === 0} onClick={() => reorder(active.modules, mi, -1, api.reorderWbsModules)} />
                        <Ctl label="▼" title="Move down" disabled={mi === active.modules.length - 1} onClick={() => reorder(active.modules, mi, 1, api.reorderWbsModules)} />
                        <Ctl label="Rename" onClick={() => renameModule(m)} />
                        <Ctl label="+ Task" onClick={() => addTask(active, m)} />
                        {platforms.length > 1 && (
                          <select
                            title="Move module to platform"
                            value=""
                            onChange={(e) => {
                              const to = platforms.find((x) => x.id === e.target.value);
                              if (to) moveModule(m, to);
                            }}
                            style={{ ...inputStyle, width: 'auto', padding: '2px 6px', fontSize: 11 }}
                          >
                            <option value="">Move to…</option>
                            {platforms.filter((x) => x.id !== active.id).map((x) => (
                              <option key={x.id} value={x.id}>{x.name}</option>
                            ))}
                          </select>
                        )}
                        <Ctl label="Delete" danger onClick={() => deleteModule(m)} />
                      </>
                    )}
                  </div>
                  {shown.length === 0 ? (
                    <div style={{ padding: '9px 14px', fontSize: 12, color: 'var(--color-text-tertiary)', borderTop: '1px solid var(--color-border-primary)' }}>
                      {m.tasks.length ? 'No tasks match the filter.' : 'No tasks yet.'}
                    </div>
                  ) : (
                    shown.map((t, ti) => (
                      <WbsTaskRow
                        key={t.id}
                        task={t}
                        canEdit={canEdit}
                        onUpdate={updateTask}
                        bugs={bugsByTask[t.id] || []}
                        manage={
                          canManage ? (
                            <span style={{ display: 'inline-flex', gap: 4 }}>
                              <Ctl label="▲" title="Move up" disabled={ti === 0} onClick={() => reorder(m.tasks, m.tasks.indexOf(t), -1, api.reorderWbsTasks)} />
                              <Ctl label="▼" title="Move down" disabled={ti === shown.length - 1} onClick={() => reorder(m.tasks, m.tasks.indexOf(t), 1, api.reorderWbsTasks)} />
                              <Ctl label="Edit" onClick={() => renameTask(t)} />
                              <Ctl label="Date" onClick={() => editTaskDate(t)} />
                              {active.modules.length > 1 && (
                                <select
                                  title="Move task to module"
                                  value=""
                                  onChange={(e) => {
                                    const to = active.modules.find((x) => x.id === e.target.value);
                                    if (to) moveTask(t, to, active);
                                  }}
                                  style={{ ...inputStyle, width: 'auto', padding: '2px 5px', fontSize: 10.5 }}
                                >
                                  <option value="">Move…</option>
                                  {active.modules.filter((x) => x.id !== m.id).map((x) => (
                                    <option key={x.id} value={x.id}>{x.name}</option>
                                  ))}
                                </select>
                              )}
                              <Ctl label="✕" title="Delete task" danger onClick={() => deleteTask(t)} />
                            </span>
                          ) : null
                        }
                      />
                    ))
                  )}
                </div>
              );
            })}
            {active.modules.length === 0 && (
              <div style={{ fontSize: 12.5, color: 'var(--color-text-tertiary)' }}>
                No modules on this platform.{canManage ? ' Use “+ Module” above to add one.' : ''}
              </div>
            )}
          </div>

          {/* milestones for the active platform */}
          {(active.milestones.length > 0 || canManage) && (
            <div style={{ marginTop: 18 }}>
              <div style={{ ...sideHead, marginBottom: 8 }}>Milestones</div>
              <div style={{ ...card, padding: '4px 0' }}>
                {active.milestones.length === 0 ? (
                  <div style={{ padding: '9px 14px', fontSize: 12, color: 'var(--color-text-tertiary)' }}>No milestones.</div>
                ) : (
                  active.milestones.map((m) => (
                    <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', borderTop: '1px solid var(--color-border-primary)' }}>
                      <span style={{ fontSize: 13, fontWeight: 500, flex: 1 }}>{m.name}</span>
                      {m.estDate && <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{m.estDate}</span>}
                      {canManage && (
                        <span style={{ display: 'inline-flex', gap: 4 }}>
                          <Ctl label="Edit" onClick={() => renameTask(m)} />
                          <Ctl label="Date" onClick={() => editTaskDate(m)} />
                          <Ctl label="✕" danger onClick={() => deleteTask(m)} />
                        </span>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </>
      ) : null}
    </>
  );
}

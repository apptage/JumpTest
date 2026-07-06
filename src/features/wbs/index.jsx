/* WBS feature — internal work-breakdown view + live progress.
   Moved verbatim out of ReleaseTracker.jsx (Phase 0 mechanical split). */
import { useState, useEffect, useCallback, useRef } from 'react';
import * as api from '@/api.js';
import { parseWbsFile } from '@/wbs.js';
import { card, inputStyle, ghostButton, primaryButton } from '@/ui.jsx';
import { PageHeader, Empty, sideHead } from '@shared/ui-kit.jsx';
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

function WbsTaskRow({ task, canEdit, onUpdate, bugs = [] }) {
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

export function WbsPage({ user, projects, showToast }) {
  const [projectId, setProjectId] = useState(projects[0]?.id || '');
  const [tasks, setTasks] = useState([]);
  const [bugsByTask, setBugsByTask] = useState({});
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [platform, setPlatform] = useState('all');
  const [statusF, setStatusF] = useState('all');
  const [q, setQ] = useState('');
  const fileRef = useRef(null);

  const project = projects.find((p) => p.id === projectId) || null;
  const canUpload = user.role === 'Team Lead' && project && project.teamId === user.teamId;
  const isManager =
    user.role === 'Admin' || (user.role === 'Team Lead' && project && project.teamId === user.teamId);
  const canEdit = user.role === 'Developer' || isManager;

  const load = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const t = await api.fetchWbsTasks(projectId);
      setTasks(t);
      try {
        const linked = await api.fetchBugsByTaskIds(t.map((x) => x.id));
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

  async function onFile(e) {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    try {
      const parsed = await parseWbsFile(file);
      if (!parsed.length) throw new Error('No tasks detected in the spreadsheet.');
      const n = await api.importWbs(projectId, parsed);
      showToast(`Imported ${n} WBS rows`);
      await load();
    } catch (err) {
      showToast(err.message || 'Import failed', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function updateTask(task, patch) {
    setTasks((ts) => ts.map((t) => (t.id === task.id ? { ...t, ...mapPatch(patch) } : t)));
    try {
      await api.updateWbsTask(task.id, patch);
    } catch (e) {
      showToast(e.message, 'error');
      load();
    }
  }
  function mapPatch(p) {
    const m = {};
    if ('backend_status' in p) m.backendStatus = p.backend_status;
    if ('frontend_status' in p) m.frontendStatus = p.frontend_status;
    if ('dev_comments' in p) m.devComments = p.dev_comments;
    return m;
  }

  const platforms = Array.from(new Set(tasks.map((t) => t.platform).filter(Boolean)));
  const matches = (t) =>
    (platform === 'all' || t.platform === platform) &&
    (statusF === 'all' || t.backendStatus === statusF || t.frontendStatus === statusF) &&
    (!q.trim() || t.name.toLowerCase().includes(q.trim().toLowerCase()));

  const workTasks = tasks.filter((t) => t.type !== 'milestone' && matches(t));
  const milestones = tasks.filter((t) => t.type === 'milestone' && matches(t));

  // group by platform → section
  const groups = {};
  workTasks.forEach((t) => {
    const pk = t.platform || 'General';
    const sk = t.section || 'General';
    groups[pk] = groups[pk] || {};
    groups[pk][sk] = groups[pk][sk] || [];
    groups[pk][sk].push(t);
  });

  const fSel = { ...inputStyle, width: 'auto', padding: '7px 10px', fontSize: 12 };

  return (
    <>
      <PageHeader title="WBS" subtitle="Work breakdown structure & live progress" />

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14, alignItems: 'center' }}>
        <select style={fSel} value={projectId} onChange={(e) => setProjectId(e.target.value)}>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} {p.wbsEnabled ? '• WBS' : ''}
            </option>
          ))}
        </select>
        {platforms.length > 1 && (
          <select style={fSel} value={platform} onChange={(e) => setPlatform(e.target.value)}>
            <option value="all">All platforms</option>
            {platforms.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        )}
        <select style={fSel} value={statusF} onChange={(e) => setStatusF(e.target.value)}>
          <option value="all">All statuses</option>
          {WBS_STATUS_ORDER.map((s) => (
            <option key={s} value={s}>
              {WBS_STATUSES[s].label}
            </option>
          ))}
        </select>
        <input style={{ ...fSel, flex: '1 1 160px' }} value={q} placeholder="Search tasks…" onChange={(e) => setQ(e.target.value)} />
        {canUpload && (
          <>
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }} onChange={onFile} />
            <button style={primaryButton(busy)} disabled={busy} onClick={() => fileRef.current?.click()}>
              {busy ? 'Importing…' : tasks.length ? 'Re-import WBS' : 'Upload WBS'}
            </button>
          </>
        )}
      </div>

      {/* overall progress */}
      {tasks.length > 0 && (
        <div style={{ ...card, padding: 16, marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>Overall progress</span>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700, color: 'var(--brand)' }}>
              {wbsPct(tasks.filter((t) => t.type !== 'milestone'))}%
            </span>
          </div>
          <div style={{ height: 10, borderRadius: 999, background: 'var(--color-background-secondary)', overflow: 'hidden' }}>
            <div
              style={{
                width: `${wbsPct(tasks.filter((t) => t.type !== 'milestone'))}%`,
                height: '100%',
                borderRadius: 999,
                background: 'var(--brand)',
              }}
            />
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ fontSize: 13, color: 'var(--color-text-tertiary)' }}>Loading…</div>
      ) : tasks.length === 0 ? (
        <Empty>
          {canUpload
            ? 'No WBS yet — upload an Excel/CSV to get started.'
            : project?.wbsEnabled
            ? 'No tasks match your filters.'
            : 'This project does not use a WBS. The Team Lead can upload one.'}
        </Empty>
      ) : (
        <>
          {Object.entries(groups).map(([pk, sections]) => (
            <div key={pk} style={{ marginBottom: 18 }}>
              {platforms.length > 1 && (
                <div style={{ ...sideHead, marginBottom: 8 }}>{pk}</div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {Object.entries(sections).map(([sk, ts]) => (
                  <WbsSection key={sk} name={sk} tasks={ts} canEdit={canEdit} onUpdate={updateTask} bugsByTask={bugsByTask} />
                ))}
              </div>
            </div>
          ))}

          {milestones.length > 0 && (
            <div style={{ marginBottom: 18 }}>
              <div style={{ ...sideHead, marginBottom: 8 }}>Milestones</div>
              <div style={{ ...card, padding: '4px 0' }}>
                {milestones.map((m) => (
                  <div
                    key={m.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '9px 14px',
                      borderTop: '1px solid var(--color-border-primary)',
                    }}
                  >
                    <span style={{ fontSize: 13, fontWeight: 500, flex: 1 }}>{m.name}</span>
                    {m.estDate && <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{m.estDate}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}

function WbsSection({ name, tasks, canEdit, onUpdate, bugsByTask }) {
  const [open, setOpen] = useState(true);
  return (
    <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
      <div
        onClick={() => setOpen((o) => !o)}
        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', cursor: 'pointer' }}
      >
        <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', width: 10 }}>{open ? '▾' : '▸'}</span>
        <span style={{ fontSize: 13.5, fontWeight: 600, flex: 1 }}>{name}</span>
        {latestEst(tasks) && (
          <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
            Target {latestEst(tasks)}
          </span>
        )}
        <span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>
          {tasks.length} task{tasks.length === 1 ? '' : 's'} · {wbsPct(tasks)}%
        </span>
      </div>
      {open &&
        tasks.map((t) => (
          <WbsTaskRow key={t.id} task={t} canEdit={canEdit} onUpdate={onUpdate} bugs={(bugsByTask || {})[t.id] || []} />
        ))}
    </div>
  );
}

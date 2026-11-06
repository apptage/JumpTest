/* CMS projects (type 'cms') — websites, landing pages and API integrations.
   They have no WBS. Work is tracked two ways:
     Tasks    one request at a time (changes, recovery, blogs, SEO, …), each with
              who assigned it (AM / PMO / SEO team) and where (Basecamp / CRM / Group).
     Journey  the development journey of a new build, template selection → handover.
   Shown inside Project Hub in place of Plan (WBS). */
import { useState, useEffect, useCallback } from 'react';
import * as api from '@/api.js';
import { card, inputStyle, labelStyle, ghostButton, primaryButton, ModalShell, Avatar } from '@/ui.jsx';
import { Pill, StatCard, DataTable, Segmented } from '@shared/dashboard-kit.jsx';
import {
  CMS_TASK_CATEGORIES, CMS_REQUESTERS, CMS_CHANNELS, CMS_TASK_STATUSES, CMS_TASK_STATUS_ORDER,
  CMS_JOURNEY, CMS_STAGE_STATUSES, CMS_STAGE_STATUS_ORDER, WBS_PRIORITIES,
  cmsCategoriesForKind, cmsCategoryLabel, cmsKindLabel,
} from '@/constants.js';

const panelHead = { fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700, letterSpacing: 'var(--tracking-tight)' };
const panelSub = { fontSize: 11.5, color: 'var(--color-text-tertiary)', marginTop: 2 };
const muted = { fontSize: 12.5, color: 'var(--color-text-tertiary)' };
const smallSel = { ...inputStyle, width: 'auto', minHeight: 0, padding: '5px 8px', fontSize: 12 };

const today = () => new Date().toISOString().slice(0, 10);
const fmtDate = (d) => (d ? new Date(d.length === 10 ? `${d}T00:00:00` : d).toLocaleDateString(undefined, { day: '2-digit', month: 'short' }) : '—');
const isOpenTask = (t) => t.status !== 'done';
const isOverdue = (t) => isOpenTask(t) && t.dueDate && t.dueDate < today();
const PRIORITY_TONE = { High: 'danger', Medium: 'warning', Low: 'neutral' };

function normalizeUrl(raw) {
  const v = (raw || '').trim();
  if (!v) return { url: null };
  try {
    const u = new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return { error: 'Links must start with http:// or https://' };
    return { url: u.href };
  } catch {
    return { error: 'That doesn’t look like a valid link.' };
  }
}

export function assignedByLabel(t) {
  const who = CMS_REQUESTERS[t.requestedBy]?.label || '—';
  const where = t.channel ? CMS_CHANNELS[t.channel]?.label : null;
  return where ? `${who} · ${where}` : who;
}

/* journey progress: done + skipped count as finished */
export function cmsJourneyProgress(stages) {
  if (!stages || stages.length === 0) return { started: false, pct: 0, finished: 0, total: CMS_JOURNEY.length, current: null };
  const byKey = Object.fromEntries(stages.map((s) => [s.stage, s]));
  const finished = CMS_JOURNEY.filter((j) => ['done', 'skipped'].includes(byKey[j.key]?.status)).length;
  const current =
    CMS_JOURNEY.find((j) => byKey[j.key]?.status === 'in_progress') ||
    CMS_JOURNEY.find((j) => !['done', 'skipped'].includes(byKey[j.key]?.status)) ||
    null;
  return { started: true, pct: Math.round((finished / CMS_JOURNEY.length) * 100), finished, total: CMS_JOURNEY.length, current };
}

/* Loads a CMS project's tasks + stages. null lists = migration not deployed. */
export function useCmsData(projectId) {
  const [state, setState] = useState({ tasks: [], stages: [], loading: false, missing: false });
  const reload = useCallback(async () => {
    if (!projectId) return;
    try {
      const [tasks, stages] = await Promise.all([api.fetchCmsTasks(projectId), api.fetchCmsStages(projectId)]);
      setState({ tasks: tasks || [], stages: stages || [], loading: false, missing: tasks === null || stages === null });
    } catch {
      setState((s) => ({ ...s, loading: false }));
    }
  }, [projectId]);
  useEffect(() => {
    if (!projectId) { setState({ tasks: [], stages: [], loading: false, missing: false }); return; }
    setState((s) => ({ ...s, loading: true }));
    reload();
  }, [projectId, reload]);
  return { ...state, reload };
}

function MissingNotice() {
  return (
    <div style={{ ...card, padding: 24, ...muted }}>
      CMS tracking isn’t set up on this database yet. Run the <code>202611060001_cms_projects.sql</code> migration.
    </div>
  );
}

/* ================================================================== */
/* Overview                                                            */
/* ================================================================== */
export function CmsOverview({ project, tasks, stages, loading, missing, profilesById, onTab }) {
  if (missing) return <MissingNotice />;
  const open = tasks.filter(isOpenTask);
  const review = tasks.filter((t) => t.status === 'in_review');
  const overdue = tasks.filter(isOverdue);
  const done = tasks.filter((t) => t.status === 'done');
  const journey = cmsJourneyProgress(stages);
  const byKey = Object.fromEntries(stages.map((s) => [s.stage, s]));

  const cats = cmsCategoriesForKind(project.cmsKind);
  const catRows = [...new Set([...cats, ...tasks.map((t) => t.category)])].map((c) => {
    const list = tasks.filter((t) => t.category === c);
    return { c, total: list.length, open: list.filter(isOpenTask).length };
  });
  const reqRows = Object.keys(CMS_REQUESTERS).map((k) => ({ k, n: open.filter((t) => t.requestedBy === k).length }));
  const dash = loading ? '…' : null;

  return (
    <div>
      <div className="dash-kpis" style={{ marginBottom: 16 }}>
        <StatCard label="Open tasks" value={dash ?? open.length} foot={`${tasks.length} ALL TIME`} />
        <StatCard label="In review" value={dash ?? review.length} foot="AWAITING SIGN-OFF" />
        <StatCard label="Overdue" value={dash ?? overdue.length} foot="PAST DUE DATE" />
        <StatCard label="Done" value={dash ?? done.length} foot="COMPLETED TASKS" />
        <StatCard label="Journey" value={dash ?? (journey.started ? `${journey.pct}%` : '—')} foot={journey.started ? `${journey.finished}/${journey.total} STAGES` : 'NOT STARTED'} />
      </div>

      <div className="dash-mid">
        <div style={{ ...card, padding: 18 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
            <div>
              <div style={panelHead}>Development journey</div>
              <div style={panelSub}>{journey.started ? (journey.current ? `Now: ${journey.current.label}` : 'All stages finished') : 'Not started for this project'}</div>
            </div>
            <button style={{ ...ghostButton, padding: '5px 11px', minHeight: 0, fontSize: 12 }} onClick={() => onTab('journey')}>Open</button>
          </div>
          {journey.started ? (
            <ol style={{ listStyle: 'none', margin: '14px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {CMS_JOURNEY.map((j, i) => {
                const s = byKey[j.key];
                const st = CMS_STAGE_STATUSES[s?.status || 'pending'];
                return (
                  <li key={j.key} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5 }}>
                    <StepDot index={i} status={s?.status || 'pending'} />
                    <span style={{ flex: 1, minWidth: 0, color: s?.status === 'skipped' ? 'var(--color-text-tertiary)' : undefined, textDecoration: s?.status === 'skipped' ? 'line-through' : undefined }}>{j.label}</span>
                    {s?.ownerId && <span style={{ fontSize: 11.5, color: 'var(--color-text-tertiary)' }}>{profilesById[s.ownerId]?.name}</span>}
                    <Pill label={st.label} tone={st.tone} />
                  </li>
                );
              })}
            </ol>
          ) : (
            <div style={{ ...muted, marginTop: 14 }}>Start the journey when this project is a new website or landing page build.</div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ ...card, padding: 18 }}>
            <div style={panelHead}>Tasks by category</div>
            <div style={panelSub}>{cmsKindLabel(project.cmsKind)}</div>
            <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
              {catRows.map(({ c, total, open: o }) => (
                <div key={c}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 5 }}>
                    <span style={{ fontWeight: 500 }}>{cmsCategoryLabel(c)}</span>
                    <span className="tnum" style={{ color: 'var(--color-text-secondary)' }}>{o} open · {total}</span>
                  </div>
                  <div style={{ height: 5, borderRadius: 999, background: 'var(--color-background-secondary)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${total ? Math.max(3, Math.round(((total - o) / total) * 100)) : 0}%`, borderRadius: 999, background: 'var(--brand)' }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div style={{ ...card, padding: 18 }}>
            <div style={panelHead}>Open tasks by who assigned them</div>
            <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {reqRows.map(({ k, n }) => <Pill key={k} label={`${CMS_REQUESTERS[k].label}: ${n}`} tone={n ? 'info' : 'neutral'} />)}
            </div>
            <button style={{ ...ghostButton, marginTop: 14, padding: '5px 11px', minHeight: 0, fontSize: 12 }} onClick={() => onTab('tasks')}>View tasks</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function StepDot({ index, status }) {
  const doneish = status === 'done';
  const active = status === 'in_progress';
  return (
    <span
      className="tnum"
      style={{
        width: 22, height: 22, borderRadius: 999, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 11, fontWeight: 700,
        background: doneish ? 'var(--tone-success-bg)' : active ? 'var(--tone-warning-bg)' : 'var(--color-background-secondary)',
        color: doneish ? 'var(--tone-success-fg)' : active ? 'var(--tone-warning-fg)' : 'var(--color-text-tertiary)',
        border: active ? '1px solid var(--tone-warning-fg)' : '1px solid transparent',
      }}
    >
      {doneish ? '✓' : index + 1}
    </span>
  );
}

/* ================================================================== */
/* Tasks                                                               */
/* ================================================================== */
function TaskModal({ project, task, user, assignees, canDelete, onClose, onSaved, showToast }) {
  const cats = cmsCategoriesForKind(project.cmsKind);
  // keep an existing task's category selectable even if the project's kind changed
  const catOptions = task && !cats.includes(task.category) ? [...cats, task.category] : cats;
  const [f, setF] = useState(() => ({
    category: task?.category || cats[0],
    title: task?.title || '',
    details: task?.details || '',
    requestedBy: task?.requestedBy || CMS_TASK_CATEGORIES[task?.category || cats[0]].requesters[0],
    channel: task?.channel || 'basecamp',
    referenceUrl: task?.referenceUrl || '',
    assignedTo: task?.assignedTo || '',
    priority: task?.priority || '',
    dueDate: task?.dueDate || '',
    status: task?.status || 'todo',
  }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const requesters = CMS_TASK_CATEGORIES[f.category]?.requesters || Object.keys(CMS_REQUESTERS);

  function pickCategory(c) {
    const allowed = CMS_TASK_CATEGORIES[c].requesters;
    setF((s) => ({ ...s, category: c, requestedBy: allowed.includes(s.requestedBy) ? s.requestedBy : allowed[0] }));
  }

  const invalid = !f.title.trim();
  async function save() {
    if (invalid || saving) return;
    const { url, error: urlError } = normalizeUrl(f.referenceUrl);
    if (urlError) { setError(urlError); return; }
    setSaving(true);
    const row = {
      category: f.category,
      title: f.title.trim(),
      details: f.details.trim(),
      requested_by: f.requestedBy,
      channel: f.channel || null,
      reference_url: url,
      assigned_to: f.assignedTo || null,
      priority: f.priority || null,
      due_date: f.dueDate || null,
      status: f.status,
    };
    try {
      if (task) await api.updateCmsTask(task.id, row);
      else await api.createCmsTask({ ...row, project_id: project.id, created_by: user.id });
      showToast?.(task ? 'Task saved' : 'Task added');
      onSaved();
      onClose();
    } catch (e) {
      showToast?.(e.message, 'error');
      setSaving(false);
    }
  }
  async function remove() {
    if (!window.confirm(`Delete “${task.title}”?`)) return;
    setSaving(true);
    try {
      await api.deleteCmsTask(task.id);
      showToast?.('Task deleted');
      onSaved();
      onClose();
    } catch (e) {
      showToast?.(e.message, 'error');
      setSaving(false);
    }
  }

  const grid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 };
  return (
    <ModalShell onClose={onClose} title={task ? 'Edit task' : 'New task'} subtitle={project.name} maxWidth={600}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <label style={labelStyle} htmlFor="cms-cat">Category</label>
          <select id="cms-cat" style={inputStyle} value={f.category} onChange={(e) => pickCategory(e.target.value)}>
            {catOptions.map((c) => <option key={c} value={c}>{cmsCategoryLabel(c)}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle} htmlFor="cms-title">Task</label>
          <input id="cms-title" style={inputStyle} autoFocus value={f.title} placeholder="e.g. Update pricing section on the home page" onChange={(e) => set('title', e.target.value)} />
        </div>
        <div>
          <label style={labelStyle} htmlFor="cms-details">Details</label>
          <textarea id="cms-details" style={{ ...inputStyle, resize: 'vertical' }} rows={3} value={f.details} onChange={(e) => set('details', e.target.value)} />
        </div>
        <div style={grid}>
          <div>
            <label style={labelStyle} htmlFor="cms-by">Assigned by</label>
            <select id="cms-by" style={inputStyle} value={f.requestedBy} onChange={(e) => set('requestedBy', e.target.value)}>
              {requesters.map((r) => <option key={r} value={r}>{CMS_REQUESTERS[r].label}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle} htmlFor="cms-via">Received via</label>
            <select id="cms-via" style={inputStyle} value={f.channel} onChange={(e) => set('channel', e.target.value)}>
              {Object.entries(CMS_CHANNELS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label style={labelStyle} htmlFor="cms-ref">Request link (optional)</label>
          <input id="cms-ref" style={inputStyle} value={f.referenceUrl} placeholder="Basecamp to-do, CRM ticket…" onChange={(e) => set('referenceUrl', e.target.value)} />
        </div>
        <div style={grid}>
          <div>
            <label style={labelStyle} htmlFor="cms-who">Assignee</label>
            <select id="cms-who" style={inputStyle} value={f.assignedTo} onChange={(e) => set('assignedTo', e.target.value)}>
              <option value="">Unassigned</option>
              {assignees.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle} htmlFor="cms-pri">Priority</label>
            <select id="cms-pri" style={inputStyle} value={f.priority} onChange={(e) => set('priority', e.target.value)}>
              <option value="">—</option>
              {WBS_PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle} htmlFor="cms-due">Due date</label>
            <input id="cms-due" type="date" style={inputStyle} value={f.dueDate} onChange={(e) => set('dueDate', e.target.value)} />
          </div>
          <div>
            <label style={labelStyle} htmlFor="cms-status">Status</label>
            <select id="cms-status" style={inputStyle} value={f.status} onChange={(e) => set('status', e.target.value)}>
              {CMS_TASK_STATUS_ORDER.map((s) => <option key={s} value={s}>{CMS_TASK_STATUSES[s].label}</option>)}
            </select>
          </div>
        </div>
        {error && <div style={{ fontSize: 12, color: 'var(--danger)' }}>{error}</div>}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {task && canDelete && (
            <button style={{ ...ghostButton, color: 'var(--danger)' }} onClick={remove} disabled={saving}>Delete</button>
          )}
          <span style={{ flex: 1 }} />
          <button style={ghostButton} onClick={onClose} disabled={saving}>Cancel</button>
          <button style={primaryButton(invalid || saving)} disabled={invalid || saving} onClick={save}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </ModalShell>
  );
}

export function CmsTasksTab({ project, user, tasks, missing, assignees, profilesById, canEdit, canManage, onReload, showToast }) {
  const [statusF, setStatusF] = useState('open');
  const [catF, setCatF] = useState('all');
  const [byF, setByF] = useState('all');
  const [modal, setModal] = useState(null); // null | 'new' | task
  if (missing) return <MissingNotice />;

  const count = (fn) => tasks.filter(fn).length;
  const rows = tasks
    .filter((t) => (statusF === 'all' ? true : statusF === 'open' ? isOpenTask(t) : t.status === statusF))
    .filter((t) => catF === 'all' || t.category === catF)
    .filter((t) => byF === 'all' || t.requestedBy === byF)
    .sort((a, b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999') || (b.createdAt || '').localeCompare(a.createdAt || ''));
  const usedCats = [...new Set([...cmsCategoriesForKind(project.cmsKind), ...tasks.map((t) => t.category)])];

  async function setStatus(t, status) {
    try {
      await api.updateCmsTask(t.id, { status });
      await onReload();
    } catch (e) {
      showToast?.(e.message, 'error');
    }
  }

  const columns = [
    {
      label: 'Task',
      render: (t) => (
        <div style={{ minWidth: 200 }}>
          <div style={{ fontWeight: 600 }}>{t.title}</div>
          <div style={{ fontSize: 11.5, color: 'var(--color-text-tertiary)', marginTop: 2 }}>{cmsCategoryLabel(t.category)}</div>
        </div>
      ),
    },
    {
      label: 'Assigned by',
      thStyle: { whiteSpace: 'nowrap' },
      render: (t) => (
        <span style={{ whiteSpace: 'nowrap' }}>
          {assignedByLabel(t)}
          {t.referenceUrl && (
            <a href={t.referenceUrl} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} style={{ marginLeft: 6, fontSize: 11.5, color: 'var(--brand)' }}>link</a>
          )}
        </span>
      ),
    },
    {
      label: 'Assignee',
      render: (t) => t.assignedTo ? (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, whiteSpace: 'nowrap' }}>
          <Avatar name={profilesById[t.assignedTo]?.name || '?'} size={22} />
          {profilesById[t.assignedTo]?.name || 'Unknown'}
        </span>
      ) : <span style={{ color: 'var(--color-text-tertiary)' }}>Unassigned</span>,
    },
    { label: 'Priority', render: (t) => (t.priority ? <Pill label={t.priority} tone={PRIORITY_TONE[t.priority]} /> : '—') },
    {
      label: 'Due',
      render: (t) => <span style={{ whiteSpace: 'nowrap', color: isOverdue(t) ? 'var(--danger)' : undefined, fontWeight: isOverdue(t) ? 600 : 400 }}>{fmtDate(t.dueDate)}</span>,
    },
    {
      label: 'Status',
      render: (t) => canEdit ? (
        <select
          style={smallSel}
          value={t.status}
          aria-label={`Status of ${t.title}`}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => setStatus(t, e.target.value)}
        >
          {CMS_TASK_STATUS_ORDER.map((s) => <option key={s} value={s}>{CMS_TASK_STATUSES[s].label}</option>)}
        </select>
      ) : <Pill label={CMS_TASK_STATUSES[t.status].label} tone={CMS_TASK_STATUSES[t.status].tone} />,
    },
  ];

  const fSel = { ...inputStyle, width: 'auto', padding: '7px 10px', fontSize: 12, minHeight: 0 };
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
        <Segmented
          value={statusF}
          onChange={setStatusF}
          options={[
            ['open', `Open (${count(isOpenTask)})`],
            ...CMS_TASK_STATUS_ORDER.map((s) => [s, `${CMS_TASK_STATUSES[s].label} (${count((t) => t.status === s)})`]),
            ['all', `All (${tasks.length})`],
          ]}
        />
        <span style={{ flex: 1 }} />
        {canEdit && <button style={primaryButton(false)} onClick={() => setModal('new')}>+ New task</button>}
      </div>
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(t) => t.id}
        searchText={(t) => `${t.title} ${t.details} ${cmsCategoryLabel(t.category)} ${profilesById[t.assignedTo]?.name || ''}`}
        searchPlaceholder="Search tasks…"
        onRowClick={canEdit ? (t) => setModal(t) : undefined}
        toolbar={
          <>
            <select style={fSel} value={catF} aria-label="Category" onChange={(e) => setCatF(e.target.value)}>
              <option value="all">All categories</option>
              {usedCats.map((c) => <option key={c} value={c}>{cmsCategoryLabel(c)}</option>)}
            </select>
            <select style={fSel} value={byF} aria-label="Assigned by" onChange={(e) => setByF(e.target.value)}>
              <option value="all">Assigned by anyone</option>
              {Object.entries(CMS_REQUESTERS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </>
        }
      />
      {tasks.length === 0 && (
        <div style={{ ...muted, marginTop: 12 }}>
          No tasks yet. Add one whenever an AM, PMO or the SEO team sends a request.
        </div>
      )}
      {modal && (
        <TaskModal
          project={project}
          task={modal === 'new' ? null : modal}
          user={user}
          assignees={assignees}
          canDelete={canManage || (modal !== 'new' && modal.createdBy === user.id)}
          onClose={() => setModal(null)}
          onSaved={onReload}
          showToast={showToast}
        />
      )}
    </div>
  );
}

/* ================================================================== */
/* Journey                                                             */
/* ================================================================== */
function StageRow({ index, def, stage, assignees, profilesById, canEdit, onPatch }) {
  const [notes, setNotes] = useState(stage.notes);
  const [open, setOpen] = useState(false);
  useEffect(() => setNotes(stage.notes), [stage.notes]);
  const st = CMS_STAGE_STATUSES[stage.status];
  const dates = [
    stage.startedAt && `Started ${fmtDate(stage.startedAt)}`,
    stage.completedAt && `Done ${fmtDate(stage.completedAt)}`,
    stage.dueDate && stage.status !== 'done' && stage.status !== 'skipped' && `Due ${fmtDate(stage.dueDate)}`,
  ].filter(Boolean).join(' · ');
  const late = stage.dueDate && !['done', 'skipped'].includes(stage.status) && stage.dueDate < today();

  return (
    <li style={{ display: 'flex', gap: 12, padding: '14px 4px', borderBottom: '1px solid var(--color-border-primary)' }}>
      <StepDot index={index} status={stage.status} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13.5, fontWeight: 600, textDecoration: stage.status === 'skipped' ? 'line-through' : undefined, color: stage.status === 'skipped' ? 'var(--color-text-tertiary)' : undefined }}>{def.label}</span>
          {!canEdit && <Pill label={st.label} tone={st.tone} />}
          {late && <Pill label="Late" tone="danger" />}
          {stage.notes && !open && <span style={{ fontSize: 11.5, color: 'var(--color-text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 320 }}>— {stage.notes}</span>}
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--color-text-tertiary)', marginTop: 3 }}>
          {def.hint ? `${def.hint}${dates ? ' · ' : ''}` : ''}{dates}
          {!canEdit && stage.ownerId ? ` · ${profilesById[stage.ownerId]?.name || ''}` : ''}
        </div>
        {canEdit && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10, alignItems: 'center' }}>
            <select style={smallSel} aria-label={`${def.label} status`} value={stage.status} onChange={(e) => onPatch(stage, { status: e.target.value })}>
              {CMS_STAGE_STATUS_ORDER.map((s) => <option key={s} value={s}>{CMS_STAGE_STATUSES[s].label}</option>)}
            </select>
            <select style={smallSel} aria-label={`${def.label} owner`} value={stage.ownerId || ''} onChange={(e) => onPatch(stage, { owner_id: e.target.value || null })}>
              <option value="">No owner</option>
              {assignees.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <input type="date" style={smallSel} aria-label={`${def.label} due date`} value={stage.dueDate || ''} onChange={(e) => onPatch(stage, { due_date: e.target.value || null })} />
            <button style={{ ...ghostButton, padding: '4px 10px', minHeight: 0, fontSize: 12 }} onClick={() => setOpen((o) => !o)}>
              {open ? 'Hide notes' : stage.notes ? 'Notes' : 'Add notes'}
            </button>
          </div>
        )}
        {open && canEdit && (
          <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <textarea style={{ ...inputStyle, resize: 'vertical', fontSize: 12.5 }} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Links, decisions, what’s left…" />
            <button
              style={{ ...primaryButton(notes === stage.notes), padding: '6px 12px', minHeight: 0, fontSize: 12 }}
              disabled={notes === stage.notes}
              onClick={async () => { if (await onPatch(stage, { notes: notes.trim() })) setOpen(false); }}
            >
              Save
            </button>
          </div>
        )}
      </div>
    </li>
  );
}

export function CmsJourneyTab({ project, stages, missing, assignees, profilesById, canEdit, onReload, showToast }) {
  const [busy, setBusy] = useState(false);
  if (missing) return <MissingNotice />;
  const byKey = Object.fromEntries(stages.map((s) => [s.stage, s]));
  const journey = cmsJourneyProgress(stages);

  async function start() {
    setBusy(true);
    try {
      await api.startCmsJourney(project.id, CMS_JOURNEY.map((j) => j.key));
      await onReload();
      showToast?.('Journey started');
    } catch (e) {
      showToast?.(e.message, 'error');
    } finally {
      setBusy(false);
    }
  }
  async function patch(stage, p) {
    try {
      await api.updateCmsStage(stage.id, p);
      await onReload();
      return true;
    } catch (e) {
      showToast?.(e.message, 'error');
      return false;
    }
  }

  if (!journey.started) {
    return (
      <div style={{ ...card, padding: 32 }}>
        <div style={panelHead}>Development journey</div>
        <div style={{ ...muted, marginTop: 6, maxWidth: 560, lineHeight: 1.6 }}>
          For a new website or landing page build. It tracks the project from template selection to final handover, stage by stage.
          Existing websites that only get change requests don’t need it: use Tasks instead.
        </div>
        <ol style={{ margin: '16px 0', paddingLeft: 20, fontSize: 12.5, color: 'var(--color-text-secondary)', lineHeight: 1.9 }}>
          {CMS_JOURNEY.map((j) => <li key={j.key}>{j.label}</li>)}
        </ol>
        {canEdit && <button style={primaryButton(busy)} disabled={busy} onClick={start}>{busy ? 'Starting…' : 'Start development journey'}</button>}
      </div>
    );
  }

  // a stage added to the journey later shows up after a restart (fills the gap)
  const missingStages = CMS_JOURNEY.filter((j) => !byKey[j.key]);
  return (
    <div style={{ ...card, padding: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={panelHead}>Development journey</div>
          <div style={panelSub}>{journey.current ? `Now: ${journey.current.label}` : 'All stages finished'} · {journey.finished}/{journey.total} stages</div>
        </div>
        <span className="tnum" style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 700 }}>{journey.pct}%</span>
      </div>
      <div style={{ height: 6, borderRadius: 999, background: 'var(--color-background-secondary)', overflow: 'hidden', marginTop: 12 }}>
        <div style={{ height: '100%', width: `${Math.max(2, journey.pct)}%`, borderRadius: 999, background: 'var(--brand)' }} />
      </div>
      <ol style={{ listStyle: 'none', margin: '8px 0 0', padding: 0 }}>
        {CMS_JOURNEY.map((j, i) => byKey[j.key] && (
          <StageRow key={j.key} index={i} def={j} stage={byKey[j.key]} assignees={assignees} profilesById={profilesById} canEdit={canEdit} onPatch={patch} />
        ))}
      </ol>
      {missingStages.length > 0 && canEdit && (
        <button style={{ ...ghostButton, marginTop: 12 }} disabled={busy} onClick={start}>Add missing stages</button>
      )}
    </div>
  );
}

/* WBS feature — a flexible flat WBS Builder (fixes16). Items are independent
   rows; platform_type + module are free-text grouping tags shown as a visual
   Platform → Module → item tree. One status per item. Import (field-mapping) is
   a bulk-migration path only; the Builder is primary. */
import { useState, useEffect, useCallback, useRef } from 'react';
import * as api from '@/api.js';
import { parseWbsFile, parseWbsBulk } from '@/wbs.js';
import { card, inputStyle, ghostButton, primaryButton, ModalShell } from '@/ui.jsx';
import { PageHeader, Empty, sideHead } from '@shared/ui-kit.jsx';
import { StatSmall } from '@shared/dashboard-kit.jsx';
import {
  WBS_STATUSES,
  WBS_STATUS_ORDER,
  WBS_DEV_STATUSES,
  WBS_PLATFORM_TYPES,
  WBS_PRIORITIES,
  WBS_PRESETS,
  normalizeWbsStatus,
  SEVERITIES,
  BUG_STATUSES,
} from '@/constants.js';

export function WbsBadge({ status }) {
  const s = WBS_STATUSES[status] || { label: status, color: '#64748b' };
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600,
        color: s.color, background: `${s.color}1a`, border: `1px solid ${s.color}33`,
        padding: '2px 8px', borderRadius: 999, whiteSpace: 'nowrap',
      }}
    >
      {s.label}
    </span>
  );
}

// a group's target date = the latest parseable estimate of its items (kept as
// an export because the client portal reuses it)
export function latestEst(items) {
  let best = null;
  let bestStr = '';
  items.forEach((t) => {
    const s = t.estimatedCompletionDate || t.est || '';
    if (!s) return;
    const ms = Date.parse(s);
    if (Number.isNaN(ms)) {
      if (!best && !bestStr) bestStr = s;
      return;
    }
    if (best == null || ms > best) {
      best = ms;
      bestStr = s;
    }
  });
  return bestStr;
}

const pctDone = (items) => {
  const work = items.filter((i) => i.type !== 'milestone');
  if (!work.length) return 0;
  return Math.round((work.filter((i) => i.status === 'completed').length / work.length) * 100);
};

// tiny control button
function Ctl({ label, title, onClick, disabled, danger }) {
  return (
    <button
      title={title}
      disabled={disabled}
      onClick={onClick}
      style={{
        ...ghostButton, padding: '2px 7px', fontSize: 11, opacity: disabled ? 0.4 : 1,
        color: danger ? '#dc2626' : 'var(--color-text-secondary)',
        borderColor: danger ? '#dc262644' : undefined,
      }}
    >
      {label}
    </button>
  );
}

// priority badge — High=red, Medium=amber, Low=slate
const PRIORITY_TONE = {
  High: { color: '#dc2626', bg: '#dc26261a', bd: '#dc262633' },
  Medium: { color: '#d97706', bg: '#d977061a', bd: '#d9770633' },
  Low: { color: '#64748b', bg: '#64748b1a', bd: '#64748b33' },
};
function PriorityTag({ value }) {
  if (!value) return null;
  const t = PRIORITY_TONE[value] || PRIORITY_TONE.Low;
  return (
    <span style={{ fontSize: 10.5, fontWeight: 700, color: t.color, background: t.bg, border: `1px solid ${t.bd}`, borderRadius: 6, padding: '1px 7px', whiteSpace: 'nowrap' }}>
      {value}
    </span>
  );
}

const FIELDS = [
  { key: 'title', label: 'Title', required: true },
  { key: 'module', label: 'Module' },
  { key: 'platform_type', label: 'Platform Type' },
  { key: 'description', label: 'Description' },
  { key: 'est', label: 'Estimated Date' },
  { key: 'priority', label: 'Priority' },
  { key: 'status', label: 'Status' },
];

/* Import wizard: upload → detect columns → map fields → preview → confirm.
   Does not depend on fixed column positions. */
function WbsImportModal({ headers, rows, onCancel, onConfirm }) {
  // auto-guess a mapping from header names
  const guess = () => {
    const m = {};
    FIELDS.forEach((f) => {
      const hit = headers.findIndex((h) =>
        (h || '').toLowerCase().replace(/[^a-z]/g, '').includes(f.key.replace(/[^a-z]/g, ''))
      );
      m[f.key] = hit;
    });
    if (m.title < 0) {
      // fall back to the column with the most text
      const counts = headers.map((_, c) => rows.reduce((n, r) => n + (String(r[c] ?? '').trim() ? 1 : 0), 0));
      m.title = counts.indexOf(Math.max(...counts));
    }
    return m;
  };
  const [map, setMap] = useState(guess);
  const val = (r, key) => {
    const c = map[key];
    return c == null || c < 0 ? '' : String(r[c] ?? '').trim();
  };
  // indices of every non-empty cell in a raw row (across ALL columns)
  const filledCols = (r) => {
    const cols = [];
    for (let c = 0; c < r.length; c++) if (String(r[c] ?? '').trim()) cols.push(c);
    return cols;
  };
  // Every column that represents a status (Backend Status / Frontend Status / …).
  // A banner row has these all empty; a task row has at least one filled. Fall
  // back to the single mapped status column if no header says "status".
  const statusCols = (() => {
    const byHeader = headers.map((h, c) => c).filter((c) => (headers[c] || '').toLowerCase().includes('status'));
    if (byHeader.length) return byHeader;
    return map.status >= 0 ? [map.status] : [];
  })();
  const rowHasStatus = (r) => statusCols.some((c) => String(r[c] ?? '').trim());

  // Resolve each task's parent module while walking rows top-to-bottom. Modules
  // are declared TWO ways and both update the active module:
  //   1. Section banner in the TITLE column (Column A) with NO status values
  //      (blue merged banner "My Profile" / "Battle Ground") → new module header,
  //      not a task.
  //   2. Merged Module cell (Column C): value on any row → update the module,
  //      forward-filling down its block.
  // A row is a TASK when its title has text AND a status value exists.
  const buildItems = () => {
    const titleCol = map.title;
    let curModule = '';
    let curPlatform = '';
    const out = [];
    for (const r of rows) {
      const rowModule = val(r, 'module');
      const rowPlatform = val(r, 'platform_type');
      const title = val(r, 'title');
      // (1) Column-A banner: title present but every status column empty.
      // When we can't identify any status column, fall back to "only the title
      // cell is filled" so a status-less sheet doesn't flag every row a banner.
      const isBanner = title && (statusCols.length ? !rowHasStatus(r) : (rowModule === '' && filledCols(r).join() === String(titleCol)));
      if (isBanner) {
        curModule = title;                          // section transition
        continue;                                   // banner is not a task
      }
      if (rowModule) curModule = rowModule;          // (2) Column-C (merged) module
      if (rowPlatform) curPlatform = rowPlatform;
      if (!title) continue;                          // blank / separator row
      out.push({
        title,
        module: rowModule || curModule,              // inherit the active section
        platform_type: rowPlatform || curPlatform,
        description: val(r, 'description'),
        est: val(r, 'est'),
        priority: val(r, 'priority'),
        status: normalizeWbsStatus(val(r, 'status')), // 'Completed' → 'completed', etc.
      });
    }
    return out;
  };
  const items = buildItems();

  const footer = (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      <div style={{ fontSize: 12.5, fontWeight: 600, color: items.length ? 'var(--brand)' : 'var(--color-text-tertiary)' }}>
        {items.length ? `${items.length} item${items.length === 1 ? '' : 's'} ready` : 'Map a Title column to continue'}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button style={ghostButton} onClick={onCancel}>Cancel</button>
        <button style={primaryButton(!items.length)} disabled={!items.length} onClick={() => onConfirm(items)}>
          Import {items.length ? `${items.length} ` : ''}item{items.length === 1 ? '' : 's'}
        </button>
      </div>
    </div>
  );

  return (
    <ModalShell
      onClose={onCancel}
      title="Import WBS from spreadsheet"
      subtitle="Map each field to a column. Only Title is required — this adds new items, never overwrites."
      maxWidth={720}
      footer={footer}
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10, marginBottom: 16 }}>
        {FIELDS.map((f) => (
          <div key={f.key}>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary)' }}>
              {f.label}{f.required ? ' *' : ''}
            </label>
            <select
              style={{ ...inputStyle, marginTop: 4 }}
              value={map[f.key] ?? -1}
              onChange={(e) => setMap((m) => ({ ...m, [f.key]: Number(e.target.value) }))}
            >
              <option value={-1}>— none —</option>
              {headers.map((h, c) => (
                <option key={c} value={c}>{h || `Column ${c + 1}`}</option>
              ))}
            </select>
          </div>
        ))}
      </div>

      <div style={{ ...sideHead, marginBottom: 8 }}>Preview · {items.length} item{items.length === 1 ? '' : 's'}</div>
      <div style={{ ...card, padding: 0, maxHeight: 220, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr>
              {['Title', 'Platform', 'Module', 'Est', 'Status'].map((h) => (
                <th key={h} style={{ textAlign: 'left', padding: '7px 10px', borderBottom: '1px solid var(--color-border-primary)', color: 'var(--color-text-secondary)', fontSize: 11 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.slice(0, 50).map((i, idx) => (
              <tr key={idx}>
                <td style={{ padding: '7px 10px', borderBottom: '1px solid var(--color-border-primary)', fontWeight: 500 }}>{i.title}</td>
                <td style={{ padding: '7px 10px', borderBottom: '1px solid var(--color-border-primary)' }}>{i.platform_type || '—'}</td>
                <td style={{ padding: '7px 10px', borderBottom: '1px solid var(--color-border-primary)' }}>{i.module || '—'}</td>
                <td style={{ padding: '7px 10px', borderBottom: '1px solid var(--color-border-primary)' }}>{i.est || '—'}</td>
                <td style={{ padding: '7px 10px', borderBottom: '1px solid var(--color-border-primary)' }}><WbsBadge status={i.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ModalShell>
  );
}

/* Bulk Add: paste a list / outline (or drop in a preset pack) → many items at once.
   Reuses parseWbsBulk; the live preview shows exactly what will be created. */
function WbsBulkModal({ onCancel, onConfirm }) {
  const [platform, setPlatform] = useState('');
  const [module, setModule] = useState('');
  const [text, setText] = useState('');

  const items = parseWbsBulk(text, { defaultPlatform: platform, defaultModule: module });

  // append a preset as a `## <name>` block the user can trim before importing
  const addPreset = (p) => {
    const block = `## ${p.name}\n${p.items.map((t) => `- ${t}`).join('\n')}`;
    setText((prev) => (prev.trim() ? `${prev.replace(/\s+$/, '')}\n\n${block}\n` : `${block}\n`));
  };

  // group the preview for a compact summary
  const groups = {};
  items.forEach((i) => {
    const k = `${i.platform_type || 'Ungrouped'} › ${i.module}`;
    (groups[k] = groups[k] || []).push(i.title);
  });

  const lbl = { fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--color-text-secondary)' };
  const code = { background: 'var(--color-background-secondary)', border: '1px solid var(--color-border-primary)', borderRadius: 5, padding: '1px 5px', fontSize: 11, fontFamily: 'var(--font-mono, monospace)' };

  const footer = (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      <div style={{ fontSize: 12.5, fontWeight: 600, color: items.length ? 'var(--brand)' : 'var(--color-text-tertiary)' }}>
        {items.length ? `${items.length} item${items.length === 1 ? '' : 's'} detected` : 'Paste a list or pick a preset to begin'}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button style={ghostButton} onClick={onCancel}>Cancel</button>
        <button style={primaryButton(!items.length)} disabled={!items.length} onClick={() => onConfirm(items)}>
          Add {items.length ? `${items.length} ` : ''}item{items.length === 1 ? '' : 's'}
        </button>
      </div>
    </div>
  );

  return (
    <ModalShell
      onClose={onCancel}
      title="Bulk add items"
      subtitle="Paste raw feature lists or load a preset pack to create WBS items fast."
      maxWidth={720}
      footer={footer}
    >
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 18 }}>
        <div>
          <label style={lbl}>Default platform</label>
          <input style={{ ...inputStyle, marginTop: 6 }} list="wbs-platforms" value={platform} placeholder="e.g. Mobile App" onChange={(e) => setPlatform(e.target.value)} />
        </div>
        <div>
          <label style={lbl}>Default module</label>
          <input style={{ ...inputStyle, marginTop: 6 }} value={module} placeholder="e.g. Authentication" onChange={(e) => setModule(e.target.value)} />
        </div>
      </div>

      <div style={{ marginBottom: 18 }}>
        <label style={lbl}>Preset packs</label>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
          {WBS_PRESETS.map((p) => (
            <button key={p.key} style={{ ...ghostButton, padding: '5px 11px', fontSize: 11.5 }} onClick={() => addPreset(p)}>
              + {p.name}
            </button>
          ))}
        </div>
      </div>

      <div style={{ marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, marginBottom: 8 }}>
          <label style={lbl}>Item list</label>
          <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
            Use <code style={code}># Platform</code> and <code style={code}>## Module</code> to group
          </span>
        </div>
        <textarea
          style={{ ...inputStyle, resize: 'vertical', fontSize: 12.5, fontFamily: 'var(--font-mono, monospace)', lineHeight: 1.6, padding: 12 }}
          rows={9}
          value={text}
          placeholder={'Onboarding Screens\nSignup with Email\nOTP Verification\n\n## User Profile\n- View Profile\n- Edit Profile'}
          onChange={(e) => setText(e.target.value)}
        />
      </div>

      {items.length > 0 && (
        <div>
          <div style={{ ...sideHead, marginBottom: 8 }}>Preview</div>
          <div style={{ ...card, padding: 0, maxHeight: 200, overflow: 'auto' }}>
            {Object.entries(groups).map(([k, titles]) => (
              <div key={k} style={{ padding: '8px 12px', borderBottom: '1px solid var(--color-border-primary)' }}>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--color-text-secondary)', marginBottom: 3 }}>
                  {k} · {titles.length}
                </div>
                <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>{titles.join(' · ')}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </ModalShell>
  );
}

/* Small on/off pill switch (inline-style, matches the app's control language). */
function Toggle({ on, onClick, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      role="switch"
      aria-checked={on}
      style={{
        width: 38, height: 22, borderRadius: 999, border: 'none', cursor: disabled ? 'default' : 'pointer',
        background: on ? 'var(--brand)' : 'var(--color-border-tertiary, #cbd5e1)', padding: 2,
        display: 'inline-flex', alignItems: 'center', opacity: disabled ? 0.5 : 1, transition: 'background 0.15s',
        justifyContent: on ? 'flex-end' : 'flex-start',
      }}
    >
      <span style={{ width: 18, height: 18, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 2px rgba(0,0,0,0.25)' }} />
    </button>
  );
}

/* Share modal — surfaces the per-project public link (client_links) on the WBS
   page. Reuses the existing client-link API + the ?client=<token> public route. */
function WbsShareModal({ project, onClose, showToast }) {
  const [link, setLink] = useState(undefined); // undefined=loading, null=none, obj=exists
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api.fetchClientLink(project.id)
      .then((l) => !cancelled && setLink(l || null))
      .catch((e) => { if (!cancelled) { setLink(null); showToast(e.message, 'error'); } });
    return () => { cancelled = true; };
  }, [project.id, showToast]);

  const url = link ? `${window.location.origin}/?client=${link.token}` : '';

  const enable = async () => {
    setBusy(true);
    try {
      setLink(await api.createClientLink(project.id));
      showToast('Public link enabled');
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };
  const disable = async () => {
    if (!link || !window.confirm('Turn off the public link? The shared URL will stop working immediately.')) return;
    setBusy(true);
    try {
      await api.deleteClientLink(link.id);
      setLink(null);
      showToast('Public link turned off');
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };
  const toggleBugs = async () => {
    if (!link) return;
    const v = !link.show_open_bugs;
    setLink({ ...link, show_open_bugs: v });
    try {
      await api.updateClientLink(link.id, { show_open_bugs: v });
    } catch (e) {
      setLink({ ...link, show_open_bugs: !v });
      showToast(e.message, 'error');
    }
  };
  const copy = () => {
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  const on = !!link;
  const lbl = { fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--color-text-tertiary)' };

  return (
    <ModalShell
      onClose={onClose}
      title="Share public WBS"
      subtitle={`${project.name} — read-only progress for stakeholders, no account needed.`}
      maxWidth={520}
    >
      {link === undefined ? (
        <div style={{ fontSize: 13, color: 'var(--color-text-tertiary)' }}>Loading…</div>
      ) : (
        <>
          <div
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
              padding: '12px 14px', borderRadius: 'var(--r-card, 10px)', border: '1px solid var(--color-border-primary)',
              background: 'var(--color-background-secondary)',
            }}
          >
            <div>
              <div style={{ fontSize: 13.5, fontWeight: 600 }}>Enable public link</div>
              <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 2 }}>
                {on ? 'Anyone with the link can view live progress.' : 'Only team members can view this WBS.'}
              </div>
            </div>
            <Toggle on={on} disabled={busy} onClick={on ? disable : enable} />
          </div>

          {on && (
            <div style={{ marginTop: 16 }}>
              <label style={lbl}>Live public view link</label>
              <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                <input
                  readOnly
                  value={url}
                  onFocus={(e) => e.target.select()}
                  style={{ ...inputStyle, flex: 1, fontSize: 11.5, fontFamily: 'var(--font-mono, monospace)' }}
                />
                <button style={{ ...primaryButton(false), padding: '0 14px' }} onClick={copy}>
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
              <div style={{ marginTop: 8 }}>
                <a href={url} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: 'var(--brand)', textDecoration: 'none' }}>
                  Open preview ↗
                </a>
              </div>

              <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 16, cursor: 'pointer' }}>
                <Toggle on={link.show_open_bugs} onClick={toggleBugs} />
                <span style={{ fontSize: 13 }}>Show open bug count to viewers</span>
              </label>

              {!project.wbsEnabled && (
                <div style={{ marginTop: 14, fontSize: 12, color: 'var(--warning)', background: '#f59e0b1a', border: '1px solid #f59e0b44', borderRadius: 8, padding: '8px 10px' }}>
                  This project has no WBS items yet — the public view will show the release list until you add items.
                </div>
              )}
            </div>
          )}
        </>
      )}
    </ModalShell>
  );
}

/* One editable item row (inline edit form when opened). */
function WbsItemRow({ item, canManage, canEdit, profiles, bugs = [], onSave, onDelete, onReorder }) {
  const [editing, setEditing] = useState(false);
  const [f, setF] = useState(item);
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const [note, setNote] = useState(item.devComments);
  const [noteOpen, setNoteOpen] = useState(false);
  const [hover, setHover] = useState(false);

  // developers can't override QA-driven statuses (in_qa / completed)
  const statusLocked = (item.status === 'in_qa' || item.status === 'completed') && !canManage;
  const statusOptions = canManage ? WBS_STATUS_ORDER : WBS_DEV_STATUSES;

  if (editing) {
    // task-level fields only — platform / target date / assignee are module-level
    return (
      <div style={{ padding: '10px 12px', borderTop: '1px solid var(--color-border-primary)', background: 'var(--color-background-secondary)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 8 }}>
          <input style={inputStyle} value={f.title} placeholder="Task title" onChange={(e) => set('title', e.target.value)} />
          <select style={inputStyle} value={f.priority || ''} onChange={(e) => set('priority', e.target.value)}>
            <option value="">Priority…</option>
            {WBS_PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <textarea style={{ ...inputStyle, marginTop: 8, resize: 'vertical', fontSize: 12 }} rows={2} value={f.description} placeholder="Description (optional)" onChange={(e) => set('description', e.target.value)} />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
          <button style={ghostButton} onClick={() => { setF(item); setEditing(false); }}>Cancel</button>
          <button
            style={primaryButton(!f.title.trim())}
            disabled={!f.title.trim()}
            onClick={() => {
              onSave(item, {
                title: f.title.trim(), description: f.description, priority: f.priority || null,
              });
              setEditing(false);
            }}
          >
            Save
          </button>
        </div>
      </div>
    );
  }

  // note editor takes over the row when open
  if (noteOpen) {
    return (
      <div style={{ padding: '9px 12px', borderTop: '1px solid var(--color-border-primary)', background: 'var(--color-background-secondary)' }}>
        <div style={{ fontSize: 11.5, fontWeight: 600, marginBottom: 6 }}>{item.title} · developer note</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <textarea style={{ ...inputStyle, resize: 'vertical', fontSize: 12 }} rows={2} value={note} placeholder="Developer comment (internal)…" onChange={(e) => setNote(e.target.value)} />
          <button style={ghostButton} onClick={() => { onSave(item, { dev_comments: note }); setNoteOpen(false); }}>Save</button>
          <button style={ghostButton} onClick={() => { setNote(item.devComments); setNoteOpen(false); }}>Cancel</button>
        </div>
      </div>
    );
  }

  const actionsVisible = hover; // reveal reorder/edit/delete on hover to cut clutter
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ padding: '6px 12px', borderTop: '1px solid var(--color-border-primary)', background: hover ? 'var(--color-background-secondary)' : 'transparent', transition: 'background 0.12s' }}
    >
      {/* compact primary row (~34px) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 13, fontWeight: 500, flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {item.title}
          {item.type === 'milestone' && <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--color-text-tertiary)' }}>◆</span>}
          {item.devComments && <span title={item.devComments} style={{ marginLeft: 6, fontSize: 10.5, color: 'var(--color-text-tertiary)' }}>✎</span>}
          {bugs.length > 0 && (
            <span title={`${bugs.length} open bug(s)`} style={{ marginLeft: 8, fontSize: 10, fontWeight: 700, color: 'var(--danger)', background: '#dc26261a', borderRadius: 999, padding: '1px 6px' }}>
              {bugs.length} bug{bugs.length === 1 ? '' : 's'}
            </span>
          )}
        </span>
        <span style={{ flex: '0 0 auto' }}><PriorityTag value={item.priority} /></span>
        <div style={{ flex: '0 0 auto', width: 124 }}>
          {statusLocked || !canEdit ? (
            <WbsBadge status={item.status} />
          ) : (
            <select
              value={item.status}
              onChange={(e) => onSave(item, { status: e.target.value })}
              style={{ ...inputStyle, width: '100%', padding: '4px 6px', fontSize: 11.5 }}
            >
              {statusOptions.map((s) => <option key={s} value={s}>{WBS_STATUSES[s].label}</option>)}
            </select>
          )}
        </div>
        {/* actions: reveal on hover; keep space reserved so the row doesn't shift */}
        <span style={{ flex: '0 0 auto', display: 'inline-flex', gap: 3, opacity: actionsVisible ? 1 : 0, transition: 'opacity 0.12s', pointerEvents: actionsVisible ? 'auto' : 'none' }}>
          {canEdit && <Ctl label="✎" title="Add / edit note" onClick={() => { setNote(item.devComments); setNoteOpen(true); }} />}
          {canManage && (
            <>
              <Ctl label="▲" title="Move up" onClick={() => onReorder(item, -1)} />
              <Ctl label="▼" title="Move down" onClick={() => onReorder(item, 1)} />
              <Ctl label="Edit" onClick={() => { setF(item); setEditing(true); }} />
              <Ctl label="✕" title="Delete" danger onClick={() => onDelete(item)} />
            </>
          )}
        </span>
      </div>
      {/* open bugs listed compactly only when present */}
      {bugs.length > 0 && (
        <div style={{ marginTop: 5, marginLeft: 2, display: 'flex', flexDirection: 'column', gap: 3 }}>
          {bugs.map((b) => (
            <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11 }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: (SEVERITIES[b.severity] || {}).color || 'var(--danger)', flexShrink: 0 }} />
              <span style={{ color: 'var(--color-text-secondary)', flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.title}</span>
              <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>{(BUG_STATUSES[b.status] || {}).label || b.status}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// format an ISO date ('YYYY-MM-DD') for display without a TZ off-by-one
function fmtDate(d) {
  if (!d) return '—';
  const dt = new Date(`${d}T00:00`);
  if (Number.isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
}

/* Platform section header — shows the platform's milestone dates (Completion /
   Deployment). These are platform-level, independent of modules and tasks. */
function PlatformHeader({ platform, items, target, canManage, open, onToggle, onSaveTarget }) {
  const [editing, setEditing] = useState(false);
  const [comp, setComp] = useState(target?.completionDate || '');
  const [dep, setDep] = useState(target?.deploymentDate || '');
  useEffect(() => {
    if (!editing) {
      setComp(target?.completionDate || '');
      setDep(target?.deploymentDate || '');
    }
  }, [target, editing]);

  const label = platform || 'Ungrouped';
  const done = pctDone(items);
  const dateInput = { ...inputStyle, width: 'auto', padding: '5px 8px', fontSize: 12 };
  const meta = { fontSize: 11.5, color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none' }} onClick={onToggle}>
          <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)', width: 12 }}>{open ? '▾' : '▸'}</span>
          <span style={{ fontSize: 15, fontWeight: 700 }}>{label}</span>
          <span style={{ fontSize: 11.5, color: 'var(--color-text-secondary)' }}>{items.length} item{items.length === 1 ? '' : 's'} · {done}%</span>
        </div>
        <span style={{ flex: 1 }} />
        {editing ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <label style={{ ...meta, display: 'flex', alignItems: 'center', gap: 5 }}>Completion
              <input type="date" style={dateInput} value={comp} onChange={(e) => setComp(e.target.value)} />
            </label>
            <label style={{ ...meta, display: 'flex', alignItems: 'center', gap: 5 }}>Deployment
              <input type="date" style={dateInput} value={dep} onChange={(e) => setDep(e.target.value)} />
            </label>
            <button style={ghostButton} onClick={() => setEditing(false)}>Cancel</button>
            <button
              style={primaryButton(false)}
              onClick={async () => { await onSaveTarget(platform, { completionDate: comp, deploymentDate: dep }); setEditing(false); }}
            >
              Save
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            <span style={meta}>Completion: <strong style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>{fmtDate(target?.completionDate)}</strong></span>
            <span style={meta}>Deployment: <strong style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>{fmtDate(target?.deploymentDate)}</strong></span>
            {canManage && (
              <button onClick={() => setEditing(true)} style={{ background: 'none', border: 'none', color: 'var(--brand)', cursor: 'pointer', fontSize: 11.5, fontFamily: 'inherit', padding: 0 }}>
                Edit dates
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* One module = one (platform, module) group. Holds the shared metadata (target
   date, assignee) once in its header; tasks below only carry title/status/priority.
   A fast inline adder appends tasks that inherit the module's metadata. */
function ModuleCard({ group, canManage, canEdit, profiles, bugsByItem, collapsed, onToggle, onAddTask, onSaveItem, onDeleteItem, onReorderItem, onSaveMeta, onCompleteAll }) {
  const { platform, module, items } = group;
  const allDone = items.length > 0 && items.every((i) => i.status === 'completed');
  const [text, setText] = useState('');
  const [adding, setAdding] = useState(false);
  const [metaOpen, setMetaOpen] = useState(false);

  const platformLabel = platform || 'Ungrouped';
  const moduleLabel = module || 'General';
  const done = pctDone(items);
  const est = latestEst(items);
  const assigneeIds = [...new Set(items.map((i) => i.assignedTo).filter(Boolean))];
  const moduleAssignee = assigneeIds.length === 1 ? profiles.find((p) => p.id === assigneeIds[0]) : null;
  const assigneeLabel = moduleAssignee ? moduleAssignee.name : assigneeIds.length > 1 ? 'Mixed' : 'Unassigned';

  const [meta, setMeta] = useState({ module: moduleLabel === 'General' ? '' : module, platform, est: est || '', assignee: assigneeIds.length === 1 ? assigneeIds[0] : '' });
  const openMeta = () => { setMeta({ module: module || '', platform: platform || '', est: est || '', assignee: assigneeIds.length === 1 ? assigneeIds[0] : '' }); setMetaOpen(true); };

  const add = async () => {
    const t = text.trim();
    if (!t) return;
    await onAddTask(group, t);
    setText(''); // keep the adder focused so you can type the next one
  };

  const chip = { fontSize: 10.5, fontWeight: 600, color: 'var(--brand)', background: '#2563eb14', border: '1px solid #2563eb33', borderRadius: 6, padding: '1px 7px', whiteSpace: 'nowrap' };
  const metaItem = { fontSize: 11.5, color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' };

  return (
    <div style={{ ...card, padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', alignSelf: 'start' }}>
      {/* module header — shared metadata lives here */}
      <div style={{ background: 'var(--color-background-secondary)', borderBottom: collapsed ? 'none' : '1px solid var(--color-border-primary)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 14px 6px', cursor: 'pointer', userSelect: 'none' }} onClick={() => onToggle()}>
          <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)', width: 12 }}>{collapsed ? '▸' : '▾'}</span>
          <span style={{ fontSize: 13.5, fontWeight: 700, flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{moduleLabel}</span>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary)', background: 'var(--color-background-primary, #fff)', border: '1px solid var(--color-border-primary)', borderRadius: 999, padding: '1px 8px' }}>{items.length}</span>
          <span style={{ fontSize: 11.5, fontWeight: 700, color: done === 100 ? 'var(--success)' : 'var(--brand)' }}>{done}%</span>
        </div>
        {metaOpen ? (
          <div style={{ padding: '4px 14px 12px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <input style={inputStyle} value={meta.module} placeholder="Module name" onChange={(e) => setMeta((m) => ({ ...m, module: e.target.value }))} />
            <input style={inputStyle} list="wbs-platforms" value={meta.platform} placeholder="Platform" onChange={(e) => setMeta((m) => ({ ...m, platform: e.target.value }))} />
            <input style={inputStyle} value={meta.est} placeholder="Target date" onChange={(e) => setMeta((m) => ({ ...m, est: e.target.value }))} />
            <select style={inputStyle} value={meta.assignee} onChange={(e) => setMeta((m) => ({ ...m, assignee: e.target.value }))}>
              <option value="">Unassigned</option>
              {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button style={ghostButton} onClick={() => setMetaOpen(false)}>Cancel</button>
              <button
                style={primaryButton(false)}
                onClick={async () => {
                  await onSaveMeta(group, {
                    module: meta.module.trim(),
                    platform_type: meta.platform.trim(),
                    estimated_completion_date: meta.est.trim(),
                    assigned_to: meta.assignee || null,
                  });
                  setMetaOpen(false);
                }}
              >
                Save module
              </button>
            </div>
          </div>
        ) : (
          !collapsed && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '0 14px 10px 26px', flexWrap: 'wrap' }}>
              <span style={chip}>{platformLabel}</span>
              <span style={metaItem}>Target: <strong style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>{est || '—'}</strong></span>
              <span style={metaItem}>Lead: <strong style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>{assigneeLabel}</strong></span>
              {canManage && (
                <span style={{ display: 'inline-flex', gap: 14, marginLeft: 'auto' }}>
                  {!allDone && (
                    <button onClick={() => onCompleteAll(group)} style={{ background: 'none', border: 'none', color: 'var(--success)', cursor: 'pointer', fontSize: 11.5, fontWeight: 600, fontFamily: 'inherit', padding: 0 }}>
                      ✓ Mark all complete
                    </button>
                  )}
                  <button onClick={openMeta} style={{ background: 'none', border: 'none', color: 'var(--brand)', cursor: 'pointer', fontSize: 11.5, fontFamily: 'inherit', padding: 0 }}>
                    Edit module
                  </button>
                </span>
              )}
            </div>
          )
        )}
      </div>

      {!collapsed && (
        <>
          {/* fast inline task adder */}
          {canManage && (
            <div style={{ display: 'flex', gap: 6, padding: '8px 12px', borderBottom: '1px solid var(--color-border-primary)' }}>
              <input
                style={{ ...inputStyle, flex: 1, fontSize: 12.5, padding: '6px 10px' }}
                value={text}
                placeholder="Add task & press Enter…"
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
                disabled={adding}
              />
              <button style={primaryButton(!text.trim())} disabled={!text.trim() || adding} onClick={() => { setAdding(true); add().finally(() => setAdding(false)); }}>
                Add
              </button>
            </div>
          )}

          {/* task rows (scroll within the card so grid cells stay balanced) */}
          <div style={{ maxHeight: 420, overflowY: 'auto' }}>
            {items.length === 0 ? (
              <div style={{ padding: '14px', fontSize: 12.5, color: 'var(--color-text-tertiary)', textAlign: 'center' }}>No tasks yet.</div>
            ) : (
              items.map((it) => (
                <WbsItemRow
                  key={it.id}
                  item={it}
                  canManage={canManage}
                  canEdit={canEdit}
                  profiles={profiles}
                  bugs={bugsByItem[it.id] || []}
                  onSave={onSaveItem}
                  onDelete={onDeleteItem}
                  onReorder={onReorderItem}
                />
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}

export function WbsPage({ user, projects, profiles = [], showToast }) {
  const [projectId, setProjectId] = useState(projects[0]?.id || '');
  const [items, setItems] = useState([]);
  const [bugsByItem, setBugsByItem] = useState({});
  const [platformTargets, setPlatformTargets] = useState({}); // platformType -> {completionDate, deploymentDate}
  const [loading, setLoading] = useState(false);
  const [statusF, setStatusF] = useState('all');
  const [q, setQ] = useState('');
  const [importData, setImportData] = useState(null); // {headers, rows}
  const [bulkOpen, setBulkOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ title: '', platformType: '', module: '', est: '', priority: '' });
  const [collapsed, setCollapsed] = useState(() => new Set()); // accordion state (keys collapsed)
  const fileRef = useRef(null);

  const isCol = (key) => collapsed.has(key);
  const toggleCol = (key) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  useEffect(() => {
    if (!projectId && projects[0]?.id) setProjectId(projects[0].id);
  }, [projects, projectId]);

  const project = projects.find((p) => p.id === projectId) || null;
  const canManage = user.role === 'Admin' || (user.role === 'Team Lead' && project && project.teamId === user.teamId);
  const canEdit = user.role === 'Developer' || canManage;

  // silent data pull — no `spinner` flag flip, so callers can refresh without
  // blanking the whole board to "Loading…". Only the initial/project-switch load
  // shows the spinner.
  const refresh = useCallback(async ({ spinner = false } = {}) => {
    if (!projectId) return;
    if (spinner) setLoading(true);
    try {
      const list = await api.fetchWbsItems(projectId);
      setItems(list);
      try {
        const linked = await api.fetchBugsByTaskIds(list.map((i) => i.id));
        const m = {};
        linked.forEach((b) => (m[b.wbsTaskId] = m[b.wbsTaskId] || []).push(b));
        setBugsByItem(m);
      } catch {
        setBugsByItem({});
      }
      try {
        const targets = await api.fetchWbsPlatformTargets(projectId);
        const tm = {};
        targets.forEach((t) => { tm[t.platformType] = t; });
        setPlatformTargets(tm);
      } catch {
        setPlatformTargets({});
      }
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      if (spinner) setLoading(false);
    }
  }, [projectId, showToast]);

  // initial load / project switch shows the spinner; later refreshes are silent
  useEffect(() => { refresh({ spinner: true }); }, [refresh]);

  const run = async (fn, msg) => {
    try {
      await fn();
      if (msg) showToast(msg);
      await refresh();
    } catch (e) {
      showToast(e.message, 'error');
    }
  };

  // patch keys are DB columns; map the ones we render back to camelCase for the
  // optimistic local update
  const OPTIMISTIC_KEYS = { status: 'status', title: 'title', description: 'description', priority: 'priority', dev_comments: 'devComments' };
  // single-item field edits (status / note / title / priority) update local state
  // immediately and persist in the background — no refetch, no page flash
  const save = async (item, patch) => {
    const local = {};
    for (const [k, v] of Object.entries(patch)) if (k in OPTIMISTIC_KEYS) local[OPTIMISTIC_KEYS[k]] = v;
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, ...local } : i)));
    try {
      await api.updateWbsItem(item.id, patch);
    } catch (e) {
      showToast(e.message, 'error');
      refresh(); // resync from server on failure
    }
  };
  const del = (item) => {
    if (window.confirm(`Delete "${item.title}"? Release history keeps its name.`)) run(() => api.deleteWbsItem(item.id), 'Item deleted');
  };
  // reorder within the flat position order (swap with the adjacent item)
  const reorder = (item, dir) => {
    const ordered = items.slice().sort((a, b) => a.position - b.position);
    const idx = ordered.findIndex((x) => x.id === item.id);
    const j = idx + dir;
    if (j < 0 || j >= ordered.length) return;
    const ids = ordered.map((x) => x.id);
    [ids[idx], ids[j]] = [ids[j], ids[idx]];
    run(() => api.reorderWbsItems(ids));
  };
  const addItem = () => {
    if (!form.title.trim()) return;
    run(
      () => api.createWbsItem(projectId, {
        title: form.title.trim(), platformType: form.platformType, module: form.module,
        estimatedCompletionDate: form.est, priority: form.priority || null, position: items.length,
      }),
      'Item added'
    );
    setForm({ title: '', platformType: form.platformType, module: form.module, est: '', priority: '' });
  };
  // add a task to an existing module — inherits the module's shared metadata
  const addTaskToGroup = (group, title) => {
    const est = latestEst(group.items);
    const assigneeIds = [...new Set(group.items.map((i) => i.assignedTo).filter(Boolean))];
    return run(() => api.createWbsItem(projectId, {
      title,
      platformType: group.platform,
      module: group.module,
      estimatedCompletionDate: est || '',
      assignedTo: assigneeIds.length === 1 ? assigneeIds[0] : null,
      position: items.length,
    }));
  };
  // edit module-level metadata → apply to every item in the group at once
  const saveModuleMeta = (group, patch) =>
    run(() => api.updateWbsItems(group.items.map((i) => i.id), patch), 'Module updated');
  // mark every task in a module completed — optimistic + background bulk update
  const completeModule = async (group) => {
    const ids = group.items.map((i) => i.id);
    if (!ids.length) return;
    const n = ids.length;
    if (!window.confirm(`Mark all ${n} task${n === 1 ? '' : 's'} in "${group.module || 'General'}" as Completed?`)) return;
    const idSet = new Set(ids);
    setItems((prev) => prev.map((i) => (idSet.has(i.id) ? { ...i, status: 'completed' } : i)));
    try {
      await api.setWbsItemStatus(ids, 'completed');
    } catch (e) {
      showToast(e.message, 'error');
      refresh();
    }
  };
  // platform-level milestone dates — optimistic local update + background upsert
  const saveTarget = async (platform, patch) => {
    setPlatformTargets((prev) => ({ ...prev, [platform]: { ...(prev[platform] || {}), ...patch } }));
    try {
      const saved = await api.upsertWbsPlatformTarget(projectId, platform, patch);
      setPlatformTargets((prev) => ({ ...prev, [platform]: saved }));
    } catch (e) {
      showToast(e.message, 'error');
      refresh();
    }
  };
  const deleteWholeWbs = () => {
    if (window.confirm('Delete the ENTIRE WBS for this project? Release history is preserved. This cannot be undone.'))
      run(() => api.deleteWbs(projectId), 'WBS deleted');
  };

  async function onFile(e) {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const parsed = await parseWbsFile(file); // { headers, rows }
      if (!parsed.rows?.length) throw new Error('No rows detected in the spreadsheet.');
      setImportData(parsed);
    } catch (err) {
      showToast(err.message || 'Could not read the file', 'error');
    }
  }
  const confirmImport = async (mapped) => {
    setImportData(null);
    await run(async () => {
      const r = await api.importWbs(projectId, mapped);
      showToast(`Imported ${r.added} item${r.added === 1 ? '' : 's'}`);
    });
  };
  // bulk add reuses the additive importer (fresh import_keys → all inserted, appended)
  const confirmBulk = async (parsed) => {
    setBulkOpen(false);
    await run(async () => {
      const r = await api.importWbs(projectId, parsed);
      showToast(`Added ${r.added} item${r.added === 1 ? '' : 's'}`);
    });
  };

  // filter + group into a flat list of module cards (one per platform+module),
  // preserving the REAL platform/module values so new tasks inherit them.
  const filtered = items.filter(
    (i) => (statusF === 'all' || i.status === statusF) && (!q.trim() || i.title.toLowerCase().includes(q.trim().toLowerCase()))
  );
  const groupMap = new Map();
  const groupList = [];
  filtered.forEach((i) => {
    const platform = i.platformType || '';
    const module = i.module || '';
    const key = `${platform}\u0000${module}`;
    if (!groupMap.has(key)) {
      const g = { key, platform, module, items: [] };
      groupMap.set(key, g);
      groupList.push(g);
    }
    groupMap.get(key).items.push(i);
  });
  // group the module cards by platform, preserving first-seen order
  const platformOrder = [];
  const platformMap = new Map();
  groupList.forEach((g) => {
    if (!platformMap.has(g.platform)) { platformMap.set(g.platform, []); platformOrder.push(g.platform); }
    platformMap.get(g.platform).push(g);
  });

  const overall = pctDone(items);
  const byStatus = (s) => items.filter((i) => i.status === s).length;
  const fSel = { ...inputStyle, width: 'auto', padding: '7px 10px', fontSize: 12 };

  // collapse-all operates on the platform sections
  const allGroupKeys = platformOrder.map((p) => `plat:${p}`);
  const allCollapsed = allGroupKeys.length > 0 && allGroupKeys.every((k) => collapsed.has(k));

  return (
    <>
      <datalist id="wbs-platforms">{WBS_PLATFORM_TYPES.map((p) => <option key={p} value={p} />)}</datalist>
      <PageHeader title="WBS Builder" subtitle="Flexible work breakdown — group by platform & module, one status per item" />

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14, alignItems: 'center' }}>
        <select style={fSel} value={projectId} onChange={(e) => setProjectId(e.target.value)}>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.name} {p.wbsEnabled ? '• WBS' : ''}</option>
          ))}
        </select>
        <select style={fSel} value={statusF} onChange={(e) => setStatusF(e.target.value)}>
          <option value="all">All statuses</option>
          {WBS_STATUS_ORDER.map((s) => <option key={s} value={s}>{WBS_STATUSES[s].label}</option>)}
        </select>
        <input style={{ ...fSel, flex: '1 1 160px' }} value={q} placeholder="Search items…" onChange={(e) => setQ(e.target.value)} />
        {allGroupKeys.length > 1 && (
          <button style={ghostButton} onClick={() => setCollapsed(allCollapsed ? new Set() : new Set(allGroupKeys))}>
            {allCollapsed ? 'Expand all' : 'Collapse all'}
          </button>
        )}
        {canManage && (
          <>
            <button style={ghostButton} onClick={() => setAdding((v) => !v)}>{adding ? 'Close' : '+ New module'}</button>
            <button style={primaryButton(false)} onClick={() => setBulkOpen(true)}>Bulk add</button>
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }} onChange={onFile} />
            <button style={ghostButton} onClick={() => fileRef.current?.click()}>Import</button>
            {project && <button style={ghostButton} onClick={() => setShareOpen(true)}>Share</button>}
            {items.length > 0 && (
              <button style={{ ...ghostButton, color: '#dc2626', borderColor: '#dc262644' }} onClick={deleteWholeWbs}>Delete WBS</button>
            )}
          </>
        )}
      </div>

      {adding && canManage && (
        <div style={{ ...card, padding: 12, marginBottom: 14, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8, alignItems: 'end' }}>
          <input style={inputStyle} value={form.module} placeholder="Module name *" onChange={(e) => setForm((f) => ({ ...f, module: e.target.value }))} />
          <input style={inputStyle} list="wbs-platforms" value={form.platformType} placeholder="Platform" onChange={(e) => setForm((f) => ({ ...f, platformType: e.target.value }))} />
          <input style={inputStyle} value={form.est} placeholder="Target date" onChange={(e) => setForm((f) => ({ ...f, est: e.target.value }))} />
          <input style={inputStyle} value={form.title} placeholder="First task title *" onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} onKeyDown={(e) => e.key === 'Enter' && addItem()} />
          <button style={primaryButton(!form.title.trim() || !form.module.trim())} disabled={!form.title.trim() || !form.module.trim()} onClick={addItem}>Create module</button>
        </div>
      )}

      {items.length > 0 && (
        <>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
            <StatSmall label="Total Items" value={items.length} />
            <StatSmall label="Not Started" value={byStatus('not_started')} />
            <StatSmall label="In Progress" value={byStatus('in_progress')} color={byStatus('in_progress') ? 'var(--brand)' : undefined} />
            <StatSmall label="In QA" value={byStatus('in_qa')} color={byStatus('in_qa') ? 'var(--warning)' : undefined} />
            <StatSmall label="Completed" value={byStatus('completed')} color="var(--success)" />
            {byStatus('blocked') > 0 && <StatSmall label="Blocked" value={byStatus('blocked')} color="var(--danger)" />}
          </div>
          <div style={{ ...card, padding: 16, marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>Overall project completion</span>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700, color: 'var(--brand)' }}>{overall}%</span>
            </div>
            <div style={{ height: 10, borderRadius: 999, background: 'var(--color-background-secondary)', overflow: 'hidden' }}>
              <div style={{ width: `${overall}%`, height: '100%', borderRadius: 999, background: 'var(--brand)' }} />
            </div>
          </div>
        </>
      )}

      {loading ? (
        <div style={{ fontSize: 13, color: 'var(--color-text-tertiary)' }}>Loading…</div>
      ) : items.length === 0 ? (
        <Empty>{canManage ? 'No WBS yet — create a module above, use Bulk add, or Import a spreadsheet.' : 'This project has no WBS yet.'}</Empty>
      ) : filtered.length === 0 ? (
        <Empty>No items match the filter.</Empty>
      ) : (
        // platform sections: each header carries the platform's milestone dates;
        // its module cards masonry below (short cards pack tight, no dead space)
        <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
          {platformOrder.map((platform) => {
            const mods = platformMap.get(platform);
            const platItems = mods.flatMap((m) => m.items);
            const pKey = `plat:${platform}`;
            const pOpen = !isCol(pKey);
            return (
              <div key={platform}>
                <PlatformHeader
                  platform={platform}
                  items={platItems}
                  target={platformTargets[platform]}
                  canManage={canManage}
                  open={pOpen}
                  onToggle={() => toggleCol(pKey)}
                  onSaveTarget={saveTarget}
                />
                {pOpen && (
                  <div style={{ columnWidth: 400, columnGap: 16, marginTop: 12 }}>
                    {mods.map((g) => (
                      <div
                        key={g.key}
                        style={{ breakInside: 'avoid', WebkitColumnBreakInside: 'avoid', pageBreakInside: 'avoid', marginBottom: 16 }}
                      >
                        <ModuleCard
                          group={g}
                          canManage={canManage}
                          canEdit={canEdit}
                          profiles={profiles}
                          bugsByItem={bugsByItem}
                          collapsed={isCol(g.key)}
                          onToggle={() => toggleCol(g.key)}
                          onAddTask={addTaskToGroup}
                          onSaveItem={save}
                          onDeleteItem={del}
                          onReorderItem={reorder}
                          onSaveMeta={saveModuleMeta}
                          onCompleteAll={completeModule}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {importData && (
        <WbsImportModal
          headers={importData.headers}
          rows={importData.rows}
          onCancel={() => setImportData(null)}
          onConfirm={confirmImport}
        />
      )}

      {bulkOpen && <WbsBulkModal onCancel={() => setBulkOpen(false)} onConfirm={confirmBulk} />}

      {shareOpen && project && <WbsShareModal project={project} onClose={() => setShareOpen(false)} showToast={showToast} />}
    </>
  );
}

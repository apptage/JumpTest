/* WBS feature — a flexible flat WBS Builder (fixes16). Items are independent
   rows; platform_type + module are free-text grouping tags shown as a visual
   Platform → Module → item tree. One status per item. Import (field-mapping) is
   a bulk-migration path only; the Builder is primary. */
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import * as api from '@/api.js';
import { parseWbsFile, parseWbsBulk } from '@/wbs.js';
import { card, inputStyle, ghostButton, primaryButton, ModalShell, confirmAction } from '@/ui.jsx';
import { PageHeader, Empty, sideHead, filterSelect, filterInput, ActionMenu, pressable } from '@shared/ui-kit.jsx';
import { StatSmall, SubTabs, Pill, SkeletonList } from '@shared/dashboard-kit.jsx';
import { capPct, computeWorkCompletion, liveBugs, wbsQaStatus } from '@shared/wbsMetrics.js';
import {
  WBS_STATUSES,
  WBS_STATUS_ORDER,
  WBS_QA_STATUSES,
  WBS_QA_STATUS_ORDER,
  WBS_TRACKS,
  WBS_TRACK_ORDER,
  wbsTrackLabel,
  isSqaTrack,
  wbsStatusChoices,
  WBS_PLATFORM_TYPES,
  WBS_PRIORITIES,
  WBS_PRESETS,
  normalizeWbsStatus,
  SEVERITIES,
  BUG_STATUSES, tint } from '@/constants.js';
import { managesProject } from '@shared/permissions.js';

export function WbsBadge({ status }) {
  const s = WBS_STATUSES[status] || { label: status, color: 'var(--c-slate)' };
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600,
        color: s.color, background: tint(s.color, 10), border: `1px solid ${tint(s.color, 20)}`,
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
  return capPct(work.filter((i) => i.status === 'completed').length, work.length);
};

function ProgressRow({ label, done, total, pct, strong }) {
  const complete = pct === 100;
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: strong ? 8 : 6 }}>
        <span style={{ fontSize: 13, fontWeight: strong ? 700 : 600, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
        <span className="tnum" style={{ fontSize: 12, color: 'var(--color-text-tertiary)', whiteSpace: 'nowrap' }}>{done}/{total}</span>
        <span className="tnum" style={{ fontFamily: 'var(--font-display)', fontSize: strong ? 20 : 14, fontWeight: 700, color: complete ? 'var(--success)' : 'var(--brand)' }}>{pct}%</span>
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        style={{ height: strong ? 10 : 6, borderRadius: 999, background: 'var(--color-background-secondary)', overflow: 'hidden' }}
      >
        <div style={{ width: `${pct}%`, height: '100%', borderRadius: 999, background: complete ? 'var(--success)' : 'var(--brand)' }} />
      </div>
    </div>
  );
}

/* One bar per interface (Mobile App, Web App, …), reported bugs, then the
   overall bar they add up to. Also used by the client portal. */
export function ProjectProgress({ interfaces, bugs, overall }) {
  const parts = [...interfaces];
  if (bugs && bugs.total > 0) parts.push({ key: 'bugs', label: 'Reported bugs', done: bugs.resolved, total: bugs.total, pct: capPct(bugs.resolved, bugs.total) });
  return (
    <>
      {parts.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))', gap: '14px 24px', paddingBottom: 16, marginBottom: 16, borderBottom: '1px solid var(--color-border-primary)' }}>
          {parts.map((r) => <ProgressRow key={r.key} label={r.label} done={r.done} total={r.total} pct={r.pct} />)}
        </div>
      )}
      <ProgressRow label="Overall project progress" done={overall.done} total={overall.total} pct={overall.pct} strong />
    </>
  );
}

/* Where the completion number comes from: one line per track with work in it,
   plus reported bugs. Also used by the client portal. */
export function TrackBreakdown({ byTrack, bugs }) {
  const rows = byTrack.filter((t) => t.total > 0);
  const item = (key, label, value) => (
    <span key={key} style={{ fontSize: 12, color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>
      {label} <strong className="tnum" style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>{value}</strong>
    </span>
  );
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px', marginTop: 12 }}>
      {rows.map((t) => item(t.track, wbsTrackLabel(t.track), `${t.done}/${t.total}`))}
      {bugs && bugs.total > 0 && item('bugs', 'Bugs resolved', `${bugs.resolved}/${bugs.total}`)}
    </div>
  );
}

// tiny control button
function Ctl({ label, title, onClick, disabled, danger }) {
  return (
    <button
      title={title}
      disabled={disabled}
      onClick={onClick}
      style={{
        ...ghostButton, padding: '2px 8px', fontSize: 12, opacity: disabled ? 0.4 : 1,
        color: danger ? 'var(--c-red)' : 'var(--color-text-secondary)',
        borderColor: danger ? tint('var(--c-red)', 27) : undefined,
      }}
    >
      {label}
    </button>
  );
}

// priority badge — High=red, Medium=amber, Low=slate
const PRIORITY_TONE = {
  High: { color: 'var(--c-red)', bg: tint('var(--c-red)', 10), bd: tint('var(--c-red)', 20) },
  Medium: { color: 'var(--tone-warning-fg)', bg: tint('var(--c-amber)', 10), bd: tint('var(--c-amber)', 20) },
  Low: { color: 'var(--c-slate)', bg: tint('var(--c-slate)', 10), bd: tint('var(--c-slate)', 20) },
};
function PriorityTag({ value }) {
  if (!value) return null;
  const t = PRIORITY_TONE[value] || PRIORITY_TONE.Low;
  return (
    <span style={{ fontSize: 12, fontWeight: 700, color: t.color, background: t.bg, border: `1px solid ${t.bd}`, borderRadius: 6, padding: '1px 8px', whiteSpace: 'nowrap' }}>
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
function WbsImportModal({ headers, rows, trackLabel, onCancel, onConfirm }) {
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
      <div style={{ fontSize: 13, fontWeight: 600, color: items.length ? 'var(--brand)' : 'var(--color-text-tertiary)' }}>
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
      subtitle={`Adds to the ${trackLabel} tab. Map each field to a column — only Title is required. This adds new items, never overwrites.`}
      maxWidth={720}
      footer={footer}
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12, marginBottom: 16 }}>
        {FIELDS.map((f) => (
          <div key={f.key}>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)' }}>
              {f.label}{f.required ? ' *' : ''}
            </label>
            <select
              aria-label={`Column for ${f.label}`}
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
                <th key={h} style={{ textAlign: 'left', padding: '8px 12px', borderBottom: '1px solid var(--color-border-primary)', color: 'var(--color-text-secondary)', fontSize: 12 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.slice(0, 50).map((i, idx) => (
              <tr key={idx}>
                <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--color-border-primary)', fontWeight: 500 }}>{i.title}</td>
                <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--color-border-primary)' }}>{i.platform_type || '—'}</td>
                <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--color-border-primary)' }}>{i.module || '—'}</td>
                <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--color-border-primary)' }}>{i.est || '—'}</td>
                <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--color-border-primary)' }}><WbsBadge status={i.status} /></td>
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
function WbsBulkModal({ trackLabel, onCancel, onConfirm }) {
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
  const code = { background: 'var(--color-background-secondary)', border: '1px solid var(--color-border-primary)', borderRadius: 5, padding: '1px 4px', fontSize: 12, fontFamily: 'var(--font-mono, monospace)' };

  const footer = (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: items.length ? 'var(--brand)' : 'var(--color-text-tertiary)' }}>
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
      subtitle={`Adds to the ${trackLabel} tab. Paste raw feature lists or load a preset pack to create WBS items fast.`}
      maxWidth={720}
      footer={footer}
    >
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
        <div>
          <label style={lbl}>Default platform</label>
          <input style={{ ...inputStyle, marginTop: 8 }} list="wbs-platforms" value={platform} placeholder="e.g. Mobile App" onChange={(e) => setPlatform(e.target.value)} />
        </div>
        <div>
          <label style={lbl}>Default module</label>
          <input style={{ ...inputStyle, marginTop: 8 }} value={module} placeholder="e.g. Authentication" onChange={(e) => setModule(e.target.value)} />
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={lbl}>Preset packs</label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
          {WBS_PRESETS.map((p) => (
            <button key={p.key} style={{ ...ghostButton, padding: '4px 12px', fontSize: 12 }} onClick={() => addPreset(p)}>
              + {p.name}
            </button>
          ))}
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
          <label style={lbl}>Item list</label>
          <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>
            Use <code style={code}># Platform</code> and <code style={code}>## Module</code> to group
          </span>
        </div>
        <textarea
          style={{ ...inputStyle, resize: 'vertical', fontSize: 13, fontFamily: 'var(--font-mono, monospace)', lineHeight: 1.6, padding: 12 }}
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
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-secondary)', marginBottom: 4 }}>
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
        background: on ? 'var(--brand)' : 'var(--color-border-tertiary)', padding: 2,
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
  const [copiedReport, setCopiedReport] = useState(false);

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
    if (!link || !await confirmAction('Turn off the public link? The shared URL will stop working immediately.')) return;
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
  const toggleReport = async () => {
    if (!link) return;
    const v = !link.show_bug_report;
    setLink({ ...link, show_bug_report: v });
    try {
      await api.updateClientLink(link.id, { show_bug_report: v });
    } catch (e) {
      setLink({ ...link, show_bug_report: !v });
      showToast(e.message, 'error');
    }
  };
  const copy = () => {
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };
  // a direct link that opens the portal straight on the QA report tab
  const reportUrl = url ? `${url}&view=qa` : '';
  const copyReport = () => {
    navigator.clipboard.writeText(reportUrl);
    setCopiedReport(true);
    setTimeout(() => setCopiedReport(false), 1600);
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
        <SkeletonList rows={2} height={40} />
      ) : (
        <>
          <div
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
              padding: '12px 16px', borderRadius: 'var(--r-card, 10px)', border: '1px solid var(--color-border-primary)',
              background: 'var(--color-background-secondary)',
            }}
          >
            <div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>Enable public link</div>
              <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 2 }}>
                {on ? 'Anyone with the link can view live progress.' : 'Only team members can view this WBS.'}
              </div>
            </div>
            <Toggle on={on} disabled={busy} onClick={on ? disable : enable} />
          </div>

          {on && (
            <div style={{ marginTop: 16 }}>
              <label style={lbl}>Live public view link</label>
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <input
                  readOnly
                  value={url}
                  onFocus={(e) => e.target.select()}
                  style={{ ...inputStyle, flex: 1, fontSize: 12, fontFamily: 'var(--font-mono, monospace)' }}
                />
                <button style={{ ...primaryButton(false), padding: '0 16px' }} onClick={copy}>
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
              <div style={{ marginTop: 8 }}>
                <a href={url} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: 'var(--brand)', textDecoration: 'none' }}>
                  Open preview ↗
                </a>
              </div>

              <label style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 16, cursor: 'pointer' }}>
                <Toggle on={link.show_open_bugs} onClick={toggleBugs} />
                <span style={{ fontSize: 13 }}>Show open bug count to viewers</span>
              </label>

              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginTop: 12, cursor: 'pointer' }}>
                <Toggle on={!!link.show_bug_report} onClick={toggleReport} />
                <span style={{ fontSize: 13 }}>
                  Include full QA bug report
                  <span style={{ display: 'block', fontSize: 12, color: 'var(--color-text-tertiary)', marginTop: 2 }}>
                    Every bug across all builds — title, severity, status & dates. No internal notes, screenshots or names.
                  </span>
                </span>
              </label>

              {link.show_bug_report && (
                <div style={{ marginTop: 16 }}>
                  <label style={lbl}>Direct QA report link (opens on the QA tab)</label>
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <input
                      readOnly
                      value={reportUrl}
                      onFocus={(e) => e.target.select()}
                      style={{ ...inputStyle, flex: 1, fontSize: 12, fontFamily: 'var(--font-mono, monospace)' }}
                    />
                    <button style={{ ...primaryButton(false), padding: '0 16px' }} onClick={copyReport}>
                      {copiedReport ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginTop: 8 }}>
                    Same portal — this link just lands the client on the QA report. The main link shows both tabs.
                  </div>
                </div>
              )}

              {!project.wbsEnabled && (
                <div style={{ marginTop: 16, fontSize: 12, color: 'var(--tone-warning-fg)', background: tint('var(--c-amber)', 10), border: '1px solid color-mix(in srgb, var(--c-amber) 27%, transparent)', borderRadius: 8, padding: '8px 12px' }}>
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
const QA_COL_WIDTH = 122;
const fmtQaDate = (iso) => new Date(iso).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });

/* The story point's QA status; hover for how it got there. SQA can approve an item
   that's already Completed but has nothing on record. */
function WbsQaCell({ qa, role, profiles, onApprove }) {
  if (!qa) return <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>—</span>;
  const s = WBS_QA_STATUSES[qa.key];
  const who = qa.by && profiles.find((p) => p.id === qa.by)?.name;
  const title = [qa.detail, who && `By ${who}.`, qa.at && `On ${fmtQaDate(qa.at)}.`].filter(Boolean).join(' ');
  if (qa.key === 'no_record' && role === 'QA') {
    return (
      <button
        title={`${title} Approve it to record your sign-off.`}
        onClick={onApprove}
        style={{ ...ghostButton, width: '100%', padding: '4px 8px', minHeight: 0, fontSize: 12 }}
      >
        Approve
      </button>
    );
  }
  return <span title={title} aria-label={`QA status: ${s.label}. ${title}`}><Pill label={s.label} tone={s.tone} /></span>;
}

/* Tabs a manager can move work onto (support only while ongoing support is on,
   unless the work is already there). */
function moveTargets(current, ongoingSupport) {
  return WBS_TRACK_ORDER.filter((t) => t !== 'support' || ongoingSupport || current === 'support');
}

function WbsItemRow({ item, qa, role, canManage, canEdit, profiles, bugs = [], modules = [], ongoingSupport, onSave, onDelete, onReorder, onApproveQa }) {
  const [editing, setEditing] = useState(false);
  const [f, setF] = useState(item);
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const [note, setNote] = useState(item.devComments);
  const [noteOpen, setNoteOpen] = useState(false);
  const [hover, setHover] = useState(false);

  const statusOptions = wbsStatusChoices({ track: item.track, status: item.status, role, canManage });

  if (editing) {
    // task-level fields only — platform / target date / assignee are module-level
    return (
      <div style={{ padding: '12px 12px', borderTop: '1px solid var(--color-border-primary)', background: 'var(--color-background-secondary)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 8 }}>
          <input style={inputStyle} value={f.title} placeholder="Task title" onChange={(e) => set('title', e.target.value)} />
          <select aria-label="Priority" style={inputStyle} value={f.priority || ''} onChange={(e) => set('priority', e.target.value)}>
            <option value="">Priority…</option>
            {WBS_PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <textarea style={{ ...inputStyle, marginTop: 8, resize: 'vertical', fontSize: 12 }} rows={2} value={f.description} placeholder="Description (optional)" onChange={(e) => set('description', e.target.value)} />
        {/* move the story point to another module or another WBS tab */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
          <input style={inputStyle} list={`wbs-modules-${item.id}`} value={f.module || ''} placeholder="Module" aria-label="Module" onChange={(e) => set('module', e.target.value)} />
          <datalist id={`wbs-modules-${item.id}`}>{modules.map((m) => <option key={m} value={m} />)}</datalist>
          <select aria-label="WBS tab" title="Move to another WBS tab" style={inputStyle} value={f.track} onChange={(e) => set('track', e.target.value)}>
            {moveTargets(item.track, ongoingSupport).map((t) => <option key={t} value={t}>{wbsTrackLabel(t)}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
          <button style={ghostButton} onClick={() => { setF(item); setEditing(false); }}>Cancel</button>
          <button
            style={primaryButton(!f.title.trim())}
            disabled={!f.title.trim()}
            onClick={() => {
              const patch = { title: f.title.trim(), description: f.description, priority: f.priority || null };
              if ((f.module || '').trim() !== (item.module || '')) patch.module = (f.module || '').trim();
              if (f.track !== item.track) patch.track = f.track;
              onSave(item, patch);
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
      <div style={{ padding: '8px 12px', borderTop: '1px solid var(--color-border-primary)', background: 'var(--color-background-secondary)' }}>
        <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>{item.title} · developer note</div>
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
      style={{ position: 'relative', padding: '8px 12px', borderTop: '1px solid var(--color-border-primary)', background: hover ? 'var(--color-background-secondary)' : 'transparent', transition: 'background 0.12s' }}
    >
      {/* compact primary row (~34px) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: 13, fontWeight: 500, flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {item.title}
          {item.type === 'milestone' && <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--color-text-tertiary)' }}>◆</span>}
          {item.devComments && <span title={item.devComments} style={{ marginLeft: 8, fontSize: 12, color: 'var(--color-text-tertiary)' }}>✎</span>}
          {bugs.length > 0 && (
            <span title={`${bugs.length} open bug(s)`} style={{ marginLeft: 8, fontSize: 12, fontWeight: 700, color: 'var(--danger)', background: tint('var(--c-red)', 10), borderRadius: 999, padding: '1px 8px' }}>
              {bugs.length} bug{bugs.length === 1 ? '' : 's'}
            </span>
          )}
        </span>
        <span style={{ flex: '0 0 auto' }}><PriorityTag value={item.priority} /></span>
        <div style={{ flex: '0 0 auto', width: 124 }}>
          {statusOptions.length === 0 ? (
            <WbsBadge status={item.status} />
          ) : (
            <select
              aria-label={`Status of ${item.title}`}
              value={item.status}
              onChange={(e) => onSave(item, { status: e.target.value })}
              style={{ ...inputStyle, width: '100%', padding: '4px 8px', fontSize: 12 }}
            >
              {statusOptions.map((s) => <option key={s} value={s}>{WBS_STATUSES[s].label}</option>)}
            </select>
          )}
        </div>
        <div style={{ flex: '0 0 auto', width: QA_COL_WIDTH, whiteSpace: 'nowrap' }}>
          <WbsQaCell qa={qa} role={role} profiles={profiles} onApprove={() => onApproveQa([item.id])} />
        </div>
        {/* actions: float over the row's right edge on hover, so the QA column stays visible at rest */}
        <span style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', display: 'inline-flex', gap: 4, padding: '2px 4px', borderRadius: 8, background: 'var(--color-background-secondary)', opacity: actionsVisible ? 1 : 0, transition: 'opacity 0.12s', pointerEvents: actionsVisible ? 'auto' : 'none' }}>
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
        <div style={{ marginTop: 4, marginLeft: 2, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {bugs.map((b) => (
            <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: (SEVERITIES[b.severity] || {}).color || 'var(--danger)', flexShrink: 0 }} />
              <span style={{ color: 'var(--color-text-secondary)', flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.title}</span>
              <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>{(BUG_STATUSES[b.status] || {}).label || b.status}</span>
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
function PlatformHeader({ platform, track, items, target, canManage, open, onToggle, onSaveTarget, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [comp, setComp] = useState(target?.completionDate || '');
  const [dep, setDep] = useState(target?.deploymentDate || '');
  useEffect(() => {
    if (!editing) {
      setComp(target?.completionDate || '');
      setDep(target?.deploymentDate || '');
    }
  }, [target, editing]);

  const label = platform || (track === 'scope' ? 'Ungrouped' : wbsTrackLabel(track));
  const done = pctDone(items);
  const showDates = track === 'scope'; // milestone dates belong to the original scope
  const dateInput = { ...inputStyle, width: 'auto', padding: '4px 8px', fontSize: 12 };
  const meta = { fontSize: 12, color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div {...pressable(onToggle, `${open ? 'Collapse' : 'Expand'} ${label}`)} aria-expanded={open} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none', borderRadius: 8 }}>
          <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)', width: 12 }}>{open ? '▾' : '▸'}</span>
          <span style={{ fontSize: 16, fontWeight: 700 }}>{label}</span>
          <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{items.length} item{items.length === 1 ? '' : 's'} · {done}%</span>
        </div>
        <span style={{ flex: 1 }} />
        {editing ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <label style={{ ...meta, display: 'flex', alignItems: 'center', gap: 4 }}>Completion
              <input type="date" style={dateInput} value={comp} onChange={(e) => setComp(e.target.value)} />
            </label>
            <label style={{ ...meta, display: 'flex', alignItems: 'center', gap: 4 }}>Deployment
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            {showDates && <span style={meta}>Completion: <strong style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>{fmtDate(target?.completionDate)}</strong></span>}
            {showDates && <span style={meta}>Deployment: <strong style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>{fmtDate(target?.deploymentDate)}</strong></span>}
            {showDates && canManage && (
              <button onClick={() => setEditing(true)} style={{ background: 'none', border: 'none', color: 'var(--brand)', cursor: 'pointer', fontSize: 12, fontFamily: 'inherit', padding: 0 }}>
                Edit dates
              </button>
            )}
            {canManage && onDelete && (
              <button onClick={onDelete} title={`Delete the ${label} WBS`} style={{ background: 'none', border: 'none', color: 'var(--c-red)', cursor: 'pointer', fontSize: 12, fontFamily: 'inherit', padding: 0 }}>
                Delete {label}
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
function ModuleCard({ group, qaByItem, role, canManage, canEdit, canCompleteAll, profiles, bugsByItem, modules = [], ongoingSupport, collapsed, onToggle, onAddTask, onSaveItem, onDeleteItem, onReorderItem, onSaveMeta, onCompleteAll, onApproveQa }) {
  const { platform, module, items } = group;
  // SQA's button approves what's only waiting on sign-off, not everything
  const sqaSignsOff = role === 'QA';
  const allDone = sqaSignsOff
    ? !items.some((i) => qaByItem[i.id]?.canBulkApprove)
    : items.length > 0 && items.every((i) => i.status === 'completed');
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

  const track = items[0]?.track || 'scope';
  const [meta, setMeta] = useState({ module: moduleLabel === 'General' ? '' : module, platform, est: est || '', assignee: assigneeIds.length === 1 ? assigneeIds[0] : '', track });
  const openMeta = () => { setMeta({ module: module || '', platform: platform || '', est: est || '', assignee: assigneeIds.length === 1 ? assigneeIds[0] : '', track }); setMetaOpen(true); };

  const add = async () => {
    const t = text.trim();
    if (!t) return;
    await onAddTask(group, t);
    setText(''); // keep the adder focused so you can type the next one
  };

  const chip = { fontSize: 12, fontWeight: 600, color: 'var(--tone-info-fg)', background: 'var(--tone-info-bg)', border: '1px solid var(--brand-ring)', borderRadius: 6, padding: '1px 8px', whiteSpace: 'nowrap' };
  const metaItem = { fontSize: 12, color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' };

  return (
    <div style={{ ...card, padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', alignSelf: 'start' }}>
      {/* module header — shared metadata lives here */}
      <div style={{ background: 'var(--color-background-secondary)', borderBottom: collapsed ? 'none' : '1px solid var(--color-border-primary)' }}>
        <div {...pressable(() => onToggle(), `${collapsed ? 'Expand' : 'Collapse'} ${moduleLabel}`)} aria-expanded={!collapsed} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px 8px', cursor: 'pointer', userSelect: 'none' }}>
          <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)', width: 12 }}>{collapsed ? '▸' : '▾'}</span>
          <span style={{ fontSize: 14, fontWeight: 700, flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{moduleLabel}</span>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', background: 'var(--color-background-primary, #fff)', border: '1px solid var(--color-border-primary)', borderRadius: 999, padding: '1px 8px' }}>{items.length}</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: done === 100 ? 'var(--success)' : 'var(--brand)' }}>{done}%</span>
        </div>
        <div style={{ height: 4, margin: '0 16px 8px 34px', borderRadius: 999, background: 'var(--color-border-primary)', overflow: 'hidden' }}>
          <div style={{ width: `${done}%`, height: '100%', borderRadius: 999, background: done === 100 ? 'var(--success)' : 'var(--brand)' }} />
        </div>
        {metaOpen ? (
          <div style={{ padding: '4px 16px 12px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <input style={inputStyle} value={meta.module} placeholder="Module name" onChange={(e) => setMeta((m) => ({ ...m, module: e.target.value }))} />
            <input style={inputStyle} list="wbs-platforms" value={meta.platform} placeholder="Platform" onChange={(e) => setMeta((m) => ({ ...m, platform: e.target.value }))} />
            <input style={inputStyle} value={meta.est} placeholder="Target date" onChange={(e) => setMeta((m) => ({ ...m, est: e.target.value }))} />
            <select aria-label="Assignee" style={inputStyle} value={meta.assignee} onChange={(e) => setMeta((m) => ({ ...m, assignee: e.target.value }))}>
              <option value="">Unassigned</option>
              {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <label style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--color-text-secondary)' }}>
              WBS tab
              <select aria-label="WBS tab" style={{ ...inputStyle, flex: 1 }} value={meta.track} onChange={(e) => setMeta((m) => ({ ...m, track: e.target.value }))}>
                {moveTargets(track, ongoingSupport).map((t) => <option key={t} value={t}>{wbsTrackLabel(t)}</option>)}
              </select>
            </label>
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
                    ...(meta.track !== track ? { track: meta.track } : {}),
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
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '0 16px 12px 24px', flexWrap: 'wrap' }}>
              {(platform || items[0]?.track === 'scope') && <span style={chip}>{platformLabel}</span>}
              <span style={metaItem}>Target: <strong style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>{est || '—'}</strong></span>
              <span style={metaItem}>Lead: <strong style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>{assigneeLabel}</strong></span>
              {(canManage || canCompleteAll) && (
                <span style={{ display: 'inline-flex', gap: 16, marginLeft: 'auto' }}>
                  {canCompleteAll && !allDone && (
                    <button onClick={() => onCompleteAll(group)} style={{ background: 'none', border: 'none', color: 'var(--tone-success-fg)', cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'inherit', padding: 0 }}>
                      {sqaSignsOff ? '✓ Approve all' : '✓ Mark all complete'}
                    </button>
                  )}
                  {canManage && (
                    <button onClick={openMeta} style={{ background: 'none', border: 'none', color: 'var(--brand)', cursor: 'pointer', fontSize: 12, fontFamily: 'inherit', padding: 0 }}>
                      Edit module
                    </button>
                  )}
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
            <div style={{ display: 'flex', gap: 8, padding: '8px 12px', borderBottom: '1px solid var(--color-border-primary)' }}>
              <input
                style={{ ...inputStyle, flex: 1, fontSize: 13, padding: '8px 12px' }}
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
              <div style={{ padding: '16px', fontSize: 13, color: 'var(--color-text-tertiary)', textAlign: 'center' }}>No tasks yet.</div>
            ) : (
              <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px', fontSize: 11, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--color-text-tertiary)' }}>
                <span style={{ flex: 1 }}>Story point</span>
                <span style={{ width: 124 }}>Status</span>
                <span style={{ width: QA_COL_WIDTH }}>QA status</span>
              </div>
              {items.map((it) => (
                <WbsItemRow
                  key={it.id}
                  item={it}
                  qa={qaByItem[it.id]}
                  onApproveQa={onApproveQa}
                  role={role}
                  canManage={canManage}
                  canEdit={canEdit}
                  profiles={profiles}
                  bugs={bugsByItem[it.id] || []}
                  modules={modules}
                  ongoingSupport={ongoingSupport}
                  onSave={onSaveItem}
                  onDelete={onDeleteItem}
                  onReorder={(item, dir) => onReorderItem(item, dir, items)}
                />
              ))}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/* releases / bugs: given by Project Hub (that project's) or, in legacy mode, the
   loaded lists. When they're not given, the selected project's are loaded here. */
const NO_ROWS = [];
export function WbsPage({ user, projects, profiles = [], showToast, releases: releasesProp, bugs: bugsProp, onProjectsChanged }) {
  const [projectId, setProjectId] = useState(projects[0]?.id || '');
  const own = !releasesProp || !bugsProp;
  const relQ = useQuery({ queryKey: ['releases', 'project', projectId], queryFn: () => api.fetchProjectReleases(projectId), enabled: own && !!projectId });
  const bugQ = useQuery({ queryKey: ['bugs', 'project', projectId], queryFn: () => api.fetchProjectBugs(projectId), enabled: own && !!projectId });
  const releases = (own ? relQ.data : releasesProp) || NO_ROWS;
  const bugs = (own ? bugQ.data : bugsProp) || NO_ROWS;
  const [items, setItems] = useState([]);
  const [bugsByItem, setBugsByItem] = useState({});
  const [qaLinks, setQaLinks] = useState(null); // taskId → releases; null = couldn't load
  const [qaF, setQaF] = useState('all');
  const [platformTargets, setPlatformTargets] = useState({}); // platformType -> {completionDate, deploymentDate}
  const [loading, setLoading] = useState(false);
  const [statusF, setStatusF] = useState('all');
  const [track, setTrack] = useState('scope');
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
  const canManage = managesProject(user, project);
  const canEdit = user.role === 'Developer' || canManage;
  // Mark-all-complete follows the same sign-off rule as a single item's status
  const canCompleteAll = isSqaTrack(track) ? user.role === 'QA' : canManage;
  const supportOff = track === 'support' && !project?.ongoingSupport;
  const canAdd = canManage && !supportOff;

  // whole-project completion: every track + this project's live bugs
  const completion = useMemo(() => {
    const releaseById = {};
    releases.forEach((r) => { if (r.projectId === projectId) releaseById[r.id] = r; });
    const projectBugs = bugs.filter((b) => releaseById[b.releaseId]);
    return computeWorkCompletion(items, liveBugs(projectBugs, releaseById));
  }, [items, bugs, releases, projectId]);
  const trackItems = items.filter((i) => i.track === track);
  const qaByItem = useMemo(() => {
    const out = {};
    if (qaLinks) items.forEach((i) => { out[i.id] = wbsQaStatus(i, qaLinks[i.id], bugsByItem[i.id]); });
    return out;
  }, [items, qaLinks, bugsByItem]);

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
        setQaLinks(await api.fetchWbsQaLinks(projectId));
      } catch {
        setQaLinks(null);
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
  const OPTIMISTIC_KEYS = { status: 'status', title: 'title', description: 'description', priority: 'priority', dev_comments: 'devComments', module: 'module', track: 'track' };
  // Moving Completed work onto an SQA-tested tab would claim SQA's sign-off, so
  // (unless SQA moves it) it lands In QA for SQA to approve — same rule as import.
  const holdsForSqa = (item, toTrack) =>
    toTrack && toTrack !== item.track && isSqaTrack(toTrack) && item.status === 'completed' && user.role !== 'QA';
  // single-item field edits (status / note / title / priority) update local state
  // immediately and persist in the background — no refetch, no page flash
  const save = async (item, patch) => {
    if (holdsForSqa(item, patch.track)) patch = { ...patch, status: 'in_qa' };
    const local = {};
    for (const [k, v] of Object.entries(patch)) if (k in OPTIMISTIC_KEYS) local[OPTIMISTIC_KEYS[k]] = v;
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, ...local } : i)));
    try {
      await api.updateWbsItem(item.id, patch);
      if (patch.status || patch.track) refresh(); // the database may have stamped SQA's sign-off
      if (patch.track) showToast(`Moved to ${wbsTrackLabel(patch.track)}${patch.status === 'in_qa' ? ' · In QA until SQA approves it' : ''}`);
    } catch (e) {
      showToast(e.message, 'error');
      refresh(); // resync from server on failure
    }
  };
  const del = async (item) => {
    if (await confirmAction(`Delete "${item.title}"? Release history keeps its name.`)) run(() => api.deleteWbsItem(item.id), 'Item deleted');
  };
  // reorder: swap with the neighbour shown in the same module card (the flat
  // track order interleaves modules, so its neighbour is often in another card
  // and ▲/▼ appeared to do nothing)
  const reorder = (item, dir, siblings) => {
    const k = siblings.findIndex((x) => x.id === item.id);
    const other = siblings[k + dir];
    if (!other) return;
    const ids = items.filter((x) => x.track === item.track).sort((a, b) => a.position - b.position).map((x) => x.id);
    const a = ids.indexOf(item.id);
    const b = ids.indexOf(other.id);
    [ids[a], ids[b]] = [ids[b], ids[a]];
    run(() => api.reorderWbsItems(ids));
  };
  const addItem = () => {
    if (!form.title.trim()) return;
    run(
      () => api.createWbsItem(projectId, {
        title: form.title.trim(), platformType: form.platformType, module: form.module,
        estimatedCompletionDate: form.est, priority: form.priority || null, position: items.length, track,
      }),
      'Item added'
    );
    setForm({ title: '', platformType: form.platformType, module: form.module, est: '', priority: '' });
  };
  // every item of a module card's module, not just the rows a filter/search left
  // visible — module edits and "mark all" must not split a module in two
  const wholeModule = (group) =>
    items.filter((i) => i.track === track && (i.platformType || '') === group.platform && (i.module || '') === group.module);
  // add a task to an existing module — inherits the module's shared metadata
  const addTaskToGroup = (group, title) => {
    const all = wholeModule(group);
    const est = latestEst(all);
    const assigneeIds = [...new Set(all.map((i) => i.assignedTo).filter(Boolean))];
    return run(() => api.createWbsItem(projectId, {
      title,
      platformType: group.platform,
      module: group.module,
      estimatedCompletionDate: est || '',
      assignedTo: assigneeIds.length === 1 ? assigneeIds[0] : null,
      position: items.length,
      track,
    }));
  };
  // edit module-level metadata → apply to every item in the group at once
  const saveModuleMeta = (group, patch) =>
    run(async () => {
      const all = wholeModule(group);
      const held = all.filter((i) => holdsForSqa(i, patch.track)).map((i) => i.id);
      const rest = all.map((i) => i.id).filter((id) => !held.includes(id));
      await api.updateWbsItems(rest, patch);
      if (held.length) await api.updateWbsItems(held, { ...patch, status: 'in_qa', actual_completion_date: null });
    }, patch.track ? `Module moved to ${wbsTrackLabel(patch.track)}` : 'Module updated');
  // mark every task in a module completed — optimistic + background bulk update
  const completeModule = async (group) => {
    const isQa = user.role === 'QA';
    const all = wholeModule(group);
    const eligible = isQa ? all.filter((i) => qaByItem[i.id]?.canBulkApprove) : all;
    const open = eligible.filter((i) => i.status !== 'completed').map((i) => i.id);
    const unsigned = isQa ? eligible.filter((i) => i.status === 'completed').map((i) => i.id) : [];
    const n = open.length + unsigned.length;
    if (!n) return;
    const verb = isQa ? 'Approve' : 'Mark';
    const end = isQa ? ' that are waiting for sign-off' : ' as Completed';
    if (!await confirmAction(`${verb} ${n} task${n === 1 ? '' : 's'} in "${group.module || 'General'}"${end}?`)) return;
    const idSet = new Set(open);
    setItems((prev) => prev.map((i) => (idSet.has(i.id) ? { ...i, status: 'completed' } : i)));
    try {
      await api.setWbsItemStatus(open, 'completed');
      await api.approveWbsItemsQa(unsigned);
      refresh();
    } catch (e) {
      showToast(e.message, 'error');
      refresh();
    }
  };
  const approveQa = (ids) => run(() => api.approveWbsItemsQa(ids), 'QA approval recorded');
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
  const deleteWholeWbs = async () => {
    if (await confirmAction('Delete the ENTIRE WBS for this project, across every tab (scope, improvements, upsell, design, marketing and support)? Release history is preserved. This cannot be undone.'))
      run(() => api.deleteWbs(projectId), 'WBS deleted');
  };
  // delete just ONE platform group (e.g. only "Admin Panel"), not the whole WBS
  const deletePlatform = async (platform, count) => {
    const label = platform || (track === 'scope' ? 'Ungrouped' : wbsTrackLabel(track));
    if (await confirmAction(`Delete the entire "${label}" WBS (${count} item${count === 1 ? '' : 's'})? Release history is preserved. This cannot be undone.`))
      run(() => api.deleteWbsPlatform(projectId, platform, track), `${label} WBS deleted`);
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
  // Rows land on the open tab. A sheet can't claim SQA's sign-off: items it marks
  // Completed on an SQA-tracked tab arrive In QA, ready for SQA to approve.
  const importRows = async (rows, verb) => {
    const holdForSqa = isSqaTrack(track) && user.role !== 'QA';
    let held = 0;
    const prepared = rows.map((r) => {
      if (holdForSqa && normalizeWbsStatus(r.status) === 'completed') {
        held += 1;
        return { ...r, track, status: 'in_qa' };
      }
      return { ...r, track };
    });
    const res = await api.importWbs(projectId, prepared);
    showToast(`${verb} ${res.added} item${res.added === 1 ? '' : 's'}${held ? ` · ${held} marked Completed are In QA until SQA approves them` : ''}`);
  };
  const confirmImport = async (mapped) => {
    setImportData(null);
    await run(() => importRows(mapped, 'Imported'));
  };
  // bulk add reuses the additive importer (fresh import_keys → all inserted, appended)
  const confirmBulk = async (parsed) => {
    setBulkOpen(false);
    await run(() => importRows(parsed, 'Added'));
  };
  const setOngoingSupport = (on) =>
    run(async () => {
      await api.updateProject(projectId, { ongoing_support: on });
      onProjectsChanged?.();
    }, on ? 'Ongoing support turned on' : 'Ongoing support turned off');

  // filter + group into a flat list of module cards (one per platform+module),
  // preserving the REAL platform/module values so new tasks inherit them.
  const filtered = trackItems.filter(
    (i) => (statusF === 'all' || i.status === statusF) && (qaF === 'all' || qaByItem[i.id]?.key === qaF) && (!q.trim() || i.title.toLowerCase().includes(q.trim().toLowerCase()))
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

  const byStatus = (s) => trackItems.filter((i) => i.status === s).length;
  const trackModules = [...new Set(trackItems.map((i) => i.module).filter(Boolean))];
  const trackPlatforms = [...new Set(items.map((i) => i.platformType).filter(Boolean))];
  const fSel = filterSelect;

  // collapse-all operates on the platform sections
  const allGroupKeys = platformOrder.map((p) => `plat:${p}`);
  const allCollapsed = allGroupKeys.length > 0 && allGroupKeys.every((k) => collapsed.has(k));

  return (
    <>
      <datalist id="wbs-platforms">{[...new Set([...trackPlatforms, ...WBS_PLATFORM_TYPES])].map((p) => <option key={p} value={p} />)}</datalist>
      <PageHeader title="WBS Builder" subtitle="Flexible work breakdown — group by platform & module, one status per item" />
      {own && (relQ.isError || bugQ.isError) && (
        <div role="alert" style={{ ...card, padding: '12px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', borderColor: 'var(--danger)', color: 'var(--danger)', fontSize: 13 }}>
          <span style={{ flex: 1, minWidth: 200 }}>Couldn’t load this project’s {relQ.isError ? 'builds' : 'bugs'}, so completion below leaves bugs out.</span>
          <button style={ghostButton} onClick={() => { relQ.refetch(); bugQ.refetch(); }}>Retry</button>
        </div>
      )}

      <div className="filter-bar">
        <select style={fSel} aria-label="Project" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.name} {p.wbsEnabled ? '• WBS' : ''}</option>
          ))}
        </select>
        <select style={fSel} aria-label="Status" value={statusF} onChange={(e) => setStatusF(e.target.value)}>
          <option value="all">All statuses</option>
          {WBS_STATUS_ORDER.map((s) => <option key={s} value={s}>{WBS_STATUSES[s].label}</option>)}
        </select>
        {qaLinks && (
          <select style={fSel} value={qaF} aria-label="QA status" onChange={(e) => setQaF(e.target.value)}>
            <option value="all">All QA statuses</option>
            {WBS_QA_STATUS_ORDER.map((s) => <option key={s} value={s}>{WBS_QA_STATUSES[s].label}</option>)}
          </select>
        )}
        <input type="search" className="filter-search" style={filterInput} value={q} aria-label="Search WBS items" placeholder="Search items…" onChange={(e) => setQ(e.target.value)} />
        {allGroupKeys.length > 1 && (
          <button style={ghostButton} onClick={() => setCollapsed(allCollapsed ? new Set() : new Set(allGroupKeys))}>
            {allCollapsed ? 'Expand all' : 'Collapse all'}
          </button>
        )}
        {canManage && (
          <div className="filter-actions">
            {canAdd && (
              <>
                {/* one primary action (add a module); the bulk tools, sharing and
                    the destructive delete sit in the ⋯ menu */}
                <button style={adding ? ghostButton : primaryButton(false)} onClick={() => setAdding((v) => !v)}>{adding ? 'Close' : '+ New module'}</button>
                <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }} onChange={onFile} />
              </>
            )}
            <ActionMenu
              label="More WBS actions"
              size={36}
              items={[
                canAdd && { label: 'Bulk add tasks', onSelect: () => setBulkOpen(true), hint: 'Paste many tasks at once' },
                canAdd && { label: 'Import a spreadsheet', onSelect: () => fileRef.current?.click(), hint: '.xlsx, .xls or .csv' },
                project && { label: 'Share with client', onSelect: () => setShareOpen(true), hint: 'A read-only public link' },
                items.length > 0 && { label: 'Delete WBS', onSelect: deleteWholeWbs, danger: true },
              ]}
            />
          </div>
        )}
      </div>

      {completion.total > 0 && (
        <div style={{ ...card, padding: 16, marginBottom: 16 }}>
          {project?.ongoingSupport && (
            <div style={{ marginBottom: 12 }}><Pill label="Ongoing support" tone="info" /></div>
          )}
          <ProjectProgress interfaces={completion.byInterface} bugs={completion.bugs} overall={completion} />
          <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 12 }}>
            {completion.open > 0
              ? `${completion.open} still open of ${completion.total}, across every tab below and reported bugs.`
              : project?.ongoingSupport
                ? 'All current work is complete. Ongoing support stays active for new client requests.'
                : `All ${completion.total} items and bugs are complete.`}
          </div>
          <TrackBreakdown byTrack={completion.byTrack} bugs={completion.bugs} />
        </div>
      )}

      <SubTabs
        tabs={WBS_TRACK_ORDER.map((t) => {
          const n = items.filter((i) => i.track === t && i.type !== 'milestone').length;
          return [t, n ? `${wbsTrackLabel(t)} (${n})` : wbsTrackLabel(t)];
        })}
        active={track}
        onChange={(t) => { setTrack(t); setAdding(false); setStatusF('all'); setQaF('all'); }}
      />
      {(WBS_TRACKS[track].hint || track === 'support') && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
          <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
            {WBS_TRACKS[track].hint}
            {isSqaTrack(track) && track !== 'scope' ? ' Completed only after SQA approval.' : ''}
          </span>
          {track === 'support' && canManage && project?.ongoingSupport && (
            <button style={ghostButton} onClick={() => setOngoingSupport(false)}>Turn off ongoing support</button>
          )}
        </div>
      )}

      {adding && canAdd && (
        <div style={{ ...card, padding: 12, marginBottom: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8, alignItems: 'end' }}>
          <input style={inputStyle} value={form.module} placeholder="Module name *" onChange={(e) => setForm((f) => ({ ...f, module: e.target.value }))} />
          <input style={inputStyle} list="wbs-platforms" value={form.platformType} placeholder="Platform" onChange={(e) => setForm((f) => ({ ...f, platformType: e.target.value }))} />
          <input style={inputStyle} value={form.est} placeholder="Target date" onChange={(e) => setForm((f) => ({ ...f, est: e.target.value }))} />
          <input style={inputStyle} value={form.title} placeholder="First task title *" onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} onKeyDown={(e) => e.key === 'Enter' && addItem()} />
          <button style={primaryButton(!form.title.trim() || !form.module.trim())} disabled={!form.title.trim() || !form.module.trim()} onClick={addItem}>Create module</button>
          <div style={{ gridColumn: '1 / -1', fontSize: 12, color: 'var(--color-text-tertiary)' }}>
            Adding to <strong style={{ color: 'var(--color-text-secondary)' }}>{wbsTrackLabel(track)}</strong>.
            {isSqaTrack(track) && !form.platformType.trim() && ' Set a platform so developers can link this work when they submit that platform’s build' + (track === 'scope' ? '.' : ' (without one it is offered on every build).')}
          </div>
        </div>
      )}

      {trackItems.length > 0 && (
        <>
          <div className="stat-row" style={{ marginBottom: 16 }}>
            <StatSmall label="Total Items" value={trackItems.length} />
            <StatSmall label="Not Started" value={byStatus('not_started')} />
            <StatSmall label="In Progress" value={byStatus('in_progress')} color={byStatus('in_progress') ? 'var(--brand)' : undefined} />
            <StatSmall label="In QA" value={byStatus('in_qa')} color={byStatus('in_qa') ? 'var(--warning)' : undefined} />
            <StatSmall label="Completed" value={byStatus('completed')} color="var(--success)" />
            {byStatus('blocked') > 0 && <StatSmall label="Blocked" value={byStatus('blocked')} color="var(--danger)" />}
          </div>
        </>
      )}

      {loading ? (
        <SkeletonList rows={2} height={40} />
      ) : supportOff && trackItems.length === 0 ? (
        <Empty>
          <div>Ongoing support is off for this project.</div>
          {canManage && (
            <button style={{ ...primaryButton(false), marginTop: 12 }} onClick={() => setOngoingSupport(true)}>Turn on ongoing support</button>
          )}
        </Empty>
      ) : trackItems.length === 0 ? (
        <Empty>
          <div>{canAdd ? `Nothing under ${wbsTrackLabel(track)} yet — add a module, or use Bulk add or Import in the ⋯ menu.` : `Nothing under ${wbsTrackLabel(track)} yet.`}</div>
          {canAdd && !adding && (
            <button style={{ ...primaryButton(false), marginTop: 12 }} onClick={() => setAdding(true)}>+ New module</button>
          )}
        </Empty>
      ) : filtered.length === 0 ? (
        <Empty>No items match the filter.</Empty>
      ) : (
        // platform sections: each header carries the platform's milestone dates;
        // its module cards masonry below (short cards pack tight, no dead space)
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {platformOrder.map((platform) => {
            const mods = platformMap.get(platform);
            const platItems = mods.flatMap((m) => m.items);
            const pKey = `plat:${platform}`;
            const pOpen = !isCol(pKey);
            return (
              <div key={platform}>
                <PlatformHeader
                  platform={platform}
                  track={track}
                  items={platItems}
                  target={platformTargets[platform]}
                  canManage={canManage}
                  open={pOpen}
                  onToggle={() => toggleCol(pKey)}
                  onSaveTarget={saveTarget}
                  onDelete={() => deletePlatform(platform, platItems.length)}
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
                          role={user.role}
                          canManage={canManage}
                          canEdit={canEdit}
                          canCompleteAll={canCompleteAll}
                          profiles={profiles}
                          bugsByItem={bugsByItem}
                          modules={trackModules}
                          ongoingSupport={!!project?.ongoingSupport}
                          collapsed={isCol(g.key)}
                          onToggle={() => toggleCol(g.key)}
                          onAddTask={addTaskToGroup}
                          onSaveItem={save}
                          onDeleteItem={del}
                          onReorderItem={reorder}
                          onSaveMeta={saveModuleMeta}
                          onCompleteAll={completeModule}
                          qaByItem={qaByItem}
                          onApproveQa={approveQa}
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
          trackLabel={wbsTrackLabel(track)}
          onCancel={() => setImportData(null)}
          onConfirm={confirmImport}
        />
      )}

      {bulkOpen && <WbsBulkModal trackLabel={wbsTrackLabel(track)} onCancel={() => setBulkOpen(false)} onConfirm={confirmBulk} />}

      {shareOpen && project && <WbsShareModal project={project} onClose={() => setShareOpen(false)} showToast={showToast} />}
    </>
  );
}

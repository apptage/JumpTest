/* Dashboard design kit — the house UI pattern (see DESIGN_GUIDE.md).
   Reuse these on every page: SubTabs, StatBig/StatSmall, PassRing, Pill,
   AlertCard, Chevron, DataTable. Add new shared primitives HERE, not inline. */
import { useState } from 'react';
import { card, inputStyle } from '@/ui.jsx';

/* ---- soft-pill tones ---- */
export const TONES = {
  danger: { bg: '#FEE2E2', fg: '#991B1B' },
  warning: { bg: '#FEF3C7', fg: '#92400E' },
  success: { bg: '#DCFCE7', fg: '#166534' },
  info: { bg: '#DBEAFE', fg: '#1E40AF' },
  neutral: { bg: '#F1F5F9', fg: '#475569' },
};
export const passTone = (r) => (r >= 75 ? 'success' : r >= 55 ? 'warning' : 'danger');
export const passColor = (r) => (r >= 75 ? 'var(--success)' : r >= 55 ? 'var(--warning)' : 'var(--danger)');

export function Pill({ label, tone = 'neutral' }) {
  const t = TONES[tone] || TONES.neutral;
  return (
    <span style={{ fontSize: 11.5, fontWeight: 600, padding: '2px 10px', borderRadius: 999, background: t.bg, color: t.fg, whiteSpace: 'nowrap' }}>
      {label}
    </span>
  );
}

/* ---- alert icons + card ---- */
const alertMap = {
  over: { c: 'var(--danger)', path: <><circle cx="12" cy="12" r="9" /><path d="m15 9-6 6M9 9l6 6" /></> },
  warn: { c: 'var(--warning)', path: <><path d="M10.3 3.7 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.7a2 2 0 0 0-3.4 0Z" /><path d="M12 9v4M12 17h.01" /></> },
  ok: { c: 'var(--success)', path: <><circle cx="12" cy="12" r="9" /><path d="m8.5 12 2.4 2.4 4.6-5" /></> },
};
export function AlertIcon({ level = 'warn', size = 16 }) {
  const m = alertMap[level] || alertMap.warn;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={m.c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {m.path}
    </svg>
  );
}
export function AlertCard({ level = 'warn', children }) {
  const c = (alertMap[level] || alertMap.warn).c;
  return (
    <div className="mgr-card" style={{ ...card, padding: 12, display: 'flex', gap: 10, alignItems: 'flex-start', borderLeft: `3px solid ${c}` }}>
      <span style={{ marginTop: 1 }}><AlertIcon level={level} /></span>
      <span style={{ fontSize: 12.5, color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>{children}</span>
    </div>
  );
}

/* ---- KPI cards ---- */
export function StatBig({ label, value, sub, accent = 'var(--brand)' }) {
  return (
    <div className="mgr-card" style={{ ...card, padding: 16, flex: '1 1 180px', minWidth: 170, position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: -14, right: -14, width: 56, height: 56, borderRadius: '50%', background: accent, opacity: 0.08 }} />
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 30, fontWeight: 700, color: accent }}>{value}</div>
      <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--color-text-secondary)', marginTop: 4 }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}
export function StatSmall({ label, value, color, sub }) {
  return (
    <div style={{ ...card, padding: '11px 14px', flex: '1 1 110px', minWidth: 104 }}>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700, color: color || 'var(--color-text-primary)' }}>{value}</div>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary)', marginTop: 2 }}>{label}</div>
      {sub && <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>{sub}</div>}
    </div>
  );
}
export function PassRing({ pct, label = 'Pass rate', sub }) {
  const r = 30;
  const c = 2 * Math.PI * r;
  const col = passColor(pct);
  return (
    <div className="mgr-card" style={{ ...card, padding: 16, flex: '1 1 180px', minWidth: 170, display: 'flex', alignItems: 'center', gap: 14 }}>
      <svg width="78" height="78" viewBox="0 0 78 78">
        <circle cx="39" cy="39" r={r} fill="none" stroke="var(--color-background-secondary)" strokeWidth="8" />
        <circle cx="39" cy="39" r={r} fill="none" stroke={col} strokeWidth="8" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)} transform="rotate(-90 39 39)" />
        <text x="39" y="44" textAnchor="middle" fontSize="19" fontWeight="700" fill={col} fontFamily="var(--font-display)">{pct}%</text>
      </svg>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600 }}>{label}</div>
        {sub && <div style={{ fontSize: 11.5, color: 'var(--color-text-tertiary)', marginTop: 2 }}>{sub}</div>}
      </div>
    </div>
  );
}

/* ---- page sub-tabs ---- */
export function SubTabs({ tabs, active, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--color-border-primary)', marginBottom: 18, flexWrap: 'wrap' }}>
      {tabs.map(([k, label]) => (
        <button
          key={k}
          onClick={() => onChange(k)}
          style={{
            padding: '9px 14px', fontSize: 13, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer',
            background: 'none', border: 'none', borderBottom: `2px solid ${active === k ? 'var(--brand)' : 'transparent'}`,
            color: active === k ? 'var(--brand)' : 'var(--color-text-secondary)', marginBottom: -1,
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/* ---- segmented control (filters/toggles) ---- */
export function Segmented({ options, value, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {options.map(([k, label]) => (
        <button
          key={k}
          onClick={() => onChange(k)}
          style={{
            padding: '5px 11px', fontSize: 12, fontWeight: 600, borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit',
            color: value === k ? '#fff' : 'var(--color-text-primary)',
            background: value === k ? 'var(--brand)' : 'var(--color-background-primary)',
            border: `1px solid ${value === k ? 'var(--brand)' : 'var(--color-border-tertiary)'}`,
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/* ---- chevron pipeline bar ---- */
export function Chevron({ stages }) {
  return (
    <div style={{ display: 'flex', alignItems: 'stretch', flexWrap: 'wrap' }}>
      {stages.map((s, i) => {
        const t = TONES[s.tone] || TONES.neutral;
        const last = i === stages.length - 1;
        return (
          <div
            key={s.label}
            style={{
              flex: '1 1 130px', minWidth: 120, background: t.bg, color: t.fg, padding: '12px 14px 12px 22px', marginLeft: i === 0 ? 0 : -12,
              clipPath: i === 0
                ? 'polygon(0 0, calc(100% - 12px) 0, 100% 50%, calc(100% - 12px) 100%, 0 100%)'
                : last
                  ? 'polygon(0 0, 100% 0, 100% 100%, 0 100%, 12px 50%)'
                  : 'polygon(0 0, calc(100% - 12px) 0, 100% 50%, calc(100% - 12px) 100%, 0 100%, 12px 50%)',
            }}
          >
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700 }}>{s.count}</div>
            <div style={{ fontSize: 11, fontWeight: 600, opacity: 0.85 }}>{s.label}</div>
          </div>
        );
      })}
    </div>
  );
}

/* ---- searchable + paginated table ---- */
export function DataTable({ columns, rows, rowKey, searchText, searchPlaceholder = 'Search…', onRowClick, toolbar, pageSize = 10 }) {
  const [q, setQ] = useState('');
  const [page, setPage] = useState(0);
  const term = q.trim().toLowerCase();
  const filtered = term && searchText ? rows.filter((r) => (searchText(r) || '').toLowerCase().includes(term)) : rows;
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const p = Math.min(page, pages - 1);
  const shown = filtered.slice(p * pageSize, p * pageSize + pageSize);
  const th = { textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary)', padding: '9px 12px', borderBottom: '1px solid var(--color-border-primary)', position: 'sticky', top: 0, background: 'var(--color-background-primary)' };
  return (
    <div style={{ ...card, padding: 0 }}>
      {(searchText || toolbar) && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', padding: 12, borderBottom: '1px solid var(--color-border-primary)' }}>
          {toolbar}
          <span style={{ flex: 1 }} />
          {searchText && (
            <input style={{ ...inputStyle, width: 'auto', flex: '0 1 220px', padding: '7px 10px', fontSize: 12 }} value={q} placeholder={searchPlaceholder} onChange={(e) => { setQ(e.target.value); setPage(0); }} />
          )}
        </div>
      )}
      <div style={{ overflowX: 'auto', maxHeight: 460, overflowY: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>{columns.map((c) => <th key={c.label} style={{ ...th, ...(c.thStyle || {}) }}>{c.label}</th>)}</tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={rowKey(r)} className={onRowClick ? 'mgr-row' : undefined} onClick={onRowClick ? () => onRowClick(r) : undefined} style={{ cursor: onRowClick ? 'pointer' : 'default' }}>
                {columns.map((c) => (
                  <td key={c.label} style={{ fontSize: 12.5, padding: '10px 12px', borderBottom: '1px solid var(--color-border-primary)', ...(c.tdStyle || {}) }}>{c.render(r)}</td>
                ))}
              </tr>
            ))}
            {shown.length === 0 && (
              <tr><td colSpan={columns.length} style={{ padding: 16, fontSize: 12.5, color: 'var(--color-text-tertiary)', textAlign: 'center' }}>Nothing to show.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', fontSize: 12, color: 'var(--color-text-secondary)' }}>
          <span>{filtered.length} rows · page {p + 1}/{pages}</span>
          <span style={{ display: 'flex', gap: 6 }}>
            <PgBtn disabled={p === 0} onClick={() => setPage(p - 1)}>Prev</PgBtn>
            <PgBtn disabled={p >= pages - 1} onClick={() => setPage(p + 1)}>Next</PgBtn>
          </span>
        </div>
      )}
    </div>
  );
}
function PgBtn({ disabled, onClick, children }) {
  return (
    <button disabled={disabled} onClick={onClick} style={{ padding: '5px 12px', fontSize: 12, fontFamily: 'inherit', borderRadius: 8, cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.4 : 1, background: 'var(--color-background-primary)', border: '1px solid var(--color-border-tertiary)', color: 'var(--color-text-primary)' }}>
      {children}
    </button>
  );
}

/* ---- donut chart with a hollow total in the middle + legend ---- */
export function Donut({ segments, centerValue, centerLabel, size = 132 }) {
  const data = (segments || []).filter((s) => s.value > 0);
  const total = data.reduce((s, x) => s + x.value, 0);
  const r = size / 2 - 11;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0 }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-background-secondary)" strokeWidth="12" />
        {total > 0 &&
          data.map((s) => {
            const frac = s.value / total;
            const dash = `${frac * c} ${c}`;
            const el = (
              <circle
                key={s.label}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={s.color}
                strokeWidth="12"
                strokeDasharray={dash}
                strokeDashoffset={-offset * c}
                transform={`rotate(-90 ${size / 2} ${size / 2})`}
              >
                <title>{`${s.label}: ${s.value} (${Math.round(frac * 100)}%)`}</title>
              </circle>
            );
            offset += frac;
            return el;
          })}
        <text x="50%" y="47%" textAnchor="middle" fontSize="26" fontWeight="700" fill="var(--color-text-primary)" fontFamily="var(--font-display)">
          {centerValue != null ? centerValue : total}
        </text>
        {centerLabel && (
          <text x="50%" y="62%" textAnchor="middle" fontSize="10" fontWeight="600" fill="var(--color-text-tertiary)" fontFamily="var(--font-display)">
            {centerLabel}
          </text>
        )}
      </svg>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7, minWidth: 120 }}>
        {(segments || []).map((s) => (
          <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
            <span style={{ width: 9, height: 9, borderRadius: 3, background: s.color, flexShrink: 0 }} />
            <span style={{ flex: 1, color: 'var(--color-text-secondary)' }}>{s.label}</span>
            <span className="tnum" style={{ fontWeight: 700 }}>{s.value}</span>
            <span className="tnum" style={{ color: 'var(--color-text-tertiary)', fontSize: 11, minWidth: 32, textAlign: 'right' }}>
              {total ? Math.round((s.value / total) * 100) : 0}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---- single stacked progress pill (state allocation at a glance) + legend ---- */
export function StackedBar({ segments, height = 12 }) {
  const data = (segments || []).filter((s) => s.value > 0);
  const total = data.reduce((s, x) => s + x.value, 0);
  return (
    <div>
      <div style={{ display: 'flex', height, borderRadius: 999, overflow: 'hidden', background: 'var(--color-background-secondary)' }}>
        {total > 0 &&
          data.map((s) => (
            <div key={s.label} style={{ width: `${(s.value / total) * 100}%`, background: s.color }} title={`${s.label}: ${s.value} (${Math.round((s.value / total) * 100)}%)`} />
          ))}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px 14px', marginTop: 10 }}>
        {(segments || []).map((s) => (
          <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: s.color, flexShrink: 0 }} />
            <span style={{ color: 'var(--color-text-secondary)' }}>{s.label}</span>
            <span className="tnum" style={{ fontWeight: 700 }}>{s.value}</span>
            <span className="tnum" style={{ color: 'var(--color-text-tertiary)' }}>({total ? Math.round((s.value / total) * 100) : 0}%)</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---- horizontal segmented timeline: one continuous track split by phase weight ---- */
export function SegmentedTimeline({ segments, unit = 'd' }) {
  const data = (segments || []).filter((s) => s.value != null && s.value >= 0);
  const total = data.reduce((s, x) => s + (x.value || 0), 0);
  return (
    <div>
      <div style={{ display: 'flex', height: 26, borderRadius: 8, overflow: 'hidden', background: 'var(--color-background-secondary)', border: '1px solid var(--color-border-tertiary)' }}>
        {total > 0 ? (
          data.map((s) => {
            const pct = (s.value / total) * 100;
            return (
              <div
                key={s.label}
                title={`${s.label}: ${s.value.toFixed(1)}${unit} (${Math.round(pct)}% of cycle)`}
                style={{
                  width: `${pct}%`, background: s.color, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 700, color: s.fg || '#fff', minWidth: pct > 8 ? 0 : 0, overflow: 'hidden', whiteSpace: 'nowrap',
                }}
              >
                {pct >= 14 ? `${s.value.toFixed(1)}${unit}` : ''}
              </div>
            );
          })
        ) : (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: 'var(--color-text-tertiary)' }}>
            No timing data yet
          </div>
        )}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px 16px', marginTop: 10 }}>
        {data.map((s) => (
          <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5 }}>
            <span style={{ width: 9, height: 9, borderRadius: 2, background: s.color, flexShrink: 0 }} />
            <span style={{ color: 'var(--color-text-secondary)' }}>{s.label}</span>
            <span className="tnum" style={{ fontWeight: 700 }}>{s.value.toFixed(1)}{unit}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

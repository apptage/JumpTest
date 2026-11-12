/* Dashboard design kit — the house UI pattern (see DESIGN_GUIDE.md).
   Reuse these on every page: SubTabs, StatBig/StatSmall, PassRing, Pill,
   AlertCard, Chevron, DataTable. Add new shared primitives HERE, not inline. */
import { useState } from 'react';
import { card, inputStyle } from '@/ui.jsx';
import { onTabListKeyDown } from '@shared/ui-kit.jsx';

/* ---- soft-pill tones (design-system tokens) ---- */
export const TONES = {
  danger: { bg: 'var(--tone-danger-bg)', fg: 'var(--tone-danger-fg)' },
  warning: { bg: 'var(--tone-warning-bg)', fg: 'var(--tone-warning-fg)' },
  success: { bg: 'var(--tone-success-bg)', fg: 'var(--tone-success-fg)' },
  info: { bg: 'var(--tone-info-bg)', fg: 'var(--tone-info-fg)' },
  neutral: { bg: 'var(--tone-neutral-bg)', fg: 'var(--tone-neutral-fg)' },
};
export const passTone = (r) => (r >= 75 ? 'success' : r >= 55 ? 'warning' : 'danger');
export const passColor = (r) => (r >= 75 ? 'var(--success)' : r >= 55 ? 'var(--warning)' : 'var(--danger)');

export function Pill({ label, tone = 'neutral' }) {
  const t = TONES[tone] || TONES.neutral;
  return (
    <span style={{ fontSize: 12, fontWeight: 600, padding: '2px 12px', borderRadius: 999, background: t.bg, color: t.fg, whiteSpace: 'nowrap' }}>
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
    <div className="mgr-card" style={{ ...card, padding: 12, display: 'flex', gap: 12, alignItems: 'flex-start', borderLeft: `3px solid ${c}` }}>
      <span style={{ marginTop: 1 }}><AlertIcon level={level} /></span>
      <span style={{ fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>{children}</span>
    </div>
  );
}

/* ---- KPI cards ----
   KpiTile is THE primary KPI tile; every big number on every page uses it
   (StatBig, StatCard and the home dashboard's Kpi all draw through it):
     label (13 semibold) · value (28, neutral text) · caption (12)
   `tone` colours the 3px top edge and, for danger/warning, the caption. The
   number itself stays neutral; colour never carries the meaning alone.
   Optional: delta (trend pill), onClick (the tile becomes a button), loading. */
const TILE_EDGE = { danger: 'var(--danger)', warning: 'var(--warning)', success: 'var(--success)', info: 'var(--c-indigo)', neutral: 'var(--color-text-tertiary)' };
const TILE_CAPTION = { danger: 'var(--tone-danger-fg)', warning: 'var(--tone-warning-fg)' };
export function KpiTile({ label, value, caption, tone = 'neutral', delta, deltaDir = 'up', onClick, loading = false, title, style }) {
  const Tag = onClick ? 'button' : 'div';
  const up = deltaDir === 'up';
  return (
    <Tag
      onClick={onClick}
      title={title}
      className={onClick ? 'mgr-card clickable' : 'mgr-card'}
      style={{
        ...card, padding: 16, textAlign: 'left', fontFamily: 'inherit', cursor: onClick ? 'pointer' : 'default',
        // no status colour until the number is known
        borderTop: `3px solid ${loading ? TILE_EDGE.neutral : TILE_EDGE[tone] || TILE_EDGE.neutral}`, display: 'flex', flexDirection: 'column', gap: 8,
        // one fixed height for every KPI tile, whatever its caption says
        height: 'var(--kpi-h)', overflow: 'hidden',
        minWidth: 0, color: 'inherit', ...style,
      }}
    >
      <span className="clamp-1" title={typeof label === 'string' ? label : undefined} style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-secondary)', flexShrink: 0 }}>{label}</span>
      {loading ? (
        <Skeleton width="45%" height={32} />
      ) : (
        <span className="tnum" style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 700, letterSpacing: 'var(--tracking-tight)', color: 'var(--color-text-primary)', lineHeight: 1.1 }}>
          {value}
        </span>
      )}
      {delta != null && !loading && (
        <span style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 8px', borderRadius: 999, background: up ? 'var(--tone-success-bg)' : 'var(--tone-danger-bg)', color: up ? 'var(--tone-success-fg)' : 'var(--tone-danger-fg)', fontSize: 12, fontWeight: 600 }}>
          <TrendArrow dir={up ? 'up' : 'down'} />{delta}
        </span>
      )}
      {loading ? (
        <Skeleton width="70%" height={12} />
      ) : caption && (
        <span className={delta != null ? 'clamp-1' : 'clamp-2'} title={typeof caption === 'string' ? caption : undefined} style={{ fontSize: 12, color: TILE_CAPTION[tone] || 'var(--color-text-tertiary)', fontWeight: TILE_CAPTION[tone] ? 500 : 400, lineHeight: 1.4 }}>{caption}</span>
      )}
    </Tag>
  );
}
/* accent colour → tone, for older callers that pass a colour */
const ACCENT_TONE = { 'var(--danger)': 'danger', 'var(--warning)': 'warning', 'var(--success)': 'success' };
export function StatBig({ label, value, sub, accent, tone }) {
  return <KpiTile label={label} value={value} caption={sub} tone={tone || ACCENT_TONE[accent] || 'neutral'} />;
}

/* Loading placeholder the same size as the thing it stands in for, so nothing
   jumps when the data arrives. */
export function Skeleton({ width = '100%', height = 14, radius = 6, style }) {
  return <span className="skeleton" aria-hidden="true" style={{ display: 'block', width, height, borderRadius: radius, ...style }} />;
}
/* rows of placeholder lines (a list loading); `card` wraps each row in a card */
export function SkeletonList({ rows = 3, height = 56, card: asCards = false, label = 'Loading' }) {
  return (
    <div role="status" aria-label={label} style={{ display: 'flex', flexDirection: 'column', gap: asCards ? 12 : 8 }}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} style={asCards ? { ...card, padding: 16, display: 'flex', flexDirection: 'column', gap: 8 } : { display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Skeleton width={`${60 - (i % 3) * 12}%`} height={14} />
          <Skeleton width={`${85 - (i % 2) * 20}%`} height={Math.max(10, height - 40)} />
        </div>
      ))}
    </div>
  );
}
/* a grid of placeholder cards the size of the real ones (e.g. project cards) */
export function SkeletonCards({ count = 6, height = 320, min = 300 }) {
  return (
    <div role="status" aria-label="Loading" style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${min}px, 1fr))`, gap: 16 }}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} style={{ ...card, height, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Skeleton width="55%" height={18} />
          <Skeleton width="35%" height={12} />
          <div style={{ display: 'flex', gap: 8 }}><Skeleton height={56} /><Skeleton height={56} /><Skeleton height={56} /></div>
          <Skeleton width="70%" height={12} />
          <Skeleton width="50%" height={12} />
          <div style={{ marginTop: 'auto', display: 'flex', gap: 8 }}><Skeleton width={64} height={32} radius={10} /><Skeleton width={72} height={32} radius={10} /></div>
        </div>
      ))}
    </div>
  );
}

export function StatSmall({ label, value, color, sub }) {
  return (
    <div style={{ ...card, padding: '12px 16px', flex: '1 1 110px', minWidth: 0 }}>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700, color: color || 'var(--color-text-primary)' }}>{value}</div>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', marginTop: 2 }}>{label}</div>
      {sub && <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>{sub}</div>}
    </div>
  );
}
export function PassRing({ pct, label = 'Pass rate', sub }) {
  const r = 30;
  const c = 2 * Math.PI * r;
  const col = passColor(pct);
  return (
    <div className="mgr-card" style={{ ...card, padding: 16, flex: '1 1 180px', minWidth: 170, display: 'flex', alignItems: 'center', gap: 16 }}>
      <svg width="78" height="78" viewBox="0 0 78 78">
        <circle cx="39" cy="39" r={r} fill="none" stroke="var(--color-background-secondary)" strokeWidth="8" />
        <circle cx="39" cy="39" r={r} fill="none" stroke={col} strokeWidth="8" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)} transform="rotate(-90 39 39)" />
        <text x="39" y="44" textAnchor="middle" fontSize="19" fontWeight="700" fill={col} fontFamily="var(--font-display)">{pct}%</text>
      </svg>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600 }}>{label}</div>
        {sub && <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginTop: 2 }}>{sub}</div>}
      </div>
    </div>
  );
}

/* ---- page sub-tabs ---- */
export function SubTabs({ tabs, active, onChange }) {
  return (
    <div role="tablist" onKeyDown={onTabListKeyDown} style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--color-border-primary)', marginBottom: 16, flexWrap: 'wrap' }}>
      {tabs.map(([k, label]) => (
        <button
          key={k}
          role="tab"
          aria-selected={active === k}
          tabIndex={active === k ? 0 : -1}
          onClick={() => onChange(k)}
          style={{
            padding: '8px 16px', fontSize: 13, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer',
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
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {options.map(([k, label]) => (
        <button
          key={k}
          onClick={() => onChange(k)}
          style={{
            padding: '4px 12px', fontSize: 12, fontWeight: 600, borderRadius: 999, cursor: 'pointer', fontFamily: 'var(--font-body)',
            color: value === k ? 'var(--accent-foreground)' : 'var(--color-text-primary)',
            background: value === k ? 'var(--accent)' : 'var(--card)',
            border: `1px solid ${value === k ? 'var(--accent)' : 'var(--border)'}`,
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
              flex: '1 1 130px', minWidth: 120, background: t.bg, color: t.fg, padding: '12px 16px 12px 24px', marginLeft: i === 0 ? 0 : -12,
              clipPath: i === 0
                ? 'polygon(0 0, calc(100% - 12px) 0, 100% 50%, calc(100% - 12px) 100%, 0 100%)'
                : last
                  ? 'polygon(0 0, 100% 0, 100% 100%, 0 100%, 12px 50%)'
                  : 'polygon(0 0, calc(100% - 12px) 0, 100% 50%, calc(100% - 12px) 100%, 0 100%, 12px 50%)',
            }}
          >
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700 }}>{s.count}</div>
            <div style={{ fontSize: 12, fontWeight: 600, opacity: 0.85 }}>{s.label}</div>
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
  const th = { textAlign: 'left', fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', padding: '8px 12px', borderBottom: '1px solid var(--color-border-primary)', position: 'sticky', top: 0, background: 'var(--color-background-primary)' };
  return (
    <div style={{ ...card, padding: 0 }}>
      {(searchText || toolbar) && (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', padding: 12, borderBottom: '1px solid var(--color-border-primary)' }}>
          {toolbar}
          <span style={{ flex: 1 }} />
          {searchText && (
            <input style={{ ...inputStyle, width: 'auto', flex: '0 1 220px', padding: '8px 12px', fontSize: 12 }} value={q} placeholder={searchPlaceholder} onChange={(e) => { setQ(e.target.value); setPage(0); }} />
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
                  <td key={c.label} style={{ fontSize: 13, fontFamily: 'var(--font-body)', padding: '12px 12px', borderBottom: '1px solid var(--color-border-primary)', ...(c.tdStyle || {}) }}>{c.render(r)}</td>
                ))}
              </tr>
            ))}
            {shown.length === 0 && (
              <tr><td colSpan={columns.length} style={{ padding: 16, fontSize: 13, color: 'var(--color-text-tertiary)', textAlign: 'center' }}>Nothing to show.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 12px', fontSize: 12, color: 'var(--color-text-secondary)' }}>
          <span>{filtered.length} rows · page {p + 1}/{pages}</span>
          <span style={{ display: 'flex', gap: 8 }}>
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
    <button disabled={disabled} onClick={onClick} style={{ padding: '4px 12px', fontSize: 12, fontFamily: 'inherit', borderRadius: 8, cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.4 : 1, background: 'var(--color-background-primary)', border: '1px solid var(--color-border-tertiary)', color: 'var(--color-text-primary)' }}>
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
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 120 }}>
        {(segments || []).map((s) => (
          <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
            <span style={{ width: 9, height: 9, borderRadius: 3, background: s.color, flexShrink: 0 }} />
            <span style={{ flex: 1, color: 'var(--color-text-secondary)' }}>{s.label}</span>
            <span className="tnum" style={{ fontWeight: 700 }}>{s.value}</span>
            <span className="tnum" style={{ color: 'var(--color-text-tertiary)', fontSize: 12, minWidth: 32, textAlign: 'right' }}>
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
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px 14px', marginTop: 12 }}>
        {(segments || []).map((s) => (
          <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
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
                  fontSize: 12, fontWeight: 700, color: s.fg || '#fff', minWidth: pct > 8 ? 0 : 0, overflow: 'hidden', whiteSpace: 'nowrap',
                }}
              >
                {pct >= 14 ? `${s.value.toFixed(1)}${unit}` : ''}
              </div>
            );
          })
        ) : (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: 'var(--color-text-tertiary)' }}>
            No timing data yet
          </div>
        )}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px 16px', marginTop: 12 }}>
        {data.map((s) => (
          <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
            <span style={{ width: 9, height: 9, borderRadius: 2, background: s.color, flexShrink: 0 }} />
            <span style={{ color: 'var(--color-text-secondary)' }}>{s.label}</span>
            <span className="tnum" style={{ fontWeight: 700 }}>{s.value.toFixed(1)}{unit}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ================================================================== */
/* Design-system dashboard widgets (Miaro Verify DS handoff bundle)   */
/* ================================================================== */

/* Trend arrows for the KPI delta pill — DS icon spec: 24px viewBox,
   1.6px stroke, currentColor, round caps/joins. */
function TrendArrow({ dir = 'up', size = 13 }) {
  const d = dir === 'up' ? 'M3 17 L9 11 L13 15 L21 7' : 'M3 7 L9 13 L13 9 L21 17';
  const cap = dir === 'up' ? 'M21 7 L21 13 M21 7 L15 7' : 'M21 17 L21 11 M21 17 L15 17';
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
      <path d={cap} />
    </svg>
  );
}

/* KPI tile — uppercase eyebrow, big tabular metric, optional trend-delta pill,
   uppercase footer. A row of these leads every dashboard. */
/* DS KPICard accents (indigo / teal / amber / rose / slate) — a 3px left stripe. */
export const KPI_ACCENTS = {
  indigo: 'var(--c-indigo)', teal: 'var(--c-teal)', amber: 'var(--c-amber)', rose: 'var(--c-red)', slate: 'var(--c-slate)',
};
export function StatCard({ label, value, delta, deltaDir = 'up', foot, accent, tone, loading, style }) {
  return <KpiTile label={label} value={value} caption={foot} delta={delta} deltaDir={deltaDir} tone={tone || ACCENT_TONE[accent] || 'neutral'} loading={loading} style={style} />;
}

/* Pipeline "count by stage" bars with a total footer (the QA funnel).
   stages = [{ label, count, color? }, …] */
export function StageBars({ stages = [], total, totalLabel = 'Total', unit = '', style }) {
  const max = Math.max(1, ...stages.map((s) => s.count));
  const sum = total != null ? total : stages.reduce((a, s) => a + s.count, 0);
  return (
    <div style={style}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {stages.map((s) => (
          <div key={s.label}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary)' }}>{s.label}</span>
              <span className="tnum" style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
                {s.count.toLocaleString()}{unit ? ` ${unit}` : ''}
              </span>
            </div>
            <div style={{ height: 6, borderRadius: 999, background: 'var(--color-background-secondary)', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${Math.max(2, (s.count / max) * 100)}%`, borderRadius: 999, background: s.color || 'var(--brand)' }} />
            </div>
          </div>
        ))}
      </div>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginTop: 24, paddingTop: 16, borderTop: '1px solid var(--color-border-primary)',
      }}>
        <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>{totalLabel}</span>
        <span className="tnum" style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700, letterSpacing: 'var(--tracking-tight)' }}>
          {sum.toLocaleString()}
        </span>
      </div>
    </div>
  );
}

/* Line chart — actual vs optional target, y-grid + x labels. Pure SVG. */
export function TrendChart({ data = [], target = null, xLabels = [], yTicks = 5, height = 300, format = (v) => v }) {
  const W = 720, H = height;
  const padL = 34, padR = 16, padT = 12, padB = 26;
  const iw = W - padL - padR, ih = H - padT - padB;
  const max = Math.max(1, ...[...data, ...(target || [])]);
  const n = Math.max(1, data.length - 1);
  const x = (i) => padL + (i / n) * iw;
  const y = (v) => padT + ih - (v / max) * ih;
  const path = (arr) => arr.map((v, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  const ticks = Array.from({ length: yTicks }, (_, i) => (max * i) / (yTicks - 1));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block', overflow: 'visible' }} role="img" aria-label="Trend chart">
      {ticks.map((t, i) => {
        const yy = y(t);
        return (
          <g key={i}>
            <line x1={padL} y1={yy} x2={W - padR} y2={yy} stroke="var(--color-border-primary)" strokeWidth="1" />
            <text x={padL - 8} y={yy + 3.5} textAnchor="end" fontSize="10" fill="var(--color-text-tertiary)" fontFamily="var(--font-mono)">
              {format(Math.round(t))}
            </text>
          </g>
        );
      })}
      {xLabels.map((lb, i) => (
        <text key={lb + i} x={x((i / Math.max(1, xLabels.length - 1)) * n)} y={H - 6} textAnchor="middle"
          fontSize="10.5" fill="var(--color-text-tertiary)" fontFamily="var(--font-body)">{lb}</text>
      ))}
      {target && <path d={path(target)} fill="none" stroke="var(--color-text-tertiary)" strokeWidth="1.6" strokeDasharray="4 5" opacity="0.7" />}
      {data.length > 0 && (
        <>
          <path d={`${path(data)} L ${x(n)} ${padT + ih} L ${x(0)} ${padT + ih} Z`} fill="var(--brand)" opacity="0.07" />
          <path d={path(data)} fill="none" stroke="var(--brand)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}
    </svg>
  );
}

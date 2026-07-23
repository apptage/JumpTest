/* Dashboard design kit — the house UI pattern (see DESIGN_GUIDE.md).
   Reuse these on every page: SubTabs, StatBig/StatSmall, PassRing, Pill,
   AlertCard, Chevron, DataTable. Add new shared primitives HERE, not inline. */
import { useState } from 'react';
import { card, inputStyle } from '@/ui.jsx';

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

/* ================================================================== */
/* Design-system dashboard widgets (JumpTest DS handoff bundle)       */
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
export function StatCard({ label, value, delta, deltaDir = 'up', foot, size = 'big', style }) {
  const pos = deltaDir === 'up';
  const dc = pos
    ? { bg: 'var(--tone-success-bg)', fg: 'var(--tone-success-fg)' }
    : { bg: 'var(--tone-danger-bg)', fg: 'var(--tone-danger-fg)' };
  const eyebrow = {
    fontSize: 11, fontWeight: 600, letterSpacing: 'var(--tracking-label)',
    textTransform: 'uppercase', color: 'var(--color-text-secondary)',
  };
  return (
    <div className="mgr-card" style={{ ...card, padding: '18px 20px', flex: '1 1 180px', minWidth: 168, ...style }}>
      <div style={eyebrow}>{label}</div>
      <div className="tnum" style={{
        fontFamily: 'var(--font-display)', fontSize: size === 'small' ? 22 : 28, fontWeight: 700,
        letterSpacing: 'var(--tracking-tight)', color: 'var(--color-text-primary)', margin: '10px 0',
      }}>
        {value}
      </div>
      {delta != null && (
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 999,
          background: dc.bg, color: dc.fg, fontSize: 11.5, fontWeight: 600,
        }}>
          <TrendArrow dir={pos ? 'up' : 'down'} />{delta}
        </div>
      )}
      {foot && (
        <div style={{ ...eyebrow, fontSize: 10.5, color: 'var(--color-text-tertiary)', marginTop: delta != null ? 12 : 0 }}>
          {foot}
        </div>
      )}
    </div>
  );
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
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 7 }}>
              <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary)' }}>{s.label}</span>
              <span className="tnum" style={{ fontSize: 12.5, color: 'var(--color-text-secondary)' }}>
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
        marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--color-border-primary)',
      }}>
        <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>{totalLabel}</span>
        <span className="tnum" style={{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 700, letterSpacing: 'var(--tracking-tight)' }}>
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

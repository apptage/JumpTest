/* Shared leaf presentational helpers used across features.
   Moved verbatim out of ReleaseTracker.jsx (Phase 0 mechanical split) — no
   behavior change. Depends only on the base UI primitives, constants, and
   illustrations. */
import { card, labelStyle } from '../ui.jsx';
import { SLA_COLORS, slaLevel, humanizeSince, STATUSES } from '../constants.js';
import { EmptyIllustration } from '../illustrations.jsx';

const DAY = 86_400_000;

export function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

export function Empty({ children }) {
  return (
    <div
      style={{
        ...card,
        padding: '48px 24px 52px',
        textAlign: 'center',
        color: 'var(--color-text-secondary)',
        fontSize: 13,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 14,
      }}
    >
      <EmptyIllustration size={130} />
      {children}
    </div>
  );
}

export function PageHeader({ title, subtitle }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>{title}</h1>
      {subtitle && (
        <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', margin: '4px 0 0' }}>{subtitle}</p>
      )}
    </div>
  );
}

export const authLink = {
  background: 'none',
  border: 'none',
  padding: 0,
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontSize: 12.5,
  fontWeight: 600,
  color: 'var(--brand)',
};

export function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={labelStyle}>{label}</label>
      {children}
    </div>
  );
}

export function statusSince(release) {
  return release.statusChangedAt || release.createdAt || release.date;
}

// small amber/red SLA dot; renders nothing when within SLA
export function SlaBadge({ level, title }) {
  if (!level) return null;
  return (
    <span
      title={title}
      style={{
        display: 'inline-block',
        width: 8,
        height: 8,
        borderRadius: 999,
        background: SLA_COLORS[level],
        boxShadow: level === 'over' ? `0 0 0 3px ${SLA_COLORS.over}22` : 'none',
        flexShrink: 0,
      }}
    />
  );
}

export function StatusAge({ release }) {
  const since = statusSince(release);
  const level = slaLevel(release.status, since);
  const color = level ? SLA_COLORS[level] : 'var(--color-text-tertiary)';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color }}>
      <SlaBadge
        level={level}
        title={
          level === 'over'
            ? 'Past SLA — needs attention'
            : level === 'warn'
            ? 'Approaching SLA'
            : ''
        }
      />
      {humanizeSince(since)} in {STATUSES[release.status]?.label || release.status}
    </span>
  );
}

export function EnvBadge({ environment }) {
  const env = environment || 'Production';
  const color = env === 'Staging' ? 'var(--warning)' : 'var(--success)';
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        fontSize: 11,
        fontWeight: 600,
        color: 'var(--color-text-secondary)',
        background: 'var(--color-background-secondary)',
        border: '1px solid var(--color-border-tertiary)',
        padding: '2px 8px',
        borderRadius: 999,
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: 999, background: color }} />
      {env}
    </span>
  );
}

export const sideHead = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  color: 'var(--color-text-tertiary)',
  marginBottom: 10,
};

export function relativeTime(t) {
  if (!t) return '';
  const d = new Date(t).getTime();
  if (Number.isNaN(d)) return '';
  const s = Math.floor((Date.now() - d) / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const dd = Math.floor(h / 24);
  if (dd < 30) return `${dd}d ago`;
  return new Date(t).toLocaleDateString();
}

export function TagChip({ label, tone }) {
  return (
    <span
      style={{
        fontSize: 10.5,
        fontWeight: 600,
        padding: '2px 8px',
        borderRadius: 999,
        color: tone === 'brand' ? 'var(--brand)' : 'var(--color-text-secondary)',
        background: tone === 'brand' ? 'var(--brand-soft)' : 'var(--color-background-secondary)',
        border: '1px solid var(--color-border-tertiary)',
      }}
    >
      {label}
    </span>
  );
}

export function avgDaysBetween(items, startKey, endKey) {
  const vals = items
    .map((r) => {
      const s = r[startKey] ? new Date(r[startKey]).getTime() : null;
      const e = r[endKey] ? new Date(r[endKey]).getTime() : null;
      return s && e && e >= s ? e - s : null;
    })
    .filter((v) => v != null);
  if (!vals.length) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length / DAY;
}

export function AnSection({ title, children }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ ...sideHead, marginBottom: 10 }}>{title}</div>
      {children}
    </div>
  );
}

export function Kpi({ label, value, sub, color }) {
  return (
    <div style={{ ...card, padding: 12, flex: '1 1 120px', minWidth: 110 }}>
      <div
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 22,
          fontWeight: 700,
          color: color || 'var(--color-text-primary)',
        }}
      >
        {value}
      </div>
      <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--color-text-secondary)', marginTop: 2 }}>
        {label}
      </div>
      {sub && <div style={{ fontSize: 10.5, color: 'var(--color-text-tertiary)', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

export function DistBars({ items }) {
  const max = Math.max(1, ...items.map((i) => i.n));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {items.map((i) => (
        <div key={i.key} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 12, flex: '0 0 110px' }}>{i.label}</span>
          <div style={{ flex: 1, height: 8, borderRadius: 999, background: 'var(--color-background-secondary)' }}>
            <div style={{ width: `${(i.n / max) * 100}%`, height: '100%', borderRadius: 999, background: i.color }} />
          </div>
          <span className="tnum" style={{ fontSize: 12, color: 'var(--color-text-secondary)', flex: '0 0 28px', textAlign: 'right' }}>
            {i.n}
          </span>
        </div>
      ))}
    </div>
  );
}

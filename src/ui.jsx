import {
  STATUSES,
  RELEASE_TYPES,
  SEVERITIES,
  BUG_STATUSES,
  ROLE_COLORS,
} from './constants.js';

/* ---------- style tokens ---------- */

export const card = {
  background: 'var(--color-background-primary)',
  border: '0.5px solid var(--color-border-tertiary)',
  borderRadius: 'var(--r-card)',
  boxShadow: 'var(--shadow-sm)',
};

export const inputStyle = {
  width: '100%',
  padding: '10px 12px',
  fontSize: 13,
  fontWeight: 400,
  color: 'var(--color-text-primary)',
  background: 'var(--color-background-secondary)',
  border: '0.5px solid var(--color-border-tertiary)',
  borderRadius: 'var(--r-input)',
  outline: 'none',
  fontFamily: 'inherit',
};

export const labelStyle = {
  display: 'block',
  fontSize: 11,
  fontWeight: 600,
  color: 'var(--color-text-secondary)',
  marginBottom: 6,
  letterSpacing: '0.01em',
};

export function primaryButton(disabled) {
  return {
    padding: '9px 16px',
    fontSize: 13,
    fontWeight: 600,
    color: '#fff',
    background: disabled ? 'var(--color-text-tertiary)' : 'var(--brand-grad)',
    border: 'none',
    borderRadius: 'var(--r-input)',
    cursor: disabled ? 'default' : 'pointer',
    fontFamily: 'inherit',
    boxShadow: disabled ? 'none' : 'var(--shadow-brand)',
  };
}

export const ghostButton = {
  padding: '9px 16px',
  fontSize: 13,
  fontWeight: 500,
  color: 'var(--color-text-primary)',
  background: 'var(--color-background-primary)',
  border: '0.5px solid var(--color-border-tertiary)',
  borderRadius: 'var(--r-input)',
  cursor: 'pointer',
  fontFamily: 'inherit',
  boxShadow: 'var(--shadow-sm)',
};

export const pill = (color) => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: 5,
  padding: '3px 10px',
  borderRadius: 999,
  fontSize: 11,
  fontWeight: 600,
  color,
  background: `${color}1a`,
  whiteSpace: 'nowrap',
});

/* ---------- brand ---------- */

export function Logo({ size = 30 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: 'block', flexShrink: 0 }}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="rt-grad" x1="0" y1="0" x2="32" y2="32">
          <stop stopColor="#ff8a1f" />
          <stop offset="1" stopColor="#ff5400" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="8" fill="url(#rt-grad)" />
      {/* </> code mark in ink */}
      <path
        d="M12.5 11L8.5 16l4 5M19.5 11l4 5-4 5"
        stroke="#0c0d11"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Wordmark({ size = 30, tone }) {
  const color = tone === 'ink' ? 'var(--on-ink)' : 'var(--color-text-primary)';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <Logo size={size} />
      <div
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 16.5,
          fontWeight: 700,
          letterSpacing: '-0.02em',
          color,
        }}
      >
        Gamma<span style={{ color: 'var(--brand)' }}>Quality</span>
      </div>
    </div>
  );
}

/* ---------- badges ---------- */

export function StatusBadge({ status }) {
  const s = STATUSES[status] || { label: status, color: '#6b7280' };
  return (
    <span style={pill(s.color)}>
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: 999,
          background: s.color,
          display: 'inline-block',
        }}
      />
      {s.label}
    </span>
  );
}

export function BugStatusBadge({ status }) {
  const s = BUG_STATUSES[status] || { label: status, color: '#6b7280' };
  return <span style={pill(s.color)}>{s.label}</span>;
}

export function SeverityBadge({ severity }) {
  const s = SEVERITIES[severity] || { label: severity, color: '#6b7280' };
  return <span style={pill(s.color)}>{s.label}</span>;
}

export function TypeBadge({ type }) {
  const t = RELEASE_TYPES[type] || { label: type, icon: '📄' };
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        color: 'var(--color-text-secondary)',
        fontSize: 13,
        fontWeight: 600,
      }}
    >
      <span style={{ fontSize: 15 }}>{t.icon}</span>
      {t.label}
    </span>
  );
}

export function Avatar({ name, role, size = 30 }) {
  const initials = (name || '?')
    .split(/[\s_]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('');
  const color = ROLE_COLORS[role] || '#6b7280';
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
        borderRadius: '50%',
        background: `${color}24`,
        color,
        fontSize: size < 26 ? 10 : 11,
        fontWeight: 700,
        flexShrink: 0,
        border: `1px solid ${color}33`,
      }}
    >
      {initials}
    </span>
  );
}

export function CountBadge({ count, color = '#f43f5e' }) {
  if (!count) return null;
  return (
    <span
      className="anim-pop"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: 18,
        height: 18,
        padding: '0 5px',
        borderRadius: 999,
        fontSize: 10,
        fontWeight: 700,
        color: '#fff',
        background: color,
        boxShadow: '0 0 0 2px var(--color-background-primary)',
      }}
    >
      {count}
    </span>
  );
}

/* ---------- modal shell ---------- */

export function ModalShell({ children, onClose, title, maxWidth = 520, right }) {
  return (
    <div
      className="anim-overlay"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 16, 20, 0.5)',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: '40px 16px',
        zIndex: 50,
        overflowY: 'auto',
      }}
    >
      <div
        className="anim-modal"
        onClick={(e) => e.stopPropagation()}
        style={{
          ...card,
          borderRadius: 'var(--r-modal)',
          boxShadow: 'var(--shadow-lg)',
          width: '100%',
          maxWidth,
          padding: 24,
        }}
      >
        {title ? (
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 18 }}>
            <div style={{ fontSize: 17, fontWeight: 700, flex: 1, letterSpacing: '-0.02em' }}>
              {title}
            </div>
            {right}
          </div>
        ) : null}
        {children}
      </div>
    </div>
  );
}

/* ---------- toast ---------- */

export function Toast({ toast }) {
  if (!toast) return null;
  const isError = toast.kind === 'error';
  const color = isError ? '#f43f5e' : '#10b981';
  return (
    <div
      className="anim-toast"
      style={{
        position: 'fixed',
        top: 18,
        right: 18,
        zIndex: 100,
        maxWidth: 360,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '12px 14px',
        background: 'var(--color-background-primary)',
        border: '0.5px solid var(--color-border-tertiary)',
        borderRadius: 12,
        boxShadow: 'var(--shadow-lg)',
        fontSize: 13,
        fontWeight: 500,
        color: 'var(--color-text-primary)',
      }}
    >
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 20,
          height: 20,
          borderRadius: 999,
          background: color,
          color: '#fff',
          fontSize: 12,
          flexShrink: 0,
        }}
      >
        {isError ? '!' : '✓'}
      </span>
      {toast.message}
    </div>
  );
}

/* ---------- misc ---------- */

export function CenteredMessage({ children }) {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        textAlign: 'center',
        color: 'var(--color-text-secondary)',
        fontSize: 13,
      }}
    >
      {children}
    </div>
  );
}

export function Info({ label, value }) {
  return (
    <div>
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: 'var(--color-text-secondary)',
          marginBottom: 3,
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 13, fontWeight: 500, wordBreak: 'break-word' }}>
        {value}
      </div>
    </div>
  );
}

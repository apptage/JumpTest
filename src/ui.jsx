import { createPortal } from 'react-dom';
import {
  STATUSES,
  RELEASE_TYPES,
  SEVERITIES,
  BUG_STATUSES,
} from './constants.js';
import { IconPackage, IconSend, IconGlobe } from './icons.jsx';
import { MiaroMark, MiaroLogo } from './brand.jsx';

/* ---------- style tokens ---------- */

export const card = {
  background: 'var(--color-background-primary)',
  border: '1px solid var(--color-border-tertiary)',
  borderRadius: 'var(--r-card)',
  boxShadow: 'var(--shadow-sm)',
};

/* Input — DS recipe: h-10, rounded-xl, bg-bg/50, Lexend Deca; focus = accent
   border + accent/15 ring (the ring comes from the global input:focus rule). */
export const inputStyle = {
  width: '100%',
  minHeight: 40,
  padding: '9px 12px',
  fontSize: 13,
  fontWeight: 500,
  color: 'var(--color-text-primary)',
  background: 'var(--input-bg)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--r-input)',
  outline: 'none',
  fontFamily: 'var(--font-body)',
};

export const labelStyle = {
  display: 'block',
  fontSize: 11,
  fontWeight: 600,
  color: 'var(--color-text-secondary)',
  marginBottom: 6,
  letterSpacing: '0.01em',
  fontFamily: 'var(--font-body)',
};

/* Button default — DS: rounded-xl, Lexend Deca 13px semibold, bg-accent
   (charcoal in light; inverts to a light fill in dark via --accent-foreground). */
export function primaryButton(disabled) {
  return {
    padding: '9px 16px',
    minHeight: 36,
    fontSize: 13,
    fontWeight: 600,
    color: disabled ? 'var(--color-text-secondary)' : 'var(--accent-foreground)',
    background: disabled ? 'var(--accent-muted)' : 'var(--accent)',
    border: '1px solid transparent',
    borderRadius: 'var(--r-input)',
    cursor: disabled ? 'default' : 'pointer',
    fontFamily: 'var(--font-body)',
    boxShadow: 'none',
    transition: 'background 0.2s var(--ease), filter 0.2s var(--ease)',
  };
}

/* Outline / secondary — DS chip language: border-border, bg-card, rounded-xl. */
export const ghostButton = {
  padding: '9px 16px',
  minHeight: 36,
  fontSize: 13,
  fontWeight: 600,
  color: 'var(--color-text-primary)',
  background: 'var(--card)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--r-input)',
  cursor: 'pointer',
  fontFamily: 'var(--font-body)',
  boxShadow: 'none',
};

/* subtle, consistent status chip: dot + neutral text + thin border
   (no large colored blocks — color appears only as a small dot) */
const dotPillStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '3px 9px',
  borderRadius: 999,
  fontSize: 11,
  fontWeight: 600,
  color: 'var(--color-text-secondary)',
  background: 'var(--color-background-secondary)',
  border: '1px solid var(--color-border-tertiary)',
  whiteSpace: 'nowrap',
};

export function DotPill({ color, label }) {
  return (
    <span style={dotPillStyle}>
      <span style={{ width: 6, height: 6, borderRadius: 999, background: color, flexShrink: 0 }} />
      {label}
    </span>
  );
}

/* ---------- brand ---------- */

/* Logo = the Miaro mark only; Wordmark = the full "miaro VERIFY" lock-up.
   Both inherit the text colour (see src/brand.jsx). `size` is the height. */
export function Logo({ size = 28, tone }) {
  return <MiaroMark size={size} color={tone === 'ink' ? 'var(--on-ink)' : 'var(--color-text-primary)'} />;
}

export function Wordmark({ size = 26, tone }) {
  return <MiaroLogo size={size} color={tone === 'ink' ? 'var(--on-ink)' : 'var(--color-text-primary)'} />;
}

/* ---------- badges ---------- */

export function StatusBadge({ status }) {
  const s = STATUSES[status] || { label: status, color: 'var(--color-text-tertiary)' };
  return <DotPill color={s.color} label={s.label} />;
}

export function BugStatusBadge({ status }) {
  const s = BUG_STATUSES[status] || { label: status, color: 'var(--color-text-tertiary)' };
  return <DotPill color={s.color} label={s.label} />;
}

export function SeverityBadge({ severity }) {
  const s = SEVERITIES[severity] || { label: severity, color: 'var(--color-text-tertiary)' };
  return <DotPill color={s.color} label={s.label} />;
}

const TYPE_ICONS = { apk: IconPackage, testflight: IconSend, web: IconGlobe };

export function TypeBadge({ type }) {
  const t = RELEASE_TYPES[type] || { label: type };
  const Ico = TYPE_ICONS[type] || IconPackage;
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
      <Ico size={15} />
      {t.label}
    </span>
  );
}

export function Avatar({ name, size = 30 }) {
  const initials = (name || '?')
    .split(/[\s_]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('');
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
        borderRadius: '50%',
        background: 'var(--color-background-tertiary)',
        color: 'var(--color-text-secondary)',
        fontSize: size < 26 ? 10 : 11,
        fontWeight: 600,
        flexShrink: 0,
        border: '1px solid var(--color-border-tertiary)',
      }}
    >
      {initials}
    </span>
  );
}

export function CountBadge({ count, color = '#dc2626' }) {
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

export function ModalShell({ children, onClose, title, subtitle, footer, maxWidth = 520, right, zIndex = 50 }) {
  // header/body/footer flex layout: header + footer stay pinned, body scrolls.
  const hasHeader = !!(title || subtitle);
  // Portal to <body> so the fixed overlay covers the whole viewport instead of
  // being trapped inside the animated `.page-area` (its `slideUp` transform makes
  // it the containing block for `position: fixed` descendants).
  return createPortal(
    <div
      className="anim-overlay"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.4)',          /* DS Dialog overlay: bg-black/40 + blur */
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: '40px 16px',
        zIndex,
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
          padding: 0,
          overflow: 'hidden',
          maxHeight: 'calc(100vh - 80px)',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {hasHeader && (
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 12,
              padding: '18px 24px',
              borderBottom: '1px solid var(--color-border-primary)',
              flex: '0 0 auto',
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              {title && <div style={{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 700, letterSpacing: '-0.02em' }}>{title}</div>}
              {subtitle && (
                <div style={{ fontSize: 12.5, color: 'var(--color-text-secondary)', marginTop: title ? 3 : 0 }}>
                  {subtitle}
                </div>
              )}
            </div>
            {right}
            <button
              onClick={onClose}
              aria-label="Close"
              style={{
                border: 'none', background: 'none', cursor: 'pointer', fontSize: 18, lineHeight: 1,
                color: 'var(--color-text-tertiary)', padding: 2, marginTop: -2, flex: '0 0 auto',
              }}
            >
              ✕
            </button>
          </div>
        )}
        {/* body scrolls if the content is taller than the viewport */}
        <div style={{ flex: '1 1 auto', minHeight: 0, overflowY: 'auto', padding: 24 }}>{children}</div>
        {footer && (
          <div
            style={{
              flex: '0 0 auto',
              borderTop: '1px solid var(--color-border-primary)',
              background: 'var(--color-background-secondary)',
              padding: '14px 24px',
            }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

/* ---------- toast ---------- */

export function Toast({ toast }) {
  if (!toast) return null;
  const isError = toast.kind === 'error';
  const color = isError ? 'var(--danger)' : 'var(--success)';
  return (
    /* DS Sonner: bottom-center */
    <div
      className="anim-toast"
      style={{
        position: 'fixed',
        bottom: 18,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 100,
        maxWidth: 380,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '11px 14px',
        background: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        boxShadow: 'var(--shadow-lg)',
        fontSize: 13,
        fontWeight: 500,
        color: 'var(--color-text-primary)',
        fontFamily: 'var(--font-body)',
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

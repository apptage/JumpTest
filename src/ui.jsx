import { createPortal } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { useEffect, useRef, useState } from 'react';
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
  padding: '8px 12px',
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
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--color-text-secondary)',
  marginBottom: 8,
  letterSpacing: '0.01em',
  fontFamily: 'var(--font-body)',
};

/* Button default — DS: rounded-xl, Lexend Deca 13px semibold, bg-accent
   (charcoal in light; inverts to a light fill in dark via --accent-foreground). */
export function primaryButton(disabled) {
  return {
    padding: '8px 16px',
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
  padding: '8px 16px',
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
  gap: 8,
  padding: '4px 8px',
  borderRadius: 999,
  fontSize: 12,
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
        gap: 8,
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

export function CountBadge({ count, color = 'var(--c-red)' }) {
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
        padding: '0 4px',
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 700,
        color: 'var(--on-status)',
        background: color,
        boxShadow: '0 0 0 2px var(--color-background-primary)',
      }}
    >
      {count}
    </span>
  );
}

/* ---------- modal shell ---------- */

/* ModalShell — every dialog and drawer in the app.
   variant 'modal' (default): centred, for short focused forms (create, edit,
     settings, confirm).
   variant 'drawer': full-height panel from the right, for looking at one record
     next to its list (a build, a bug). The header (title + close) stays put.
   Both: role=dialog, Esc closes, focus moves in on open and back on close, and
   clicking the dimmed backdrop closes. */
const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
let modalSeq = 0;
export function ModalShell({ children, onClose, title, subtitle, footer, maxWidth = 520, right, zIndex = 50, variant = 'modal', ariaLabel, initialFocus }) {
  const hasHeader = !!(title || subtitle);
  const drawer = variant === 'drawer';
  const panelRef = useRef(null);
  const [titleId] = useState(() => `modal-title-${++modalSeq}`);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const before = document.activeElement;
    const panel = panelRef.current;
    // forms focus their first field; a drawer (reading a record) focuses the
    // panel itself so no field grabs focus or pops up a phone keyboard
    const target = (initialFocus && panel?.querySelector(initialFocus)) || (!drawer && panel?.querySelector('input, select, textarea')) || panel;
    target?.focus?.({ preventScroll: true });
    const onKey = (e) => {
      if (e.key === 'Escape') {
        // only the top-most dialog closes
        const all = document.querySelectorAll('[data-modal-panel]');
        if (all[all.length - 1] === panelRef.current) { e.stopPropagation(); closeRef.current?.(); }
      } else if (e.key === 'Tab' && panelRef.current) {
        // keep Tab inside the dialog
        const f = [...panelRef.current.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null);
        if (!f.length) return;
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      if (before && before.focus && document.contains(before)) before.focus({ preventScroll: true });
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
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
        background: 'rgba(0, 0, 0, 0.4)',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: drawer ? 'stretch' : 'flex-start',
        justifyContent: drawer ? 'flex-end' : 'center',
        padding: drawer ? 0 : '48px 16px',
        zIndex,
        overflowY: drawer ? 'hidden' : 'auto',
      }}
    >
      <div
        ref={panelRef}
        data-modal-panel=""
        role="dialog"
        aria-modal="true"
        aria-labelledby={hasHeader ? titleId : undefined}
        aria-label={hasHeader ? undefined : ariaLabel}
        tabIndex={-1}
        className={drawer ? 'anim-drawer' : 'anim-modal'}
        onClick={(e) => e.stopPropagation()}
        style={{
          ...card,
          borderRadius: drawer ? 'var(--r-modal) 0 0 var(--r-modal)' : 'var(--r-modal)',
          boxShadow: 'var(--shadow-lg)',
          width: '100%',
          maxWidth,
          padding: 0,
          overflow: 'hidden',
          height: drawer ? '100%' : undefined,
          maxHeight: drawer ? '100%' : 'calc(100vh - 80px)',
          display: 'flex',
          flexDirection: 'column',
          outline: 'none',
        }}
      >
        {hasHeader && (
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 12,
              padding: '16px 24px',
              borderBottom: '1px solid var(--color-border-primary)',
              flex: '0 0 auto',
            }}
          >
            <div id={titleId} style={{ flex: 1, minWidth: 0 }}>
              {title && <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700, letterSpacing: '-0.02em' }}>{title}</div>}
              {subtitle && (
                <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginTop: title ? 4 : 0 }}>
                  {subtitle}
                </div>
              )}
            </div>
            {right}
            <button
              onClick={onClose}
              aria-label="Close"
              title="Close (Esc)"
              className="hdr-icon-btn"
              style={{ flex: '0 0 auto', border: 'none', color: 'var(--color-text-secondary)', background: 'transparent' }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
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
              padding: '16px 24px',
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

/* ---------- confirm ----------
   confirmAction(message) or confirmAction({ title, message, confirmLabel, danger })
   → Promise<boolean>. The app's own dialog instead of the browser's confirm():
   same look as every other dialog, works in dark mode, and Cancel has focus so
   Enter never deletes by accident. Deletions get a red confirm button. */
function ConfirmDialog({ title, message, confirmLabel, cancelLabel = 'Cancel', danger, onDone }) {
  return (
    <ModalShell onClose={() => onDone(false)} title={title} maxWidth={440} zIndex={90} initialFocus="[data-confirm-cancel]"
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
          <button data-confirm-cancel="" style={ghostButton} onClick={() => onDone(false)}>{cancelLabel}</button>
          <button
            style={danger
              ? { ...primaryButton(false), background: 'var(--danger)', borderColor: 'var(--danger)', color: 'var(--on-status)' }
              : primaryButton(false)}
            onClick={() => onDone(true)}
          >
            {confirmLabel}
          </button>
        </div>
      }
    >
      <div style={{ fontSize: 13, lineHeight: 1.55, color: 'var(--color-text-secondary)', whiteSpace: 'pre-line' }}>{message}</div>
    </ModalShell>
  );
}
export function confirmAction(opts) {
  const o = typeof opts === 'string' ? { message: opts } : { ...opts };
  const msg = String(o.message || '');
  const danger = o.danger ?? /^(delete|remove|revoke|turn off|permanently)/i.test(msg);
  const verb = (msg.match(/^(Permanently delete|Delete|Remove|Revoke|Turn off|Mark|Complete|Reopen)/i) || [])[0];
  o.danger = danger;
  o.confirmLabel = o.confirmLabel || (verb ? verb[0].toUpperCase() + verb.slice(1).toLowerCase() : 'Continue');
  o.title = o.title || (danger ? 'Are you sure?' : 'Please confirm');
  return new Promise((resolve) => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    const done = (v) => { root.unmount(); host.remove(); resolve(v); };
    root.render(<ConfirmDialog {...o} onDone={done} />);
  });
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
        gap: 12,
        padding: '12px 16px',
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
          color: 'var(--on-status)',
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
          fontSize: 12,
          fontWeight: 600,
          color: 'var(--color-text-secondary)',
          marginBottom: 4,
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

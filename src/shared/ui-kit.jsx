/* Shared leaf presentational helpers used across features.
   Moved verbatim out of ReleaseTracker.jsx (Phase 0 mechanical split) — no
   behavior change. Depends only on the base UI primitives, constants, and
   illustrations. */
import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { card, labelStyle, inputStyle, ghostButton } from '../ui.jsx';
import { SLA_COLORS, slaLevel, humanizeSince, STATUSES, tint } from '../constants.js';
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
        gap: 16,
      }}
    >
      <EmptyIllustration size={130} />
      {children}
    </div>
  );
}

/* PageHeaderBar (DS "glass" variant): rounded-2xl, border-border, bg-card/50 +
   backdrop-blur. Row = [icon] h1 Lexend 25px extrabold + description Lexend
   Deca muted + actions (right); optional toolbar row (mt-4) for search/filters.
   Breadcrumbs live in AppHeader — never duplicate them here. */
/* ---- filter toolbars ----
   Every list page puts its filters in one .filter-bar (app/globals.css): search
   first, then dropdowns, then the result count on the right. Dropdowns use
   filterSelect so they're the same height, padding and type everywhere. */
export const filterSelect = { ...inputStyle, width: 'auto', minHeight: 36, padding: '0 12px', fontSize: 13 };
export const filterInput = { ...inputStyle, width: '100%', minHeight: 36, padding: '0 12px', fontSize: 13 };

export function PageHeader({ title, subtitle, icon, actions, toolbar }) {
  return (
    <header className="glass" style={{ padding: '16px 24px', marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
        {icon && (
          <span style={{
            display: 'inline-grid', placeItems: 'center', width: 40, height: 40, borderRadius: 12, flexShrink: 0,
            background: 'var(--accent-soft)', color: 'var(--text)', marginTop: 2,
          }}>{icon}</span>
        )}
        <div style={{ flex: 1, minWidth: 200 }}>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-page-title)', fontWeight: 800, margin: 0, letterSpacing: '-0.02em', lineHeight: 1.15 }}>
            {title}
          </h1>
          {subtitle && (
            <p style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--color-text-secondary)', margin: '4px 0 0' }}>{subtitle}</p>
          )}
        </div>
        {actions && <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>{actions}</div>}
      </div>
      {toolbar && <div style={{ marginTop: 16 }}>{toolbar}</div>}
    </header>
  );
}

export const authLink = {
  background: 'none',
  border: 'none',
  padding: 0,
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontSize: 13,
  fontWeight: 600,
  color: 'var(--brand)',
};

export function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 16 }}>
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
        boxShadow: level === 'over' ? `0 0 0 3px ${tint(SLA_COLORS.over, 13)}` : 'none',
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
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color }}>
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
        gap: 4,
        fontSize: 12,
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

/* DS section label: 11px uppercase, tracking 0.8px, Lexend Deca */
export const sideHead = {
  fontFamily: 'var(--font-body)',
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: 'var(--tracking-label)',
  textTransform: 'uppercase',
  color: 'var(--color-text-tertiary)',
  marginBottom: 12,
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
        fontSize: 12,
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
    <div style={{ marginBottom: 16 }}>
      <div style={{ ...sideHead, marginBottom: 12 }}>{title}</div>
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
          fontSize: 20,
          fontWeight: 700,
          color: color || 'var(--color-text-primary)',
        }}
      >
        {value}
      </div>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', marginTop: 2 }}>
        {label}
      </div>
      {sub && <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

export function DistBars({ items }) {
  const max = Math.max(1, ...items.map((i) => i.n));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {items.map((i) => (
        <div key={i.key} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
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

/* Value that only updates after `ms` without changes, so typing in a search
   box doesn't send a request per keystroke. */
export function useDebounced(value, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/* Page controls for a server-paged list. page is 0-based. */
export function Pager({ page, pageSize, total, onPage, busy = false, noun = 'items' }) {
  if (!total) return null;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const first = page * pageSize + 1;
  const last = Math.min(total, (page + 1) * pageSize);
  const btn = (disabled) => ({
    padding: '8px 12px', fontSize: 13, fontWeight: 600, fontFamily: 'inherit', borderRadius: 10,
    cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.45 : 1,
    background: 'var(--card)', border: '1px solid var(--border)', color: 'var(--color-text-primary)',
  });
  return (
    <nav aria-label="Pagination" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginTop: 16, fontSize: 13, color: 'var(--color-text-secondary)' }}>
      <span className="tnum">
        {first.toLocaleString()}–{last.toLocaleString()} of {total.toLocaleString()} {noun}
        {busy && <span style={{ color: 'var(--color-text-tertiary)' }}> · loading…</span>}
      </span>
      {pages > 1 && (
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button style={btn(page === 0)} disabled={page === 0} onClick={() => onPage(0)} aria-label="First page">«</button>
          <button style={btn(page === 0)} disabled={page === 0} onClick={() => onPage(page - 1)}>Prev</button>
          <span className="tnum" style={{ padding: '0 8px' }}>Page {page + 1} of {pages}</span>
          <button style={btn(page >= pages - 1)} disabled={page >= pages - 1} onClick={() => onPage(page + 1)}>Next</button>
          <button style={btn(page >= pages - 1)} disabled={page >= pages - 1} onClick={() => onPage(pages - 1)} aria-label="Last page">»</button>
        </span>
      )}
    </nav>
  );
}


/* ---- ActionMenu: the "⋯" menu for a card's or row's less-used actions ----
   items: [{ label, onSelect, danger?, disabled?, hint? }]. Opens below the button
   (above when there's no room), in a portal so card overflow never clips it.
   Keyboard: Enter/Space/↓ opens, ↑/↓ move, Enter picks, Esc closes and returns
   focus. Clicks inside never reach the card underneath. */
export function ActionMenu({ items, label = 'More actions', size = 32, style }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const [hi, setHi] = useState(0);
  const btn = useRef(null);
  const list = useRef(null);
  const shown = items.filter(Boolean);
  const place = () => {
    const r = btn.current.getBoundingClientRect();
    const h = 8 + shown.length * 36;
    const below = r.bottom + 4 + h < window.innerHeight;
    setPos({ top: below ? r.bottom + 4 : r.top - 4 - h, right: Math.max(8, window.innerWidth - r.right) });
  };
  const openMenu = (at = 0) => { place(); setHi(at); setOpen(true); };
  const close = (refocus = true) => { setOpen(false); if (refocus) btn.current?.focus(); };
  useEffect(() => {
    if (!open) return undefined;
    list.current?.querySelectorAll('[role="menuitem"]')[hi]?.focus();
    const away = (e) => { if (!list.current?.contains(e.target) && !btn.current?.contains(e.target)) close(false); };
    const off = () => close(false);
    document.addEventListener('mousedown', away);
    window.addEventListener('resize', off);
    window.addEventListener('scroll', off, true);
    return () => { document.removeEventListener('mousedown', away); window.removeEventListener('resize', off); window.removeEventListener('scroll', off, true); };
  }, [open, hi]); // eslint-disable-line react-hooks/exhaustive-deps
  const onListKey = (e) => {
    e.stopPropagation();
    const enabled = shown.map((it, i) => (it.disabled ? -1 : i)).filter((i) => i >= 0);
    const at = enabled.indexOf(hi);
    if (e.key === 'Escape' || e.key === 'Tab') { e.preventDefault(); close(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setHi(enabled[(at + 1) % enabled.length]); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi(enabled[(at - 1 + enabled.length) % enabled.length]); }
  };
  const pick = (it) => { if (it.disabled) return; close(); it.onSelect(); };
  if (!shown.length) return null;
  return (
    <>
      <button
        ref={btn}
        type="button"
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => { e.stopPropagation(); open ? close() : openMenu(); }}
        onKeyDown={(e) => { if (e.key === 'ArrowDown') { e.preventDefault(); e.stopPropagation(); openMenu(); } }}
        style={{ ...ghostButton, width: size, minWidth: size, height: size, minHeight: size, padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto', ...style }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" /></svg>
      </button>
      {open && pos && createPortal(
        <div
          ref={list}
          role="menu"
          aria-label={label}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={onListKey}
          className="anim-pop"
          style={{ ...card, position: 'fixed', top: pos.top, right: pos.right, zIndex: 80, minWidth: 168, padding: 4, boxShadow: 'var(--shadow-lg)' }}
        >
          {shown.map((it, i) => (
            <button
              key={it.label}
              role="menuitem"
              type="button"
              disabled={it.disabled}
              tabIndex={i === hi ? 0 : -1}
              title={it.hint}
              onMouseEnter={() => !it.disabled && setHi(i)}
              onClick={() => pick(it)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); pick(it); } }}
              style={{
                display: 'flex', alignItems: 'center', width: '100%', minHeight: 36, padding: '0 12px', border: 'none', borderRadius: 8,
                background: i === hi ? 'var(--accent-soft)' : 'transparent', cursor: it.disabled ? 'default' : 'pointer', textAlign: 'left',
                fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 500, opacity: it.disabled ? 0.5 : 1,
                color: it.danger ? 'var(--danger)' : 'var(--color-text-primary)',
              }}
            >
              {it.label}
            </button>
          ))}
        </div>,
        document.body
      )}
    </>
  );
}

/* Make a clickable card/row usable from the keyboard: a tab stop, announced as a
   button, opened with Enter or Space. Spread onto the element:
   <div {...pressable(open, `Open build v1.2`)}> */
export function pressable(onPress, label) {
  if (!onPress) return {};
  return {
    role: 'button',
    tabIndex: 0,
    'aria-label': label,
    onClick: onPress,
    onKeyDown: (e) => {
      if (e.target !== e.currentTarget) return; // a button inside handles its own keys
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPress(e); }
    },
  };
}

/* Arrow keys / Home / End across a role="tablist": moves to and selects the
   neighbouring tab (the WAI-ARIA tabs pattern). Put on the tablist element. */
export function onTabListKeyDown(e) {
  const keys = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1, Home: 'first', End: 'last' };
  if (!(e.key in keys)) return;
  const tabs = [...e.currentTarget.querySelectorAll('[role="tab"]:not([disabled])')];
  const i = tabs.indexOf(document.activeElement);
  if (i < 0) return;
  e.preventDefault();
  const k = keys[e.key];
  const next = k === 'first' ? tabs[0] : k === 'last' ? tabs[tabs.length - 1] : tabs[(i + k + tabs.length) % tabs.length];
  next.focus();
  next.click();
}

/* ---- tooltips ----
   One TooltipLayer, mounted once by the app, turns every `title` (or data-tip)
   into a real tooltip: it opens on hover after a short pause AND on keyboard
   focus, closes on Esc / scroll / pointer down, and stays inside the screen.
   The native title is removed while it's ours (no double tooltip); an icon-only
   control without a name gets the tip as its aria-label, so screen readers
   still hear it. Touch devices are left alone (a tap should just act).
   Tooltips only add context; anything essential stays visible on the page. */
export function TooltipLayer() {
  const [tip, setTip] = useState(null); // { text, rect, side }
  const timer = useRef(0);
  const current = useRef(null);
  useEffect(() => {
    const findHost = (el) => el?.closest?.('[title], [data-tip]');
    const textOf = (el) => {
      if (el.hasAttribute('title')) {
        const t = el.getAttribute('title');
        el.removeAttribute('title');
        if (t) el.setAttribute('data-tip', t);
        // icon-only: the tip becomes its accessible name
        if (t && !el.getAttribute('aria-label') && !el.textContent.trim() && !el.getAttribute('aria-labelledby')) el.setAttribute('aria-label', t);
      }
      return el.getAttribute('data-tip') || '';
    };
    const show = (el, delay) => {
      const text = textOf(el);
      clearTimeout(timer.current);
      if (!text) return;
      current.current = el;
      timer.current = setTimeout(() => {
        if (current.current !== el || !document.contains(el)) return;
        const side = el.closest('.nav-rail.collapsed') ? 'right' : 'top';
        setTip({ text, rect: el.getBoundingClientRect(), side });
      }, delay);
    };
    const hide = () => { clearTimeout(timer.current); current.current = null; setTip(null); };
    const over = (e) => { if (e.pointerType === 'touch') return; const h = findHost(e.target); if (h && h !== current.current) show(h, 450); else if (!h && current.current) hide(); };
    const out = (e) => { if (current.current && !current.current.contains(e.relatedTarget)) hide(); };
    const focusIn = (e) => { const h = findHost(e.target); if (h && e.target.matches?.(':focus-visible')) show(h, 0); };
    const key = (e) => { if (e.key === 'Escape') hide(); };
    document.addEventListener('pointerover', over);
    document.addEventListener('pointerout', out);
    document.addEventListener('focusin', focusIn);
    document.addEventListener('focusout', hide);
    document.addEventListener('pointerdown', hide, true);
    document.addEventListener('keydown', key);
    window.addEventListener('scroll', hide, true);
    window.addEventListener('resize', hide);
    return () => {
      clearTimeout(timer.current);
      document.removeEventListener('pointerover', over);
      document.removeEventListener('pointerout', out);
      document.removeEventListener('focusin', focusIn);
      document.removeEventListener('focusout', hide);
      document.removeEventListener('pointerdown', hide, true);
      document.removeEventListener('keydown', key);
      window.removeEventListener('scroll', hide, true);
      window.removeEventListener('resize', hide);
    };
  }, []);
  if (!tip) return null;
  const { rect: r, side, text } = tip;
  const W = Math.min(280, window.innerWidth - 16);
  const style = side === 'right'
    ? { left: r.right + 8, top: r.top + r.height / 2, transform: 'translateY(-50%)' }
    : r.top > 48
      ? { left: Math.min(Math.max(8, r.left + r.width / 2), window.innerWidth - 8), top: r.top - 8, transform: 'translate(-50%, -100%)' }
      : { left: Math.min(Math.max(8, r.left + r.width / 2), window.innerWidth - 8), top: r.bottom + 8, transform: 'translateX(-50%)' };
  return createPortal(
    <div role="tooltip" className="app-tooltip" style={{ position: 'fixed', zIndex: 120, maxWidth: W, pointerEvents: 'none', ...style }}>{text}</div>,
    document.body
  );
}

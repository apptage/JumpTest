/* App shell — SalesHub / Miaro design system (design-system/DESIGN.md).
   Two chrome layers, never merged:
     1. AppSidebar  — white 16rem rail, collapsible to a 3rem icon rail (⌘/Ctrl+B),
                      uppercase section labels, 40px rounded-10 rows. Footer is EMPTY:
                      the account menu lives in the header.
     2. AppHeader   — 48px white bar: [sidebar trigger when collapsed] breadcrumb ·
                      global search · quick "New" (dark fill) · notifications ·
                      theme toggle · account menu.
   Page titles/filters stay on the page (PageHeaderBar in ui-kit), never here. */
import { useState, useEffect, useRef } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import * as api from '@/api.js';
import { card, inputStyle, ghostButton, primaryButton, Logo, Wordmark, Avatar, CountBadge } from '@/ui.jsx';
import { PageHeader, sideHead, useDebounced } from '@shared/ui-kit.jsx';
import { BrandLogo, BrandMark } from '@/brand.jsx';
import { Pill, KpiTile, Skeleton, SkeletonList } from '@shared/dashboard-kit.jsx';
import { requestPushPermission, pushConfigured } from '@/push/pushClient.js';
import { EDIT_WINDOW_HOURS, SLA_HOURS, BUG_SLA_DAYS } from '@/constants.js';
import {
  IconBell, IconBug, IconChart, IconCog, IconFolder, IconGrid,
  IconLayers, IconPackage, IconPlus, IconPower, IconSearch, IconSliders, IconTag, IconTree, IconUsers, IconUpload,
} from '@/icons.jsx';

/* ---- tiny inline icons the kit doesn't ship (Lucide-style, 1.75 stroke) ---- */
const svgProps = (size) => ({ width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.75, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true });
const IconPanel = ({ size = 16 }) => (<svg {...svgProps(size)}><rect x="3" y="4" width="18" height="16" rx="3" /><path d="M9 4v16" /></svg>);
const IconMenu = ({ size = 16 }) => (<svg {...svgProps(size)}><path d="M4 6h16M4 12h16M4 18h16" /></svg>);
const IconClose = ({ size = 16 }) => (<svg {...svgProps(size)}><path d="M18 6 6 18M6 6l12 12" /></svg>);
const IconSun = ({ size = 16 }) => (<svg {...svgProps(size)}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>);
const IconMoon = ({ size = 16 }) => (<svg {...svgProps(size)}><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" /></svg>);
const IconChevron = ({ size = 14, dir = 'down' }) => {
  const d = { down: 'm6 9 6 6 6-6', up: 'm6 15 6-6 6 6', right: 'm9 6 6 6-6 6', left: 'm15 6-6 6 6 6' }[dir];
  return <svg {...svgProps(size)} strokeWidth="2"><path d={d} /></svg>;
};

/* ---- nav model: sections in DS order; hidden items are omitted, not disabled ---- */
export const PAGE_TITLES = {
  dashboard: 'Dashboard', projecthub: 'Projects', releases: 'Releases',
  bugs: 'Bugs', wbs: 'WBS', analytics: 'Analytics', users: 'Users',
  teams: 'Teams', brands: 'Brands', settings: 'Settings',
};
const SECTION_OF = {
  dashboard: 'Main', projecthub: 'Work', releases: 'Work', bugs: 'Work', wbs: 'Work',
  analytics: 'Insights', users: 'Admin', teams: 'Admin', brands: 'Admin', settings: 'Account',
};
function navSections({ canManage, isAdmin, isPm = false }) {
  return [
    { label: 'Main', items: [
      { key: 'dashboard', label: 'Dashboard', Icon: IconGrid, show: true },
    ] },
    { label: 'Work', items: [
      { key: 'projecthub', label: 'Projects', Icon: IconFolder, show: true },
      { key: 'releases', label: 'Releases', Icon: IconPackage, show: true },
      { key: 'bugs', label: 'Bugs', Icon: IconBug, show: true },
      { key: 'wbs', label: 'WBS', Icon: IconTree, show: true },
    ] },
    { label: 'Insights', items: [
      { key: 'analytics', label: 'Analytics', Icon: IconChart, show: canManage },
    ] },
    { label: 'Admin', items: [
      { key: 'users', label: isAdmin || isPm ? 'Users' : 'Team', Icon: IconUsers, show: canManage }, // PMs: edit people's details
      { key: 'teams', label: 'Teams', Icon: IconLayers, show: isAdmin },
      { key: 'brands', label: 'Brands', Icon: IconTag, show: isAdmin },
    ] },
    { label: 'Account', items: [
      { key: 'settings', label: 'Settings', Icon: IconCog, show: true },
    ] },
  ]
    .map((s) => ({ ...s, items: s.items.filter((i) => i.show) }))
    .filter((s) => s.items.length);
}

/* How the sidebar shows at the current screen width:
     'full'   1024px and up — the full sidebar (the user can collapse it)
     'rail'   768–1023px    — icons only, labels in tooltips
     'drawer' under 768px   — hidden; the header's menu button slides it in */
const NAV_QUERIES = { drawer: '(max-width: 767px)', rail: '(max-width: 1023px)' };
function navModeNow() {
  if (typeof window === 'undefined' || !window.matchMedia) return 'full';
  if (window.matchMedia(NAV_QUERIES.drawer).matches) return 'drawer';
  if (window.matchMedia(NAV_QUERIES.rail).matches) return 'rail';
  return 'full';
}
export function useNavMode() {
  // start as 'full' on the server and the first client render (they must match,
  // or React reports a hydration error), then switch to the real mode
  const [mode, setMode] = useState('full');
  useEffect(() => {
    if (!window.matchMedia) return undefined;
    const qs = Object.values(NAV_QUERIES).map((q) => window.matchMedia(q));
    const on = () => setMode(navModeNow());
    qs.forEach((q) => (q.addEventListener ? q.addEventListener('change', on) : q.addListener(on)));
    on();
    return () => qs.forEach((q) => (q.removeEventListener ? q.removeEventListener('change', on) : q.removeListener(on)));
  }, []);
  return mode;
}

/* ================================================================== */
/* AppSidebar                                                          */
/* ================================================================== */
export function NavRail({ page, onNavigate, teamName, brand, canManage, isAdmin, isPm = false, collapsed: userCollapsed, onToggleCollapsed, mode = 'full', drawerOpen = false, onCloseDrawer }) {
  const sections = navSections({ canManage, isAdmin, isPm });
  const inDrawer = mode === 'drawer';
  // tablets always get the icon rail; the drawer always shows labels
  const collapsed = mode === 'rail' ? true : inDrawer ? false : userCollapsed;
  const navRef = useRef(null);
  // the drawer: focus moves into it, Esc closes it
  useEffect(() => {
    if (!inDrawer || !drawerOpen) return undefined;
    navRef.current?.querySelector('.nav-item.on, .nav-item')?.focus();
    const onKey = (e) => { if (e.key === 'Escape') onCloseDrawer?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [inDrawer, drawerOpen, onCloseDrawer]);
  if (inDrawer && !drawerOpen) return null;
  const go = (key) => { onNavigate(key); if (inDrawer) onCloseDrawer?.(); };
  const rail = (
    <nav
      ref={navRef}
      id="app-nav"
      className={`nav-rail${collapsed ? ' collapsed' : ''}${inDrawer ? ' drawer' : ''}`}
      aria-label="Primary"
      {...(inDrawer ? { role: 'dialog', 'aria-modal': 'true' } : {})}
    >
      {/* SidebarHeader: logo (mark when collapsed) + trigger (expanded only) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: collapsed ? '2px 0 10px' : '2px 6px 10px', justifyContent: collapsed ? 'center' : 'flex-start' }}>
        {/* mark only when collapsed, full "miaro VERIFY" lock-up when expanded */}
        {collapsed ? <Logo size={22} /> : <span className="nav-wordmark" style={{ flex: 1, color: 'var(--sidebar-foreground)', lineHeight: 0 }}><Wordmark size={24} /></span>}
        {inDrawer ? (
          <button className="hdr-icon-btn nav-trailing" onClick={onCloseDrawer} title="Close menu (Esc)" aria-label="Close menu">
            <IconClose />
          </button>
        ) : !collapsed && (
          <button className="hdr-icon-btn nav-trailing" onClick={onToggleCollapsed} title="Collapse sidebar (⌘B)" aria-label="Collapse sidebar">
            <IconPanel />
          </button>
        )}
      </div>

      {/* SidebarContent */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {sections.map((s) => (
          <div key={s.label}>
            <div className="nav-section">{s.label}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {s.items.map((it) => {
                const active = page === it.key;
                return (
                  <button
                    key={it.key}
                    onClick={() => go(it.key)}
                    className={active ? 'nav-item on' : 'nav-item'}
                    title={collapsed ? it.label : undefined}
                    aria-label={collapsed ? it.label : undefined}
                    aria-current={active ? 'page' : undefined}
                  >
                    <it.Icon size={19} />
                    <span className="nav-label" style={{ flex: 1, textAlign: 'left' }}>{it.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* SidebarFooter — the workspace's default brand + a quiet team label.
          The account menu stays in the header. */}
      <div style={{ marginTop: 'auto', padding: collapsed ? '14px 0 2px' : '14px 12px 2px', display: 'flex', flexDirection: 'column', gap: 8, alignItems: collapsed ? 'center' : 'flex-start' }}>
        {teamName && !collapsed && (
          <div className="nav-label" style={{ fontSize: 12, color: 'var(--rail-muted)' }}>
            Team · <span style={{ color: 'var(--rail-fg)', fontWeight: 600 }}>{teamName}</span>
          </div>
        )}
        {brand && (collapsed ? (
          <span title={`${brand.name} workspace`}><BrandMark brand={brand} size={20} /></span>
        ) : (
          <div title={`${brand.name} workspace`} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--rail-muted)' }}>Workspace</span>
            <BrandLogo brand={brand} size={18} />
          </div>
        ))}
      </div>
    </nav>
  );
  if (!inDrawer) return rail;
  return (
    <>
      <div className="nav-backdrop anim-overlay" onClick={onCloseDrawer} aria-hidden="true" />
      {rail}
    </>
  );
}

/* ================================================================== */
/* AppHeader                                                           */
/* ================================================================== */
export function AppHeader({
  user, page, canSubmit, canManage, canCreateProject = canManage, isAdmin, collapsed, onToggleCollapsed,
  navMode = 'full', menuOpen = false, onOpenMenu,
  unread, notifOpen, notifications, projects, releases, bugs, searchScopeIds = null, projectsById,
  onToggleNotif, onNotifClick, onMarkAllRead,
  onSubmitClick, onNewProject, onInviteUser, onOpenRelease, onOpenProject, onNavigate, onSettings, onSignOut,
}) {
  const [actionsOpen, setActionsOpen] = useState(false);
  const [acctOpen, setAcctOpen] = useState(false);
  const menuItem = {
    display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 12px', fontSize: 13, fontWeight: 500,
    color: 'var(--color-text-primary)', background: 'transparent', border: 'none', cursor: 'pointer',
    fontFamily: 'var(--font-body)', textAlign: 'left', borderRadius: 8,
  };
  const dropdown = { ...card, position: 'absolute', top: 40, right: 0, zIndex: 50, padding: 4, boxShadow: 'var(--shadow-lg)' };

  return (
    <header className="app-header">
      {/* phones: the menu button opens the sidebar drawer. Desktop: the expand
          trigger only when collapsed (expanded keeps it in the sidebar, never both).
          Tablets keep the icon rail, so neither. */}
      {navMode === 'drawer' ? (
        <button className="hdr-icon-btn" onClick={onOpenMenu} title="Menu" aria-label="Open menu" aria-expanded={menuOpen} aria-controls="app-nav">
          <IconMenu />
        </button>
      ) : navMode === 'full' && collapsed && (
        <button className="hdr-icon-btn" onClick={onToggleCollapsed} title="Expand sidebar (⌘B)" aria-label="Expand sidebar">
          <IconPanel />
        </button>
      )}

      {/* HeaderContextTitle — breadcrumb: section › page (muted) */}
      <nav className="crumb" aria-label="Breadcrumb">
        <span className="sect">{SECTION_OF[page] || 'Main'}</span>
        <span className="sep">/</span>
        <span className="page">{PAGE_TITLES[page] || 'Dashboard'}</span>
      </nav>

      {/* global search */}
      <div className="hdr-search" style={{ flex: 1, display: 'flex', justifyContent: 'center', minWidth: 120, padding: '0 12px' }}>
        <GlobalSearch projects={projects} releases={releases} bugs={bugs} scopeIds={searchScopeIds} projectsById={projectsById} onNavigate={onNavigate} onOpenProject={onOpenProject} onOpenRelease={onOpenRelease} />
      </div>

      {/* QuickActionMenu — dark fill */}
      {(canSubmit || canManage) && (
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setActionsOpen((v) => !v)}
            className="hdr-new"
            title="Create something new"
            aria-label="New"
            aria-haspopup="menu"
            aria-expanded={actionsOpen}
            style={{ ...primaryButton(false), minHeight: 32, padding: '0 12px', display: 'inline-flex', alignItems: 'center', gap: 8, borderRadius: 10, flexShrink: 0 }}
          >
            <IconPlus size={15} /> <span className="hdr-new-label">New</span>
          </button>
          {actionsOpen && (
            <>
              <div style={{ position: 'fixed', inset: 0, zIndex: 49 }} onClick={() => setActionsOpen(false)} />
              <div style={{ ...dropdown, width: 210 }}>
                {canSubmit && <button style={menuItem} onClick={() => { setActionsOpen(false); onSubmitClick(); }}><IconUpload size={15} /> Submit release</button>}
                {canCreateProject && <button style={menuItem} onClick={() => { setActionsOpen(false); onNewProject(); }}><IconFolder size={15} /> New project</button>}
                {canManage && user.role !== 'Project Manager' && <button style={menuItem} onClick={() => { setActionsOpen(false); onInviteUser(); }}><IconUsers size={15} /> {isAdmin ? 'Add user' : 'Manage team'}</button>}
              </div>
            </>
          )}
        </div>
      )}

      {/* NotificationNavLink */}
      <div style={{ position: 'relative' }}>
        <button className="hdr-icon-btn" onClick={onToggleNotif} title={unread ? `Notifications (${unread} unread)` : 'Notifications'} aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'} aria-haspopup="dialog" aria-expanded={!!notifOpen}>
          <IconBell size={16} />
          {unread > 0 && <span style={{ position: 'absolute', top: -5, right: -5 }}><CountBadge count={unread} /></span>}
        </button>
        {notifOpen && (
          <>
            <div style={{ position: 'fixed', inset: 0, zIndex: 49 }} onClick={onToggleNotif} />
            <NotificationsDropdown notifications={notifications} onNotifClick={onNotifClick} onMarkAllRead={onMarkAllRead} />
          </>
        )}
      </div>

      <HeaderThemeToggle />

      {/* HeaderAccountMenu */}
      <div style={{ position: 'relative' }}>
        <button
          onClick={() => setAcctOpen((v) => !v)}
          title={`Account · ${user.email || user.name}`}
          aria-label="Account menu"
          aria-haspopup="menu"
          aria-expanded={acctOpen}
          style={{ border: '1px solid var(--ink-border)', background: 'var(--card)', borderRadius: 999, padding: 2, cursor: 'pointer', display: 'inline-flex' }}
        >
          <Avatar name={user.name} size={26} />
        </button>
        {acctOpen && (
          <>
            <div style={{ position: 'fixed', inset: 0, zIndex: 49 }} onClick={() => setAcctOpen(false)} />
            <div style={{ ...dropdown, width: 230 }}>
              <div style={{ padding: '12px 12px 8px', borderBottom: '1px solid var(--color-border-primary)', marginBottom: 4 }}>
                <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.name}</div>
                <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{user.role}{user.email ? ` · ${user.email}` : ''}</div>
              </div>
              <button style={menuItem} onClick={() => { setAcctOpen(false); onSettings(); }}><IconCog size={15} /> Settings</button>
              <button style={{ ...menuItem, color: 'var(--danger)' }} onClick={() => { setAcctOpen(false); onSignOut(); }}><IconPower size={15} /> Sign out</button>
            </div>
          </>
        )}
      </div>
    </header>
  );
}

/* HeaderThemeToggle — flips `.dark` on <html>, persisted (root layout applies it
   before first paint so there is no flash). */
function HeaderThemeToggle() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));
  const toggle = () => {
    const next = !dark;
    document.documentElement.classList.toggle('dark', next);
    try { localStorage.setItem('gq-theme', next ? 'dark' : 'light'); } catch { /* ignore */ }
    setDark(next);
  };
  return (
    <button className="hdr-icon-btn" onClick={toggle} title={dark ? 'Switch to light theme' : 'Switch to dark theme'} aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}>
      {dark ? <IconSun /> : <IconMoon />}
    </button>
  );
}

/* ================================================================== */
/* Settings page                                                       */
/* ================================================================== */
export function SettingsPage({ user, team, onSignOut, reports }) {
  const [pushMsg, setPushMsg] = useState('');
  const [pushBusy, setPushBusy] = useState(false);
  async function enablePush() {
    setPushBusy(true);
    const { permission } = await requestPushPermission(user);
    setPushBusy(false);
    setPushMsg(
      permission === 'granted'
        ? 'Push notifications enabled on this device.'
        : permission === 'denied'
          ? 'Blocked — enable notifications for this site in your browser settings.'
          : 'Notifications are not available in this browser.'
    );
  }
  const row = (label, value) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--color-border-primary)' }}>
      <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 500 }}>{value}</span>
    </div>
  );
  return (
    <>
      <PageHeader title="Settings" subtitle="Your account, workspace and departmental reports" icon={<IconCog size={18} />} />
      {/* Reports (Settings → Reports) — passed in by the app so the shell stays data-free */}
      {reports}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
        <div style={{ ...card, padding: 16 }}>
          <div style={{ ...sideHead, marginBottom: 12 }}>Profile</div>
          {row('Name', user.name)}
          {row('Email', user.email)}
          {row(
            'Role',
            <Pill
              label={user.role}
              tone={{ Admin: 'info', 'Team Lead': 'warning', 'Project Manager': 'info', QA: 'success', Developer: 'neutral' }[user.role] || 'neutral'}
            />
          )}
          {row('Team', team ? team.name : '—')}
          <button style={{ ...ghostButton, color: 'var(--danger)', marginTop: 16 }} onClick={onSignOut}>Sign out</button>
        </div>
        {pushConfigured && (
          <div style={{ ...card, padding: 16 }}>
            <div style={{ ...sideHead, marginBottom: 12 }}>Notifications</div>
            <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.6, margin: '0 0 12px' }}>
              Get push notifications on this device for assignments, QA updates, comments and mentions — even when the tab is closed.
            </p>
            <button style={{ ...primaryButton(pushBusy) }} disabled={pushBusy} onClick={enablePush}>
              {pushBusy ? 'Enabling…' : 'Enable push on this device'}
            </button>
            {pushMsg && <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 12 }}>{pushMsg}</div>}
          </div>
        )}
        <div style={{ ...card, padding: 16 }}>
          <div style={{ ...sideHead, marginBottom: 12 }}>About SLAs</div>
          <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.6, margin: 0 }}>
            Releases pending more than {SLA_HOURS.qa_pending}h or in QA beyond {SLA_HOURS.qa_in_progress}h, and bugs open longer
            than {BUG_SLA_DAYS} days, are flagged with amber (approaching) or red (overdue) indicators across the app.
            Developers can edit or delete their own releases for {EDIT_WINDOW_HOURS}h after submission.
          </p>
        </div>
      </div>
    </>
  );
}

/* ================================================================== */
/* Global search (header) + notifications dropdown                    */
/* ================================================================== */
/* releases / bugs: the loaded lists (legacy mode). When they're not given, the
   search asks the database instead, a moment after you stop typing. */
function GlobalSearch({ projects, releases, bugs, scopeIds = null, projectsById, onNavigate, onOpenRelease, onOpenProject }) {
  const [q, setQ] = useState('');
  const [focused, setFocused] = useState(false);
  const [hi, setHi] = useState(0); // highlighted result, for the arrow keys
  const term = q.trim().toLowerCase();
  const remote = !releases || !bugs;
  const remoteTerm = useDebounced(term, 250);
  const nameIds = remoteTerm.length >= 2 ? projects.filter((p) => p.name.toLowerCase().includes(remoteTerm)).map((p) => p.id) : [];
  const searchQ = useQuery({
    queryKey: ['search', scopeIds ? [...scopeIds].sort().join(',') : 'all', remoteTerm],
    queryFn: () => api.searchReleasesAndBugs({ term: remoteTerm, projectIds: scopeIds, projectNameIds: nameIds }),
    enabled: remote && remoteTerm.length >= 2,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });
  const relList = remote ? (remoteTerm === term ? searchQ.data?.releases || [] : []) : releases;
  const bugList = remote ? (remoteTerm === term ? searchQ.data?.bugs || [] : []) : bugs;

  const results =
    term.length >= 2
      ? [
          ...relList
            .filter((r) => `v${r.version}`.toLowerCase().includes(term) || (projectsById[r.projectId]?.name || '').toLowerCase().includes(term))
            .slice(0, 5)
            .map((r) => ({ key: 'r' + r.id, type: 'release', id: r.id, label: `v${r.version} · ${projectsById[r.projectId]?.name || ''}`, sub: `${r.platform} release` })),
          ...bugList
            .filter((b) => b.title.toLowerCase().includes(term))
            .slice(0, 5)
            .map((b) => ({ key: 'b' + b.id, type: 'bug', id: b.releaseId, label: b.title, sub: 'Bug' })),
          ...projects
            .filter((p) => p.name.toLowerCase().includes(term))
            .slice(0, 4)
            .map((p) => ({ key: 'p' + p.id, type: 'project', id: p.id, label: p.name, sub: 'Project' })),
        ]
      : [];

  const open = focused && results.length > 0;
  function onKeyDown(e) {
    if (e.key === 'Escape') { setQ(''); e.currentTarget.blur(); return; }
    if (!open) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setHi((i) => (i + 1) % results.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((i) => (i - 1 + results.length) % results.length); }
    else if (e.key === 'Enter') { e.preventDefault(); pick(results[Math.min(hi, results.length - 1)]); }
  }
  function pick(r) {
    setQ('');
    setHi(0);
    setFocused(false);
    if (r.type === 'project') (onOpenProject ? onOpenProject(r.id) : onNavigate('projecthub'));
    else onOpenRelease(r.id);
  }

  return (
    <div style={{ position: 'relative', width: '100%', maxWidth: 440 }}>
      <span style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-tertiary)', pointerEvents: 'none', display: 'inline-flex' }}>
        <IconSearch size={15} />
      </span>
      <input
        type="search"
        value={q}
        placeholder="Search releases, bugs, projects…"
        aria-label="Search releases, bugs and projects"
        role="combobox"
        aria-expanded={open}
        aria-controls="global-search-results"
        aria-activedescendant={open ? `gs-${hi}` : undefined}
        onKeyDown={onKeyDown}
        onChange={(e) => { setQ(e.target.value); setHi(0); }}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 150)}
        style={{ ...inputStyle, paddingLeft: 34, minHeight: 32, padding: '0 12px 0 34px', borderRadius: 10, borderColor: 'var(--ink-border)' }}
      />
      {open && (
        <div id="global-search-results" role="listbox" aria-label="Search results" className="hdr-search-results" style={{ ...card, position: 'absolute', top: 38, left: 0, right: 0, zIndex: 40, padding: 4, maxHeight: 360, overflowY: 'auto', boxShadow: 'var(--shadow-lg)' }}>
          {results.map((r, i) => (
            <div
              key={r.key}
              id={`gs-${i}`}
              role="option"
              aria-selected={i === hi}
              onMouseDown={(e) => { e.preventDefault(); pick(r); }}
              onMouseEnter={() => setHi(i)}
              className="mgr-row"
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 13, background: i === hi ? 'var(--accent-soft)' : undefined }}
            >
              <span style={{ color: 'var(--color-text-tertiary)', display: 'inline-flex' }}>
                {r.type === 'bug' ? <IconBug size={15} /> : r.type === 'project' ? <IconFolder size={15} /> : <IconUpload size={15} />}
              </span>
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.label}</span>
              <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>{r.sub}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function NotificationsDropdown({ notifications, onNotifClick, onMarkAllRead }) {
  return (
    <div style={{ ...card, position: 'absolute', top: 40, right: 0, width: 320, maxHeight: 400, overflowY: 'auto', zIndex: 50, padding: 0, boxShadow: 'var(--shadow-lg)' }}>
      <div style={{ display: 'flex', alignItems: 'center', padding: '12px 12px', borderBottom: '1px solid var(--color-border-primary)' }}>
        <div style={{ fontSize: 13, fontWeight: 600, flex: 1 }}>Notifications</div>
        <button onClick={onMarkAllRead} style={{ ...ghostButton, padding: '4px 8px', minHeight: 0, fontSize: 12, border: 'none', background: 'transparent', color: 'var(--accent)' }}>
          Mark all read
        </button>
      </div>
      {notifications.length === 0 ? (
        <div style={{ padding: 24, fontSize: 12, color: 'var(--color-text-secondary)', textAlign: 'center' }}>No notifications.</div>
      ) : (
        notifications.map((n) => (
          <div
            key={n.id}
            onClick={() => onNotifClick(n)}
            className="mgr-row"
            style={{ padding: '12px 12px', borderBottom: '1px solid var(--color-border-primary)', cursor: 'pointer', background: n.read ? 'transparent' : 'var(--accent-soft)' }}
          >
            <div style={{ fontSize: 12, lineHeight: 1.4 }}>{n.message}</div>
            <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 4 }}>{new Date(n.createdAt).toLocaleString()}</div>
          </div>
        ))
      )}
    </div>
  );
}

export { IconChevron };


/* AppSkeleton — shown while signing in / loading the profile: the real layout
   (sidebar, header, KPI row, two panels) in placeholder form, so the page
   doesn't jump from a blank "Loading…" to the app. */
export function AppSkeleton({ mode = 'full' }) {
  const rail = mode !== 'drawer';
  const narrow = mode === 'rail';
  return (
    <div className="nav-layout" role="status" aria-label="Loading">
      {rail && (
        <div className={`nav-rail${narrow ? ' collapsed' : ''}`} aria-hidden="true">
          <div style={{ padding: narrow ? '4px 0 16px' : '4px 8px 16px' }}><Skeleton width={narrow ? 24 : 120} height={22} /></div>
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: narrow ? '8px 0' : '8px 12px', justifyContent: narrow ? 'center' : 'flex-start' }}>
              <Skeleton width={20} height={20} radius={6} />
              {!narrow && <Skeleton width={`${50 + (i % 3) * 12}%`} height={12} />}
            </div>
          ))}
        </div>
      )}
      <div className="nav-main">
        <div className="app-header" aria-hidden="true">
          <Skeleton width={120} height={14} />
          <span style={{ flex: 1, display: 'flex', justifyContent: 'center' }}><Skeleton width="min(440px, 50%)" height={32} radius={10} /></span>
          <Skeleton width={32} height={32} radius={10} />
          <Skeleton width={32} height={32} radius={999} />
        </div>
        <div className="page-area" aria-hidden="true" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ ...card, padding: 24, display: 'flex', alignItems: 'center', gap: 16 }}>
            <Skeleton width={44} height={44} radius={999} />
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}><Skeleton width="40%" height={20} /><Skeleton width="60%" height={12} /></div>
          </div>
          <div className="home-kpis">{Array.from({ length: 4 }, (_, i) => <KpiTile key={i} label={'\u00a0'} loading />)}</div>
          <div className="home-2col">
            {[0, 1].map((i) => (
              <section key={i} className="dash-panel" style={{ ...card, padding: 24, minWidth: 0 }}>
                <Skeleton width="45%" height={18} />
                <div style={{ marginTop: 16 }}><SkeletonList rows={5} height={52} /></div>
              </section>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

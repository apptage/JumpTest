/* App shell — SalesHub / Miaro design system (design-system/DESIGN.md).
   Two chrome layers, never merged:
     1. AppSidebar  — white 16rem rail, collapsible to a 3rem icon rail (⌘/Ctrl+B),
                      uppercase section labels, 40px rounded-10 rows. Footer is EMPTY:
                      the account menu lives in the header.
     2. AppHeader   — 48px white bar: [sidebar trigger when collapsed] breadcrumb ·
                      global search · quick "New" (dark fill) · notifications ·
                      theme toggle · account menu.
   Page titles/filters stay on the page (PageHeaderBar in ui-kit), never here. */
import { useState, useEffect } from 'react';
import { card, inputStyle, ghostButton, primaryButton, Logo, Avatar, CountBadge } from '@/ui.jsx';
import { PageHeader, sideHead } from '@shared/ui-kit.jsx';
import { Pill } from '@shared/dashboard-kit.jsx';
import { requestPushPermission, pushConfigured } from '@/push/pushClient.js';
import { EDIT_WINDOW_HOURS, SLA_HOURS, BUG_SLA_DAYS } from '@/constants.js';
import {
  IconBell, IconBug, IconChart, IconCog, IconFolder, IconGrid,
  IconLayers, IconPackage, IconPlus, IconPower, IconSearch, IconSliders, IconTree, IconUsers, IconUpload,
} from '@/icons.jsx';

/* ---- tiny inline icons the kit doesn't ship (Lucide-style, 1.75 stroke) ---- */
const svgProps = (size) => ({ width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.75, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true });
const IconPanel = ({ size = 16 }) => (<svg {...svgProps(size)}><rect x="3" y="4" width="18" height="16" rx="3" /><path d="M9 4v16" /></svg>);
const IconSun = ({ size = 16 }) => (<svg {...svgProps(size)}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>);
const IconMoon = ({ size = 16 }) => (<svg {...svgProps(size)}><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" /></svg>);
const IconChevron = ({ size = 14, dir = 'down' }) => {
  const d = { down: 'm6 9 6 6 6-6', up: 'm6 15 6-6 6 6', right: 'm9 6 6 6-6 6', left: 'm15 6-6 6 6 6' }[dir];
  return <svg {...svgProps(size)} strokeWidth="2"><path d={d} /></svg>;
};

/* ---- nav model: sections in DS order; hidden items are omitted, not disabled ---- */
export const PAGE_TITLES = {
  dashboard: 'Dashboard', projecthub: 'Projects', releases: 'Releases',
  bugs: 'Bugs', wbs: 'WBS', projects: 'Manage Projects', analytics: 'Analytics', users: 'Users',
  teams: 'Teams', settings: 'Settings',
};
const SECTION_OF = {
  dashboard: 'Main', projecthub: 'Work', releases: 'Work', bugs: 'Work', wbs: 'Work',
  analytics: 'Insights', projects: 'Admin', users: 'Admin', teams: 'Admin', settings: 'Account',
};
function navSections({ canManage, isAdmin }) {
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
      { key: 'projects', label: 'Manage Projects', Icon: IconSliders, show: canManage },
      { key: 'users', label: isAdmin ? 'Users' : 'Team', Icon: IconUsers, show: canManage },
      { key: 'teams', label: 'Teams', Icon: IconLayers, show: isAdmin },
    ] },
    { label: 'Account', items: [
      { key: 'settings', label: 'Settings', Icon: IconCog, show: true },
    ] },
  ]
    .map((s) => ({ ...s, items: s.items.filter((i) => i.show) }))
    .filter((s) => s.items.length);
}

/* ================================================================== */
/* AppSidebar                                                          */
/* ================================================================== */
export function NavRail({ page, onNavigate, teamName, canManage, isAdmin, collapsed, onToggleCollapsed }) {
  const sections = navSections({ canManage, isAdmin });
  return (
    <nav className={`nav-rail${collapsed ? ' collapsed' : ''}`} aria-label="Primary">
      {/* SidebarHeader: logo (mark when collapsed) + trigger (expanded only) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: collapsed ? '2px 0 10px' : '2px 6px 10px', justifyContent: collapsed ? 'center' : 'flex-start' }}>
        <Logo size={28} />
        <span className="nav-wordmark" style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15.5, color: 'var(--sidebar-foreground)', flex: 1, letterSpacing: '-0.01em' }}>
          JumpTest
        </span>
        {!collapsed && (
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
                    onClick={() => onNavigate(it.key)}
                    className={active ? 'nav-item on' : 'nav-item'}
                    title={collapsed ? it.label : undefined}
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

      {/* SidebarFooter — empty by design (account menu is in the header); a
          quiet team label when expanded is the only thing here. */}
      {teamName && !collapsed && (
        <div className="nav-label" style={{ marginTop: 'auto', padding: '14px 12px 2px', fontSize: 11, color: 'var(--rail-muted)' }}>
          Team · <span style={{ color: 'var(--rail-fg)', fontWeight: 600 }}>{teamName}</span>
        </div>
      )}
    </nav>
  );
}

/* ================================================================== */
/* AppHeader                                                           */
/* ================================================================== */
export function AppHeader({
  user, page, canSubmit, canManage, isAdmin, collapsed, onToggleCollapsed,
  unread, notifOpen, notifications, projects, releases, bugs, projectsById,
  onToggleNotif, onNotifClick, onMarkAllRead,
  onSubmitClick, onNewProject, onInviteUser, onOpenRelease, onNavigate, onSettings, onSignOut,
}) {
  const [actionsOpen, setActionsOpen] = useState(false);
  const [acctOpen, setAcctOpen] = useState(false);
  const menuItem = {
    display: 'flex', alignItems: 'center', gap: 9, width: '100%', padding: '9px 11px', fontSize: 13, fontWeight: 500,
    color: 'var(--color-text-primary)', background: 'transparent', border: 'none', cursor: 'pointer',
    fontFamily: 'var(--font-body)', textAlign: 'left', borderRadius: 8,
  };
  const dropdown = { ...card, position: 'absolute', top: 40, right: 0, zIndex: 50, padding: 4, boxShadow: 'var(--shadow-lg)' };

  return (
    <header className="app-header">
      {/* trigger only when collapsed — expanded desktop keeps it in the sidebar (never both) */}
      {collapsed && (
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
      <div style={{ flex: 1, display: 'flex', justifyContent: 'center', minWidth: 120, padding: '0 12px' }}>
        <GlobalSearch projects={projects} releases={releases} bugs={bugs} projectsById={projectsById} onNavigate={onNavigate} onOpenRelease={onOpenRelease} />
      </div>

      {/* QuickActionMenu — dark fill */}
      {(canSubmit || canManage) && (
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setActionsOpen((v) => !v)}
            style={{ ...primaryButton(false), minHeight: 32, padding: '0 12px', display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: 10 }}
          >
            <IconPlus size={15} /> New
          </button>
          {actionsOpen && (
            <>
              <div style={{ position: 'fixed', inset: 0, zIndex: 49 }} onClick={() => setActionsOpen(false)} />
              <div style={{ ...dropdown, width: 210 }}>
                {canSubmit && <button style={menuItem} onClick={() => { setActionsOpen(false); onSubmitClick(); }}><IconUpload size={15} /> Submit release</button>}
                {canManage && <button style={menuItem} onClick={() => { setActionsOpen(false); onNewProject(); }}><IconFolder size={15} /> New project</button>}
                {canManage && <button style={menuItem} onClick={() => { setActionsOpen(false); onInviteUser(); }}><IconUsers size={15} /> {isAdmin ? 'Add user' : 'Manage team'}</button>}
              </div>
            </>
          )}
        </div>
      )}

      {/* NotificationNavLink */}
      <div style={{ position: 'relative' }}>
        <button className="hdr-icon-btn" onClick={onToggleNotif} title="Notifications" aria-label="Notifications">
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
          title={user.email}
          aria-label="Account"
          style={{ border: '1px solid var(--ink-border)', background: 'var(--card)', borderRadius: 999, padding: 2, cursor: 'pointer', display: 'inline-flex' }}
        >
          <Avatar name={user.name} size={26} />
        </button>
        {acctOpen && (
          <>
            <div style={{ position: 'fixed', inset: 0, zIndex: 49 }} onClick={() => setAcctOpen(false)} />
            <div style={{ ...dropdown, width: 230 }}>
              <div style={{ padding: '10px 11px 8px', borderBottom: '1px solid var(--color-border-primary)', marginBottom: 4 }}>
                <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.name}</div>
                <div style={{ fontSize: 11.5, color: 'var(--color-text-secondary)' }}>{user.role}{user.email ? ` · ${user.email}` : ''}</div>
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

/* HeaderThemeToggle — flips `.dark` on <html>, persisted (index.html applies it
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
    <button className="hdr-icon-btn" onClick={toggle} title={dark ? 'Switch to light' : 'Switch to dark'} aria-label="Toggle theme">
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
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0', borderBottom: '1px solid var(--color-border-primary)' }}>
      <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 500 }}>{value}</span>
    </div>
  );
  return (
    <>
      <PageHeader title="Settings" subtitle="Your account, workspace and departmental reports" icon={<IconCog size={18} />} />
      {/* Reports (Settings → Reports) — passed in by the app so the shell stays data-free */}
      {reports}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 }}>
        <div style={{ ...card, padding: 18 }}>
          <div style={{ ...sideHead, marginBottom: 10 }}>Profile</div>
          {row('Name', user.name)}
          {row('Email', user.email)}
          {row(
            'Role',
            <Pill
              label={user.role}
              tone={{ Admin: 'info', 'Team Lead': 'warning', QA: 'success', Developer: 'neutral' }[user.role] || 'neutral'}
            />
          )}
          {row('Team', team ? team.name : '—')}
          <button style={{ ...ghostButton, color: 'var(--danger)', marginTop: 14 }} onClick={onSignOut}>Sign out</button>
        </div>
        {pushConfigured && (
          <div style={{ ...card, padding: 18 }}>
            <div style={{ ...sideHead, marginBottom: 10 }}>Notifications</div>
            <p style={{ fontSize: 12.5, color: 'var(--color-text-secondary)', lineHeight: 1.6, margin: '0 0 12px' }}>
              Get push notifications on this device for assignments, QA updates, comments and mentions — even when the tab is closed.
            </p>
            <button style={{ ...primaryButton(pushBusy) }} disabled={pushBusy} onClick={enablePush}>
              {pushBusy ? 'Enabling…' : 'Enable push on this device'}
            </button>
            {pushMsg && <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 10 }}>{pushMsg}</div>}
          </div>
        )}
        <div style={{ ...card, padding: 18 }}>
          <div style={{ ...sideHead, marginBottom: 10 }}>About SLAs</div>
          <p style={{ fontSize: 12.5, color: 'var(--color-text-secondary)', lineHeight: 1.6, margin: 0 }}>
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
function GlobalSearch({ projects, releases, bugs, projectsById, onNavigate, onOpenRelease }) {
  const [q, setQ] = useState('');
  const [focused, setFocused] = useState(false);
  const term = q.trim().toLowerCase();

  const results =
    term.length >= 2
      ? [
          ...releases
            .filter((r) => `v${r.version}`.toLowerCase().includes(term) || (projectsById[r.projectId]?.name || '').toLowerCase().includes(term))
            .slice(0, 5)
            .map((r) => ({ key: 'r' + r.id, type: 'release', id: r.id, label: `v${r.version} · ${projectsById[r.projectId]?.name || ''}`, sub: `${r.platform} release` })),
          ...bugs
            .filter((b) => b.title.toLowerCase().includes(term))
            .slice(0, 5)
            .map((b) => ({ key: 'b' + b.id, type: 'bug', id: b.releaseId, label: b.title, sub: 'Bug' })),
          ...projects
            .filter((p) => p.name.toLowerCase().includes(term))
            .slice(0, 4)
            .map((p) => ({ key: 'p' + p.id, type: 'project', id: p.id, label: p.name, sub: 'Project' })),
        ]
      : [];

  function pick(r) {
    setQ('');
    setFocused(false);
    if (r.type === 'project') onNavigate('projects');
    else onOpenRelease(r.id);
  }

  return (
    <div style={{ position: 'relative', width: '100%', maxWidth: 440 }}>
      <span style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-tertiary)', pointerEvents: 'none', display: 'inline-flex' }}>
        <IconSearch size={15} />
      </span>
      <input
        value={q}
        placeholder="Search releases, bugs, projects…"
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 150)}
        style={{ ...inputStyle, paddingLeft: 34, minHeight: 32, padding: '0 12px 0 34px', borderRadius: 10, borderColor: 'var(--ink-border)' }}
      />
      {focused && results.length > 0 && (
        <div style={{ ...card, position: 'absolute', top: 38, left: 0, right: 0, zIndex: 40, padding: 4, maxHeight: 360, overflowY: 'auto', boxShadow: 'var(--shadow-lg)' }}>
          {results.map((r) => (
            <div
              key={r.key}
              onMouseDown={(e) => { e.preventDefault(); pick(r); }}
              className="mgr-row"
              style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 10px', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}
            >
              <span style={{ color: 'var(--color-text-tertiary)', display: 'inline-flex' }}>
                {r.type === 'bug' ? <IconBug size={15} /> : r.type === 'project' ? <IconFolder size={15} /> : <IconUpload size={15} />}
              </span>
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.label}</span>
              <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{r.sub}</span>
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
      <div style={{ display: 'flex', alignItems: 'center', padding: '10px 12px', borderBottom: '1px solid var(--color-border-primary)' }}>
        <div style={{ fontSize: 13, fontWeight: 600, flex: 1 }}>Notifications</div>
        <button onClick={onMarkAllRead} style={{ ...ghostButton, padding: '4px 8px', minHeight: 0, fontSize: 11, border: 'none', background: 'transparent', color: 'var(--accent)' }}>
          Mark all read
        </button>
      </div>
      {notifications.length === 0 ? (
        <div style={{ padding: 20, fontSize: 12, color: 'var(--color-text-secondary)', textAlign: 'center' }}>No notifications.</div>
      ) : (
        notifications.map((n) => (
          <div
            key={n.id}
            onClick={() => onNotifClick(n)}
            className="mgr-row"
            style={{ padding: '10px 12px', borderBottom: '1px solid var(--color-border-primary)', cursor: 'pointer', background: n.read ? 'transparent' : 'var(--accent-soft)' }}
          >
            <div style={{ fontSize: 12, lineHeight: 1.4 }}>{n.message}</div>
            <div style={{ fontSize: 10, color: 'var(--color-text-secondary)', marginTop: 3 }}>{new Date(n.createdAt).toLocaleString()}</div>
          </div>
        ))
      )}
    </div>
  );
}

export { IconChevron };

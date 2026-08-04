/* App shell — navigation rail, header (with global search + notifications),
   and the settings page. Moved verbatim from ReleaseTracker.jsx (Phase 0). */
import { useState } from 'react';
import { card, inputStyle, ghostButton, primaryButton, Logo, Avatar, CountBadge } from '@/ui.jsx';
import { PageHeader, sideHead, relativeTime, greeting } from '@shared/ui-kit.jsx';
import { Pill } from '@shared/dashboard-kit.jsx';
import { requestPushPermission, pushConfigured } from '@/push/pushClient.js';
import { EDIT_WINDOW_HOURS, SLA_HOURS, BUG_SLA_DAYS } from '@/constants.js';
import {
  IconBell, IconBug, IconChart, IconCog, IconFolder, IconGrid,
  IconLayers, IconPackage, IconPlus, IconPower, IconSearch, IconSliders, IconTree, IconUsers, IconUpload,
} from '@/icons.jsx';

function Chevron({ size = 14, dir = 'down' }) {
  const d = { down: 'm6 9 6 6 6-6', up: 'm6 15 6-6 6 6', right: 'm9 6 6 6-6 6', left: 'm15 6-6 6 6 6' }[dir];
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

/* The dark navigation rail is the app's ONLY chrome now — it carries the brand,
   the New-actions menu, the primary nav, notifications (with unread badge) and
   the user/profile menu pinned to the bottom. No top header bar. */
export function NavRail({
  page, onNavigate, teamName, canManage, isAdmin, isExec,
  user, canSubmit, unread, notifications, notifOpen,
  onToggleNotif, onNotifClick, onMarkAllRead,
  onSubmitClick, onNewProject, onInviteUser, onSettings, onSignOut,
}) {
  const [actionsOpen, setActionsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const items = [
    // Manager's executive home; also a first-class item for Admin (bridge)
    { key: 'command-center', label: 'Command Center', Icon: IconSliders, show: isExec || isAdmin },
    { key: 'dashboard', label: 'Dashboard', Icon: IconGrid, show: !isExec },
    { key: 'projecthub', label: 'Projects', Icon: IconFolder, show: !isExec },
    { key: 'releases', label: 'Releases', Icon: IconPackage, show: !isExec },
    { key: 'bugs', label: 'Bugs', Icon: IconBug, show: !isExec },
    { key: 'wbs', label: 'WBS', Icon: IconTree, show: !isExec },
    { key: 'projects', label: 'Manage Projects', Icon: IconSliders, show: canManage },
    { key: 'analytics', label: 'Analytics', Icon: IconChart, show: canManage },
    { key: 'users', label: isAdmin ? 'Users' : 'Team', Icon: IconUsers, show: canManage },
    { key: 'teams', label: 'Teams', Icon: IconLayers, show: isAdmin },
    { key: 'settings', label: 'Settings', Icon: IconCog, show: true },
  ].filter((i) => i.show);

  const menuItem = {
    display: 'flex', alignItems: 'center', gap: 9, width: '100%', padding: '9px 11px',
    fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary)', background: 'transparent',
    border: 'none', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', borderRadius: 6,
  };

  return (
    <nav className="nav-rail">
      {/* brand */}
      <div style={{ padding: '2px 6px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          width: 34, height: 34, borderRadius: 10, background: 'var(--brand-gradient)',
          display: 'grid', placeItems: 'center', color: '#fff', fontFamily: 'var(--font-display)',
          fontWeight: 800, fontSize: 17, boxShadow: '0 2px 8px rgba(108,99,255,0.45)', flexShrink: 0,
        }}>J</div>
        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 16, color: 'var(--rail-fg-strong)', flex: 1 }}>
          JumpTest
        </span>
      </div>

      {/* New — quick-create menu (hidden for the read-only Manager) */}
      {!isExec && (canSubmit || canManage) && (
        <div style={{ position: 'relative', padding: '0 4px 12px' }}>
          <button
            onClick={() => setActionsOpen((v) => !v)}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, width: '100%',
              padding: '10px 12px', fontSize: 13, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer',
              color: '#fff', background: 'var(--brand)', border: 'none', borderRadius: 10,
              boxShadow: '0 2px 10px rgba(108,99,255,0.4)',
            }}
          >
            <IconPlus size={15} /> New
          </button>
          {actionsOpen && (
            <>
              <div style={{ position: 'fixed', inset: 0, zIndex: 49 }} onClick={() => setActionsOpen(false)} />
              <div style={{ ...card, position: 'absolute', top: 46, left: 4, right: 4, zIndex: 50, padding: 4, boxShadow: 'var(--shadow-md)' }}>
                {canSubmit && (
                  <button style={menuItem} onClick={() => { setActionsOpen(false); onSubmitClick(); }}>
                    <IconUpload size={15} /> Submit release
                  </button>
                )}
                {canManage && (
                  <button style={menuItem} onClick={() => { setActionsOpen(false); onNewProject(); }}>
                    <IconFolder size={15} /> New project
                  </button>
                )}
                {canManage && (
                  <button style={menuItem} onClick={() => { setActionsOpen(false); onInviteUser(); }}>
                    <IconUsers size={15} /> {isAdmin ? 'Add user' : 'Manage team'}
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* primary nav */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {items.map((it) => {
          const active = page === it.key;
          return (
            <button key={it.key} onClick={() => onNavigate(it.key)} className={active ? 'nav-item on' : 'nav-item'}>
              <it.Icon size={17} />
              <span style={{ flex: 1, textAlign: 'left' }}>{it.label}</span>
            </button>
          );
        })}

        {/* notifications — nav-item styled, with the unread badge on the right */}
        <div style={{ position: 'relative' }}>
          <button onClick={onToggleNotif} className={notifOpen ? 'nav-item on' : 'nav-item'}>
            <IconBell size={17} />
            <span style={{ flex: 1, textAlign: 'left' }}>Notifications</span>
            {unread > 0 && <CountBadge count={unread} />}
          </button>
          {notifOpen && (
            <>
              <div style={{ position: 'fixed', inset: 0, zIndex: 49 }} onClick={onToggleNotif} />
              <div style={{ position: 'fixed', left: 14, bottom: 84, width: 300, zIndex: 50 }}>
                <NotificationsDropdown
                  notifications={notifications}
                  onNotifClick={onNotifClick}
                  onMarkAllRead={onMarkAllRead}
                />
              </div>
            </>
          )}
        </div>
      </div>

      {/* profile — pinned to the bottom, opens Settings / Sign out */}
      <div style={{ marginTop: 'auto', position: 'relative', paddingTop: 12 }}>
        {teamName && (
          <div style={{ fontSize: 11, color: 'var(--rail-muted)', padding: '0 10px 10px' }}>
            Team · <span style={{ color: 'var(--rail-fg)', fontWeight: 600 }}>{teamName}</span>
          </div>
        )}
        <button
          onClick={() => setProfileOpen((v) => !v)}
          style={{
            display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '8px 8px',
            background: 'var(--rail-hover)', border: '1px solid var(--rail-border)', borderRadius: 12,
            cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          <Avatar name={user.name} size={30} />
          <div style={{ flex: 1, textAlign: 'left', lineHeight: 1.2, overflow: 'hidden' }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--rail-fg-strong)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {user.name}
            </div>
            <div style={{ fontSize: 10.5, color: 'var(--rail-muted)' }}>{user.role}</div>
          </div>
          <span style={{ color: 'var(--rail-muted)' }}><Chevron dir={profileOpen ? 'down' : 'up'} /></span>
        </button>
        {profileOpen && (
          <>
            <div style={{ position: 'fixed', inset: 0, zIndex: 49 }} onClick={() => setProfileOpen(false)} />
            <div style={{ ...card, position: 'absolute', bottom: 56, left: 0, right: 0, zIndex: 50, padding: 4, boxShadow: 'var(--shadow-md)' }}>
              <button style={menuItem} onClick={() => { setProfileOpen(false); onSettings(); }}>
                <IconCog size={15} /> Settings
              </button>
              <button style={{ ...menuItem, color: '#dc2626' }} onClick={() => { setProfileOpen(false); onSignOut(); }}>
                <IconPower size={15} /> Sign out
              </button>
            </div>
          </>
        )}
      </div>
    </nav>
  );
}

export function SettingsPage({ user, team, onSignOut }) {
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
      <PageHeader title="Settings" subtitle="Your account and workspace" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 }}>
        <div style={{ ...card, padding: 18 }}>
          <div style={{ ...sideHead, marginBottom: 10 }}>Profile</div>
          {row('Name', user.name)}
          {row('Email', user.email)}
          {row(
            'Role',
            <Pill
              label={user.role}
              tone={
                { Admin: 'info', 'Team Lead': 'warning', QA: 'success', Developer: 'neutral' }[user.role] ||
                'neutral'
              }
            />
          )}
          {row('Team', team ? team.name : '—')}
          <button
            style={{ ...ghostButton, color: '#dc2626', borderColor: '#dc262644', marginTop: 14 }}
            onClick={onSignOut}
          >
            Sign out
          </button>
        </div>
        {pushConfigured && (
          <div style={{ ...card, padding: 18 }}>
            <div style={{ ...sideHead, marginBottom: 10 }}>Notifications</div>
            <p style={{ fontSize: 12.5, color: 'var(--color-text-secondary)', lineHeight: 1.6, margin: '0 0 12px' }}>
              Get push notifications on this device for assignments, QA updates, comments and
              mentions — even when the tab is closed.
            </p>
            <button style={{ ...primaryButton(pushBusy) }} disabled={pushBusy} onClick={enablePush}>
              {pushBusy ? 'Enabling…' : 'Enable push on this device'}
            </button>
            {pushMsg && (
              <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 10 }}>{pushMsg}</div>
            )}
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
/* Header + notifications                                             */
/* ================================================================== */

const PAGE_TITLES = {
  'command-center': 'Command Center',
  dashboard: 'Dashboard',
  projecthub: 'Projects',
  releases: 'Releases',
  bugs: 'Bugs',
  wbs: 'WBS',
  projects: 'Manage Projects',
  analytics: 'Analytics',
  users: 'Users',
  teams: 'Teams',
  settings: 'Settings',
};

export function Header({
  user,
  page,
  canSubmit,
  canManage,
  isAdmin,
  isExec,
  unread,
  notifOpen,
  notifications,
  projects,
  releases,
  bugs,
  projectsById,
  onToggleNotif,
  onNotifClick,
  onMarkAllRead,
  onSubmitClick,
  onNewProject,
  onInviteUser,
  onOpenRelease,
  onNavigate,
  onSettings,
  onSignOut,
}) {
  const [actionsOpen, setActionsOpen] = useState(false);
  const inkGhost = {
    padding: '8px 13px',
    fontSize: 13,
    fontWeight: 500,
    color: 'var(--color-text-primary)',
    background: 'var(--color-background-primary)',
    border: '1px solid var(--color-border-tertiary)',
    borderRadius: 'var(--r-input)',
    cursor: 'pointer',
    fontFamily: 'inherit',
  };
  const menuItem = {
    display: 'flex',
    alignItems: 'center',
    gap: 9,
    width: '100%',
    padding: '9px 11px',
    fontSize: 13,
    fontWeight: 500,
    color: 'var(--color-text-primary)',
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    fontFamily: 'inherit',
    textAlign: 'left',
    borderRadius: 6,
  };
  return (
    <header
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 20,
        background: 'var(--ink)',
        borderBottom: '1px solid var(--ink-border)',
      }}
    >
      <div
        style={{
          margin: '0 auto',
          padding: '11px 22px',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          flexWrap: 'wrap',
        }}
      >
        {/* breadcrumb */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13.5 }}>
          <span style={{ color: 'var(--color-text-tertiary)', fontWeight: 500 }}>JumpTest</span>
          <span style={{ color: 'var(--color-text-tertiary)' }}>/</span>
          <span style={{ fontWeight: 700 }}>{PAGE_TITLES[page] || 'Dashboard'}</span>
        </div>

        {/* global search — hidden for Manager (would leak release/bug detail) */}
        {isExec ? (
          <div style={{ flex: 1 }} />
        ) : (
          <div style={{ flex: 1, display: 'flex', justifyContent: 'center', minWidth: 180 }}>
            <GlobalSearch
              projects={projects}
              releases={releases}
              bugs={bugs}
              projectsById={projectsById}
              onNavigate={onNavigate}
              onOpenRelease={onOpenRelease}
            />
          </div>
        )}

        {/* bell */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={onToggleNotif}
            style={{ ...inkGhost, padding: 9, position: 'relative', display: 'inline-flex' }}
            title="Notifications"
          >
            <IconBell size={17} />
            {unread > 0 && (
              <span style={{ position: 'absolute', top: -5, right: -5 }}>
                <CountBadge count={unread} />
              </span>
            )}
          </button>
          {notifOpen && (
            <NotificationsDropdown
              notifications={notifications}
              onNotifClick={onNotifClick}
              onMarkAllRead={onMarkAllRead}
            />
          )}
        </div>

        {/* quick actions — Manager has no create actions */}
        {!isExec && (
        <div style={{ position: 'relative' }}>
          <button
            style={{ ...primaryButton(false), display: 'inline-flex', alignItems: 'center', gap: 6 }}
            onClick={() => setActionsOpen((v) => !v)}
          >
            <IconPlus size={15} />
            New
          </button>
          {actionsOpen && (
            <>
              <div style={{ position: 'fixed', inset: 0, zIndex: 39 }} onClick={() => setActionsOpen(false)} />
              <div
                style={{
                  ...card,
                  position: 'absolute',
                  top: 42,
                  right: 0,
                  width: 210,
                  zIndex: 40,
                  padding: 4,
                  boxShadow: 'var(--shadow-md)',
                }}
              >
                {canSubmit && (
                  <button
                    style={menuItem}
                    onClick={() => {
                      setActionsOpen(false);
                      onSubmitClick();
                    }}
                  >
                    <IconUpload size={15} /> Submit release
                  </button>
                )}
                {canManage && (
                  <button
                    style={menuItem}
                    onClick={() => {
                      setActionsOpen(false);
                      onNewProject();
                    }}
                  >
                    <IconFolder size={15} /> New project
                  </button>
                )}
                {canManage && (
                  <button
                    style={menuItem}
                    onClick={() => {
                      setActionsOpen(false);
                      onInviteUser();
                    }}
                  >
                    <IconUsers size={15} /> {isAdmin ? 'Add user' : 'Manage team'}
                  </button>
                )}
              </div>
            </>
          )}
        </div>
        )}

        {/* user chip */}
        <div
          onClick={onSettings}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '5px 10px 5px 6px',
            background: 'var(--color-background-secondary)',
            border: '1px solid var(--color-border-tertiary)',
            borderRadius: 999,
            cursor: 'pointer',
          }}
        >
          <Avatar name={user.name} size={26} />
          <div style={{ lineHeight: 1.15 }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--color-text-primary)' }}>
              {user.name}
            </div>
            <div style={{ fontSize: 10.5, color: 'var(--color-text-secondary)' }}>{user.role}</div>
          </div>
        </div>
        <button
          style={{ ...inkGhost, padding: 9, display: 'inline-flex' }}
          onClick={onSignOut}
          title="Sign out"
        >
          <IconPower size={17} />
        </button>
      </div>
    </header>
  );
}

function GlobalSearch({ projects, releases, bugs, projectsById, onNavigate, onOpenRelease }) {
  const [q, setQ] = useState('');
  const [focused, setFocused] = useState(false);
  const term = q.trim().toLowerCase();

  const results =
    term.length >= 2
      ? [
          ...releases
            .filter(
              (r) =>
                `v${r.version}`.toLowerCase().includes(term) ||
                (projectsById[r.projectId]?.name || '').toLowerCase().includes(term)
            )
            .slice(0, 5)
            .map((r) => ({
              key: 'r' + r.id,
              type: 'release',
              id: r.id,
              label: `v${r.version} · ${projectsById[r.projectId]?.name || ''}`,
              sub: `${r.platform} release`,
            })),
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
      <span
        style={{
          position: 'absolute',
          left: 11,
          top: '50%',
          transform: 'translateY(-50%)',
          color: 'var(--color-text-tertiary)',
          pointerEvents: 'none',
        }}
      >
        <IconSearch size={15} />
      </span>
      <input
        value={q}
        placeholder="Search releases, bugs, projects…"
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 150)}
        style={{ ...inputStyle, paddingLeft: 34, height: 36 }}
      />
      {focused && results.length > 0 && (
        <div
          style={{
            ...card,
            position: 'absolute',
            top: 42,
            left: 0,
            right: 0,
            zIndex: 40,
            padding: 4,
            maxHeight: 360,
            overflowY: 'auto',
            boxShadow: 'var(--shadow-md)',
          }}
        >
          {results.map((r) => (
            <div
              key={r.key}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(r);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 9,
                padding: '8px 10px',
                borderRadius: 6,
                cursor: 'pointer',
                fontSize: 13,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-background-secondary)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <span style={{ color: 'var(--color-text-tertiary)', display: 'inline-flex' }}>
                {r.type === 'bug' ? (
                  <IconBug size={15} />
                ) : r.type === 'project' ? (
                  <IconFolder size={15} />
                ) : (
                  <IconUpload size={15} />
                )}
              </span>
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {r.label}
              </span>
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
    <div
      style={{
        ...card,
        position: 'absolute',
        top: 44,
        right: 0,
        width: 320,
        maxHeight: 400,
        overflowY: 'auto',
        zIndex: 40,
        padding: 0,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '10px 12px',
          borderBottom: '0.5px solid var(--color-border-primary)',
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 500, flex: 1 }}>
          Notifications
        </div>
        <button
          onClick={onMarkAllRead}
          style={{
            ...ghostButton,
            padding: '4px 8px',
            fontSize: 11,
            border: 'none',
            background: 'transparent',
            color: 'var(--brand)',
          }}
        >
          Mark all read
        </button>
      </div>
      {notifications.length === 0 ? (
        <div
          style={{
            padding: 20,
            fontSize: 12,
            color: 'var(--color-text-secondary)',
            textAlign: 'center',
          }}
        >
          No notifications.
        </div>
      ) : (
        notifications.map((n) => (
          <div
            key={n.id}
            onClick={() => onNotifClick(n)}
            style={{
              padding: '10px 12px',
              borderBottom: '0.5px solid var(--color-border-primary)',
              cursor: 'pointer',
              background: n.read
                ? 'transparent'
                : 'var(--color-background-secondary)',
            }}
          >
            <div style={{ fontSize: 12, lineHeight: 1.4 }}>{n.message}</div>
            <div
              style={{
                fontSize: 10,
                color: 'var(--color-text-secondary)',
                marginTop: 3,
              }}
            >
              {new Date(n.createdAt).toLocaleString()}
            </div>
          </div>
        ))
      )}
    </div>
  );
}


/* Admin feature — Users / Teams / Projects management (+ project members,
   client links). Moved verbatim out of ReleaseTracker.jsx (Phase 0). */
import { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import * as api from '@/api.js';
import { useMetricsData } from '@shared/useMetricsData.js';
import { card, inputStyle, labelStyle, ghostButton, primaryButton, Avatar, ModalShell } from '@/ui.jsx';
import { Field, Pager } from '@shared/ui-kit.jsx';
import { StatSmall, Pill, passColor } from '@shared/dashboard-kit.jsx';
import { computeProjectSummaries, computeUserSummaries, projectSummaryFromCounts } from '@shared/releaseMetrics.js';
import { computeWorkCompletion, liveBugs } from '@shared/wbsMetrics.js';
import {
  ALLOWED_EMAIL_DOMAIN,
  PROJECT_TYPES,
  ROLES,
  STATUSES,
  TEAM_ASSIGNABLE_ROLES,
  formatVersion,
  projectTypeLabel,
  emailDomainOk,
  CMS_KINDS,
  CMS_KIND_ORDER,
  cmsKindLabel,
} from '@/constants.js';
import { managesProject, PM_ROLE, canMoveProjectTeam, canDeleteProjects } from '@shared/permissions.js';
import { IconGlobe, IconPlus, IconSmartphone, IconLayers, IconSearch } from '@/icons.jsx';

/* the CMS kind picker shown next to Type when the project is a CMS project */
function CmsKindSelect({ value, onChange }) {
  return (
    <select style={inputStyle} value={value || 'website'} onChange={(e) => onChange(e.target.value)}>
      {CMS_KIND_ORDER.map((k) => (
        <option key={k} value={k}>
          {CMS_KINDS[k].label}
        </option>
      ))}
    </select>
  );
}

function AdminPanel({
  currentUser,
  isAdmin,
  myTeamId,
  teams,
  profiles,
  projects,
  releases,
  checklistItems,
  isSubmitting,
  showToast,
  onCreateTeam,
  onDeleteTeam,
  onUpdateMember,
  onCreateUser,
  onCreateProject,
  onUpdateProject,
  onDeleteProject,
  onAddChecklistItem,
  onDeleteChecklistItem,
  refetchProfiles,
  onClose,
}) {
  const [tab, setTab] = useState(isAdmin ? 'teams' : 'projects');

  const visibleProjects = isAdmin
    ? projects
    : projects.filter((p) => p.teamId === myTeamId);
  const visibleProfiles = isAdmin
    ? profiles
    : profiles.filter((p) => p.teamId === myTeamId);
  const teamsById = {};
  teams.forEach((t) => (teamsById[t.id] = t));

  const tabBtn = (key, label) => (
    <div
      onClick={() => setTab(key)}
      style={{
        padding: '8px 12px',
        fontSize: 12,
        fontWeight: 500,
        cursor: 'pointer',
        color: tab === key ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
        borderBottom: `2px solid ${tab === key ? 'var(--brand)' : 'transparent'}`,
      }}
    >
      {label}
    </div>
  );

  return (
    <ModalShell onClose={onClose} title={isAdmin ? 'Manage' : 'Manage team'} maxWidth={680}>
      <div
        style={{
          display: 'flex',
          gap: 4,
          marginBottom: 16,
          borderBottom: '0.5px solid var(--color-border-primary)',
        }}
      >
        {isAdmin && tabBtn('teams', 'Teams')}
        {tabBtn('users', isAdmin ? 'Users' : 'Team members')}
        {tabBtn('projects', 'Projects & Checklists')}
      </div>

      {tab === 'teams' && isAdmin && (
        <TeamsTab
          teams={teams}
          profiles={profiles}
          projects={projects}
          isSubmitting={isSubmitting}
          onCreateTeam={onCreateTeam}
          onDeleteTeam={onDeleteTeam}
        />
      )}

      {tab === 'users' && (
        <UsersTab
          currentUser={currentUser}
          isAdmin={isAdmin}
          myTeamId={myTeamId}
          profiles={visibleProfiles}
          teams={teams}
          teamsById={teamsById}
          isSubmitting={isSubmitting}
          showToast={showToast}
          onUpdateMember={onUpdateMember}
          onCreateUser={onCreateUser}
          refetchProfiles={refetchProfiles}
        />
      )}

      {tab === 'projects' && (
        <ProjectsTab
          isAdmin={isAdmin}
          myTeamId={myTeamId}
          teams={teams}
          teamsById={teamsById}
          projects={visibleProjects}
          releases={releases}
          checklistItems={checklistItems}
          isSubmitting={isSubmitting}
          onCreateProject={onCreateProject}
          onUpdateProject={onUpdateProject}
          onDeleteProject={onDeleteProject}
          onAddChecklistItem={onAddChecklistItem}
          onDeleteChecklistItem={onDeleteChecklistItem}
        />
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
        <button style={ghostButton} onClick={onClose}>
          Close
        </button>
      </div>
    </ModalShell>
  );
}

export function TeamsTab({ teams, profiles, projects, isSubmitting, onCreateTeam, onDeleteTeam }) {
  const [name, setName] = useState('');
  const members = (id) => profiles.filter((p) => p.teamId === id);
  const leadOf = (id) => members(id).find((p) => p.role === 'Team Lead');
  const projCount = (id) => projects.filter((p) => p.teamId === id).length;
  function add() {
    if (!name.trim()) return;
    onCreateTeam(name.trim());
    setName('');
  }
  const noLeadCount = teams.filter((t) => !leadOf(t.id)).length;
  return (
    <div>
      {/* KPI header — house hierarchy */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
        <StatSmall label="Teams" value={teams.length} />
        <StatSmall label="People assigned" value={profiles.filter((p) => p.teamId).length} />
        <StatSmall label="Projects" value={projects.filter((p) => p.teamId).length} />
        <StatSmall
          label="Without a lead"
          value={noLeadCount}
          color={noLeadCount ? 'var(--danger)' : 'var(--success)'}
        />
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <input
          style={{ ...inputStyle, flex: 1 }}
          value={name}
          placeholder="New team name (e.g. Team B)"
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
        />
        <button style={primaryButton(!name.trim() || isSubmitting)} disabled={!name.trim() || isSubmitting} onClick={add}>
          Add team
        </button>
      </div>

      {teams.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--color-text-tertiary)' }}>No teams yet.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {teams.map((t) => {
            const lead = leadOf(t.id);
            return (
              <div
                key={t.id}
                className="mgr-row"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '11px 13px',
                  background: 'var(--color-background-secondary)',
                  border: '0.5px solid var(--color-border-primary)',
                  borderRadius: 10,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 13.5, fontWeight: 600 }}>{t.name}</span>
                    {lead ? (
                      <Pill label={`Lead: ${lead.name}`} tone="success" />
                    ) : (
                      <Pill label="No team lead" tone="danger" />
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginTop: 4 }}>
                    {members(t.id).length} member{members(t.id).length === 1 ? '' : 's'} · {projCount(t.id)} project
                    {projCount(t.id) === 1 ? '' : 's'}
                  </div>
                </div>
                <button
                  onClick={() => onDeleteTeam(t.id)}
                  disabled={isSubmitting}
                  style={{ ...ghostButton, padding: '6px 10px', fontSize: 12, color: '#dc2626', borderColor: '#dc262644' }}
                >
                  Delete
                </button>
              </div>
            );
          })}
        </div>
      )}
      <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginTop: 12, lineHeight: 1.5 }}>
        Assign each team a Team Lead in the Users tab. Team Leads manage their own
        team's projects and members; Developers and QA only see their team's work.
      </div>
    </div>
  );
}

function CreateUserForm({ teams, isSubmitting, onCreateUser }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    role: 'Developer',
    teamId: '',
  });
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const domainBad = form.email.trim().length > 0 && !emailDomainOk(form.email);
  const invalid =
    !form.name.trim() ||
    !form.email.trim() ||
    domainBad ||
    form.password.length < 6;

  async function submit() {
    if (invalid) return;
    const ok = await onCreateUser({
      name: form.name.trim(),
      email: form.email.trim(),
      password: form.password,
      role: form.role,
      teamId: form.role === PM_ROLE ? null : form.teamId || null, // a Project Manager has no team
    });
    if (ok) {
      setForm({ name: '', email: '', password: '', role: 'Developer', teamId: '' });
      setOpen(false);
    }
  }

  if (!open) {
    return (
      <div style={{ marginBottom: 6 }}>
        <button
          style={{ ...primaryButton(false), display: 'inline-flex', alignItems: 'center', gap: 6 }}
          onClick={() => setOpen(true)}
        >
          <IconPlus size={15} />
          Create account
        </button>
      </div>
    );
  }

  return (
    <div
      className="anim-in"
      style={{
        ...card,
        padding: 14,
        background: 'var(--color-background-secondary)',
        marginBottom: 8,
      }}
    >
      <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 10 }}>New account</div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 160px' }}>
          <Field label="Name">
            <input
              style={inputStyle}
              value={form.name}
              placeholder="e.g. Sara Khan"
              onChange={(e) => set('name', e.target.value)}
            />
          </Field>
        </div>
        <div style={{ flex: '1 1 200px' }}>
          <Field label="Email">
            <input
              style={{
                ...inputStyle,
                borderColor: domainBad ? 'var(--danger)' : 'var(--color-border-tertiary)',
              }}
              type="email"
              value={form.email}
              placeholder={`name@${ALLOWED_EMAIL_DOMAIN}`}
              onChange={(e) => set('email', e.target.value)}
            />
          </Field>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 160px' }}>
          <Field label="Temporary password">
            <input
              style={inputStyle}
              type="text"
              value={form.password}
              placeholder="At least 6 characters"
              onChange={(e) => set('password', e.target.value)}
            />
          </Field>
        </div>
        <div style={{ flex: '1 1 120px' }}>
          <Field label="Role">
            <select style={inputStyle} value={form.role} onChange={(e) => set('role', e.target.value)}>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div style={{ flex: '1 1 120px' }}>
          <Field label="Team">
            <select style={inputStyle} value={form.role === PM_ROLE ? '' : form.teamId} disabled={form.role === PM_ROLE} title={form.role === PM_ROLE ? 'Project Managers have no team' : 'Team'} onChange={(e) => set('teamId', e.target.value)}>
              <option value="">No team</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </div>
      <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 10 }}>
        The account is created already-confirmed (no email sent). Share the
        temporary password with the user.
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button style={ghostButton} onClick={() => setOpen(false)}>
          Cancel
        </button>
        <button
          style={primaryButton(invalid || isSubmitting)}
          disabled={invalid || isSubmitting}
          onClick={submit}
        >
          {isSubmitting ? 'Creating…' : 'Create account'}
        </button>
      </div>
    </div>
  );
}

export function UsersTab({
  currentUser,
  isAdmin,
  myTeamId,
  profiles,
  teams,
  teamsById,
  scopeProjectIds = null,
  releases,              // the loaded lists in legacy mode; undefined otherwise
  bugs,
  projectMembers = [],
  isSubmitting,
  showToast,
  onUpdateMember,
  onCreateUser,
  refetchProfiles,
}) {
  const statsQ = useQuery({
    queryKey: ['summaries', 'users', scopeProjectIds ? [...scopeProjectIds].sort().join(',') : 'all'],
    queryFn: () => api.fetchUserSummaries(scopeProjectIds),
    enabled: !releases,
  });
  const [busyId, setBusyId] = useState(null);
  // hours per person come from the database (user_time_totals); until that
  // migration is applied, every log is downloaded and summed as before
  const [timeLogs, setTimeLogs] = useState({ list: [], totals: null, loading: true });
  const userIdsKey = profiles.map((p) => p.id).sort().join(',');
  useEffect(() => {
    let cancelled = false;
    const ids = userIdsKey ? userIdsKey.split(',') : [];
    setTimeLogs((t) => ({ ...t, loading: true }));
    api.fetchUserTimeTotals(ids)
      .then(async (totals) => {
        const list = totals === null ? await api.fetchTimeLogsForUsers(ids) : [];
        if (!cancelled) setTimeLogs({ list, totals, loading: false });
      })
      .catch(() => { if (!cancelled) setTimeLogs({ list: [], totals: null, loading: false }); });
    return () => { cancelled = true; };
  }, [userIdsKey]);
  // projects + hours from memberships and time; build and bug numbers from the
  // loaded lists (legacy) or the database's per-person counts
  const summaries = useMemo(() => {
    const out = computeUserSummaries(profiles, { releases: releases || [], bugs: bugs || [], projectMembers, timeLogs: timeLogs.list });
    if (timeLogs.totals) {
      Object.entries(out).forEach(([uid, s]) => {
        const tt = timeLogs.totals[uid];
        if (!tt) return;
        (tt.projectIds || []).forEach((pid) => s.projects.add(pid));
        s.projectCount = s.projects.size;
        s.hours = Math.round(Number(tt.hours || 0) * 10) / 10;
        s.hoursWeek = Math.round(Number(tt.hoursWeek || 0) * 10) / 10;
      });
    }
    if (!releases && statsQ.data) {
      Object.entries(out).forEach(([uid, s]) => Object.assign(s, statsQ.data[uid] || {}));
    }
    return out;
  }, [profiles, releases, bugs, projectMembers, timeLogs.list, timeLogs.totals, statsQ.data]);
  const roleOptions = isAdmin ? ROLES : TEAM_ASSIGNABLE_ROLES;

  async function patch(id, p) {
    setBusyId(id);
    await onUpdateMember(id, p);
    setBusyId(null);
  }

  async function removeUser(p) {
    if (
      !window.confirm(
        `Permanently delete ${p.name}? This removes them from both the app and the authentication system.`
      )
    )
      return;
    setBusyId(p.id);
    try {
      await api.adminDeleteUser(p.id);
      showToast('User deleted');
      refetchProfiles();
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      setBusyId(null);
    }
  }

  const selStyle = { ...inputStyle, width: 'auto', padding: '6px 8px', fontSize: 12 };

  const [q, setQ] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [teamFilter, setTeamFilter] = useState('all');
  const [visible, setVisible] = useState(15);
  const fSel = { ...inputStyle, width: 'auto', padding: '7px 10px', fontSize: 12 };

  const term = q.trim().toLowerCase();
  const filteredUsers = profiles.filter(
    (p) =>
      (p.name.toLowerCase().includes(term) ||
        (p.email || '').toLowerCase().includes(term)) &&
      (roleFilter === 'all' || p.role === roleFilter) &&
      (teamFilter === 'all' ||
        (teamFilter === 'none' ? !p.teamId : p.teamId === teamFilter))
  );
  const pageUsers = filteredUsers.slice(0, visible);

  const roleCount = (r) => profiles.filter((p) => p.role === r).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* KPI header — role distribution */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
        <StatSmall label="Total" value={profiles.length} />
        <StatSmall label="Admins" value={roleCount('Admin')} color="var(--brand)" />
        <StatSmall label="Team Leads" value={roleCount('Team Lead')} color="var(--warning)" />
        <StatSmall label="Project Managers" value={roleCount(PM_ROLE)} color="#0891b2" />
        <StatSmall label="QA" value={roleCount('QA')} color="var(--success)" />
        <StatSmall label="Developers" value={roleCount('Developer')} />
      </div>

      {isAdmin && (
        <CreateUserForm teams={teams} isSubmitting={isSubmitting} onCreateUser={onCreateUser} />
      )}

      {/* search + filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
        <input
          style={{ ...inputStyle, flex: '1 1 180px', width: 'auto' }}
          value={q}
          placeholder="Search by name or email…"
          onChange={(e) => {
            setQ(e.target.value);
            setVisible(15);
          }}
        />
        <select style={fSel} value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
          <option value="all">All roles</option>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        {isAdmin && (
          <select style={fSel} value={teamFilter} onChange={(e) => setTeamFilter(e.target.value)}>
            <option value="all">All teams</option>
            <option value="none">No team</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        )}
        <span
          style={{
            fontSize: 12,
            color: 'var(--color-text-secondary)',
            alignSelf: 'center',
          }}
        >
          {filteredUsers.length} user{filteredUsers.length === 1 ? '' : 's'}
        </span>
      </div>

      {/* member cards — responsive grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12, marginTop: 10 }}>
      {pageUsers.map((p) => {
        const isSelf = p.id === currentUser.id;
        // a team lead may only adjust Developers/QA in their own team
        const leadLocked =
          !isAdmin && (p.role === 'Admin' || p.role === 'Team Lead' || p.role === PM_ROLE);
        const roleDisabled = isSelf || leadLocked || busyId === p.id;
        const roleTone = { Admin: 'info', 'Team Lead': 'warning', [PM_ROLE]: 'info', QA: 'success' }[p.role] || 'neutral';
        const fieldLbl = { display: 'block', fontSize: 10.5, fontWeight: 600, color: 'var(--color-text-tertiary)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' };
        return (
          <div key={p.id} className="mgr-card" style={{ ...card, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Avatar name={p.name} size={40} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {p.name}
                  {isSelf && <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--color-text-secondary)', marginLeft: 6 }}>(you)</span>}
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--color-text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.email}</div>
              </div>
              <Pill label={p.role} tone={roleTone} />
            </div>

            <UserSummary s={summaries[p.id]} role={p.role} hoursLoading={timeLogs.loading} />

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {isAdmin ? (
                <label style={{ display: 'block', minWidth: 0 }}>
                  <span style={fieldLbl}>Team</span>
                  <select
                    style={{ ...selStyle, width: '100%' }}
                    value={p.teamId || ''}
                    disabled={busyId === p.id || p.role === PM_ROLE}
                    title={p.role === PM_ROLE ? 'Project Managers manage every project and have no team' : 'Team'}
                    onChange={(e) => patch(p.id, { team_id: e.target.value || null })}
                  >
                    <option value="">No team</option>
                    {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </label>
              ) : (
                <div style={{ minWidth: 0 }}>
                  <span style={fieldLbl}>Team</span>
                  <div style={{ fontSize: 12.5, minHeight: 32, display: 'flex', alignItems: 'center' }}>{p.teamId ? teamsById[p.teamId]?.name : '—'}</div>
                </div>
              )}
              <label style={{ display: 'block', minWidth: 0 }}>
                <span style={fieldLbl}>Role</span>
                <select
                  style={{ ...selStyle, width: '100%' }}
                  value={p.role}
                  disabled={roleDisabled}
                  onChange={(e) => patch(p.id, { role: e.target.value })}
                  title={leadLocked ? 'Only an admin can change this role' : 'Role'}
                >
                  {/* keep the current role visible even if outside a lead's options */}
                  {(roleOptions.includes(p.role) ? roleOptions : [p.role, ...roleOptions]).map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </label>
            </div>

            {isAdmin && (
              <button
                onClick={() => removeUser(p)}
                disabled={isSelf || busyId === p.id}
                style={{
                  ...ghostButton, alignSelf: 'flex-end', padding: '6px 10px', minHeight: 0, fontSize: 12,
                  color: isSelf ? 'var(--color-text-secondary)' : 'var(--danger)',
                  opacity: isSelf ? 0.5 : 1, cursor: isSelf ? 'default' : 'pointer',
                }}
              >
                Remove
              </button>
            )}
          </div>
        );
      })}
      </div>
      {filteredUsers.length === 0 && (
        <div style={{ fontSize: 13, color: 'var(--color-text-tertiary)', padding: '8px 2px' }}>
          No users match.
        </div>
      )}
      {visible < filteredUsers.length && (
        <button
          style={{ ...ghostButton, width: '100%', marginTop: 4 }}
          onClick={() => setVisible((v) => v + 15)}
        >
          Load more ({filteredUsers.length - visible} left)
        </button>
      )}
      <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginTop: 6, lineHeight: 1.5 }}>
        {isAdmin
          ? 'New sign-ups join as Developer. Set each user’s team and role here; one Team Lead per team. Project Managers manage every project and have no team.'
          : 'You can set your team members between Developer and QA. Ask an admin to add or remove people.'}
      </div>
    </div>
  );
}

/* The Projects tab: every project as a card. Anyone can open a project from its
   card; Team Leads and Admins also create and edit projects (Admins delete them), and
   a Project Manager edits the projects they're assigned to; managers also manage
   each one's QA checklist and members from the card (the former Manage Projects
   page). One page of cards at a time; build / bug numbers are fetched for the
   cards on the page, or for the whole filtered list when a status filter or a
   numeric sort needs them.
   releases / bugs: the loaded lists in legacy mode (paged-lists migrations not
   applied); undefined otherwise. filters / onFilters: kept by the caller so the
   search, filters and page survive opening a project and coming back. */
export const PROJECTS_FILTERS = { q: '', type: 'all', team: 'all', status: 'all', sort: 'name', page: 0 };
const PROJECTS_PAGE_SIZE = 24;
const PROJECT_STATUS_FILTERS = [['all', 'Any status'], ['bugs', 'Open bugs'], ['active', 'Active build'], ['idle', 'No active build']];
const PROJECT_SORTS = [['name', 'Name (A–Z)'], ['bugs', 'Most open bugs'], ['recent', 'Latest build'], ['builds', 'Most builds']];

export function ProjectsTab({
  isAdmin,
  canManage = true,
  canCreate = canManage,
  canDelete = isAdmin, // Admins and Project Managers
  user,
  myTeamId,
  teams,
  teamsById,
  projects,
  releases,
  bugs = [],
  checklistItems,
  brands = [],
  profiles,
  projectMembers,
  isSubmitting,
  filters: filtersProp,
  onFilters: onFiltersProp,
  createSignal = 0,
  onOpen,
  onCreateProject,
  onUpdateProject,
  onDeleteProject,
  onAddChecklistItem,
  onDeleteChecklistItem,
  onAddMember,
  onUpdateMember,
  onRemoveMember,
}) {
  const [creating, setCreating] = useState(false);
  // Admins and Project Managers work across teams: they pick a project's team
  const anyTeam = isAdmin || canMoveProjectTeam(user);
  // the header's "New project" opens the form
  useEffect(() => { if (createSignal && canCreate) setCreating(true); }, [createSignal, canCreate]);
  const [form, setForm] = useState({
    name: '',
    type: 'mobile',
    cmsKind: 'website',
    team: anyTeam ? teams[0]?.id || '' : myTeamId || '',
    brand: '',
  });
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const needsTeam = anyTeam && teams.length > 0;
  const invalid = !form.name.trim() || (needsTeam && !form.team);

  const [localFilters, setLocalFilters] = useState(PROJECTS_FILTERS);
  const f = filtersProp || localFilters;
  const onFilters = onFiltersProp || setLocalFilters;
  const setF = (k, v) => onFilters({ ...f, [k]: v, page: 0 });
  const setPage = (n) => onFilters({ ...f, page: n });
  const teamName = (id) => (id ? teamsById?.[id]?.name || '' : '');

  // 1. filters that only need the project list, sorted by name
  const term = f.q.trim().toLowerCase();
  const metaFiltered = useMemo(() => projects
    .filter((p) => !term || p.name.toLowerCase().includes(term) || teamName(p.teamId).toLowerCase().includes(term))
    .filter((p) => f.type === 'all' || p.type === f.type)
    .filter((p) => f.team === 'all' || (f.team === 'none' ? !p.teamId : p.teamId === f.team))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [projects, term, f.type, f.team, teamsById]);

  // 2. numbers: the page's projects, or the whole filtered list when ordering needs them
  const needsAll = f.sort !== 'name' || f.status !== 'all';
  const lastPage = (n) => Math.max(0, Math.ceil(n / PROJECTS_PAGE_SIZE) - 1);
  const wantedPage = f.page || 0;
  const namePage = Math.min(wantedPage, lastPage(metaFiltered.length));
  const countIds = useMemo(
    () => (needsAll ? metaFiltered : metaFiltered.slice(namePage * PROJECTS_PAGE_SIZE, (namePage + 1) * PROJECTS_PAGE_SIZE)).map((p) => p.id).sort(),
    [needsAll, metaFiltered, namePage]
  );
  const countsQ = useQuery({
    queryKey: ['releases', 'projectSummaries', countIds.join(',')],
    queryFn: () => api.fetchProjectSummaries(countIds),
    enabled: !releases && countIds.length > 0,
    staleTime: 0, // counted again each time the list is shown
  });
  // undefined = loading; null = not deployed, so count from the loaded lists
  const counts = releases ? null : !countIds.length ? {} : countsQ.isError ? null : countsQ.data;
  const legacySummaries = useMemo(() => (releases ? computeProjectSummaries(releases, bugs || []) : null), [releases, bugs]);
  const legacyActive = useMemo(() => {
    if (!releases) return {};
    const out = {};
    releases.forEach((r) => { // releases come newest first
      const o = (out[r.projectId] = out[r.projectId] || { active: null, latest: '' });
      if (!o.active && r.status !== 'closed') o.active = { version: r.version, platform: r.platform };
      if ((r.date || '') > o.latest) o.latest = r.date || '';
    });
    return out;
  }, [releases]);
  const rowFor = (p) => {
    if (counts !== null) {
      const c = counts?.[p.id];
      return { p, loading: counts === undefined, summary: c?.builds ? projectSummaryFromCounts(c) : null, open: c?.openBugs ?? 0, builds: c?.builds ?? 0, active: c?.active || null, latest: c?.latest || '' };
    }
    const s = legacySummaries?.[p.id] || null;
    return { p, summary: s, open: s?.openBugs ?? 0, builds: s?.builds ?? 0, active: legacyActive[p.id]?.active || null, latest: legacyActive[p.id]?.latest || '' };
  };

  // 3. status filter + sort (need every number), then the page
  const ordering = needsAll && counts === undefined;
  let list = needsAll && !ordering ? metaFiltered.map(rowFor) : null;
  if (list) {
    list = list
      .filter((r) => (f.status === 'bugs' ? r.open > 0 : f.status === 'active' ? !!r.active : f.status === 'idle' ? !r.active : true))
      .sort((a, b) => {
        const byName = a.p.name.localeCompare(b.p.name, undefined, { sensitivity: 'base' });
        if (f.sort === 'bugs') return b.open - a.open || byName;
        if (f.sort === 'builds') return b.builds - a.builds || byName;
        if (f.sort === 'recent') return b.latest.localeCompare(a.latest) || byName;
        return byName;
      });
  }
  const total = ordering ? 0 : list ? list.length : metaFiltered.length;
  const page = list ? Math.min(wantedPage, lastPage(list.length)) : namePage;
  const pageRows = ordering ? [] : list
    ? list.slice(page * PROJECTS_PAGE_SIZE, (page + 1) * PROJECTS_PAGE_SIZE)
    : metaFiltered.slice(page * PROJECTS_PAGE_SIZE, (page + 1) * PROJECTS_PAGE_SIZE).map(rowFor);
  const pageIds = pageRows.map((r) => r.p.id).sort();
  const pageIdsKey = pageIds.join(',');

  // 4. per-card extras for the page: completion (WBS + live bugs), CMS task totals
  const liveFallback = useMemo(() => (releases ? { releases, bugs: bugs || [] } : null), [releases, bugs]);
  const live = useMetricsData({ scopeProjectIds: pageIds, liveOnly: true, enabled: pageIds.length > 0, fallback: liveFallback });
  const wbsQ = useQuery({
    queryKey: ['projectsWbs', pageIdsKey],
    queryFn: () => api.fetchWbsItemsForProjects(pageIdsKey.split(',').filter((id) => pageRows.find((r) => r.p.id === id)?.p.type !== 'cms')),
    enabled: pageIds.length > 0,
    staleTime: 30_000,
  });
  const completions = useMemo(() => {
    const releaseById = Object.fromEntries(live.releases.map((r) => [r.id, r]));
    const itemsBy = {};
    (wbsQ.data || []).forEach((i) => (itemsBy[i.projectId] = itemsBy[i.projectId] || []).push(i));
    const bugsBy = {};
    liveBugs(live.bugs, releaseById).forEach((b) => {
      const pid = releaseById[b.releaseId]?.projectId;
      if (pid) (bugsBy[pid] = bugsBy[pid] || []).push(b);
    });
    const out = {};
    Object.keys(itemsBy).forEach((pid) => { out[pid] = computeWorkCompletion(itemsBy[pid], bugsBy[pid]); });
    return out;
  }, [wbsQ.data, live.bugs, live.releases]);
  const cmsIds = pageRows.filter((r) => r.p.type === 'cms').map((r) => r.p.id).sort();
  const cmsQ = useQuery({
    queryKey: ['cmsTaskCounts', cmsIds.join(',')],
    queryFn: () => api.fetchCmsTaskCounts(cmsIds),
    enabled: cmsIds.length > 0,
    staleTime: 0,
  });

  // KPI header
  const allIdsKey = projects.map((p) => p.id).sort().join(',');
  const buildsQ = useQuery({
    queryKey: ['summaries', 'releaseCount', allIdsKey],
    queryFn: () => api.countReleases(allIdsKey ? allIdsKey.split(',') : []),
    enabled: !releases,
  });
  const totalBuilds = releases ? releases.length : buildsQ.data ?? '…';
  const typeCount = (t) => projects.filter((p) => p.type === t).length;
  const teamIds = [...new Set(projects.map((p) => p.teamId || 'none'))];
  const showTeam = anyTeam || teamIds.length > 1;
  const filtered = f.q.trim() || f.type !== 'all' || f.team !== 'all' || f.status !== 'all';
  const statusCount = (k) => {
    if (!list || k === 'all') return null;
    return metaFiltered.map(rowFor).filter((r) => (k === 'bugs' ? r.open > 0 : k === 'active' ? !!r.active : !r.active)).length;
  };

  const fSel = { ...inputStyle, width: 'auto', padding: '7px 10px', fontSize: 12.5, minHeight: 0 };

  function create() {
    if (invalid) return;
    onCreateProject({
      name: form.name.trim(),
      type: form.type,
      platform: projectTypeLabel(form.type),
      team_id: anyTeam ? form.team || null : myTeamId || null,
      brand_id: form.brand || null,
      ...(form.type === 'cms' ? { cms_kind: form.cmsKind || 'website' } : {}),
    });
    setForm({ name: '', type: 'mobile', cmsKind: 'website', team: anyTeam ? teams[0]?.id || '' : myTeamId || '', brand: '' });
    setCreating(false);
  }

  return (
    <div>
      {/* KPI header — house hierarchy */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
        <StatSmall label="Projects" value={projects.length} />
        <StatSmall label="Mobile" value={typeCount('mobile')} color="var(--brand)" />
        <StatSmall label="Web" value={typeCount('web')} color="var(--success)" />
        <StatSmall label="Both" value={typeCount('both')} color="var(--warning)" />
        <StatSmall label="CMS" value={typeCount('cms')} color="var(--info, var(--brand))" />
        <StatSmall label="Releases" value={totalBuilds} />
      </div>

      {/* header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, gap: 10 }}>
        <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--color-text-secondary)' }}>
          {ordering ? 'Counting builds and bugs…' : filtered ? `${total} of ${projects.length} projects` : `${projects.length} project${projects.length === 1 ? '' : 's'}`}
        </span>
        {canCreate && (
          <button style={creating ? ghostButton : primaryButton(false)} onClick={() => setCreating((v) => !v)}>
            {creating ? 'Cancel' : '+ New project'}
          </button>
        )}
      </div>

      {/* search + filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <label style={{ position: 'relative', flex: '1 1 220px', display: 'block' }}>
          <span style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-tertiary)', display: 'inline-flex', pointerEvents: 'none' }}><IconSearch size={15} /></span>
          <input
            style={{ ...inputStyle, paddingLeft: 34 }}
            value={f.q}
            aria-label="Search projects"
            placeholder={showTeam ? 'Search projects or teams…' : 'Search projects…'}
            onChange={(e) => setF('q', e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && total === 1 && pageRows[0] && onOpen) onOpen(pageRows[0].p.id);
              if (e.key === 'Escape') setF('q', '');
            }}
          />
        </label>
        {showTeam && (
          <select style={fSel} aria-label="Team" value={f.team} onChange={(e) => setF('team', e.target.value)}>
            <option value="all">All teams</option>
            <option value="none">No team</option>
            {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        )}
        <select style={fSel} aria-label="Project type" value={f.type} onChange={(e) => setF('type', e.target.value)}>
          <option value="all">All types</option>
          {PROJECT_TYPES.map((t) => <option key={t} value={t}>{projectTypeLabel(t)} ({typeCount(t)})</option>)}
        </select>
        <select style={fSel} aria-label="Status" value={f.status} onChange={(e) => setF('status', e.target.value)}>
          {PROJECT_STATUS_FILTERS.map(([k, label]) => {
            const n = statusCount(k);
            return <option key={k} value={k}>{n == null ? label : `${label} (${n})`}</option>;
          })}
        </select>
        <select style={fSel} aria-label="Sort" value={f.sort} onChange={(e) => setF('sort', e.target.value)}>
          {PROJECT_SORTS.map(([k, label]) => <option key={k} value={k}>Sort: {label}</option>)}
        </select>
        {filtered && (
          <button style={{ ...ghostButton, padding: '6px 12px', minHeight: 0, fontSize: 12.5 }} onClick={() => onFilters({ ...PROJECTS_FILTERS, sort: f.sort })}>Clear</button>
        )}
      </div>

      {/* create form (on demand) */}
      {creating && canCreate && (
        <div
          className="anim-in"
          style={{ ...card, padding: 14, background: 'var(--color-background-secondary)', marginBottom: 16, display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}
        >
          <div style={{ flex: '2 1 200px' }}>
            <label style={labelStyle}>Name</label>
            <input
              style={inputStyle}
              value={form.name}
              autoFocus
              placeholder="e.g. Wellbook Mobile"
              onChange={(e) => set('name', e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && create()}
            />
          </div>
          <div style={{ flex: '1 1 150px' }}>
            <label style={labelStyle}>Type</label>
            <select style={inputStyle} value={form.type} onChange={(e) => set('type', e.target.value)}>
              {PROJECT_TYPES.map((t) => <option key={t} value={t}>{projectTypeLabel(t)}</option>)}
            </select>
          </div>
          {form.type === 'cms' && (
            <div style={{ flex: '1 1 190px' }}>
              <label style={labelStyle}>CMS project type</label>
              <CmsKindSelect value={form.cmsKind} onChange={(v) => set('cmsKind', v)} />
            </div>
          )}
          {anyTeam && (
            <div style={{ flex: '1 1 150px' }}>
              <label style={labelStyle}>Team</label>
              <select style={inputStyle} value={form.team} onChange={(e) => set('team', e.target.value)}>
                <option value="">No team</option>
                {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
          )}
          {brands.length > 0 && (
            <div style={{ flex: '1 1 150px' }}>
              <label style={labelStyle}>Brand</label>
              <BrandSelect brands={brands} value={form.brand} onChange={(v) => set('brand', v)} />
            </div>
          )}
          <button style={primaryButton(invalid || isSubmitting)} disabled={invalid || isSubmitting} onClick={create}>
            Create
          </button>
        </div>
      )}

      {/* cards */}
      {ordering ? (
        <div style={{ ...card, padding: 28, textAlign: 'center', fontSize: 13, color: 'var(--color-text-tertiary)' }}>Loading…</div>
      ) : total === 0 ? (
        <div style={{ ...card, padding: 28, textAlign: 'center', fontSize: 13, color: 'var(--color-text-tertiary)' }}>
          {projects.length === 0
            ? canCreate ? 'No projects yet — create your first one above.' : 'You’re not a member of any project yet.'
            : <>No projects match. <button style={{ ...ghostButton, marginLeft: 8, padding: '4px 10px', minHeight: 0, fontSize: 12 }} onClick={() => onFilters({ ...PROJECTS_FILTERS, sort: f.sort })}>Clear filters</button></>}
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14, alignItems: 'stretch' }}>
            {pageRows.map(({ p, summary, loading }) => (
              <ProjectRow
                key={p.id}
                project={p}
                isAdmin={isAdmin}
                canManage={canManage && (!user || managesProject(user, p))}
                canDelete={canDelete}
                canMoveTeam={anyTeam}
                user={user}
                teams={teams}
                teamName={teamName(p.teamId) || null}
                brands={brands}
                summary={summary}
                summaryLoading={loading}
                completion={completions[p.id]}
                cmsCounts={p.type === 'cms' ? (cmsQ.isError ? null : cmsQ.data ? cmsQ.data[p.id] || { open: 0, done: 0, total: 0 } : undefined) : undefined}
                items={checklistItems.filter((c) => c.projectId === p.id)}
                profiles={profiles}
                members={projectMembers.filter((m) => m.projectId === p.id)}
                isSubmitting={isSubmitting}
                onOpen={onOpen ? () => onOpen(p.id) : null}
                onUpdate={onUpdateProject}
                onDelete={() => onDeleteProject(p.id)}
                onAddItem={(label, pos) => onAddChecklistItem(p.id, label, pos)}
                onDeleteItem={onDeleteChecklistItem}
                onAddMember={onAddMember}
                onUpdateMember={onUpdateMember}
                onRemoveMember={onRemoveMember}
              />
            ))}
          </div>
          <Pager page={page} pageSize={PROJECTS_PAGE_SIZE} total={total} onPage={setPage} busy={countsQ.isFetching} noun={total === 1 ? 'project' : 'projects'} />
        </>
      )}
    </div>
  );
}

/* Brand picker for a project. Empty = follow the workspace's default brand. */
function BrandSelect({ brands, value, onChange }) {
  const fallback = brands.find((b) => b.isDefault);
  return (
    <select style={inputStyle} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{fallback ? `Default (${fallback.name})` : 'Default'}</option>
      {brands.map((b) => (
        <option key={b.id} value={b.id}>
          {b.name}
        </option>
      ))}
    </select>
  );
}

/* Bird's-eye strip on each user tile: projects, hours logged and one role
   metric, with secondary KPIs underneath. QA is measured on reviews and bugs
   filed; everyone else on the builds they submitted. */
function UserSummary({ s, role, hoursLoading }) {
  if (!s) return null;
  const isQa = role === 'QA';
  const cell = (label, value, color) => (
    <div style={{ flex: 1, minWidth: 0, padding: '8px 10px', borderRadius: 10, background: 'var(--color-background-secondary)' }}>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 700, color: color || 'var(--color-text-primary)' }}>{value}</div>
      <div style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--color-text-secondary)', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</div>
    </div>
  );
  const fmtH = (h) => (hoursLoading ? '…' : `${h}h`);
  const extras = isQa
    ? [
        [`${s.bugsFiled}`, `bug${s.bugsFiled === 1 ? '' : 's'} filed`],
        [`${s.pendingReviews}`, 'pending review' + (s.pendingReviews === 1 ? '' : 's'), s.pendingReviews ? 'var(--warning)' : null],
      ]
    : [
        [`${s.openBugsOnBuilds}`, `open bug${s.openBugsOnBuilds === 1 ? '' : 's'} on builds`, s.openBugsOnBuilds ? 'var(--danger)' : null],
        [s.passRate == null ? '—' : `${s.passRate}%`, 'pass rate', s.passRate == null ? null : passColor(s.passRate)],
      ];
  extras.push([fmtH(s.hoursWeek), 'last 7 days']);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', gap: 6 }}>
        {cell(`Project${s.projectCount === 1 ? '' : 's'}`, s.projectCount)}
        {cell('Hours logged', fmtH(s.hours))}
        {isQa ? cell('Builds reviewed', s.reviewed) : cell('Builds submitted', s.builds)}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 10px', fontSize: 11.5, color: 'var(--color-text-secondary)' }}>
        {extras.map(([v, label, color]) => (
          <span key={label} style={{ whiteSpace: 'nowrap' }}>
            <b style={{ fontWeight: 600, color: color || 'var(--color-text-primary)' }}>{v}</b> {label}
          </span>
        ))}
      </div>
    </div>
  );
}

const EMPTY_SUMMARY = { builds: 0, latest: null, openBugs: 0, resolvedBugs: 0, status: { label: 'No builds', tone: 'neutral' } };
// CMS projects have no builds: their status follows their tasks
function cmsStatus(c) {
  if (!c) return { label: 'CMS', tone: 'info' };
  if (!c.total) return { label: 'No tasks', tone: 'neutral' };
  return c.open ? { label: 'Work ongoing', tone: 'info' } : { label: 'All done', tone: 'success' };
}

/* Bird's-eye strip on each project tile: three number boxes, then two one-line
   rows (completion, QA status). Every row is always there, so every card has
   the same layout whatever the project holds.
   isCms: task totals instead of builds (cmsCounts: undefined = loading, null = unavailable). */
const ROW = { display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--color-text-secondary)', minWidth: 0, height: 18, whiteSpace: 'nowrap', overflow: 'hidden' };
function ProjectSummary({ s, completion, loading = false, isCms = false, cmsCounts }) {
  const qa = s.latest ? STATUSES[s.latest.status] : null;
  const cell = (label, value, color) => (
    <div style={{ flex: 1, minWidth: 0, padding: '8px 10px', borderRadius: 10, background: 'var(--color-background-secondary)' }}>
      <div className="tnum" style={{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 700, color: value ? color : 'var(--color-text-primary)' }}>{value}</div>
      <div style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--color-text-secondary)', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</div>
    </div>
  );
  const dash = <span style={{ color: 'var(--color-text-tertiary)' }}>—</span>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {isCms ? (
        <div style={{ display: 'flex', gap: 6 }}>
          {cell(`Open task${cmsCounts?.open === 1 ? '' : 's'}`, cmsCounts == null ? '…' : cmsCounts.open, 'var(--color-text-primary)')}
          {cell(`Task${cmsCounts?.done === 1 ? '' : 's'} done`, cmsCounts == null ? '…' : cmsCounts.done, 'var(--success)')}
          {cell('Open bugs', loading ? '…' : s.openBugs, 'var(--danger)')}
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 6 }}>
          {cell(`Build${s.builds === 1 ? '' : 's'} submitted`, loading ? '…' : s.builds, 'var(--color-text-primary)')}
          {cell('Open bugs', loading ? '…' : s.openBugs, 'var(--danger)')}
          {cell('Resolved bugs', loading ? '…' : s.resolvedBugs, 'var(--success)')}
        </div>
      )}
      <div style={ROW}>
        <span style={{ fontWeight: 600 }}>Completion</span>
        {completion ? (
          <>
            <span className="tnum" style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>{completion.pct}%</span>
            {completion.open > 0 && <span style={{ color: 'var(--color-text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis' }}>· {completion.open} still open</span>}
          </>
        ) : isCms ? (
          cmsCounts == null ? dash : cmsCounts.total ? (
            <span className="tnum" style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>{Math.round((cmsCounts.done / cmsCounts.total) * 100)}% of tasks done</span>
          ) : <span style={{ color: 'var(--color-text-tertiary)' }}>No tasks yet</span>
        ) : dash}
      </div>
      <div style={ROW}>
        <span style={{ fontWeight: 600 }}>{isCms ? 'Tasks' : 'QA status'}</span>
        {isCms ? (
          cmsCounts == null ? dash : <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{cmsCounts.total} in total</span>
        ) : loading ? (
          <span style={{ color: 'var(--color-text-tertiary)' }}>…</span>
        ) : qa ? (
          <>
            <span style={{ width: 7, height: 7, borderRadius: 999, background: qa.color, flexShrink: 0 }} />
            <span style={{ color: qa.color, fontWeight: 600 }}>{qa.label}</span>
            <span style={{ color: 'var(--color-text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              · {formatVersion(s.latest.version) || 'latest build'}
            </span>
          </>
        ) : (
          <span style={{ color: 'var(--color-text-tertiary)' }}>No builds yet</span>
        )}
      </div>
    </div>
  );
}

/* Every card is the same height: one-line title and subtitle, the summary strip,
   one line of labels (extra ones fold into "+N") and the buttons pinned at the
   bottom. Nothing on the card expands: Edit and Manage open a modal. */
export const PROJECT_CARD_HEIGHT = 300;
const cardBtn = { padding: '6px 10px', minHeight: 0, fontSize: 12, flex: 1 };

function ProjectRow({
  project,
  isAdmin,
  canManage = true,
  canDelete = isAdmin,
  canMoveTeam = isAdmin,
  user,
  teams,
  teamName,
  brands,
  summary,
  summaryLoading = false,
  completion,
  cmsCounts,
  onOpen = null,
  items,
  profiles,
  members,
  isSubmitting,
  onUpdate,
  onDelete,
  onAddItem,
  onDeleteItem,
  onAddMember,
  onUpdateMember,
  onRemoveMember,
}) {
  const [modal, setModal] = useState(null); // null | 'edit' | 'manage'
  const s = summary || EMPTY_SUMMARY;
  const projectBrand = brands.find((b) => b.id === project.brandId);
  // an approved build isn't "on track" for the project while tracked work is open
  const status = s.status?.label === 'On track' && completion?.open > 0
    ? { label: 'Work ongoing', tone: 'info' }
    : s.status || EMPTY_SUMMARY.status;
  const isWeb = project.type === 'web';
  const isCms = project.type === 'cms';
  const pill = isCms ? (cmsCounts !== undefined ? cmsStatus(cmsCounts) : null) : summaryLoading ? null : status;

  // one line of labels; whatever doesn't fit is counted in "+N"
  const tags = [
    { label: teamName || 'No team', tone: teamName ? 'info' : 'neutral' },
    projectBrand && { label: projectBrand.name, tone: 'neutral' },
    project.ongoingSupport && { label: 'Ongoing support', tone: 'info' },
    { label: `${items.length} checklist item${items.length === 1 ? '' : 's'}`, tone: 'neutral' },
    { label: `${members.length} member${members.length === 1 ? '' : 's'}`, tone: 'neutral' },
  ].filter(Boolean);
  const MAX_TAGS = 3;
  const shownTags = tags.slice(0, MAX_TAGS);
  const moreTags = tags.slice(MAX_TAGS);

  const stop = (fn) => (e) => { e.stopPropagation(); fn(); };

  return (
    <>
      <div
        className={`mgr-card${onOpen ? ' clickable' : ''}`}
        onClick={onOpen || undefined}
        role={onOpen ? 'link' : undefined}
        aria-label={onOpen ? `Open ${project.name}` : undefined}
        style={{ ...card, padding: 16, height: PROJECT_CARD_HEIGHT, boxSizing: 'border-box', overflow: 'hidden', cursor: onOpen ? 'pointer' : 'default', display: 'flex', flexDirection: 'column', gap: 14 }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexShrink: 0 }}>
          <span style={{ width: 40, height: 40, borderRadius: 12, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text)', background: 'var(--accent-soft)' }}>
            {isCms ? <IconLayers size={18} /> : isWeb ? <IconGlobe size={18} /> : <IconSmartphone size={18} />}
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div title={project.name} style={{ fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{project.name}</div>
            <div style={{ fontSize: 11.5, color: 'var(--color-text-secondary)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{isCms ? `CMS · ${cmsKindLabel(project.cmsKind)}` : projectTypeLabel(project.type)}</div>
          </div>
          <span style={{ flexShrink: 0, minWidth: 0, maxWidth: 120, overflow: 'hidden' }}>{pill && <Pill label={pill.label} tone={pill.tone} />}</span>
        </div>

        <ProjectSummary s={s} completion={completion} loading={summaryLoading} isCms={isCms} cmsCounts={cmsCounts} />

        <div style={{ display: 'flex', gap: 6, flexWrap: 'nowrap', overflow: 'hidden', height: 22, flexShrink: 0 }}>
          {shownTags.map((tg) => <Pill key={tg.label} label={tg.label} tone={tg.tone} />)}
          {moreTags.length > 0 && <span title={moreTags.map((tg) => tg.label).join(' · ')}><Pill label={`+${moreTags.length}`} tone="neutral" /></span>}
        </div>

        {(onOpen || canManage) && (
          <div style={{ display: 'flex', gap: 8, borderTop: '1px solid var(--color-border-primary)', paddingTop: 12, marginTop: 'auto', flexShrink: 0 }}>
            {onOpen && <button style={{ ...primaryButton(false), ...cardBtn }} onClick={stop(onOpen)}>Open</button>}
            {canManage && (
              <>
                <button style={{ ...ghostButton, ...cardBtn }} onClick={stop(() => setModal('manage'))}>Manage</button>
                <button style={{ ...ghostButton, ...cardBtn }} onClick={stop(() => setModal('edit'))} disabled={isSubmitting}>Edit</button>
                {canDelete && <button style={{ ...ghostButton, ...cardBtn, color: 'var(--danger)' }} onClick={stop(onDelete)} disabled={isSubmitting}>Delete</button>}
              </>
            )}
          </div>
        )}
      </div>

      {modal === 'edit' && canManage && (
        <EditProjectModal project={project} canMoveTeam={canMoveTeam} teams={teams} brands={brands} isSubmitting={isSubmitting} onUpdate={onUpdate} onClose={() => setModal(null)} />
      )}
      {modal === 'manage' && canManage && (
        <ManageProjectModal
          project={project}
          isAdmin={isAdmin}
          user={user}
          items={items}
          profiles={profiles}
          members={members}
          isSubmitting={isSubmitting}
          onAddItem={onAddItem}
          onDeleteItem={onDeleteItem}
          onAddMember={onAddMember}
          onUpdateMember={onUpdateMember}
          onRemoveMember={onRemoveMember}
          onClose={() => setModal(null)}
        />
      )}
    </>
  );
}

/* Edit a project's name, type, team and brand. */
function EditProjectModal({ project, canMoveTeam, teams, brands, isSubmitting, onUpdate, onClose }) {
  const [edit, setEdit] = useState({
    name: project.name,
    type: project.type,
    cmsKind: project.cmsKind || 'website',
    team: project.teamId || '',
    brand: project.brandId || '',
  });
  const set = (k, v) => setEdit((e) => ({ ...e, [k]: v }));
  const invalid = !edit.name.trim() || isSubmitting;
  async function save() {
    if (invalid) return;
    const patch = { name: edit.name.trim(), type: edit.type, platform: projectTypeLabel(edit.type) };
    if (edit.type === 'cms') patch.cms_kind = edit.cmsKind || 'website';
    if (edit.type === 'cms' && project.type !== 'cms' && project.wbsEnabled &&
      !window.confirm('CMS projects have no WBS. This project’s WBS will be hidden (its items are kept). Continue?')) return;
    if (canMoveTeam) patch.team_id = edit.team || null;
    if (brands.length) patch.brand_id = edit.brand || null;
    const ok = await onUpdate(project.id, patch);
    if (ok) onClose();
  }
  return (
    <ModalShell
      onClose={onClose}
      title="Edit project"
      subtitle={project.name}
      maxWidth={520}
      footer={(
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button style={ghostButton} onClick={onClose}>Cancel</button>
          <button style={primaryButton(invalid)} disabled={invalid} onClick={save}>{isSubmitting ? 'Saving…' : 'Save'}</button>
        </div>
      )}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <label style={labelStyle} htmlFor="edit-project-name">Name</label>
          <input id="edit-project-name" style={inputStyle} autoFocus value={edit.name} onChange={(e) => set('name', e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} />
        </div>
        <div>
          <label style={labelStyle} htmlFor="edit-project-type">Type</label>
          <select id="edit-project-type" style={inputStyle} value={edit.type} onChange={(e) => set('type', e.target.value)}>
            {PROJECT_TYPES.map((t) => <option key={t} value={t}>{projectTypeLabel(t)}</option>)}
          </select>
        </div>
        {edit.type === 'cms' && (
          <div>
            <label style={labelStyle}>CMS project type</label>
            <CmsKindSelect value={edit.cmsKind} onChange={(v) => set('cmsKind', v)} />
          </div>
        )}
        {canMoveTeam && (
          <div>
            <label style={labelStyle} htmlFor="edit-project-team">Team</label>
            <select id="edit-project-team" style={inputStyle} value={edit.team} onChange={(e) => set('team', e.target.value)}>
              <option value="">No team</option>
              {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
        )}
        {brands.length > 0 && (
          <div>
            <label style={labelStyle}>Brand</label>
            <BrandSelect brands={brands} value={edit.brand} onChange={(v) => set('brand', v)} />
          </div>
        )}
      </div>
    </ModalShell>
  );
}

/* A project's QA checklist, members and (Admins) client link. */
function ManageProjectModal({ project, isAdmin, user, items, profiles, members, isSubmitting, onAddItem, onDeleteItem, onAddMember, onUpdateMember, onRemoveMember, onClose }) {
  const [label, setLabel] = useState('');
  const typeColor = project.type === 'web' ? '#f59e0b' : '#10b981';
  function addItem() {
    if (!label.trim()) return;
    onAddItem(label.trim(), items.length);
    setLabel('');
  }
  return (
    <ModalShell
      onClose={onClose}
      title="Manage project"
      subtitle={project.name}
      maxWidth={720}
      footer={<div style={{ display: 'flex', justifyContent: 'flex-end' }}><button style={ghostButton} onClick={onClose}>Done</button></div>}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div>
          <div style={{ ...labelStyle, marginBottom: 8 }}>QA checklist</div>
          {items.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginBottom: 8 }}>
              No checklist items — QA can mark this release complete without a checklist.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
              {items.map((it) => (
                <div key={it.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, padding: '7px 10px', background: 'var(--color-background-secondary)', borderRadius: 8 }}>
                  <span style={{ color: typeColor }}>✓</span>
                  <span style={{ flex: 1 }}>{it.label}</span>
                  <button
                    onClick={() => onDeleteItem(it.id)}
                    style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: 11, fontFamily: 'inherit' }}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              style={{ ...inputStyle, flex: 1 }}
              value={label}
              placeholder="e.g. Smoke test passed"
              aria-label="New checklist item"
              onChange={(e) => setLabel(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addItem()}
            />
            <button style={ghostButton} disabled={!label.trim()} onClick={addItem}>Add item</button>
          </div>
        </div>

        <ProjectMembersSection
          project={project}
          profiles={profiles}
          members={members}
          canManage={managesProject(user, project)}
          currentUser={user}
          isSubmitting={isSubmitting}
          onAddMember={onAddMember}
          onUpdateMember={onUpdateMember}
          onRemoveMember={onRemoveMember}
        />

        {managesProject(user, project) && <ClientLinkSection projectId={project.id} />}
      </div>
    </ModalShell>
  );
}

export function ProjectMembersSection({
  project,
  profiles,
  members,
  canManage,
  currentUser,
  isSubmitting,
  onAddMember,
  onUpdateMember,
  onRemoveMember,
}) {
  const [adding, setAdding] = useState(false);
  const [pick, setPick] = useState('');
  const [role, setRole] = useState('developer');
  const [expires, setExpires] = useState('');

  const profileById = useMemo(() => {
    const m = {};
    (profiles || []).forEach((p) => (m[p.id] = p));
    return m;
  }, [profiles]);

  const memberUserIds = new Set(members.map((m) => m.userId));
  // anyone (from any team) who isn't already a member. Admins and Project
  // Managers see every project without being members, so they aren't offered.
  const addable = (profiles || [])
    .filter((p) => p.role !== 'Admin' && p.role !== PM_ROLE && !memberUserIds.has(p.id))
    .sort((a, b) => a.name.localeCompare(b.name));

  const home = members.filter((m) => m.accessType !== 'support');
  const support = members.filter((m) => m.accessType === 'support');

  const active = (m) => !m.expiresAt || new Date(m.expiresAt).getTime() > Date.now();
  const fmt = (iso) => (iso ? new Date(iso).toLocaleDateString() : null);

  function submitAdd() {
    if (!pick) return;
    const picked = profileById[pick];
    // a member from another team is a temporary "support" grant
    const accessType = picked && picked.teamId === project.teamId ? 'home' : 'support';
    onAddMember({
      project_id: project.id,
      user_id: pick,
      project_role: role,
      access_type: accessType,
      expires_at: accessType === 'support' && expires ? new Date(expires).toISOString() : null,
    });
    setPick('');
    setRole('developer');
    setExpires('');
    setAdding(false);
  }

  function extend(m) {
    const base = m.expiresAt && new Date(m.expiresAt) > new Date() ? new Date(m.expiresAt) : new Date();
    base.setDate(base.getDate() + 30);
    onUpdateMember(m.id, { expires_at: base.toISOString() });
  }

  const chip = (text, color) => (
    <span
      style={{
        fontSize: 10,
        fontWeight: 700,
        padding: '1px 7px',
        borderRadius: 999,
        color,
        background: `${color}1a`,
      }}
    >
      {text}
    </span>
  );

  const roleColor = { qa: '#6366F1', lead: '#d97706', developer: '#16a34a', viewer: '#64748b' };

  const memberRow = (m) => {
    const p = profileById[m.userId];
    const expired = !active(m);
    return (
      <div
        key={m.id}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 9,
          padding: '7px 0',
          borderTop: '1px solid var(--color-border-primary)',
          opacity: expired ? 0.5 : 1,
        }}
      >
        <Avatar name={p?.name || '?'} size={24} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12.5, fontWeight: 500 }}>{p?.name || 'Unknown user'}</div>
          <div style={{ fontSize: 10.5, color: 'var(--color-text-tertiary)' }}>
            {p?.email}
          </div>
        </div>
        {chip((m.projectRole || 'developer').toUpperCase(), roleColor[m.projectRole] || '#64748b')}
        {m.accessType === 'support' &&
          chip(m.expiresAt ? `until ${fmt(m.expiresAt)}` : 'no end date', expired ? '#dc2626' : '#7c3aed')}
        {canManage && (
          <div style={{ display: 'flex', gap: 6 }}>
            {m.accessType === 'support' && (
              <button
                style={{ ...ghostButton, padding: '3px 8px', fontSize: 11 }}
                disabled={isSubmitting}
                onClick={() => extend(m)}
                title="Extend access by 30 days"
              >
                +30d
              </button>
            )}
            <button
              style={{ ...ghostButton, padding: '3px 8px', fontSize: 11, color: '#dc2626', borderColor: '#dc262644' }}
              disabled={isSubmitting || m.userId === currentUser?.id}
              onClick={() => onRemoveMember(m.id)}
              title={m.userId === currentUser?.id ? "You can't remove yourself" : 'Remove from project'}
            >
              Remove
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{ marginTop: 14, borderTop: '0.5px solid var(--color-border-primary)', paddingTop: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <div style={{ ...labelStyle, margin: 0 }}>
          Members <span style={{ color: 'var(--color-text-tertiary)' }}>· {members.length}</span>
        </div>
        {canManage && (
          <button style={{ ...ghostButton, padding: '4px 10px', fontSize: 12 }} onClick={() => setAdding((v) => !v)}>
            {adding ? 'Cancel' : '+ Add member'}
          </button>
        )}
      </div>

      {adding && (
        <div style={{ ...card, padding: 12, marginBottom: 10, background: 'var(--color-background-secondary)' }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div style={{ flex: '2 1 180px' }}>
              <div style={{ ...labelStyle }}>Person (any team)</div>
              <select style={inputStyle} value={pick} onChange={(e) => setPick(e.target.value)}>
                <option value="">Select…</option>
                {addable.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} · {p.role}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ flex: '1 1 110px' }}>
              <div style={{ ...labelStyle }}>Role here</div>
              <select style={inputStyle} value={role} onChange={(e) => setRole(e.target.value)}>
                <option value="developer">Developer</option>
                <option value="qa">QA</option>
                <option value="lead">Lead</option>
                <option value="viewer">Viewer</option>
              </select>
            </div>
          </div>
          {pick && profileById[pick]?.teamId !== project.teamId && (
            <div style={{ marginTop: 8 }}>
              <div style={{ ...labelStyle }}>
                Support access ends <span style={{ color: 'var(--color-text-tertiary)' }}>(blank = no end date)</span>
              </div>
              <input type="date" style={{ ...inputStyle, width: 'auto' }} value={expires} onChange={(e) => setExpires(e.target.value)} />
              <div style={{ fontSize: 10.5, color: 'var(--color-text-tertiary)', marginTop: 4 }}>
                This person is from another team — they'll get temporary <strong>support</strong> access that expires on this date.
              </div>
            </div>
          )}
          <button style={{ ...primaryButton(!pick), marginTop: 10 }} disabled={!pick || isSubmitting} onClick={submitAdd}>
            Add to project
          </button>
        </div>
      )}

      {members.length === 0 ? (
        <div style={{ fontSize: 11.5, color: 'var(--color-text-tertiary)' }}>
          No members yet — only Admins can see this project until members are added.
        </div>
      ) : (
        <>
          {home.map(memberRow)}
          {support.length > 0 && (
            <>
              <div style={{ ...labelStyle, marginTop: 10, marginBottom: 0 }}>
                Support (temporary) <span style={{ color: 'var(--color-text-tertiary)' }}>· {support.length}</span>
              </div>
              {support.map(memberRow)}
            </>
          )}
        </>
      )}
    </div>
  );
}

function ClientLinkSection({ projectId }) {
  const [link, setLink] = useState(undefined); // undefined=loading, null=none
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .fetchClientLink(projectId)
      .then((l) => !cancelled && setLink(l || null))
      .catch(() => !cancelled && setLink(null));
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const url = link ? `${window.location.origin}/?client=${link.token}` : '';

  async function create() {
    setBusy(true);
    try {
      setLink(await api.createClientLink(projectId));
    } finally {
      setBusy(false);
    }
  }
  async function toggle() {
    if (!link) return;
    const v = !link.show_open_bugs;
    await api.updateClientLink(link.id, { show_open_bugs: v });
    setLink({ ...link, show_open_bugs: v });
  }
  async function revoke() {
    if (!link || !window.confirm('Revoke this client link? The shared URL will stop working.')) return;
    await api.deleteClientLink(link.id);
    setLink(null);
  }
  function copy() {
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--color-border-primary)' }}>
      <div style={{ ...labelStyle, marginBottom: 8 }}>Client portal link</div>
      {link === undefined ? (
        <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>Loading…</div>
      ) : !link ? (
        <button style={ghostButton} disabled={busy} onClick={create}>
          {busy ? 'Creating…' : 'Create client link'}
        </button>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 8 }}>
            <input readOnly value={url} style={{ ...inputStyle, flex: 1, fontSize: 11.5 }} onFocus={(e) => e.target.select()} />
            <button style={ghostButton} onClick={copy}>
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, fontSize: 12.5, cursor: 'pointer' }}>
            <input type="checkbox" checked={link.show_open_bugs} onChange={toggle} />
            Show open bug count to the client
          </label>
          <button
            onClick={revoke}
            style={{ ...ghostButton, marginTop: 10, padding: '5px 10px', fontSize: 12, color: '#dc2626', borderColor: '#dc262644' }}
          >
            Revoke link
          </button>
        </>
      )}
    </div>
  );
}


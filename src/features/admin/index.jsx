/* Admin feature — Users / Teams / Projects management (+ project members,
   client links). Moved verbatim out of ReleaseTracker.jsx (Phase 0). */
import { useState, useEffect, useMemo } from 'react';
import * as api from '@/api.js';
import { card, inputStyle, labelStyle, ghostButton, primaryButton, Avatar, ModalShell } from '@/ui.jsx';
import { Field } from '@shared/ui-kit.jsx';
import {
  ALLOWED_EMAIL_DOMAIN,
  PROJECT_TYPES,
  ROLES,
  TEAM_ASSIGNABLE_ROLES,
  projectTypeLabel,
  emailDomainOk,
} from '@/constants.js';
import { IconGlobe, IconPlus, IconSmartphone } from '@/icons.jsx';

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
  return (
    <div>
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
                  <div style={{ fontSize: 13.5, fontWeight: 600 }}>{t.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginTop: 2 }}>
                    {lead ? (
                      <span>
                        Lead: <span style={{ color: 'var(--color-text-primary)', fontWeight: 500 }}>{lead.name}</span>
                      </span>
                    ) : (
                      <span style={{ color: '#dc2626' }}>No team lead</span>
                    )}{' '}
                    · {members(t.id).length} member{members(t.id).length === 1 ? '' : 's'} · {projCount(t.id)} project
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
      teamId: form.teamId || null,
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
            <select style={inputStyle} value={form.teamId} onChange={(e) => set('teamId', e.target.value)}>
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
  isSubmitting,
  showToast,
  onUpdateMember,
  onCreateUser,
  refetchProfiles,
}) {
  const [busyId, setBusyId] = useState(null);
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
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

      {pageUsers.map((p) => {
        const isSelf = p.id === currentUser.id;
        // a team lead may only adjust Developers/QA in their own team
        const leadLocked =
          !isAdmin && (p.role === 'Admin' || p.role === 'Team Lead');
        const roleDisabled = isSelf || leadLocked || busyId === p.id;
        return (
          <div
            key={p.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '10px 12px',
              background: 'var(--color-background-secondary)',
              border: '0.5px solid var(--color-border-primary)',
              borderRadius: 10,
              flexWrap: 'wrap',
            }}
          >
            <Avatar name={p.name} role={p.role} />
            <div style={{ flex: 1, minWidth: 120 }}>
              <div style={{ fontSize: 13, fontWeight: 500 }}>
                {p.name}
                {isSelf && (
                  <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--color-text-secondary)', marginLeft: 6 }}>
                    (you)
                  </span>
                )}
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: 'var(--color-text-secondary)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {p.email}
              </div>
            </div>

            {isAdmin ? (
              <select
                style={selStyle}
                value={p.teamId || ''}
                disabled={busyId === p.id}
                onChange={(e) => patch(p.id, { team_id: e.target.value || null })}
                title="Team"
              >
                <option value="">No team</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            ) : (
              <span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>
                {p.teamId ? teamsById[p.teamId]?.name : '—'}
              </span>
            )}

            <select
              style={selStyle}
              value={p.role}
              disabled={roleDisabled}
              onChange={(e) => patch(p.id, { role: e.target.value })}
              title={leadLocked ? 'Only an admin can change this role' : 'Role'}
            >
              {/* keep the current role visible even if outside a lead's options */}
              {(roleOptions.includes(p.role) ? roleOptions : [p.role, ...roleOptions]).map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>

            {isAdmin && (
              <button
                onClick={() => removeUser(p)}
                disabled={isSelf || busyId === p.id}
                style={{
                  ...ghostButton,
                  padding: '6px 10px',
                  fontSize: 12,
                  color: isSelf ? 'var(--color-text-secondary)' : '#dc2626',
                  borderColor: isSelf ? 'var(--color-border-tertiary)' : '#dc262644',
                  opacity: isSelf ? 0.5 : 1,
                  cursor: isSelf ? 'default' : 'pointer',
                }}
              >
                Remove
              </button>
            )}
          </div>
        );
      })}
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
          ? 'New sign-ups join as Developer. Set each user’s team and role here; one Team Lead per team.'
          : 'You can set your team members between Developer and QA. Ask an admin to add or remove people.'}
      </div>
    </div>
  );
}

export function ProjectsTab({
  isAdmin,
  user,
  myTeamId,
  teams,
  teamsById,
  projects,
  releases,
  checklistItems,
  profiles,
  projectMembers,
  isSubmitting,
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
  const [form, setForm] = useState({
    name: '',
    type: 'mobile',
    team: isAdmin ? teams[0]?.id || '' : myTeamId || '',
  });
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const needsTeam = isAdmin && teams.length > 0;
  const invalid = !form.name.trim() || (needsTeam && !form.team);
  const releaseCount = (id) => releases.filter((r) => r.projectId === id).length;

  const [q, setQ] = useState('');
  const [teamFilter, setTeamFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [visible, setVisible] = useState(12);

  const filteredProjects = projects.filter(
    (p) =>
      p.name.toLowerCase().includes(q.trim().toLowerCase()) &&
      (teamFilter === 'all' ||
        (teamFilter === 'none' ? !p.teamId : p.teamId === teamFilter)) &&
      (typeFilter === 'all' || p.type === typeFilter)
  );
  const pageProjects = filteredProjects.slice(0, visible);
  const fSel = { ...inputStyle, width: 'auto', padding: '7px 10px', fontSize: 12 };

  function create() {
    if (invalid) return;
    onCreateProject({
      name: form.name.trim(),
      type: form.type,
      platform: projectTypeLabel(form.type),
      team_id: isAdmin ? form.team || null : myTeamId || null,
    });
    setForm({ name: '', type: 'mobile', team: isAdmin ? teams[0]?.id || '' : myTeamId || '' });
    setCreating(false);
  }

  return (
    <div>
      {/* header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 12,
        }}
      >
        <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--color-text-secondary)' }}>
          {filteredProjects.length === projects.length
            ? `${projects.length} project${projects.length === 1 ? '' : 's'}`
            : `${filteredProjects.length} of ${projects.length}`}
        </span>
        <button
          style={creating ? ghostButton : primaryButton(false)}
          onClick={() => setCreating((v) => !v)}
        >
          {creating ? 'Cancel' : '+ New project'}
        </button>
      </div>

      {/* search + filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <input
          style={{ ...inputStyle, flex: '1 1 160px', width: 'auto' }}
          value={q}
          placeholder="Search projects…"
          onChange={(e) => {
            setQ(e.target.value);
            setVisible(12);
          }}
        />
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
        <select style={fSel} value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
          <option value="all">All platforms</option>
          {PROJECT_TYPES.map((t) => (
            <option key={t} value={t}>
              {projectTypeLabel(t)}
            </option>
          ))}
        </select>
      </div>

      {/* create form (on demand) */}
      {creating && (
        <div
          className="anim-in"
          style={{
            ...card,
            padding: 14,
            background: 'var(--color-background-secondary)',
            marginBottom: 16,
            display: 'flex',
            gap: 10,
            alignItems: 'flex-end',
            flexWrap: 'wrap',
          }}
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
              {PROJECT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {projectTypeLabel(t)}
                </option>
              ))}
            </select>
          </div>
          {isAdmin && (
            <div style={{ flex: '1 1 150px' }}>
              <label style={labelStyle}>Team</label>
              <select style={inputStyle} value={form.team} onChange={(e) => set('team', e.target.value)}>
                <option value="">No team</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <button
            style={primaryButton(invalid || isSubmitting)}
            disabled={invalid || isSubmitting}
            onClick={create}
          >
            Create
          </button>
        </div>
      )}

      {/* accordion list */}
      {filteredProjects.length === 0 ? (
        <div
          style={{
            ...card,
            padding: 28,
            textAlign: 'center',
            fontSize: 13,
            color: 'var(--color-text-tertiary)',
          }}
        >
          {projects.length === 0 ? 'No projects yet — create your first one above.' : 'No projects match.'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {pageProjects.map((p) => (
            <ProjectRow
              key={p.id}
              project={p}
              isAdmin={isAdmin}
              user={user}
              teams={teams}
              teamName={p.teamId ? teamsById[p.teamId]?.name : null}
              releaseCount={releaseCount(p.id)}
              items={checklistItems.filter((c) => c.projectId === p.id)}
              profiles={profiles}
              members={projectMembers.filter((m) => m.projectId === p.id)}
              isSubmitting={isSubmitting}
              onUpdate={onUpdateProject}
              onDelete={() => onDeleteProject(p.id)}
              onAddItem={(label, pos) => onAddChecklistItem(p.id, label, pos)}
              onDeleteItem={onDeleteChecklistItem}
              onAddMember={onAddMember}
              onUpdateMember={onUpdateMember}
              onRemoveMember={onRemoveMember}
            />
          ))}
          {visible < filteredProjects.length && (
            <button
              style={{ ...ghostButton, width: '100%', marginTop: 4 }}
              onClick={() => setVisible((v) => v + 12)}
            >
              Load more ({filteredProjects.length - visible} left)
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function ProjectRow({
  project,
  isAdmin,
  user,
  teams,
  teamName,
  releaseCount,
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
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [edit, setEdit] = useState({
    name: project.name,
    type: project.type,
    team: project.teamId || '',
  });
  const [label, setLabel] = useState('');

  const isWeb = project.type === 'web';
  const typeColor = isWeb ? '#f59e0b' : '#10b981';

  function startEdit(e) {
    e.stopPropagation();
    setEdit({ name: project.name, type: project.type, team: project.teamId || '' });
    setEditing(true);
    setOpen(true);
  }
  async function saveEdit() {
    if (!edit.name.trim()) return;
    const patch = {
      name: edit.name.trim(),
      type: edit.type,
      platform: projectTypeLabel(edit.type),
    };
    if (isAdmin) patch.team_id = edit.team || null;
    const ok = await onUpdate(project.id, patch);
    if (ok) setEditing(false);
  }
  function addItem() {
    if (!label.trim()) return;
    onAddItem(label.trim(), items.length);
    setLabel('');
  }

  const iconBtn = (color) => ({
    ...ghostButton,
    padding: '5px 9px',
    fontSize: 12,
    color,
    borderColor: `${color}44`,
    boxShadow: 'none',
  });

  return (
    <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
      {/* header */}
      <div
        onClick={() => setOpen((o) => !o)}
        style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '12px 14px', cursor: 'pointer' }}
      >
        <span
          style={{
            width: 34,
            height: 34,
            borderRadius: 8,
            flexShrink: 0,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--color-text-secondary)',
            background: 'var(--color-background-secondary)',
            border: '1px solid var(--color-border-tertiary)',
          }}
        >
          {isWeb ? <IconGlobe size={17} /> : <IconSmartphone size={17} />}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 7 }}>
            {project.name}
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: teamName ? 'var(--brand)' : 'var(--color-text-tertiary)',
                background: teamName ? 'var(--brand-soft)' : 'var(--color-background-secondary)',
                padding: '2px 7px',
                borderRadius: 999,
              }}
            >
              {teamName || 'No team'}
            </span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>
            {projectTypeLabel(project.type)} · {releaseCount} release
            {releaseCount === 1 ? '' : 's'} · {items.length} checklist item
            {items.length === 1 ? '' : 's'}
          </div>
        </div>
        <button style={iconBtn('var(--brand)')} onClick={startEdit} disabled={isSubmitting}>
          Edit
        </button>
        <button
          style={iconBtn('#dc2626')}
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          disabled={isSubmitting}
        >
          Delete
        </button>
        <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', width: 12, textAlign: 'center' }}>
          {open ? '▾' : '▸'}
        </span>
      </div>

      {/* expanded */}
      {open && (
        <div style={{ padding: '0 14px 14px', borderTop: '0.5px solid var(--color-border-primary)' }}>
          {editing && (
            <div
              style={{
                display: 'flex',
                gap: 10,
                alignItems: 'flex-end',
                flexWrap: 'wrap',
                padding: '14px 0',
                borderBottom: '0.5px solid var(--color-border-primary)',
                marginBottom: 14,
              }}
            >
              <div style={{ flex: '2 1 180px' }}>
                <label style={labelStyle}>Name</label>
                <input
                  style={inputStyle}
                  value={edit.name}
                  onChange={(e) => setEdit((s) => ({ ...s, name: e.target.value }))}
                  onKeyDown={(e) => e.key === 'Enter' && saveEdit()}
                />
              </div>
              <div style={{ flex: '1 1 140px' }}>
                <label style={labelStyle}>Type</label>
                <select
                  style={inputStyle}
                  value={edit.type}
                  onChange={(e) => setEdit((s) => ({ ...s, type: e.target.value }))}
                >
                  {PROJECT_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {projectTypeLabel(t)}
                    </option>
                  ))}
                </select>
              </div>
              {isAdmin && (
                <div style={{ flex: '1 1 140px' }}>
                  <label style={labelStyle}>Team</label>
                  <select
                    style={inputStyle}
                    value={edit.team}
                    onChange={(e) => setEdit((s) => ({ ...s, team: e.target.value }))}
                  >
                    <option value="">No team</option>
                    {teams.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <button style={ghostButton} onClick={() => setEditing(false)}>
                Cancel
              </button>
              <button
                style={primaryButton(!edit.name.trim() || isSubmitting)}
                disabled={!edit.name.trim() || isSubmitting}
                onClick={saveEdit}
              >
                Save
              </button>
            </div>
          )}

          <div style={{ paddingTop: editing ? 0 : 14 }}>
            <div style={{ ...labelStyle, marginBottom: 8 }}>QA checklist</div>
            {items.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginBottom: 8 }}>
                No checklist items — QA can mark this release complete without a checklist.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
                {items.map((it) => (
                  <div
                    key={it.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      fontSize: 12.5,
                      padding: '7px 10px',
                      background: 'var(--color-background-secondary)',
                      borderRadius: 8,
                    }}
                  >
                    <span style={{ color: typeColor }}>✓</span>
                    <span style={{ flex: 1 }}>{it.label}</span>
                    <button
                      onClick={() => onDeleteItem(it.id)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#dc2626',
                        cursor: 'pointer',
                        fontSize: 11,
                        fontFamily: 'inherit',
                      }}
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
                onChange={(e) => setLabel(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addItem()}
              />
              <button style={ghostButton} disabled={!label.trim()} onClick={addItem}>
                Add item
              </button>
            </div>
          </div>

          <ProjectMembersSection
            project={project}
            profiles={profiles}
            members={members}
            canManage={isAdmin || (user?.role === 'Team Lead' && user?.teamId === project.teamId)}
            currentUser={user}
            isSubmitting={isSubmitting}
            onAddMember={onAddMember}
            onUpdateMember={onUpdateMember}
            onRemoveMember={onRemoveMember}
          />

          {isAdmin && <ClientLinkSection projectId={project.id} />}
        </div>
      )}
    </div>
  );
}

function ProjectMembersSection({
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
  // anyone (from any team) who isn't already a member and isn't an Admin
  const addable = (profiles || [])
    .filter((p) => p.role !== 'Admin' && !memberUserIds.has(p.id))
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

  const roleColor = { qa: '#2563eb', lead: '#d97706', developer: '#16a34a', viewer: '#64748b' };

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


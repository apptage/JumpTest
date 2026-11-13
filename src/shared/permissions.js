/* Who manages what. Mirrors public.manages_project() and the project rules in
   the database (202611110001_project_manager_role.sql), which are the real guard:
     Admin            every project, plus users, teams and brands
     Project Manager  every project (never on a team, never a project member)
     Team Lead        their own team's projects */
export const PM_ROLE = 'Project Manager';

export function isPm(user) {
  return user?.role === PM_ROLE;
}

/* Roles that manage projects at all (who sees Manage, Analytics, …). */
export function isManagerRole(role) {
  return role === 'Admin' || role === 'Team Lead' || role === PM_ROLE;
}

export function managesProject(user, project) {
  if (!user || !project) return false;
  if (user.role === 'Admin' || user.role === PM_ROLE) return true;
  if (user.role === 'Team Lead') return !!project.teamId && project.teamId === (user.teamId ?? null);
  return false;
}

export function canCreateProjects(user) {
  return user?.role === 'Admin' || user?.role === 'Team Lead' || user?.role === PM_ROLE;
}

/* Delete a project, or move it to another team. */
export function canDeleteProjects(user) {
  return user?.role === 'Admin' || user?.role === PM_ROLE;
}
export const canMoveProjectTeam = canDeleteProjects;

/* Sees every project and the whole organisation's numbers (with a team filter). */
export function hasOrgScope(user) {
  return user?.role === 'Admin' || user?.role === 'Manager' || user?.role === PM_ROLE;
}

/* Edit someone's name and email. Mirrors enforce_profile_details() in
   202611130001_edit_user_details.sql and the admin-update-user function:
     Admin            anyone
     Project Manager  anyone except an Admin
     Team Lead        Developers and QA on their own team
   Everyone can edit their own details. */
export function canEditUserDetails(user, target) {
  if (!user || !target) return false;
  if (user.id === target.id) return true;
  if (user.role === 'Admin') return true;
  if (user.role === PM_ROLE) return target.role !== 'Admin';
  if (user.role === 'Team Lead') {
    return (target.role === 'Developer' || target.role === 'QA') && !!user.teamId && target.teamId === user.teamId;
  }
  return false;
}

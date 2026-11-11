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

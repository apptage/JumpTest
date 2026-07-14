import { supabase } from './supabaseClient.js';

/* ------------------------------------------------------------------ */
/* Mappers (snake_case -> camelCase)                                  */
/* ------------------------------------------------------------------ */

export function mapProfile(p) {
  return {
    id: p.id,
    email: p.email,
    name: p.name,
    role: p.role,
    teamId: p.team_id ?? null,
  };
}

export function mapProject(p) {
  return {
    id: p.id,
    name: p.name,
    type: p.type,
    platform: p.platform,
    teamId: p.team_id ?? null,
    wbsEnabled: !!p.wbs_enabled,
    createdAt: p.created_at,
  };
}

export function mapTeam(t) {
  return { id: t.id, name: t.name, createdAt: t.created_at };
}

export function mapRelease(r) {
  return {
    id: r.id,
    projectId: r.project_id,
    version: r.version,
    releaseType: r.release_type,
    platform: r.platform,
    environment: r.environment || 'Production',
    component: r.component || '',
    fileUrl: r.file_url,
    linkUrl: r.link_url,
    submittedBy: r.submitted_by,
    submittedByRole: r.submitted_by_role,
    submittedById: r.submitted_by_id,
    assignedQa: r.assigned_qa,
    date: r.date,
    releaseNotes: r.release_notes,
    status: r.status,
    qaNote: r.qa_note,
    qaCompletedAt: r.qa_completed_at,
    statusChangedAt: r.status_changed_at,
    qaAssignedAt: r.qa_assigned_at,
    supersedesReleaseId: r.supersedes_release_id || null,
    closedAt: r.closed_at || null,
    wbsPlatformId: r.wbs_platform_id || null,
    createdAt: r.created_at,
  };
}

export function mapBug(b) {
  return {
    id: b.id,
    releaseId: b.release_id,
    title: b.title,
    description: b.description,
    severity: b.severity,
    screenshotUrl: b.screenshot_url,
    status: b.status,
    tags: Array.isArray(b.tags) ? b.tags : [],
    feature: b.feature || '',
    resolution: b.resolution || '',
    resolutionById: b.resolution_by_id || null,
    wbsTaskId: b.wbs_task_id || null,
    bugKey: b.bug_key || null,
    originReleaseId: b.origin_release_id || null,
    carriedFromReleaseId: b.carried_from_release_id || null,
    carriedForward: !!b.carried_forward,
    iteration: b.iteration || 1,
    verifiedAt: b.verified_at || null,
    verifiedById: b.verified_by_id || null,
    createdBy: b.created_by,
    createdById: b.created_by_id,
    createdAt: b.created_at,
  };
}

export function mapComment(c) {
  return {
    id: c.id,
    releaseId: c.release_id,
    parentId: c.parent_id,
    authorId: c.author_id,
    authorName: c.author_name,
    authorRole: c.author_role,
    body: c.body,
    createdAt: c.created_at,
  };
}

export function mapNotification(n) {
  return {
    id: n.id,
    userId: n.user_id,
    type: n.type,
    title: n.title || '',
    message: n.message,
    releaseId: n.release_id,
    bugId: n.bug_id || null,
    data: n.data || {},
    link: n.link || '',
    read: n.read,
    createdAt: n.created_at,
  };
}

export function mapUserDevice(d) {
  return {
    id: d.id,
    userId: d.user_id,
    token: d.fcm_token,
    platform: d.platform,
    userAgent: d.user_agent || '',
    enabled: d.enabled,
    lastSeenAt: d.last_seen_at,
    createdAt: d.created_at,
  };
}

export function mapChecklistItem(i) {
  return {
    id: i.id,
    projectId: i.project_id,
    label: i.label,
    position: i.position,
  };
}

export function mapProjectMember(m) {
  return {
    id: m.id,
    projectId: m.project_id,
    userId: m.user_id,
    projectRole: m.project_role,
    accessType: m.access_type, // 'home' | 'support'
    expiresAt: m.expires_at || null,
    grantedBy: m.granted_by || null,
    createdAt: m.created_at,
  };
}

/* ------------------------------------------------------------------ */
/* Project membership (visibility + submit + QA eligibility unit)      */
/* ------------------------------------------------------------------ */

// A membership grants access while it has no expiry or hasn't expired yet.
export function membershipActive(m) {
  return !m.expiresAt || new Date(m.expiresAt).getTime() > Date.now();
}

export async function fetchProjectMembers() {
  const { data, error } = await supabase.from('project_members').select('*');
  if (error) throw error;
  return data.map(mapProjectMember);
}

export async function addProjectMember(payload) {
  const { error } = await supabase.from('project_members').insert(payload);
  if (error) throw error;
}

export async function updateProjectMember(id, patch) {
  const { error } = await supabase.from('project_members').update(patch).eq('id', id);
  if (error) throw error;
}

export async function removeProjectMember(id) {
  const { error } = await supabase.from('project_members').delete().eq('id', id);
  if (error) throw error;
}

/* ------------------------------------------------------------------ */
/* Profiles                                                           */
/* ------------------------------------------------------------------ */

export async function fetchProfileById(userId) {
  for (let i = 0; i < 4; i++) {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();
    if (data) return mapProfile(data);
    await new Promise((r) => setTimeout(r, 400));
  }
  return null;
}

// Fetch the caller's profile, self-healing if the signup trigger missed it.
export async function ensureProfile(session) {
  const existing = await fetchProfileById(session.user.id);
  if (existing) return existing;
  const metaRole = session.user.user_metadata?.role;
  const role = metaRole === 'QA' ? 'QA' : 'Developer'; // never Admin/Team Lead
  try {
    await supabase.from('profiles').insert({
      id: session.user.id,
      email: session.user.email,
      name:
        session.user.user_metadata?.name ||
        (session.user.email || '').split('@')[0] ||
        'User',
      role,
    });
  } catch (_) {
    // ignore — may race with the trigger; we re-fetch below
  }
  return fetchProfileById(session.user.id);
}

export async function adminDeleteUser(id) {
  const { error } = await supabase.rpc('admin_delete_user', { target: id });
  if (error) throw error;
}

// Admin creates a fully-provisioned account for any role via Edge Function.
// (No confirmation email is sent, so this also avoids the email rate limit.)
export async function adminCreateUser(payload) {
  const { data, error } = await supabase.functions.invoke('admin-create-user', {
    body: payload,
  });
  if (error) {
    // surface the function's JSON error body when present
    let msg = error.message;
    try {
      const body = await error.context?.json?.();
      if (body?.error) msg = body.error;
    } catch (_) {
      /* ignore */
    }
    throw new Error(msg);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

export async function fetchProfiles() {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data.map(mapProfile);
}

export async function updateProfile(id, patch) {
  const { error } = await supabase.from('profiles').update(patch).eq('id', id);
  if (error) throw error;
}

/* ------------------------------------------------------------------ */
/* Teams                                                              */
/* ------------------------------------------------------------------ */

export async function fetchTeams() {
  const { data, error } = await supabase
    .from('teams')
    .select('*')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data.map(mapTeam);
}

/* ------------------------------------------------------------------ */
/* Client share links + public read-only status                       */
/* ------------------------------------------------------------------ */

export async function fetchClientLink(projectId) {
  const { data, error } = await supabase
    .from('client_links')
    .select('*')
    .eq('project_id', projectId)
    .maybeSingle();
  if (error) throw error;
  return data; // { id, project_id, token, show_open_bugs } | null
}

export async function createClientLink(projectId) {
  const { data, error } = await supabase
    .from('client_links')
    .insert({ project_id: projectId })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateClientLink(id, patch) {
  const { error } = await supabase.from('client_links').update(patch).eq('id', id);
  if (error) throw error;
}

export async function deleteClientLink(id) {
  const { error } = await supabase.from('client_links').delete().eq('id', id);
  if (error) throw error;
}

export async function fetchPublicStatus(token) {
  const { data, error } = await supabase.rpc('public_project_status', { p_token: token });
  if (error) throw error;
  return data; // null if token invalid
}

/* ------------------------------------------------------------------ */
/* WBS (work breakdown structure)                                     */
/* ------------------------------------------------------------------ */

export function mapWbsTask(t) {
  return {
    id: t.id,
    projectId: t.project_id,
    importKey: t.import_key,
    platform: t.platform || null,
    section: t.section || '',
    platformId: t.platform_id || null,
    moduleId: t.module_id || null,
    type: t.type,
    name: t.name,
    devComments: t.dev_comments || '',
    backendStatus: t.backend_status,
    frontendStatus: t.frontend_status,
    estDate: t.est_date || '',
    position: t.position,
  };
}

export function mapWbsPlatform(p) {
  return {
    id: p.id,
    projectId: p.project_id,
    name: p.name,
    importPlatform: p.import_platform || null,
    position: p.position,
  };
}

export function mapWbsModule(m) {
  return {
    id: m.id,
    projectId: m.project_id,
    platformId: m.platform_id,
    name: m.name,
    importSection: m.import_section || null,
    position: m.position,
  };
}

export async function fetchWbsTasks(projectId) {
  const { data, error } = await supabase
    .from('wbs_tasks')
    .select('*')
    .eq('project_id', projectId)
    .order('position', { ascending: true });
  if (error) throw error;
  return data.map(mapWbsTask);
}

// non-milestone tasks for a specific WBS platform (release task-picker source)
export async function fetchWbsTasksForPlatform(projectId, platformId) {
  const { data, error } = await supabase
    .from('wbs_tasks')
    .select('*')
    .eq('project_id', projectId)
    .eq('platform_id', platformId)
    .order('position', { ascending: true });
  if (error) throw error;
  return data.map(mapWbsTask);
}

export async function fetchWbsPlatforms(projectId) {
  const { data, error } = await supabase
    .from('wbs_platforms')
    .select('*')
    .eq('project_id', projectId)
    .order('position', { ascending: true });
  if (error) throw error;
  return data.map(mapWbsPlatform);
}

// Structured tree: platforms → modules → tasks (+ per-platform milestones),
// assembled client-side from three ordered selects.
export async function fetchWbsTree(projectId) {
  const [plats, mods, tasks] = await Promise.all([
    fetchWbsPlatforms(projectId),
    supabase.from('wbs_modules').select('*').eq('project_id', projectId).order('position', { ascending: true }),
    fetchWbsTasks(projectId),
  ]);
  if (mods.error) throw mods.error;
  const modules = mods.data.map(mapWbsModule);
  const tasksByModule = {};
  const milestonesByPlatform = {};
  tasks.forEach((t) => {
    if (t.type === 'milestone') {
      (milestonesByPlatform[t.platformId] = milestonesByPlatform[t.platformId] || []).push(t);
    } else if (t.moduleId) {
      (tasksByModule[t.moduleId] = tasksByModule[t.moduleId] || []).push(t);
    }
  });
  const modulesByPlatform = {};
  modules.forEach((m) => {
    (modulesByPlatform[m.platformId] = modulesByPlatform[m.platformId] || []).push({
      ...m,
      tasks: tasksByModule[m.id] || [],
    });
  });
  return {
    platforms: plats.map((p) => ({
      ...p,
      modules: modulesByPlatform[p.id] || [],
      milestones: milestonesByPlatform[p.id] || [],
    })),
  };
}

/* ---- WBS platform CRUD + reorder ---- */
export async function createWbsPlatform(projectId, { name, position = 0, importPlatform = null }) {
  const { data, error } = await supabase
    .from('wbs_platforms')
    .insert({ project_id: projectId, name, position, import_platform: importPlatform })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}
export async function updateWbsPlatform(id, patch) {
  // rename never touches import_platform (the stable re-import match key)
  const { error } = await supabase.from('wbs_platforms').update(patch).eq('id', id);
  if (error) throw error;
  // mirror name into the wbs_tasks.platform text cache (RPC/client read it)
  if (patch.name != null) {
    await supabase.from('wbs_tasks').update({ platform: patch.name }).eq('platform_id', id);
  }
}
export async function deleteWbsPlatform(id) {
  // cascades to modules; tasks' platform_id/module_id → SET NULL (caller handles reparent/confirm)
  const { error } = await supabase.from('wbs_platforms').delete().eq('id', id);
  if (error) throw error;
}
export async function reorderWbsPlatforms(orderedIds) {
  await reorderRows('wbs_platforms', orderedIds);
}

/* ---- WBS module CRUD + reorder + move ---- */
export async function createWbsModule(projectId, platformId, { name, position = 0, importSection = null }) {
  const { data, error } = await supabase
    .from('wbs_modules')
    .insert({ project_id: projectId, platform_id: platformId, name, position, import_section: importSection })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}
export async function updateWbsModule(id, patch) {
  const { error } = await supabase.from('wbs_modules').update(patch).eq('id', id);
  if (error) throw error;
  // mirror name into the wbs_tasks.section text cache
  if (patch.name != null) {
    await supabase.from('wbs_tasks').update({ section: patch.name }).eq('module_id', id);
  }
}
export async function moveWbsModule(id, toPlatformId, toPlatformName, position = 0) {
  const { error } = await supabase
    .from('wbs_modules')
    .update({ platform_id: toPlatformId, position })
    .eq('id', id);
  if (error) throw error;
  // child tasks follow the module to the new platform (+ mirror platform text)
  await supabase
    .from('wbs_tasks')
    .update({ platform_id: toPlatformId, platform: toPlatformName })
    .eq('module_id', id);
}
export async function deleteWbsModule(id) {
  const { error } = await supabase.from('wbs_modules').delete().eq('id', id);
  if (error) throw error;
}
export async function reorderWbsModules(orderedIds) {
  await reorderRows('wbs_modules', orderedIds);
}

// generic reorder: rewrite position = index for a sibling set
async function reorderRows(table, orderedIds) {
  if (!orderedIds || !orderedIds.length) return;
  const results = await Promise.all(
    orderedIds.map((id, i) => supabase.from(table).update({ position: i }).eq('id', id))
  );
  const failed = results.find((r) => r.error);
  if (failed) throw failed.error;
}

// Additive re-import: the portal is the source of truth after in-portal edits.
// Existing tasks (matched by import_key) are left untouched; only newly-detected
// platforms/modules/tasks are inserted. Never overwrites edits, never deletes.
export async function importWbs(projectId, parsed) {
  const [existingTasks, existingPlats, modRes] = await Promise.all([
    fetchWbsTasks(projectId),
    fetchWbsPlatforms(projectId),
    supabase.from('wbs_modules').select('*').eq('project_id', projectId),
  ]);
  if (modRes.error) throw modRes.error;
  const existingMods = modRes.data.map(mapWbsModule);

  const taskKeys = new Set(existingTasks.map((t) => t.importKey));
  const NULLKEY = '|null';
  const platByImport = {};
  existingPlats.forEach((p) => (platByImport[p.importPlatform ?? NULLKEY] = p));
  const modByKey = {};
  existingMods.forEach((m) => (modByKey[`${m.platformId}|${m.importSection ?? ''}`] = m));

  let addedPlatforms = 0;
  let addedModules = 0;
  let addedTasks = 0;
  let platPos = existingPlats.length;
  const modPos = {}; // platformId -> next module position
  const taskPos = {}; // moduleId|'ms' -> next task position

  const resolvePlatform = async (sheetPlatform) => {
    const key = sheetPlatform ?? NULLKEY;
    if (platByImport[key]) return platByImport[key];
    const name = sheetPlatform || 'General';
    const byName = existingPlats.find((p) => p.name === name);
    if (byName) return (platByImport[key] = byName);
    const id = await createWbsPlatform(projectId, { name, position: platPos++, importPlatform: sheetPlatform });
    const p = { id, projectId, name, importPlatform: sheetPlatform, position: platPos - 1 };
    existingPlats.push(p);
    addedPlatforms++;
    return (platByImport[key] = p);
  };
  const resolveModule = async (platform, sheetSection) => {
    const key = `${platform.id}|${sheetSection ?? ''}`;
    if (modByKey[key]) return modByKey[key];
    const name = sheetSection || 'General';
    const byName = existingMods.find((m) => m.platformId === platform.id && m.name === name);
    if (byName) return (modByKey[key] = byName);
    if (modPos[platform.id] == null)
      modPos[platform.id] = existingMods.filter((m) => m.platformId === platform.id).length;
    const pos = modPos[platform.id]++;
    const id = await createWbsModule(projectId, platform.id, { name, position: pos, importSection: sheetSection });
    const m = { id, projectId, platformId: platform.id, name, importSection: sheetSection, position: pos };
    existingMods.push(m);
    addedModules++;
    return (modByKey[key] = m);
  };

  const newRows = [];
  for (const p of parsed) {
    if (taskKeys.has(p.import_key)) continue; // portal wins
    const platform = await resolvePlatform(p.platform);
    let moduleId = null;
    let sectionText = p.section || 'Milestones';
    if (p.type !== 'milestone') {
      const mod = await resolveModule(platform, p.section);
      moduleId = mod.id;
      sectionText = mod.name;
    }
    const bucket = moduleId || 'ms';
    if (taskPos[bucket] == null)
      taskPos[bucket] = existingTasks.filter((t) => (t.moduleId || 'ms') === bucket).length;
    newRows.push({
      project_id: projectId,
      import_key: p.import_key,
      platform: platform.name,
      section: sectionText,
      platform_id: platform.id,
      module_id: moduleId,
      type: p.type,
      name: p.name,
      dev_comments: '',
      backend_status: 'not_started',
      frontend_status: 'not_started',
      est_date: p.est_date,
      position: taskPos[bucket]++,
    });
    taskKeys.add(p.import_key);
    addedTasks++;
  }

  if (newRows.length) {
    const { error } = await supabase.from('wbs_tasks').insert(newRows);
    if (error) throw error;
  }
  await supabase.from('projects').update({ wbs_enabled: true }).eq('id', projectId);
  return { addedTasks, addedModules, addedPlatforms };
}

export async function updateWbsTask(id, patch) {
  const { error } = await supabase.from('wbs_tasks').update(patch).eq('id', id);
  if (error) throw error;
}

// set a status on a set of tasks for a track ('backend' | 'frontend' | 'both')
export async function setWbsTrackStatus(taskIds, track, status) {
  if (!taskIds.length) return;
  const patch = {};
  if (track === 'backend' || track === 'both') patch.backend_status = status;
  if (track === 'frontend' || track === 'both') patch.frontend_status = status;
  const { error } = await supabase.from('wbs_tasks').update(patch).in('id', taskIds);
  if (error) throw error;
}

/* ---- WBS task CRUD + reorder + move (portal editing) ---- */
export async function createWbsTask(projectId, task) {
  const {
    platformId,
    moduleId = null,
    type = 'task',
    name,
    estDate = '',
    position = 0,
    platformName = '',
    moduleName = '',
  } = task;
  const importKey = 'portal:' + crypto.randomUUID(); // never matched by sheet re-import
  const { data, error } = await supabase
    .from('wbs_tasks')
    .insert({
      project_id: projectId,
      import_key: importKey,
      platform: platformName,
      section: type === 'milestone' ? 'Milestones' : moduleName,
      platform_id: platformId,
      module_id: type === 'milestone' ? null : moduleId,
      type,
      name,
      dev_comments: '',
      backend_status: 'not_started',
      frontend_status: 'not_started',
      est_date: estDate,
      position,
    })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}
export async function deleteWbsTask(id) {
  // release_tasks.task_id → SET NULL keeps the name snapshot; linked bugs degrade gracefully
  const { error } = await supabase.from('wbs_tasks').delete().eq('id', id);
  if (error) throw error;
}
export async function reorderWbsTasks(orderedIds) {
  await reorderRows('wbs_tasks', orderedIds);
}
export async function moveWbsTask(id, { moduleId, platformId, platformName, moduleName, position = 0 }) {
  const { error } = await supabase
    .from('wbs_tasks')
    .update({
      module_id: moduleId,
      platform_id: platformId,
      platform: platformName,
      section: moduleName,
      position,
    })
    .eq('id', id);
  if (error) throw error;
}

// Delete a project's entire WBS. Release history (release_tasks name snapshots)
// and releases.wbs_platform_id survive via ON DELETE SET NULL.
export async function deleteWbs(projectId) {
  let { error } = await supabase.from('wbs_tasks').delete().eq('project_id', projectId);
  if (error) throw error;
  ({ error } = await supabase.from('wbs_modules').delete().eq('project_id', projectId));
  if (error) throw error;
  ({ error } = await supabase.from('wbs_platforms').delete().eq('project_id', projectId));
  if (error) throw error;
  await supabase.from('projects').update({ wbs_enabled: false }).eq('id', projectId);
}

/* ------------------------------------------------------------------ */
/* Release ↔ WBS task links                                           */
/* ------------------------------------------------------------------ */

export async function createReleaseTasks(releaseId, items) {
  if (!items.length) return;
  const rows = items.map((it) => ({
    release_id: releaseId,
    task_id: it.taskId,
    task_name: it.taskName,
    track: it.track,
  }));
  const { error } = await supabase.from('release_tasks').insert(rows);
  if (error) throw error;
}

// which of these release ids are closed (superseded)?  bugs now has several
// FKs to releases, so we resolve this with a plain second query rather than an
// (ambiguous) embed.
async function closedReleaseIdSet(releaseIds) {
  const ids = [...new Set((releaseIds || []).filter(Boolean))];
  if (!ids.length) return new Set();
  const { data, error } = await supabase.from('releases').select('id, status').in('id', ids);
  if (error) throw error;
  return new Set(data.filter((r) => r.status === 'closed').map((r) => r.id));
}

// open (non-verified) bug counts per WBS task, across active (non-closed) releases
export async function fetchOpenBugCountsByTask(taskIds) {
  if (!taskIds || taskIds.length === 0) return {};
  const { data, error } = await supabase
    .from('bugs')
    .select('wbs_task_id, status, release_id')
    .in('wbs_task_id', taskIds)
    .neq('status', 'verified');
  if (error) throw error;
  const closed = await closedReleaseIdSet(data.map((b) => b.release_id));
  const m = {};
  data.forEach((b) => {
    if (b.wbs_task_id && !closed.has(b.release_id)) m[b.wbs_task_id] = (m[b.wbs_task_id] || 0) + 1;
  });
  return m;
}

// open (non-verified) bugs linked to a set of WBS tasks, for task detail views
export async function fetchBugsByTaskIds(taskIds) {
  if (!taskIds || taskIds.length === 0) return [];
  const { data, error } = await supabase
    .from('bugs')
    .select('id, title, severity, status, wbs_task_id, release_id')
    .in('wbs_task_id', taskIds)
    .neq('status', 'verified')
    .order('created_at', { ascending: false });
  if (error) throw error;
  const closed = await closedReleaseIdSet(data.map((b) => b.release_id));
  return data
    .filter((b) => !closed.has(b.release_id))
    .map((b) => ({
      id: b.id,
      title: b.title,
      severity: b.severity,
      status: b.status,
      wbsTaskId: b.wbs_task_id,
    }));
}

export async function fetchReleaseTasks(releaseId) {
  const { data, error } = await supabase
    .from('release_tasks')
    .select('*')
    .eq('release_id', releaseId);
  if (error) throw error;
  return data.map((r) => ({
    id: r.id,
    releaseId: r.release_id,
    taskId: r.task_id,
    taskName: r.task_name,
    track: r.track,
  }));
}

export async function createTeam(name) {
  const { error } = await supabase.rpc('admin_create_team', { p_name: name });
  if (error) throw error;
}

export async function deleteTeam(id) {
  const { error } = await supabase.rpc('admin_delete_team', { p_id: id });
  if (error) throw error;
}

/* ------------------------------------------------------------------ */
/* Projects                                                           */
/* ------------------------------------------------------------------ */

export async function fetchProjects() {
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data.map(mapProject);
}

export async function createProject(p) {
  const { data, error } = await supabase
    .from('projects')
    .insert({
      name: p.name,
      type: p.type,
      platform: p.platform,
      team_id: p.team_id ?? null,
    })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

export async function updateProject(id, patch) {
  const { error } = await supabase.from('projects').update(patch).eq('id', id);
  if (error) throw error;
}

export async function deleteProject(id) {
  const { error } = await supabase.from('projects').delete().eq('id', id);
  if (error) throw error;
}

/* ------------------------------------------------------------------ */
/* Releases                                                           */
/* ------------------------------------------------------------------ */

export async function fetchReleases() {
  const { data, error } = await supabase
    .from('releases')
    .select('*')
    .order('date', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data.map(mapRelease);
}

export async function createRelease(payload) {
  const { data, error } = await supabase.from('releases').insert(payload).select('id').single();
  if (error) throw error;
  return data.id;
}

export async function updateRelease(id, patch) {
  const { error } = await supabase.from('releases').update(patch).eq('id', id);
  if (error) throw error;
}

export async function deleteRelease(id) {
  const { error } = await supabase.from('releases').delete().eq('id', id);
  if (error) throw error;
}

// Archive a release as terminal/read-only.
export async function closeRelease(id) {
  const { error } = await supabase
    .from('releases')
    .update({ status: 'closed', closed_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

// Copy unresolved bugs from a closed release onto its successor, preserving
// stable identity (bug_key) and lineage. Verified bugs stay behind as history.
//  - fixed (not yet verified) → carried as 'fixed' (pending verification)
//  - open / in_progress / disputed → carried as 'open' (unresolved)
export async function carryForwardBugs(fromReleaseId, toReleaseId) {
  const { data: src, error } = await supabase
    .from('bugs')
    .select('*')
    .eq('release_id', fromReleaseId)
    .neq('status', 'verified');
  if (error) throw error;
  const carry = (src || []).filter((b) => b.status !== 'verified');
  if (!carry.length) return { carried: 0, pendingVerify: 0, unresolved: 0 };

  const rows = carry.map((b) => ({
    release_id: toReleaseId,
    title: b.title,
    description: b.description,
    severity: b.severity,
    screenshot_url: b.screenshot_url,
    status: b.status === 'fixed' ? 'fixed' : 'open',
    feature: b.feature || null,
    tags: Array.isArray(b.tags) ? b.tags : [],
    wbs_task_id: b.wbs_task_id || null,
    resolution: null,
    bug_key: b.bug_key,
    origin_release_id: b.origin_release_id || b.release_id,
    carried_from_release_id: fromReleaseId,
    carried_forward: true,
    iteration: (b.iteration || 1) + 1,
    created_by: b.created_by,
    created_by_id: b.created_by_id,
  }));
  const { error: insErr } = await supabase.from('bugs').insert(rows);
  if (insErr) throw insErr;
  return {
    carried: rows.length,
    pendingVerify: rows.filter((r) => r.status === 'fixed').length,
    unresolved: rows.filter((r) => r.status === 'open').length,
  };
}

// Most recent still-open "sent back" release for a project (optionally a dev),
// i.e. the release a follow-up submission would supersede.
export async function fetchSentBackRelease(projectId, submitterId) {
  let q = supabase
    .from('releases')
    .select('*')
    .eq('project_id', projectId)
    .eq('status', 'sent_back')
    .order('created_at', { ascending: false })
    .limit(1);
  if (submitterId) q = q.eq('submitted_by_id', submitterId);
  const { data, error } = await q;
  if (error) throw error;
  return data && data.length ? mapRelease(data[0]) : null;
}

// ALL open sent-back releases for a project + submitter on the same PLATFORM.
// Platform is 'Mobile' (covers both APK/Android and TestFlight/iOS) or 'Web',
// so a new mobile build supersedes every open mobile cycle and carries all of
// their bugs forward. Ordered newest-first (first item is the primary lineage).
export async function fetchSentBackReleases(projectId, submitterId, platform, component) {
  let q = supabase
    .from('releases')
    .select('*')
    .eq('project_id', projectId)
    .eq('status', 'sent_back')
    .order('created_at', { ascending: false });
  if (submitterId) q = q.eq('submitted_by_id', submitterId);
  if (platform) q = q.eq('platform', platform);
  // Web projects run an independent release stream per component (Web App,
  // Admin Dashboard, Landing Page, Other), so a web follow-up only supersedes
  // priors of the SAME component. Mobile has no component axis (a mobile
  // follow-up intentionally spans both APK and TestFlight), so it's never
  // scoped by component.
  if (platform === 'Web') q = q.eq('component', component || '');
  const { data, error } = await q;
  if (error) throw error;
  return (data || []).map(mapRelease);
}

/* ------------------------------------------------------------------ */
/* Bugs                                                               */
/* ------------------------------------------------------------------ */

export async function fetchBugs() {
  const { data, error } = await supabase
    .from('bugs')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data.map(mapBug);
}

export async function createBug(payload) {
  const { data, error } = await supabase
    .from('bugs')
    .insert(payload)
    .select()
    .single();
  if (error) throw error;
  return mapBug(data);
}

export async function updateBugStatus(id, status) {
  const { error } = await supabase.from('bugs').update({ status }).eq('id', id);
  if (error) throw error;
}

export async function updateBug(id, patch) {
  const { error } = await supabase.from('bugs').update(patch).eq('id', id);
  if (error) throw error;
}

export async function deleteBug(id) {
  const { error } = await supabase.from('bugs').delete().eq('id', id);
  if (error) throw error;
}

/* ------------------------------------------------------------------ */
/* Bug comments (thread per bug)                                       */
/* ------------------------------------------------------------------ */

export function mapBugComment(c) {
  return {
    id: c.id,
    bugId: c.bug_id,
    authorId: c.author_id,
    authorName: c.author_name,
    authorRole: c.author_role,
    body: c.body,
    createdAt: c.created_at,
  };
}

export async function fetchBugComments(bugId) {
  const { data, error } = await supabase
    .from('bug_comments')
    .select('*')
    .eq('bug_id', bugId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data.map(mapBugComment);
}

export async function createBugComment(payload) {
  const { error } = await supabase.from('bug_comments').insert(payload);
  if (error) throw error;
}

// Comment count per bug (for the badge on each bug's "Comments" toggle).
export async function fetchBugCommentCounts(bugIds) {
  if (!bugIds || bugIds.length === 0) return {};
  const { data, error } = await supabase
    .from('bug_comments')
    .select('bug_id')
    .in('bug_id', bugIds);
  if (error) throw error;
  const m = {};
  data.forEach((r) => (m[r.bug_id] = (m[r.bug_id] || 0) + 1));
  return m;
}

export async function deleteBugComment(id) {
  const { error } = await supabase.from('bug_comments').delete().eq('id', id);
  if (error) throw error;
}

/* ------------------------------------------------------------------ */
/* Comments                                                           */
/* ------------------------------------------------------------------ */

export async function fetchComments(releaseId) {
  const { data, error } = await supabase
    .from('comments')
    .select('*')
    .eq('release_id', releaseId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data.map(mapComment);
}

export async function createComment(payload) {
  const { error } = await supabase.from('comments').insert(payload);
  if (error) throw error;
}

export async function deleteComment(id) {
  const { error } = await supabase.from('comments').delete().eq('id', id);
  if (error) throw error;
}

/* ------------------------------------------------------------------ */
/* Notifications                                                      */
/* ------------------------------------------------------------------ */

export async function fetchNotifications(userId) {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  return data.map(mapNotification);
}

/* ---- FCM devices (see fixes13.sql + src/push/*) ---- */
export async function upsertUserDevice({ token, platform = 'web', userAgent = '' }) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !token) return;
  const now = new Date().toISOString();
  const { error } = await supabase.from('user_devices').upsert(
    {
      user_id: user.id,
      fcm_token: token,
      platform,
      user_agent: userAgent,
      enabled: true,
      updated_at: now,
      last_seen_at: now,
    },
    { onConflict: 'fcm_token' }
  );
  if (error) console.warn('[push] upsertUserDevice failed', error.message);
}

export async function disableUserDevice(token) {
  if (!token) return;
  await supabase
    .from('user_devices')
    .update({ enabled: false, updated_at: new Date().toISOString() })
    .eq('fcm_token', token);
}

export async function fetchUserDevices(userId) {
  const { data, error } = await supabase
    .from('user_devices')
    .select('*')
    .eq('user_id', userId)
    .order('last_seen_at', { ascending: false });
  if (error) throw error;
  return data.map(mapUserDevice);
}

/* Map a notifications row → the FCM message the Edge Function will deliver.
   FCM data values MUST be strings. */
function toPushMessage(row) {
  return {
    user_id: row.user_id,
    title: row.title || 'JumpTest',
    body: row.message,
    data: {
      type: row.type || '',
      releaseId: row.release_id || '',
      bugId: row.bug_id || '',
      link: row.link || '',
      notificationId: row.id || '',
    },
  };
}

/* Hand a batch of messages to the send-push Edge Function. Best-effort: a push
   failure must never break the action that produced it. */
export async function sendPush(messages) {
  if (!messages || !messages.length) return;
  try {
    const { error } = await supabase.functions.invoke('send-push', {
      body: { messages },
    });
    if (error) console.warn('[push] send-push invoke error', error.message);
  } catch (e) {
    console.warn('[push] send-push threw', e?.message || e);
  }
}

/* The one notification entry point: writes history row(s) AND fires push.
   `recipients` is an array of user ids (deduped; falsy dropped). */
export async function notify(recipients, base) {
  const ids = [...new Set((recipients || []).filter(Boolean))];
  if (!ids.length) return;
  const rows = ids.map((uid) => ({
    user_id: uid,
    type: base.type,
    title: base.title || null,
    message: base.message,
    release_id: base.releaseId || null,
    bug_id: base.bugId || null,
    data: base.data || {},
    link: base.link || null,
  }));
  const { data, error } = await supabase.from('notifications').insert(rows).select();
  if (error) {
    console.warn('[notify] insert failed', error.message);
    return;
  }
  // fire-and-forget push
  sendPush((data || []).map(toPushMessage));
}

/* Back-compat single-recipient helper — every existing caller now also pushes.
   Accepts the old { user_id, type, message, release_id } shape plus optional
   title / bug_id / data / link. */
export async function createNotification(payload) {
  if (!payload.user_id) return;
  return notify([payload.user_id], {
    type: payload.type,
    title: payload.title,
    message: payload.message,
    releaseId: payload.release_id,
    bugId: payload.bug_id,
    data: payload.data,
    link: payload.link,
  });
}

export async function markNotificationRead(id) {
  await supabase.from('notifications').update({ read: true }).eq('id', id);
}

export async function markAllNotificationsRead(userId) {
  await supabase
    .from('notifications')
    .update({ read: true })
    .eq('user_id', userId)
    .eq('read', false);
}

/* ------------------------------------------------------------------ */
/* Checklist templates + per-release state                            */
/* ------------------------------------------------------------------ */

export async function fetchChecklistItems() {
  const { data, error } = await supabase
    .from('checklist_items')
    .select('*')
    .order('position', { ascending: true });
  if (error) throw error;
  return data.map(mapChecklistItem);
}

export async function createChecklistItem(projectId, label, position) {
  const { error } = await supabase
    .from('checklist_items')
    .insert({ project_id: projectId, label, position });
  if (error) throw error;
}

export async function deleteChecklistItem(id) {
  const { error } = await supabase
    .from('checklist_items')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

export async function fetchReleaseChecklist(releaseId) {
  const { data, error } = await supabase
    .from('release_checklist')
    .select('*')
    .eq('release_id', releaseId);
  if (error) throw error;
  return data; // { id, release_id, item_id, checked }
}

export async function setReleaseCheck(releaseId, itemId, checked) {
  const { error } = await supabase
    .from('release_checklist')
    .upsert(
      { release_id: releaseId, item_id: itemId, checked },
      { onConflict: 'release_id,item_id' }
    );
  if (error) throw error;
}

/* ------------------------------------------------------------------ */
/* Storage (public buckets)                                           */
/* ------------------------------------------------------------------ */

export async function uploadFile(bucket, file) {
  const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `${Date.now()}-${Math.round(performance.now())}-${safe}`;
  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    cacheControl: '3600',
    upsert: false,
  });
  if (error) throw error;
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}

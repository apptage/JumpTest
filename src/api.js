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
    wbsTaskId: b.wbs_task_id || null,
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
    message: n.message,
    releaseId: n.release_id,
    read: n.read,
    createdAt: n.created_at,
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
    type: t.type,
    name: t.name,
    devComments: t.dev_comments || '',
    backendStatus: t.backend_status,
    frontendStatus: t.frontend_status,
    estDate: t.est_date || '',
    position: t.position,
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

// Re-importable: preserves dev progress + comments for tasks that still exist.
export async function importWbs(projectId, parsed) {
  const existing = await fetchWbsTasks(projectId);
  const byKey = {};
  existing.forEach((t) => (byKey[t.importKey] = t));

  const rows = parsed.map((p) => {
    const prev = byKey[p.import_key];
    return {
      project_id: projectId,
      import_key: p.import_key,
      platform: p.platform,
      section: p.section,
      type: p.type,
      name: p.name,
      // keep portal-owned progress + comments across re-imports
      dev_comments: prev ? prev.devComments : p.dev_comments,
      backend_status: prev ? prev.backendStatus : p.backend_status,
      frontend_status: prev ? prev.frontendStatus : p.frontend_status,
      est_date: p.est_date,
      position: p.position,
    };
  });

  const { error } = await supabase
    .from('wbs_tasks')
    .upsert(rows, { onConflict: 'project_id,import_key' });
  if (error) throw error;

  await supabase.from('projects').update({ wbs_enabled: true }).eq('id', projectId);
  return rows.length;
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

// open (non-verified) bug counts per WBS task, for a set of task ids
export async function fetchOpenBugCountsByTask(taskIds) {
  if (!taskIds || taskIds.length === 0) return {};
  const { data, error } = await supabase
    .from('bugs')
    .select('wbs_task_id, status')
    .in('wbs_task_id', taskIds)
    .neq('status', 'verified');
  if (error) throw error;
  const m = {};
  data.forEach((b) => {
    if (b.wbs_task_id) m[b.wbs_task_id] = (m[b.wbs_task_id] || 0) + 1;
  });
  return m;
}

// open (non-verified) bugs linked to a set of WBS tasks, for task detail views
export async function fetchBugsByTaskIds(taskIds) {
  if (!taskIds || taskIds.length === 0) return [];
  const { data, error } = await supabase
    .from('bugs')
    .select('id, title, severity, status, wbs_task_id')
    .in('wbs_task_id', taskIds)
    .neq('status', 'verified')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data.map((b) => ({
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
  const { error } = await supabase.from('projects').insert({
    name: p.name,
    type: p.type,
    platform: p.platform,
    team_id: p.team_id ?? null,
  });
  if (error) throw error;
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

export async function createNotification(payload) {
  // best-effort: never block the main action on a failed notification
  if (!payload.user_id) return;
  await supabase.from('notifications').insert(payload);
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

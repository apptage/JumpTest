import { supabase } from './supabaseClient.js';

/* ------------------------------------------------------------------ */
/* Mappers (snake_case -> camelCase)                                  */
/* ------------------------------------------------------------------ */

export function mapProfile(p) {
  return { id: p.id, email: p.email, name: p.name, role: p.role };
}

export function mapProject(p) {
  return {
    id: p.id,
    name: p.name,
    type: p.type,
    platform: p.platform,
    createdAt: p.created_at,
  };
}

export function mapRelease(r) {
  return {
    id: r.id,
    projectId: r.project_id,
    version: r.version,
    releaseType: r.release_type,
    platform: r.platform,
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

export async function fetchProfiles() {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data.map(mapProfile);
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
  const { error } = await supabase.from('releases').insert(payload);
  if (error) throw error;
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

export async function deleteBug(id) {
  const { error } = await supabase.from('bugs').delete().eq('id', id);
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

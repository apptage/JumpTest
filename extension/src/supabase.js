/* Extension Supabase client — same URL + anon key as the web app, but the auth
   session lives in chrome.storage.local (MV3 service workers have no
   localStorage; popup and worker share these keys). Anon key + user JWT only —
   never the service role. */
import { createClient } from '@supabase/supabase-js';
import { makeTimeLogApi } from '../../src/api/timeLogs.js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
if (!url || !key) throw new Error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY at build time');

const storage = {
  getItem: async (k) => (await chrome.storage.local.get(k))[k] ?? null,
  setItem: async (k, v) => chrome.storage.local.set({ [k]: v }),
  removeItem: async (k) => chrome.storage.local.remove(k),
};

export const supabase = createClient(url, key, {
  auth: { storage, storageKey: 'gq-ext-auth', persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
});

// the shared time-log surface, bound to THIS client
export const timeLogs = makeTimeLogApi(supabase);

// the small read surface the popup needs (kept here so the worker bundle never
// pulls the full web api.js)
export async function fetchProjects() {
  const { data, error } = await supabase.from('projects').select('id,name,type').order('name');
  if (error) throw error;
  return data || [];
}
export async function fetchWbsTasks(projectId) {
  const { data, error } = await supabase
    .from('wbs_items').select('id,title,module,type').eq('project_id', projectId).neq('type', 'milestone').order('position');
  if (error) throw error;
  return data || [];
}
export async function fetchMyRole(userId) {
  const { data } = await supabase.from('profiles').select('role').eq('id', userId).maybeSingle();
  return data?.role || null;
}

// LOCAL calendar date (not toISOString, which is UTC) — the spec's log_date rule
export const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

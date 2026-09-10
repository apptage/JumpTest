/* Shared time-log API — the ONE surface used by the web app (Project Hub) AND
   the Chrome extension. It's a factory so each host binds its own Supabase
   client: the web app's default client, or the extension's chrome.storage-backed
   client. No React, no other app code — safe to bundle into a service worker.

   Timer rows are created/transitioned ONLY through the RPCs (the DB owns the
   hours math — see fixes23.sql). Manual entries are plain inserts. */

export function mapTimeLog(t) {
  if (!t) return null;
  return {
    id: t.id,
    userId: t.user_id,
    projectId: t.project_id,
    wbsItemId: t.wbs_item_id,
    source: t.source || 'manual',          // 'timer' | 'manual'
    status: t.status || 'completed',       // 'running' | 'paused' | 'completed'
    hours: t.hours == null ? null : Number(t.hours), // null while running/paused
    logDate: t.log_date,
    note: t.note || '',
    startedAt: t.started_at || null,
    endedAt: t.ended_at || null,
    resumedAt: t.resumed_at || null,       // start of the current open segment
    pausedMs: Number(t.paused_ms || 0),
    workedMs: Number(t.worked_ms || 0),    // sum of CLOSED segments
    createdAt: t.created_at,
    updatedAt: t.updated_at || t.created_at,
  };
}

// Elapsed working ms for a log right now — the same formula the DB uses:
// running = worked_ms + (now - resumed_at); paused/completed = worked_ms.
export function elapsedMs(log, nowMs = Date.now()) {
  if (!log) return 0;
  if (log.status === 'running' && log.resumedAt) {
    return log.workedMs + Math.max(0, nowMs - new Date(log.resumedAt).getTime());
  }
  return log.workedMs;
}

// true when the failure is "the time_logs migration isn't deployed yet"
export function isMissingTimeLogs(e) {
  return (
    e?.code === '42P01' || // undefined_table
    e?.code === 'PGRST205' || // PostgREST: table not in schema cache
    e?.code === 'PGRST202' || // PostgREST: function not found
    (/time_log/i.test(e?.message || '') && /(does not exist|schema cache|not find)/i.test(e?.message || ''))
  );
}
const MIGRATION_MSG = 'Time logs aren’t enabled yet — run the time_logs migration (fixes23) on the database.';

export function makeTimeLogApi(supabase) {
  async function rpc(name, args) {
    const { data, error } = await supabase.rpc(name, args);
    if (error) {
      if (isMissingTimeLogs(error)) throw new Error(MIGRATION_MSG);
      throw error;
    }
    return data;
  }

  return {
    // ---- reads ----
    async fetchTimeLogsForProject(projectId) {
      const { data, error } = await supabase
        .from('time_logs')
        .select('*')
        .eq('project_id', projectId)
        .order('log_date', { ascending: false })
        .order('created_at', { ascending: false });
      if (error) {
        if (isMissingTimeLogs(error)) return [];
        throw error;
      }
      return (data || []).map(mapTimeLog);
    },

    // the caller's own logs on a project for one calendar date (extension "today")
    async fetchMyTimeLogsForProject(projectId, logDate, userId) {
      const { data, error } = await supabase
        .from('time_logs')
        .select('*')
        .eq('project_id', projectId)
        .eq('user_id', userId)
        .eq('log_date', logDate)
        .order('created_at', { ascending: false });
      if (error) {
        if (isMissingTimeLogs(error)) return [];
        throw error;
      }
      return (data || []).map(mapTimeLog);
    },

    // the caller's single open (running/paused) timer, or null
    async fetchMyOpenTimeLog(userId) {
      const { data, error } = await supabase
        .from('time_logs')
        .select('*')
        .eq('user_id', userId)
        .in('status', ['running', 'paused'])
        .maybeSingle();
      if (error) {
        if (isMissingTimeLogs(error)) return null;
        throw error;
      }
      return mapTimeLog(data);
    },

    // ---- manual entry (Hub form + extension "+") ----
    async createTimeLog({ projectId, wbsItemId, hours, logDate, note, userId }) {
      const { data, error } = await supabase
        .from('time_logs')
        .insert({
          user_id: userId,
          project_id: projectId,
          wbs_item_id: wbsItemId || null,
          source: 'manual',
          status: 'completed',
          hours,
          log_date: logDate,
          note: note || null,
        })
        .select()
        .single();
      if (error) {
        if (isMissingTimeLogs(error)) throw new Error(MIGRATION_MSG);
        throw error;
      }
      return mapTimeLog(data);
    },

    async deleteTimeLog(id) {
      const { error } = await supabase.from('time_logs').delete().eq('id', id);
      if (error) throw error;
    },

    // ---- timer transitions (RPC-only; the DB computes hours) ----
    async startTimeLog({ projectId, wbsItemId, logDate, note }) {
      return mapTimeLog(await rpc('time_log_start', {
        p_project: projectId, p_wbs: wbsItemId || null, p_log_date: logDate, p_note: note || null,
      }));
    },
    async pauseTimeLog(id) {
      return mapTimeLog(await rpc('time_log_pause', { p_id: id }));
    },
    async resumeTimeLog(id) {
      return mapTimeLog(await rpc('time_log_resume', { p_id: id }));
    },
    // → { discarded: boolean, log: mappedLog | null }
    async stopTimeLog(id, note) {
      const r = await rpc('time_log_stop', { p_id: id, p_note: note || null });
      return { discarded: !!r?.discarded, log: r?.log ? mapTimeLog(r.log) : null };
    },
    async discardTimeLog(id) {
      await rpc('time_log_discard', { p_id: id });
      return true;
    },
  };
}

import { useCallback, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as api from '@/api.js';

const EMPTY = [];

/* Centralized server-state for the authenticated app.
   Replaces the old loadAll() Promise.all + manual refetch* useState loops.
   Each entity is an independent query, so one failing fetch (e.g. a missing
   project_members table) no longer zeroes the whole dashboard. The refetch*
   helpers are cache invalidations, so existing mutation handlers keep working
   unchanged — they call refetchX() after a mutation and the query refetches. */
export function useAppData(session, user, onError) {
  const qc = useQueryClient();
  // Only fetch once auth is fully ready: a live access token AND a resolved
  // profile. Gating on the token avoids the login race where Supabase RLS
  // returns [] with HTTP 200 (no error, no retry) before the JWT is attached.
  const enabled = !!session?.access_token && !!user?.id;
  // Scope every query by user id so a login mints a fresh key → fresh fetch,
  // never reusing an empty result cached during the pre-auth window.
  const q = (key, fn, extra) =>
    useQuery({ queryKey: [key, user?.id], queryFn: () => fn(), enabled, ...extra });

  const projectsQ = q('projects', api.fetchProjects);
  const releasesQ = q('releases', api.fetchReleases);
  const bugsQ = q('bugs', api.fetchBugs);
  const profilesQ = q('profiles', api.fetchProfiles);
  const teamsQ = q('teams', api.fetchTeams);
  const membersQ = q('projectMembers', api.fetchProjectMembers);
  const checklistQ = q('checklistItems', api.fetchChecklistItems);
  const notifQ = useQuery({
    queryKey: ['notifications', user?.id],
    queryFn: () => api.fetchNotifications(user.id),
    enabled,
    refetchInterval: 30_000,
  });

  // surface the first query error as a toast (parity with old loadAll catch)
  const firstError = [projectsQ, releasesQ, bugsQ, profilesQ, teamsQ, membersQ, checklistQ]
    .map((x) => x.error)
    .find(Boolean);
  useEffect(() => {
    if (firstError) onError?.(firstError.message || 'Failed to load data', 'error');
  }, [firstError, onError]);

  // Belt-and-suspenders: the moment auth becomes ready, force a refetch of
  // everything. The user-id key change already refetches, but this guarantees
  // any query that started during the pre-auth window is re-run.
  useEffect(() => {
    if (enabled) qc.invalidateQueries();
  }, [enabled, user?.id, qc]);

  const inv = useCallback((key) => qc.invalidateQueries({ queryKey: [key] }), [qc]);

  return {
    projects: projectsQ.data ?? EMPTY,
    releases: releasesQ.data ?? EMPTY,
    bugs: bugsQ.data ?? EMPTY,
    profiles: profilesQ.data ?? EMPTY,
    teams: teamsQ.data ?? EMPTY,
    projectMembers: membersQ.data ?? EMPTY,
    checklistItems: checklistQ.data ?? EMPTY,
    notifications: notifQ.data ?? EMPTY,
    // initial-load spinner: isPending stays true until the first successful
    // fetch resolves, so we keep showing the spinner (not an empty UI) through
    // the whole post-login bootstrap rather than only while actively fetching.
    loading: enabled && (projectsQ.isPending || releasesQ.isPending || bugsQ.isPending),
    refetchReleases: useCallback(() => inv('releases'), [inv]),
    refetchBugs: useCallback(() => inv('bugs'), [inv]),
    refetchProjects: useCallback(() => inv('projects'), [inv]),
    refetchProfiles: useCallback(() => inv('profiles'), [inv]),
    refetchChecklist: useCallback(() => inv('checklistItems'), [inv]),
    refetchTeams: useCallback(() => inv('teams'), [inv]),
    refetchProjectMembers: useCallback(() => inv('projectMembers'), [inv]),
    refetchNotifications: useCallback(
      () => qc.invalidateQueries({ queryKey: ['notifications'] }),
      [qc]
    ),
    resetAll: useCallback(() => qc.clear(), [qc]),
  };
}

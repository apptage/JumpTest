/* The releases and bugs a dashboard-type page needs, loaded for its own time
   window (fetchMetricsData) instead of read from the lists loaded at sign-in.
   Until the metrics_dataset migration is applied, or while the first load is
   in flight, it returns `fallback` (the loaded lists) so the page never blanks.
   Query keys start with 'metrics'; useAppData's refetchReleases / refetchBugs
   refresh them after a change. */
import { useMemo } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import * as api from '@/api.js';

const EMPTY = [];

// 'YYYY-MM-DD' n days before today (UTC), stable for the whole day
export function daysAgo(n) {
  return new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
}

export function useMetricsData({ scopeProjectIds = null, since = null, liveOnly = false, slim = true, enabled = true, fallback = null }) {
  const scopeKey = scopeProjectIds ? [...scopeProjectIds].sort().join(',') : 'all';
  const q = useQuery({
    queryKey: ['metrics', scopeKey, since || 'all', liveOnly, slim],
    queryFn: () => api.fetchMetricsData({ projectIds: scopeProjectIds, since, liveOnly, slim }),
    enabled,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });
  return useMemo(() => {
    if (q.data) return { releases: q.data.releases, bugs: q.data.bugs, source: 'db', loading: false, fetching: q.isFetching, error: null };
    const fb = fallback || { releases: EMPTY, bugs: EMPTY };
    // null = function not deployed; pending/error = nothing better to show yet
    return {
      releases: fb.releases || EMPTY,
      bugs: fb.bugs || EMPTY,
      source: 'fallback',
      loading: q.isPending && enabled && !fallback,
      fetching: q.isFetching,
      error: q.data === null ? null : q.error,
    };
  }, [q.data, q.isPending, q.isFetching, q.error, enabled, fallback]);
}

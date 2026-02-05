import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useCallback } from 'react';
import { listen } from '@tauri-apps/api/event';
import {
  getSessions,
  getSession,
  getSessionMetrics,
  getTurns,
  getSessionCount,
  scanNewSessions,
  getSessionsFiltered,
  preloadAllSessions,
} from '../lib/tauri';
import { useAppStore } from '../lib/store';
import type { SessionSummary, SessionDetail, SessionMetrics, TurnSummary, DateRange } from '../types';

// ============================================================================
// Cache Constants
// ============================================================================

// Long stale times since backend handles caching
const SESSION_LIST_STALE_TIME = 5 * 60 * 1000; // 5 minutes
const SESSION_DETAIL_STALE_TIME = 5 * 60 * 1000; // 5 minutes
const SESSION_GC_TIME = 30 * 60 * 1000; // 30 minutes

// ============================================================================
// Session List Hooks
// ============================================================================

/** Fetch all sessions with pagination and optional date filtering */
export function useSessions(limit = 50, offset = 0) {
  const dateRange = useAppStore((state) => state.dateRange);

  return useQuery<SessionSummary[]>({
    queryKey: ['sessions', limit, offset, dateRange],
    queryFn: async () => {
      // Use the efficient filtered endpoint which leverages backend cache
      if (dateRange) {
        return getSessionsFiltered(dateRange.start, dateRange.end, limit, offset);
      }
      return getSessions(limit, offset);
    },
    staleTime: SESSION_LIST_STALE_TIME,
    gcTime: SESSION_GC_TIME,
  });
}

/** Fetch session count */
export function useSessionCount() {
  return useQuery<number>({
    queryKey: ['sessionCount'],
    queryFn: getSessionCount,
    staleTime: SESSION_LIST_STALE_TIME,
    gcTime: SESSION_GC_TIME,
  });
}

/** Hook to preload sessions at app startup */
export function usePreloadSessions() {
  const queryClient = useQueryClient();

  return useCallback(async () => {
    try {
      const count = await preloadAllSessions();
      console.log(`Preloaded ${count} sessions into cache`);
      // Prefetch the default session list into React Query cache
      await queryClient.prefetchQuery({
        queryKey: ['sessions', 50, 0, null],
        queryFn: () => getSessions(50, 0),
        staleTime: SESSION_LIST_STALE_TIME,
      });
      return count;
    } catch (error) {
      console.error('Failed to preload sessions:', error);
      return 0;
    }
  }, [queryClient]);
}

// ============================================================================
// Single Session Hooks
// ============================================================================

/** Fetch a single session by ID with full details */
export function useSession(id: string | null) {
  return useQuery<SessionDetail | null>({
    queryKey: ['session', id],
    queryFn: () => (id ? getSession(id) : Promise.resolve(null)),
    enabled: !!id,
    staleTime: SESSION_DETAIL_STALE_TIME,
    gcTime: SESSION_GC_TIME,
  });
}

/** Fetch session metrics by ID */
export function useSessionMetrics(id: string) {
  return useQuery<SessionMetrics | null>({
    queryKey: ['session-metrics', id],
    queryFn: () => getSessionMetrics(id),
    enabled: !!id,
    staleTime: SESSION_DETAIL_STALE_TIME,
    gcTime: SESSION_GC_TIME,
  });
}

/** Fetch turns for a session */
export function useTurns(sessionId: string, limit = 100, offset = 0) {
  return useQuery<TurnSummary[]>({
    queryKey: ['turns', sessionId, limit, offset],
    queryFn: () => getTurns(sessionId, limit, offset),
    enabled: !!sessionId,
    staleTime: SESSION_DETAIL_STALE_TIME,
    gcTime: SESSION_GC_TIME,
  });
}

// ============================================================================
// Filter Hooks
// ============================================================================

/** Fetch sessions by project path - filters from cached data */
export function useSessionsByProject(projectPath: string | null) {
  const { data: allSessions } = useSessions(1000, 0);

  return useQuery<SessionSummary[]>({
    queryKey: ['sessions', 'project', projectPath],
    queryFn: () => {
      if (!projectPath || !allSessions) return [];
      return allSessions.filter(s => s.project_path === projectPath);
    },
    enabled: !!projectPath && !!allSessions,
    staleTime: SESSION_LIST_STALE_TIME,
    gcTime: SESSION_GC_TIME,
  });
}

/** Fetch sessions by date range - uses efficient backend filtering */
export function useSessionsByDateRange(dateRange: DateRange | null) {
  return useQuery<SessionSummary[]>({
    queryKey: ['sessions', 'dateRange', dateRange],
    queryFn: () => (dateRange ? getSessionsFiltered(dateRange.start, dateRange.end) : Promise.resolve([])),
    enabled: !!dateRange,
    staleTime: SESSION_LIST_STALE_TIME,
    gcTime: SESSION_GC_TIME,
  });
}

// ============================================================================
// Invalidation Hooks
// ============================================================================

/** Hook to invalidate session queries */
export function useInvalidateSessions() {
  const queryClient = useQueryClient();

  return () => {
    queryClient.invalidateQueries({ queryKey: ['sessions'] });
    queryClient.invalidateQueries({ queryKey: ['session'] });
    queryClient.invalidateQueries({ queryKey: ['session-metrics'] });
    queryClient.invalidateQueries({ queryKey: ['turns'] });
    queryClient.invalidateQueries({ queryKey: ['sessionCount'] });
  };
}

// ============================================================================
// Real-time Updates Hook
// ============================================================================

/** Hook to listen for session updates from the backend */
export function useSessionUpdates() {
  const queryClient = useQueryClient();

  useEffect(() => {
    // Listen for sessions-updated event from Tauri backend
    const unlistenPromise = listen('sessions-updated', () => {
      // Invalidate all session-related queries to trigger refetch
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      queryClient.invalidateQueries({ queryKey: ['sessionCount'] });
      queryClient.invalidateQueries({ queryKey: ['dashboardSummary'] });
      queryClient.invalidateQueries({ queryKey: ['dailyMetrics'] });
      queryClient.invalidateQueries({ queryKey: ['projectMetrics'] });
    });

    return () => {
      unlistenPromise.then(unlisten => unlisten());
    };
  }, [queryClient]);
}

/** Hook to poll for new sessions */
export function useSessionPolling(intervalMs = 30000) {
  const queryClient = useQueryClient();
  const { data: sessions } = useSessions(1000, 0);

  useEffect(() => {
    if (!sessions) return;

    const interval = setInterval(async () => {
      const knownIds = sessions.map(s => s.id);
      const newSessions = await scanNewSessions(knownIds);

      if (newSessions.length > 0) {
        // Invalidate queries to show new sessions
        queryClient.invalidateQueries({ queryKey: ['sessions'] });
        queryClient.invalidateQueries({ queryKey: ['sessionCount'] });
        queryClient.invalidateQueries({ queryKey: ['dashboardSummary'] });
      }
    }, intervalMs);

    return () => clearInterval(interval);
  }, [sessions, queryClient, intervalMs]);
}

'use client';

import { useQuery } from '@tanstack/react-query';
import { fetchSessions, fetchSession, type SessionListResponse, type SessionDetailResponse } from '@/lib/api';
import { queryKeys } from '@/lib/queryClient';

/**
 * Hook to fetch list of sessions
 */
export function useSessions(options?: {
  limit?: number;
  activeOnly?: boolean;
  projectPath?: string;
}) {
  return useQuery<SessionListResponse>({
    queryKey: queryKeys.sessions.list({ limit: options?.limit, activeOnly: options?.activeOnly }),
    queryFn: () => fetchSessions(options),
    refetchInterval: 30000, // Refetch every 30 seconds
  });
}

/**
 * Hook to fetch a single session's details
 */
export function useSession(sessionId: string | null) {
  return useQuery<SessionDetailResponse>({
    queryKey: queryKeys.sessions.detail(sessionId ?? ''),
    queryFn: () => fetchSession(sessionId!),
    enabled: !!sessionId,
  });
}

/**
 * Hook to get session by ID from the list
 */
export function useSessionFromList(sessionId: string | null, sessions: SessionListResponse | undefined) {
  if (!sessionId || !sessions) return null;
  return sessions.sessions.find((s) => s.id === sessionId) ?? null;
}

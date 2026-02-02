'use client';

import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import { fetchTurns, fetchTurn, type TurnListResponse, type TurnDetailResponse } from '@/lib/api';
import { queryKeys } from '@/lib/queryClient';

const DEFAULT_PAGE_SIZE = 50;

/**
 * Hook to fetch turns for a session with pagination
 */
export function useTurns(sessionId: string | null, options?: { limit?: number }) {
  const limit = options?.limit ?? DEFAULT_PAGE_SIZE;

  return useQuery<TurnListResponse>({
    queryKey: queryKeys.turns.list(sessionId ?? '', { limit }),
    queryFn: () => fetchTurns(sessionId!, { limit }),
    enabled: !!sessionId,
  });
}

/**
 * Hook to fetch turns with infinite scrolling
 */
export function useInfiniteTurns(sessionId: string | null) {
  return useInfiniteQuery<TurnListResponse>({
    queryKey: queryKeys.turns.list(sessionId ?? '', {}),
    queryFn: ({ pageParam = 0 }) =>
      fetchTurns(sessionId!, { offset: pageParam as number, limit: DEFAULT_PAGE_SIZE }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      if (!lastPage.hasMore) return undefined;
      return allPages.length * DEFAULT_PAGE_SIZE;
    },
    enabled: !!sessionId,
  });
}

/**
 * Hook to fetch a single turn's details
 */
export function useTurn(turnId: string | null) {
  return useQuery<TurnDetailResponse>({
    queryKey: queryKeys.turns.detail(turnId ?? ''),
    queryFn: () => fetchTurn(turnId!),
    enabled: !!turnId,
  });
}

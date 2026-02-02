import { QueryClient } from '@tanstack/react-query';

/**
 * Create a new QueryClient instance with default options
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Data is considered stale after 30 seconds
        staleTime: 30 * 1000,
        // Keep unused data in cache for 5 minutes
        gcTime: 5 * 60 * 1000,
        // Retry failed requests up to 3 times
        retry: 3,
        // Don't refetch on window focus by default
        refetchOnWindowFocus: false,
        // Refetch on reconnect
        refetchOnReconnect: true,
      },
      mutations: {
        // Retry failed mutations once
        retry: 1,
      },
    },
  });
}

/**
 * Query keys for consistent cache management
 */
export const queryKeys = {
  sessions: {
    all: ['sessions'] as const,
    list: (filters?: { limit?: number; activeOnly?: boolean }) =>
      [...queryKeys.sessions.all, 'list', filters] as const,
    detail: (id: string) => [...queryKeys.sessions.all, 'detail', id] as const,
  },
  turns: {
    all: ['turns'] as const,
    list: (sessionId: string, pagination?: { offset?: number; limit?: number }) =>
      [...queryKeys.turns.all, 'list', sessionId, pagination] as const,
    detail: (id: string) => [...queryKeys.turns.all, 'detail', id] as const,
  },
  metrics: {
    all: ['metrics'] as const,
    session: (sessionId: string) => [...queryKeys.metrics.all, 'session', sessionId] as const,
  },
} as const;

import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getSessions,
  getSession,
  getSessionsByProject,
  getSessionsByDateRange,
} from '../lib/tauri';
import { useAppStore } from '../lib/store';
import type { Session, SessionDetail, DateRange } from '../types';

export function useSessions(limit = 50, offset = 0) {
  const dateRange = useAppStore((state) => state.dateRange);

  return useQuery<Session[]>({
    queryKey: ['sessions', limit, offset, dateRange],
    queryFn: async () => {
      if (dateRange) {
        return getSessionsByDateRange(dateRange);
      }
      return getSessions(limit, offset);
    },
  });
}

export function useSession(id: string | null) {
  return useQuery<SessionDetail | null>({
    queryKey: ['session', id],
    queryFn: () => (id ? getSession(id) : Promise.resolve(null)),
    enabled: !!id,
  });
}

export function useSessionsByProject(projectPath: string | null) {
  return useQuery<Session[]>({
    queryKey: ['sessions', 'project', projectPath],
    queryFn: () => (projectPath ? getSessionsByProject(projectPath) : Promise.resolve([])),
    enabled: !!projectPath,
  });
}

export function useSessionsByDateRange(dateRange: DateRange | null) {
  return useQuery<Session[]>({
    queryKey: ['sessions', 'dateRange', dateRange],
    queryFn: () => (dateRange ? getSessionsByDateRange(dateRange) : Promise.resolve([])),
    enabled: !!dateRange,
  });
}

export function useInvalidateSessions() {
  const queryClient = useQueryClient();

  return () => {
    queryClient.invalidateQueries({ queryKey: ['sessions'] });
    queryClient.invalidateQueries({ queryKey: ['session'] });
  };
}

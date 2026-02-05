import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import {
  getDashboardSummary,
  getDailyMetrics,
  getProjectMetrics,
  refreshData,
} from '../lib/tauri';
import { useAppStore } from '../lib/store';
import type {
  DashboardSummary,
  DailyMetrics,
  ProjectMetrics,
} from '../types';

// ============================================================================
// Dashboard Metrics
// ============================================================================

/** Fetch dashboard summary metrics */
export function useDashboardSummary() {
  const dateRange = useAppStore((state) => state.dateRange);

  return useQuery<DashboardSummary>({
    queryKey: ['dashboardSummary', dateRange],
    queryFn: () => getDashboardSummary(dateRange || undefined),
  });
}

// ============================================================================
// Time-Series Metrics
// ============================================================================

/** Fetch daily aggregated metrics for charts */
export function useDailyMetrics() {
  const dateRange = useAppStore((state) => state.dateRange);

  return useQuery<DailyMetrics[]>({
    queryKey: ['dailyMetrics', dateRange],
    queryFn: () => getDailyMetrics(dateRange || undefined),
  });
}

// ============================================================================
// Project Metrics
// ============================================================================

/** Fetch project-level metrics */
export function useProjectMetrics() {
  return useQuery<ProjectMetrics[]>({
    queryKey: ['projectMetrics'],
    queryFn: getProjectMetrics,
  });
}

// ============================================================================
// Data Refresh
// ============================================================================

/** Mutation hook for refreshing data */
export function useRefreshData() {
  const queryClient = useQueryClient();
  const setIsRefreshing = useAppStore((state) => state.setIsRefreshing);
  const setLastSyncTime = useAppStore((state) => state.setLastSyncTime);

  return useMutation({
    mutationFn: refreshData,
    onMutate: () => {
      setIsRefreshing(true);
    },
    onSuccess: () => {
      // Invalidate all queries to refetch fresh data
      queryClient.invalidateQueries();
      setLastSyncTime(new Date().toISOString());
    },
    onSettled: () => {
      setIsRefreshing(false);
    },
  });
}

// ============================================================================
// Invalidation
// ============================================================================

/** Hook to invalidate all metric queries */
export function useInvalidateMetrics() {
  const queryClient = useQueryClient();

  return () => {
    queryClient.invalidateQueries({ queryKey: ['dashboardSummary'] });
    queryClient.invalidateQueries({ queryKey: ['dailyMetrics'] });
    queryClient.invalidateQueries({ queryKey: ['projectMetrics'] });
  };
}

// ============================================================================
// Legacy Compatibility (will be removed)
// ============================================================================

/** @deprecated Use useProjectMetrics instead */
export function useModelMetrics() {
  return useQuery<{ model: string; usage_count: number; total_cost: number }[]>({
    queryKey: ['modelMetrics'],
    queryFn: async () => [],
  });
}

/** @deprecated Not implemented in new backend */
export function useToolUsage() {
  return useQuery<{ tool_name: string; usage_count: number }[]>({
    queryKey: ['toolUsage'],
    queryFn: async () => [],
  });
}

/** @deprecated Use store state instead */
export function useLastSyncTime() {
  const lastSyncTime = useAppStore((state) => state.lastSyncTime);

  return useQuery<string | null>({
    queryKey: ['lastSyncTime'],
    queryFn: async () => lastSyncTime,
    refetchInterval: 60000,
  });
}

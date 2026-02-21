import { useQuery, useQueryClient, useMutation, keepPreviousData } from '@tanstack/react-query';
import {
  getDashboardSummary,
  getDailyMetrics,
  getProjectMetrics,
  refreshData,
} from '../lib/tauri';
import { useAppStore, type PresetRange } from '../lib/store';
import type {
  DashboardSummary,
  DailyMetrics,
  ProjectMetrics,
} from '../types';

/** Convert a preset range label to the number of days for backend filtering */
function presetToDays(preset: PresetRange): number | undefined {
  switch (preset) {
    case '7d':
      return 7;
    case '30d':
      return 30;
    case '90d':
      return 90;
    case 'all':
    default:
      return undefined;
  }
}

// ============================================================================
// Cache Constants (matching useSessions.ts)
// ============================================================================

const METRICS_STALE_TIME = 5 * 60 * 1000; // 5 minutes
const METRICS_GC_TIME = 30 * 60 * 1000; // 30 minutes

// ============================================================================
// Dashboard Metrics
// ============================================================================

/** Fetch dashboard summary metrics */
export function useDashboardSummary() {
  const presetRange = useAppStore((state) => state.presetRange);
  const days = presetToDays(presetRange);

  return useQuery<DashboardSummary>({
    queryKey: ['dashboardSummary', days],
    queryFn: () => getDashboardSummary(days),
    staleTime: METRICS_STALE_TIME,
    gcTime: METRICS_GC_TIME,
    placeholderData: keepPreviousData,
  });
}

// ============================================================================
// Time-Series Metrics
// ============================================================================

/** Fetch daily aggregated metrics for charts */
export function useDailyMetrics() {
  const presetRange = useAppStore((state) => state.presetRange);
  const days = presetToDays(presetRange);

  return useQuery<DailyMetrics[]>({
    queryKey: ['dailyMetrics', days],
    queryFn: () => getDailyMetrics(days),
    staleTime: METRICS_STALE_TIME,
    gcTime: METRICS_GC_TIME,
    placeholderData: keepPreviousData,
  });
}

// ============================================================================
// Project Metrics
// ============================================================================

/** Fetch project-level metrics */
export function useProjectMetrics() {
  const presetRange = useAppStore((state) => state.presetRange);
  const days = presetToDays(presetRange);

  return useQuery<ProjectMetrics[]>({
    queryKey: ['projectMetrics', days],
    queryFn: () => getProjectMetrics(days),
    staleTime: METRICS_STALE_TIME,
    gcTime: METRICS_GC_TIME,
    placeholderData: keepPreviousData,
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

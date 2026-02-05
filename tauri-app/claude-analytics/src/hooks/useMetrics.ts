import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import {
  getDashboardSummary,
  getDailyMetrics,
  getProjectMetrics,
  getModelMetrics,
  getToolUsage,
  refreshData,
  getLastSyncTime,
} from '../lib/tauri';
import { useAppStore } from '../lib/store';
import type {
  DashboardSummary,
  DailyMetrics,
  ProjectMetrics,
  ModelMetrics,
  ToolUsage,
} from '../types';

export function useDashboardSummary() {
  const dateRange = useAppStore((state) => state.dateRange);

  return useQuery<DashboardSummary>({
    queryKey: ['dashboardSummary', dateRange],
    queryFn: () => getDashboardSummary(dateRange || undefined),
  });
}

export function useDailyMetrics() {
  const dateRange = useAppStore((state) => state.dateRange);

  return useQuery<DailyMetrics[]>({
    queryKey: ['dailyMetrics', dateRange],
    queryFn: () => getDailyMetrics(dateRange || undefined),
  });
}

export function useProjectMetrics() {
  return useQuery<ProjectMetrics[]>({
    queryKey: ['projectMetrics'],
    queryFn: getProjectMetrics,
  });
}

export function useModelMetrics() {
  return useQuery<ModelMetrics[]>({
    queryKey: ['modelMetrics'],
    queryFn: getModelMetrics,
  });
}

export function useToolUsage() {
  return useQuery<ToolUsage[]>({
    queryKey: ['toolUsage'],
    queryFn: getToolUsage,
  });
}

export function useLastSyncTime() {
  return useQuery<string | null>({
    queryKey: ['lastSyncTime'],
    queryFn: getLastSyncTime,
    refetchInterval: 60000, // Refetch every minute
  });
}

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

export function useInvalidateMetrics() {
  const queryClient = useQueryClient();

  return () => {
    queryClient.invalidateQueries({ queryKey: ['dashboardSummary'] });
    queryClient.invalidateQueries({ queryKey: ['dailyMetrics'] });
    queryClient.invalidateQueries({ queryKey: ['projectMetrics'] });
    queryClient.invalidateQueries({ queryKey: ['modelMetrics'] });
    queryClient.invalidateQueries({ queryKey: ['toolUsage'] });
  };
}

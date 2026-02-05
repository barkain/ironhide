import { useQuery } from '@tanstack/react-query';
import {
  getTrends,
  getCostTrend,
  getEfficiencyTrend,
  type DailyTrend,
  type CostTrendPoint,
  type EfficiencyTrendPoint,
} from '../lib/tauri';

// ============================================================================
// Trends Hooks
// ============================================================================

/**
 * Hook to fetch daily trends within a date range
 * @param startDate - Start date in ISO-8601 format (YYYY-MM-DD)
 * @param endDate - End date in ISO-8601 format (YYYY-MM-DD)
 * @param granularity - Granularity of trends ('daily' | 'weekly' | 'monthly')
 */
export function useTrends(
  startDate?: string,
  endDate?: string,
  granularity: string = 'daily'
) {
  return useQuery<DailyTrend[]>({
    queryKey: ['trends', startDate, endDate, granularity],
    queryFn: () => getTrends(startDate, endDate, granularity),
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

/**
 * Hook to fetch cost trend over specified number of days
 * @param days - Number of days to fetch (default: 30)
 */
export function useCostTrend(days: number = 30) {
  return useQuery<CostTrendPoint[]>({
    queryKey: ['costTrend', days],
    queryFn: () => getCostTrend(days),
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

/**
 * Hook to fetch efficiency trend over specified number of days
 * @param days - Number of days to fetch (default: 30)
 */
export function useEfficiencyTrend(days: number = 30) {
  return useQuery<EfficiencyTrendPoint[]>({
    queryKey: ['efficiencyTrend', days],
    queryFn: () => getEfficiencyTrend(days),
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

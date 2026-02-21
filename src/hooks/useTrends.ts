import { useQuery } from '@tanstack/react-query';
import { getDailyMetrics } from '../lib/tauri';
import type { DailyMetrics } from '../types';

// ============================================================================
// Trends Hooks — powered by fast SQL-backed getDailyMetrics endpoint
// ============================================================================

/** Shape consumed by the Trends page (superset kept for backwards-compat) */
export interface TrendPoint {
  date: string;
  sessions: number;
  user_sessions: number;
  subagent_sessions: number;
  turns: number;
  total_tokens: number;
  total_cost: number;
  avg_efficiency: number;
}

/** Map a DailyMetrics row to the TrendPoint shape the Trends page expects.
 *  Backend returns CER as 0-1 ratio; convert to percentage (0-100) for display. */
function toTrendPoint(m: DailyMetrics): TrendPoint {
  return {
    date: m.date,
    sessions: m.session_count,
    user_sessions: m.user_session_count,
    subagent_sessions: m.subagent_session_count,
    turns: m.total_turns,
    total_tokens: m.total_tokens,
    total_cost: m.total_cost,
    avg_efficiency: (m.avg_efficiency_score ?? 0) * 100,
  };
}

/**
 * Hook to fetch daily trends for the given number of days.
 * Backed by the fast SQL `get_daily_metrics` command.
 *
 * @param days — Number of trailing days to fetch (undefined = backend default, typically 30)
 */
export function useTrends(days?: number) {
  return useQuery<TrendPoint[]>({
    queryKey: ['trends', days],
    queryFn: async () => {
      const metrics = await getDailyMetrics(days);
      return metrics.map(toTrendPoint);
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

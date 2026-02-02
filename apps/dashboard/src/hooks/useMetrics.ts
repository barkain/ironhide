'use client';

import { useQuery } from '@tanstack/react-query';
import { fetchMetrics, type MetricsResponse } from '@/lib/api';
import { queryKeys } from '@/lib/queryClient';

/**
 * Hook to fetch metrics for a session
 */
export function useMetrics(sessionId: string | null) {
  return useQuery<MetricsResponse>({
    queryKey: queryKeys.metrics.session(sessionId ?? ''),
    queryFn: () => fetchMetrics(sessionId!),
    enabled: !!sessionId,
  });
}

/**
 * Hook to get computed metrics values
 */
export function useComputedMetrics(metrics: MetricsResponse | undefined) {
  if (!metrics) {
    return {
      totalCost: 0,
      totalTokens: 0,
      avgTokensPerTurn: 0,
      avgCostPerTurn: 0,
      efficiencyScore: 0,
      cacheHitRate: 0,
    };
  }

  const { sessionMetrics, efficiency } = metrics;

  return {
    totalCost: sessionMetrics.totalCost,
    totalTokens: sessionMetrics.totalTokens.total,
    avgTokensPerTurn: sessionMetrics.averages.tokensPerTurn,
    avgCostPerTurn: sessionMetrics.averages.costPerTurn,
    efficiencyScore: efficiency.compositeScore,
    cacheHitRate: sessionMetrics.cacheHitRate,
  };
}

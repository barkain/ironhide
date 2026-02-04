/**
 * Cost computation using shared pricing
 */

import type { TokenUsage, CostMetrics, CostBreakdown } from '@analytics/shared';
import {
  calculateTokenCost,
  getModelPricingOrDefault,
} from '@analytics/shared';

/**
 * Calculate cost for a turn's token usage
 *
 * Returns all 4 cost components:
 * - input: Standard input tokens
 * - output: Output tokens
 * - cacheCreation: Cache write/creation tokens
 * - cacheRead: Cache read tokens (10% of input price)
 */
export function calculateTurnCost(usage: TokenUsage, model: string): CostMetrics {
  const breakdown = calculateTokenCost(usage, model);

  return {
    input: breakdown.input,
    output: breakdown.output,
    cacheCreation: breakdown.cacheCreation,
    cacheRead: breakdown.cacheRead,
    total: breakdown.total,
  };
}

/**
 * Aggregate costs from multiple cost metrics
 */
export function aggregateCostMetrics(costs: CostMetrics[]): CostMetrics {
  const total = costs.reduce(
    (acc, cost) => ({
      input: acc.input + cost.input,
      output: acc.output + cost.output,
      cacheCreation: acc.cacheCreation + cost.cacheCreation,
      cacheRead: acc.cacheRead + cost.cacheRead,
      total: acc.total + cost.total,
    }),
    { input: 0, output: 0, cacheCreation: 0, cacheRead: 0, total: 0 }
  );

  return {
    input: roundCost(total.input),
    output: roundCost(total.output),
    cacheCreation: roundCost(total.cacheCreation),
    cacheRead: roundCost(total.cacheRead),
    total: roundCost(total.total),
  };
}

/**
 * Get cost breakdown as a formatted summary
 */
export function getCostBreakdownSummary(cost: CostMetrics): string {
  const parts: string[] = [];

  if (cost.input > 0) {
    parts.push(`Input: $${formatCostValue(cost.input)}`);
  }
  if (cost.output > 0) {
    parts.push(`Output: $${formatCostValue(cost.output)}`);
  }
  if (cost.cacheCreation > 0) {
    parts.push(`Cache Write: $${formatCostValue(cost.cacheCreation)}`);
  }
  if (cost.cacheRead > 0) {
    parts.push(`Cache Read: $${formatCostValue(cost.cacheRead)}`);
  }

  return parts.join(', ') || 'No cost';
}

/**
 * Format cost value for display
 */
export function formatCostValue(cost: number): string {
  if (cost < 0.0001) {
    return cost.toExponential(2);
  }
  if (cost < 0.01) {
    return cost.toFixed(6);
  }
  if (cost < 1) {
    return cost.toFixed(4);
  }
  return cost.toFixed(2);
}

/**
 * Round cost to avoid floating point issues
 */
function roundCost(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

/**
 * Calculate hourly cost rate from session data
 */
export function calculateHourlyCostRate(
  totalCost: number,
  durationMs: number
): number {
  if (durationMs <= 0) return 0;

  const hours = durationMs / (1000 * 60 * 60);
  return totalCost / hours;
}

/**
 * Estimate remaining budget usage
 */
export function estimateRemainingBudget(
  currentCost: number,
  budget: number
): {
  remaining: number;
  percentUsed: number;
  isOverBudget: boolean;
} {
  const remaining = budget - currentCost;
  const percentUsed = (currentCost / budget) * 100;

  return {
    remaining: Math.max(0, remaining),
    percentUsed: Math.min(100, percentUsed),
    isOverBudget: currentCost > budget,
  };
}

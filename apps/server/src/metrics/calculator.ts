/**
 * Main metrics computation
 */

import type {
  Turn,
  TurnMetrics,
  SessionMetrics,
  TokenMetrics,
  CostMetrics,
  CodeMetrics,
  EfficiencyComponents,
} from '@analytics/shared';
import {
  calculateContextUsage,
  calculateTotalTokens,
  createEmptyCodeMetrics,
  createEmptyTokenMetrics,
} from '@analytics/shared';
import { calculateTurnCost, aggregateCostMetrics } from './costCalculator.js';
import { aggregateCodeChanges } from './codeChangeTracker.js';
import {
  calculateEfficiencyComponents,
  calculateCacheUtilization,
} from './efficiencyScore.js';

/**
 * Calculate metrics for a single turn
 */
export function calculateTurnMetrics(turn: Turn): TurnMetrics {
  // Token metrics
  const tokens: TokenMetrics = {
    input: turn.usage.input_tokens,
    output: turn.usage.output_tokens,
    cacheCreation: turn.usage.cache_creation_input_tokens,
    cacheRead: turn.usage.cache_read_input_tokens,
    total: calculateTotalTokens(turn.usage),
  };

  // Debug log for first few turns (enable with DEBUG_TOKEN_USAGE=1)
  if (process.env.DEBUG_TOKEN_USAGE && turn.turnNumber <= 2) {
    console.log(`[calculateTurnMetrics] Turn ${turn.turnNumber}:`, {
      'turn.usage': turn.usage,
      'calculated tokens': tokens,
    });
  }

  // Cost metrics
  const cost = calculateTurnCost(turn.usage, turn.model);

  // Context usage (includes both input tokens and cache read tokens)
  const contextUsagePercent = calculateContextUsage(
    turn.usage.input_tokens,
    turn.model,
    turn.usage.cache_read_input_tokens
  );

  // Tool breakdown
  const toolBreakdown: Record<string, number> = {};
  for (const tool of turn.toolUses) {
    toolBreakdown[tool.name] = (toolBreakdown[tool.name] ?? 0) + 1;
  }

  // Code metrics
  const codeAggregated = aggregateCodeChanges(turn.codeChanges);
  const codeMetrics: CodeMetrics = {
    filesCreated: codeAggregated.filesCreated,
    filesModified: codeAggregated.filesModified,
    filesDeleted: codeAggregated.filesDeleted,
    linesAdded: codeAggregated.linesAdded,
    linesRemoved: codeAggregated.linesRemoved,
    netLinesChanged: codeAggregated.netLinesChanged,
  };

  return {
    turnId: turn.id,
    turnNumber: turn.turnNumber,
    timestamp: turn.startedAt,
    tokens,
    cost,
    durationMs: turn.durationMs,
    contextUsagePercent,
    toolCount: turn.toolUses.length,
    toolBreakdown,
    codeMetrics,
  };
}

/**
 * Calculate aggregated session metrics from turns
 */
export function calculateSessionMetrics(
  sessionId: string,
  turns: Turn[],
  turnMetrics: TurnMetrics[]
): SessionMetrics {
  if (turns.length === 0) {
    return createEmptySessionMetrics(sessionId);
  }

  // Aggregate tokens
  const totalTokens = aggregateTokenMetrics(turnMetrics);

  // Aggregate costs
  const costs = turnMetrics.map((m) => m.cost);
  const totalCostMetrics = aggregateCostMetrics(costs);

  // Calculate cost breakdown (all 4 components)
  const costBreakdown = {
    input: totalCostMetrics.input,
    output: totalCostMetrics.output,
    cacheCreation: totalCostMetrics.cacheCreation,
    cacheRead: totalCostMetrics.cacheRead,
  };

  // Aggregate code changes
  const allCodeChanges = turns.flatMap((t) => t.codeChanges);
  const codeAggregated = aggregateCodeChanges(allCodeChanges);
  const totalCodeChanges: CodeMetrics = {
    filesCreated: codeAggregated.filesCreated,
    filesModified: codeAggregated.filesModified,
    filesDeleted: codeAggregated.filesDeleted,
    linesAdded: codeAggregated.linesAdded,
    linesRemoved: codeAggregated.linesRemoved,
    netLinesChanged: codeAggregated.netLinesChanged,
  };

  // Aggregate tool usage
  const toolBreakdown: Record<string, number> = {};
  let totalToolUses = 0;
  for (const metrics of turnMetrics) {
    for (const [tool, count] of Object.entries(metrics.toolBreakdown)) {
      toolBreakdown[tool] = (toolBreakdown[tool] ?? 0) + count;
      totalToolUses += count;
    }
  }

  // Calculate totals
  const totalDurationMs = turnMetrics.reduce((sum, m) => sum + m.durationMs, 0);

  // Calculate averages
  const numTurns = turns.length;
  const averages = {
    tokensPerTurn: totalTokens.total / numTurns,
    costPerTurn: totalCostMetrics.total / numTurns,
    durationMsPerTurn: totalDurationMs / numTurns,
    contextUsagePercent:
      turnMetrics.reduce((sum, m) => sum + m.contextUsagePercent, 0) / numTurns,
  };

  // Calculate peaks
  const peaks = {
    maxTokensInTurn: Math.max(...turnMetrics.map((m) => m.tokens.total)),
    maxCostInTurn: Math.max(...turnMetrics.map((m) => m.cost.total)),
    maxDurationMs: Math.max(...turnMetrics.map((m) => m.durationMs)),
    maxContextUsagePercent: Math.max(
      ...turnMetrics.map((m) => m.contextUsagePercent)
    ),
  };

  // Calculate efficiency
  const efficiency = calculateEfficiencyComponents(
    turns,
    totalTokens,
    totalCodeChanges
  );

  // Calculate cache hit rate
  const cacheHitRate = calculateCacheUtilization(totalTokens);

  return {
    sessionId,
    totalTurns: numTurns,
    totalDurationMs,
    totalTokens,
    totalCost: totalCostMetrics.total,
    costBreakdown,
    averages,
    peaks,
    totalCodeChanges,
    totalToolUses,
    toolBreakdown,
    efficiencyScore: efficiency.compositeScore,
    cacheHitRate,
  };
}

/**
 * Aggregate token metrics from multiple turn metrics
 */
function aggregateTokenMetrics(turnMetrics: TurnMetrics[]): TokenMetrics {
  return turnMetrics.reduce(
    (acc, m) => ({
      input: acc.input + m.tokens.input,
      output: acc.output + m.tokens.output,
      cacheCreation: acc.cacheCreation + m.tokens.cacheCreation,
      cacheRead: acc.cacheRead + m.tokens.cacheRead,
      total: acc.total + m.tokens.total,
    }),
    createEmptyTokenMetrics()
  );
}

/**
 * Create empty session metrics
 */
function createEmptySessionMetrics(sessionId: string): SessionMetrics {
  return {
    sessionId,
    totalTurns: 0,
    totalDurationMs: 0,
    totalTokens: createEmptyTokenMetrics(),
    totalCost: 0,
    costBreakdown: { input: 0, output: 0, cacheCreation: 0, cacheRead: 0 },
    averages: {
      tokensPerTurn: 0,
      costPerTurn: 0,
      durationMsPerTurn: 0,
      contextUsagePercent: 0,
    },
    peaks: {
      maxTokensInTurn: 0,
      maxCostInTurn: 0,
      maxDurationMs: 0,
      maxContextUsagePercent: 0,
    },
    totalCodeChanges: createEmptyCodeMetrics(),
    totalToolUses: 0,
    toolBreakdown: {},
    efficiencyScore: 0,
    cacheHitRate: 0,
  };
}

/**
 * Calculate metrics for a specific time range
 */
export function calculateMetricsForTimeRange(
  turnMetrics: TurnMetrics[],
  startTime: Date,
  endTime: Date
): TurnMetrics[] {
  return turnMetrics.filter(
    (m) => m.timestamp >= startTime && m.timestamp <= endTime
  );
}

/**
 * Get time series data for charting
 */
export function getTimeSeriesData(
  turnMetrics: TurnMetrics[]
): Array<{
  timestamp: string;
  tokens: number;
  cost: number;
  contextUsage: number;
}> {
  return turnMetrics.map((m) => ({
    timestamp: m.timestamp.toISOString(),
    tokens: m.tokens.total,
    cost: m.cost.total,
    contextUsage: m.contextUsagePercent,
  }));
}

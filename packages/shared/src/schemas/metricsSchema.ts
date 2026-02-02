/**
 * Zod schemas for metrics validation
 */

import { z } from 'zod';

/**
 * Token metrics schema
 */
export const TokenMetricsSchema = z.object({
  input: z.number().int().nonnegative(),
  output: z.number().int().nonnegative(),
  cacheCreation: z.number().int().nonnegative(),
  cacheRead: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
});

/**
 * Cost metrics schema
 */
export const CostMetricsSchema = z.object({
  input: z.number().nonnegative(),
  output: z.number().nonnegative(),
  cacheCreation: z.number().nonnegative(),
  total: z.number().nonnegative(),
});

/**
 * Code metrics schema
 */
export const CodeMetricsSchema = z.object({
  filesCreated: z.number().int().nonnegative(),
  filesModified: z.number().int().nonnegative(),
  filesDeleted: z.number().int().nonnegative(),
  linesAdded: z.number().int().nonnegative(),
  linesRemoved: z.number().int().nonnegative(),
  netLinesChanged: z.number().int(),
});

/**
 * Turn metrics schema
 */
export const TurnMetricsSchema = z.object({
  turnId: z.string(),
  turnNumber: z.number().int().positive(),
  timestamp: z.date(),
  tokens: TokenMetricsSchema,
  cost: CostMetricsSchema,
  durationMs: z.number().nonnegative(),
  contextUsagePercent: z.number().min(0).max(100),
  toolCount: z.number().int().nonnegative(),
  toolBreakdown: z.record(z.number().int().nonnegative()),
  codeMetrics: CodeMetricsSchema,
});

/**
 * Serialized turn metrics schema (for API responses)
 */
export const SerializedTurnMetricsSchema = z.object({
  turnId: z.string(),
  turnNumber: z.number().int().positive(),
  timestamp: z.string().datetime(),
  tokens: TokenMetricsSchema,
  cost: CostMetricsSchema,
  durationMs: z.number().nonnegative(),
  contextUsagePercent: z.number().min(0).max(100),
  toolCount: z.number().int().nonnegative(),
  toolBreakdown: z.record(z.number().int().nonnegative()),
  codeMetrics: CodeMetricsSchema,
});

/**
 * Session metrics schema
 */
export const SessionMetricsSchema = z.object({
  sessionId: z.string(),
  totalTurns: z.number().int().nonnegative(),
  totalDurationMs: z.number().nonnegative(),
  totalTokens: TokenMetricsSchema,
  totalCost: z.number().nonnegative(),
  costBreakdown: z.object({
    input: z.number().nonnegative(),
    output: z.number().nonnegative(),
    cacheCreation: z.number().nonnegative(),
  }),
  averages: z.object({
    tokensPerTurn: z.number().nonnegative(),
    costPerTurn: z.number().nonnegative(),
    durationMsPerTurn: z.number().nonnegative(),
    contextUsagePercent: z.number().min(0).max(100),
  }),
  peaks: z.object({
    maxTokensInTurn: z.number().int().nonnegative(),
    maxCostInTurn: z.number().nonnegative(),
    maxDurationMs: z.number().nonnegative(),
    maxContextUsagePercent: z.number().min(0).max(100),
  }),
  totalCodeChanges: CodeMetricsSchema,
  totalToolUses: z.number().int().nonnegative(),
  toolBreakdown: z.record(z.number().int().nonnegative()),
  efficiencyScore: z.number().min(0).max(100),
  cacheHitRate: z.number().min(0).max(100),
});

/**
 * Efficiency components schema
 */
export const EfficiencyComponentsSchema = z.object({
  cacheUtilization: z.number().min(0).max(100),
  codeOutputRatio: z.number().nonnegative(),
  toolSuccessRate: z.number().min(0).max(100),
  contextEfficiency: z.number().nonnegative(),
  compositeScore: z.number().min(0).max(100),
});

/**
 * Cost breakdown schema
 */
export const CostBreakdownSchema = z.object({
  input: z.number().nonnegative(),
  output: z.number().nonnegative(),
  cacheCreation: z.number().nonnegative(),
  cacheRead: z.number().nonnegative(),
  total: z.number().nonnegative(),
});

/**
 * Type inference
 */
export type TokenMetricsInput = z.input<typeof TokenMetricsSchema>;
export type TokenMetricsOutput = z.output<typeof TokenMetricsSchema>;

export type CostMetricsInput = z.input<typeof CostMetricsSchema>;
export type CostMetricsOutput = z.output<typeof CostMetricsSchema>;

export type CodeMetricsInput = z.input<typeof CodeMetricsSchema>;
export type CodeMetricsOutput = z.output<typeof CodeMetricsSchema>;

export type TurnMetricsInput = z.input<typeof TurnMetricsSchema>;
export type TurnMetricsOutput = z.output<typeof TurnMetricsSchema>;

export type SerializedTurnMetricsInput = z.input<typeof SerializedTurnMetricsSchema>;
export type SerializedTurnMetricsOutput = z.output<typeof SerializedTurnMetricsSchema>;

export type SessionMetricsInput = z.input<typeof SessionMetricsSchema>;
export type SessionMetricsOutput = z.output<typeof SessionMetricsSchema>;

export type EfficiencyComponentsInput = z.input<typeof EfficiencyComponentsSchema>;
export type EfficiencyComponentsOutput = z.output<typeof EfficiencyComponentsSchema>;

export type CostBreakdownInput = z.input<typeof CostBreakdownSchema>;
export type CostBreakdownOutput = z.output<typeof CostBreakdownSchema>;

/**
 * Serialize turn metrics for API response
 */
export function serializeTurnMetrics(
  metrics: TurnMetricsOutput
): SerializedTurnMetricsOutput {
  return {
    ...metrics,
    timestamp: metrics.timestamp.toISOString(),
  };
}

/**
 * Deserialize turn metrics from API response
 */
export function deserializeTurnMetrics(
  data: SerializedTurnMetricsOutput
): TurnMetricsOutput {
  return {
    ...data,
    timestamp: new Date(data.timestamp),
  };
}

/**
 * Validate and parse session metrics
 */
export function validateSessionMetrics(
  data: unknown
): { success: true; data: SessionMetricsOutput } | { success: false; error: z.ZodError } {
  return SessionMetricsSchema.safeParse(data) as
    | { success: true; data: SessionMetricsOutput }
    | { success: false; error: z.ZodError };
}

/**
 * Validate and parse turn metrics
 */
export function validateTurnMetrics(
  data: unknown
): { success: true; data: TurnMetricsOutput } | { success: false; error: z.ZodError } {
  return TurnMetricsSchema.safeParse(data) as
    | { success: true; data: TurnMetricsOutput }
    | { success: false; error: z.ZodError };
}

/**
 * Validate and parse efficiency components
 */
export function validateEfficiencyComponents(
  data: unknown
):
  | { success: true; data: EfficiencyComponentsOutput }
  | { success: false; error: z.ZodError } {
  return EfficiencyComponentsSchema.safeParse(data) as
    | { success: true; data: EfficiencyComponentsOutput }
    | { success: false; error: z.ZodError };
}

/**
 * Create empty code metrics
 */
export function createEmptyCodeMetrics(): CodeMetricsOutput {
  return {
    filesCreated: 0,
    filesModified: 0,
    filesDeleted: 0,
    linesAdded: 0,
    linesRemoved: 0,
    netLinesChanged: 0,
  };
}

/**
 * Create empty token metrics
 */
export function createEmptyTokenMetrics(): TokenMetricsOutput {
  return {
    input: 0,
    output: 0,
    cacheCreation: 0,
    cacheRead: 0,
    total: 0,
  };
}

/**
 * Create empty cost metrics
 */
export function createEmptyCostMetrics(): CostMetricsOutput {
  return {
    input: 0,
    output: 0,
    cacheCreation: 0,
    total: 0,
  };
}

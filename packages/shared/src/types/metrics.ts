/**
 * Metrics types for turn and session analytics
 */

/**
 * Token metrics breakdown
 */
export interface TokenMetrics {
  input: number;
  output: number;
  cacheCreation: number;
  cacheRead: number;
  total: number;
}

/**
 * Cost metrics breakdown
 *
 * Includes all 4 cost components as per Claude API pricing:
 * - input: Standard input tokens ($5.00/M for Opus 4.5)
 * - output: Output tokens ($25.00/M for Opus 4.5)
 * - cacheCreation: Cache write tokens ($6.25/M for Opus 4.5)
 * - cacheRead: Cache read tokens ($0.50/M for Opus 4.5)
 */
export interface CostMetrics {
  input: number;
  output: number;
  cacheCreation: number;
  cacheRead: number;
  total: number;
}

/**
 * Code change metrics
 */
export interface CodeMetrics {
  filesCreated: number;
  filesModified: number;
  filesDeleted: number;
  linesAdded: number;
  linesRemoved: number;
  netLinesChanged: number;
}

/**
 * Metrics for a single turn
 */
export interface TurnMetrics {
  /** Turn ID */
  turnId: string;

  /** Turn number in session */
  turnNumber: number;

  /** Timestamp for time series */
  timestamp: Date;

  /** Token metrics */
  tokens: TokenMetrics;

  /** Cost in USD */
  cost: CostMetrics;

  /** Duration in milliseconds */
  durationMs: number;

  /** Context window usage percentage (0-100) */
  contextUsagePercent: number;

  /** Number of tools used */
  toolCount: number;

  /** Tool breakdown by name */
  toolBreakdown: Record<string, number>;

  /** Code change metrics */
  codeMetrics: CodeMetrics;
}

/**
 * Aggregated metrics for a session
 */
export interface SessionMetrics {
  /** Session ID */
  sessionId: string;

  /** Total turns */
  totalTurns: number;

  /** Session duration in milliseconds */
  totalDurationMs: number;

  /** Token totals */
  totalTokens: TokenMetrics;

  /** Total cost in USD */
  totalCost: number;

  /** Cost breakdown by category (all 4 components) */
  costBreakdown: {
    input: number;
    output: number;
    cacheCreation: number;
    cacheRead: number;
  };

  /** Average metrics per turn */
  averages: {
    tokensPerTurn: number;
    costPerTurn: number;
    durationMsPerTurn: number;
    contextUsagePercent: number;
  };

  /** Peak values */
  peaks: {
    maxTokensInTurn: number;
    maxCostInTurn: number;
    maxDurationMs: number;
    maxContextUsagePercent: number;
  };

  /** Total code changes */
  totalCodeChanges: CodeMetrics;

  /** Tool usage totals */
  totalToolUses: number;

  /** Tool breakdown */
  toolBreakdown: Record<string, number>;

  /** Efficiency score (0-100) */
  efficiencyScore: number;

  /** Cache hit rate (0-100) */
  cacheHitRate: number;
}

/**
 * Efficiency score components
 */
export interface EfficiencyComponents {
  /** Cache utilization (0-100) */
  cacheUtilization: number;

  /** Code output ratio (lines changed / tokens used) */
  codeOutputRatio: number;

  /** Tool success rate (0-100) */
  toolSuccessRate: number;

  /** Context efficiency (output tokens / context used) */
  contextEfficiency: number;

  /** Composite score (0-100) */
  compositeScore: number;
}

/**
 * Serialized turn metrics for API responses (dates as strings)
 */
export interface SerializedTurnMetrics {
  turnId: string;
  turnNumber: number;
  timestamp: string;
  tokens: TokenMetrics;
  cost: CostMetrics;
  durationMs: number;
  contextUsagePercent: number;
  toolCount: number;
  toolBreakdown: Record<string, number>;
  codeMetrics: CodeMetrics;
}

/**
 * Cost breakdown result from calculator
 */
export interface CostBreakdown {
  input: number;
  output: number;
  cacheCreation: number;
  cacheRead: number;
  total: number;
}

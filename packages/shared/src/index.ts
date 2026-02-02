/**
 * @analytics/shared - Shared types, schemas, and utilities
 *
 * This package provides common TypeScript types, Zod validation schemas,
 * pricing calculations, and utility functions for the Claude Code Analytics Dashboard.
 */

// ============================================================================
// Types
// ============================================================================

// JSONL types
export type {
  RawJSONLEntry,
  RawMessage,
  ContentBlock,
  TextContent,
  ThinkingContent,
  ToolUseContent,
  ToolResultContent,
  ToolUseResult,
  TokenUsage,
} from './types/jsonl.js';

// Session types
export type {
  Session,
  Turn,
  ToolUse,
  CodeChange,
  SerializedSession,
  SerializedTurn,
} from './types/session.js';

// Metrics types
export type {
  TokenMetrics,
  CostMetrics,
  CodeMetrics,
  TurnMetrics,
  SessionMetrics,
  EfficiencyComponents,
  SerializedTurnMetrics,
  CostBreakdown,
} from './types/metrics.js';

// Pricing types
export type { ModelPricing } from './types/pricing.js';

// SSE types
export type {
  SSEEvent,
  SSEConnectedEvent,
  SSESessionEvent,
  SSETurnEvent,
  SSEMetricsEvent,
  SSEHeartbeatEvent,
  SSEErrorEvent,
  SSEEventName,
  SSEEventData,
  SSEConnectionStatus,
  SSESubscriptionOptions,
} from './types/sse.js';

// MCP types
export type {
  GetSessionMetricsInput,
  GetSessionMetricsOutput,
  GetTurnDetailsInput,
  GetTurnDetailsOutput,
  ListSessionsInput,
  ListSessionsOutput,
  SessionSummary,
  GetEfficiencyReportInput,
  GetEfficiencyReportOutput,
  MCPResourceURI,
} from './types/mcp.js';

export {
  parseMCPResourceURI,
  GET_SESSION_METRICS_SCHEMA,
  GET_TURN_DETAILS_SCHEMA,
  LIST_SESSIONS_SCHEMA,
  GET_EFFICIENCY_REPORT_SCHEMA,
} from './types/mcp.js';

// ============================================================================
// Schemas
// ============================================================================

// JSONL schemas
export {
  TokenUsageSchema,
  TextContentSchema,
  ThinkingContentSchema,
  ToolUseContentSchema,
  ToolResultContentSchema,
  ContentBlockSchema,
  RawMessageSchema,
  ToolUseResultSchema,
  RawJSONLEntrySchema,
  PartialRawJSONLEntrySchema,
  parseJSONLLine,
  validateJSONLEntry,
} from './schemas/jsonlSchema.js';

// Session schemas
export {
  ToolUseSchema,
  CodeChangeSchema,
  SessionSchema,
  TurnSchema,
  SerializedSessionSchema,
  SerializedTurnSchema,
  serializeSession,
  deserializeSession,
  serializeTurn,
  deserializeTurn,
  validateSession,
  validateTurn,
} from './schemas/sessionSchema.js';

// Metrics schemas
export {
  TokenMetricsSchema,
  CostMetricsSchema,
  CodeMetricsSchema,
  TurnMetricsSchema,
  SerializedTurnMetricsSchema,
  SessionMetricsSchema,
  EfficiencyComponentsSchema,
  CostBreakdownSchema,
  serializeTurnMetrics,
  deserializeTurnMetrics,
  validateSessionMetrics,
  validateTurnMetrics,
  validateEfficiencyComponents,
  createEmptyCodeMetrics,
  createEmptyTokenMetrics,
  createEmptyCostMetrics,
} from './schemas/metricsSchema.js';

// ============================================================================
// Pricing
// ============================================================================

export {
  PRICING_DATABASE,
  DEFAULT_MODEL_ID,
  getDefaultPricing,
  listModelIds,
  hasModel,
  getModelPricing,
  getModelPricingOrDefault,
  calculateTokenCost,
  calculateContextUsage,
  calculateCacheHitRate,
  calculateTotalTokens,
  estimateCost,
  formatCost,
  aggregateCosts,
  aggregateTokenUsage,
} from './pricing/index.js';

// ============================================================================
// Utilities
// ============================================================================

// Date utilities
export {
  parseISODate,
  toDate,
  formatDate,
  toISOString,
  formatTime,
  formatDateOnly,
  formatDuration,
  formatRelativeTime,
  formatRelativeDate,
  calculateDuration,
  isWithinWindow,
  isSessionActive,
  TimeRanges,
  isDateBefore,
  isDateAfter,
  minDate,
  maxDate,
  groupByDate,
  groupByHour,
} from './utils/dates.js';

export type { TimeRangeName } from './utils/dates.js';

// Formatting utilities
export {
  formatNumber,
  formatDecimal,
  formatCompact,
  formatPercent,
  formatFractionAsPercent,
  formatTokens,
  formatTokensFull,
  formatCurrency,
  formatMicroCurrency,
  formatBytes,
  formatLinesChanged,
  formatNetLines,
  truncate,
  truncateMiddle,
  formatPath,
  getFilename,
  getExtension,
  formatList,
} from './utils/formatting.js';

// LRU Cache
export { LRUCache } from './utils/LRUCache.js';

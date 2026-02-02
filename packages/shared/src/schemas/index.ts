/**
 * Schema exports for @analytics/shared
 */

// JSONL schemas
export {
  TokenUsageSchema,
  TextContentSchema,
  ToolUseContentSchema,
  ToolResultContentSchema,
  ContentBlockSchema,
  RawMessageSchema,
  ToolUseResultSchema,
  RawJSONLEntrySchema,
  PartialRawJSONLEntrySchema,
  parseJSONLLine,
  validateJSONLEntry,
} from './jsonlSchema.js';

export type {
  TokenUsageInput,
  TokenUsageOutput,
  TextContentInput,
  ToolUseContentInput,
  ToolResultContentInput,
  ContentBlockInput,
  RawMessageInput,
  RawMessageOutput,
  ToolUseResultInput,
  RawJSONLEntryInput,
  RawJSONLEntryOutput,
} from './jsonlSchema.js';

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
} from './sessionSchema.js';

export type {
  ToolUseInput,
  ToolUseOutput,
  CodeChangeInput,
  CodeChangeOutput,
  SessionInput,
  SessionOutput,
  TurnInput,
  TurnOutput,
  SerializedSessionInput,
  SerializedSessionOutput,
  SerializedTurnInput,
  SerializedTurnOutput,
} from './sessionSchema.js';

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
} from './metricsSchema.js';

export type {
  TokenMetricsInput,
  TokenMetricsOutput,
  CostMetricsInput,
  CostMetricsOutput,
  CodeMetricsInput,
  CodeMetricsOutput,
  TurnMetricsInput,
  TurnMetricsOutput,
  SerializedTurnMetricsInput,
  SerializedTurnMetricsOutput,
  SessionMetricsInput,
  SessionMetricsOutput,
  EfficiencyComponentsInput,
  EfficiencyComponentsOutput,
  CostBreakdownInput,
  CostBreakdownOutput,
} from './metricsSchema.js';

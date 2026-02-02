/**
 * Zod schemas for JSONL validation
 */

import { z } from 'zod';

/**
 * Token usage schema - flexible to handle different formats
 * Real format may have nested cache_creation object
 */
export const TokenUsageSchema = z.object({
  input_tokens: z.number().int().nonnegative(),
  output_tokens: z.number().int().nonnegative(),
  cache_creation_input_tokens: z.number().int().nonnegative().default(0),
  cache_read_input_tokens: z.number().int().nonnegative().default(0),
  // Allow additional fields from the real format
  cache_creation: z.object({
    ephemeral_5m_input_tokens: z.number().optional(),
    ephemeral_1h_input_tokens: z.number().optional(),
  }).optional(),
  service_tier: z.string().optional(),
}).passthrough();

/**
 * Text content block schema
 */
export const TextContentSchema = z.object({
  type: z.literal('text'),
  text: z.string(),
});

/**
 * Thinking content block schema (extended thinking)
 */
export const ThinkingContentSchema = z.object({
  type: z.literal('thinking'),
  thinking: z.string(),
  signature: z.string().optional(),
});

/**
 * Tool use content block schema
 */
export const ToolUseContentSchema = z.object({
  type: z.literal('tool_use'),
  id: z.string(),
  name: z.string(),
  input: z.record(z.unknown()),
});

/**
 * Tool result content block schema
 */
export const ToolResultContentSchema = z.object({
  type: z.literal('tool_result'),
  tool_use_id: z.string(),
  content: z.union([z.string(), z.array(z.lazy(() => ContentBlockSchema))]),
  is_error: z.boolean().optional(),
});

/**
 * Content block union schema
 */
export const ContentBlockSchema: z.ZodType = z.discriminatedUnion('type', [
  TextContentSchema,
  ThinkingContentSchema,
  ToolUseContentSchema,
  ToolResultContentSchema,
]);

/**
 * Raw message schema - flexible to handle both string and array content
 * User messages often have string content, assistant messages have array content
 */
export const RawMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  // Content can be a string (user messages) or array of content blocks (assistant)
  content: z.union([z.string(), z.array(ContentBlockSchema)]),
  usage: TokenUsageSchema.optional(),
  model: z.string().optional(),
  stop_reason: z.enum(['end_turn', 'tool_use', 'max_tokens']).nullable().optional(),
  // Additional fields from real format
  id: z.string().optional(),
  type: z.string().optional(),
  stop_sequence: z.unknown().optional(),
}).passthrough();

/**
 * Tool use result schema (standalone)
 */
export const ToolUseResultSchema = z.object({
  tool_use_id: z.string(),
  content: z.string(),
  is_error: z.boolean().optional(),
});

/**
 * Summary entry schema - for type: "summary" entries that don't have message
 */
export const SummaryEntrySchema = z.object({
  type: z.literal('summary'),
  summary: z.string(),
  leafUuid: z.string(),
}).passthrough();

/**
 * Raw JSONL entry schema - flexible to handle real Claude Code format
 */
export const RawJSONLEntrySchema = z.object({
  uuid: z.string(),
  parentUuid: z.string().nullable(),
  sessionId: z.string(),
  version: z.string(),
  gitBranch: z.string().nullable(),
  cwd: z.string(),
  timestamp: z.string(),  // Allow any string, datetime validation too strict
  message: RawMessageSchema,
  toolUseResult: ToolUseResultSchema.optional(),
  // Additional fields from real format
  type: z.enum(['user', 'assistant', 'summary']).optional(),
  isSidechain: z.boolean().optional(),
  userType: z.string().optional(),
  agentId: z.string().optional(),
  slug: z.string().optional(),
  requestId: z.string().optional(),
}).passthrough();

/**
 * Partial schema for graceful parsing of incomplete entries
 */
export const PartialRawJSONLEntrySchema = RawJSONLEntrySchema.partial({
  parentUuid: true,
  gitBranch: true,
  toolUseResult: true,
  message: true,  // Allow entries without message (e.g., summary)
});

/**
 * Type inference helpers
 */
export type TokenUsageInput = z.input<typeof TokenUsageSchema>;
export type TokenUsageOutput = z.output<typeof TokenUsageSchema>;

export type TextContentInput = z.input<typeof TextContentSchema>;
export type ToolUseContentInput = z.input<typeof ToolUseContentSchema>;
export type ToolResultContentInput = z.input<typeof ToolResultContentSchema>;
export type ContentBlockInput = z.input<typeof ContentBlockSchema>;

export type RawMessageInput = z.input<typeof RawMessageSchema>;
export type RawMessageOutput = z.output<typeof RawMessageSchema>;

export type ToolUseResultInput = z.input<typeof ToolUseResultSchema>;

export type RawJSONLEntryInput = z.input<typeof RawJSONLEntrySchema>;
export type RawJSONLEntryOutput = z.output<typeof RawJSONLEntrySchema>;

/**
 * Parse a single JSONL line
 */
export function parseJSONLLine(line: string): RawJSONLEntryOutput | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  try {
    const json = JSON.parse(trimmed);

    // Skip summary entries - they don't have message data we need
    if (json.type === 'summary') {
      return null;
    }

    // Try full schema first
    const result = RawJSONLEntrySchema.safeParse(json);
    if (result.success) {
      return result.data;
    }

    // Try partial parsing for incomplete entries
    const partialResult = PartialRawJSONLEntrySchema.safeParse(json);
    if (partialResult.success && partialResult.data.message) {
      return partialResult.data as RawJSONLEntryOutput;
    }

    // Debug: log what failed validation
    if (process.env.DEBUG_JSONL) {
      console.error('JSONL parse failed. Entry type:', json.type, 'Keys:', Object.keys(json));
      console.error('Full schema error:', result.error?.issues?.slice(0, 3));
    }

    return null;
  } catch (err) {
    if (process.env.DEBUG_JSONL) {
      console.error('JSONL JSON.parse failed:', err);
    }
    return null;
  }
}

/**
 * Validate a raw JSONL entry
 */
export function validateJSONLEntry(
  entry: unknown
): { success: true; data: RawJSONLEntryOutput } | { success: false; error: z.ZodError } {
  return RawJSONLEntrySchema.safeParse(entry) as
    | { success: true; data: RawJSONLEntryOutput }
    | { success: false; error: z.ZodError };
}

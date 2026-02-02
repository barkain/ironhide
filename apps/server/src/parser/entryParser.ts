/**
 * Entry validation and normalization using shared Zod schemas
 */

import type {
  RawJSONLEntry,
  ContentBlock,
  TextContent,
  ToolUseContent,
  ToolResultContent,
  TokenUsage,
} from '@analytics/shared';
import { validateJSONLEntry } from '@analytics/shared';

/**
 * Validated entry with additional metadata
 */
export interface ValidatedEntry {
  /** Original raw entry */
  raw: RawJSONLEntry;
  /** Parsed timestamp */
  timestamp: Date;
  /** Extracted text content */
  textContent: string;
  /** Extracted tool uses */
  toolUses: ToolUseContent[];
  /** Extracted tool results */
  toolResults: ToolResultContent[];
  /** Token usage (if present) */
  usage: TokenUsage | null;
  /** Whether this is a user message */
  isUserMessage: boolean;
  /** Whether this is an assistant message */
  isAssistantMessage: boolean;
  /** Whether this is a HUMAN user message (starts a new cycle) vs tool result */
  isHumanMessage: boolean;
}

/**
 * Validate and enrich a raw entry
 */
export function validateEntry(
  data: unknown
): { success: true; entry: ValidatedEntry } | { success: false; error: string } {
  const result = validateJSONLEntry(data);

  if (!result.success) {
    const errorMessages = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    return { success: false, error: errorMessages };
  }

  const raw = result.data;

  // Parse timestamp
  const timestamp = new Date(raw.timestamp);
  if (isNaN(timestamp.getTime())) {
    return { success: false, error: 'Invalid timestamp' };
  }

  // Extract content
  const textContent = extractTextContent(raw.message.content);
  const toolUses = extractToolUses(raw.message.content);
  const toolResults = extractToolResults(raw.message.content);

  // Get usage
  const usage = raw.message.usage ?? null;

  // Determine if this is a user message
  const isUserMessage = raw.message.role === 'user';

  // A HUMAN message is a user message that:
  // 1. Has text content (user typed something)
  // 2. Does NOT have tool_result blocks (not a tool result submission)
  // 3. Entry type is 'user' (not 'assistant' or 'summary')
  // This distinguishes genuine user prompts from tool result messages
  const isHumanMessage =
    isUserMessage &&
    textContent.trim().length > 0 &&
    toolResults.length === 0 &&
    (raw as { type?: string }).type !== 'assistant';

  return {
    success: true,
    entry: {
      raw,
      timestamp,
      textContent,
      toolUses,
      toolResults,
      usage,
      isUserMessage,
      isAssistantMessage: raw.message.role === 'assistant',
      isHumanMessage,
    },
  };
}

/**
 * Extract text content from content (can be string or array of blocks)
 * User messages often have string content, assistant messages have array content
 */
export function extractTextContent(content: string | ContentBlock[]): string {
  // Handle string content (common for user messages)
  if (typeof content === 'string') {
    return content;
  }

  // Handle array of content blocks
  const textParts: string[] = [];

  for (const block of content) {
    if (block.type === 'text') {
      textParts.push((block as TextContent).text);
    }
  }

  return textParts.join('\n');
}

/**
 * Extract tool use blocks
 * Returns empty array if content is a string (user messages)
 */
export function extractToolUses(content: string | ContentBlock[]): ToolUseContent[] {
  if (typeof content === 'string') {
    return [];
  }
  return content.filter(
    (block): block is ToolUseContent => block.type === 'tool_use'
  );
}

/**
 * Extract tool result blocks
 * Returns empty array if content is a string (user messages)
 */
export function extractToolResults(content: string | ContentBlock[]): ToolResultContent[] {
  if (typeof content === 'string') {
    return [];
  }
  return content.filter(
    (block): block is ToolResultContent => block.type === 'tool_result'
  );
}

/**
 * Get tool result content as string
 */
export function getToolResultContent(result: ToolResultContent): string {
  if (typeof result.content === 'string') {
    return result.content;
  }
  // Content is array of blocks
  return extractTextContent(result.content);
}

/**
 * Check if entry has tool usage
 */
export function hasToolUsage(entry: ValidatedEntry): boolean {
  return entry.toolUses.length > 0 || entry.toolResults.length > 0;
}

/**
 * Check if this is a tool response entry
 */
export function isToolResponseEntry(raw: RawJSONLEntry): boolean {
  return raw.toolUseResult !== undefined;
}

/**
 * Get model from entry
 */
export function getModel(entry: ValidatedEntry): string {
  return entry.raw.message.model ?? 'unknown';
}

/**
 * Get stop reason from entry
 */
export function getStopReason(
  entry: ValidatedEntry
): 'end_turn' | 'tool_use' | 'max_tokens' | null {
  return entry.raw.message.stop_reason ?? null;
}

/**
 * Create default token usage (zeros)
 */
export function createDefaultTokenUsage(): TokenUsage {
  return {
    input_tokens: 0,
    output_tokens: 0,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
  };
}

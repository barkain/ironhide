/**
 * Raw JSONL entry types as read from Claude Code session logs
 * Location: ~/.claude/projects/{project-hash}/{session-uuid}.jsonl
 */

/**
 * Raw JSONL entry as read from Claude Code session logs
 */
export interface RawJSONLEntry {
  /** Unique identifier for this entry */
  uuid: string;

  /** Parent entry UUID for threading */
  parentUuid: string | null;

  /** Session identifier */
  sessionId: string;

  /** Log format version */
  version: string;

  /** Git branch at time of entry */
  gitBranch: string | null;

  /** Working directory */
  cwd: string;

  /** ISO-8601 timestamp */
  timestamp: string;

  /** Message content */
  message: RawMessage;

  /** Tool use result (when entry is tool response) */
  toolUseResult?: ToolUseResult;

  /** Request ID for grouping streaming chunks */
  requestId?: string;
}

/**
 * Raw message structure from JSONL
 */
export interface RawMessage {
  /** Message role */
  role: 'user' | 'assistant';

  /** Content - string for user messages, array of blocks for assistant messages */
  content: string | ContentBlock[];

  /** Token usage metrics (only on assistant messages) */
  usage?: TokenUsage;

  /** Model identifier */
  model?: string;

  /** Stop reason */
  stop_reason?: 'end_turn' | 'tool_use' | 'max_tokens';
}

/**
 * Thinking content block (extended thinking)
 */
export interface ThinkingContent {
  type: 'thinking';
  thinking: string;
  signature?: string;
}

/**
 * Content block union type
 */
export type ContentBlock =
  | TextContent
  | ThinkingContent
  | ToolUseContent
  | ToolResultContent;

/**
 * Text content block
 */
export interface TextContent {
  type: 'text';
  text: string;
}

/**
 * Tool use content block
 */
export interface ToolUseContent {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

/**
 * Tool result content block
 */
export interface ToolResultContent {
  type: 'tool_result';
  tool_use_id: string;
  content: string | ContentBlock[];
  is_error?: boolean;
}

/**
 * Tool use result (standalone, not in content array)
 */
export interface ToolUseResult {
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}

/**
 * Token usage metrics
 */
export interface TokenUsage {
  /** Input tokens consumed */
  input_tokens: number;

  /** Output tokens generated */
  output_tokens: number;

  /** Tokens used to create cache */
  cache_creation_input_tokens: number;

  /** Tokens read from cache */
  cache_read_input_tokens: number;
}

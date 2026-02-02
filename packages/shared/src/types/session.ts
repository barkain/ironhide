/**
 * Session and Turn types for parsed/validated data
 */

import type { TokenUsage } from './jsonl.js';

/**
 * Represents a complete Claude Code session
 */
export interface Session {
  /** Unique session identifier */
  id: string;

  /** Project path (hashed in filesystem) */
  projectPath: string;

  /** Project display name (from cwd) */
  projectName: string;

  /** Git branch */
  branch: string | null;

  /** Session start time */
  startedAt: Date;

  /** Session last activity time */
  lastActivityAt: Date;

  /** Model used in session */
  model: string;

  /** Number of turns in session */
  turnCount: number;

  /** Whether session is currently active (recent activity) */
  isActive: boolean;
}

/**
 * Represents a single turn (user prompt + assistant response cycle)
 */
export interface Turn {
  /** Unique turn identifier */
  id: string;

  /** Parent session ID */
  sessionId: string;

  /** Turn sequence number within session */
  turnNumber: number;

  /** Turn start timestamp */
  startedAt: Date;

  /** Turn end timestamp */
  endedAt: Date;

  /** Duration in milliseconds */
  durationMs: number;

  /** User message content (text only) */
  userMessage: string;

  /** Assistant response (text only, tools excluded) */
  assistantMessage: string;

  /** Token usage for this turn */
  usage: TokenUsage;

  /** Tool uses within this turn */
  toolUses: ToolUse[];

  /** Code changes made in this turn */
  codeChanges: CodeChange[];

  /** Model used for this turn */
  model: string;
}

/**
 * Tool invocation record
 */
export interface ToolUse {
  /** Tool use ID */
  id: string;

  /** Tool name (e.g., 'Read', 'Write', 'Bash') */
  name: string;

  /** Tool input parameters */
  input: Record<string, unknown>;

  /** Tool result */
  result?: string;

  /** Whether tool execution errored */
  isError: boolean;

  /** Duration in milliseconds */
  durationMs: number;
}

/**
 * Code change record (from Write, Edit, MultiEdit tools)
 */
export interface CodeChange {
  /** File path */
  filePath: string;

  /** Change type */
  type: 'create' | 'modify' | 'delete';

  /** Lines added (positive) */
  linesAdded: number;

  /** Lines removed (positive) */
  linesRemoved: number;

  /** File extension */
  extension: string;
}

/**
 * Serialized session for API responses (dates as strings)
 */
export interface SerializedSession {
  id: string;
  projectPath: string;
  projectName: string;
  branch: string | null;
  startedAt: string;
  lastActivityAt: string;
  model: string;
  turnCount: number;
  isActive: boolean;
}

/**
 * Serialized turn for API responses (dates as strings)
 */
export interface SerializedTurn {
  id: string;
  sessionId: string;
  turnNumber: number;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  userMessage: string;
  assistantMessage: string;
  usage: TokenUsage;
  toolUses: ToolUse[];
  codeChanges: CodeChange[];
  model: string;
}

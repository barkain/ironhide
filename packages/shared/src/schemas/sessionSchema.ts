/**
 * Zod schemas for Session and Turn validation
 */

import { z } from 'zod';
import { TokenUsageSchema } from './jsonlSchema.js';

/**
 * Tool use schema
 */
export const ToolUseSchema = z.object({
  id: z.string(),
  name: z.string(),
  input: z.record(z.unknown()),
  result: z.string().optional(),
  isError: z.boolean(),
  durationMs: z.number().nonnegative(),
});

/**
 * Code change schema
 */
export const CodeChangeSchema = z.object({
  filePath: z.string(),
  type: z.enum(['create', 'modify', 'delete']),
  linesAdded: z.number().int().nonnegative(),
  linesRemoved: z.number().int().nonnegative(),
  extension: z.string(),
});

/**
 * Session schema
 */
export const SessionSchema = z.object({
  id: z.string(),
  projectPath: z.string(),
  projectName: z.string(),
  branch: z.string().nullable(),
  startedAt: z.date(),
  lastActivityAt: z.date(),
  model: z.string(),
  turnCount: z.number().int().nonnegative(),
  isActive: z.boolean(),
});

/**
 * Turn schema
 */
export const TurnSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  turnNumber: z.number().int().positive(),
  startedAt: z.date(),
  endedAt: z.date(),
  durationMs: z.number().nonnegative(),
  userMessage: z.string(),
  assistantMessage: z.string(),
  usage: TokenUsageSchema,
  toolUses: z.array(ToolUseSchema),
  codeChanges: z.array(CodeChangeSchema),
  model: z.string(),
});

/**
 * Serialized session schema (for API responses)
 */
export const SerializedSessionSchema = z.object({
  id: z.string(),
  projectPath: z.string(),
  projectName: z.string(),
  branch: z.string().nullable(),
  startedAt: z.string().datetime(),
  lastActivityAt: z.string().datetime(),
  model: z.string(),
  turnCount: z.number().int().nonnegative(),
  isActive: z.boolean(),
});

/**
 * Serialized turn schema (for API responses)
 */
export const SerializedTurnSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  turnNumber: z.number().int().positive(),
  startedAt: z.string().datetime(),
  endedAt: z.string().datetime(),
  durationMs: z.number().nonnegative(),
  userMessage: z.string(),
  assistantMessage: z.string(),
  usage: TokenUsageSchema,
  toolUses: z.array(ToolUseSchema),
  codeChanges: z.array(CodeChangeSchema),
  model: z.string(),
});

/**
 * Type inference
 */
export type ToolUseInput = z.input<typeof ToolUseSchema>;
export type ToolUseOutput = z.output<typeof ToolUseSchema>;

export type CodeChangeInput = z.input<typeof CodeChangeSchema>;
export type CodeChangeOutput = z.output<typeof CodeChangeSchema>;

export type SessionInput = z.input<typeof SessionSchema>;
export type SessionOutput = z.output<typeof SessionSchema>;

export type TurnInput = z.input<typeof TurnSchema>;
export type TurnOutput = z.output<typeof TurnSchema>;

export type SerializedSessionInput = z.input<typeof SerializedSessionSchema>;
export type SerializedSessionOutput = z.output<typeof SerializedSessionSchema>;

export type SerializedTurnInput = z.input<typeof SerializedTurnSchema>;
export type SerializedTurnOutput = z.output<typeof SerializedTurnSchema>;

/**
 * Serialize a session for API response
 */
export function serializeSession(session: SessionOutput): SerializedSessionOutput {
  return {
    ...session,
    startedAt: session.startedAt.toISOString(),
    lastActivityAt: session.lastActivityAt.toISOString(),
  };
}

/**
 * Deserialize a session from API response
 */
export function deserializeSession(data: SerializedSessionOutput): SessionOutput {
  return {
    ...data,
    startedAt: new Date(data.startedAt),
    lastActivityAt: new Date(data.lastActivityAt),
  };
}

/**
 * Serialize a turn for API response
 */
export function serializeTurn(turn: TurnOutput): SerializedTurnOutput {
  return {
    ...turn,
    startedAt: turn.startedAt.toISOString(),
    endedAt: turn.endedAt.toISOString(),
  };
}

/**
 * Deserialize a turn from API response
 */
export function deserializeTurn(data: SerializedTurnOutput): TurnOutput {
  return {
    ...data,
    startedAt: new Date(data.startedAt),
    endedAt: new Date(data.endedAt),
  };
}

/**
 * Validate and parse a session
 */
export function validateSession(
  data: unknown
): { success: true; data: SessionOutput } | { success: false; error: z.ZodError } {
  return SessionSchema.safeParse(data) as
    | { success: true; data: SessionOutput }
    | { success: false; error: z.ZodError };
}

/**
 * Validate and parse a turn
 */
export function validateTurn(
  data: unknown
): { success: true; data: TurnOutput } | { success: false; error: z.ZodError } {
  return TurnSchema.safeParse(data) as
    | { success: true; data: TurnOutput }
    | { success: false; error: z.ZodError };
}

/**
 * Groups JSONL entries into cycles
 *
 * A cycle is defined as: human user message + all assistant responses + tool results
 * until the next human user message.
 *
 * This properly groups tool use continuations into the same cycle, so a single
 * user prompt that triggers multiple tool uses is counted as ONE cycle.
 */

import type { RawJSONLEntry, Turn, ToolUse, CodeChange, TokenUsage } from '@analytics/shared';
import {
  validateEntry,
  extractTextContent,
  getModel,
  getToolResultContent,
  createDefaultTokenUsage,
  type ValidatedEntry,
} from './entryParser.js';
import { extractCodeChanges } from '../metrics/codeChangeTracker.js';

/**
 * Intermediate cycle builder state
 */
interface TurnBuilder {
  sessionId: string;
  turnNumber: number;
  userEntry: ValidatedEntry | null;
  assistantEntries: ValidatedEntry[];
  toolResultEntries: ValidatedEntry[]; // Track tool result messages
  toolUses: Map<string, ToolUse>;
  startedAt: Date | null;
  endedAt: Date | null;
}

/**
 * Aggregate entries into cycles
 *
 * @param entries - Raw JSONL entries in chronological order
 * @param sessionId - Session ID for the cycles
 * @returns Array of aggregated cycles (named Turn for compatibility)
 */
export function aggregateEntriesIntoTurns(
  entries: RawJSONLEntry[],
  sessionId: string
): Turn[] {
  const turns: Turn[] = [];
  let currentTurn: TurnBuilder | null = null;
  let turnNumber = 1;

  for (const entry of entries) {
    const validationResult = validateEntry(entry);
    if (!validationResult.success) {
      continue; // Skip invalid entries
    }

    const validated = validationResult.entry;

    // Only start a new cycle on HUMAN messages (not tool results)
    if (validated.isHumanMessage) {
      // Complete previous cycle if exists
      if (currentTurn?.userEntry) {
        const completedTurn = buildTurn(currentTurn);
        if (completedTurn) {
          turns.push(completedTurn);
        }
        turnNumber++;
      }

      // Start new cycle
      currentTurn = {
        sessionId,
        turnNumber,
        userEntry: validated,
        assistantEntries: [],
        toolResultEntries: [],
        toolUses: new Map(),
        startedAt: validated.timestamp,
        endedAt: null,
      };
    } else if (validated.isUserMessage && currentTurn) {
      // This is a tool result message (user role but not human message)
      // Add to current cycle, don't start a new one
      currentTurn.toolResultEntries.push(validated);
      currentTurn.endedAt = validated.timestamp;

      // Process tool results in this entry
      for (const toolResult of validated.toolResults) {
        const existing = currentTurn.toolUses.get(toolResult.tool_use_id);
        if (existing) {
          existing.result = getToolResultContent(toolResult);
          existing.isError = toolResult.is_error ?? false;
        }
      }

      // Check for standalone tool use result
      if (entry.toolUseResult) {
        const existing = currentTurn.toolUses.get(entry.toolUseResult.tool_use_id);
        if (existing) {
          existing.result = entry.toolUseResult.content;
          existing.isError = entry.toolUseResult.is_error ?? false;
        }
      }
    } else if (validated.isAssistantMessage && currentTurn) {
      // Add to current cycle
      currentTurn.assistantEntries.push(validated);
      currentTurn.endedAt = validated.timestamp;

      // Process tool uses in this entry
      for (const toolUse of validated.toolUses) {
        currentTurn.toolUses.set(toolUse.id, {
          id: toolUse.id,
          name: toolUse.name,
          input: toolUse.input,
          isError: false,
          durationMs: 0,
        });
      }

      // Process tool results in this entry (assistant can also have embedded results)
      for (const toolResult of validated.toolResults) {
        const existing = currentTurn.toolUses.get(toolResult.tool_use_id);
        if (existing) {
          existing.result = getToolResultContent(toolResult);
          existing.isError = toolResult.is_error ?? false;
        }
      }

      // Check for standalone tool use result
      if (entry.toolUseResult) {
        const existing = currentTurn.toolUses.get(entry.toolUseResult.tool_use_id);
        if (existing) {
          existing.result = entry.toolUseResult.content;
          existing.isError = entry.toolUseResult.is_error ?? false;
        }
      }
    }
  }

  // Complete final turn if exists
  if (currentTurn?.userEntry) {
    const completedTurn = buildTurn(currentTurn);
    if (completedTurn) {
      turns.push(completedTurn);
    }
  }

  return turns;
}

/**
 * Build a Turn (cycle) from builder state
 */
function buildTurn(builder: TurnBuilder): Turn | null {
  if (!builder.userEntry || !builder.startedAt) {
    return null;
  }

  // Calculate duration: from human message to last response
  const endedAt = builder.endedAt ?? builder.startedAt;
  const durationMs = endedAt.getTime() - builder.startedAt.getTime();

  // Aggregate user message
  const userMessage = builder.userEntry.textContent;

  // Aggregate assistant message (text only, no tool content)
  const assistantParts: string[] = [];
  for (const entry of builder.assistantEntries) {
    if (entry.textContent.trim()) {
      assistantParts.push(entry.textContent);
    }
  }
  const assistantMessage = assistantParts.join('\n');

  // Get the most recent model
  const model = builder.assistantEntries.length > 0
    ? getModel(builder.assistantEntries[builder.assistantEntries.length - 1])
    : getModel(builder.userEntry);

  // Aggregate token usage from all assistant entries in this cycle
  const usage = aggregateTokenUsage(builder.assistantEntries);

  // Convert tool uses map to array
  const toolUses = Array.from(builder.toolUses.values());

  // Calculate tool durations (rough estimate based on entries)
  calculateToolDurations(toolUses, builder.assistantEntries);

  // Extract code changes from tool uses
  const codeChanges = extractCodeChangesFromTools(toolUses);

  // Generate turn ID
  const turnId = `${builder.sessionId}-turn-${builder.turnNumber}`;

  return {
    id: turnId,
    sessionId: builder.sessionId,
    turnNumber: builder.turnNumber,
    startedAt: builder.startedAt,
    endedAt,
    durationMs,
    userMessage,
    assistantMessage,
    usage,
    toolUses,
    codeChanges,
    model,
  };
}

/**
 * Aggregate token usage from multiple entries
 *
 * IMPORTANT: Multiple JSONL entries may share the same requestId (streaming chunks).
 * The usage values in each entry are CUMULATIVE for that request, not incremental.
 * We must only take the LAST (final) entry per requestId to avoid double-counting.
 */
function aggregateTokenUsage(entries: ValidatedEntry[]): TokenUsage {
  // Group entries by requestId, keeping only the last entry per request
  // Entries without requestId are treated as unique
  const lastEntryByRequest = new Map<string, ValidatedEntry>();
  const entriesWithoutRequestId: ValidatedEntry[] = [];

  for (const entry of entries) {
    if (entry.usage) {
      const requestId = entry.raw.requestId;
      if (requestId) {
        // Keep the last entry for each requestId (later entries have final cumulative values)
        lastEntryByRequest.set(requestId, entry);
      } else {
        // Entries without requestId are treated individually
        entriesWithoutRequestId.push(entry);
      }
    }
  }

  // Now aggregate only the final entries per request
  let input = 0;
  let output = 0;
  let cacheCreation = 0;
  let cacheRead = 0;

  const entriesToAggregate = [...lastEntryByRequest.values(), ...entriesWithoutRequestId];

  for (const entry of entriesToAggregate) {
    if (entry.usage) {
      input += entry.usage.input_tokens;
      output += entry.usage.output_tokens;
      cacheCreation += entry.usage.cache_creation_input_tokens;
      cacheRead += entry.usage.cache_read_input_tokens;
    }
  }

  // Debug log
  if (process.env.DEBUG_TOKEN_USAGE && entries.length > 0) {
    console.log(`[aggregateTokenUsage] ${entries.length} entries -> ${entriesToAggregate.length} unique requests, tokens: input=${input} output=${output} cache_read=${cacheRead}`);
  }

  return {
    input_tokens: input,
    output_tokens: output,
    cache_creation_input_tokens: cacheCreation,
    cache_read_input_tokens: cacheRead,
  };
}

/**
 * Calculate rough tool durations based on entry timestamps
 */
function calculateToolDurations(
  toolUses: ToolUse[],
  entries: ValidatedEntry[]
): void {
  // Simple heuristic: divide turn duration by number of tools
  // More accurate would require tool start/end timestamps
  if (toolUses.length === 0 || entries.length < 2) return;

  const firstTime = entries[0].timestamp.getTime();
  const lastTime = entries[entries.length - 1].timestamp.getTime();
  const totalDuration = lastTime - firstTime;
  const avgDuration = totalDuration / toolUses.length;

  for (const tool of toolUses) {
    tool.durationMs = Math.max(0, Math.round(avgDuration));
  }
}

/**
 * Extract code changes from tool uses
 */
function extractCodeChangesFromTools(toolUses: ToolUse[]): CodeChange[] {
  const changes: CodeChange[] = [];

  for (const tool of toolUses) {
    const extracted = extractCodeChanges(tool);
    changes.push(...extracted);
  }

  return changes;
}

/**
 * Update existing turns with new entries
 */
export function updateTurnsWithNewEntries(
  existingTurns: Turn[],
  newEntries: RawJSONLEntry[],
  sessionId: string
): Turn[] {
  // For simplicity, re-aggregate all entries
  // A more optimized version would append to the last turn
  const allEntries = reconstructEntriesFromTurns(existingTurns);
  allEntries.push(...newEntries);

  // Sort by timestamp
  allEntries.sort((a, b) =>
    new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  return aggregateEntriesIntoTurns(allEntries, sessionId);
}

/**
 * Reconstruct raw entries from turns (for re-aggregation)
 * Note: This is a lossy operation, used only for merging
 */
function reconstructEntriesFromTurns(turns: Turn[]): RawJSONLEntry[] {
  // We don't have the original entries, so we can't reconstruct them
  // The caller should maintain the original entries
  return [];
}

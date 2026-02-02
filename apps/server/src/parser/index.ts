/**
 * Parser exports and main processing function
 */

import { LRUCache, type RawJSONLEntry } from '@analytics/shared';
import { incrementalReader } from '../watcher/incrementalReader.js';
import { sessionStore } from '../store/sessionStore.js';
import { extractSessionId, extractProjectHash } from '../config/paths.js';
import { parseJSONLLines, getValidEntries, getParseErrors } from './jsonlParser.js';
import { aggregateEntriesIntoTurns } from './turnAggregator.js';
import { calculateTurnMetrics } from '../metrics/calculator.js';

export {
  parseJSONLLines,
  getValidEntries,
  getParseErrors,
  parseSingleLine,
  type ParsedEntry,
} from './jsonlParser.js';

export {
  validateEntry,
  extractTextContent,
  extractToolUses,
  extractToolResults,
  type ValidatedEntry,
} from './entryParser.js';

export {
  aggregateEntriesIntoTurns,
  updateTurnsWithNewEntries,
} from './turnAggregator.js';

/**
 * Entry cache for incremental processing
 * Uses LRUCache to prevent memory leaks - max 500 files
 */
const entryCache = new LRUCache<string, RawJSONLEntry[]>(500);

/**
 * Map to track which files belong to which session (for deduplication)
 * Key: sessionId, Value: Set of file paths contributing to this session
 * Note: Kept as regular Map since it's small (one entry per session)
 */
const sessionFiles: Map<string, Set<string>> = new Map();

/**
 * Cache to track entries by sessionId (not by file) for proper aggregation
 * Key: sessionId, Value: array of entries from all files for this session
 * Uses LRUCache to prevent memory leaks - max 200 sessions
 */
const sessionEntryCache = new LRUCache<string, RawJSONLEntry[]>(200);

/**
 * Process a JSONL file (new or changed)
 */
export async function processFile(filePath: string): Promise<void> {
  // Try to get session ID from filename first (fallback)
  const fileSessionId = extractSessionId(filePath);
  if (!fileSessionId) {
    console.warn(`Could not extract session ID from: ${filePath}`);
    return;
  }

  const projectHash = extractProjectHash(filePath);

  // Check if we have existing entries for this file
  const existingEntries = entryCache.get(filePath) ?? [];
  const isNewFile = existingEntries.length === 0;

  // Read new lines (or all lines if new file)
  const lines = isNewFile
    ? await incrementalReader.readAllLines(filePath)
    : await incrementalReader.readNewLines(filePath);

  if (lines.length === 0) {
    return; // No new content
  }

  // Parse lines
  const startLine = existingEntries.length + 1;
  const parsed = parseJSONLLines(lines, startLine);

  // Log parse errors
  const errors = getParseErrors(parsed);
  if (errors.length > 0) {
    console.warn(`Parse errors in ${filePath}:`, errors);
  }

  // Get valid entries
  const newEntries = getValidEntries(parsed);
  if (newEntries.length === 0) {
    return;
  }

  // Update file cache
  const allFileEntries = [...existingEntries, ...newEntries];
  entryCache.set(filePath, allFileEntries);

  // Use the sessionId from inside the JSONL entry (not filename)
  // This properly deduplicates sessions across multiple files
  const firstEntry = newEntries[0];
  const actualSessionId = firstEntry.sessionId || fileSessionId;

  // Track this file as contributing to this session
  if (!sessionFiles.has(actualSessionId)) {
    sessionFiles.set(actualSessionId, new Set());
  }
  sessionFiles.get(actualSessionId)!.add(filePath);

  // Aggregate all entries for this session from all contributing files
  const allSessionEntries: RawJSONLEntry[] = [];
  const filesForSession = sessionFiles.get(actualSessionId)!;
  for (const fp of filesForSession) {
    const fileEntries = entryCache.get(fp) ?? [];
    allSessionEntries.push(...fileEntries);
  }

  // Sort by timestamp to ensure proper turn ordering
  allSessionEntries.sort((a, b) =>
    new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  // Update session entry cache
  sessionEntryCache.set(actualSessionId, allSessionEntries);

  // Get or create session using the actual sessionId from entries
  const session = sessionStore.getOrCreateSession(actualSessionId, filePath, {
    projectPath: projectHash ?? '',
    projectName: extractProjectName(firstEntry.cwd),
    branch: firstEntry.gitBranch,
    startedAt: new Date(allSessionEntries[0].timestamp),
    lastActivityAt: new Date(allSessionEntries[allSessionEntries.length - 1].timestamp),
    model: firstEntry.message.model ?? 'unknown',
  });

  // Set as current session (most recently updated)
  sessionStore.setCurrentSession(actualSessionId);

  // Aggregate into turns using all entries for this session
  const turns = aggregateEntriesIntoTurns(allSessionEntries, actualSessionId);

  // Calculate metrics and upsert turns
  for (const turn of turns) {
    const metrics = calculateTurnMetrics(turn);
    sessionStore.upsertTurn(turn, metrics);
  }

  // Update session with latest info
  if (turns.length > 0) {
    const lastTurn = turns[turns.length - 1];
    sessionStore.updateSession(actualSessionId, {
      lastActivityAt: lastTurn.endedAt,
      model: lastTurn.model,
      turnCount: turns.length,
    });
  }

  console.log(
    `Processed ${filePath}: ${newEntries.length} new entries, ${turns.length} total turns (session: ${actualSessionId})`
  );
}

/**
 * Extract project name from cwd
 */
function extractProjectName(cwd: string): string {
  const parts = cwd.replace(/\\/g, '/').split('/');
  return parts[parts.length - 1] || 'Unknown Project';
}

/**
 * Clear entry cache for a file
 */
export function clearFileCache(filePath: string): void {
  entryCache.delete(filePath);
}

/**
 * Clear session cache for a specific session
 * Call this when a session is deleted to prevent memory leaks
 */
export function clearSessionCache(sessionId: string): void {
  // Get all files associated with this session
  const files = sessionFiles.get(sessionId);
  if (files) {
    // Clear entry cache for each file
    for (const filePath of files) {
      entryCache.delete(filePath);
    }
  }
  // Remove session from sessionFiles map
  sessionFiles.delete(sessionId);
  // Remove from session entry cache
  sessionEntryCache.delete(sessionId);
}

/**
 * Clear all caches
 */
export function clearAllCaches(): void {
  entryCache.clear();
  sessionFiles.clear();
  sessionEntryCache.clear();
  incrementalReader.clear();
}

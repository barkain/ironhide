/**
 * Stream-based JSONL parser
 */

import type { RawJSONLEntry } from '@analytics/shared';
import { parseJSONLLine } from '@analytics/shared';

/**
 * Parse result with metadata
 */
export interface ParsedEntry {
  /** Original line number (1-based) */
  lineNumber: number;
  /** Parsed entry or null if invalid */
  entry: RawJSONLEntry | null;
  /** Raw line content */
  rawLine: string;
  /** Parse error if any */
  error?: string;
}

/**
 * Parse a batch of JSONL lines
 *
 * @param lines - Array of raw JSONL lines
 * @param startLineNumber - Starting line number (1-based)
 * @returns Array of parsed entries
 */
export function parseJSONLLines(
  lines: string[],
  startLineNumber = 1
): ParsedEntry[] {
  const results: ParsedEntry[] = [];

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const lineNumber = startLineNumber + i;

    if (!rawLine.trim()) {
      continue; // Skip empty lines
    }

    try {
      const entry = parseJSONLLine(rawLine);
      results.push({
        lineNumber,
        entry,
        rawLine,
        error: entry ? undefined : 'Failed to parse JSONL entry',
      });
    } catch (err) {
      results.push({
        lineNumber,
        entry: null,
        rawLine,
        error: err instanceof Error ? err.message : 'Unknown parse error',
      });
    }
  }

  return results;
}

/**
 * Filter to only valid entries
 */
export function getValidEntries(parsed: ParsedEntry[]): RawJSONLEntry[] {
  return parsed
    .filter((p): p is ParsedEntry & { entry: RawJSONLEntry } => p.entry !== null)
    .map((p) => p.entry);
}

/**
 * Get parse errors for logging
 */
export function getParseErrors(
  parsed: ParsedEntry[]
): Array<{ lineNumber: number; error: string }> {
  return parsed
    .filter((p) => p.error)
    .map((p) => ({
      lineNumber: p.lineNumber,
      error: p.error!,
    }));
}

/**
 * Parse a single line, returning the entry or throwing
 */
export function parseSingleLine(line: string): RawJSONLEntry {
  const entry = parseJSONLLine(line);
  if (!entry) {
    throw new Error('Failed to parse JSONL line');
  }
  return entry;
}

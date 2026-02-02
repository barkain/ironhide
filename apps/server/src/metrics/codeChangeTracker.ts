/**
 * Tracks code changes from Write/Edit tools
 */

import type { ToolUse, CodeChange } from '@analytics/shared';
import { extname, basename } from 'node:path';

/**
 * Tools that modify code
 */
const CODE_MODIFICATION_TOOLS = ['Write', 'Edit', 'MultiEdit', 'NotebookEdit'];

/**
 * Tools that delete files
 */
const FILE_DELETE_TOOLS = ['Bash']; // rm commands

/**
 * Extract code changes from a tool use
 */
export function extractCodeChanges(tool: ToolUse): CodeChange[] {
  const changes: CodeChange[] = [];

  if (!CODE_MODIFICATION_TOOLS.includes(tool.name)) {
    // Check for delete operations in Bash
    if (tool.name === 'Bash' && isDeleteOperation(tool)) {
      const deletedFiles = extractDeletedFiles(tool);
      for (const filePath of deletedFiles) {
        changes.push({
          filePath,
          type: 'delete',
          linesAdded: 0,
          linesRemoved: 0, // Unknown for deletes
          extension: extname(filePath).slice(1) || 'unknown',
        });
      }
    }
    return changes;
  }

  switch (tool.name) {
    case 'Write':
      changes.push(...extractWriteChanges(tool));
      break;
    case 'Edit':
      changes.push(...extractEditChanges(tool));
      break;
    case 'MultiEdit':
      changes.push(...extractMultiEditChanges(tool));
      break;
    case 'NotebookEdit':
      changes.push(...extractNotebookEditChanges(tool));
      break;
  }

  return changes;
}

/**
 * Extract changes from Write tool
 */
function extractWriteChanges(tool: ToolUse): CodeChange[] {
  const input = tool.input as {
    file_path?: string;
    content?: string;
  };

  if (!input.file_path) return [];

  const content = input.content ?? '';
  const lineCount = content.split('\n').length;

  // Determine if create or modify based on result
  const isCreate = !tool.result?.includes('overwriting');

  return [
    {
      filePath: input.file_path,
      type: isCreate ? 'create' : 'modify',
      linesAdded: lineCount,
      linesRemoved: isCreate ? 0 : estimateRemovedLines(tool.result),
      extension: extname(input.file_path).slice(1) || 'unknown',
    },
  ];
}

/**
 * Extract changes from Edit tool
 *
 * For edit operations, we track the net difference rather than raw counts.
 * If replacing 5 lines with 7 lines, we show +2 added (not +7 added, -5 removed).
 * This gives a cleaner view of actual codebase growth/shrinkage.
 */
function extractEditChanges(tool: ToolUse): CodeChange[] {
  const input = tool.input as {
    file_path?: string;
    old_string?: string;
    new_string?: string;
  };

  if (!input.file_path) return [];

  const oldLines = (input.old_string ?? '').split('\n').length;
  const newLines = (input.new_string ?? '').split('\n').length;

  // Calculate net change - only show additions OR deletions, not both
  const netChange = newLines - oldLines;

  return [
    {
      filePath: input.file_path,
      type: 'modify',
      linesAdded: netChange > 0 ? netChange : 0,
      linesRemoved: netChange < 0 ? Math.abs(netChange) : 0,
      extension: extname(input.file_path).slice(1) || 'unknown',
    },
  ];
}

/**
 * Extract changes from MultiEdit tool
 *
 * Same as Edit - track net difference for cleaner visualization.
 */
function extractMultiEditChanges(tool: ToolUse): CodeChange[] {
  const input = tool.input as {
    file_path?: string;
    edits?: Array<{ old_string?: string; new_string?: string }>;
  };

  if (!input.file_path || !input.edits) return [];

  let totalOldLines = 0;
  let totalNewLines = 0;

  for (const edit of input.edits) {
    totalOldLines += (edit.old_string ?? '').split('\n').length;
    totalNewLines += (edit.new_string ?? '').split('\n').length;
  }

  // Calculate net change
  const netChange = totalNewLines - totalOldLines;

  return [
    {
      filePath: input.file_path,
      type: 'modify',
      linesAdded: netChange > 0 ? netChange : 0,
      linesRemoved: netChange < 0 ? Math.abs(netChange) : 0,
      extension: extname(input.file_path).slice(1) || 'unknown',
    },
  ];
}

/**
 * Extract changes from NotebookEdit tool
 */
function extractNotebookEditChanges(tool: ToolUse): CodeChange[] {
  const input = tool.input as {
    notebook_path?: string;
    new_source?: string;
    edit_mode?: string;
  };

  if (!input.notebook_path) return [];

  const lineCount = (input.new_source ?? '').split('\n').length;
  const isInsert = input.edit_mode === 'insert';
  const isDelete = input.edit_mode === 'delete';

  return [
    {
      filePath: input.notebook_path,
      type: isInsert ? 'create' : isDelete ? 'delete' : 'modify',
      linesAdded: isDelete ? 0 : lineCount,
      linesRemoved: isDelete ? lineCount : 0,
      extension: 'ipynb',
    },
  ];
}

/**
 * Check if Bash command is a delete operation
 */
function isDeleteOperation(tool: ToolUse): boolean {
  const input = tool.input as { command?: string };
  const command = input.command ?? '';

  return (
    command.includes('rm ') ||
    command.includes('rm\t') ||
    command.startsWith('rm ') ||
    command.includes('unlink ')
  );
}

/**
 * Extract deleted file paths from Bash command
 */
function extractDeletedFiles(tool: ToolUse): string[] {
  const input = tool.input as { command?: string };
  const command = input.command ?? '';

  // Simple pattern matching for rm commands
  // This is a heuristic and may not catch all cases
  const rmMatch = command.match(/rm\s+(?:-[rf]*\s+)?(.+)/);
  if (rmMatch) {
    const pathPart = rmMatch[1].trim();
    // Split on spaces, ignoring quoted strings
    const paths = pathPart.split(/\s+/).filter((p) => !p.startsWith('-'));
    return paths;
  }

  return [];
}

/**
 * Estimate removed lines from tool result
 */
function estimateRemovedLines(result?: string): number {
  if (!result) return 0;

  // Look for patterns like "replaced X lines"
  const match = result.match(/replaced?\s+(\d+)\s+lines?/i);
  if (match) {
    return parseInt(match[1], 10);
  }

  return 0;
}

/**
 * Aggregate code changes
 */
export function aggregateCodeChanges(
  changes: CodeChange[]
): {
  filesCreated: number;
  filesModified: number;
  filesDeleted: number;
  linesAdded: number;
  linesRemoved: number;
  netLinesChanged: number;
  byExtension: Record<string, { added: number; removed: number }>;
} {
  const result = {
    filesCreated: 0,
    filesModified: 0,
    filesDeleted: 0,
    linesAdded: 0,
    linesRemoved: 0,
    netLinesChanged: 0,
    byExtension: {} as Record<string, { added: number; removed: number }>,
  };

  for (const change of changes) {
    switch (change.type) {
      case 'create':
        result.filesCreated++;
        break;
      case 'modify':
        result.filesModified++;
        break;
      case 'delete':
        result.filesDeleted++;
        break;
    }

    result.linesAdded += change.linesAdded;
    result.linesRemoved += change.linesRemoved;

    // Track by extension
    const ext = change.extension || 'unknown';
    if (!result.byExtension[ext]) {
      result.byExtension[ext] = { added: 0, removed: 0 };
    }
    result.byExtension[ext].added += change.linesAdded;
    result.byExtension[ext].removed += change.linesRemoved;
  }

  result.netLinesChanged = result.linesAdded - result.linesRemoved;
  return result;
}

/**
 * Get unique files changed
 */
export function getUniqueFilesChanged(changes: CodeChange[]): string[] {
  const files = new Set<string>();
  for (const change of changes) {
    files.add(change.filePath);
  }
  return Array.from(files);
}

/**
 * Path constants for Claude Code session files
 */

import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

/**
 * Convert a project path to its escaped folder name format
 * e.g., "/Users/nadavbarkai/dev/project" becomes "-Users-nadavbarkai-dev-project"
 */
export function escapeProjectPath(projectPath: string): string {
  // Replace leading slash and all slashes with dashes
  return projectPath.replace(/\//g, '-');
}

/**
 * Get the current project directory from environment variable
 * When running as an MCP plugin, PROJECT_DIR must be explicitly passed
 * via the plugin.json env configuration (using ${PWD})
 *
 * Returns null if no PROJECT_DIR is set, which means the server will
 * watch all projects instead of filtering to a specific one.
 */
export function getCurrentProjectDir(): string | null {
  // Only use PROJECT_DIR when explicitly set via environment variable
  // process.cwd() is unreliable when running as an MCP plugin because
  // it may return the plugin's installation directory, not the user's project
  if (process.env.PROJECT_DIR) {
    return process.env.PROJECT_DIR;
  }

  // When PROJECT_DIR is not set, return null to indicate "all projects" mode
  return null;
}

/**
 * Get the Claude sessions base path
 * Can be overridden with CLAUDE_SESSIONS_PATH environment variable
 */
export function getClaudeSessionsPath(): string {
  const baseProjectsPath = process.env.CLAUDE_SESSIONS_PATH
    ? resolve(process.env.CLAUDE_SESSIONS_PATH)
    : join(homedir(), '.claude', 'projects');

  // If PROJECT_DIR is set, return the specific project folder
  const projectDir = getCurrentProjectDir();
  if (projectDir) {
    const escapedPath = escapeProjectPath(projectDir);
    return join(baseProjectsPath, escapedPath);
  }

  return baseProjectsPath;
}

/**
 * Default path to Claude sessions
 */
export const CLAUDE_SESSIONS_PATH = getClaudeSessionsPath();

/**
 * Check if we're filtering to a specific project
 */
export function isProjectFiltered(): boolean {
  return getCurrentProjectDir() !== null;
}

/**
 * JSONL file glob pattern for watching
 */
export const JSONL_GLOB_PATTERN = '**/*.jsonl';

/**
 * Get the full glob pattern for JSONL files
 */
export function getJSONLGlobPattern(): string {
  return join(CLAUDE_SESSIONS_PATH, JSONL_GLOB_PATTERN);
}

/**
 * Validate that a file path is within the allowed sessions directory
 * Prevents path traversal attacks
 */
export function isValidSessionPath(filePath: string): boolean {
  const resolvedPath = resolve(filePath);
  const basePath = resolve(CLAUDE_SESSIONS_PATH);
  return resolvedPath.startsWith(basePath);
}

/**
 * Extract session ID from JSONL file path
 * Path formats:
 *   - UUID: ~/.claude/projects/{project-hash}/{session-uuid}.jsonl
 *   - Agent: ~/.claude/projects/{project-hash}/agent-{hash}.jsonl
 */
export function extractSessionId(filePath: string): string | null {
  // Try UUID format first (36 chars: 8-4-4-4-12)
  const uuidMatch = filePath.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})\.jsonl$/i);
  if (uuidMatch) {
    return uuidMatch[1];
  }

  // Try agent format: agent-{7-char-hash}.jsonl
  const agentMatch = filePath.match(/(agent-[a-f0-9]+)\.jsonl$/i);
  if (agentMatch) {
    return agentMatch[1];
  }

  // Fallback: extract filename without extension as session ID
  const fallbackMatch = filePath.match(/([^/\\]+)\.jsonl$/i);
  if (fallbackMatch) {
    return fallbackMatch[1];
  }

  return null;
}

/**
 * Extract project hash from JSONL file path
 */
export function extractProjectHash(filePath: string): string | null {
  const normalizedPath = filePath.replace(/\\/g, '/');
  const parts = normalizedPath.split('/');
  const jsonlIndex = parts.findIndex((p) => p.endsWith('.jsonl'));
  if (jsonlIndex > 0) {
    return parts[jsonlIndex - 1];
  }
  return null;
}

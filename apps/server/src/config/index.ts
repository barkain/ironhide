/**
 * Configuration exports
 */

export {
  CLAUDE_SESSIONS_PATH,
  JSONL_GLOB_PATTERN,
  getClaudeSessionsPath,
  getJSONLGlobPattern,
  isValidSessionPath,
  extractSessionId,
  extractProjectHash,
  escapeProjectPath,
  getCurrentProjectDir,
  isProjectFiltered,
} from './paths.js';

/**
 * Get the port from API_PORT env var (for server) or PORT env var (fallback)
 * Defaults to 3100 for API server
 */
function getServerPort(): number {
  if (process.env.API_PORT) {
    return Number(process.env.API_PORT);
  }
  if (process.env.PORT) {
    const portNum = Number(process.env.PORT);
    // Only use PORT if it's not a typical dashboard port (3000)
    // or if it's explicitly the server port
    if (portNum !== 3000) {
      return portNum;
    }
  }
  return 3100;
}

/**
 * Get dashboard port from PORT env var, defaults to 3000
 */
function getDashboardPort(): number {
  if (process.env.PORT) {
    return Number(process.env.PORT);
  }
  return 3000;
}

/**
 * Server configuration
 */
export const SERVER_CONFIG = {
  /** HTTP server port */
  port: getServerPort(),

  /** HTTP server host (localhost only for security) */
  host: process.env.HOST || '127.0.0.1',

  /** SSE heartbeat interval in milliseconds */
  sseHeartbeatInterval: 30_000,

  /** File watcher debounce interval in milliseconds */
  watcherDebounceMs: 100,

  /** Server version */
  version: '0.1.0',

  /** Maximum sessions to return by default */
  defaultSessionLimit: 20,

  /** Maximum turns to return by default */
  defaultTurnLimit: 50,

  /** Session activity timeout in milliseconds (5 minutes) */
  sessionActiveTimeout: 5 * 60 * 1000,
} as const;

/**
 * Get configured dashboard port
 */
function getConfiguredDashboardPort(): string | null {
  // Check DASHBOARD_PORT first, then fall back to PORT
  if (process.env.DASHBOARD_PORT) {
    return process.env.DASHBOARD_PORT;
  }
  if (process.env.PORT && process.env.PORT !== '3000') {
    return process.env.PORT;
  }
  return null;
}

/**
 * CORS allowed origins (localhost only)
 * Includes default ports and dynamically configured ports
 */
export const CORS_ORIGINS = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:3001',
  'http://127.0.0.1:3001',
  'http://localhost:3100',
  'http://127.0.0.1:3100',
  // Add dynamic dashboard port if configured
  ...(getConfiguredDashboardPort()
    ? [
        `http://localhost:${getConfiguredDashboardPort()}`,
        `http://127.0.0.1:${getConfiguredDashboardPort()}`,
      ]
    : []),
];

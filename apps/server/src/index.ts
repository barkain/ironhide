/**
 * Main entry point - supports MCP plugin mode and standalone HTTP server
 *
 * When running as MCP plugin (--mcp flag or stdio input detected):
 * - Uses stdio transport for MCP communication
 * - Optionally starts HTTP server in background for dashboard API
 *
 * When running standalone (default):
 * - Starts HTTP server with SSE for real-time updates
 * - Serves dashboard static files at root (/)
 */

import { serve } from '@hono/node-server';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { app } from './http/app.js';
import { startMcpServer } from './mcp/server.js';
import { fileWatcher } from './watcher/fileWatcher.js';
import { SERVER_CONFIG, CLAUDE_SESSIONS_PATH, getCurrentProjectDir } from './config/index.js';

/** HTTP server instance for graceful shutdown */
let httpServer: ReturnType<typeof serve> | null = null;

/**
 * Detect if running as MCP plugin
 * - Check for --mcp flag
 * - Check for RUN_MODE=mcp environment variable
 * - Check if stdin is not a TTY (piped input from Claude Code)
 */
function isMcpMode(): boolean {
  // Explicit HTTP mode - never run as MCP
  if (process.env.RUN_MODE?.toLowerCase() === 'http') return false;

  // Explicit MCP flags
  if (process.argv.includes('--mcp')) return true;
  if (process.env.RUN_MODE?.toLowerCase() === 'mcp') return true;

  // Detect stdio input (piped from Claude Code)
  // When launched as MCP server, stdin is piped, not a TTY
  // But only if not explicitly disabled
  if (!process.stdin.isTTY && process.stdin.readable) {
    // Check if we have actual data on stdin (MCP JSON-RPC)
    // This helps distinguish from just being run in a pipe context
    return true;
  }

  return false;
}

/**
 * Determine if HTTP server should also start in MCP mode
 */
function shouldStartHttpInMcpMode(): boolean {
  // Allow HTTP server alongside MCP for dashboard support
  return process.env.MCP_ENABLE_HTTP === '1' || process.argv.includes('--with-http');
}

/**
 * Check if dashboard static files are available
 */
function isDashboardAvailable(): boolean {
  const possiblePaths = [
    join(process.cwd(), 'apps', 'dashboard', 'out'),
    join(process.cwd(), '..', 'dashboard', 'out'),
    process.env.DASHBOARD_STATIC_PATH,
  ].filter(Boolean) as string[];

  for (const p of possiblePaths) {
    if (existsSync(p)) {
      return true;
    }
  }
  return false;
}

/**
 * Start the HTTP server
 */
async function startHttpServer(): Promise<void> {
  const { port, host } = SERVER_CONFIG;

  httpServer = serve({
    fetch: app.fetch,
    port,
    hostname: host,
  });

  // Only log if we're in HTTP-only mode or explicitly enabled
  if (!isMcpMode() || shouldStartHttpInMcpMode()) {
    const hasDashboard = isDashboardAvailable();
    console.log(`HTTP server listening on http://${host}:${port}`);
    if (hasDashboard) {
      console.log(`  - Dashboard: http://${host}:${port}/`);
    } else {
      console.log(`  - Dashboard: Not available (run 'bun run build' first)`);
    }
    console.log(`  - API: http://${host}:${port}/api`);
    console.log(`  - SSE: http://${host}:${port}/api/sse`);
    console.log(`  - Health: http://${host}:${port}/health`);
  }
}

/**
 * Start the file watcher
 */
async function startFileWatcher(): Promise<void> {
  if (!isMcpMode()) {
    console.log(`Watching for JSONL files in: ${CLAUDE_SESSIONS_PATH}`);
    const projectDir = getCurrentProjectDir();
    if (projectDir) {
      console.log(`  - Filtering to project: ${projectDir}`);
    } else {
      console.log(`  - Mode: All projects (no PROJECT_DIR set)`);
    }
  }
  await fileWatcher.start();
}

/**
 * Suppress console output when running in MCP mode
 * MCP uses stdio for JSON-RPC, so console.log interferes with protocol
 */
function suppressConsoleInMcpMode(): void {
  if (isMcpMode() && !process.env.DEBUG_MCP) {
    // Redirect console to stderr to avoid polluting MCP protocol on stdout
    const originalLog = console.log;
    const originalInfo = console.info;

    console.log = (...args) => {
      // Only output to stderr in debug mode
      if (process.env.DEBUG_MCP) {
        process.stderr.write(`[MCP] ${args.join(' ')}\n`);
      }
    };

    console.info = (...args) => {
      if (process.env.DEBUG_MCP) {
        process.stderr.write(`[MCP] ${args.join(' ')}\n`);
      }
    };

    // Keep error and warn going to stderr
    // console.error and console.warn already go to stderr by default
  }
}

/**
 * Graceful shutdown handler
 */
async function shutdown(signal: string): Promise<void> {
  if (!isMcpMode()) {
    console.log(`\nReceived ${signal}, shutting down...`);
  }

  try {
    // Stop file watcher
    await fileWatcher.stop();

    // Close HTTP server if running
    if (httpServer) {
      // Note: @hono/node-server serve() returns a Server instance
      // that can be closed
      httpServer.close?.();
    }
  } catch (error) {
    console.error('Error during shutdown:', error);
  }

  process.exit(0);
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  const mcpMode = isMcpMode();

  // Suppress console in MCP mode to avoid polluting stdio protocol
  if (mcpMode) {
    suppressConsoleInMcpMode();
  }

  // Log startup info (only in non-MCP mode or debug)
  if (!mcpMode) {
    console.log('='.repeat(60));
    console.log('Claude Code Analytics Dashboard Server');
    console.log(`Version: ${SERVER_CONFIG.version}`);
    console.log(`Mode: ${mcpMode ? 'MCP Plugin' : 'HTTP Server'}`);
    const projectDir = getCurrentProjectDir();
    if (projectDir) {
      console.log(`Project Directory: ${projectDir}`);
    }
    console.log('='.repeat(60));
  }

  try {
    // Always start file watcher for session data
    await startFileWatcher();

    if (mcpMode) {
      // MCP Plugin Mode
      // Start HTTP server in background if enabled (for dashboard API)
      if (shouldStartHttpInMcpMode()) {
        await startHttpServer();
      }

      // Start MCP server with stdio transport
      // This will block and handle MCP JSON-RPC protocol
      await startMcpServer();
    } else {
      // Standalone HTTP Server Mode
      // Dashboard is served as static files from the same port
      await startHttpServer();

      console.log('');
      console.log('Server started successfully!');
      console.log('');
    }
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
  process.exit(1);
});

// Start the server
main();

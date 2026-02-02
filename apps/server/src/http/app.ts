/**
 * Hono app setup with routes
 */

import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { serveStatic } from '@hono/node-server/serve-static';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCorsMiddleware } from './middleware/cors.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';
import { sessionsRouter } from './routes/sessions.js';
import { turnsRouter } from './routes/turns.js';
import { metricsRouter } from './routes/metrics.js';
import { handleSSEConnection, handleSSEHealth } from './sse/handler.js';
import { fileWatcher } from '../watcher/fileWatcher.js';
import { sessionStore } from '../store/sessionStore.js';
import { CLAUDE_SESSIONS_PATH } from '../config/index.js';

// Get the directory of the current module (works in ESM)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Get the absolute path to dashboard static files
 * Uses paths relative to the source file location, not cwd
 */
function getDashboardStaticPath(): string | null {
  // Try paths in order of preference
  const possiblePaths = [
    // Environment variable override (highest priority)
    process.env.DASHBOARD_STATIC_PATH,
    // Plugin root (set by Claude Code when running as plugin via --plugin-dir)
    process.env.CLAUDE_PLUGIN_ROOT
      ? join(process.env.CLAUDE_PLUGIN_ROOT, 'apps', 'dashboard', 'out')
      : null,
    // Relative to this file: apps/server/src/http/app.ts -> apps/dashboard/out
    // From src/http: go up 4 levels (http -> src -> server -> apps) then into dashboard/out
    join(__dirname, '..', '..', '..', 'dashboard', 'out'),
    // From dist: go up 3 levels (dist -> server -> apps) then into dashboard/out
    join(__dirname, '..', '..', 'dashboard', 'out'),
    // Fallback: from monorepo root (when cwd is project root)
    join(process.cwd(), 'apps', 'dashboard', 'out'),
  ].filter(Boolean) as string[];

  for (const p of possiblePaths) {
    if (existsSync(p)) {
      return p;
    }
  }

  return null;
}

/**
 * Create and configure the Hono app
 */
export function createApp(): Hono {
  const app = new Hono();

  // Global middleware
  app.use('*', logger());
  app.use('*', createCorsMiddleware());
  app.use('*', errorHandler);

  // Health check
  app.get('/health', (c) => {
    return c.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    });
  });

  // API routes
  const api = new Hono();

  // Mount routers
  api.route('/sessions', sessionsRouter);
  api.route('/turns', turnsRouter);
  api.route('/metrics', metricsRouter);

  // SSE endpoints
  api.get('/sse', handleSSEConnection);
  api.get('/sse/health', handleSSEHealth);

  // Debug endpoint
  api.get('/debug', (c) => {
    const watchedFiles = fileWatcher.getWatchedFiles();
    const sessionCount = sessionStore.getSessionCount();
    const allSessions = sessionStore.getAllSessions();
    return c.json({
      sessionsPath: CLAUDE_SESSIONS_PATH,
      watcherRunning: fileWatcher.isRunning,
      watchedFilesCount: watchedFiles.length,
      watchedFiles: watchedFiles.slice(0, 20), // Show first 20
      sessionCount,
      sessionIds: allSessions.slice(0, 20).map(s => s.id),
    });
  });

  // Mount API under /api
  app.route('/api', api);

  // Serve dashboard static files
  const dashboardPath = getDashboardStaticPath();
  if (dashboardPath) {
    console.log(`[Static] Serving dashboard from: ${dashboardPath}`);

    // Block direct access to RSC payload files (.txt) - these are internal Next.js files
    app.use('*.txt', (c, next) => {
      // Redirect .txt requests to index.html for SPA routing
      const indexPath = join(dashboardPath, 'index.html');
      if (existsSync(indexPath)) {
        const html = readFileSync(indexPath, 'utf-8');
        return c.html(html);
      }
      return next();
    });

    // Serve static assets (JS, CSS, images, etc.)
    // Use absolute path - despite docs warning, @hono/node-server serveStatic works with absolute paths
    app.use(
      '/*',
      serveStatic({
        root: dashboardPath,
      })
    );

    // Fallback to index.html for client-side routing (SPA behavior)
    // This handles routes that don't match static files
    app.get('*', async (c) => {
      const indexPath = join(dashboardPath, 'index.html');
      if (existsSync(indexPath)) {
        const html = readFileSync(indexPath, 'utf-8');
        return c.html(html);
      }
      return notFoundHandler(c);
    });
  } else {
    console.log('[Static] Dashboard not found, API-only mode');
    // No dashboard available, use standard 404 handler
    app.notFound(notFoundHandler);
  }

  return app;
}

/**
 * Default app instance
 */
export const app = createApp();

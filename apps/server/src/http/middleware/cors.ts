/**
 * CORS configuration (localhost only)
 */

import { cors } from 'hono/cors';
import { CORS_ORIGINS } from '../../config/index.js';

/**
 * Create CORS middleware configured for localhost only
 */
export function createCorsMiddleware() {
  return cors({
    origin: (origin) => {
      // Allow requests with no origin (like curl, MCP)
      if (!origin) return '*';

      // Check against allowed origins
      if (CORS_ORIGINS.includes(origin)) {
        return origin;
      }

      // Block other origins
      return null;
    },
    allowMethods: ['GET', 'POST', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Accept', 'Cache-Control'],
    exposeHeaders: ['Content-Length', 'X-Request-Id'],
    credentials: true,
    maxAge: 3600, // 1 hour preflight cache
  });
}

/**
 * Validate origin is localhost
 */
export function isLocalhostOrigin(origin: string | null | undefined): boolean {
  if (!origin) return true; // No origin is allowed (non-browser requests)

  try {
    const url = new URL(origin);
    return (
      url.hostname === 'localhost' ||
      url.hostname === '127.0.0.1' ||
      url.hostname === '[::1]'
    );
  } catch {
    return false;
  }
}

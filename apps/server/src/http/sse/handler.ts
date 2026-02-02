/**
 * SSE connection handler (GET /sse)
 */

import type { Context } from 'hono';
import { sessionStore } from '../../store/sessionStore.js';
import { SERVER_CONFIG } from '../../config/index.js';
import { sseBroadcaster } from './broadcaster.js';
import {
  createConnectedEvent,
  createSessionSnapshotEvent,
  createHeartbeatEvent,
  createErrorEvent,
} from './events.js';

/**
 * Generate unique client ID
 */
function generateClientId(): string {
  return `sse-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * SSE connection handler
 */
export async function handleSSEConnection(c: Context): Promise<Response> {
  const sessionId = c.req.query('sessionId') ?? null;
  const clientId = generateClientId();

  // Track cleanup state to prevent double cleanup
  let cleanedUp = false;

  // Create a readable/writable stream pair
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();

  // Setup heartbeat interval
  let heartbeatInterval: NodeJS.Timeout | null = null;

  // Cleanup function - handles all resource cleanup
  const cleanup = () => {
    if (cleanedUp) return;
    cleanedUp = true;

    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
      heartbeatInterval = null;
    }
    sseBroadcaster.removeClient(clientId);

    // Close the writer if it's not already closed
    try {
      writer.close().catch(() => {
        // Ignore close errors - stream may already be closed
      });
    } catch {
      // Ignore errors during cleanup
    }
  };

  // Listen for client disconnect via the request's abort signal
  // This is triggered when the client closes the connection
  const abortSignal = c.req.raw.signal;
  if (abortSignal) {
    abortSignal.addEventListener('abort', () => {
      cleanup();
    }, { once: true });
  }

  // Send helper function with error handling that triggers cleanup
  const send = async (message: string): Promise<boolean> => {
    if (cleanedUp) return false;

    try {
      await writer.write(encoder.encode(message));
      return true;
    } catch (error) {
      console.error('Error sending SSE message:', error);
      cleanup();
      return false;
    }
  };

  // Initialize connection
  const initialize = async () => {
    try {
      // Register client with broadcaster
      sseBroadcaster.addClient(clientId, sessionId, writer);

      // Send connected event
      if (!await send(createConnectedEvent(sessionId))) return;

      // If session specified, send initial snapshot
      if (sessionId) {
        const session = sessionStore.getSession(sessionId);
        if (session) {
          const turns = sessionStore.getSessionTurns(sessionId);
          const metrics = sessionStore.getSessionMetrics(sessionId);
          if (metrics) {
            if (!await send(createSessionSnapshotEvent(session, turns, metrics))) return;
          }
        } else {
          if (!await send(createErrorEvent('SESSION_NOT_FOUND', `Session not found: ${sessionId}`))) return;
        }
      } else {
        // Send current session if available
        const currentSessionId = sessionStore.getCurrentSessionId();
        if (currentSessionId) {
          const session = sessionStore.getSession(currentSessionId);
          if (session) {
            const turns = sessionStore.getSessionTurns(currentSessionId);
            const metrics = sessionStore.getSessionMetrics(currentSessionId);
            if (metrics) {
              if (!await send(createSessionSnapshotEvent(session, turns, metrics))) return;
            }
          }
        }
      }

      // Setup heartbeat - this also serves as a connection health check
      // The heartbeat will detect disconnected clients that didn't trigger abort
      heartbeatInterval = setInterval(async () => {
        const success = await send(createHeartbeatEvent());
        if (!success) {
          cleanup();
        }
      }, SERVER_CONFIG.sseHeartbeatInterval);

    } catch (error) {
      console.error('Error initializing SSE connection:', error);
      cleanup();
    }
  };

  // Start initialization
  initialize();

  // Create response with SSE headers
  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable nginx buffering
    },
  });
}

/**
 * SSE health check endpoint
 */
export function handleSSEHealth(c: Context): Response {
  return c.json({
    status: 'ok',
    connectedClients: sseBroadcaster.getClientCount(),
    timestamp: new Date().toISOString(),
  });
}

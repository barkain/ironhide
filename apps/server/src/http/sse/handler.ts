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

  // Create a readable/writable stream pair
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();

  // Send helper function
  const send = async (message: string): Promise<void> => {
    try {
      await writer.write(encoder.encode(message));
    } catch (error) {
      console.error('Error sending SSE message:', error);
    }
  };

  // Setup heartbeat interval
  let heartbeatInterval: NodeJS.Timeout | null = null;

  // Cleanup function
  const cleanup = () => {
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
      heartbeatInterval = null;
    }
    sseBroadcaster.removeClient(clientId);
  };

  // Initialize connection
  const initialize = async () => {
    try {
      // Register client with broadcaster
      sseBroadcaster.addClient(clientId, sessionId, writer);

      // Send connected event
      await send(createConnectedEvent(sessionId));

      // If session specified, send initial snapshot
      if (sessionId) {
        const session = sessionStore.getSession(sessionId);
        if (session) {
          const turns = sessionStore.getSessionTurns(sessionId);
          const metrics = sessionStore.getSessionMetrics(sessionId);
          if (metrics) {
            await send(createSessionSnapshotEvent(session, turns, metrics));
          }
        } else {
          await send(createErrorEvent('SESSION_NOT_FOUND', `Session not found: ${sessionId}`));
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
              await send(createSessionSnapshotEvent(session, turns, metrics));
            }
          }
        }
      }

      // Setup heartbeat
      heartbeatInterval = setInterval(async () => {
        try {
          await send(createHeartbeatEvent());
        } catch {
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

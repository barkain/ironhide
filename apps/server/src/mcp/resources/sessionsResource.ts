/**
 * MCP Resource: sessions://
 *
 * Provides session data as MCP resources
 */

import { sessionStore } from '../../store/sessionStore.js';
import { serializeSession, serializeTurn } from '@analytics/shared';

/**
 * Resource URI patterns for sessions
 */
export const SESSIONS_RESOURCE_URI_PREFIX = 'sessions://';

/**
 * Get sessions list resource
 */
export function getSessionsListResource(): {
  uri: string;
  name: string;
  description: string;
  mimeType: string;
  content: string;
} {
  const sessions = sessionStore.getAllSessions();
  const serialized = sessions.map((session) => {
    const metrics = sessionStore.getSessionMetrics(session.id);
    return {
      ...serializeSession(session),
      summary: {
        totalTurns: metrics?.totalTurns ?? 0,
        totalTokens: metrics?.totalTokens.total ?? 0,
        totalCost: metrics?.totalCost ?? 0,
      },
    };
  });

  return {
    uri: 'sessions://list',
    name: 'Session List',
    description: 'List of all available Claude Code sessions',
    mimeType: 'application/json',
    content: JSON.stringify({ sessions: serialized, total: serialized.length }, null, 2),
  };
}

/**
 * Get current session resource
 */
export function getCurrentSessionResource(): {
  uri: string;
  name: string;
  description: string;
  mimeType: string;
  content: string;
} | null {
  const currentSessionId = sessionStore.getCurrentSessionId();
  if (!currentSessionId) {
    return null;
  }

  const session = sessionStore.getSession(currentSessionId);
  if (!session) {
    return null;
  }

  const metrics = sessionStore.getSessionMetrics(currentSessionId);
  const turns = sessionStore.getSessionTurns(currentSessionId);

  return {
    uri: 'sessions://current',
    name: 'Current Session',
    description: 'The currently active Claude Code session',
    mimeType: 'application/json',
    content: JSON.stringify(
      {
        session: serializeSession(session),
        metrics: metrics ?? null,
        turns: turns.map(serializeTurn),
      },
      null,
      2
    ),
  };
}

/**
 * Get session by ID resource
 */
export function getSessionByIdResource(sessionId: string): {
  uri: string;
  name: string;
  description: string;
  mimeType: string;
  content: string;
} | null {
  const session = sessionStore.getSession(sessionId);
  if (!session) {
    return null;
  }

  const metrics = sessionStore.getSessionMetrics(sessionId);
  const turns = sessionStore.getSessionTurns(sessionId);

  return {
    uri: `sessions://${sessionId}`,
    name: `Session: ${session.projectName}`,
    description: `Session ${sessionId} from project ${session.projectName}`,
    mimeType: 'application/json',
    content: JSON.stringify(
      {
        session: serializeSession(session),
        metrics: metrics ?? null,
        turns: turns.map(serializeTurn),
      },
      null,
      2
    ),
  };
}

/**
 * List all available session resources
 */
export function listSessionResources(): Array<{
  uri: string;
  name: string;
  description: string;
  mimeType: string;
}> {
  const resources: Array<{
    uri: string;
    name: string;
    description: string;
    mimeType: string;
  }> = [];

  // Add list resource
  resources.push({
    uri: 'sessions://list',
    name: 'Session List',
    description: 'List of all available Claude Code sessions',
    mimeType: 'application/json',
  });

  // Add current session resource if available
  const currentSessionId = sessionStore.getCurrentSessionId();
  if (currentSessionId) {
    resources.push({
      uri: 'sessions://current',
      name: 'Current Session',
      description: 'The currently active Claude Code session',
      mimeType: 'application/json',
    });
  }

  // Add individual session resources
  const sessions = sessionStore.getAllSessions();
  for (const session of sessions) {
    resources.push({
      uri: `sessions://${session.id}`,
      name: `Session: ${session.projectName}`,
      description: `Session ${session.id} from project ${session.projectName}`,
      mimeType: 'application/json',
    });
  }

  return resources;
}

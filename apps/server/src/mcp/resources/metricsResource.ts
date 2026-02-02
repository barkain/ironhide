/**
 * MCP Resource: metrics://
 *
 * Provides session metrics as MCP resources
 */

import { sessionStore } from '../../store/sessionStore.js';
import { calculateEfficiencyComponents } from '../../metrics/efficiencyScore.js';
import { serializeTurnMetrics } from '@analytics/shared';

/**
 * Resource URI patterns for metrics
 */
export const METRICS_RESOURCE_URI_PREFIX = 'metrics://';

/**
 * Get current session metrics resource
 */
export function getCurrentMetricsResource(): {
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

  const sessionMetrics = sessionStore.getSessionMetrics(currentSessionId);
  const turnMetrics = sessionStore.getSessionTurnMetrics(currentSessionId);
  const turns = sessionStore.getSessionTurns(currentSessionId);

  let efficiency = null;
  if (sessionMetrics) {
    efficiency = calculateEfficiencyComponents(
      turns,
      sessionMetrics.totalTokens,
      sessionMetrics.totalCodeChanges
    );
  }

  return {
    uri: 'metrics://current',
    name: 'Current Session Metrics',
    description: 'Metrics for the currently active Claude Code session',
    mimeType: 'application/json',
    content: JSON.stringify(
      {
        sessionId: currentSessionId,
        sessionMetrics: sessionMetrics ?? null,
        turnMetrics: turnMetrics.map(serializeTurnMetrics),
        efficiency,
      },
      null,
      2
    ),
  };
}

/**
 * Get metrics by session ID resource
 */
export function getMetricsByIdResource(sessionId: string): {
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

  const sessionMetrics = sessionStore.getSessionMetrics(sessionId);
  const turnMetrics = sessionStore.getSessionTurnMetrics(sessionId);
  const turns = sessionStore.getSessionTurns(sessionId);

  let efficiency = null;
  if (sessionMetrics) {
    efficiency = calculateEfficiencyComponents(
      turns,
      sessionMetrics.totalTokens,
      sessionMetrics.totalCodeChanges
    );
  }

  return {
    uri: `metrics://${sessionId}`,
    name: `Metrics: ${session.projectName}`,
    description: `Metrics for session ${sessionId}`,
    mimeType: 'application/json',
    content: JSON.stringify(
      {
        sessionId,
        sessionMetrics: sessionMetrics ?? null,
        turnMetrics: turnMetrics.map(serializeTurnMetrics),
        efficiency,
      },
      null,
      2
    ),
  };
}

/**
 * List all available metrics resources
 */
export function listMetricsResources(): Array<{
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

  // Add current metrics resource if available
  const currentSessionId = sessionStore.getCurrentSessionId();
  if (currentSessionId) {
    resources.push({
      uri: 'metrics://current',
      name: 'Current Session Metrics',
      description: 'Metrics for the currently active Claude Code session',
      mimeType: 'application/json',
    });
  }

  // Add individual session metrics resources
  const sessions = sessionStore.getAllSessions();
  for (const session of sessions) {
    resources.push({
      uri: `metrics://${session.id}`,
      name: `Metrics: ${session.projectName}`,
      description: `Metrics for session ${session.id}`,
      mimeType: 'application/json',
    });
  }

  return resources;
}

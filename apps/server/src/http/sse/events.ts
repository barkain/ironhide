/**
 * SSE event formatters
 */

import type {
  SSEConnectedEvent,
  SSESessionEvent,
  SSETurnEvent,
  SSEMetricsEvent,
  SSEHeartbeatEvent,
  SSEErrorEvent,
  Session,
  Turn,
  SessionMetrics,
  TurnMetrics,
} from '@analytics/shared';
import { serializeSession, serializeTurn, serializeTurnMetrics } from '@analytics/shared';
import { SERVER_CONFIG } from '../../config/index.js';

/**
 * Format an SSE message
 */
export function formatSSEMessage(event: string, data: unknown): string {
  const jsonData = JSON.stringify(data);
  return `event: ${event}\ndata: ${jsonData}\n\n`;
}

/**
 * Create connected event
 */
export function createConnectedEvent(sessionId: string | null): string {
  const event: SSEConnectedEvent = {
    event: 'connected',
    data: {
      sessionId,
      timestamp: new Date().toISOString(),
      serverVersion: SERVER_CONFIG.version,
    },
  };
  return formatSSEMessage('connected', event.data);
}

/**
 * Create session snapshot event
 */
export function createSessionSnapshotEvent(
  session: Session,
  turns: Turn[],
  metrics: SessionMetrics
): string {
  const event: SSESessionEvent = {
    event: 'session',
    data: {
      type: 'snapshot',
      session: serializeSession(session),
      turns: turns.map(serializeTurn),
      metrics,
    },
  };
  return formatSSEMessage('session', event.data);
}

/**
 * Create session update event
 */
export function createSessionUpdateEvent(
  session: Session,
  turns: Turn[],
  metrics: SessionMetrics
): string {
  const event: SSESessionEvent = {
    event: 'session',
    data: {
      type: 'update',
      session: serializeSession(session),
      turns: turns.map(serializeTurn),
      metrics,
    },
  };
  return formatSSEMessage('session', event.data);
}

/**
 * Create new turn event
 */
export function createNewTurnEvent(turn: Turn, metrics: TurnMetrics): string {
  const event: SSETurnEvent = {
    event: 'turn',
    data: {
      type: 'new',
      turn: serializeTurn(turn),
      metrics: serializeTurnMetrics(metrics),
    },
  };
  return formatSSEMessage('turn', event.data);
}

/**
 * Create turn update event
 */
export function createTurnUpdateEvent(turn: Turn, metrics: TurnMetrics): string {
  const event: SSETurnEvent = {
    event: 'turn',
    data: {
      type: 'update',
      turn: serializeTurn(turn),
      metrics: serializeTurnMetrics(metrics),
    },
  };
  return formatSSEMessage('turn', event.data);
}

/**
 * Create turn complete event
 */
export function createTurnCompleteEvent(turn: Turn, metrics: TurnMetrics): string {
  const event: SSETurnEvent = {
    event: 'turn',
    data: {
      type: 'complete',
      turn: serializeTurn(turn),
      metrics: serializeTurnMetrics(metrics),
    },
  };
  return formatSSEMessage('turn', event.data);
}

/**
 * Create metrics aggregate event
 */
export function createMetricsEvent(metrics: SessionMetrics): string {
  const event: SSEMetricsEvent = {
    event: 'metrics',
    data: {
      type: 'aggregate',
      sessionMetrics: metrics,
    },
  };
  return formatSSEMessage('metrics', event.data);
}

/**
 * Create heartbeat event
 */
export function createHeartbeatEvent(): string {
  const event: SSEHeartbeatEvent = {
    event: 'heartbeat',
    data: {
      timestamp: new Date().toISOString(),
    },
  };
  return formatSSEMessage('heartbeat', event.data);
}

/**
 * Create error event
 */
export function createErrorEvent(code: string, message: string): string {
  const event: SSEErrorEvent = {
    event: 'error',
    data: {
      code,
      message,
      timestamp: new Date().toISOString(),
    },
  };
  return formatSSEMessage('error', event.data);
}

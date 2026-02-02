/**
 * SSE event types sent from server to dashboard
 */

import type { Session, SerializedSession, Turn, SerializedTurn } from './session.js';
import type { SessionMetrics, TurnMetrics, SerializedTurnMetrics } from './metrics.js';

/**
 * Union type for all SSE events
 */
export type SSEEvent =
  | SSEConnectedEvent
  | SSESessionEvent
  | SSETurnEvent
  | SSEMetricsEvent
  | SSEHeartbeatEvent
  | SSEErrorEvent;

/**
 * SSE connected event - sent on initial connection
 */
export interface SSEConnectedEvent {
  event: 'connected';
  data: {
    sessionId: string | null;
    timestamp: string;
    serverVersion: string;
  };
}

/**
 * SSE session event - sent for session snapshots and updates
 */
export interface SSESessionEvent {
  event: 'session';
  data: {
    type: 'snapshot' | 'update';
    session: SerializedSession;
    turns: SerializedTurn[];
    metrics: SessionMetrics;
  };
}

/**
 * SSE turn event - sent for new, updated, or completed turns
 */
export interface SSETurnEvent {
  event: 'turn';
  data: {
    type: 'new' | 'update' | 'complete';
    turn: SerializedTurn;
    metrics: SerializedTurnMetrics;
  };
}

/**
 * SSE metrics event - sent for aggregated session metrics updates
 */
export interface SSEMetricsEvent {
  event: 'metrics';
  data: {
    type: 'aggregate';
    sessionMetrics: SessionMetrics;
  };
}

/**
 * SSE heartbeat event - sent periodically to keep connection alive
 */
export interface SSEHeartbeatEvent {
  event: 'heartbeat';
  data: {
    timestamp: string;
  };
}

/**
 * SSE error event - sent when an error occurs
 */
export interface SSEErrorEvent {
  event: 'error';
  data: {
    code: string;
    message: string;
    timestamp: string;
  };
}

/**
 * SSE event names as a union type
 */
export type SSEEventName = 'connected' | 'session' | 'turn' | 'metrics' | 'heartbeat' | 'error';

/**
 * Helper type to extract data type from event type
 */
export type SSEEventData<E extends SSEEvent> = E['data'];

/**
 * SSE connection status
 */
export type SSEConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

/**
 * SSE subscription options
 */
export interface SSESubscriptionOptions {
  /** Session ID to filter events (optional) */
  sessionId?: string;
  /** Auto-reconnect on disconnect */
  autoReconnect?: boolean;
  /** Reconnect delay in milliseconds */
  reconnectDelay?: number;
  /** Maximum reconnect attempts */
  maxReconnectAttempts?: number;
}

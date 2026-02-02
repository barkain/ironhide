/**
 * SSE client for real-time updates from the analytics server
 */

import type {
  SSEEvent,
  SSEEventName,
  SSEConnectionStatus,
  SSESubscriptionOptions,
} from '@analytics/shared';

const SSE_URL = process.env.NEXT_PUBLIC_SSE_URL || 'http://localhost:3100/api/sse';

/**
 * Event handler type for SSE events
 */
export type SSEEventHandler<E extends SSEEvent = SSEEvent> = (event: E) => void;

/**
 * SSE client class for managing real-time connections
 */
export class SSEClient {
  private eventSource: EventSource | null = null;
  private handlers: Map<SSEEventName, Set<SSEEventHandler>> = new Map();
  private statusHandler: ((status: SSEConnectionStatus) => void) | null = null;
  private status: SSEConnectionStatus = 'disconnected';
  private reconnectAttempts = 0;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private options: Required<SSESubscriptionOptions>;

  constructor(options: SSESubscriptionOptions = {}) {
    this.options = {
      sessionId: options.sessionId ?? undefined,
      autoReconnect: options.autoReconnect ?? true,
      reconnectDelay: options.reconnectDelay ?? 3000,
      maxReconnectAttempts: options.maxReconnectAttempts ?? 10,
    } as Required<SSESubscriptionOptions>;
  }

  /**
   * Get current connection status
   */
  getStatus(): SSEConnectionStatus {
    return this.status;
  }

  /**
   * Set status change handler
   */
  onStatusChange(handler: (status: SSEConnectionStatus) => void): void {
    this.statusHandler = handler;
  }

  /**
   * Update and broadcast status
   */
  private setStatus(status: SSEConnectionStatus): void {
    this.status = status;
    this.statusHandler?.(status);
  }

  /**
   * Connect to the SSE endpoint
   */
  connect(): void {
    if (this.eventSource) {
      this.disconnect();
    }

    this.setStatus('connecting');

    const url = new URL(SSE_URL);
    if (this.options.sessionId) {
      url.searchParams.set('sessionId', this.options.sessionId);
    }

    this.eventSource = new EventSource(url.toString());

    this.eventSource.onopen = () => {
      this.setStatus('connected');
      this.reconnectAttempts = 0;
    };

    this.eventSource.onerror = () => {
      this.setStatus('error');
      this.handleReconnect();
    };

    // Register handlers for all event types
    const eventTypes: SSEEventName[] = ['connected', 'session', 'turn', 'metrics', 'heartbeat', 'error'];
    eventTypes.forEach((eventType) => {
      this.eventSource?.addEventListener(eventType, (event: MessageEvent) => {
        try {
          if (!event.data) return; // Skip empty/undefined data (e.g., heartbeat comments)
          const data = JSON.parse(event.data);
          const sseEvent: SSEEvent = { event: eventType, data } as SSEEvent;
          this.emit(eventType, sseEvent);
        } catch (error) {
          console.error(`Failed to parse SSE event: ${eventType}`, error);
        }
      });
    });
  }

  /**
   * Disconnect from the SSE endpoint
   */
  disconnect(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }

    this.setStatus('disconnected');
    this.reconnectAttempts = 0;
  }

  /**
   * Handle reconnection logic
   */
  private handleReconnect(): void {
    if (!this.options.autoReconnect) {
      this.disconnect();
      return;
    }

    if (this.reconnectAttempts >= this.options.maxReconnectAttempts) {
      console.error('Max reconnect attempts reached');
      this.disconnect();
      return;
    }

    this.reconnectAttempts++;
    const delay = this.options.reconnectDelay * Math.pow(1.5, this.reconnectAttempts - 1);

    this.reconnectTimeout = setTimeout(() => {
      this.connect();
    }, delay);
  }

  /**
   * Subscribe to an event type
   */
  on<E extends SSEEvent>(eventType: SSEEventName, handler: SSEEventHandler<E>): () => void {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, new Set());
    }
    this.handlers.get(eventType)!.add(handler as SSEEventHandler);

    // Return unsubscribe function
    return () => {
      this.handlers.get(eventType)?.delete(handler as SSEEventHandler);
    };
  }

  /**
   * Emit an event to all handlers
   */
  private emit(eventType: SSEEventName, event: SSEEvent): void {
    this.handlers.get(eventType)?.forEach((handler) => {
      try {
        handler(event);
      } catch (error) {
        console.error(`Error in SSE event handler for ${eventType}:`, error);
      }
    });
  }
}

/**
 * Create a singleton SSE client instance
 */
let sseClient: SSEClient | null = null;

export function getSSEClient(options?: SSESubscriptionOptions): SSEClient {
  if (!sseClient || options) {
    sseClient = new SSEClient(options);
  }
  return sseClient;
}

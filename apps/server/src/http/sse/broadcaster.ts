/**
 * Event broadcasting to SSE clients
 */

import { storeEventEmitter, type StoreEvents } from '../../store/eventEmitter.js';
import { sessionStore } from '../../store/sessionStore.js';
import {
  createSessionUpdateEvent,
  createNewTurnEvent,
  createTurnUpdateEvent,
  createTurnCompleteEvent,
  createMetricsEvent,
} from './events.js';

/**
 * SSE client connection
 */
interface SSEClient {
  id: string;
  sessionId: string | null;
  writer: WritableStreamDefaultWriter<Uint8Array>;
  encoder: TextEncoder;
  connected: boolean;
}

/**
 * SSE broadcaster manages all client connections and broadcasts events
 */
class SSEBroadcaster {
  private clients: Map<string, SSEClient> = new Map();
  private listenerSetup = false;

  // Store listener references for cleanup
  private sessionUpdatedListener: ((data: StoreEvents['session:updated']) => void) | null = null;
  private turnCreatedListener: ((data: StoreEvents['turn:created']) => void) | null = null;
  private turnUpdatedListener: ((data: StoreEvents['turn:updated']) => void) | null = null;
  private turnCompletedListener: ((data: StoreEvents['turn:completed']) => void) | null = null;
  private metricsUpdatedListener: ((data: StoreEvents['metrics:updated']) => void) | null = null;

  /**
   * Add a new client connection
   */
  addClient(
    clientId: string,
    sessionId: string | null,
    writer: WritableStreamDefaultWriter<Uint8Array>
  ): void {
    const client: SSEClient = {
      id: clientId,
      sessionId,
      writer,
      encoder: new TextEncoder(),
      connected: true,
    };

    this.clients.set(clientId, client);
    this.setupListeners();

    console.log(
      `SSE client connected: ${clientId}${sessionId ? ` (session: ${sessionId})` : ''}`
    );
  }

  /**
   * Remove a client connection
   */
  removeClient(clientId: string): void {
    const client = this.clients.get(clientId);
    if (client) {
      client.connected = false;
      this.clients.delete(clientId);
      console.log(`SSE client disconnected: ${clientId}`);
    }
  }

  /**
   * Send message to a specific client
   */
  async sendToClient(clientId: string, message: string): Promise<boolean> {
    const client = this.clients.get(clientId);
    if (!client || !client.connected) return false;

    try {
      await client.writer.write(client.encoder.encode(message));
      return true;
    } catch (error) {
      console.error(`Error sending to client ${clientId}:`, error);
      this.removeClient(clientId);
      return false;
    }
  }

  /**
   * Broadcast message to all clients watching a specific session
   */
  async broadcastToSession(sessionId: string, message: string): Promise<void> {
    const promises: Promise<boolean>[] = [];

    for (const [clientId, client] of this.clients) {
      // Send to clients watching this specific session or all sessions (null)
      if (client.sessionId === sessionId || client.sessionId === null) {
        promises.push(this.sendToClient(clientId, message));
      }
    }

    await Promise.all(promises);
  }

  /**
   * Broadcast message to all connected clients
   */
  async broadcastToAll(message: string): Promise<void> {
    const promises: Promise<boolean>[] = [];

    for (const clientId of this.clients.keys()) {
      promises.push(this.sendToClient(clientId, message));
    }

    await Promise.all(promises);
  }

  /**
   * Get number of connected clients
   */
  getClientCount(): number {
    return this.clients.size;
  }

  /**
   * Get clients watching a specific session
   */
  getSessionClientCount(sessionId: string): number {
    let count = 0;
    for (const client of this.clients.values()) {
      if (client.sessionId === sessionId || client.sessionId === null) {
        count++;
      }
    }
    return count;
  }

  /**
   * Setup event listeners for store events
   */
  private setupListeners(): void {
    if (this.listenerSetup) return;
    this.listenerSetup = true;

    // Session updated
    this.sessionUpdatedListener = ({ session }) => {
      const turns = sessionStore.getSessionTurns(session.id);
      const metrics = sessionStore.getSessionMetrics(session.id);
      if (metrics) {
        const message = createSessionUpdateEvent(session, turns, metrics);
        this.broadcastToSession(session.id, message);
      }
    };
    storeEventEmitter.on('session:updated', this.sessionUpdatedListener);

    // Turn created
    this.turnCreatedListener = ({ turn, metrics }) => {
      const message = createNewTurnEvent(turn, metrics);
      this.broadcastToSession(turn.sessionId, message);
    };
    storeEventEmitter.on('turn:created', this.turnCreatedListener);

    // Turn updated
    this.turnUpdatedListener = ({ turn, metrics }) => {
      const message = createTurnUpdateEvent(turn, metrics);
      this.broadcastToSession(turn.sessionId, message);
    };
    storeEventEmitter.on('turn:updated', this.turnUpdatedListener);

    // Turn completed
    this.turnCompletedListener = ({ turn, metrics }) => {
      const message = createTurnCompleteEvent(turn, metrics);
      this.broadcastToSession(turn.sessionId, message);
    };
    storeEventEmitter.on('turn:completed', this.turnCompletedListener);

    // Metrics updated
    this.metricsUpdatedListener = ({ sessionId, metrics }) => {
      const message = createMetricsEvent(metrics);
      this.broadcastToSession(sessionId, message);
    };
    storeEventEmitter.on('metrics:updated', this.metricsUpdatedListener);
  }

  /**
   * Remove all event listeners and cleanup resources
   * Call this when the broadcaster is no longer needed (e.g., server shutdown)
   */
  destroy(): void {
    // Remove all event listeners
    if (this.sessionUpdatedListener) {
      storeEventEmitter.off('session:updated', this.sessionUpdatedListener);
      this.sessionUpdatedListener = null;
    }
    if (this.turnCreatedListener) {
      storeEventEmitter.off('turn:created', this.turnCreatedListener);
      this.turnCreatedListener = null;
    }
    if (this.turnUpdatedListener) {
      storeEventEmitter.off('turn:updated', this.turnUpdatedListener);
      this.turnUpdatedListener = null;
    }
    if (this.turnCompletedListener) {
      storeEventEmitter.off('turn:completed', this.turnCompletedListener);
      this.turnCompletedListener = null;
    }
    if (this.metricsUpdatedListener) {
      storeEventEmitter.off('metrics:updated', this.metricsUpdatedListener);
      this.metricsUpdatedListener = null;
    }

    // Clear all clients
    this.clients.clear();
    this.listenerSetup = false;
  }
}

/**
 * Singleton broadcaster instance
 */
export const sseBroadcaster = new SSEBroadcaster();

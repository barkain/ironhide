/**
 * Event broadcasting to SSE clients
 */

import { storeEventEmitter } from '../../store/eventEmitter.js';
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
    storeEventEmitter.on('session:updated', ({ session }) => {
      const turns = sessionStore.getSessionTurns(session.id);
      const metrics = sessionStore.getSessionMetrics(session.id);
      if (metrics) {
        const message = createSessionUpdateEvent(session, turns, metrics);
        this.broadcastToSession(session.id, message);
      }
    });

    // Turn created
    storeEventEmitter.on('turn:created', ({ turn, metrics }) => {
      const message = createNewTurnEvent(turn, metrics);
      this.broadcastToSession(turn.sessionId, message);
    });

    // Turn updated
    storeEventEmitter.on('turn:updated', ({ turn, metrics }) => {
      const message = createTurnUpdateEvent(turn, metrics);
      this.broadcastToSession(turn.sessionId, message);
    });

    // Turn completed
    storeEventEmitter.on('turn:completed', ({ turn, metrics }) => {
      const message = createTurnCompleteEvent(turn, metrics);
      this.broadcastToSession(turn.sessionId, message);
    });

    // Metrics updated
    storeEventEmitter.on('metrics:updated', ({ sessionId, metrics }) => {
      const message = createMetricsEvent(metrics);
      this.broadcastToSession(sessionId, message);
    });
  }
}

/**
 * Singleton broadcaster instance
 */
export const sseBroadcaster = new SSEBroadcaster();

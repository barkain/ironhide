/**
 * Internal event bus for real-time updates
 */

import { EventEmitter } from 'node:events';
import type { Session, Turn } from '@analytics/shared';
import type { SessionMetrics, TurnMetrics } from '@analytics/shared';

/**
 * Event types for internal communication
 */
export interface StoreEvents {
  'session:created': { session: Session };
  'session:updated': { session: Session };
  'session:deleted': { sessionId: string };
  'turn:created': { turn: Turn; metrics: TurnMetrics };
  'turn:updated': { turn: Turn; metrics: TurnMetrics };
  'turn:completed': { turn: Turn; metrics: TurnMetrics };
  'metrics:updated': { sessionId: string; metrics: SessionMetrics };
  'file:changed': { filePath: string; sessionId: string };
  'file:added': { filePath: string; sessionId: string };
  'file:removed': { filePath: string; sessionId: string };
}

/**
 * Type-safe event names
 */
export type StoreEventName = keyof StoreEvents;

/**
 * Typed event emitter for store events
 */
class TypedEventEmitter extends EventEmitter {
  emit<K extends StoreEventName>(event: K, data: StoreEvents[K]): boolean {
    return super.emit(event, data);
  }

  on<K extends StoreEventName>(
    event: K,
    listener: (data: StoreEvents[K]) => void
  ): this {
    return super.on(event, listener);
  }

  once<K extends StoreEventName>(
    event: K,
    listener: (data: StoreEvents[K]) => void
  ): this {
    return super.once(event, listener);
  }

  off<K extends StoreEventName>(
    event: K,
    listener: (data: StoreEvents[K]) => void
  ): this {
    return super.off(event, listener);
  }

  addListener<K extends StoreEventName>(
    event: K,
    listener: (data: StoreEvents[K]) => void
  ): this {
    return super.addListener(event, listener);
  }

  removeListener<K extends StoreEventName>(
    event: K,
    listener: (data: StoreEvents[K]) => void
  ): this {
    return super.removeListener(event, listener);
  }
}

/**
 * Singleton event emitter instance
 */
export const storeEventEmitter = new TypedEventEmitter();

/**
 * Set max listeners to avoid warnings with many SSE clients
 */
storeEventEmitter.setMaxListeners(100);

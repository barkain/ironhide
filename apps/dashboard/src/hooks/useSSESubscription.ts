'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { SSEClient, getSSEClient } from '@/lib/sse';
import { queryKeys } from '@/lib/queryClient';
import { useSessionStore } from '@/stores/sessionStore';
import { useSettingsStore } from '@/stores/settingsStore';
import type {
  SSEConnectionStatus,
  SSESessionEvent,
  SSETurnEvent,
  SSEMetricsEvent,
} from '@analytics/shared';

/**
 * Hook to manage SSE subscription and real-time updates
 */
export function useSSESubscription(sessionId?: string) {
  const [status, setStatus] = useState<SSEConnectionStatus>('disconnected');
  const clientRef = useRef<SSEClient | null>(null);
  const queryClient = useQueryClient();

  const { setCurrentSession, setSessionMetrics, addTurn, updateTurn } = useSessionStore();
  const realTimeEnabled = useSettingsStore((state) => state.realTimeEnabled);

  const connect = useCallback(() => {
    if (!realTimeEnabled) return;

    // Disconnect existing client
    if (clientRef.current) {
      clientRef.current.disconnect();
    }

    // Create new client
    const client = getSSEClient({ sessionId });
    clientRef.current = client;

    // Set up status handler
    client.onStatusChange(setStatus);

    // Handle session events
    client.on<SSESessionEvent>('session', (event) => {
      const { session, metrics } = event.data;
      setCurrentSession(session);
      setSessionMetrics(metrics);

      // Invalidate queries to update cache
      queryClient.invalidateQueries({ queryKey: queryKeys.sessions.all });
    });

    // Handle turn events
    client.on<SSETurnEvent>('turn', (event) => {
      const { type, turn } = event.data;

      if (type === 'new') {
        addTurn(turn);
      } else {
        updateTurn(turn);
      }

      // Invalidate turn queries
      if (sessionId) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.turns.list(sessionId, {}),
        });
      }
    });

    // Handle metrics events
    client.on<SSEMetricsEvent>('metrics', (event) => {
      const { sessionMetrics } = event.data;
      setSessionMetrics(sessionMetrics);

      // Invalidate metrics queries
      if (sessionId) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.metrics.session(sessionId),
        });
      }
    });

    // Connect
    client.connect();
  }, [
    sessionId,
    realTimeEnabled,
    queryClient,
    setCurrentSession,
    setSessionMetrics,
    addTurn,
    updateTurn,
  ]);

  const disconnect = useCallback(() => {
    if (clientRef.current) {
      clientRef.current.disconnect();
      clientRef.current = null;
    }
    setStatus('disconnected');
  }, []);

  // Connect on mount, disconnect on unmount
  useEffect(() => {
    if (realTimeEnabled) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [connect, disconnect, realTimeEnabled]);

  // Reconnect when sessionId changes
  useEffect(() => {
    if (realTimeEnabled && sessionId) {
      connect();
    }
  }, [sessionId, realTimeEnabled, connect]);

  return {
    status,
    isConnected: status === 'connected',
    isConnecting: status === 'connecting',
    isError: status === 'error',
    connect,
    disconnect,
  };
}

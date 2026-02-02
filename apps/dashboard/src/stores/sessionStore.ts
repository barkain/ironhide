import { create } from 'zustand';
import type { SerializedSession, SerializedTurn, SessionMetrics } from '@analytics/shared';

/**
 * Session state interface
 */
interface SessionState {
  // Current session data
  currentSessionId: string | null;
  currentSession: SerializedSession | null;
  sessionMetrics: SessionMetrics | null;
  turns: SerializedTurn[];

  // Session list
  sessions: SerializedSession[];
  totalSessions: number;

  // Loading states
  isLoading: boolean;
  isLoadingTurns: boolean;

  // Actions
  setCurrentSession: (session: SerializedSession | null) => void;
  setSessionMetrics: (metrics: SessionMetrics | null) => void;
  setTurns: (turns: SerializedTurn[]) => void;
  addTurn: (turn: SerializedTurn) => void;
  updateTurn: (turn: SerializedTurn) => void;
  setSessions: (sessions: SerializedSession[], total: number) => void;
  setLoading: (loading: boolean) => void;
  setLoadingTurns: (loading: boolean) => void;
  reset: () => void;
}

const initialState = {
  currentSessionId: null,
  currentSession: null,
  sessionMetrics: null,
  turns: [],
  sessions: [],
  totalSessions: 0,
  isLoading: false,
  isLoadingTurns: false,
};

/**
 * Zustand store for session state management
 */
export const useSessionStore = create<SessionState>((set) => ({
  ...initialState,

  setCurrentSession: (session) =>
    set({
      currentSession: session,
      currentSessionId: session?.id ?? null,
    }),

  setSessionMetrics: (metrics) =>
    set({ sessionMetrics: metrics }),

  setTurns: (turns) =>
    set({ turns }),

  addTurn: (turn) =>
    set((state) => ({
      turns: [...state.turns, turn],
    })),

  updateTurn: (turn) =>
    set((state) => ({
      turns: state.turns.map((t) => (t.id === turn.id ? turn : t)),
    })),

  setSessions: (sessions, total) =>
    set({ sessions, totalSessions: total }),

  setLoading: (loading) =>
    set({ isLoading: loading }),

  setLoadingTurns: (loading) =>
    set({ isLoadingTurns: loading }),

  reset: () =>
    set(initialState),
}));

/**
 * Selector for current session
 */
export const selectCurrentSession = (state: SessionState) => state.currentSession;

/**
 * Selector for session metrics
 */
export const selectSessionMetrics = (state: SessionState) => state.sessionMetrics;

/**
 * Selector for turns
 */
export const selectTurns = (state: SessionState) => state.turns;

/**
 * Selector for sessions list
 */
export const selectSessions = (state: SessionState) => state.sessions;

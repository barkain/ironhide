/**
 * API client for communicating with the analytics server
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3100/api';

/**
 * Custom error class for API errors
 */
export class APIError extends Error {
  constructor(
    public status: number,
    message: string,
    public data?: unknown
  ) {
    super(message);
    this.name = 'APIError';
  }
}

/**
 * Generic fetch wrapper with error handling
 */
async function fetchAPI<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new APIError(
      response.status,
      errorData.message || `HTTP error ${response.status}`,
      errorData
    );
  }

  return response.json();
}

/**
 * Session list response type
 */
export interface SessionListItem {
  id: string;
  projectName: string;
  branch: string | null;
  startedAt: string;
  lastActivityAt: string;
  isActive: boolean;
  summary: {
    totalTurns: number;
    totalTokens: number;
    totalCost: number;
  };
}

export interface SessionListResponse {
  sessions: SessionListItem[];
  total: number;
}

/**
 * Fetch list of sessions
 */
export async function fetchSessions(options?: {
  limit?: number;
  activeOnly?: boolean;
  projectPath?: string;
}): Promise<SessionListResponse> {
  const params = new URLSearchParams();
  if (options?.limit) params.set('limit', String(options.limit));
  if (options?.activeOnly) params.set('activeOnly', 'true');
  if (options?.projectPath) params.set('projectPath', options.projectPath);

  const query = params.toString();
  return fetchAPI<SessionListResponse>(`/sessions${query ? `?${query}` : ''}`);
}

/**
 * Session detail response
 */
import type { SerializedSession, SerializedTurn, SessionMetrics, SerializedTurnMetrics, EfficiencyComponents } from '@analytics/shared';

export interface SessionDetailResponse {
  session: SerializedSession;
  metrics: SessionMetrics;
  turnCount: number;
}

/**
 * Fetch session details
 */
export async function fetchSession(sessionId: string): Promise<SessionDetailResponse> {
  return fetchAPI<SessionDetailResponse>(`/sessions/${sessionId}`);
}

/**
 * Turn list response
 */
export interface TurnListResponse {
  turns: SerializedTurn[];
  metrics: SerializedTurnMetrics[];
  total: number;
  hasMore: boolean;
}

/**
 * Fetch turns for a session
 */
export async function fetchTurns(
  sessionId: string,
  options?: { offset?: number; limit?: number }
): Promise<TurnListResponse> {
  const params = new URLSearchParams();
  if (options?.offset) params.set('offset', String(options.offset));
  if (options?.limit) params.set('limit', String(options.limit));

  const query = params.toString();
  return fetchAPI<TurnListResponse>(`/sessions/${sessionId}/turns${query ? `?${query}` : ''}`);
}

/**
 * Metrics response
 */
export interface MetricsResponse {
  sessionMetrics: SessionMetrics;
  turnMetrics: SerializedTurnMetrics[];
  efficiency: EfficiencyComponents;
}

/**
 * Fetch metrics for a session
 */
export async function fetchMetrics(sessionId: string): Promise<MetricsResponse> {
  return fetchAPI<MetricsResponse>(`/sessions/${sessionId}/metrics`);
}

/**
 * Turn detail response
 */
import type { CodeChange } from '@analytics/shared';

export interface TurnDetailResponse {
  turn: SerializedTurn;
  metrics: SerializedTurnMetrics;
  codeChanges: CodeChange[];
}

/**
 * Fetch turn details
 */
export async function fetchTurn(turnId: string): Promise<TurnDetailResponse> {
  return fetchAPI<TurnDetailResponse>(`/turns/${turnId}`);
}

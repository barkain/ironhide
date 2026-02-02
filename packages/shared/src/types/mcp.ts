/**
 * MCP Tool definitions for Claude Code integration
 *
 * Simplified to expose only the consolidated get_analytics tool
 */

import type { Session, Turn, ToolUse, CodeChange } from './session.js';
import type { SessionMetrics, TurnMetrics, EfficiencyComponents } from './metrics.js';

// ============================================================================
// Tool: get_analytics (consolidated tool)
// ============================================================================

/**
 * Input for get_analytics tool
 */
export interface GetAnalyticsInput {
  /** Session ID (optional, uses current/most recent if not provided) */
  sessionId?: string;
}

/**
 * Output for get_analytics tool - comprehensive session analytics
 */
export interface GetAnalyticsOutput {
  session: {
    id: string;
    projectName: string;
    branch: string | null;
    startedAt: string;
    turnCount: number;
    isActive: boolean;
  };
  cost: {
    total: number;
    breakdown: {
      input: number;
      output: number;
      cacheCreation: number;
    };
  };
  tokens: {
    total: number;
    input: number;
    output: number;
    cacheRead: number;
    cacheCreation: number;
  };
  efficiency: {
    score: number;
    cacheHitRate: number;
    codeOutputRatio: number;
  };
  codeChanges: {
    filesCreated: number;
    filesModified: number;
    linesAdded: number;
    linesRemoved: number;
  };
  recentTurns: Array<{
    turnNumber: number;
    timestamp: string;
    durationMs: number;
    tokenCount: number;
    toolCount: number;
    summary: string;
  }>;
  dashboardUrl: string;
}

// ============================================================================
// Legacy types (kept for backward compatibility, may be removed in future)
// ============================================================================

/**
 * @deprecated Use GetAnalyticsInput instead
 */
export interface GetSessionMetricsInput {
  sessionId?: string;
}

/**
 * @deprecated Use GetAnalyticsOutput instead
 */
export interface GetSessionMetricsOutput {
  session: Session;
  metrics: SessionMetrics;
  recentTurns: Turn[];
}

/**
 * @deprecated No longer exposed as a separate tool
 */
export interface GetTurnDetailsInput {
  turnId: string;
}

/**
 * @deprecated No longer exposed as a separate tool
 */
export interface GetTurnDetailsOutput {
  turn: Turn;
  metrics: TurnMetrics;
  toolDetails: ToolUse[];
  codeChanges: CodeChange[];
}

/**
 * @deprecated No longer exposed as a separate tool
 */
export interface ListSessionsInput {
  limit?: number;
  activeOnly?: boolean;
}

/**
 * @deprecated No longer exposed as a separate tool
 */
export interface SessionSummary {
  session: Session;
  summary: {
    totalCost: number;
    totalTokens: number;
    turnCount: number;
  };
}

/**
 * @deprecated No longer exposed as a separate tool
 */
export interface ListSessionsOutput {
  sessions: SessionSummary[];
}

/**
 * @deprecated No longer exposed as a separate tool
 */
export interface GetEfficiencyReportInput {
  sessionId?: string;
}

/**
 * @deprecated No longer exposed as a separate tool
 */
export interface GetEfficiencyReportOutput {
  session: Session;
  efficiency: EfficiencyComponents;
  recommendations: string[];
}

// ============================================================================
// MCP Resource URIs
// ============================================================================

/**
 * MCP Resource URI patterns
 */
export type MCPResourceURI =
  | 'sessions://list'
  | 'sessions://current'
  | `sessions://${string}`
  | 'metrics://current'
  | `metrics://${string}`;

/**
 * Parse an MCP resource URI
 */
export function parseMCPResourceURI(uri: string): {
  resource: 'sessions' | 'metrics';
  id: string | null;
} | null {
  const sessionsMatch = uri.match(/^sessions:\/\/(.+)$/);
  if (sessionsMatch) {
    const id = sessionsMatch[1];
    return {
      resource: 'sessions',
      id: id === 'list' || id === 'current' ? null : id,
    };
  }

  const metricsMatch = uri.match(/^metrics:\/\/(.+)$/);
  if (metricsMatch) {
    const id = metricsMatch[1];
    return {
      resource: 'metrics',
      id: id === 'current' ? null : id,
    };
  }

  return null;
}

// ============================================================================
// MCP Tool Schemas (for registration)
// ============================================================================

/**
 * JSON Schema for get_analytics input
 */
export const GET_ANALYTICS_SCHEMA = {
  type: 'object',
  properties: {
    sessionId: {
      type: 'string',
      description: 'Session ID (optional, uses current/most recent session if not provided)',
    },
  },
} as const;

/**
 * @deprecated Use GET_ANALYTICS_SCHEMA instead
 */
export const GET_SESSION_METRICS_SCHEMA = {
  type: 'object',
  properties: {
    sessionId: {
      type: 'string',
      description: 'Session ID (optional, uses current session if not provided)',
    },
  },
} as const;

/**
 * @deprecated No longer exposed as a separate tool
 */
export const GET_TURN_DETAILS_SCHEMA = {
  type: 'object',
  properties: {
    turnId: {
      type: 'string',
      description: 'Turn ID to retrieve',
    },
  },
  required: ['turnId'],
} as const;

/**
 * @deprecated No longer exposed as a separate tool
 */
export const LIST_SESSIONS_SCHEMA = {
  type: 'object',
  properties: {
    limit: {
      type: 'number',
      description: 'Maximum number of sessions to return',
      default: 10,
    },
    activeOnly: {
      type: 'boolean',
      description: 'Only return active sessions',
      default: false,
    },
  },
} as const;

/**
 * @deprecated No longer exposed as a separate tool
 */
export const GET_EFFICIENCY_REPORT_SCHEMA = {
  type: 'object',
  properties: {
    sessionId: {
      type: 'string',
      description: 'Session ID (optional)',
    },
  },
} as const;

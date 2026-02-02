/**
 * MCP Tool: get_analytics
 *
 * Consolidated tool that returns comprehensive session analytics in one call
 */

import type { Session, Turn } from '@analytics/shared';
import { sessionStore } from '../../store/sessionStore.js';
import {
  calculateEfficiencyComponents,
} from '../../metrics/efficiencyScore.js';
import { SERVER_CONFIG } from '../../config/index.js';

/**
 * Tool name
 */
export const GET_ANALYTICS_NAME = 'get_analytics';

/**
 * Tool description
 */
export const GET_ANALYTICS_DESCRIPTION =
  'Get comprehensive session analytics including cost, tokens, efficiency, and recent activity. Returns all key metrics in a single call.';

/**
 * Tool input schema
 */
export const GET_ANALYTICS_INPUT_SCHEMA = {
  type: 'object',
  properties: {
    sessionId: {
      type: 'string',
      description: 'Session ID (optional, uses current/most recent session if not provided)',
    },
  },
} as const;

/**
 * Output interface for get_analytics tool
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

/**
 * Input interface for get_analytics tool
 */
export interface GetAnalyticsInput {
  sessionId?: string;
}

/**
 * Execute get_analytics tool
 */
export function executeGetAnalytics(input: GetAnalyticsInput): GetAnalyticsOutput {
  // Determine session ID - use provided, or current, or most recent
  let sessionId = input.sessionId ?? sessionStore.getCurrentSessionId();

  if (!sessionId) {
    // Fall back to most recent session
    const allSessions = sessionStore.getAllSessions();
    if (allSessions.length > 0) {
      sessionId = allSessions[0].id;
    }
  }

  if (!sessionId) {
    throw new Error('No session available. Start a Claude Code session first.');
  }

  // Get session
  const session = sessionStore.getSession(sessionId);
  if (!session) {
    throw new Error(`Session not found: ${sessionId}`);
  }

  // Get metrics
  const metrics = sessionStore.getSessionMetrics(sessionId);
  if (!metrics) {
    throw new Error(`Metrics not found for session: ${sessionId}`);
  }

  // Get turns for recent activity
  const allTurns = sessionStore.getSessionTurns(sessionId);
  const recentTurns = allTurns.slice(-5);

  // Calculate efficiency components
  const efficiency = calculateEfficiencyComponents(
    allTurns,
    metrics.totalTokens,
    metrics.totalCodeChanges
  );

  // Build output
  const output: GetAnalyticsOutput = {
    session: {
      id: session.id,
      projectName: session.projectName,
      branch: session.branch,
      startedAt: session.startedAt.toISOString(),
      turnCount: session.turnCount,
      isActive: session.isActive,
    },
    cost: {
      total: metrics.totalCost,
      breakdown: {
        input: metrics.costBreakdown.input,
        output: metrics.costBreakdown.output,
        cacheCreation: metrics.costBreakdown.cacheCreation,
      },
    },
    tokens: {
      total: metrics.totalTokens.total,
      input: metrics.totalTokens.input,
      output: metrics.totalTokens.output,
      cacheRead: metrics.totalTokens.cacheRead,
      cacheCreation: metrics.totalTokens.cacheCreation,
    },
    efficiency: {
      score: efficiency.compositeScore,
      cacheHitRate: metrics.cacheHitRate,
      codeOutputRatio: efficiency.codeOutputRatio,
    },
    codeChanges: {
      filesCreated: metrics.totalCodeChanges.filesCreated,
      filesModified: metrics.totalCodeChanges.filesModified,
      linesAdded: metrics.totalCodeChanges.linesAdded,
      linesRemoved: metrics.totalCodeChanges.linesRemoved,
    },
    recentTurns: recentTurns.map((turn) => ({
      turnNumber: turn.turnNumber,
      timestamp: turn.startedAt.toISOString(),
      durationMs: turn.durationMs,
      tokenCount: turn.usage.input_tokens + turn.usage.output_tokens,
      toolCount: turn.toolUses.length,
      summary: turn.userMessage.slice(0, 100).replace(/\n/g, ' ').trim() +
        (turn.userMessage.length > 100 ? '...' : ''),
    })),
    dashboardUrl: `http://localhost:${SERVER_CONFIG.port}`,
  };

  return output;
}

/**
 * Format output as text for MCP response
 */
export function formatGetAnalyticsOutput(output: GetAnalyticsOutput): string {
  const lines: string[] = [];

  // Session info
  lines.push(`# Session Analytics: ${output.session.projectName}`);
  lines.push('');
  lines.push(`**Session ID:** ${output.session.id}`);
  lines.push(`**Branch:** ${output.session.branch ?? 'N/A'}`);
  lines.push(`**Started:** ${output.session.startedAt}`);
  lines.push(`**Turns:** ${output.session.turnCount}`);
  lines.push(`**Status:** ${output.session.isActive ? 'Active' : 'Inactive'}`);
  lines.push('');

  // Cost summary
  lines.push('## Cost');
  lines.push(`**Total:** $${output.cost.total.toFixed(4)}`);
  lines.push(`- Input: $${output.cost.breakdown.input.toFixed(4)}`);
  lines.push(`- Output: $${output.cost.breakdown.output.toFixed(4)}`);
  lines.push(`- Cache Creation: $${output.cost.breakdown.cacheCreation.toFixed(4)}`);
  lines.push('');

  // Token usage
  lines.push('## Tokens');
  lines.push(`**Total:** ${output.tokens.total.toLocaleString()}`);
  lines.push(`- Input: ${output.tokens.input.toLocaleString()}`);
  lines.push(`- Output: ${output.tokens.output.toLocaleString()}`);
  lines.push(`- Cache Read: ${output.tokens.cacheRead.toLocaleString()}`);
  lines.push(`- Cache Creation: ${output.tokens.cacheCreation.toLocaleString()}`);
  lines.push('');

  // Efficiency
  lines.push('## Efficiency');
  lines.push(`**Score:** ${output.efficiency.score.toFixed(1)}/100`);
  lines.push(`- Cache Hit Rate: ${output.efficiency.cacheHitRate.toFixed(1)}%`);
  lines.push(`- Code Output: ${output.efficiency.codeOutputRatio.toFixed(2)} lines/1000 tokens`);
  lines.push('');

  // Code changes
  lines.push('## Code Changes');
  lines.push(`- Files Created: ${output.codeChanges.filesCreated}`);
  lines.push(`- Files Modified: ${output.codeChanges.filesModified}`);
  lines.push(`- Lines Added: +${output.codeChanges.linesAdded}`);
  lines.push(`- Lines Removed: -${output.codeChanges.linesRemoved}`);
  lines.push('');

  // Recent turns
  if (output.recentTurns.length > 0) {
    lines.push('## Recent Turns');
    for (const turn of output.recentTurns) {
      lines.push(`- **Turn ${turn.turnNumber}** (${turn.durationMs}ms, ${turn.tokenCount} tokens, ${turn.toolCount} tools)`);
      lines.push(`  "${turn.summary}"`);
    }
    lines.push('');
  }

  // Dashboard link
  lines.push(`**Dashboard:** ${output.dashboardUrl}`);

  return lines.join('\n');
}

/**
 * Metrics routes (GET /sessions/:id/metrics)
 */

import { Hono } from 'hono';
import { sessionStore } from '../../store/sessionStore.js';
import { NotFoundError } from '../middleware/error.js';
import {
  calculateEfficiencyComponents,
  generateEfficiencyRecommendations,
  getEfficiencyGrade,
  getTimeSeriesData,
} from '../../metrics/index.js';

/**
 * Metrics router
 */
export const metricsRouter = new Hono();

/**
 * GET /metrics/current - Get metrics for current session
 */
metricsRouter.get('/current', (c) => {
  const currentSessionId = sessionStore.getCurrentSessionId();

  if (!currentSessionId) {
    return c.json({
      session: null,
      metrics: null,
      message: 'No active session',
    });
  }

  const session = sessionStore.getSession(currentSessionId);
  const metrics = sessionStore.getSessionMetrics(currentSessionId);

  if (!session) {
    return c.json({
      session: null,
      metrics: null,
      message: 'Current session not found',
    });
  }

  return c.json({
    session: {
      ...session,
      startedAt: session.startedAt.toISOString(),
      lastActivityAt: session.lastActivityAt.toISOString(),
    },
    metrics: metrics ?? null,
  });
});

/**
 * GET /metrics/summary - Get aggregated metrics across all sessions
 */
metricsRouter.get('/summary', (c) => {
  const sessions = sessionStore.getAllSessions();

  let totalTokens = 0;
  let totalCost = 0;
  let totalTurns = 0;
  let totalDurationMs = 0;
  const toolUsage: Record<string, number> = {};

  for (const session of sessions) {
    const metrics = sessionStore.getSessionMetrics(session.id);
    if (metrics) {
      totalTokens += metrics.totalTokens.total;
      totalCost += metrics.totalCost;
      totalTurns += metrics.totalTurns;
      totalDurationMs += metrics.totalDurationMs;

      for (const [tool, count] of Object.entries(metrics.toolBreakdown)) {
        toolUsage[tool] = (toolUsage[tool] ?? 0) + count;
      }
    }
  }

  const activeSessions = sessionStore.getActiveSessions();

  return c.json({
    totalSessions: sessions.length,
    activeSessions: activeSessions.length,
    totalTurns,
    totalTokens,
    totalCost,
    totalDurationMs,
    averageTokensPerSession: sessions.length > 0 ? totalTokens / sessions.length : 0,
    averageCostPerSession: sessions.length > 0 ? totalCost / sessions.length : 0,
    toolUsage,
  });
});

/**
 * GET /metrics/:sessionId/efficiency - Get efficiency report for a session
 */
metricsRouter.get('/:sessionId/efficiency', (c) => {
  const sessionId = c.req.param('sessionId');

  const session = sessionStore.getSession(sessionId);
  if (!session) {
    throw new NotFoundError('Session', sessionId);
  }

  const metrics = sessionStore.getSessionMetrics(sessionId);
  const turns = sessionStore.getSessionTurns(sessionId);

  if (!metrics) {
    return c.json({
      session: {
        ...session,
        startedAt: session.startedAt.toISOString(),
        lastActivityAt: session.lastActivityAt.toISOString(),
      },
      efficiency: null,
      recommendations: [],
      grade: 'N/A',
    });
  }

  const efficiency = calculateEfficiencyComponents(
    turns,
    metrics.totalTokens,
    metrics.totalCodeChanges
  );

  const recommendations = generateEfficiencyRecommendations(efficiency);
  const grade = getEfficiencyGrade(efficiency.compositeScore);

  return c.json({
    session: {
      ...session,
      startedAt: session.startedAt.toISOString(),
      lastActivityAt: session.lastActivityAt.toISOString(),
    },
    efficiency,
    recommendations,
    grade,
  });
});

/**
 * GET /metrics/:sessionId/timeseries - Get time series data for charts
 */
metricsRouter.get('/:sessionId/timeseries', (c) => {
  const sessionId = c.req.param('sessionId');

  const session = sessionStore.getSession(sessionId);
  if (!session) {
    throw new NotFoundError('Session', sessionId);
  }

  const turnMetrics = sessionStore.getSessionTurnMetrics(sessionId);
  const timeSeriesData = getTimeSeriesData(turnMetrics);

  return c.json({
    sessionId,
    data: timeSeriesData,
    total: timeSeriesData.length,
  });
});

/**
 * GET /metrics/:sessionId/tools - Get tool usage breakdown
 */
metricsRouter.get('/:sessionId/tools', (c) => {
  const sessionId = c.req.param('sessionId');

  const session = sessionStore.getSession(sessionId);
  if (!session) {
    throw new NotFoundError('Session', sessionId);
  }

  const metrics = sessionStore.getSessionMetrics(sessionId);
  const turns = sessionStore.getSessionTurns(sessionId);

  // Calculate success rate per tool
  const toolStats: Record<
    string,
    { total: number; successful: number; failed: number }
  > = {};

  for (const turn of turns) {
    for (const tool of turn.toolUses) {
      if (!toolStats[tool.name]) {
        toolStats[tool.name] = { total: 0, successful: 0, failed: 0 };
      }
      toolStats[tool.name].total++;
      if (tool.isError) {
        toolStats[tool.name].failed++;
      } else {
        toolStats[tool.name].successful++;
      }
    }
  }

  // Convert to array with success rate
  const toolBreakdown = Object.entries(toolStats).map(([name, stats]) => ({
    name,
    total: stats.total,
    successful: stats.successful,
    failed: stats.failed,
    successRate:
      stats.total > 0
        ? Math.round((stats.successful / stats.total) * 100)
        : 100,
  }));

  // Sort by total usage
  toolBreakdown.sort((a, b) => b.total - a.total);

  return c.json({
    sessionId,
    tools: toolBreakdown,
    total: metrics?.totalToolUses ?? 0,
  });
});

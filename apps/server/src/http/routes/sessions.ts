/**
 * Session routes (GET /sessions, GET /sessions/:id)
 */

import { Hono } from 'hono';
import { sessionStore } from '../../store/sessionStore.js';
import { NotFoundError, ValidationError } from '../middleware/error.js';
import { SERVER_CONFIG } from '../../config/index.js';
import { serializeSession } from '@analytics/shared';

/**
 * Sessions router
 */
export const sessionsRouter = new Hono();

/**
 * GET /sessions - List all sessions with summary metrics
 */
sessionsRouter.get('/', (c) => {
  const limitParam = c.req.query('limit');
  const activeOnlyParam = c.req.query('activeOnly');
  const projectPath = c.req.query('projectPath');

  const limit = limitParam
    ? parseInt(limitParam, 10)
    : SERVER_CONFIG.defaultSessionLimit;

  if (isNaN(limit) || limit < 1) {
    throw new ValidationError('Invalid limit parameter');
  }

  const activeOnly = activeOnlyParam === 'true';

  // Get sessions
  let sessions = activeOnly
    ? sessionStore.getActiveSessions()
    : sessionStore.getAllSessions();

  // Filter by project path if provided
  if (projectPath) {
    sessions = sessions.filter((s) =>
      s.projectPath.toLowerCase().includes(projectPath.toLowerCase())
    );
  }

  // Get metrics for each session
  const sessionsWithSummary = sessions.slice(0, limit).map((session) => {
    const metrics = sessionStore.getSessionMetrics(session.id);
    return {
      id: session.id,
      projectName: session.projectName,
      branch: session.branch,
      startedAt: session.startedAt.toISOString(),
      lastActivityAt: session.lastActivityAt.toISOString(),
      isActive: session.isActive,
      summary: {
        totalTurns: metrics?.totalTurns ?? 0,
        totalTokens: metrics?.totalTokens.total ?? 0,
        totalCost: metrics?.totalCost ?? 0,
      },
    };
  });

  return c.json({
    sessions: sessionsWithSummary,
    total: sessions.length,
  });
});

/**
 * GET /sessions/:id - Get detailed session information
 */
sessionsRouter.get('/:id', (c) => {
  const sessionId = c.req.param('id');
  const session = sessionStore.getSession(sessionId);

  if (!session) {
    throw new NotFoundError('Session', sessionId);
  }

  const metrics = sessionStore.getSessionMetrics(sessionId);
  const turns = sessionStore.getSessionTurns(sessionId);

  return c.json({
    session: serializeSession(session),
    metrics: metrics ?? null,
    turnCount: turns.length,
  });
});

/**
 * GET /sessions/:id/turns - Get turns for a session
 */
sessionsRouter.get('/:id/turns', (c) => {
  const sessionId = c.req.param('id');
  const offsetParam = c.req.query('offset');
  const limitParam = c.req.query('limit');

  const offset = offsetParam ? parseInt(offsetParam, 10) : 0;
  const limit = limitParam
    ? parseInt(limitParam, 10)
    : SERVER_CONFIG.defaultTurnLimit;

  if (isNaN(offset) || offset < 0) {
    throw new ValidationError('Invalid offset parameter');
  }
  if (isNaN(limit) || limit < 1) {
    throw new ValidationError('Invalid limit parameter');
  }

  const session = sessionStore.getSession(sessionId);
  if (!session) {
    throw new NotFoundError('Session', sessionId);
  }

  const allTurns = sessionStore.getSessionTurns(sessionId);
  const allTurnMetrics = sessionStore.getSessionTurnMetrics(sessionId);

  const paginatedTurns = allTurns.slice(offset, offset + limit);
  const paginatedMetrics = allTurnMetrics.slice(offset, offset + limit);

  // Serialize turns (convert dates to strings)
  const serializedTurns = paginatedTurns.map((turn) => ({
    ...turn,
    startedAt: turn.startedAt.toISOString(),
    endedAt: turn.endedAt.toISOString(),
  }));

  // Serialize metrics - ensure all nested objects are properly included
  const serializedMetrics = paginatedMetrics.map((m) => ({
    turnId: m.turnId,
    turnNumber: m.turnNumber,
    timestamp: m.timestamp.toISOString(),
    tokens: m.tokens ? {
      input: m.tokens.input ?? 0,
      output: m.tokens.output ?? 0,
      cacheCreation: m.tokens.cacheCreation ?? 0,
      cacheRead: m.tokens.cacheRead ?? 0,
      total: m.tokens.total ?? 0,
    } : { input: 0, output: 0, cacheCreation: 0, cacheRead: 0, total: 0 },
    cost: m.cost ? {
      input: m.cost.input ?? 0,
      output: m.cost.output ?? 0,
      cacheCreation: m.cost.cacheCreation ?? 0,
      total: m.cost.total ?? 0,
    } : { input: 0, output: 0, cacheCreation: 0, total: 0 },
    durationMs: m.durationMs ?? 0,
    contextUsagePercent: m.contextUsagePercent ?? 0,
    toolCount: m.toolCount ?? 0,
    toolBreakdown: m.toolBreakdown ?? {},
    codeMetrics: m.codeMetrics ? {
      filesCreated: m.codeMetrics.filesCreated ?? 0,
      filesModified: m.codeMetrics.filesModified ?? 0,
      filesDeleted: m.codeMetrics.filesDeleted ?? 0,
      linesAdded: m.codeMetrics.linesAdded ?? 0,
      linesRemoved: m.codeMetrics.linesRemoved ?? 0,
      netLinesChanged: m.codeMetrics.netLinesChanged ?? 0,
    } : { filesCreated: 0, filesModified: 0, filesDeleted: 0, linesAdded: 0, linesRemoved: 0, netLinesChanged: 0 },
  }));

  return c.json({
    turns: serializedTurns,
    metrics: serializedMetrics,
    total: allTurns.length,
    hasMore: offset + limit < allTurns.length,
  });
});

/**
 * GET /sessions/:id/metrics - Get computed metrics for a session
 */
sessionsRouter.get('/:id/metrics', async (c) => {
  const sessionId = c.req.param('id');

  const session = sessionStore.getSession(sessionId);
  if (!session) {
    throw new NotFoundError('Session', sessionId);
  }

  const sessionMetrics = sessionStore.getSessionMetrics(sessionId);
  const turnMetrics = sessionStore.getSessionTurnMetrics(sessionId);

  // Serialize turn metrics - ensure all nested objects are properly spread
  const serializedTurnMetrics = turnMetrics.map((m) => ({
    turnId: m.turnId,
    turnNumber: m.turnNumber,
    timestamp: m.timestamp.toISOString(),
    tokens: m.tokens ? {
      input: m.tokens.input ?? 0,
      output: m.tokens.output ?? 0,
      cacheCreation: m.tokens.cacheCreation ?? 0,
      cacheRead: m.tokens.cacheRead ?? 0,
      total: m.tokens.total ?? 0,
    } : { input: 0, output: 0, cacheCreation: 0, cacheRead: 0, total: 0 },
    cost: m.cost ? {
      input: m.cost.input ?? 0,
      output: m.cost.output ?? 0,
      cacheCreation: m.cost.cacheCreation ?? 0,
      total: m.cost.total ?? 0,
    } : { input: 0, output: 0, cacheCreation: 0, total: 0 },
    durationMs: m.durationMs ?? 0,
    contextUsagePercent: m.contextUsagePercent ?? 0,
    toolCount: m.toolCount ?? 0,
    toolBreakdown: m.toolBreakdown ?? {},
    codeMetrics: m.codeMetrics ? {
      filesCreated: m.codeMetrics.filesCreated ?? 0,
      filesModified: m.codeMetrics.filesModified ?? 0,
      filesDeleted: m.codeMetrics.filesDeleted ?? 0,
      linesAdded: m.codeMetrics.linesAdded ?? 0,
      linesRemoved: m.codeMetrics.linesRemoved ?? 0,
      netLinesChanged: m.codeMetrics.netLinesChanged ?? 0,
    } : { filesCreated: 0, filesModified: 0, filesDeleted: 0, linesAdded: 0, linesRemoved: 0, netLinesChanged: 0 },
  }));

  // Debug log to verify data before sending (enable with DEBUG_TOKEN_USAGE=1)
  if (process.env.DEBUG_TOKEN_USAGE && serializedTurnMetrics.length > 0) {
    console.log(`[GET /metrics] Session ${sessionId}: ${serializedTurnMetrics.length} turn metrics`);
    console.log(`[GET /metrics] First turn tokens:`, serializedTurnMetrics[0]?.tokens);
    console.log(`[GET /metrics] First turn cost:`, serializedTurnMetrics[0]?.cost);
  }

  // Calculate efficiency components
  const turns = sessionStore.getSessionTurns(sessionId);
  let efficiency = null;

  if (sessionMetrics) {
    const { calculateEfficiencyComponents } = await import(
      '../../metrics/efficiencyScore.js'
    );
    efficiency = calculateEfficiencyComponents(
      turns,
      sessionMetrics.totalTokens,
      sessionMetrics.totalCodeChanges
    );
  }

  return c.json({
    sessionMetrics: sessionMetrics ?? null,
    turnMetrics: serializedTurnMetrics,
    efficiency,
  });
});

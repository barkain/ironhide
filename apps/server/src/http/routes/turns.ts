/**
 * Turn routes (GET /sessions/:id/turns, GET /turns/:id)
 */

import { Hono } from 'hono';
import { sessionStore } from '../../store/sessionStore.js';
import { NotFoundError } from '../middleware/error.js';

/**
 * Turns router
 */
export const turnsRouter = new Hono();

/**
 * GET /turns/:id - Get detailed turn information
 */
turnsRouter.get('/:id', (c) => {
  const turnId = c.req.param('id');
  const turn = sessionStore.getTurn(turnId);

  if (!turn) {
    throw new NotFoundError('Turn', turnId);
  }

  const metrics = sessionStore.getTurnMetrics(turnId);

  // Serialize dates
  const serializedTurn = {
    ...turn,
    startedAt: turn.startedAt.toISOString(),
    endedAt: turn.endedAt.toISOString(),
  };

  const serializedMetrics = metrics
    ? {
        ...metrics,
        timestamp: metrics.timestamp.toISOString(),
      }
    : null;

  return c.json({
    turn: serializedTurn,
    metrics: serializedMetrics,
    codeChanges: turn.codeChanges,
  });
});

/**
 * GET /turns/:id/tools - Get tool uses for a turn
 */
turnsRouter.get('/:id/tools', (c) => {
  const turnId = c.req.param('id');
  const turn = sessionStore.getTurn(turnId);

  if (!turn) {
    throw new NotFoundError('Turn', turnId);
  }

  return c.json({
    turnId: turn.id,
    tools: turn.toolUses,
    total: turn.toolUses.length,
  });
});

/**
 * GET /turns/:id/code-changes - Get code changes for a turn
 */
turnsRouter.get('/:id/code-changes', (c) => {
  const turnId = c.req.param('id');
  const turn = sessionStore.getTurn(turnId);

  if (!turn) {
    throw new NotFoundError('Turn', turnId);
  }

  // Aggregate changes by extension
  const byExtension: Record<string, { added: number; removed: number }> = {};
  for (const change of turn.codeChanges) {
    const ext = change.extension || 'unknown';
    if (!byExtension[ext]) {
      byExtension[ext] = { added: 0, removed: 0 };
    }
    byExtension[ext].added += change.linesAdded;
    byExtension[ext].removed += change.linesRemoved;
  }

  return c.json({
    turnId: turn.id,
    changes: turn.codeChanges,
    total: turn.codeChanges.length,
    summary: {
      linesAdded: turn.codeChanges.reduce((sum, c) => sum + c.linesAdded, 0),
      linesRemoved: turn.codeChanges.reduce((sum, c) => sum + c.linesRemoved, 0),
      byExtension,
    },
  });
});

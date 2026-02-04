/**
 * In-memory session store with event emission
 */

import type {
  Session,
  Turn,
  SessionMetrics,
  TurnMetrics,
  TokenUsage,
  CodeMetrics,
} from '@analytics/shared';
import {
  calculateTokenCost,
  calculateContextUsage,
  calculateCacheHitRate,
  calculateTotalTokens,
  createEmptyCodeMetrics,
  createEmptyTokenMetrics,
  createEmptyCostMetrics,
} from '@analytics/shared';
import { storeEventEmitter } from './eventEmitter.js';
import { SERVER_CONFIG } from '../config/index.js';

/**
 * Internal tracking for incremental metrics calculation
 */
interface IncrementalMetricsState {
  /** Running sum of context usage for average calculation */
  totalContextUsage: number;
  /** Count of successful tool uses for efficiency calculation */
  successfulToolUses: number;
}

/**
 * Session data with associated turns and metrics
 */
interface SessionData {
  session: Session;
  turns: Map<string, Turn>;
  turnMetrics: Map<string, TurnMetrics>;
  sessionMetrics: SessionMetrics;
  filePath: string;
  /** Internal state for incremental metrics updates */
  incrementalState: IncrementalMetricsState;
}

/**
 * In-memory session store
 */
class SessionStore {
  private sessions: Map<string, SessionData> = new Map();
  private turnToSession: Map<string, string> = new Map();
  private fileToSession: Map<string, string> = new Map();
  private currentSessionId: string | null = null;

  /**
   * Get all sessions
   */
  getAllSessions(): Session[] {
    return Array.from(this.sessions.values())
      .map((data) => data.session)
      .sort((a, b) => b.lastActivityAt.getTime() - a.lastActivityAt.getTime());
  }

  /**
   * Get session by ID
   */
  getSession(sessionId: string): Session | undefined {
    return this.sessions.get(sessionId)?.session;
  }

  /**
   * Get session data (session + turns + metrics)
   */
  getSessionData(sessionId: string): SessionData | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Get or create session for a file
   */
  getOrCreateSession(
    sessionId: string,
    filePath: string,
    initialData: Partial<Session>
  ): Session {
    let data = this.sessions.get(sessionId);

    if (!data) {
      const now = new Date();
      const session: Session = {
        id: sessionId,
        projectPath: initialData.projectPath ?? '',
        projectName: initialData.projectName ?? 'Unknown Project',
        branch: initialData.branch ?? null,
        startedAt: initialData.startedAt ?? now,
        lastActivityAt: initialData.lastActivityAt ?? now,
        model: initialData.model ?? 'unknown',
        turnCount: 0,
        isActive: true,
      };

      data = {
        session,
        turns: new Map(),
        turnMetrics: new Map(),
        sessionMetrics: this.createEmptySessionMetrics(sessionId),
        filePath,
        incrementalState: {
          totalContextUsage: 0,
          successfulToolUses: 0,
        },
      };

      this.sessions.set(sessionId, data);
      this.fileToSession.set(filePath, sessionId);

      storeEventEmitter.emit('session:created', { session });
    }

    return data.session;
  }

  /**
   * Update session
   */
  updateSession(sessionId: string, updates: Partial<Session>): Session | undefined {
    const data = this.sessions.get(sessionId);
    if (!data) return undefined;

    Object.assign(data.session, updates);

    // Update active status based on last activity
    const timeSinceActivity = Date.now() - data.session.lastActivityAt.getTime();
    data.session.isActive = timeSinceActivity < SERVER_CONFIG.sessionActiveTimeout;

    storeEventEmitter.emit('session:updated', { session: data.session });
    return data.session;
  }

  /**
   * Add or update a turn
   */
  upsertTurn(turn: Turn, metrics: TurnMetrics): void {
    const data = this.sessions.get(turn.sessionId);
    if (!data) return;

    const isNew = !data.turns.has(turn.id);
    const oldTurn = isNew ? null : (data.turns.get(turn.id) ?? null);
    const oldMetrics = isNew ? null : (data.turnMetrics.get(turn.id) ?? null);

    data.turns.set(turn.id, turn);
    data.turnMetrics.set(turn.id, metrics);
    this.turnToSession.set(turn.id, turn.sessionId);

    // Update session
    data.session.turnCount = data.turns.size;
    data.session.lastActivityAt = turn.endedAt;
    data.session.isActive = true;

    // Use incremental update instead of full recalculation
    this.updateSessionMetricsIncremental(
      turn.sessionId,
      turn,
      metrics,
      isNew,
      oldTurn,
      oldMetrics
    );

    if (isNew) {
      storeEventEmitter.emit('turn:created', { turn, metrics });
    } else {
      storeEventEmitter.emit('turn:updated', { turn, metrics });
    }

    storeEventEmitter.emit('session:updated', { session: data.session });
  }

  /**
   * Mark turn as completed
   */
  completeTurn(turnId: string): void {
    const sessionId = this.turnToSession.get(turnId);
    if (!sessionId) return;

    const data = this.sessions.get(sessionId);
    if (!data) return;

    const turn = data.turns.get(turnId);
    const metrics = data.turnMetrics.get(turnId);
    if (!turn || !metrics) return;

    storeEventEmitter.emit('turn:completed', { turn, metrics });
  }

  /**
   * Get turn by ID
   */
  getTurn(turnId: string): Turn | undefined {
    const sessionId = this.turnToSession.get(turnId);
    if (!sessionId) return undefined;

    return this.sessions.get(sessionId)?.turns.get(turnId);
  }

  /**
   * Get turn metrics by ID
   */
  getTurnMetrics(turnId: string): TurnMetrics | undefined {
    const sessionId = this.turnToSession.get(turnId);
    if (!sessionId) return undefined;

    return this.sessions.get(sessionId)?.turnMetrics.get(turnId);
  }

  /**
   * Get all turns for a session
   */
  getSessionTurns(sessionId: string): Turn[] {
    const data = this.sessions.get(sessionId);
    if (!data) return [];

    return Array.from(data.turns.values()).sort(
      (a, b) => a.startedAt.getTime() - b.startedAt.getTime()
    );
  }

  /**
   * Get all turn metrics for a session
   */
  getSessionTurnMetrics(sessionId: string): TurnMetrics[] {
    const data = this.sessions.get(sessionId);
    if (!data) return [];

    return Array.from(data.turnMetrics.values()).sort(
      (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
    );
  }

  /**
   * Get session metrics
   */
  getSessionMetrics(sessionId: string): SessionMetrics | undefined {
    return this.sessions.get(sessionId)?.sessionMetrics;
  }

  /**
   * Get session ID by file path
   */
  getSessionIdByFile(filePath: string): string | undefined {
    return this.fileToSession.get(filePath);
  }

  /**
   * Set current session (most recently active)
   */
  setCurrentSession(sessionId: string): void {
    this.currentSessionId = sessionId;
  }

  /**
   * Get current session ID
   */
  getCurrentSessionId(): string | null {
    return this.currentSessionId;
  }

  /**
   * Get current session
   */
  getCurrentSession(): Session | undefined {
    if (!this.currentSessionId) return undefined;
    return this.getSession(this.currentSessionId);
  }

  /**
   * Delete session
   */
  deleteSession(sessionId: string): boolean {
    const data = this.sessions.get(sessionId);
    if (!data) return false;

    // Clean up mappings
    for (const turnId of data.turns.keys()) {
      this.turnToSession.delete(turnId);
    }
    this.fileToSession.delete(data.filePath);

    // Clear current if needed
    if (this.currentSessionId === sessionId) {
      this.currentSessionId = null;
    }

    this.sessions.delete(sessionId);
    storeEventEmitter.emit('session:deleted', { sessionId });
    return true;
  }

  /**
   * Incrementally update session metrics when a turn is added or updated.
   * This is O(1) instead of O(n) for the full recalculation.
   */
  private updateSessionMetricsIncremental(
    sessionId: string,
    turn: Turn,
    metrics: TurnMetrics,
    isNew: boolean,
    oldTurn: Turn | null,
    oldMetrics: TurnMetrics | null
  ): void {
    const data = this.sessions.get(sessionId);
    if (!data) return;

    const sessionMetrics = data.sessionMetrics;

    const state = data.incrementalState;

    // For updates, we need to subtract old values first
    if (!isNew && oldTurn && oldMetrics) {
      // Subtract old token values
      sessionMetrics.totalTokens.input -= oldTurn.usage.input_tokens;
      sessionMetrics.totalTokens.output -= oldTurn.usage.output_tokens;
      sessionMetrics.totalTokens.cacheCreation -= oldTurn.usage.cache_creation_input_tokens;
      sessionMetrics.totalTokens.cacheRead -= oldTurn.usage.cache_read_input_tokens;

      // Subtract old cost values
      sessionMetrics.costBreakdown.input -= oldMetrics.cost.input;
      sessionMetrics.costBreakdown.output -= oldMetrics.cost.output;
      sessionMetrics.costBreakdown.cacheCreation -= oldMetrics.cost.cacheCreation;
      sessionMetrics.totalCost -= oldMetrics.cost.total;

      // Subtract old duration
      sessionMetrics.totalDurationMs -= oldTurn.durationMs;

      // Subtract old context usage from running total
      state.totalContextUsage -= oldMetrics.contextUsagePercent;

      // Subtract old tool uses and successful tool tracking
      sessionMetrics.totalToolUses -= oldTurn.toolUses.length;
      for (const tool of oldTurn.toolUses) {
        if (sessionMetrics.toolBreakdown[tool.name]) {
          sessionMetrics.toolBreakdown[tool.name]--;
          if (sessionMetrics.toolBreakdown[tool.name] <= 0) {
            delete sessionMetrics.toolBreakdown[tool.name];
          }
        }
        // Track successful tools
        if (!tool.isError) {
          state.successfulToolUses--;
        }
      }

      // Subtract old code changes
      for (const change of oldTurn.codeChanges) {
        if (change.type === 'create') sessionMetrics.totalCodeChanges.filesCreated--;
        else if (change.type === 'modify') sessionMetrics.totalCodeChanges.filesModified--;
        else if (change.type === 'delete') sessionMetrics.totalCodeChanges.filesDeleted--;
        sessionMetrics.totalCodeChanges.linesAdded -= change.linesAdded;
        sessionMetrics.totalCodeChanges.linesRemoved -= change.linesRemoved;
      }
    }

    // Add new token values
    sessionMetrics.totalTokens.input += turn.usage.input_tokens;
    sessionMetrics.totalTokens.output += turn.usage.output_tokens;
    sessionMetrics.totalTokens.cacheCreation += turn.usage.cache_creation_input_tokens;
    sessionMetrics.totalTokens.cacheRead += turn.usage.cache_read_input_tokens;

    // Recalculate total tokens
    sessionMetrics.totalTokens.total = calculateTotalTokens({
      input_tokens: sessionMetrics.totalTokens.input,
      output_tokens: sessionMetrics.totalTokens.output,
      cache_creation_input_tokens: sessionMetrics.totalTokens.cacheCreation,
      cache_read_input_tokens: sessionMetrics.totalTokens.cacheRead,
    });

    // Add new cost values
    sessionMetrics.costBreakdown.input += metrics.cost.input;
    sessionMetrics.costBreakdown.output += metrics.cost.output;
    sessionMetrics.costBreakdown.cacheCreation += metrics.cost.cacheCreation;
    sessionMetrics.totalCost += metrics.cost.total;

    // Add new duration
    sessionMetrics.totalDurationMs += turn.durationMs;

    // Add new tool uses and track successful tools
    sessionMetrics.totalToolUses += turn.toolUses.length;
    for (const tool of turn.toolUses) {
      sessionMetrics.toolBreakdown[tool.name] = (sessionMetrics.toolBreakdown[tool.name] ?? 0) + 1;
      if (!tool.isError) {
        state.successfulToolUses++;
      }
    }

    // Add new code changes
    for (const change of turn.codeChanges) {
      if (change.type === 'create') sessionMetrics.totalCodeChanges.filesCreated++;
      else if (change.type === 'modify') sessionMetrics.totalCodeChanges.filesModified++;
      else if (change.type === 'delete') sessionMetrics.totalCodeChanges.filesDeleted++;
      sessionMetrics.totalCodeChanges.linesAdded += change.linesAdded;
      sessionMetrics.totalCodeChanges.linesRemoved += change.linesRemoved;
    }

    // Update net lines changed
    sessionMetrics.totalCodeChanges.netLinesChanged =
      sessionMetrics.totalCodeChanges.linesAdded - sessionMetrics.totalCodeChanges.linesRemoved;

    // Update turn count
    if (isNew) {
      sessionMetrics.totalTurns++;
    }

    // Update peaks (only need to check new values, peaks can only increase)
    if (metrics.tokens.total > sessionMetrics.peaks.maxTokensInTurn) {
      sessionMetrics.peaks.maxTokensInTurn = metrics.tokens.total;
    }
    if (metrics.cost.total > sessionMetrics.peaks.maxCostInTurn) {
      sessionMetrics.peaks.maxCostInTurn = metrics.cost.total;
    }
    if (metrics.durationMs > sessionMetrics.peaks.maxDurationMs) {
      sessionMetrics.peaks.maxDurationMs = metrics.durationMs;
    }
    if (metrics.contextUsagePercent > sessionMetrics.peaks.maxContextUsagePercent) {
      sessionMetrics.peaks.maxContextUsagePercent = metrics.contextUsagePercent;
    }

    // Add context usage to running total
    state.totalContextUsage += metrics.contextUsagePercent;

    // Recalculate averages
    const numTurns = sessionMetrics.totalTurns;
    if (numTurns > 0) {
      sessionMetrics.averages.tokensPerTurn = sessionMetrics.totalTokens.total / numTurns;
      sessionMetrics.averages.costPerTurn = sessionMetrics.totalCost / numTurns;
      sessionMetrics.averages.durationMsPerTurn = sessionMetrics.totalDurationMs / numTurns;
      sessionMetrics.averages.contextUsagePercent = state.totalContextUsage / numTurns;
    }

    // Recalculate cache hit rate
    const totalCacheTokens =
      sessionMetrics.totalTokens.cacheCreation + sessionMetrics.totalTokens.cacheRead;
    sessionMetrics.cacheHitRate =
      totalCacheTokens > 0
        ? (sessionMetrics.totalTokens.cacheRead / totalCacheTokens) * 100
        : 0;

    // Recalculate efficiency score using tracked successful tool count
    sessionMetrics.efficiencyScore = this.calculateEfficiencyScoreIncremental(
      sessionMetrics,
      state.successfulToolUses
    );

    storeEventEmitter.emit('metrics:updated', {
      sessionId,
      metrics: sessionMetrics,
    });
  }

  /**
   * Calculate efficiency score using pre-tracked metrics (O(1) operation)
   */
  private calculateEfficiencyScoreIncremental(
    sessionMetrics: SessionMetrics,
    successfulToolUses: number
  ): number {
    // Cache utilization (30% weight)
    const cacheUtilization = Math.min(sessionMetrics.cacheHitRate, 100);

    // Code output ratio (25% weight)
    const totalLinesChanged =
      Math.abs(sessionMetrics.totalCodeChanges.linesAdded) +
      Math.abs(sessionMetrics.totalCodeChanges.linesRemoved);
    const codeOutputRatio =
      sessionMetrics.totalTokens.total > 0
        ? (totalLinesChanged / sessionMetrics.totalTokens.total) * 1000
        : 0;
    const normalizedCodeRatio = Math.min((codeOutputRatio / 50) * 100, 100);

    // Tool success rate (25% weight) - using tracked successful count
    const totalTools = sessionMetrics.totalToolUses;
    const toolSuccessRate = totalTools > 0 ? (successfulToolUses / totalTools) * 100 : 100;

    // Context efficiency (20% weight)
    const contextEfficiency =
      sessionMetrics.totalTokens.input > 0
        ? Math.min((sessionMetrics.totalTokens.output / sessionMetrics.totalTokens.input) * 100, 100)
        : 50;

    // Composite score
    const compositeScore =
      cacheUtilization * 0.3 +
      normalizedCodeRatio * 0.25 +
      toolSuccessRate * 0.25 +
      contextEfficiency * 0.2;

    return Math.round(compositeScore * 100) / 100;
  }

  /**
   * Recalculate session metrics from turns (full recalculation)
   * Used for: session initialization, turn deletion, explicit refresh
   */
  recalculateSessionMetrics(sessionId: string): void {
    const data = this.sessions.get(sessionId);
    if (!data) return;

    const turns = Array.from(data.turns.values());
    const turnMetrics = Array.from(data.turnMetrics.values());

    if (turns.length === 0) {
      data.sessionMetrics = this.createEmptySessionMetrics(sessionId);
      // Reset incremental state
      data.incrementalState = {
        totalContextUsage: 0,
        successfulToolUses: 0,
      };
      return;
    }

    // Aggregate tokens
    const totalTokens = {
      input: 0,
      output: 0,
      cacheCreation: 0,
      cacheRead: 0,
      total: 0,
    };

    const costBreakdown = {
      input: 0,
      output: 0,
      cacheCreation: 0,
    };

    const totalCodeChanges = createEmptyCodeMetrics();
    const toolBreakdown: Record<string, number> = {};

    let totalDurationMs = 0;
    let totalCost = 0;
    let totalToolUses = 0;
    let totalContextUsage = 0;
    let successfulToolUses = 0;

    let maxTokensInTurn = 0;
    let maxCostInTurn = 0;
    let maxDurationMs = 0;
    let maxContextUsagePercent = 0;

    for (const turn of turns) {
      totalTokens.input += turn.usage.input_tokens;
      totalTokens.output += turn.usage.output_tokens;
      totalTokens.cacheCreation += turn.usage.cache_creation_input_tokens;
      totalTokens.cacheRead += turn.usage.cache_read_input_tokens;

      totalDurationMs += turn.durationMs;
      totalToolUses += turn.toolUses.length;

      // Tool breakdown and success tracking
      for (const tool of turn.toolUses) {
        toolBreakdown[tool.name] = (toolBreakdown[tool.name] ?? 0) + 1;
        if (!tool.isError) {
          successfulToolUses++;
        }
      }

      // Code changes
      for (const change of turn.codeChanges) {
        if (change.type === 'create') totalCodeChanges.filesCreated++;
        else if (change.type === 'modify') totalCodeChanges.filesModified++;
        else if (change.type === 'delete') totalCodeChanges.filesDeleted++;
        totalCodeChanges.linesAdded += change.linesAdded;
        totalCodeChanges.linesRemoved += change.linesRemoved;
      }
    }

    totalTokens.total = calculateTotalTokens({
      input_tokens: totalTokens.input,
      output_tokens: totalTokens.output,
      cache_creation_input_tokens: totalTokens.cacheCreation,
      cache_read_input_tokens: totalTokens.cacheRead,
    });

    totalCodeChanges.netLinesChanged =
      totalCodeChanges.linesAdded - totalCodeChanges.linesRemoved;

    // Calculate costs and peaks from turn metrics
    for (const metrics of turnMetrics) {
      costBreakdown.input += metrics.cost.input;
      costBreakdown.output += metrics.cost.output;
      costBreakdown.cacheCreation += metrics.cost.cacheCreation;
      totalCost += metrics.cost.total;
      totalContextUsage += metrics.contextUsagePercent;

      if (metrics.tokens.total > maxTokensInTurn) {
        maxTokensInTurn = metrics.tokens.total;
      }
      if (metrics.cost.total > maxCostInTurn) {
        maxCostInTurn = metrics.cost.total;
      }
      if (metrics.durationMs > maxDurationMs) {
        maxDurationMs = metrics.durationMs;
      }
      if (metrics.contextUsagePercent > maxContextUsagePercent) {
        maxContextUsagePercent = metrics.contextUsagePercent;
      }
    }

    // Calculate averages
    const numTurns = turns.length;
    const averages = {
      tokensPerTurn: totalTokens.total / numTurns,
      costPerTurn: totalCost / numTurns,
      durationMsPerTurn: totalDurationMs / numTurns,
      contextUsagePercent: totalContextUsage / numTurns,
    };

    // Calculate cache hit rate
    const totalCacheTokens = totalTokens.cacheCreation + totalTokens.cacheRead;
    const cacheHitRate =
      totalCacheTokens > 0
        ? (totalTokens.cacheRead / totalCacheTokens) * 100
        : 0;

    // Calculate efficiency score
    const efficiencyScore = this.calculateEfficiencyScore(
      turns,
      totalTokens,
      totalCodeChanges,
      cacheHitRate
    );

    data.sessionMetrics = {
      sessionId,
      totalTurns: numTurns,
      totalDurationMs,
      totalTokens,
      totalCost,
      costBreakdown,
      averages,
      peaks: {
        maxTokensInTurn,
        maxCostInTurn,
        maxDurationMs,
        maxContextUsagePercent,
      },
      totalCodeChanges,
      totalToolUses,
      toolBreakdown,
      efficiencyScore,
      cacheHitRate,
    };

    // Sync incremental state after full recalculation
    data.incrementalState = {
      totalContextUsage,
      successfulToolUses,
    };

    storeEventEmitter.emit('metrics:updated', {
      sessionId,
      metrics: data.sessionMetrics,
    });
  }

  /**
   * Calculate efficiency score composite
   */
  private calculateEfficiencyScore(
    turns: Turn[],
    totalTokens: { input: number; output: number; cacheCreation: number; cacheRead: number; total: number },
    codeChanges: CodeMetrics,
    cacheHitRate: number
  ): number {
    // Cache utilization (30% weight)
    const cacheUtilization = Math.min(cacheHitRate, 100);

    // Code output ratio (25% weight) - lines changed per 1000 tokens
    const totalLinesChanged =
      Math.abs(codeChanges.linesAdded) + Math.abs(codeChanges.linesRemoved);
    const codeOutputRatio =
      totalTokens.total > 0
        ? (totalLinesChanged / totalTokens.total) * 1000
        : 0;
    // Normalize to 0-100 scale (assuming 50 lines per 1000 tokens is excellent)
    const normalizedCodeRatio = Math.min((codeOutputRatio / 50) * 100, 100);

    // Tool success rate (25% weight)
    let totalTools = 0;
    let successfulTools = 0;
    for (const turn of turns) {
      for (const tool of turn.toolUses) {
        totalTools++;
        if (!tool.isError) successfulTools++;
      }
    }
    const toolSuccessRate = totalTools > 0 ? (successfulTools / totalTools) * 100 : 100;

    // Context efficiency (20% weight) - output tokens / input tokens ratio
    const contextEfficiency =
      totalTokens.input > 0
        ? Math.min((totalTokens.output / totalTokens.input) * 100, 100)
        : 50;

    // Composite score
    const compositeScore =
      cacheUtilization * 0.3 +
      normalizedCodeRatio * 0.25 +
      toolSuccessRate * 0.25 +
      contextEfficiency * 0.2;

    return Math.round(compositeScore * 100) / 100;
  }

  /**
   * Create empty session metrics
   */
  private createEmptySessionMetrics(sessionId: string): SessionMetrics {
    return {
      sessionId,
      totalTurns: 0,
      totalDurationMs: 0,
      totalTokens: createEmptyTokenMetrics(),
      totalCost: 0,
      costBreakdown: { input: 0, output: 0, cacheCreation: 0, cacheRead: 0 },
      averages: {
        tokensPerTurn: 0,
        costPerTurn: 0,
        durationMsPerTurn: 0,
        contextUsagePercent: 0,
      },
      peaks: {
        maxTokensInTurn: 0,
        maxCostInTurn: 0,
        maxDurationMs: 0,
        maxContextUsagePercent: 0,
      },
      totalCodeChanges: createEmptyCodeMetrics(),
      totalToolUses: 0,
      toolBreakdown: {},
      efficiencyScore: 0,
      cacheHitRate: 0,
    };
  }

  /**
   * Get active sessions
   */
  getActiveSessions(): Session[] {
    const now = Date.now();
    return this.getAllSessions().filter((session) => {
      const timeSinceActivity = now - session.lastActivityAt.getTime();
      return timeSinceActivity < SERVER_CONFIG.sessionActiveTimeout;
    });
  }

  /**
   * Get session count
   */
  getSessionCount(): number {
    return this.sessions.size;
  }

  /**
   * Clear all sessions
   */
  clear(): void {
    this.sessions.clear();
    this.turnToSession.clear();
    this.fileToSession.clear();
    this.currentSessionId = null;
  }
}

/**
 * Singleton store instance
 */
export const sessionStore = new SessionStore();

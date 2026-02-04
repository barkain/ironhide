/**
 * Tests for metrics schema validation
 */

import { describe, test, expect } from 'bun:test';
import {
  CostMetricsSchema,
  TokenMetricsSchema,
  CostBreakdownSchema,
  SessionMetricsSchema,
  createEmptyTokenMetrics,
  createEmptyCostMetrics,
  createEmptyCodeMetrics,
} from './metricsSchema.js';

describe('CostMetricsSchema', () => {
  test('should require all 4 cost components', () => {
    const validCost = {
      input: 0.01,
      output: 0.02,
      cacheCreation: 0.005,
      cacheRead: 0.001,
      total: 0.036,
    };

    const result = CostMetricsSchema.safeParse(validCost);
    expect(result.success).toBe(true);
  });

  test('should fail if cacheRead is missing', () => {
    const invalidCost = {
      input: 0.01,
      output: 0.02,
      cacheCreation: 0.005,
      // cacheRead missing
      total: 0.036,
    };

    const result = CostMetricsSchema.safeParse(invalidCost);
    expect(result.success).toBe(false);
  });

  test('should reject negative values', () => {
    const invalidCost = {
      input: -0.01,
      output: 0.02,
      cacheCreation: 0.005,
      cacheRead: 0.001,
      total: 0.036,
    };

    const result = CostMetricsSchema.safeParse(invalidCost);
    expect(result.success).toBe(false);
  });
});

describe('TokenMetricsSchema', () => {
  test('should require all 4 token components', () => {
    const validTokens = {
      input: 1000,
      output: 500,
      cacheCreation: 200,
      cacheRead: 300,
      total: 2000,
    };

    const result = TokenMetricsSchema.safeParse(validTokens);
    expect(result.success).toBe(true);
  });

  test('should fail if cacheRead is missing', () => {
    const invalidTokens = {
      input: 1000,
      output: 500,
      cacheCreation: 200,
      // cacheRead missing
      total: 1700,
    };

    const result = TokenMetricsSchema.safeParse(invalidTokens);
    expect(result.success).toBe(false);
  });

  test('should require integers', () => {
    const invalidTokens = {
      input: 1000.5,
      output: 500,
      cacheCreation: 200,
      cacheRead: 300,
      total: 2000.5,
    };

    const result = TokenMetricsSchema.safeParse(invalidTokens);
    expect(result.success).toBe(false);
  });
});

describe('CostBreakdownSchema', () => {
  test('should include all 4 cost components', () => {
    const validBreakdown = {
      input: 0.01,
      output: 0.02,
      cacheCreation: 0.005,
      cacheRead: 0.001,
      total: 0.036,
    };

    const result = CostBreakdownSchema.safeParse(validBreakdown);
    expect(result.success).toBe(true);
  });

  test('should fail if cacheRead is missing', () => {
    const invalidBreakdown = {
      input: 0.01,
      output: 0.02,
      cacheCreation: 0.005,
      // cacheRead missing
      total: 0.035,
    };

    const result = CostBreakdownSchema.safeParse(invalidBreakdown);
    expect(result.success).toBe(false);
  });
});

describe('SessionMetricsSchema costBreakdown', () => {
  test('should require cacheRead in costBreakdown', () => {
    const validSessionMetrics = {
      sessionId: 'test-session',
      totalTurns: 5,
      totalDurationMs: 10000,
      totalTokens: {
        input: 5000,
        output: 2500,
        cacheCreation: 1000,
        cacheRead: 1500,
        total: 10000,
      },
      totalCost: 0.5,
      costBreakdown: {
        input: 0.2,
        output: 0.25,
        cacheCreation: 0.04,
        cacheRead: 0.01,
      },
      averages: {
        tokensPerTurn: 2000,
        costPerTurn: 0.1,
        durationMsPerTurn: 2000,
        contextUsagePercent: 50,
      },
      peaks: {
        maxTokensInTurn: 3000,
        maxCostInTurn: 0.15,
        maxDurationMs: 3000,
        maxContextUsagePercent: 75,
      },
      totalCodeChanges: {
        filesCreated: 2,
        filesModified: 3,
        filesDeleted: 1,
        linesAdded: 100,
        linesRemoved: 50,
        netLinesChanged: 50,
      },
      totalToolUses: 15,
      toolBreakdown: { Read: 5, Write: 10 },
      efficiencyScore: 75,
      cacheHitRate: 60,
    };

    const result = SessionMetricsSchema.safeParse(validSessionMetrics);
    expect(result.success).toBe(true);
  });

  test('should fail if cacheRead is missing from costBreakdown', () => {
    const invalidSessionMetrics = {
      sessionId: 'test-session',
      totalTurns: 5,
      totalDurationMs: 10000,
      totalTokens: {
        input: 5000,
        output: 2500,
        cacheCreation: 1000,
        cacheRead: 1500,
        total: 10000,
      },
      totalCost: 0.5,
      costBreakdown: {
        input: 0.2,
        output: 0.25,
        cacheCreation: 0.04,
        // cacheRead missing!
      },
      averages: {
        tokensPerTurn: 2000,
        costPerTurn: 0.1,
        durationMsPerTurn: 2000,
        contextUsagePercent: 50,
      },
      peaks: {
        maxTokensInTurn: 3000,
        maxCostInTurn: 0.15,
        maxDurationMs: 3000,
        maxContextUsagePercent: 75,
      },
      totalCodeChanges: {
        filesCreated: 2,
        filesModified: 3,
        filesDeleted: 1,
        linesAdded: 100,
        linesRemoved: 50,
        netLinesChanged: 50,
      },
      totalToolUses: 15,
      toolBreakdown: { Read: 5, Write: 10 },
      efficiencyScore: 75,
      cacheHitRate: 60,
    };

    const result = SessionMetricsSchema.safeParse(invalidSessionMetrics);
    expect(result.success).toBe(false);
  });
});

describe('createEmptyTokenMetrics', () => {
  test('should include cacheRead field set to 0', () => {
    const empty = createEmptyTokenMetrics();

    expect(empty).toEqual({
      input: 0,
      output: 0,
      cacheCreation: 0,
      cacheRead: 0,
      total: 0,
    });
  });
});

describe('createEmptyCostMetrics', () => {
  test('should include cacheRead field set to 0', () => {
    const empty = createEmptyCostMetrics();

    expect(empty).toEqual({
      input: 0,
      output: 0,
      cacheCreation: 0,
      cacheRead: 0,
      total: 0,
    });
  });
});

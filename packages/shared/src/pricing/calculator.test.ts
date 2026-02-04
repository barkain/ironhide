/**
 * Tests for cost calculation functions
 */

import { describe, test, expect } from 'bun:test';
import {
  calculateTokenCost,
  calculateContextUsage,
  calculateCacheHitRate,
  calculateTotalTokens,
  aggregateCosts,
} from './calculator.js';
import type { TokenUsage } from '../types/jsonl.js';
import type { CostBreakdown } from '../types/metrics.js';

describe('calculateTokenCost', () => {
  test('should calculate all 4 cost components for Opus 4.5', () => {
    const usage: TokenUsage = {
      input_tokens: 1000,
      output_tokens: 500,
      cache_creation_input_tokens: 200,
      cache_read_input_tokens: 300,
    };

    const result = calculateTokenCost(usage, 'claude-opus-4-5-20251101');

    // Verify all 4 fields are present
    expect(result).toHaveProperty('input');
    expect(result).toHaveProperty('output');
    expect(result).toHaveProperty('cacheCreation');
    expect(result).toHaveProperty('cacheRead');
    expect(result).toHaveProperty('total');

    // Calculate expected costs (prices are per million tokens)
    // Opus 4.5: input=$5.00/M, output=$25.00/M, cacheCreation=$6.25/M, cacheRead=$0.50/M
    const expectedInput = (1000 / 1_000_000) * 5.0; // 0.000005
    const expectedOutput = (500 / 1_000_000) * 25.0; // 0.0000125
    const expectedCacheCreation = (200 / 1_000_000) * 6.25; // 0.00000125
    const expectedCacheRead = (300 / 1_000_000) * 0.5; // 0.00000015

    // Verify calculations (with floating point tolerance)
    expect(result.input).toBeCloseTo(expectedInput, 8);
    expect(result.output).toBeCloseTo(expectedOutput, 8);
    expect(result.cacheCreation).toBeCloseTo(expectedCacheCreation, 8);
    expect(result.cacheRead).toBeCloseTo(expectedCacheRead, 8);

    // Verify total is sum of all components
    const expectedTotal = expectedInput + expectedOutput + expectedCacheCreation + expectedCacheRead;
    expect(result.total).toBeCloseTo(expectedTotal, 8);
  });

  test('should handle zero cache read tokens', () => {
    const usage: TokenUsage = {
      input_tokens: 1000,
      output_tokens: 500,
      cache_creation_input_tokens: 200,
      cache_read_input_tokens: 0,
    };

    const result = calculateTokenCost(usage, 'claude-opus-4-5-20251101');

    expect(result.cacheRead).toBe(0);
    expect(result.total).toBeCloseTo(result.input + result.output + result.cacheCreation, 6);
  });

  test('should handle all zero tokens', () => {
    const usage: TokenUsage = {
      input_tokens: 0,
      output_tokens: 0,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
    };

    const result = calculateTokenCost(usage, 'claude-opus-4-5-20251101');

    expect(result.input).toBe(0);
    expect(result.output).toBe(0);
    expect(result.cacheCreation).toBe(0);
    expect(result.cacheRead).toBe(0);
    expect(result.total).toBe(0);
  });

  test('should use default pricing for unknown model', () => {
    const usage: TokenUsage = {
      input_tokens: 1000,
      output_tokens: 500,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
    };

    const result = calculateTokenCost(usage, 'unknown-model');

    // Should still return valid cost (using default model pricing)
    expect(result.input).toBeGreaterThan(0);
    expect(result.output).toBeGreaterThan(0);
    expect(result.total).toBeGreaterThan(0);
  });

  test('should calculate cacheRead cost correctly relative to input cost', () => {
    // cacheRead is 10% of input price (0.5 vs 5.0 for Opus)
    const usage: TokenUsage = {
      input_tokens: 1000,
      output_tokens: 0,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 1000,
    };

    const result = calculateTokenCost(usage, 'claude-opus-4-5-20251101');

    // cacheRead should be 10% of input cost for same token count
    expect(result.cacheRead).toBeCloseTo(result.input * 0.1, 8);
  });
});

describe('calculateCacheHitRate', () => {
  test('should calculate cache hit rate correctly', () => {
    const usage: TokenUsage = {
      input_tokens: 1000,
      output_tokens: 500,
      cache_creation_input_tokens: 200,
      cache_read_input_tokens: 800,
    };

    const hitRate = calculateCacheHitRate(usage);

    // Hit rate = cache_read / (cache_creation + cache_read) * 100
    // = 800 / (200 + 800) * 100 = 80%
    expect(hitRate).toBe(80);
  });

  test('should return 0 when no cache tokens', () => {
    const usage: TokenUsage = {
      input_tokens: 1000,
      output_tokens: 500,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
    };

    const hitRate = calculateCacheHitRate(usage);
    expect(hitRate).toBe(0);
  });

  test('should return 100 when only cache read tokens', () => {
    const usage: TokenUsage = {
      input_tokens: 1000,
      output_tokens: 500,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 500,
    };

    const hitRate = calculateCacheHitRate(usage);
    expect(hitRate).toBe(100);
  });
});

describe('calculateTotalTokens', () => {
  test('should sum all token types', () => {
    const usage: TokenUsage = {
      input_tokens: 1000,
      output_tokens: 500,
      cache_creation_input_tokens: 200,
      cache_read_input_tokens: 300,
    };

    const total = calculateTotalTokens(usage);
    expect(total).toBe(2000);
  });
});

describe('aggregateCosts', () => {
  test('should aggregate all 4 cost components', () => {
    const costs: CostBreakdown[] = [
      { input: 0.01, output: 0.02, cacheCreation: 0.005, cacheRead: 0.001, total: 0.036 },
      { input: 0.02, output: 0.03, cacheCreation: 0.01, cacheRead: 0.002, total: 0.062 },
    ];

    const result = aggregateCosts(costs);

    expect(result.input).toBeCloseTo(0.03, 6);
    expect(result.output).toBeCloseTo(0.05, 6);
    expect(result.cacheCreation).toBeCloseTo(0.015, 6);
    expect(result.cacheRead).toBeCloseTo(0.003, 6);
    expect(result.total).toBeCloseTo(0.098, 6);
  });

  test('should handle empty array', () => {
    const result = aggregateCosts([]);

    expect(result.input).toBe(0);
    expect(result.output).toBe(0);
    expect(result.cacheCreation).toBe(0);
    expect(result.cacheRead).toBe(0);
    expect(result.total).toBe(0);
  });
});

describe('calculateContextUsage', () => {
  test('should include cache read tokens in context calculation', () => {
    // For Opus with 200k context window
    const inputTokens = 100000;
    const cacheReadTokens = 50000;
    const model = 'claude-opus-4-5-20251101';

    const usage = calculateContextUsage(inputTokens, model, cacheReadTokens);

    // Total context = 100k + 50k = 150k out of 200k = 75%
    expect(usage).toBe(75);
  });

  test('should default cacheReadTokens to 0', () => {
    const inputTokens = 100000;
    const model = 'claude-opus-4-5-20251101';

    const usage = calculateContextUsage(inputTokens, model);

    // 100k out of 200k = 50%
    expect(usage).toBe(50);
  });

  test('should cap at 100%', () => {
    const inputTokens = 200000;
    const cacheReadTokens = 100000;
    const model = 'claude-opus-4-5-20251101';

    const usage = calculateContextUsage(inputTokens, model, cacheReadTokens);

    // 300k out of 200k should cap at 100%
    expect(usage).toBe(100);
  });
});

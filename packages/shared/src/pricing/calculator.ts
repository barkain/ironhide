/**
 * Cost calculation functions
 */

import type { TokenUsage } from '../types/jsonl.js';
import type { ModelPricing } from '../types/pricing.js';
import type { CostBreakdown } from '../types/metrics.js';
import { PRICING_DATABASE, DEFAULT_MODEL_ID, getDefaultPricing } from './database.js';

/**
 * Get pricing for a specific model
 *
 * @param modelId - The model identifier
 * @returns Model pricing or undefined if not found
 */
export function getModelPricing(modelId: string): ModelPricing | undefined {
  return PRICING_DATABASE[modelId];
}

/**
 * Get pricing for a model, with fallback to default
 *
 * @param modelId - The model identifier
 * @returns Model pricing (guaranteed)
 */
export function getModelPricingOrDefault(modelId: string): ModelPricing {
  return PRICING_DATABASE[modelId] ?? getDefaultPricing();
}

/**
 * Calculate the cost for token usage
 *
 * @param tokens - Token usage metrics
 * @param modelId - Model identifier for pricing lookup
 * @returns Cost breakdown in USD
 */
export function calculateTokenCost(
  tokens: TokenUsage,
  modelId: string
): CostBreakdown {
  const pricing = getModelPricingOrDefault(modelId);

  // Calculate costs (price is per million tokens)
  const inputCost = (tokens.input_tokens / 1_000_000) * pricing.inputPricePerMillion;
  const outputCost = (tokens.output_tokens / 1_000_000) * pricing.outputPricePerMillion;
  const cacheCreationCost =
    (tokens.cache_creation_input_tokens / 1_000_000) * pricing.cacheCreationPricePerMillion;
  const cacheReadCost =
    (tokens.cache_read_input_tokens / 1_000_000) * pricing.cacheReadPricePerMillion;

  const total = inputCost + outputCost + cacheCreationCost + cacheReadCost;

  return {
    input: roundToMicrocents(inputCost),
    output: roundToMicrocents(outputCost),
    cacheCreation: roundToMicrocents(cacheCreationCost),
    cacheRead: roundToMicrocents(cacheReadCost),
    total: roundToMicrocents(total),
  };
}

/**
 * Calculate context usage percentage
 *
 * Context usage includes both input tokens and cache read tokens,
 * as cached tokens still occupy space in the context window.
 *
 * @param inputTokens - Number of input tokens used
 * @param modelId - Model identifier for context limit lookup
 * @param cacheReadTokens - Number of cache read tokens (default: 0)
 * @returns Percentage of context window used (0-100)
 */
export function calculateContextUsage(
  inputTokens: number,
  modelId: string,
  cacheReadTokens: number = 0
): number {
  const pricing = getModelPricingOrDefault(modelId);
  const totalContextTokens = inputTokens + cacheReadTokens;
  const percentage = (totalContextTokens / pricing.maxContextTokens) * 100;
  return Math.min(100, Math.max(0, roundToTwoDecimals(percentage)));
}

/**
 * Calculate cache hit rate
 *
 * @param tokens - Token usage metrics
 * @returns Cache hit rate as percentage (0-100)
 */
export function calculateCacheHitRate(tokens: TokenUsage): number {
  const totalCacheTokens =
    tokens.cache_creation_input_tokens + tokens.cache_read_input_tokens;
  if (totalCacheTokens === 0) return 0;

  const hitRate = (tokens.cache_read_input_tokens / totalCacheTokens) * 100;
  return roundToTwoDecimals(hitRate);
}

/**
 * Calculate total tokens from usage
 *
 * @param tokens - Token usage metrics
 * @returns Total token count
 */
export function calculateTotalTokens(tokens: TokenUsage): number {
  return (
    tokens.input_tokens +
    tokens.output_tokens +
    tokens.cache_creation_input_tokens +
    tokens.cache_read_input_tokens
  );
}

/**
 * Estimate cost for a given number of tokens
 *
 * @param inputTokens - Estimated input tokens
 * @param outputTokens - Estimated output tokens
 * @param modelId - Model identifier
 * @returns Estimated total cost in USD
 */
export function estimateCost(
  inputTokens: number,
  outputTokens: number,
  modelId: string = DEFAULT_MODEL_ID
): number {
  const pricing = getModelPricingOrDefault(modelId);
  const inputCost = (inputTokens / 1_000_000) * pricing.inputPricePerMillion;
  const outputCost = (outputTokens / 1_000_000) * pricing.outputPricePerMillion;
  return roundToMicrocents(inputCost + outputCost);
}

/**
 * Format cost for display
 *
 * @param cost - Cost in USD
 * @param options - Formatting options
 * @returns Formatted cost string
 */
export function formatCost(
  cost: number,
  options: { currency?: string; locale?: string; minimumFractionDigits?: number } = {}
): string {
  const { currency = 'USD', locale = 'en-US', minimumFractionDigits = 4 } = options;

  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits,
    maximumFractionDigits: 6,
  }).format(cost);
}

/**
 * Aggregate costs from multiple cost breakdowns
 *
 * @param costs - Array of cost breakdowns
 * @returns Aggregated cost breakdown
 */
export function aggregateCosts(costs: CostBreakdown[]): CostBreakdown {
  const aggregated = costs.reduce(
    (acc, cost) => ({
      input: acc.input + cost.input,
      output: acc.output + cost.output,
      cacheCreation: acc.cacheCreation + cost.cacheCreation,
      cacheRead: acc.cacheRead + cost.cacheRead,
      total: acc.total + cost.total,
    }),
    { input: 0, output: 0, cacheCreation: 0, cacheRead: 0, total: 0 }
  );

  return {
    input: roundToMicrocents(aggregated.input),
    output: roundToMicrocents(aggregated.output),
    cacheCreation: roundToMicrocents(aggregated.cacheCreation),
    cacheRead: roundToMicrocents(aggregated.cacheRead),
    total: roundToMicrocents(aggregated.total),
  };
}

/**
 * Aggregate token usage from multiple entries
 *
 * @param usages - Array of token usages
 * @returns Aggregated token usage
 */
export function aggregateTokenUsage(usages: TokenUsage[]): TokenUsage {
  return usages.reduce(
    (acc, usage) => ({
      input_tokens: acc.input_tokens + usage.input_tokens,
      output_tokens: acc.output_tokens + usage.output_tokens,
      cache_creation_input_tokens:
        acc.cache_creation_input_tokens + usage.cache_creation_input_tokens,
      cache_read_input_tokens:
        acc.cache_read_input_tokens + usage.cache_read_input_tokens,
    }),
    {
      input_tokens: 0,
      output_tokens: 0,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
    }
  );
}

// ============================================================================
// Helper functions
// ============================================================================

/**
 * Round to micro-cents (6 decimal places) for accurate cost calculations
 */
function roundToMicrocents(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

/**
 * Round to two decimal places for percentages
 */
function roundToTwoDecimals(value: number): number {
  return Math.round(value * 100) / 100;
}

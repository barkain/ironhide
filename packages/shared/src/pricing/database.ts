/**
 * Model pricing database
 *
 * Contains pricing information for all supported Claude models.
 * Prices are in USD per million tokens.
 */

import type { ModelPricing } from '../types/pricing.js';

/**
 * Pricing database for Claude models (as of 2026-02)
 */
export const PRICING_DATABASE: Record<string, ModelPricing> = {
  // Claude 4.5 models
  'claude-opus-4-5-20251101': {
    modelId: 'claude-opus-4-5-20251101',
    displayName: 'Claude Opus 4.5',
    inputPricePerMillion: 5.0,
    outputPricePerMillion: 25.0,
    cacheCreationPricePerMillion: 6.25, // 1.25x input price
    cacheReadPricePerMillion: 0.5, // 0.1x input price
    maxContextTokens: 200000,
    maxOutputTokens: 8192,
  },
  'claude-sonnet-4-5-20251101': {
    modelId: 'claude-sonnet-4-5-20251101',
    displayName: 'Claude Sonnet 4.5',
    inputPricePerMillion: 3.0,
    outputPricePerMillion: 15.0,
    cacheCreationPricePerMillion: 3.75,
    cacheReadPricePerMillion: 0.3,
    maxContextTokens: 200000,
    maxOutputTokens: 8192,
  },
  'claude-haiku-4-5-20251101': {
    modelId: 'claude-haiku-4-5-20251101',
    displayName: 'Claude Haiku 4.5',
    inputPricePerMillion: 1.0,
    outputPricePerMillion: 5.0,
    cacheCreationPricePerMillion: 1.25,
    cacheReadPricePerMillion: 0.1,
    maxContextTokens: 200000,
    maxOutputTokens: 8192,
  },

  // Claude 3.5 models (legacy)
  'claude-3-5-sonnet-20241022': {
    modelId: 'claude-3-5-sonnet-20241022',
    displayName: 'Claude 3.5 Sonnet',
    inputPricePerMillion: 3.0,
    outputPricePerMillion: 15.0,
    cacheCreationPricePerMillion: 3.75,
    cacheReadPricePerMillion: 0.3,
    maxContextTokens: 200000,
    maxOutputTokens: 8192,
  },
  'claude-3-5-haiku-20241022': {
    modelId: 'claude-3-5-haiku-20241022',
    displayName: 'Claude 3.5 Haiku',
    inputPricePerMillion: 1.0,
    outputPricePerMillion: 5.0,
    cacheCreationPricePerMillion: 1.25,
    cacheReadPricePerMillion: 0.1,
    maxContextTokens: 200000,
    maxOutputTokens: 8192,
  },

  // Claude 3 models (legacy)
  'claude-3-opus-20240229': {
    modelId: 'claude-3-opus-20240229',
    displayName: 'Claude 3 Opus',
    inputPricePerMillion: 15.0,
    outputPricePerMillion: 75.0,
    cacheCreationPricePerMillion: 18.75,
    cacheReadPricePerMillion: 1.5,
    maxContextTokens: 200000,
    maxOutputTokens: 4096,
  },
  'claude-3-sonnet-20240229': {
    modelId: 'claude-3-sonnet-20240229',
    displayName: 'Claude 3 Sonnet',
    inputPricePerMillion: 3.0,
    outputPricePerMillion: 15.0,
    cacheCreationPricePerMillion: 3.75,
    cacheReadPricePerMillion: 0.3,
    maxContextTokens: 200000,
    maxOutputTokens: 4096,
  },
  'claude-3-haiku-20240307': {
    modelId: 'claude-3-haiku-20240307',
    displayName: 'Claude 3 Haiku',
    inputPricePerMillion: 0.25,
    outputPricePerMillion: 1.25,
    cacheCreationPricePerMillion: 0.3125,
    cacheReadPricePerMillion: 0.025,
    maxContextTokens: 200000,
    maxOutputTokens: 4096,
  },
};

/**
 * Default model ID to use when model is not found in database
 */
export const DEFAULT_MODEL_ID = 'claude-sonnet-4-5-20251101';

/**
 * Get the default model pricing
 */
export function getDefaultPricing(): ModelPricing {
  return PRICING_DATABASE[DEFAULT_MODEL_ID]!;
}

/**
 * List all available model IDs
 */
export function listModelIds(): string[] {
  return Object.keys(PRICING_DATABASE);
}

/**
 * Check if a model ID exists in the database
 */
export function hasModel(modelId: string): boolean {
  return modelId in PRICING_DATABASE;
}

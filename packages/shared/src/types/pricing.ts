/**
 * Model pricing configuration types
 */

/**
 * Model pricing configuration
 */
export interface ModelPricing {
  /** Model identifier */
  modelId: string;

  /** Display name */
  displayName: string;

  /** Price per million input tokens (USD) */
  inputPricePerMillion: number;

  /** Price per million output tokens (USD) */
  outputPricePerMillion: number;

  /** Price per million cache creation tokens (USD) */
  cacheCreationPricePerMillion: number;

  /** Price per million cache read tokens (USD) */
  cacheReadPricePerMillion: number;

  /** Maximum context window size */
  maxContextTokens: number;

  /** Maximum output tokens */
  maxOutputTokens: number;
}

/**
 * Default pricing database (as of 2026-02)
 */
export const PRICING_DATABASE: Record<string, ModelPricing> = {
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
  // Legacy model aliases for backwards compatibility
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
};

/**
 * Default model to use when model is not found in pricing database
 */
export const DEFAULT_MODEL_ID = 'claude-sonnet-4-5-20251101';

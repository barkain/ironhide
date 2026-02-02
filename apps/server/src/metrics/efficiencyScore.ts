/**
 * Efficiency algorithm implementation
 *
 * The efficiency score is a composite metric (0-100) measuring:
 * - Cache utilization (30% weight)
 * - Code output ratio (25% weight)
 * - Tool success rate (25% weight)
 * - Context efficiency (20% weight)
 */

import type {
  Turn,
  ToolUse,
  TokenMetrics,
  CodeMetrics,
  EfficiencyComponents,
} from '@analytics/shared';

/**
 * Weight configuration for efficiency components
 */
const WEIGHTS = {
  cacheUtilization: 0.30,
  codeOutputRatio: 0.25,
  toolSuccessRate: 0.25,
  contextEfficiency: 0.20,
} as const;

/**
 * Normalization constants
 */
const NORMALIZATION = {
  /** Lines per 1000 tokens considered "excellent" */
  excellentCodeRatio: 50,
  /** Output/input ratio considered "excellent" */
  excellentContextRatio: 0.5,
} as const;

/**
 * Calculate efficiency components from session data
 */
export function calculateEfficiencyComponents(
  turns: Turn[],
  totalTokens: TokenMetrics,
  totalCodeChanges: CodeMetrics
): EfficiencyComponents {
  const cacheUtilization = calculateCacheUtilization(totalTokens);
  const codeOutputRatio = calculateCodeOutputRatio(totalTokens, totalCodeChanges);
  const toolSuccessRate = calculateToolSuccessRate(turns);
  const contextEfficiency = calculateContextEfficiency(totalTokens);

  const compositeScore = calculateCompositeScore({
    cacheUtilization,
    codeOutputRatio,
    toolSuccessRate,
    contextEfficiency,
  });

  return {
    cacheUtilization,
    codeOutputRatio,
    toolSuccessRate,
    contextEfficiency,
    compositeScore,
  };
}

/**
 * Calculate cache utilization score (0-100)
 *
 * Formula: cache_read_tokens / (cache_creation_tokens + cache_read_tokens) * 100
 */
export function calculateCacheUtilization(tokens: TokenMetrics): number {
  const totalCacheTokens = tokens.cacheCreation + tokens.cacheRead;

  if (totalCacheTokens === 0) {
    return 0;
  }

  const hitRate = (tokens.cacheRead / totalCacheTokens) * 100;
  return Math.min(100, Math.round(hitRate * 100) / 100);
}

/**
 * Calculate code output ratio (lines changed per 1000 tokens)
 *
 * This measures how efficiently tokens are converted to code changes.
 */
export function calculateCodeOutputRatio(
  tokens: TokenMetrics,
  codeChanges: CodeMetrics
): number {
  if (tokens.total === 0) {
    return 0;
  }

  const totalLinesChanged =
    Math.abs(codeChanges.linesAdded) + Math.abs(codeChanges.linesRemoved);

  const ratio = (totalLinesChanged / tokens.total) * 1000;
  return Math.round(ratio * 100) / 100;
}

/**
 * Calculate tool success rate (0-100)
 *
 * Formula: successful_tool_uses / total_tool_uses * 100
 */
export function calculateToolSuccessRate(turns: Turn[]): number {
  let totalTools = 0;
  let successfulTools = 0;

  for (const turn of turns) {
    for (const tool of turn.toolUses) {
      totalTools++;
      if (!tool.isError) {
        successfulTools++;
      }
    }
  }

  if (totalTools === 0) {
    return 100; // No tools used = 100% success (no failures)
  }

  const rate = (successfulTools / totalTools) * 100;
  return Math.round(rate * 100) / 100;
}

/**
 * Calculate context efficiency (0-100)
 *
 * Measures output tokens relative to input tokens.
 * Higher output/input ratio = more efficient use of context.
 */
export function calculateContextEfficiency(tokens: TokenMetrics): number {
  if (tokens.input === 0) {
    return 50; // Default to neutral if no input
  }

  // Ratio of output to input tokens
  const ratio = tokens.output / tokens.input;

  // Normalize to 0-100 scale
  // Assuming 0.5 output/input ratio is excellent (50% of input leads to output)
  const normalized = (ratio / NORMALIZATION.excellentContextRatio) * 100;

  return Math.min(100, Math.round(normalized * 100) / 100);
}

/**
 * Calculate composite efficiency score (0-100)
 */
export function calculateCompositeScore(components: {
  cacheUtilization: number;
  codeOutputRatio: number;
  toolSuccessRate: number;
  contextEfficiency: number;
}): number {
  // Normalize code output ratio to 0-100 scale
  const normalizedCodeRatio = Math.min(
    (components.codeOutputRatio / NORMALIZATION.excellentCodeRatio) * 100,
    100
  );

  const score =
    components.cacheUtilization * WEIGHTS.cacheUtilization +
    normalizedCodeRatio * WEIGHTS.codeOutputRatio +
    components.toolSuccessRate * WEIGHTS.toolSuccessRate +
    components.contextEfficiency * WEIGHTS.contextEfficiency;

  return Math.round(score * 100) / 100;
}

/**
 * Generate efficiency recommendations based on scores
 */
export function generateEfficiencyRecommendations(
  components: EfficiencyComponents
): string[] {
  const recommendations: string[] = [];

  // Cache utilization recommendations
  if (components.cacheUtilization < 50) {
    recommendations.push(
      'Consider structuring prompts to maximize cache reuse. Use consistent system prompts and context.'
    );
  }

  // Code output recommendations
  if (components.codeOutputRatio < 10) {
    recommendations.push(
      'Code output is low relative to token usage. Consider more focused, task-specific prompts.'
    );
  }

  // Tool success rate recommendations
  if (components.toolSuccessRate < 80) {
    recommendations.push(
      'Tool error rate is high. Review failed tool uses to identify common issues.'
    );
  } else if (components.toolSuccessRate < 95) {
    recommendations.push(
      'Some tool errors detected. Consider improving error handling or providing clearer tool inputs.'
    );
  }

  // Context efficiency recommendations
  if (components.contextEfficiency < 30) {
    recommendations.push(
      'Context usage is inefficient. Try reducing verbose system prompts or context window bloat.'
    );
  }

  // Composite score recommendations
  if (components.compositeScore >= 80) {
    recommendations.push(
      'Excellent efficiency! Current session is well-optimized.'
    );
  } else if (components.compositeScore >= 60) {
    recommendations.push(
      'Good efficiency. Minor optimizations could improve token usage.'
    );
  } else if (components.compositeScore >= 40) {
    recommendations.push(
      'Moderate efficiency. Consider reviewing prompts and context management.'
    );
  } else {
    recommendations.push(
      'Low efficiency detected. Significant optimization opportunities exist.'
    );
  }

  return recommendations;
}

/**
 * Get efficiency grade (A-F)
 */
export function getEfficiencyGrade(score: number): string {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

/**
 * Get efficiency description
 */
export function getEfficiencyDescription(score: number): string {
  if (score >= 90) return 'Excellent';
  if (score >= 80) return 'Good';
  if (score >= 70) return 'Fair';
  if (score >= 60) return 'Needs Improvement';
  return 'Poor';
}

// Types for session comparison feature

import type { SessionSummary } from './index';

/** Metrics comparison between sessions */
export interface MetricsComparison {
  cost_diff: number;
  token_diff: number;
  efficiency_diff: number;
  duration_diff: number;
}

/** Session comparison result from backend */
export interface SessionComparison {
  sessions: SessionSummary[];
  metrics_comparison: MetricsComparison;
}

/** Extended comparison metrics for frontend display */
export interface ComparisonMetric {
  label: string;
  key: string;
  values: number[];
  diffs: number[];
  format: 'currency' | 'number' | 'duration' | 'percent';
  higherIsBetter?: boolean;
}

/** Session selection state for comparison */
export interface ComparisonSelection {
  sessionId: string;
  session: SessionSummary | null;
}

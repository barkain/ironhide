// TypeScript types matching Rust backend DTOs

// ============================================================================
// Session Types
// ============================================================================

/** Session summary for list views (matches Rust SessionSummary) */
export interface SessionSummary {
  id: string;
  project_path: string;
  project_name: string;
  started_at: string;
  last_activity_at: string | null;
  model: string | null;
  total_cost: number;
  total_turns: number;
  total_tokens: number;
  duration_ms: number;
  is_subagent: boolean;
  file_path: string;
}

/** Full session detail with metrics (matches Rust SessionDetail) */
export interface SessionDetail {
  id: string;
  project_path: string;
  project_name: string;
  started_at: string;
  last_activity_at: string | null;
  model: string | null;
  is_subagent: boolean;
  file_path: string;
  metrics: SessionMetrics;
}

// ============================================================================
// Metrics Types
// ============================================================================

/** Session metrics response (matches Rust SessionMetricsResponse) */
export interface SessionMetrics {
  tokens: TokenSummary;
  cost: CostSummary;
  efficiency: EfficiencyMetrics;
  duration_ms: number;
  turn_count: number;
  tool_count: number;
  unique_tools: string[];
  models_used: string[];
  subagent_count: number;
}

/** Token summary (matches Rust TokenSummaryResponse) */
export interface TokenSummary {
  input: number;
  output: number;
  cache_read: number;
  cache_write_5m: number;
  cache_write_1h: number;
  total: number;
  context_used_pct: number;
}

/** Cost summary (matches Rust CostSummaryResponse) */
export interface CostSummary {
  input_cost: number;
  output_cost: number;
  cache_read_cost: number;
  cache_write_cost: number;
  total_cost: number;
  avg_cost_per_turn: number;
}

/** Efficiency metrics (matches Rust EfficiencyResponse) */
export interface EfficiencyMetrics {
  cer: number;         // Cache Efficiency Ratio
  cgr: number;         // Context Growth Rate
  sei: number | null;  // Subagent Efficiency Index
  wfs: number;         // Workflow Friction Score
  cpdu: number;        // Cost per Deliverable Unit
  cpd: number;         // Cycles per Deliverable
  oes_score: number;   // Overall Efficiency Score
  oes_grade: string;   // e.g., "A", "B", "C"
}

// ============================================================================
// Turn Types
// ============================================================================

/** Turn summary (matches Rust TurnSummary) */
export interface TurnSummary {
  turn_number: number;
  started_at: string;
  ended_at: string | null;
  duration_ms: number | null;
  user_message: string | null;
  assistant_message: string | null;
  model: string | null;
  tokens: TurnTokens;
  cost: number;
  tool_count: number;
  tools_used: string[];
  has_subagents: boolean;
  stop_reason: string | null;
}

/** Turn tokens (matches Rust TurnTokensResponse) */
export interface TurnTokens {
  input: number;
  output: number;
  cache_read: number;
  cache_write: number;
  total: number;
}

// ============================================================================
// Dashboard/Aggregate Types
// ============================================================================

/** Dashboard summary metrics */
export interface DashboardSummary {
  total_sessions: number;
  user_sessions: number;
  subagent_sessions: number;
  total_cost: number;
  total_turns: number;
  total_tokens: number;
  avg_cost_per_session: number;
  avg_turns_per_session: number;
  avg_efficiency_score: number | null;
  active_projects: number;
}

/** Daily aggregated metrics */
export interface DailyMetrics {
  date: string;
  session_count: number;
  user_session_count: number;
  subagent_session_count: number;
  total_turns: number;
  total_cost: number;
  total_tokens: number;
  avg_efficiency_score: number | null;
}

/** Project-level metrics */
export interface ProjectMetrics {
  project_path: string;
  project_name: string;
  session_count: number;
  total_cost: number;
  total_turns: number;
  total_tokens: number;
  avg_cost_per_session: number;
  last_activity: string;
}

/** Model usage metrics */
export interface ModelMetrics {
  model: string;
  usage_count: number;
  total_cost: number;
  total_tokens: number;
  avg_cost_per_use: number;
}

/** Tool usage metrics */
export interface ToolUsage {
  tool_name: string;
  usage_count: number;
  total_cost: number;
  avg_cost_per_use: number;
}

/** Subagent summary (matches Rust SubagentSummary) */
export interface SubagentSummary {
  agent_id: string;
  slug: string | null;
  turn_count: number;
  total_cost: number;
  total_tokens: number;
  tools_used: string[];
}

// ============================================================================
// Filter/Query Types
// ============================================================================

export interface DateRange {
  start: string;
  end: string;
}

export interface SessionFilter {
  project_name?: string;
  model?: string;
  active_only?: boolean;
  start_date?: string;
  end_date?: string;
  min_cost?: number;
  max_cost?: number;
}

// ============================================================================
// Legacy compatibility (will be removed)
// ============================================================================

/** @deprecated Use SessionSummary instead */
export interface Session {
  id: string;
  project_path: string;
  started_at: string;
  model: string;
  total_cost: number;
  total_turns: number;
  total_input_tokens: number;
  total_output_tokens: number;
  duration_seconds: number | null;
}

/** @deprecated Use TurnSummary instead */
export interface Turn {
  id: string;
  session_id: string;
  turn_number: number;
  timestamp: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  cost: number;
  tool_name: string | null;
  duration_ms: number | null;
}

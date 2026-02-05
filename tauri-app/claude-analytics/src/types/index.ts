// TypeScript types matching Rust models

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

export interface SessionDetail extends Session {
  turns: Turn[];
}

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

export interface DailyMetrics {
  date: string;
  total_sessions: number;
  total_turns: number;
  total_cost: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_cache_read_tokens: number;
  total_cache_write_tokens: number;
  avg_cost_per_session: number;
  avg_turns_per_session: number;
}

export interface ProjectMetrics {
  project_path: string;
  session_count: number;
  total_cost: number;
  total_turns: number;
  total_input_tokens: number;
  total_output_tokens: number;
  avg_cost_per_session: number;
  last_activity: string;
}

export interface ModelMetrics {
  model: string;
  usage_count: number;
  total_cost: number;
  total_input_tokens: number;
  total_output_tokens: number;
  avg_cost_per_use: number;
}

export interface ToolUsage {
  tool_name: string;
  usage_count: number;
  total_cost: number;
  avg_cost_per_use: number;
}

export interface DashboardSummary {
  total_sessions: number;
  total_cost: number;
  total_turns: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_cache_read_tokens: number;
  total_cache_write_tokens: number;
  avg_cost_per_session: number;
  avg_turns_per_session: number;
  cache_hit_rate: number;
  active_projects: number;
}

export interface DateRange {
  start: string;
  end: string;
}

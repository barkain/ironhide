//! Metrics data types
//!
//! Types for aggregated session and turn metrics

use serde::{Deserialize, Serialize};

/// Aggregated metrics for a session
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionMetrics {
    pub session_id: String,
    pub total_turns: i32,
    pub total_duration_ms: i64,
    pub total_cost: f64,
    pub total_input_tokens: i64,
    pub total_output_tokens: i64,
    pub total_cache_read: i64,
    pub total_cache_write: i64,
    pub avg_cost_per_turn: f64,
    pub avg_tokens_per_turn: f64,
    pub peak_context_pct: f64,
    pub efficiency_score: Option<f64>,
    pub cache_hit_rate: f64,
    pub updated_at: String,
}

impl SessionMetrics {
    /// Create new empty metrics for a session
    pub fn new(session_id: String) -> Self {
        Self {
            session_id,
            total_turns: 0,
            total_duration_ms: 0,
            total_cost: 0.0,
            total_input_tokens: 0,
            total_output_tokens: 0,
            total_cache_read: 0,
            total_cache_write: 0,
            avg_cost_per_turn: 0.0,
            avg_tokens_per_turn: 0.0,
            peak_context_pct: 0.0,
            efficiency_score: None,
            cache_hit_rate: 0.0,
            updated_at: chrono::Utc::now().to_rfc3339(),
        }
    }

    /// Total tokens (input + output)
    pub fn total_tokens(&self) -> i64 {
        self.total_input_tokens + self.total_output_tokens
    }

    /// Calculate cache hit rate
    pub fn calculate_cache_hit_rate(&mut self) {
        let total_cache = self.total_cache_read + self.total_cache_write;
        if total_cache > 0 {
            self.cache_hit_rate = self.total_cache_read as f64 / total_cache as f64;
        } else {
            self.cache_hit_rate = 0.0;
        }
    }

    /// Update averages
    pub fn update_averages(&mut self) {
        if self.total_turns > 0 {
            self.avg_cost_per_turn = self.total_cost / self.total_turns as f64;
            self.avg_tokens_per_turn = self.total_tokens() as f64 / self.total_turns as f64;
        }
    }
}

/// Subagent metrics
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SubagentMetrics {
    pub subagent_id: String,
    pub session_id: String,
    pub agent_hash: String,
    pub slug: Option<String>,
    pub started_at: String,
    pub ended_at: Option<String>,
    pub total_input_tokens: i64,
    pub total_output_tokens: i64,
    pub total_cache_tokens: i64,
    pub total_cost: f64,
    pub tool_count: i32,
}

/// Daily aggregated metrics
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DailyMetrics {
    pub date: String,
    pub session_count: i32,
    pub total_turns: i32,
    pub total_cost: f64,
    pub total_tokens: i64,
    pub avg_efficiency_score: Option<f64>,
}

/// Time series data point
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TimeSeriesPoint {
    pub timestamp: String,
    pub value: f64,
}

/// Available time series metrics
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TimeSeriesMetric {
    TokensPerTurn,
    CostPerTurn,
    ContextUsage,
    CacheHitRate,
    ToolCount,
    Duration,
}

/// Granularity for time series queries
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Granularity {
    Turn,
    Hour,
    Day,
    Week,
}

/// Session comparison result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionComparison {
    pub sessions: Vec<SessionMetrics>,
    pub diffs: MetricDiffs,
}

/// Metric differences between sessions
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MetricDiffs {
    pub cost_diff: f64,
    pub cost_diff_pct: Option<f64>,
    pub tokens_diff: i64,
    pub tokens_diff_pct: Option<f64>,
    pub turns_diff: i32,
    pub efficiency_diff: Option<f64>,
}

//! Session-level metrics aggregation
//!
//! Provides comprehensive metrics calculation for entire sessions,
//! combining token, cost, and efficiency metrics.

use serde::{Deserialize, Serialize};
use std::collections::HashSet;

use super::cost::{find_pricing, CostBreakdown};
use super::efficiency::{calculate_cer, calculate_oes, calculate_sei_f64, normalize_cpd, normalize_cpdu, normalize_sei, EfficiencyScore};
use super::tokens::{SessionTokens, TurnTokens};

/// Complete session-level metrics aggregation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionMetrics {
    /// Token summary for the session
    pub tokens: TokenSummary,
    /// Cost breakdown for the session
    pub cost: SessionCost,
    /// Efficiency metrics
    pub efficiency: EfficiencyMetrics,
    /// Total duration in milliseconds
    pub duration_ms: u64,
    /// Number of turns/cycles
    pub turn_count: u32,
    /// Total tool invocations
    pub tool_count: u32,
    /// Unique tools used
    pub unique_tools: Vec<String>,
    /// Models used in this session
    pub models_used: Vec<String>,
}

/// Detailed token summary for a session
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct TokenSummary {
    pub input: u64,
    pub output: u64,
    pub cache_read: u64,
    pub cache_write_5m: u64,
    pub cache_write_1h: u64,
    pub total: u64,
    /// Estimated context window usage (as percentage)
    pub context_used_pct: f64,
}

impl TokenSummary {
    /// Create from session tokens (uses session-level totals as fallback heuristic)
    pub fn from_session_tokens(tokens: &SessionTokens) -> Self {
        Self::from_session_tokens_with_turns(tokens, None)
    }

    /// Create from session tokens with optional per-turn data for peak context calculation.
    /// When per-turn tokens are provided, context_used_pct is the peak single-turn
    /// context usage (input_tokens + cache_read_tokens) as a percentage of the 200K window.
    /// Without per-turn data, falls back to max(total_input, total_cache_read) / 200K.
    pub fn from_session_tokens_with_turns(tokens: &SessionTokens, per_turn_tokens: Option<&[TurnTokens]>) -> Self {
        let total = tokens.total_input + tokens.total_output
            + tokens.total_cache_read + tokens.total_cache_write_5m + tokens.total_cache_write_1h;

        const MAX_CONTEXT: f64 = 200_000.0;

        let context_used_pct = if let Some(turn_tokens) = per_turn_tokens {
            let peak_context = turn_tokens.iter()
                .map(|t| (t.input_tokens + t.cache_read_tokens) as f64)
                .fold(0.0_f64, f64::max);
            (peak_context / MAX_CONTEXT * 100.0).min(100.0)
        } else {
            let heuristic_context = tokens.total_input.max(tokens.total_cache_read) as f64;
            (heuristic_context / MAX_CONTEXT * 100.0).min(100.0)
        };

        Self {
            input: tokens.total_input,
            output: tokens.total_output,
            cache_read: tokens.total_cache_read,
            cache_write_5m: tokens.total_cache_write_5m,
            cache_write_1h: tokens.total_cache_write_1h,
            total,
            context_used_pct,
        }
    }

    /// Total cache tokens (read + all writes)
    pub fn total_cache(&self) -> u64 {
        self.cache_read + self.cache_write_5m + self.cache_write_1h
    }

    /// Total cache write tokens
    pub fn total_cache_write(&self) -> u64 {
        self.cache_write_5m + self.cache_write_1h
    }
}

/// Session cost breakdown with per-category costs
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct SessionCost {
    pub input_cost: f64,
    pub output_cost: f64,
    pub cache_read_cost: f64,
    pub cache_write_5m_cost: f64,
    pub cache_write_1h_cost: f64,
    pub total_cost: f64,
    /// Cost per turn
    pub avg_cost_per_turn: f64,
    /// Subagent costs (if any)
    pub subagent_cost: f64,
    /// Main session cost (excluding subagents)
    pub main_cost: f64,
}

impl SessionCost {
    /// Create from cost breakdown
    pub fn from_breakdown(breakdown: &CostBreakdown, turn_count: u32) -> Self {
        let avg_cost_per_turn = if turn_count > 0 {
            breakdown.total_cost / turn_count as f64
        } else {
            0.0
        };

        Self {
            input_cost: breakdown.input_cost,
            output_cost: breakdown.output_cost,
            cache_read_cost: breakdown.cache_read_cost,
            cache_write_5m_cost: breakdown.cache_write_5m_cost,
            cache_write_1h_cost: breakdown.cache_write_1h_cost,
            total_cost: breakdown.total_cost,
            avg_cost_per_turn,
            subagent_cost: 0.0,
            main_cost: breakdown.total_cost,
        }
    }

    /// Add subagent cost
    pub fn add_subagent_cost(&mut self, cost: f64) {
        self.subagent_cost += cost;
        self.total_cost += cost;
    }
}

/// Efficiency metrics for a session
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EfficiencyMetrics {
    /// Cache Efficiency Ratio (0.0 - 1.0)
    pub cer: f64,
    /// Context Growth Rate (tokens per turn)
    pub cgr: f64,
    /// Subagent Efficiency Index (if applicable)
    pub sei: Option<f64>,
    /// Workflow Friction Score (0.0 - 1.0, lower is better)
    pub wfs: f64,
    /// Cost per Deliverable Unit (estimated)
    pub cpdu: f64,
    /// Cycles per Deliverable (estimated)
    pub cpd: f64,
    /// Overall Efficiency Score
    pub oes: EfficiencyScore,
}

impl Default for EfficiencyMetrics {
    fn default() -> Self {
        Self {
            cer: 0.0,
            cgr: 0.0,
            sei: None,
            wfs: 0.0,
            cpdu: 0.0,
            cpd: 0.0,
            oes: EfficiencyScore::default_score(),
        }
    }
}

/// Input data for calculating session metrics
pub struct SessionMetricsInput {
    pub tokens: SessionTokens,
    pub total_cost: f64,
    pub cost_breakdown: CostBreakdown,
    pub duration_ms: u64,
    pub turn_count: u32,
    pub tool_count: u32,
    pub unique_tools: HashSet<String>,
    pub models_used: HashSet<String>,
    pub subagent_count: u32,
    pub subagent_cost: f64,
    pub deliverable_units: f64,
    pub rework_cycles: u32,
    pub clarification_cycles: u32,
    /// Per-turn token data for peak context calculation.
    /// If provided, context_used_pct will be based on the peak single-turn context usage.
    pub per_turn_tokens: Option<Vec<TurnTokens>>,
}

/// Calculate comprehensive session metrics
pub fn calculate_session_metrics(input: SessionMetricsInput) -> SessionMetrics {
    // Token summary (use per-turn data for accurate peak context calculation when available)
    let tokens = TokenSummary::from_session_tokens_with_turns(
        &input.tokens,
        input.per_turn_tokens.as_deref(),
    );

    // Cost calculation
    let mut cost = SessionCost::from_breakdown(&input.cost_breakdown, input.turn_count);
    cost.add_subagent_cost(input.subagent_cost);

    // Efficiency calculations
    let cer = calculate_cer(&input.tokens);

    // Context Growth Rate: total context tokens / number of turns
    let cgr = if input.turn_count > 0 {
        input.tokens.total_cache() as f64 / input.turn_count as f64
    } else {
        0.0
    };

    // Subagent Efficiency Index (use f64 version to avoid float-to-int truncation)
    let sei = calculate_sei_f64(input.deliverable_units, input.subagent_count);

    // Workflow Friction Score: (rework + clarification) / total cycles
    let wfs = if input.turn_count > 0 {
        (input.rework_cycles + input.clarification_cycles) as f64 / input.turn_count as f64
    } else {
        0.0
    };

    // Cost per Deliverable Unit
    let cpdu = if input.deliverable_units > 0.0 {
        cost.total_cost / input.deliverable_units
    } else {
        cost.total_cost // If no DU estimate, use total cost
    };

    // Cycles per Deliverable
    let cpd = if input.deliverable_units > 0.0 {
        input.turn_count as f64 / input.deliverable_units
    } else {
        input.turn_count as f64
    };

    // Calculate OES
    let cpdu_norm = normalize_cpdu(cpdu);
    let cpd_norm = normalize_cpd(cpd);
    let sei_norm = sei.map(normalize_sei);

    let oes = calculate_oes(cpdu_norm, cpd_norm, cer, sei_norm, wfs);

    let efficiency = EfficiencyMetrics {
        cer,
        cgr,
        sei,
        wfs,
        cpdu,
        cpd,
        oes,
    };

    SessionMetrics {
        tokens,
        cost,
        efficiency,
        duration_ms: input.duration_ms,
        turn_count: input.turn_count,
        tool_count: input.tool_count,
        unique_tools: input.unique_tools.into_iter().collect(),
        models_used: input.models_used.into_iter().collect(),
    }
}

/// Aggregate token metrics from a single turn
pub fn aggregate_turn_tokens(
    input_tokens: u64,
    output_tokens: u64,
    cache_read: u64,
    cache_write_5m: u64,
    cache_write_1h: u64,
) -> TurnTokens {
    TurnTokens::new(input_tokens, output_tokens, cache_read, cache_write_5m, cache_write_1h)
}

/// Aggregate tokens from multiple turns into session totals
pub fn aggregate_session_tokens(turns: &[TurnTokens]) -> SessionTokens {
    let mut session = SessionTokens::new();
    for turn in turns {
        session.add_turn(turn);
    }
    session
}

/// Calculate turn cost using model pricing
pub fn calculate_turn_cost(tokens: &TurnTokens, model: &str) -> CostBreakdown {
    let pricing = find_pricing(model)
        .unwrap_or_else(|| find_pricing("claude-opus-4-5-20251101").unwrap());

    CostBreakdown::from_tokens(tokens, &pricing)
}

/// Calculate session cost from multiple turns
pub fn calculate_session_cost(turns: &[TurnTokens], model: &str) -> SessionCost {
    let pricing = find_pricing(model)
        .unwrap_or_else(|| find_pricing("claude-opus-4-5-20251101").unwrap());

    let mut total_breakdown = CostBreakdown::default();

    for turn in turns {
        let turn_breakdown = CostBreakdown::from_tokens(turn, &pricing);
        total_breakdown.add(&turn_breakdown);
    }

    SessionCost::from_breakdown(&total_breakdown, turns.len() as u32)
}

/// Quick estimate of deliverable units based on output tokens
/// Uses heuristic: ~1 DU per 5000 output tokens
/// Deprecated: prefer estimate_deliverable_units_v2 which uses tool and turn data
pub fn estimate_deliverable_units(output_tokens: u64) -> f64 {
    (output_tokens as f64 / 5000.0).max(0.1)
}

/// Improved deliverable units estimation using tool usage and meaningful output turns.
///
/// Each tool call contributes ~0.5 deliverable units of work (tool invocations represent
/// concrete actions like file edits, searches, etc.).
/// Each turn with meaningful output (>100 output tokens) contributes ~0.3 DU.
/// Result is clamped to a minimum of 1.0 to avoid division issues downstream.
///
/// `turn_data` is a slice of (output_tokens, tool_count) per turn.
pub fn estimate_deliverable_units_v2(tool_count: u32, turn_data: &[(u64, u32)]) -> f64 {
    let meaningful_output_turns = turn_data
        .iter()
        .filter(|(output_tokens, _)| *output_tokens > 100)
        .count();
    (tool_count as f64 * 0.5 + meaningful_output_turns as f64 * 0.3).max(1.0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_token_summary() {
        let mut session_tokens = SessionTokens::new();
        session_tokens.total_input = 10000;
        session_tokens.total_output = 5000;
        session_tokens.total_cache_read = 50000;
        session_tokens.total_cache_write_5m = 10000;
        session_tokens.total_cache_write_1h = 5000;

        let summary = TokenSummary::from_session_tokens(&session_tokens);

        assert_eq!(summary.input, 10000);
        assert_eq!(summary.output, 5000);
        assert_eq!(summary.cache_read, 50000);
        assert_eq!(summary.total_cache(), 65000);
        assert!(summary.context_used_pct > 0.0);
    }

    #[test]
    fn test_session_cost() {
        let breakdown = CostBreakdown {
            input_cost: 1.0,
            output_cost: 2.5,
            cache_read_cost: 0.25,
            cache_write_5m_cost: 0.5,
            cache_write_1h_cost: 0.0,
            total_cost: 4.25,
        };

        let cost = SessionCost::from_breakdown(&breakdown, 10);

        assert!((cost.total_cost - 4.25).abs() < 0.001);
        assert!((cost.avg_cost_per_turn - 0.425).abs() < 0.001);
    }

    #[test]
    fn test_aggregate_session_tokens() {
        let turns = vec![
            TurnTokens::new(1000, 500, 5000, 1000, 0),
            TurnTokens::new(1500, 750, 7000, 1500, 500),
        ];

        let session = aggregate_session_tokens(&turns);

        assert_eq!(session.total_input, 2500);
        assert_eq!(session.total_output, 1250);
        assert_eq!(session.total_cache_read, 12000);
        assert_eq!(session.total_cache_write_5m, 2500);
        assert_eq!(session.total_cache_write_1h, 500);
        assert_eq!(session.turn_count, 2);
    }

    #[test]
    fn test_calculate_turn_cost_opus() {
        let tokens = TurnTokens::new(1_000_000, 100_000, 500_000, 100_000, 0);
        let cost = calculate_turn_cost(&tokens, "claude-opus-4-5-20251101");

        // Input: 1M * $5/M = $5.00
        // Output: 100K * $25/M = $2.50
        // Cache read: 500K * $0.50/M = $0.25
        // Cache write 5m: 100K * $6.25/M = $0.625
        // Total: $8.375
        assert!((cost.input_cost - 5.0).abs() < 0.01);
        assert!((cost.output_cost - 2.5).abs() < 0.01);
        assert!((cost.cache_read_cost - 0.25).abs() < 0.01);
        assert!((cost.cache_write_5m_cost - 0.625).abs() < 0.01);
        assert!((cost.total_cost - 8.375).abs() < 0.01);
    }

    #[test]
    fn test_calculate_turn_cost_sonnet() {
        let tokens = TurnTokens::new(1_000_000, 100_000, 0, 0, 0);
        let cost = calculate_turn_cost(&tokens, "claude-sonnet-4-5-20251101");

        // Input: 1M * $3/M = $3.00
        // Output: 100K * $15/M = $1.50
        // Total: $4.50
        assert!((cost.input_cost - 3.0).abs() < 0.01);
        assert!((cost.output_cost - 1.5).abs() < 0.01);
        assert!((cost.total_cost - 4.5).abs() < 0.01);
    }

    #[test]
    fn test_calculate_turn_cost_haiku() {
        let tokens = TurnTokens::new(1_000_000, 100_000, 0, 0, 0);
        let cost = calculate_turn_cost(&tokens, "claude-haiku-4-5-20251101");

        // Input: 1M * $1/M = $1.00
        // Output: 100K * $5/M = $0.50
        // Total: $1.50
        assert!((cost.input_cost - 1.0).abs() < 0.01);
        assert!((cost.output_cost - 0.5).abs() < 0.01);
        assert!((cost.total_cost - 1.5).abs() < 0.01);
    }

    #[test]
    fn test_session_cost_with_subagents() {
        let turns = vec![
            TurnTokens::new(100_000, 50_000, 200_000, 50_000, 0),
        ];

        let mut cost = calculate_session_cost(&turns, "claude-opus-4-5-20251101");
        let main_cost = cost.main_cost;

        cost.add_subagent_cost(5.0);

        assert!((cost.subagent_cost - 5.0).abs() < 0.001);
        assert!((cost.total_cost - (main_cost + 5.0)).abs() < 0.001);
    }

    #[test]
    fn test_estimate_deliverable_units() {
        assert!((estimate_deliverable_units(10000) - 2.0).abs() < 0.01);
        assert!((estimate_deliverable_units(5000) - 1.0).abs() < 0.01);
        assert!((estimate_deliverable_units(100) - 0.1).abs() < 0.01); // Minimum 0.1
    }

    #[test]
    fn test_full_session_metrics() {
        let mut tokens = SessionTokens::new();
        tokens.total_input = 50000;
        tokens.total_output = 25000;
        tokens.total_cache_read = 200000;
        tokens.total_cache_write_5m = 50000;
        tokens.total_cache_write_1h = 10000;
        tokens.turn_count = 10;

        let mut unique_tools = HashSet::new();
        unique_tools.insert("Read".to_string());
        unique_tools.insert("Write".to_string());
        unique_tools.insert("Bash".to_string());

        let mut models = HashSet::new();
        models.insert("claude-opus-4-5-20251101".to_string());

        let input = SessionMetricsInput {
            tokens: tokens.clone(),
            total_cost: 10.0,
            cost_breakdown: CostBreakdown {
                input_cost: 0.25,
                output_cost: 0.625,
                cache_read_cost: 0.1,
                cache_write_5m_cost: 0.3125,
                cache_write_1h_cost: 0.1,
                total_cost: 1.3875,
            },
            duration_ms: 300000,
            turn_count: 10,
            tool_count: 25,
            unique_tools,
            models_used: models,
            subagent_count: 3,
            subagent_cost: 2.0,
            deliverable_units: 2.0,
            rework_cycles: 1,
            clarification_cycles: 1,
            per_turn_tokens: None, // No per-turn data in this test
        };

        let metrics = calculate_session_metrics(input);

        assert_eq!(metrics.turn_count, 10);
        assert_eq!(metrics.tool_count, 25);
        assert_eq!(metrics.unique_tools.len(), 3);
        assert!(metrics.efficiency.cer > 0.0);
        assert!(metrics.efficiency.cgr > 0.0);
        assert!(metrics.efficiency.sei.is_some());
        assert!((metrics.efficiency.wfs - 0.2).abs() < 0.001); // 2/10 = 0.2
    }
}

//! Cost calculation utilities
//!
//! Handles computing costs based on token usage and pricing

use serde::{Deserialize, Serialize};

use super::tokens::TurnTokens;

/// Pricing for a Claude model
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelPricing {
    pub model_id: String,
    pub display_name: String,
    pub input_price_per_million: f64,
    pub output_price_per_million: f64,
    pub cache_write_5m_per_million: f64,
    pub cache_write_1h_per_million: f64,
    pub cache_read_per_million: f64,
    pub max_context_tokens: Option<u32>,
}

impl ModelPricing {
    /// Calculate cost for given tokens
    pub fn calculate_cost(&self, tokens: &TurnTokens) -> f64 {
        let input_cost = (tokens.input_tokens as f64 / 1_000_000.0)
            * self.input_price_per_million;
        let output_cost = (tokens.output_tokens as f64 / 1_000_000.0)
            * self.output_price_per_million;
        let cache_read_cost = (tokens.cache_read_tokens as f64 / 1_000_000.0)
            * self.cache_read_per_million;
        let cache_write_5m_cost = (tokens.cache_write_5m_tokens as f64 / 1_000_000.0)
            * self.cache_write_5m_per_million;
        let cache_write_1h_cost = (tokens.cache_write_1h_tokens as f64 / 1_000_000.0)
            * self.cache_write_1h_per_million;

        input_cost + output_cost + cache_read_cost + cache_write_5m_cost + cache_write_1h_cost
    }
}

/// Cost breakdown by category
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct CostBreakdown {
    pub input_cost: f64,
    pub output_cost: f64,
    pub cache_read_cost: f64,
    pub cache_write_5m_cost: f64,
    pub cache_write_1h_cost: f64,
    pub total_cost: f64,
}

impl CostBreakdown {
    /// Calculate breakdown from tokens and pricing
    pub fn from_tokens(tokens: &TurnTokens, pricing: &ModelPricing) -> Self {
        let input_cost = (tokens.input_tokens as f64 / 1_000_000.0)
            * pricing.input_price_per_million;
        let output_cost = (tokens.output_tokens as f64 / 1_000_000.0)
            * pricing.output_price_per_million;
        let cache_read_cost = (tokens.cache_read_tokens as f64 / 1_000_000.0)
            * pricing.cache_read_per_million;
        let cache_write_5m_cost = (tokens.cache_write_5m_tokens as f64 / 1_000_000.0)
            * pricing.cache_write_5m_per_million;
        let cache_write_1h_cost = (tokens.cache_write_1h_tokens as f64 / 1_000_000.0)
            * pricing.cache_write_1h_per_million;

        let total_cost = input_cost + output_cost + cache_read_cost
            + cache_write_5m_cost + cache_write_1h_cost;

        Self {
            input_cost,
            output_cost,
            cache_read_cost,
            cache_write_5m_cost,
            cache_write_1h_cost,
            total_cost,
        }
    }

    /// Add another breakdown to this one
    pub fn add(&mut self, other: &CostBreakdown) {
        self.input_cost += other.input_cost;
        self.output_cost += other.output_cost;
        self.cache_read_cost += other.cache_read_cost;
        self.cache_write_5m_cost += other.cache_write_5m_cost;
        self.cache_write_1h_cost += other.cache_write_1h_cost;
        self.total_cost += other.total_cost;
    }
}

/// Default pricing for Claude models (February 2026)
pub fn get_default_pricing() -> Vec<ModelPricing> {
    vec![
        ModelPricing {
            model_id: "claude-opus-4-5-20251101".to_string(),
            display_name: "Claude Opus 4.5".to_string(),
            input_price_per_million: 5.00,
            output_price_per_million: 25.00,
            cache_write_5m_per_million: 6.25,
            cache_write_1h_per_million: 10.00,
            cache_read_per_million: 0.50,
            max_context_tokens: Some(200000),
        },
        ModelPricing {
            model_id: "claude-sonnet-4-5-20251101".to_string(),
            display_name: "Claude Sonnet 4.5".to_string(),
            input_price_per_million: 3.00,
            output_price_per_million: 15.00,
            cache_write_5m_per_million: 3.75,
            cache_write_1h_per_million: 6.00,
            cache_read_per_million: 0.30,
            max_context_tokens: Some(200000),
        },
        ModelPricing {
            model_id: "claude-haiku-4-5-20251101".to_string(),
            display_name: "Claude Haiku 4.5".to_string(),
            input_price_per_million: 1.00,
            output_price_per_million: 5.00,
            cache_write_5m_per_million: 1.25,
            cache_write_1h_per_million: 2.00,
            cache_read_per_million: 0.10,
            max_context_tokens: Some(200000),
        },
        ModelPricing {
            model_id: "claude-opus-4-6-20260219".to_string(),
            display_name: "Claude Opus 4.6".to_string(),
            input_price_per_million: 5.00,
            output_price_per_million: 25.00,
            cache_write_5m_per_million: 6.25,
            cache_write_1h_per_million: 10.00,
            cache_read_per_million: 0.50,
            max_context_tokens: Some(200000),
        },
        ModelPricing {
            model_id: "claude-sonnet-4-6-20260219".to_string(),
            display_name: "Claude Sonnet 4.6".to_string(),
            input_price_per_million: 3.00,
            output_price_per_million: 15.00,
            cache_write_5m_per_million: 3.75,
            cache_write_1h_per_million: 6.00,
            cache_read_per_million: 0.30,
            max_context_tokens: Some(200000),
        },
        ModelPricing {
            model_id: "claude-sonnet-4-20250514".to_string(),
            display_name: "Claude Sonnet 4".to_string(),
            input_price_per_million: 3.00,
            output_price_per_million: 15.00,
            cache_write_5m_per_million: 3.75,
            cache_write_1h_per_million: 6.00,
            cache_read_per_million: 0.30,
            max_context_tokens: Some(200000),
        },
    ]
}

/// Find pricing for a model by ID
/// Supports exact matches, partial matches, and common aliases
pub fn find_pricing(model_id: &str) -> Option<ModelPricing> {
    let model_lower = model_id.to_lowercase();

    // First try exact match
    if let Some(pricing) = get_default_pricing()
        .into_iter()
        .find(|p| p.model_id == model_id)
    {
        return Some(pricing);
    }

    // Try partial match (model_id contains the pricing model_id)
    if let Some(pricing) = get_default_pricing()
        .into_iter()
        .find(|p| model_id.contains(&p.model_id))
    {
        return Some(pricing);
    }

    // Try alias matching
    if model_lower.contains("opus") {
        return get_default_pricing().into_iter().find(|p| p.model_id.contains("opus"));
    }
    if model_lower.contains("sonnet") {
        return get_default_pricing().into_iter().find(|p| p.model_id.contains("sonnet"));
    }
    if model_lower.contains("haiku") {
        return get_default_pricing().into_iter().find(|p| p.model_id.contains("haiku"));
    }

    None
}

/// Get default pricing (Opus) as fallback
pub fn get_default_pricing_fallback() -> ModelPricing {
    get_default_pricing()
        .into_iter()
        .find(|p| p.model_id.contains("opus"))
        .unwrap()
}

/// Session-level cost aggregation
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct SessionCost {
    pub breakdown: CostBreakdown,
    pub turn_count: u32,
    pub avg_cost_per_turn: f64,
    pub subagent_cost: f64,
    pub total_with_subagents: f64,
}

impl SessionCost {
    /// Create from breakdown and turn count
    pub fn from_breakdown(breakdown: CostBreakdown, turn_count: u32) -> Self {
        let avg_cost_per_turn = if turn_count > 0 {
            breakdown.total_cost / turn_count as f64
        } else {
            0.0
        };

        Self {
            turn_count,
            avg_cost_per_turn,
            total_with_subagents: breakdown.total_cost,
            breakdown,
            subagent_cost: 0.0,
        }
    }

    /// Add subagent cost
    pub fn add_subagent_cost(&mut self, cost: f64) {
        self.subagent_cost += cost;
        self.total_with_subagents = self.breakdown.total_cost + self.subagent_cost;
    }
}

/// Calculate cost for a single turn
pub fn calculate_turn_cost(tokens: &TurnTokens, model: &str) -> CostBreakdown {
    let pricing = find_pricing(model).unwrap_or_else(get_default_pricing_fallback);
    CostBreakdown::from_tokens(tokens, &pricing)
}

/// Calculate session cost from multiple turns
pub fn calculate_session_cost(turns: &[TurnTokens], model: &str) -> SessionCost {
    let pricing = find_pricing(model).unwrap_or_else(get_default_pricing_fallback);

    let mut total_breakdown = CostBreakdown::default();
    for turn in turns {
        let turn_breakdown = CostBreakdown::from_tokens(turn, &pricing);
        total_breakdown.add(&turn_breakdown);
    }

    SessionCost::from_breakdown(total_breakdown, turns.len() as u32)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_calculate_cost() {
        let pricing = ModelPricing {
            model_id: "test".to_string(),
            display_name: "Test".to_string(),
            input_price_per_million: 5.00,
            output_price_per_million: 25.00,
            cache_write_5m_per_million: 6.25,
            cache_write_1h_per_million: 10.00,
            cache_read_per_million: 0.50,
            max_context_tokens: Some(200000),
        };

        let tokens = TurnTokens::new(1_000_000, 100_000, 0, 0, 0);
        let cost = pricing.calculate_cost(&tokens);

        // 1M input * $5/M + 100K output * $25/M = $5 + $2.50 = $7.50
        assert!((cost - 7.50).abs() < 0.01);
    }

    #[test]
    fn test_cost_breakdown() {
        let pricing = find_pricing("claude-opus-4-5-20251101").unwrap();
        let tokens = TurnTokens::new(1_000_000, 100_000, 500_000, 0, 0);

        let breakdown = CostBreakdown::from_tokens(&tokens, &pricing);

        assert!(breakdown.total_cost > 0.0);
        assert!((breakdown.input_cost - 5.00).abs() < 0.01);
        assert!((breakdown.output_cost - 2.50).abs() < 0.01);
        assert!((breakdown.cache_read_cost - 0.25).abs() < 0.01);
    }

    #[test]
    fn test_find_pricing_aliases() {
        // Test exact match
        assert!(find_pricing("claude-opus-4-5-20251101").is_some());

        // Test alias match
        let opus = find_pricing("opus").unwrap();
        assert!(opus.model_id.contains("opus"));

        let sonnet = find_pricing("sonnet").unwrap();
        assert!(sonnet.model_id.contains("sonnet"));

        let haiku = find_pricing("haiku").unwrap();
        assert!(haiku.model_id.contains("haiku"));

        // Test case insensitive
        let opus_upper = find_pricing("OPUS").unwrap();
        assert!(opus_upper.model_id.contains("opus"));
    }

    #[test]
    fn test_calculate_turn_cost() {
        let tokens = TurnTokens::new(1_000_000, 100_000, 500_000, 100_000, 0);
        let cost = calculate_turn_cost(&tokens, "claude-opus-4-5-20251101");

        // Input: 1M * $5/M = $5.00
        // Output: 100K * $25/M = $2.50
        // Cache read: 500K * $0.50/M = $0.25
        // Cache write 5m: 100K * $6.25/M = $0.625
        // Total: $8.375
        assert!((cost.total_cost - 8.375).abs() < 0.01);
    }

    #[test]
    fn test_calculate_turn_cost_all_models() {
        let tokens = TurnTokens::new(1_000_000, 100_000, 0, 0, 0);

        // Opus: 1M * $5 + 100K * $25 = $5 + $2.50 = $7.50
        let opus_cost = calculate_turn_cost(&tokens, "claude-opus-4-5-20251101");
        assert!((opus_cost.total_cost - 7.5).abs() < 0.01);

        // Sonnet: 1M * $3 + 100K * $15 = $3 + $1.50 = $4.50
        let sonnet_cost = calculate_turn_cost(&tokens, "claude-sonnet-4-5-20251101");
        assert!((sonnet_cost.total_cost - 4.5).abs() < 0.01);

        // Haiku: 1M * $1 + 100K * $5 = $1 + $0.50 = $1.50
        let haiku_cost = calculate_turn_cost(&tokens, "claude-haiku-4-5-20251101");
        assert!((haiku_cost.total_cost - 1.5).abs() < 0.01);
    }

    #[test]
    fn test_calculate_session_cost() {
        let turns = vec![
            TurnTokens::new(1_000_000, 100_000, 0, 0, 0),
            TurnTokens::new(1_000_000, 100_000, 0, 0, 0),
        ];

        let session_cost = calculate_session_cost(&turns, "claude-opus-4-5-20251101");

        // Two turns at $7.50 each = $15.00
        assert!((session_cost.breakdown.total_cost - 15.0).abs() < 0.01);
        assert_eq!(session_cost.turn_count, 2);
        assert!((session_cost.avg_cost_per_turn - 7.5).abs() < 0.01);
    }

    #[test]
    fn test_session_cost_with_subagents() {
        let turns = vec![TurnTokens::new(1_000_000, 100_000, 0, 0, 0)];
        let mut session_cost = calculate_session_cost(&turns, "claude-opus-4-5-20251101");

        session_cost.add_subagent_cost(5.0);

        assert!((session_cost.subagent_cost - 5.0).abs() < 0.001);
        assert!((session_cost.total_with_subagents - 12.5).abs() < 0.01); // $7.50 + $5.00
    }

    #[test]
    fn test_cache_write_pricing() {
        // Test 5-minute cache write pricing
        let tokens_5m = TurnTokens::new(0, 0, 0, 1_000_000, 0);
        let cost_5m = calculate_turn_cost(&tokens_5m, "claude-opus-4-5-20251101");
        assert!((cost_5m.cache_write_5m_cost - 6.25).abs() < 0.01);

        // Test 1-hour cache write pricing
        let tokens_1h = TurnTokens::new(0, 0, 0, 0, 1_000_000);
        let cost_1h = calculate_turn_cost(&tokens_1h, "claude-opus-4-5-20251101");
        assert!((cost_1h.cache_write_1h_cost - 10.0).abs() < 0.01);
    }
}

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
    ]
}

/// Find pricing for a model by ID
pub fn find_pricing(model_id: &str) -> Option<ModelPricing> {
    get_default_pricing()
        .into_iter()
        .find(|p| p.model_id == model_id || model_id.contains(&p.model_id))
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
}

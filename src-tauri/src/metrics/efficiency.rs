//! Efficiency scoring calculations
//!
//! Implements the Overall Efficiency Score (OES) and related metrics:
//! - CER (Cache Efficiency Ratio)
//! - CGR (Context Growth Rate)
//! - SEI (Subagent Efficiency Index)
//! - WFS (Workflow Friction Score)

use serde::{Deserialize, Serialize};

use super::tokens::SessionTokens;

/// Efficiency rating based on OES
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub enum EfficiencyRating {
    /// > 0.75
    Excellent,
    /// 0.55 - 0.75
    Good,
    /// 0.35 - 0.55
    Average,
    /// < 0.35
    NeedsImprovement,
}

impl EfficiencyRating {
    /// Get rating from OES score
    pub fn from_score(score: f64) -> Self {
        if score > 0.75 {
            Self::Excellent
        } else if score >= 0.55 {
            Self::Good
        } else if score >= 0.35 {
            Self::Average
        } else {
            Self::NeedsImprovement
        }
    }

    /// Get display label
    pub fn label(&self) -> &'static str {
        match self {
            Self::Excellent => "Excellent",
            Self::Good => "Good",
            Self::Average => "Average",
            Self::NeedsImprovement => "Needs Improvement",
        }
    }
}

/// Complete efficiency score with all components
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EfficiencyScore {
    /// Overall Efficiency Score (0.0 - 1.0)
    pub overall: f64,
    /// Normalized Cost Per Deliverable Unit
    pub cost_efficiency: f64,
    /// Normalized Cycles per Deliverable
    pub time_efficiency: f64,
    /// Cache Efficiency Ratio
    pub cache_efficiency: f64,
    /// Subagent Efficiency Index (if applicable)
    pub subagent_efficiency: Option<f64>,
    /// Workflow Smoothness (1 - WFS)
    pub workflow_smoothness: f64,
    /// Rating category
    pub rating: EfficiencyRating,
}

impl EfficiencyScore {
    /// Create a new efficiency score with default values
    pub fn default_score() -> Self {
        Self {
            overall: 0.5,
            cost_efficiency: 0.5,
            time_efficiency: 0.5,
            cache_efficiency: 0.5,
            subagent_efficiency: None,
            workflow_smoothness: 0.5,
            rating: EfficiencyRating::Average,
        }
    }
}

/// Calculate Cache Efficiency Ratio
/// CER = cache_read / (cache_read + cache_write)
///
/// From the efficiency framework documentation:
/// - Excellent: CER > 0.7 (good context reuse)
/// - Good: CER 0.5-0.7 (moderate reuse)
/// - Poor: CER < 0.5 (context not being leveraged)
pub fn calculate_cer(tokens: &SessionTokens) -> f64 {
    let total_cache = tokens.total_cache();
    if total_cache == 0 {
        return 0.0;
    }

    tokens.total_cache_read as f64 / total_cache as f64
}

/// Calculate CER from raw values
/// CER = cache_read / (cache_read + cache_write)
pub fn calculate_cer_raw(cache_read: u64, cache_write: u64) -> f64 {
    let total = cache_read + cache_write;
    if total == 0 {
        return 0.0;
    }
    cache_read as f64 / total as f64
}

/// Get CER rating
pub fn cer_rating(cer: f64) -> &'static str {
    if cer > 0.7 {
        "Excellent"
    } else if cer >= 0.5 {
        "Good"
    } else {
        "Poor"
    }
}

/// Calculate Context Growth Rate
/// CGR = (final_context - initial_context) / cycles
///
/// From the efficiency framework documentation:
/// - Sustainable: CGR < 1000 tokens/cycle
/// - Acceptable: CGR 1000-2500 tokens/cycle
/// - Warning: CGR > 2500 tokens/cycle (context bloat)
pub fn calculate_cgr(initial_context: u64, final_context: u64, cycles: u32) -> f64 {
    if cycles == 0 {
        return 0.0;
    }

    let growth = final_context.saturating_sub(initial_context);
    growth as f64 / cycles as f64
}

/// Calculate CGR from total context and turn count
/// CGR = total_context / turn_count
pub fn calculate_cgr_simple(context_tokens: u64, turn_count: u32) -> f64 {
    if turn_count == 0 {
        return 0.0;
    }
    context_tokens as f64 / turn_count as f64
}

/// Get CGR rating
pub fn cgr_rating(cgr: f64) -> &'static str {
    if cgr < 1000.0 {
        "Sustainable"
    } else if cgr <= 2500.0 {
        "Acceptable"
    } else {
        "Warning"
    }
}

/// Calculate Subagent Efficiency Index
/// SEI = deliverable_units / subagent_count
///
/// From the efficiency framework documentation:
/// - Excellent: SEI > 0.4 (subagents highly productive)
/// - Good: SEI 0.2-0.4 (reasonable orchestration)
/// - Poor: SEI < 0.2 (too many subagents per output)
pub fn calculate_sei(deliverable_units: u32, subagent_count: u32) -> Option<f64> {
    if subagent_count == 0 {
        return None;
    }

    Some(deliverable_units as f64 / subagent_count as f64)
}

/// Calculate SEI from f64 values (for more precise DU measurements)
pub fn calculate_sei_f64(deliverable_units: f64, subagent_count: u32) -> Option<f64> {
    if subagent_count == 0 {
        return None;
    }
    Some(deliverable_units / subagent_count as f64)
}

/// Calculate SEI based on cost (alternative formula)
/// SEI = deliverable_units / (main_cost + subagent_cost)
/// This measures output per dollar spent
pub fn calculate_sei_cost(main_cost: f64, subagent_cost: f64, deliverable_units: f64) -> f64 {
    let total_cost = main_cost + subagent_cost;
    if total_cost == 0.0 {
        return 0.0;
    }
    deliverable_units / total_cost
}

/// Get SEI rating
pub fn sei_rating(sei: f64) -> &'static str {
    if sei > 0.4 {
        "Excellent"
    } else if sei >= 0.2 {
        "Good"
    } else {
        "Poor"
    }
}

/// Normalize Cost Per Deliverable Unit
/// CPDU_norm = max(0, 1 - CPDU/50)
pub fn normalize_cpdu(cpdu: f64) -> f64 {
    (1.0 - cpdu / 50.0).max(0.0)
}

/// Normalize Cycles per Deliverable
/// CpD_norm = max(0, 1 - CpD/50)
pub fn normalize_cpd(cpd: f64) -> f64 {
    (1.0 - cpd / 50.0).max(0.0)
}

/// Normalize Subagent Efficiency Index
/// SEI_norm = min(1, SEI/0.5)
pub fn normalize_sei(sei: f64) -> f64 {
    (sei / 0.5).min(1.0)
}

/// Calculate Overall Efficiency Score
/// OES = 0.30*CPDU_norm + 0.25*CpD_norm + 0.15*CER + 0.15*SEI_norm + 0.15*(1-WFS)
pub fn calculate_oes(
    cpdu_norm: f64,
    cpd_norm: f64,
    cer: f64,
    sei_norm: Option<f64>,
    wfs: f64,
) -> EfficiencyScore {
    // If no subagents, redistribute SEI weight to other components
    let (sei_weight, other_weight_boost) = if sei_norm.is_some() {
        (0.15, 0.0)
    } else {
        (0.0, 0.15 / 4.0) // Distribute among 4 other components
    };

    let workflow_smoothness = 1.0 - wfs;

    let overall = (0.30 + other_weight_boost) * cpdu_norm
        + (0.25 + other_weight_boost) * cpd_norm
        + (0.15 + other_weight_boost) * cer
        + sei_weight * sei_norm.unwrap_or(0.0)
        + (0.15 + other_weight_boost) * workflow_smoothness;

    let overall = overall.clamp(0.0, 1.0);

    EfficiencyScore {
        overall,
        cost_efficiency: cpdu_norm,
        time_efficiency: cpd_norm,
        cache_efficiency: cer,
        subagent_efficiency: sei_norm,
        workflow_smoothness,
        rating: EfficiencyRating::from_score(overall),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cer_calculation() {
        let mut tokens = SessionTokens::new();
        tokens.total_cache_read = 700;
        tokens.total_cache_write_5m = 300;

        let cer = calculate_cer(&tokens);
        assert!((cer - 0.70).abs() < 0.01);
    }

    #[test]
    fn test_cer_zero_cache() {
        let tokens = SessionTokens::new();
        let cer = calculate_cer(&tokens);
        assert_eq!(cer, 0.0);
    }

    #[test]
    fn test_cgr_calculation() {
        let cgr = calculate_cgr(10000, 50000, 40);
        assert_eq!(cgr, 1000.0);
    }

    #[test]
    fn test_sei_calculation() {
        let sei = calculate_sei(5, 10).unwrap();
        assert_eq!(sei, 0.5);

        assert!(calculate_sei(5, 0).is_none());
    }

    #[test]
    fn test_normalization() {
        assert!((normalize_cpdu(25.0) - 0.5).abs() < 0.01);
        assert!((normalize_cpdu(0.0) - 1.0).abs() < 0.01);
        assert_eq!(normalize_cpdu(100.0), 0.0);

        assert!((normalize_sei(0.5) - 1.0).abs() < 0.01);
        assert!((normalize_sei(0.25) - 0.5).abs() < 0.01);
    }

    #[test]
    fn test_efficiency_rating() {
        assert_eq!(EfficiencyRating::from_score(0.80), EfficiencyRating::Excellent);
        assert_eq!(EfficiencyRating::from_score(0.60), EfficiencyRating::Good);
        assert_eq!(EfficiencyRating::from_score(0.45), EfficiencyRating::Average);
        assert_eq!(EfficiencyRating::from_score(0.20), EfficiencyRating::NeedsImprovement);
    }

    #[test]
    fn test_oes_calculation() {
        let score = calculate_oes(0.8, 0.7, 0.6, Some(0.5), 0.2);

        assert!(score.overall > 0.5);
        assert_eq!(score.cost_efficiency, 0.8);
        assert_eq!(score.cache_efficiency, 0.6);
        assert_eq!(score.workflow_smoothness, 0.8);
    }

    #[test]
    fn test_cer_raw() {
        let cer = calculate_cer_raw(70000, 30000);
        assert!((cer - 0.7).abs() < 0.01);

        let cer_zero = calculate_cer_raw(0, 0);
        assert_eq!(cer_zero, 0.0);
    }

    #[test]
    fn test_cer_rating() {
        assert_eq!(cer_rating(0.8), "Excellent");
        assert_eq!(cer_rating(0.6), "Good");
        assert_eq!(cer_rating(0.3), "Poor");
    }

    #[test]
    fn test_cgr_simple() {
        let cgr = calculate_cgr_simple(10000, 10);
        assert_eq!(cgr, 1000.0);

        let cgr_zero = calculate_cgr_simple(10000, 0);
        assert_eq!(cgr_zero, 0.0);
    }

    #[test]
    fn test_cgr_rating() {
        assert_eq!(cgr_rating(500.0), "Sustainable");
        assert_eq!(cgr_rating(1500.0), "Acceptable");
        assert_eq!(cgr_rating(3000.0), "Warning");
    }

    #[test]
    fn test_sei_f64() {
        let sei = calculate_sei_f64(2.5, 5).unwrap();
        assert_eq!(sei, 0.5);

        assert!(calculate_sei_f64(2.5, 0).is_none());
    }

    #[test]
    fn test_sei_cost() {
        // 2 deliverable units / ($5 main + $3 subagent) = 0.25 DU per dollar
        let sei = calculate_sei_cost(5.0, 3.0, 2.0);
        assert!((sei - 0.25).abs() < 0.001);

        // Zero cost should return 0
        let sei_zero = calculate_sei_cost(0.0, 0.0, 2.0);
        assert_eq!(sei_zero, 0.0);
    }

    #[test]
    fn test_sei_rating() {
        assert_eq!(sei_rating(0.5), "Excellent");
        assert_eq!(sei_rating(0.3), "Good");
        assert_eq!(sei_rating(0.1), "Poor");
    }

    #[test]
    fn test_oes_without_subagents() {
        // When no subagents, SEI weight should be redistributed
        let score_no_sei = calculate_oes(0.8, 0.7, 0.6, None, 0.2);
        let score_with_sei = calculate_oes(0.8, 0.7, 0.6, Some(0.5), 0.2);

        // Score without SEI should still be valid
        assert!(score_no_sei.overall > 0.0);
        assert!(score_no_sei.overall <= 1.0);
        assert!(score_no_sei.subagent_efficiency.is_none());

        // Scores should differ
        assert!((score_no_sei.overall - score_with_sei.overall).abs() > 0.01);
    }

    #[test]
    fn test_efficiency_boundaries() {
        // Test extreme values
        let excellent = calculate_oes(1.0, 1.0, 1.0, Some(1.0), 0.0);
        assert_eq!(excellent.rating, EfficiencyRating::Excellent);

        let poor = calculate_oes(0.0, 0.0, 0.0, Some(0.0), 1.0);
        assert_eq!(poor.rating, EfficiencyRating::NeedsImprovement);
    }
}

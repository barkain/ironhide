//! Recommendation engine
//!
//! Core logic for analyzing session metrics and generating actionable recommendations.

use super::types::{Recommendation, RecommendationInput, RecommendationSummary, RecommendationType};
use crate::metrics::cost::{find_pricing, get_default_pricing};

/// Thresholds for recommendation triggers
mod thresholds {
    /// CER below this triggers cache optimization recommendation
    pub const LOW_CER: f64 = 0.5;
    /// CER above this is considered excellent
    #[allow(dead_code)]
    pub const HIGH_CER: f64 = 0.7;
    /// CGR above this triggers context growth warning
    pub const HIGH_CGR: f64 = 2500.0;
    /// SEI below this triggers subagent strategy recommendation
    pub const LOW_SEI: f64 = 0.2;
    /// WFS above this triggers workflow optimization recommendation
    pub const HIGH_WFS: f64 = 0.3;
    /// OES below this triggers general efficiency recommendation
    pub const LOW_OES: f64 = 0.5;
    /// Minimum cost to consider model switch recommendations
    pub const MIN_COST_FOR_MODEL_SWITCH: f64 = 1.0;
    /// Average cost per turn threshold for expensive session warning
    pub const HIGH_AVG_COST_PER_TURN: f64 = 0.75;
    /// Subagent cost percentage threshold (subagent_cost / total_cost)
    pub const HIGH_SUBAGENT_COST_RATIO: f64 = 0.4;
}

/// Generate recommendations based on session analysis
pub fn generate_recommendations(input: &RecommendationInput) -> RecommendationSummary {
    let mut recommendations = Vec::new();

    // Check cache efficiency
    if let Some(rec) = check_cache_efficiency(input) {
        recommendations.push(rec);
    }

    // Check subagent efficiency
    if let Some(rec) = check_subagent_efficiency(input) {
        recommendations.push(rec);
    }

    // Check model selection
    if let Some(rec) = check_model_selection(input) {
        recommendations.push(rec);
    }

    // Check context growth
    if let Some(rec) = check_context_growth(input) {
        recommendations.push(rec);
    }

    // Check workflow friction
    if let Some(rec) = check_workflow_friction(input) {
        recommendations.push(rec);
    }

    // Check overall efficiency
    if let Some(rec) = check_overall_efficiency(input) {
        recommendations.push(rec);
    }

    // Check high cost per turn
    if let Some(rec) = check_cost_per_turn(input) {
        recommendations.push(rec);
    }

    // Check subagent cost ratio
    if let Some(rec) = check_subagent_cost_ratio(input) {
        recommendations.push(rec);
    }

    RecommendationSummary::from_recommendations(
        recommendations,
        input.session_id.clone(),
        1,
    )
}

/// Check cache efficiency and recommend improvements
fn check_cache_efficiency(input: &RecommendationInput) -> Option<Recommendation> {
    if input.cer >= thresholds::LOW_CER {
        return None;
    }

    // Calculate potential savings from better cache utilization
    // If CER improved to 0.7, cache read costs would decrease
    let current_cache_cost = estimate_cache_write_cost(input);
    let potential_read_savings = if input.cer < 0.3 {
        current_cache_cost * 0.4 // Could save up to 40% with good caching
    } else {
        current_cache_cost * 0.2 // Could save about 20%
    };

    let confidence = if input.cer < 0.3 {
        0.9 // Very confident when CER is very low
    } else {
        0.7 // Moderately confident
    };

    Some(Recommendation::new(
        RecommendationType::CacheOptimization,
        "Improve cache utilization".to_string(),
        format!(
            "Your Cache Efficiency Ratio (CER) of {:.1}% is below optimal. \
            This means you're paying for cache writes but not fully benefiting from cache reads. \
            Better context management could significantly reduce costs.",
            input.cer * 100.0
        ),
        potential_read_savings,
        false,
        confidence,
        vec![
            "Structure prompts to maximize cache hits across turns".to_string(),
            "Keep stable context (system prompts, project context) at the beginning".to_string(),
            "Avoid frequently changing the beginning of your context".to_string(),
            "Consider batching related tasks in the same session".to_string(),
        ],
        format!(
            "CER: {:.1}% (target: >70%), Cache write tokens: {}",
            input.cer * 100.0,
            input.cache_write_tokens
        ),
    ))
}

/// Check subagent efficiency and recommend strategy changes
fn check_subagent_efficiency(input: &RecommendationInput) -> Option<Recommendation> {
    let sei = input.sei?;

    if sei >= thresholds::LOW_SEI || input.subagent_count == 0 {
        return None;
    }

    // Estimate potential savings from reducing subagent overhead
    let potential_savings = input.subagent_cost * 0.3; // Could save 30% with better orchestration

    Some(Recommendation::new(
        RecommendationType::SubagentStrategy,
        "Optimize subagent usage".to_string(),
        format!(
            "Your Subagent Efficiency Index (SEI) of {:.2} indicates subagents may not be \
            producing enough value relative to their cost. You used {} subagents at a cost of ${:.2}.",
            sei,
            input.subagent_count,
            input.subagent_cost
        ),
        potential_savings,
        false,
        0.75,
        vec![
            "Consider fewer, more focused subagent tasks".to_string(),
            "Combine related subtasks into single subagent calls".to_string(),
            "Use subagents only for truly parallelizable work".to_string(),
            "Review if tasks could be done in the main session instead".to_string(),
        ],
        format!(
            "SEI: {:.2} (target: >0.2), Subagent count: {}, Subagent cost: ${:.2}",
            sei, input.subagent_count, input.subagent_cost
        ),
    ))
}

/// Check if a different model could be more cost-effective
fn check_model_selection(input: &RecommendationInput) -> Option<Recommendation> {
    if input.total_cost < thresholds::MIN_COST_FOR_MODEL_SWITCH {
        return None;
    }

    let current_model = input.primary_model.to_lowercase();

    // If using Opus, calculate potential savings with Sonnet
    if current_model.contains("opus") {
        let opus_pricing = find_pricing("opus")?;
        let sonnet_pricing = find_pricing("sonnet")?;

        // Calculate what the cost would have been with Sonnet
        let opus_input_cost =
            input.input_tokens as f64 / 1_000_000.0 * opus_pricing.input_price_per_million;
        let opus_output_cost =
            input.output_tokens as f64 / 1_000_000.0 * opus_pricing.output_price_per_million;

        let sonnet_input_cost =
            input.input_tokens as f64 / 1_000_000.0 * sonnet_pricing.input_price_per_million;
        let sonnet_output_cost =
            input.output_tokens as f64 / 1_000_000.0 * sonnet_pricing.output_price_per_million;

        let current_cost = opus_input_cost + opus_output_cost;
        let sonnet_cost = sonnet_input_cost + sonnet_output_cost;
        let potential_savings = current_cost - sonnet_cost;

        if potential_savings > 0.50 {
            // Only recommend if savings > $0.50
            let savings_pct = (potential_savings / current_cost) * 100.0;

            return Some(Recommendation::new(
                RecommendationType::ModelSelection,
                "Consider using Claude Sonnet for simpler tasks".to_string(),
                format!(
                    "You could save approximately ${:.2} ({:.1}% reduction) by using Claude Sonnet 4.5 \
                    instead of Claude Opus 4.5 for tasks that don't require Opus's advanced capabilities. \
                    Sonnet is highly capable for most coding tasks while being significantly cheaper.",
                    potential_savings,
                    savings_pct
                ),
                potential_savings,
                false,
                0.7, // Medium confidence - depends on task complexity
                vec![
                    "Use Opus for complex architectural decisions and novel problem-solving".to_string(),
                    "Use Sonnet for routine coding, refactoring, and straightforward tasks".to_string(),
                    "Consider Haiku for simple queries, file lookups, and basic operations".to_string(),
                    format!(
                        "Potential savings: ${:.2}/session with this mix",
                        potential_savings * 0.5
                    ),
                ],
                format!(
                    "Current model: Opus, Token cost: ${:.2}, Estimated Sonnet cost: ${:.2}",
                    current_cost, sonnet_cost
                ),
            ));
        }
    }

    None
}

/// Check context growth rate
fn check_context_growth(input: &RecommendationInput) -> Option<Recommendation> {
    if input.cgr <= thresholds::HIGH_CGR {
        return None;
    }

    // High CGR can lead to hitting context limits and increased costs
    let efficiency_loss_pct = ((input.cgr - 2500.0) / 5000.0 * 20.0).min(40.0);

    Some(Recommendation::new(
        RecommendationType::WorkflowOptimization,
        "Reduce context growth rate".to_string(),
        format!(
            "Your Context Growth Rate (CGR) of {:.0} tokens/turn is higher than recommended. \
            This can lead to hitting context limits sooner and increased costs as the context grows.",
            input.cgr
        ),
        efficiency_loss_pct,
        true, // This is a percentage improvement
        0.75,
        vec![
            "Summarize previous work instead of keeping full history".to_string(),
            "Clear unnecessary context between distinct subtasks".to_string(),
            "Use targeted file reads instead of reading entire codebases".to_string(),
            "Consider starting fresh sessions for unrelated tasks".to_string(),
        ],
        format!(
            "CGR: {:.0} tokens/turn (target: <2500), Turn count: {}",
            input.cgr, input.turn_count
        ),
    ))
}

/// Check workflow friction
fn check_workflow_friction(input: &RecommendationInput) -> Option<Recommendation> {
    if input.wfs <= thresholds::HIGH_WFS {
        return None;
    }

    let friction_pct = input.wfs * 100.0;

    Some(Recommendation::new(
        RecommendationType::WorkflowOptimization,
        "Reduce workflow friction".to_string(),
        format!(
            "Your Workflow Friction Score (WFS) of {:.1}% indicates significant rework or \
            clarification cycles. This suggests tasks may not be clearly defined upfront \
            or there are frequent direction changes.",
            friction_pct
        ),
        friction_pct * 0.5, // Could reduce friction by half
        true,
        0.65,
        vec![
            "Provide clearer task specifications upfront".to_string(),
            "Break complex tasks into smaller, well-defined steps".to_string(),
            "Include acceptance criteria in your initial prompt".to_string(),
            "Review and approve intermediate results before proceeding".to_string(),
        ],
        format!(
            "WFS: {:.1}% (target: <30%), Turn count: {}",
            friction_pct, input.turn_count
        ),
    ))
}

/// Check overall efficiency score
fn check_overall_efficiency(input: &RecommendationInput) -> Option<Recommendation> {
    if input.oes >= thresholds::LOW_OES {
        return None;
    }

    // Low OES is a composite issue
    let improvement_potential = (thresholds::LOW_OES - input.oes) / thresholds::LOW_OES * 100.0;

    Some(Recommendation::new(
        RecommendationType::EfficiencyImprovement,
        "Improve overall session efficiency".to_string(),
        format!(
            "Your Overall Efficiency Score (OES) of {:.1}% is below the target of 50%. \
            This composite score reflects issues across cost, time, and cache efficiency.",
            input.oes * 100.0
        ),
        improvement_potential.min(30.0), // Cap at 30% improvement potential
        true,
        0.6,
        vec![
            "Review the specific efficiency metrics (CER, CGR, SEI, WFS) for details".to_string(),
            "Focus on the lowest-scoring metric first".to_string(),
            "Consider workflow restructuring for complex tasks".to_string(),
            "Compare with your more efficient sessions for patterns".to_string(),
        ],
        format!(
            "OES: {:.1}% (target: >50%), Components: CER={:.1}%, CGR={:.0}, WFS={:.1}%",
            input.oes * 100.0,
            input.cer * 100.0,
            input.cgr,
            input.wfs * 100.0
        ),
    ))
}

/// Check for high cost per turn
fn check_cost_per_turn(input: &RecommendationInput) -> Option<Recommendation> {
    if input.avg_cost_per_turn <= thresholds::HIGH_AVG_COST_PER_TURN {
        return None;
    }

    let excess_cost = input.avg_cost_per_turn - thresholds::HIGH_AVG_COST_PER_TURN;
    let potential_savings = excess_cost * input.turn_count as f64 * 0.5;

    Some(Recommendation::new(
        RecommendationType::CostSaving,
        "Reduce cost per turn".to_string(),
        format!(
            "Your average cost of ${:.2} per turn is higher than typical. \
            This may indicate overly broad context or complex queries that could be simplified.",
            input.avg_cost_per_turn
        ),
        potential_savings,
        false,
        0.7,
        vec![
            "Use more targeted queries instead of broad explorations".to_string(),
            "Limit file reads to only necessary files".to_string(),
            "Break complex questions into simpler, focused prompts".to_string(),
            "Use /compact or similar to reset context when appropriate".to_string(),
        ],
        format!(
            "Avg cost/turn: ${:.2} (target: <${:.2}), Total turns: {}",
            input.avg_cost_per_turn,
            thresholds::HIGH_AVG_COST_PER_TURN,
            input.turn_count
        ),
    ))
}

/// Check for high subagent cost ratio
fn check_subagent_cost_ratio(input: &RecommendationInput) -> Option<Recommendation> {
    if input.subagent_count == 0 || input.total_cost == 0.0 {
        return None;
    }

    let ratio = input.subagent_cost / input.total_cost;
    if ratio <= thresholds::HIGH_SUBAGENT_COST_RATIO {
        return None;
    }

    let excess_ratio = ratio - thresholds::HIGH_SUBAGENT_COST_RATIO;
    let potential_savings = input.subagent_cost * (excess_ratio / ratio);

    Some(Recommendation::new(
        RecommendationType::SubagentStrategy,
        "Subagent costs are disproportionately high".to_string(),
        format!(
            "Subagent tasks account for {:.1}% of your total cost (${:.2} of ${:.2}). \
            This is higher than the recommended 40% maximum.",
            ratio * 100.0,
            input.subagent_cost,
            input.total_cost
        ),
        potential_savings,
        false,
        0.8,
        vec![
            "Review which tasks are being delegated to subagents".to_string(),
            "Consider handling simpler subtasks in the main session".to_string(),
            "Ensure subagents are focused on parallelizable work".to_string(),
            "Check if subagent context could be more targeted".to_string(),
        ],
        format!(
            "Subagent cost ratio: {:.1}% (target: <40%), Main cost: ${:.2}, Subagent cost: ${:.2}",
            ratio * 100.0,
            input.total_cost - input.subagent_cost,
            input.subagent_cost
        ),
    ))
}

/// Helper to estimate cache write cost
fn estimate_cache_write_cost(input: &RecommendationInput) -> f64 {
    let pricing = find_pricing(&input.primary_model)
        .unwrap_or_else(|| get_default_pricing()[0].clone());

    input.cache_write_tokens as f64 / 1_000_000.0 * pricing.cache_write_5m_per_million
}

/// Generate aggregate recommendations from multiple sessions
pub fn generate_aggregate_recommendations(
    inputs: &[RecommendationInput],
) -> RecommendationSummary {
    if inputs.is_empty() {
        return RecommendationSummary::from_recommendations(Vec::new(), None, 0);
    }

    // Calculate aggregated metrics
    let total_cost: f64 = inputs.iter().map(|i| i.total_cost).sum();
    let total_turns: u32 = inputs.iter().map(|i| i.turn_count).sum();
    let total_subagent_cost: f64 = inputs.iter().map(|i| i.subagent_cost).sum();
    let total_subagent_count: u32 = inputs.iter().map(|i| i.subagent_count).sum();

    let avg_cer: f64 = inputs.iter().map(|i| i.cer).sum::<f64>() / inputs.len() as f64;
    let avg_cgr: f64 = inputs.iter().map(|i| i.cgr).sum::<f64>() / inputs.len() as f64;
    let avg_oes: f64 = inputs.iter().map(|i| i.oes).sum::<f64>() / inputs.len() as f64;
    let avg_wfs: f64 = inputs.iter().map(|i| i.wfs).sum::<f64>() / inputs.len() as f64;

    let sei_inputs: Vec<f64> = inputs.iter().filter_map(|i| i.sei).collect();
    let avg_sei = if sei_inputs.is_empty() {
        None
    } else {
        Some(sei_inputs.iter().sum::<f64>() / sei_inputs.len() as f64)
    };

    let total_input_tokens: u64 = inputs.iter().map(|i| i.input_tokens).sum();
    let total_output_tokens: u64 = inputs.iter().map(|i| i.output_tokens).sum();
    let total_cache_read_tokens: u64 = inputs.iter().map(|i| i.cache_read_tokens).sum();
    let total_cache_write_tokens: u64 = inputs.iter().map(|i| i.cache_write_tokens).sum();

    // Find most common model
    let primary_model = inputs
        .iter()
        .map(|i| i.primary_model.clone())
        .max_by_key(|m| inputs.iter().filter(|i| i.primary_model == *m).count())
        .unwrap_or_else(|| "claude-opus-4-5-20251101".to_string());

    // Create aggregate input
    let aggregate_input = RecommendationInput {
        session_id: None,
        total_cost,
        cer: avg_cer,
        cgr: avg_cgr,
        sei: avg_sei,
        wfs: avg_wfs,
        oes: avg_oes,
        turn_count: total_turns,
        subagent_count: total_subagent_count,
        subagent_cost: total_subagent_cost,
        primary_model,
        input_tokens: total_input_tokens,
        output_tokens: total_output_tokens,
        cache_read_tokens: total_cache_read_tokens,
        cache_write_tokens: total_cache_write_tokens,
        project_path: None,
        branch: None,
        avg_cost_per_turn: if total_turns > 0 {
            total_cost / total_turns as f64
        } else {
            0.0
        },
    };

    let mut summary = generate_recommendations(&aggregate_input);
    summary.sessions_analyzed = inputs.len() as u32;

    summary
}

#[cfg(test)]
mod tests {
    use super::*;

    fn create_test_input() -> RecommendationInput {
        RecommendationInput {
            session_id: Some("test-session".to_string()),
            total_cost: 10.0,
            cer: 0.6,
            cgr: 1500.0,
            sei: Some(0.3),
            wfs: 0.2,
            oes: 0.55,
            turn_count: 20,
            subagent_count: 5,
            subagent_cost: 2.0,
            primary_model: "claude-opus-4-5-20251101".to_string(),
            input_tokens: 500_000,
            output_tokens: 100_000,
            cache_read_tokens: 400_000,
            cache_write_tokens: 100_000,
            project_path: Some("/path/to/project".to_string()),
            branch: Some("main".to_string()),
            avg_cost_per_turn: 0.5,
        }
    }

    #[test]
    fn test_generate_recommendations_normal_metrics() {
        let input = create_test_input();
        let summary = generate_recommendations(&input);

        // Normal metrics should generate few recommendations
        assert!(summary.recommendations.len() <= 3);
    }

    #[test]
    fn test_low_cer_recommendation() {
        let mut input = create_test_input();
        input.cer = 0.25; // Very low cache efficiency

        let summary = generate_recommendations(&input);

        let cache_rec = summary
            .recommendations
            .iter()
            .find(|r| r.rec_type == RecommendationType::CacheOptimization);

        assert!(cache_rec.is_some());
        let rec = cache_rec.unwrap();
        assert!(rec.potential_savings > 0.0);
        assert!(rec.confidence >= 0.7);
    }

    #[test]
    fn test_low_sei_recommendation() {
        let mut input = create_test_input();
        input.sei = Some(0.1); // Low subagent efficiency
        input.subagent_count = 10;
        input.subagent_cost = 5.0;

        let summary = generate_recommendations(&input);

        let subagent_rec = summary
            .recommendations
            .iter()
            .find(|r| r.rec_type == RecommendationType::SubagentStrategy);

        assert!(subagent_rec.is_some());
    }

    #[test]
    fn test_model_selection_recommendation() {
        let mut input = create_test_input();
        input.primary_model = "claude-opus-4-5-20251101".to_string();
        input.total_cost = 15.0;
        input.input_tokens = 2_000_000;
        input.output_tokens = 500_000;

        let summary = generate_recommendations(&input);

        let model_rec = summary
            .recommendations
            .iter()
            .find(|r| r.rec_type == RecommendationType::ModelSelection);

        assert!(model_rec.is_some());
        let rec = model_rec.unwrap();
        assert!(rec.potential_savings > 0.0);
    }

    #[test]
    fn test_high_cgr_recommendation() {
        let mut input = create_test_input();
        input.cgr = 5000.0; // Very high context growth

        let summary = generate_recommendations(&input);

        let cgr_rec = summary
            .recommendations
            .iter()
            .find(|r| r.title.contains("context growth"));

        assert!(cgr_rec.is_some());
    }

    #[test]
    fn test_high_wfs_recommendation() {
        let mut input = create_test_input();
        input.wfs = 0.5; // High workflow friction

        let summary = generate_recommendations(&input);

        let wfs_rec = summary
            .recommendations
            .iter()
            .find(|r| r.title.contains("friction"));

        assert!(wfs_rec.is_some());
    }

    #[test]
    fn test_low_oes_recommendation() {
        let mut input = create_test_input();
        input.oes = 0.35; // Low overall efficiency

        let summary = generate_recommendations(&input);

        let oes_rec = summary
            .recommendations
            .iter()
            .find(|r| r.rec_type == RecommendationType::EfficiencyImprovement);

        assert!(oes_rec.is_some());
    }

    #[test]
    fn test_high_cost_per_turn_recommendation() {
        let mut input = create_test_input();
        input.avg_cost_per_turn = 1.5; // High cost per turn

        let summary = generate_recommendations(&input);

        let cost_rec = summary
            .recommendations
            .iter()
            .find(|r| r.title.contains("cost per turn"));

        assert!(cost_rec.is_some());
    }

    #[test]
    fn test_high_subagent_cost_ratio() {
        let mut input = create_test_input();
        input.total_cost = 10.0;
        input.subagent_cost = 6.0; // 60% of cost is subagents

        let summary = generate_recommendations(&input);

        let ratio_rec = summary
            .recommendations
            .iter()
            .find(|r| r.title.contains("disproportionately"));

        assert!(ratio_rec.is_some());
    }

    #[test]
    fn test_aggregate_recommendations() {
        let input1 = create_test_input();
        let mut input2 = create_test_input();
        input2.session_id = Some("test-session-2".to_string());
        input2.cer = 0.2; // Different metrics

        let summary = generate_aggregate_recommendations(&[input1, input2]);

        assert_eq!(summary.sessions_analyzed, 2);
        assert!(summary.session_id.is_none()); // Aggregate has no single session ID
    }

    #[test]
    fn test_empty_aggregate() {
        let summary = generate_aggregate_recommendations(&[]);
        assert_eq!(summary.sessions_analyzed, 0);
        assert!(summary.recommendations.is_empty());
    }

    #[test]
    fn test_no_recommendations_for_optimal_session() {
        let input = RecommendationInput {
            session_id: Some("optimal".to_string()),
            total_cost: 0.5, // Low cost
            cer: 0.8,        // Excellent cache efficiency
            cgr: 1000.0,     // Good context growth
            sei: Some(0.5),  // Good subagent efficiency
            wfs: 0.1,        // Low friction
            oes: 0.75,       // Good overall efficiency
            turn_count: 10,
            subagent_count: 2,
            subagent_cost: 0.1,
            primary_model: "claude-sonnet-4-5-20251101".to_string(), // Not using expensive Opus
            input_tokens: 100_000,
            output_tokens: 50_000,
            cache_read_tokens: 80_000,
            cache_write_tokens: 20_000,
            project_path: None,
            branch: None,
            avg_cost_per_turn: 0.05,
        };

        let summary = generate_recommendations(&input);

        // An optimal session should have very few or no recommendations
        assert!(summary.recommendations.len() <= 1);
    }

    #[test]
    fn test_recommendation_sorting() {
        let mut input = create_test_input();
        // Create conditions for multiple recommendations
        input.cer = 0.2;
        input.wfs = 0.5;
        input.oes = 0.3;

        let summary = generate_recommendations(&input);

        // Verify recommendations are sorted by priority
        for i in 1..summary.recommendations.len() {
            assert!(
                summary.recommendations[i - 1].priority_score
                    >= summary.recommendations[i].priority_score
            );
        }
    }
}

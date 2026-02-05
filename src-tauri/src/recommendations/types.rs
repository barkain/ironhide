//! Recommendation types
//!
//! Data structures for representing cost-saving and efficiency recommendations.

use serde::{Deserialize, Serialize};

/// Type of recommendation
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RecommendationType {
    /// Recommendation to reduce costs
    CostSaving,
    /// Recommendation to improve efficiency
    EfficiencyImprovement,
    /// Recommendation to optimize workflow patterns
    WorkflowOptimization,
    /// Recommendation to better utilize cache
    CacheOptimization,
    /// Recommendation regarding subagent usage
    SubagentStrategy,
    /// Recommendation about model selection
    ModelSelection,
}

impl RecommendationType {
    /// Get display label for the recommendation type
    pub fn label(&self) -> &'static str {
        match self {
            Self::CostSaving => "Cost Saving",
            Self::EfficiencyImprovement => "Efficiency Improvement",
            Self::WorkflowOptimization => "Workflow Optimization",
            Self::CacheOptimization => "Cache Optimization",
            Self::SubagentStrategy => "Subagent Strategy",
            Self::ModelSelection => "Model Selection",
        }
    }

    /// Get icon name for UI display
    pub fn icon(&self) -> &'static str {
        match self {
            Self::CostSaving => "dollar-sign",
            Self::EfficiencyImprovement => "trending-up",
            Self::WorkflowOptimization => "git-branch",
            Self::CacheOptimization => "database",
            Self::SubagentStrategy => "users",
            Self::ModelSelection => "cpu",
        }
    }

    /// Get priority weight (higher = more important)
    pub fn priority_weight(&self) -> f64 {
        match self {
            Self::CostSaving => 1.0,
            Self::ModelSelection => 0.95,
            Self::CacheOptimization => 0.85,
            Self::EfficiencyImprovement => 0.8,
            Self::SubagentStrategy => 0.7,
            Self::WorkflowOptimization => 0.6,
        }
    }
}

/// A single recommendation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Recommendation {
    /// Type of recommendation
    pub rec_type: RecommendationType,
    /// Short title for the recommendation
    pub title: String,
    /// Detailed description explaining the recommendation
    pub description: String,
    /// Potential savings (in dollars or percentage improvement)
    pub potential_savings: f64,
    /// Whether potential_savings is a dollar amount or percentage
    pub savings_is_percentage: bool,
    /// Confidence level (0.0 - 1.0)
    pub confidence: f64,
    /// Specific action items to implement this recommendation
    pub action_items: Vec<String>,
    /// What data/metrics this recommendation is based on
    pub based_on: String,
    /// Priority score for sorting (computed from type + savings + confidence)
    pub priority_score: f64,
}

impl Recommendation {
    /// Create a new recommendation with computed priority
    pub fn new(
        rec_type: RecommendationType,
        title: String,
        description: String,
        potential_savings: f64,
        savings_is_percentage: bool,
        confidence: f64,
        action_items: Vec<String>,
        based_on: String,
    ) -> Self {
        // Compute priority: type_weight * confidence * normalized_savings
        let savings_factor = if savings_is_percentage {
            potential_savings / 100.0 // Normalize percentage to 0-1
        } else {
            (potential_savings / 10.0).min(1.0) // Normalize dollars (cap at $10)
        };

        let priority_score = rec_type.priority_weight() * confidence * (0.5 + 0.5 * savings_factor);

        Self {
            rec_type,
            title,
            description,
            potential_savings,
            savings_is_percentage,
            confidence,
            action_items,
            based_on,
            priority_score,
        }
    }

    /// Format the potential savings for display
    pub fn formatted_savings(&self) -> String {
        if self.savings_is_percentage {
            format!("{:.1}%", self.potential_savings)
        } else {
            format!("${:.2}", self.potential_savings)
        }
    }

    /// Get confidence level as a descriptive string
    pub fn confidence_level(&self) -> &'static str {
        if self.confidence >= 0.8 {
            "High"
        } else if self.confidence >= 0.5 {
            "Medium"
        } else {
            "Low"
        }
    }
}

/// Summary of all recommendations for a session or aggregate analysis
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecommendationSummary {
    /// All recommendations sorted by priority
    pub recommendations: Vec<Recommendation>,
    /// Total potential dollar savings across all recommendations
    pub total_potential_savings: f64,
    /// Top priority recommendation (if any)
    pub top_priority: Option<Recommendation>,
    /// Number of high confidence recommendations
    pub high_confidence_count: u32,
    /// Average confidence across all recommendations
    pub avg_confidence: f64,
    /// Session ID analyzed (None if aggregate)
    pub session_id: Option<String>,
    /// Number of sessions analyzed (1 for single, N for aggregate)
    pub sessions_analyzed: u32,
}

impl RecommendationSummary {
    /// Create a new summary from a list of recommendations
    pub fn from_recommendations(
        mut recommendations: Vec<Recommendation>,
        session_id: Option<String>,
        sessions_analyzed: u32,
    ) -> Self {
        // Sort by priority score (highest first)
        recommendations.sort_by(|a, b| {
            b.priority_score
                .partial_cmp(&a.priority_score)
                .unwrap_or(std::cmp::Ordering::Equal)
        });

        // Calculate aggregates
        let total_potential_savings: f64 = recommendations
            .iter()
            .filter(|r| !r.savings_is_percentage) // Only sum dollar amounts
            .map(|r| r.potential_savings)
            .sum();

        let high_confidence_count = recommendations
            .iter()
            .filter(|r| r.confidence >= 0.8)
            .count() as u32;

        let avg_confidence = if recommendations.is_empty() {
            0.0
        } else {
            recommendations.iter().map(|r| r.confidence).sum::<f64>()
                / recommendations.len() as f64
        };

        let top_priority = recommendations.first().cloned();

        Self {
            recommendations,
            total_potential_savings,
            top_priority,
            high_confidence_count,
            avg_confidence,
            session_id,
            sessions_analyzed,
        }
    }

    /// Filter recommendations by minimum confidence
    pub fn with_min_confidence(mut self, min_confidence: f64) -> Self {
        self.recommendations
            .retain(|r| r.confidence >= min_confidence);
        // Recalculate aggregates
        Self::from_recommendations(
            self.recommendations,
            self.session_id,
            self.sessions_analyzed,
        )
    }

    /// Filter recommendations by type
    pub fn with_types(mut self, types: &[RecommendationType]) -> Self {
        self.recommendations
            .retain(|r| types.contains(&r.rec_type));
        Self::from_recommendations(
            self.recommendations,
            self.session_id,
            self.sessions_analyzed,
        )
    }

    /// Limit to top N recommendations
    pub fn limit(mut self, n: usize) -> Self {
        self.recommendations.truncate(n);
        Self::from_recommendations(
            self.recommendations,
            self.session_id,
            self.sessions_analyzed,
        )
    }
}

/// Input data for generating recommendations
#[derive(Debug, Clone)]
pub struct RecommendationInput {
    /// Session ID (if analyzing single session)
    pub session_id: Option<String>,
    /// Total cost of the session(s)
    pub total_cost: f64,
    /// Cache Efficiency Ratio (0.0 - 1.0)
    pub cer: f64,
    /// Context Growth Rate (tokens per turn)
    pub cgr: f64,
    /// Subagent Efficiency Index (if applicable)
    pub sei: Option<f64>,
    /// Workflow Friction Score (0.0 - 1.0)
    pub wfs: f64,
    /// Overall Efficiency Score (0.0 - 1.0)
    pub oes: f64,
    /// Number of turns/cycles
    pub turn_count: u32,
    /// Number of subagents used
    pub subagent_count: u32,
    /// Total subagent cost
    pub subagent_cost: f64,
    /// Primary model used
    pub primary_model: String,
    /// Input tokens
    pub input_tokens: u64,
    /// Output tokens
    pub output_tokens: u64,
    /// Cache read tokens
    pub cache_read_tokens: u64,
    /// Cache write tokens
    pub cache_write_tokens: u64,
    /// Project path for context
    pub project_path: Option<String>,
    /// Branch information (for comparison insights)
    pub branch: Option<String>,
    /// Average cost per turn
    pub avg_cost_per_turn: f64,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_recommendation_type_label() {
        assert_eq!(RecommendationType::CostSaving.label(), "Cost Saving");
        assert_eq!(
            RecommendationType::CacheOptimization.label(),
            "Cache Optimization"
        );
    }

    #[test]
    fn test_recommendation_priority_computation() {
        let rec = Recommendation::new(
            RecommendationType::CostSaving,
            "Test".to_string(),
            "Description".to_string(),
            5.0, // $5 savings
            false,
            0.9, // High confidence
            vec!["Action 1".to_string()],
            "Test data".to_string(),
        );

        assert!(rec.priority_score > 0.0);
        assert!(rec.priority_score <= 1.0);
    }

    #[test]
    fn test_recommendation_formatted_savings() {
        let dollar_rec = Recommendation::new(
            RecommendationType::CostSaving,
            "Test".to_string(),
            "Description".to_string(),
            5.50,
            false,
            0.9,
            vec![],
            "Test".to_string(),
        );
        assert_eq!(dollar_rec.formatted_savings(), "$5.50");

        let pct_rec = Recommendation::new(
            RecommendationType::EfficiencyImprovement,
            "Test".to_string(),
            "Description".to_string(),
            25.5,
            true,
            0.8,
            vec![],
            "Test".to_string(),
        );
        assert_eq!(pct_rec.formatted_savings(), "25.5%");
    }

    #[test]
    fn test_recommendation_confidence_level() {
        let high = Recommendation::new(
            RecommendationType::CostSaving,
            "Test".to_string(),
            "Desc".to_string(),
            1.0,
            false,
            0.85,
            vec![],
            "Test".to_string(),
        );
        assert_eq!(high.confidence_level(), "High");

        let medium = Recommendation::new(
            RecommendationType::CostSaving,
            "Test".to_string(),
            "Desc".to_string(),
            1.0,
            false,
            0.6,
            vec![],
            "Test".to_string(),
        );
        assert_eq!(medium.confidence_level(), "Medium");

        let low = Recommendation::new(
            RecommendationType::CostSaving,
            "Test".to_string(),
            "Desc".to_string(),
            1.0,
            false,
            0.3,
            vec![],
            "Test".to_string(),
        );
        assert_eq!(low.confidence_level(), "Low");
    }

    #[test]
    fn test_summary_sorting() {
        let recs = vec![
            Recommendation::new(
                RecommendationType::WorkflowOptimization,
                "Low Priority".to_string(),
                "Desc".to_string(),
                1.0,
                false,
                0.5,
                vec![],
                "Test".to_string(),
            ),
            Recommendation::new(
                RecommendationType::CostSaving,
                "High Priority".to_string(),
                "Desc".to_string(),
                10.0,
                false,
                0.95,
                vec![],
                "Test".to_string(),
            ),
        ];

        let summary = RecommendationSummary::from_recommendations(recs, None, 1);

        assert_eq!(
            summary.recommendations[0].title,
            "High Priority"
        );
        assert!(summary.top_priority.is_some());
        assert_eq!(
            summary.top_priority.unwrap().title,
            "High Priority"
        );
    }

    #[test]
    fn test_summary_aggregates() {
        let recs = vec![
            Recommendation::new(
                RecommendationType::CostSaving,
                "Rec 1".to_string(),
                "Desc".to_string(),
                5.0,
                false,
                0.9,
                vec![],
                "Test".to_string(),
            ),
            Recommendation::new(
                RecommendationType::CostSaving,
                "Rec 2".to_string(),
                "Desc".to_string(),
                3.0,
                false,
                0.8,
                vec![],
                "Test".to_string(),
            ),
            Recommendation::new(
                RecommendationType::EfficiencyImprovement,
                "Rec 3".to_string(),
                "Desc".to_string(),
                20.0, // Percentage, not counted in total
                true,
                0.7,
                vec![],
                "Test".to_string(),
            ),
        ];

        let summary = RecommendationSummary::from_recommendations(recs, Some("test-session".to_string()), 1);

        assert!((summary.total_potential_savings - 8.0).abs() < 0.01);
        assert_eq!(summary.high_confidence_count, 2);
        assert!(summary.avg_confidence > 0.7 && summary.avg_confidence < 0.9);
        assert_eq!(summary.session_id, Some("test-session".to_string()));
        assert_eq!(summary.sessions_analyzed, 1);
    }

    #[test]
    fn test_summary_filtering() {
        let recs = vec![
            Recommendation::new(
                RecommendationType::CostSaving,
                "High Confidence".to_string(),
                "Desc".to_string(),
                5.0,
                false,
                0.9,
                vec![],
                "Test".to_string(),
            ),
            Recommendation::new(
                RecommendationType::CostSaving,
                "Low Confidence".to_string(),
                "Desc".to_string(),
                3.0,
                false,
                0.4,
                vec![],
                "Test".to_string(),
            ),
        ];

        let summary = RecommendationSummary::from_recommendations(recs, None, 1);
        let filtered = summary.with_min_confidence(0.7);

        assert_eq!(filtered.recommendations.len(), 1);
        assert_eq!(filtered.recommendations[0].title, "High Confidence");
    }

    #[test]
    fn test_summary_limit() {
        let recs = vec![
            Recommendation::new(
                RecommendationType::CostSaving,
                "Rec 1".to_string(),
                "Desc".to_string(),
                10.0,
                false,
                0.95,
                vec![],
                "Test".to_string(),
            ),
            Recommendation::new(
                RecommendationType::CostSaving,
                "Rec 2".to_string(),
                "Desc".to_string(),
                5.0,
                false,
                0.9,
                vec![],
                "Test".to_string(),
            ),
            Recommendation::new(
                RecommendationType::CostSaving,
                "Rec 3".to_string(),
                "Desc".to_string(),
                1.0,
                false,
                0.5,
                vec![],
                "Test".to_string(),
            ),
        ];

        let summary = RecommendationSummary::from_recommendations(recs, None, 1);
        let limited = summary.limit(2);

        assert_eq!(limited.recommendations.len(), 2);
    }

    #[test]
    fn test_recommendation_type_icon() {
        assert_eq!(RecommendationType::CostSaving.icon(), "dollar-sign");
        assert_eq!(RecommendationType::EfficiencyImprovement.icon(), "trending-up");
        assert_eq!(RecommendationType::WorkflowOptimization.icon(), "git-branch");
        assert_eq!(RecommendationType::CacheOptimization.icon(), "database");
        assert_eq!(RecommendationType::SubagentStrategy.icon(), "users");
        assert_eq!(RecommendationType::ModelSelection.icon(), "cpu");
    }

    #[test]
    fn test_recommendation_type_priority_weights() {
        // CostSaving should have highest weight
        assert!(RecommendationType::CostSaving.priority_weight() >=
                RecommendationType::ModelSelection.priority_weight());
        assert!(RecommendationType::ModelSelection.priority_weight() >=
                RecommendationType::CacheOptimization.priority_weight());
        assert!(RecommendationType::CacheOptimization.priority_weight() >=
                RecommendationType::EfficiencyImprovement.priority_weight());
        assert!(RecommendationType::EfficiencyImprovement.priority_weight() >=
                RecommendationType::SubagentStrategy.priority_weight());
        assert!(RecommendationType::SubagentStrategy.priority_weight() >=
                RecommendationType::WorkflowOptimization.priority_weight());
    }

    #[test]
    fn test_recommendation_priority_score_bounds() {
        // Priority score should be bounded between 0 and 1
        let rec = Recommendation::new(
            RecommendationType::CostSaving,
            "Test".to_string(),
            "Description".to_string(),
            100.0, // Large savings
            false,
            1.0, // Max confidence
            vec!["Action 1".to_string()],
            "Test data".to_string(),
        );

        assert!(rec.priority_score > 0.0);
        assert!(rec.priority_score <= 1.0);
    }

    #[test]
    fn test_recommendation_with_percentage_savings() {
        let rec = Recommendation::new(
            RecommendationType::EfficiencyImprovement,
            "Improve efficiency".to_string(),
            "Description".to_string(),
            50.0, // 50% improvement
            true, // Is percentage
            0.8,
            vec![],
            "Test".to_string(),
        );

        assert_eq!(rec.formatted_savings(), "50.0%");
        assert!(rec.savings_is_percentage);
    }

    #[test]
    fn test_summary_with_types_filter() {
        let recs = vec![
            Recommendation::new(
                RecommendationType::CostSaving,
                "Cost".to_string(),
                "Desc".to_string(),
                5.0,
                false,
                0.9,
                vec![],
                "Test".to_string(),
            ),
            Recommendation::new(
                RecommendationType::CacheOptimization,
                "Cache".to_string(),
                "Desc".to_string(),
                3.0,
                false,
                0.8,
                vec![],
                "Test".to_string(),
            ),
            Recommendation::new(
                RecommendationType::SubagentStrategy,
                "Subagent".to_string(),
                "Desc".to_string(),
                2.0,
                false,
                0.7,
                vec![],
                "Test".to_string(),
            ),
        ];

        let summary = RecommendationSummary::from_recommendations(recs, None, 1);
        let filtered = summary.with_types(&[RecommendationType::CostSaving, RecommendationType::CacheOptimization]);

        assert_eq!(filtered.recommendations.len(), 2);
        assert!(filtered.recommendations.iter().all(|r|
            r.rec_type == RecommendationType::CostSaving ||
            r.rec_type == RecommendationType::CacheOptimization
        ));
    }

    #[test]
    fn test_summary_total_potential_savings_excludes_percentages() {
        let recs = vec![
            Recommendation::new(
                RecommendationType::CostSaving,
                "Dollar".to_string(),
                "Desc".to_string(),
                10.0,
                false, // Dollar amount
                0.9,
                vec![],
                "Test".to_string(),
            ),
            Recommendation::new(
                RecommendationType::EfficiencyImprovement,
                "Percent".to_string(),
                "Desc".to_string(),
                50.0,
                true, // Percentage - should not be counted
                0.8,
                vec![],
                "Test".to_string(),
            ),
        ];

        let summary = RecommendationSummary::from_recommendations(recs, None, 1);

        // Only the $10 should be counted, not the 50%
        assert!((summary.total_potential_savings - 10.0).abs() < 0.001);
    }

    #[test]
    fn test_empty_summary() {
        let summary = RecommendationSummary::from_recommendations(vec![], None, 0);

        assert!(summary.recommendations.is_empty());
        assert_eq!(summary.total_potential_savings, 0.0);
        assert!(summary.top_priority.is_none());
        assert_eq!(summary.high_confidence_count, 0);
        assert_eq!(summary.avg_confidence, 0.0);
    }

    #[test]
    fn test_recommendation_with_action_items() {
        let rec = Recommendation::new(
            RecommendationType::WorkflowOptimization,
            "Optimize workflow".to_string(),
            "Description".to_string(),
            2.0,
            false,
            0.7,
            vec![
                "Action 1".to_string(),
                "Action 2".to_string(),
                "Action 3".to_string(),
            ],
            "Test".to_string(),
        );

        assert_eq!(rec.action_items.len(), 3);
        assert_eq!(rec.action_items[0], "Action 1");
    }

    #[test]
    fn test_recommendation_serialization() {
        let rec = Recommendation::new(
            RecommendationType::ModelSelection,
            "Consider Sonnet".to_string(),
            "Use Sonnet for simple tasks".to_string(),
            5.0,
            false,
            0.75,
            vec!["Switch to Sonnet".to_string()],
            "Token analysis".to_string(),
        );

        let json = serde_json::to_string(&rec).unwrap();
        assert!(json.contains("\"rec_type\":\"model_selection\""));
        assert!(json.contains("\"title\":\"Consider Sonnet\""));
        assert!(json.contains("\"potential_savings\":5.0"));
        assert!(json.contains("\"confidence\":0.75"));
    }

    #[test]
    fn test_recommendation_input_fields() {
        let input = RecommendationInput {
            session_id: Some("test-123".to_string()),
            total_cost: 15.0,
            cer: 0.65,
            cgr: 2000.0,
            sei: Some(0.25),
            wfs: 0.15,
            oes: 0.70,
            turn_count: 25,
            subagent_count: 3,
            subagent_cost: 3.0,
            primary_model: "claude-opus-4-5-20251101".to_string(),
            input_tokens: 600_000,
            output_tokens: 150_000,
            cache_read_tokens: 500_000,
            cache_write_tokens: 120_000,
            project_path: Some("/path/to/project".to_string()),
            branch: Some("feature-branch".to_string()),
            avg_cost_per_turn: 0.6,
        };

        assert_eq!(input.session_id, Some("test-123".to_string()));
        assert_eq!(input.subagent_count, 3);
        assert_eq!(input.branch, Some("feature-branch".to_string()));
    }
}

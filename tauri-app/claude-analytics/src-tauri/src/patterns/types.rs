//! Anti-pattern types and data structures
//!
//! Defines the types of anti-patterns detected and the structure
//! for reporting detected patterns.

use serde::{Deserialize, Serialize};

/// Types of anti-patterns that can be detected in Claude Code sessions
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AntiPatternType {
    /// SEI < 0.1 (too many subagents for output)
    SubagentSprawl,
    /// CER < 0.4 (poor cache utilization)
    ContextChurn,
    /// Turn cost > 3x session average
    CostSpike,
    /// Turn duration > 5 minutes
    LongTurn,
    /// 3+ consecutive tool failures
    ToolFailureSpree,
    /// Many edits to same files (rework)
    HighReworkRatio,
}

impl AntiPatternType {
    /// Get display name for the pattern type
    pub fn display_name(&self) -> &'static str {
        match self {
            Self::SubagentSprawl => "Subagent Sprawl",
            Self::ContextChurn => "Context Churn",
            Self::CostSpike => "Cost Spike",
            Self::LongTurn => "Long Turn",
            Self::ToolFailureSpree => "Tool Failure Spree",
            Self::HighReworkRatio => "High Rework Ratio",
        }
    }

    /// Get a brief description of the pattern
    pub fn description(&self) -> &'static str {
        match self {
            Self::SubagentSprawl => "Too many subagents spawned relative to output produced",
            Self::ContextChurn => "Poor cache efficiency - context being rebuilt frequently",
            Self::CostSpike => "Turn cost significantly higher than session average",
            Self::LongTurn => "Turn took longer than expected",
            Self::ToolFailureSpree => "Multiple consecutive tool failures detected",
            Self::HighReworkRatio => "High ratio of repeated edits to same files",
        }
    }

    /// Get all pattern types
    pub fn all() -> Vec<AntiPatternType> {
        vec![
            Self::SubagentSprawl,
            Self::ContextChurn,
            Self::CostSpike,
            Self::LongTurn,
            Self::ToolFailureSpree,
            Self::HighReworkRatio,
        ]
    }

    /// Parse from string
    pub fn from_str(s: &str) -> Option<Self> {
        match s.to_lowercase().as_str() {
            "subagent_sprawl" | "subagentsprawl" => Some(Self::SubagentSprawl),
            "context_churn" | "contextchurn" => Some(Self::ContextChurn),
            "cost_spike" | "costspike" => Some(Self::CostSpike),
            "long_turn" | "longturn" => Some(Self::LongTurn),
            "tool_failure_spree" | "toolfailurespree" => Some(Self::ToolFailureSpree),
            "high_rework_ratio" | "highreworkratio" => Some(Self::HighReworkRatio),
            _ => None,
        }
    }
}

/// Severity level for detected patterns
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Severity {
    /// Informational - might indicate inefficiency
    Info,
    /// Warning - likely causing cost/time overhead
    Warning,
    /// Critical - significant impact on efficiency
    Critical,
}

impl Severity {
    /// Get display string
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Info => "info",
            Self::Warning => "warning",
            Self::Critical => "critical",
        }
    }
}

/// A detected anti-pattern instance
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DetectedPattern {
    /// Type of anti-pattern detected
    pub pattern_type: AntiPatternType,
    /// Severity of the pattern
    pub severity: Severity,
    /// Session where pattern was detected
    pub session_id: String,
    /// Specific turn number (if applicable)
    pub turn_number: Option<u32>,
    /// Human-readable description
    pub description: String,
    /// Estimated cost impact in dollars
    pub impact_cost: f64,
    /// Suggestion for improvement
    pub suggestion: String,
    /// The metric value that triggered detection
    pub metric_value: f64,
    /// The threshold that was exceeded
    pub threshold: f64,
}

impl DetectedPattern {
    /// Create a new detected pattern
    pub fn new(
        pattern_type: AntiPatternType,
        severity: Severity,
        session_id: String,
        turn_number: Option<u32>,
        description: String,
        impact_cost: f64,
        suggestion: String,
        metric_value: f64,
        threshold: f64,
    ) -> Self {
        Self {
            pattern_type,
            severity,
            session_id,
            turn_number,
            description,
            impact_cost,
            suggestion,
            metric_value,
            threshold,
        }
    }

    /// Get severity as string (for backwards compatibility)
    pub fn severity_str(&self) -> &'static str {
        self.severity.as_str()
    }
}

/// Thresholds for anti-pattern detection
#[derive(Debug, Clone)]
pub struct DetectionThresholds {
    /// SEI threshold for SubagentSprawl (default: 0.1)
    pub sei_min: f64,
    /// CER threshold for ContextChurn (default: 0.4)
    pub cer_min: f64,
    /// Multiplier for CostSpike detection (default: 3.0)
    pub cost_spike_multiplier: f64,
    /// Duration threshold for LongTurn in ms (default: 300000 = 5 min)
    pub long_turn_ms: i64,
    /// Consecutive failures for ToolFailureSpree (default: 3)
    pub consecutive_failures: u32,
    /// Rework ratio threshold for HighReworkRatio (default: 0.4)
    pub rework_ratio_max: f64,
}

impl Default for DetectionThresholds {
    fn default() -> Self {
        Self {
            sei_min: 0.1,
            cer_min: 0.4,
            cost_spike_multiplier: 3.0,
            long_turn_ms: 300_000, // 5 minutes
            consecutive_failures: 3,
            rework_ratio_max: 0.4,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_antipattern_type_display() {
        assert_eq!(AntiPatternType::SubagentSprawl.display_name(), "Subagent Sprawl");
        assert_eq!(AntiPatternType::ContextChurn.display_name(), "Context Churn");
        assert_eq!(AntiPatternType::CostSpike.display_name(), "Cost Spike");
        assert_eq!(AntiPatternType::LongTurn.display_name(), "Long Turn");
        assert_eq!(AntiPatternType::ToolFailureSpree.display_name(), "Tool Failure Spree");
        assert_eq!(AntiPatternType::HighReworkRatio.display_name(), "High Rework Ratio");
    }

    #[test]
    fn test_antipattern_type_from_str() {
        assert_eq!(
            AntiPatternType::from_str("subagent_sprawl"),
            Some(AntiPatternType::SubagentSprawl)
        );
        assert_eq!(
            AntiPatternType::from_str("context_churn"),
            Some(AntiPatternType::ContextChurn)
        );
        assert_eq!(
            AntiPatternType::from_str("COST_SPIKE"),
            Some(AntiPatternType::CostSpike)
        );
        assert_eq!(AntiPatternType::from_str("unknown"), None);
    }

    #[test]
    fn test_antipattern_type_all() {
        let all = AntiPatternType::all();
        assert_eq!(all.len(), 6);
    }

    #[test]
    fn test_severity_as_str() {
        assert_eq!(Severity::Info.as_str(), "info");
        assert_eq!(Severity::Warning.as_str(), "warning");
        assert_eq!(Severity::Critical.as_str(), "critical");
    }

    #[test]
    fn test_detected_pattern_creation() {
        let pattern = DetectedPattern::new(
            AntiPatternType::CostSpike,
            Severity::Warning,
            "session-123".to_string(),
            Some(5),
            "Turn cost is 4x the session average".to_string(),
            2.50,
            "Consider breaking this task into smaller steps".to_string(),
            4.0,
            3.0,
        );

        assert_eq!(pattern.pattern_type, AntiPatternType::CostSpike);
        assert_eq!(pattern.severity, Severity::Warning);
        assert_eq!(pattern.session_id, "session-123");
        assert_eq!(pattern.turn_number, Some(5));
        assert!((pattern.impact_cost - 2.50).abs() < 0.001);
        assert!((pattern.metric_value - 4.0).abs() < 0.001);
        assert!((pattern.threshold - 3.0).abs() < 0.001);
    }

    #[test]
    fn test_detected_pattern_serialization() {
        let pattern = DetectedPattern::new(
            AntiPatternType::ContextChurn,
            Severity::Critical,
            "session-456".to_string(),
            None,
            "Cache efficiency is very low".to_string(),
            5.00,
            "Review context management strategy".to_string(),
            0.25,
            0.4,
        );

        let json = serde_json::to_string(&pattern).unwrap();
        assert!(json.contains("\"pattern_type\":\"context_churn\""));
        assert!(json.contains("\"severity\":\"critical\""));
        assert!(json.contains("\"session_id\":\"session-456\""));
        assert!(json.contains("\"turn_number\":null"));
    }

    #[test]
    fn test_default_thresholds() {
        let thresholds = DetectionThresholds::default();
        assert!((thresholds.sei_min - 0.1).abs() < 0.001);
        assert!((thresholds.cer_min - 0.4).abs() < 0.001);
        assert!((thresholds.cost_spike_multiplier - 3.0).abs() < 0.001);
        assert_eq!(thresholds.long_turn_ms, 300_000);
        assert_eq!(thresholds.consecutive_failures, 3);
        assert!((thresholds.rework_ratio_max - 0.4).abs() < 0.001);
    }

    #[test]
    fn test_antipattern_type_description() {
        assert!(!AntiPatternType::SubagentSprawl.description().is_empty());
        assert!(!AntiPatternType::ContextChurn.description().is_empty());
        assert!(!AntiPatternType::CostSpike.description().is_empty());
        assert!(!AntiPatternType::LongTurn.description().is_empty());
        assert!(!AntiPatternType::ToolFailureSpree.description().is_empty());
        assert!(!AntiPatternType::HighReworkRatio.description().is_empty());
    }

    #[test]
    fn test_antipattern_type_from_str_case_insensitive() {
        // Test various case combinations
        assert_eq!(
            AntiPatternType::from_str("SUBAGENT_SPRAWL"),
            Some(AntiPatternType::SubagentSprawl)
        );
        assert_eq!(
            AntiPatternType::from_str("Context_Churn"),
            Some(AntiPatternType::ContextChurn)
        );
        assert_eq!(
            AntiPatternType::from_str("costspike"),
            Some(AntiPatternType::CostSpike)
        );
        assert_eq!(
            AntiPatternType::from_str("LongTurn"),
            Some(AntiPatternType::LongTurn)
        );
        assert_eq!(
            AntiPatternType::from_str("TOOL_FAILURE_SPREE"),
            Some(AntiPatternType::ToolFailureSpree)
        );
        assert_eq!(
            AntiPatternType::from_str("highreworkratio"),
            Some(AntiPatternType::HighReworkRatio)
        );
    }

    #[test]
    fn test_detected_pattern_severity_str() {
        let pattern = DetectedPattern::new(
            AntiPatternType::CostSpike,
            Severity::Critical,
            "session-123".to_string(),
            Some(5),
            "Test".to_string(),
            2.50,
            "Suggestion".to_string(),
            4.0,
            3.0,
        );

        assert_eq!(pattern.severity_str(), "critical");
    }

    #[test]
    fn test_detected_pattern_deserialization() {
        let json = r#"{
            "pattern_type": "cost_spike",
            "severity": "warning",
            "session_id": "sess-123",
            "turn_number": 5,
            "description": "Test description",
            "impact_cost": 2.5,
            "suggestion": "Test suggestion",
            "metric_value": 4.0,
            "threshold": 3.0
        }"#;

        let pattern: DetectedPattern = serde_json::from_str(json).unwrap();
        assert_eq!(pattern.pattern_type, AntiPatternType::CostSpike);
        assert_eq!(pattern.severity, Severity::Warning);
        assert_eq!(pattern.session_id, "sess-123");
        assert_eq!(pattern.turn_number, Some(5));
    }

    #[test]
    fn test_custom_thresholds() {
        let thresholds = DetectionThresholds {
            sei_min: 0.2,
            cer_min: 0.5,
            cost_spike_multiplier: 5.0,
            long_turn_ms: 600_000,
            consecutive_failures: 5,
            rework_ratio_max: 0.6,
        };

        assert!((thresholds.sei_min - 0.2).abs() < 0.001);
        assert!((thresholds.cer_min - 0.5).abs() < 0.001);
        assert!((thresholds.cost_spike_multiplier - 5.0).abs() < 0.001);
        assert_eq!(thresholds.long_turn_ms, 600_000);
        assert_eq!(thresholds.consecutive_failures, 5);
        assert!((thresholds.rework_ratio_max - 0.6).abs() < 0.001);
    }
}

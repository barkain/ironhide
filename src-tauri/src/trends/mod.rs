//! Trend analysis module
//!
//! This module handles historical trend calculations:
//! - Daily/weekly/monthly aggregation of session data
//! - Period-over-period comparisons
//! - Time-series data for charts and visualization

pub mod daily;
pub mod weekly;
pub mod monthly;

use serde::{Deserialize, Serialize};

/// Represents a single day's aggregated data
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DailyTrend {
    /// Date in YYYY-MM-DD format
    pub date: String,
    /// Number of sessions on this day
    pub sessions: u32,
    /// Total number of turns across all sessions
    pub turns: u32,
    /// Total tokens used
    pub total_tokens: u64,
    /// Total cost in USD
    pub total_cost: f64,
    /// Average efficiency score (OES) for the day
    pub avg_efficiency: f64,
}

impl DailyTrend {
    /// Create a new empty DailyTrend for a given date
    pub fn new(date: String) -> Self {
        Self {
            date,
            sessions: 0,
            turns: 0,
            total_tokens: 0,
            total_cost: 0.0,
            avg_efficiency: 0.0,
        }
    }

    /// Add session data to this day's trend
    pub fn add_session(&mut self, turns: u32, tokens: u64, cost: f64, efficiency: f64) {
        let prev_total_eff = self.avg_efficiency * self.sessions as f64;
        self.sessions += 1;
        self.turns += turns;
        self.total_tokens += tokens;
        self.total_cost += cost;
        // Update running average of efficiency
        self.avg_efficiency = (prev_total_eff + efficiency) / self.sessions as f64;
    }
}

/// Represents a weekly aggregation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WeeklyTrend {
    /// Week start date in YYYY-MM-DD format (Monday)
    pub week_start: String,
    /// Week end date in YYYY-MM-DD format (Sunday)
    pub week_end: String,
    /// ISO week number
    pub week_number: u32,
    /// Number of sessions this week
    pub sessions: u32,
    /// Total number of turns
    pub turns: u32,
    /// Total tokens used
    pub total_tokens: u64,
    /// Total cost in USD
    pub total_cost: f64,
    /// Average efficiency score
    pub avg_efficiency: f64,
    /// Daily breakdown
    pub daily: Vec<DailyTrend>,
}

/// Represents a monthly aggregation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MonthlyTrend {
    /// Month in YYYY-MM format
    pub month: String,
    /// Number of sessions this month
    pub sessions: u32,
    /// Total number of turns
    pub turns: u32,
    /// Total tokens used
    pub total_tokens: u64,
    /// Total cost in USD
    pub total_cost: f64,
    /// Average efficiency score
    pub avg_efficiency: f64,
    /// Weekly breakdown
    pub weekly: Vec<WeeklyTrend>,
}

/// Summary of trend data with period-over-period comparisons
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrendSummary {
    /// Daily trend data
    pub daily: Vec<DailyTrend>,
    /// Total sessions in the period
    pub total_sessions: u32,
    /// Total cost in the period
    pub total_cost: f64,
    /// Total tokens in the period
    pub total_tokens: u64,
    /// Cost change percentage vs previous period
    /// Positive = increase, Negative = decrease
    pub cost_change_percent: f64,
    /// Efficiency change percentage vs previous period
    pub efficiency_change_percent: f64,
    /// Average efficiency for the period
    pub avg_efficiency: f64,
}

impl TrendSummary {
    /// Create a new TrendSummary from daily data
    pub fn from_daily(daily: Vec<DailyTrend>) -> Self {
        let total_sessions: u32 = daily.iter().map(|d| d.sessions).sum();
        let total_cost: f64 = daily.iter().map(|d| d.total_cost).sum();
        let total_tokens: u64 = daily.iter().map(|d| d.total_tokens).sum();

        // Calculate weighted average efficiency
        let total_eff_weighted: f64 = daily.iter()
            .map(|d| d.avg_efficiency * d.sessions as f64)
            .sum();
        let avg_efficiency = if total_sessions > 0 {
            total_eff_weighted / total_sessions as f64
        } else {
            0.0
        };

        Self {
            daily,
            total_sessions,
            total_cost,
            total_tokens,
            cost_change_percent: 0.0,
            efficiency_change_percent: 0.0,
            avg_efficiency,
        }
    }

    /// Calculate period-over-period changes by comparing with previous period data
    pub fn with_comparison(mut self, previous: &TrendSummary) -> Self {
        // Cost change percentage
        self.cost_change_percent = if previous.total_cost > 0.0 {
            ((self.total_cost - previous.total_cost) / previous.total_cost) * 100.0
        } else if self.total_cost > 0.0 {
            100.0 // New spending when there was none before
        } else {
            0.0
        };

        // Efficiency change percentage
        self.efficiency_change_percent = if previous.avg_efficiency > 0.0 {
            ((self.avg_efficiency - previous.avg_efficiency) / previous.avg_efficiency) * 100.0
        } else if self.avg_efficiency > 0.0 {
            100.0
        } else {
            0.0
        };

        self
    }
}

/// Granularity level for trend queries
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Granularity {
    Daily,
    Weekly,
    Monthly,
}

impl Default for Granularity {
    fn default() -> Self {
        Granularity::Daily
    }
}

impl From<&str> for Granularity {
    fn from(s: &str) -> Self {
        match s.to_lowercase().as_str() {
            "weekly" => Granularity::Weekly,
            "monthly" => Granularity::Monthly,
            _ => Granularity::Daily,
        }
    }
}

impl From<Option<String>> for Granularity {
    fn from(s: Option<String>) -> Self {
        match s {
            Some(val) => Granularity::from(val.as_str()),
            None => Granularity::default(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_daily_trend_new() {
        let trend = DailyTrend::new("2026-02-05".to_string());
        assert_eq!(trend.date, "2026-02-05");
        assert_eq!(trend.sessions, 0);
        assert_eq!(trend.turns, 0);
        assert_eq!(trend.total_tokens, 0);
        assert_eq!(trend.total_cost, 0.0);
        assert_eq!(trend.avg_efficiency, 0.0);
    }

    #[test]
    fn test_daily_trend_add_session() {
        let mut trend = DailyTrend::new("2026-02-05".to_string());
        trend.add_session(10, 5000, 1.50, 0.80);

        assert_eq!(trend.sessions, 1);
        assert_eq!(trend.turns, 10);
        assert_eq!(trend.total_tokens, 5000);
        assert_eq!(trend.total_cost, 1.50);
        assert_eq!(trend.avg_efficiency, 0.80);

        // Add another session
        trend.add_session(15, 8000, 2.50, 0.90);

        assert_eq!(trend.sessions, 2);
        assert_eq!(trend.turns, 25);
        assert_eq!(trend.total_tokens, 13000);
        assert_eq!(trend.total_cost, 4.00);
        assert!((trend.avg_efficiency - 0.85).abs() < 0.001);
    }

    #[test]
    fn test_trend_summary_from_daily() {
        let daily = vec![
            {
                let mut t = DailyTrend::new("2026-02-01".to_string());
                t.add_session(10, 5000, 1.50, 0.80);
                t
            },
            {
                let mut t = DailyTrend::new("2026-02-02".to_string());
                t.add_session(15, 8000, 2.50, 0.90);
                t.add_session(5, 2000, 0.50, 0.70);
                t
            },
        ];

        let summary = TrendSummary::from_daily(daily);

        assert_eq!(summary.total_sessions, 3);
        assert_eq!(summary.total_cost, 4.50);
        assert_eq!(summary.total_tokens, 15000);
    }

    #[test]
    fn test_trend_summary_with_comparison() {
        let current = TrendSummary {
            daily: vec![],
            total_sessions: 10,
            total_cost: 100.0,
            total_tokens: 50000,
            cost_change_percent: 0.0,
            efficiency_change_percent: 0.0,
            avg_efficiency: 0.85,
        };

        let previous = TrendSummary {
            daily: vec![],
            total_sessions: 8,
            total_cost: 80.0,
            total_tokens: 40000,
            cost_change_percent: 0.0,
            efficiency_change_percent: 0.0,
            avg_efficiency: 0.80,
        };

        let with_comparison = current.with_comparison(&previous);

        // Cost increased by 25%
        assert!((with_comparison.cost_change_percent - 25.0).abs() < 0.001);
        // Efficiency increased by 6.25%
        assert!((with_comparison.efficiency_change_percent - 6.25).abs() < 0.001);
    }

    #[test]
    fn test_granularity_from_str() {
        assert_eq!(Granularity::from("daily"), Granularity::Daily);
        assert_eq!(Granularity::from("DAILY"), Granularity::Daily);
        assert_eq!(Granularity::from("weekly"), Granularity::Weekly);
        assert_eq!(Granularity::from("Weekly"), Granularity::Weekly);
        assert_eq!(Granularity::from("monthly"), Granularity::Monthly);
        assert_eq!(Granularity::from("MONTHLY"), Granularity::Monthly);
        assert_eq!(Granularity::from("unknown"), Granularity::Daily);
    }

    #[test]
    fn test_granularity_from_option() {
        assert_eq!(Granularity::from(None), Granularity::Daily);
        assert_eq!(Granularity::from(Some("weekly".to_string())), Granularity::Weekly);
    }

    #[test]
    fn test_daily_trend_serialization() {
        let trend = DailyTrend {
            date: "2026-02-05".to_string(),
            sessions: 5,
            turns: 50,
            total_tokens: 25000,
            total_cost: 7.50,
            avg_efficiency: 0.82,
        };

        let json = serde_json::to_string(&trend).unwrap();
        assert!(json.contains("\"date\":\"2026-02-05\""));
        assert!(json.contains("\"sessions\":5"));
        assert!(json.contains("\"turns\":50"));
        assert!(json.contains("\"total_tokens\":25000"));
        assert!(json.contains("\"total_cost\":7.5"));
        assert!(json.contains("\"avg_efficiency\":0.82"));
    }

    #[test]
    fn test_trend_summary_serialization() {
        let summary = TrendSummary {
            daily: vec![DailyTrend::new("2026-02-05".to_string())],
            total_sessions: 10,
            total_cost: 50.0,
            total_tokens: 100000,
            cost_change_percent: 15.5,
            efficiency_change_percent: -5.2,
            avg_efficiency: 0.78,
        };

        let json = serde_json::to_string(&summary).unwrap();
        assert!(json.contains("\"total_sessions\":10"));
        assert!(json.contains("\"total_cost\":50.0"));
        assert!(json.contains("\"cost_change_percent\":15.5"));
        assert!(json.contains("\"efficiency_change_percent\":-5.2"));
    }

    #[test]
    fn test_daily_trend_multiple_sessions_efficiency_calculation() {
        // Test that efficiency is properly averaged across multiple sessions
        let mut trend = DailyTrend::new("2026-02-05".to_string());

        // Add 3 sessions with different efficiencies
        trend.add_session(10, 5000, 1.00, 0.60);
        trend.add_session(10, 5000, 1.00, 0.80);
        trend.add_session(10, 5000, 1.00, 1.00);

        assert_eq!(trend.sessions, 3);
        // Average efficiency should be (0.60 + 0.80 + 1.00) / 3 = 0.80
        assert!((trend.avg_efficiency - 0.80).abs() < 0.001);
    }

    #[test]
    fn test_trend_summary_from_empty_daily() {
        let daily: Vec<DailyTrend> = vec![];
        let summary = TrendSummary::from_daily(daily);

        assert_eq!(summary.total_sessions, 0);
        assert_eq!(summary.total_cost, 0.0);
        assert_eq!(summary.total_tokens, 0);
        assert_eq!(summary.avg_efficiency, 0.0);
    }

    #[test]
    fn test_trend_summary_comparison_with_zero_previous() {
        let current = TrendSummary {
            daily: vec![],
            total_sessions: 5,
            total_cost: 50.0,
            total_tokens: 10000,
            cost_change_percent: 0.0,
            efficiency_change_percent: 0.0,
            avg_efficiency: 0.75,
        };

        let previous = TrendSummary {
            daily: vec![],
            total_sessions: 0,
            total_cost: 0.0,
            total_tokens: 0,
            cost_change_percent: 0.0,
            efficiency_change_percent: 0.0,
            avg_efficiency: 0.0,
        };

        let with_comparison = current.with_comparison(&previous);

        // When previous is zero, change should be 100%
        assert!((with_comparison.cost_change_percent - 100.0).abs() < 0.001);
        assert!((with_comparison.efficiency_change_percent - 100.0).abs() < 0.001);
    }

    #[test]
    fn test_trend_summary_comparison_negative_change() {
        let current = TrendSummary {
            daily: vec![],
            total_sessions: 5,
            total_cost: 50.0,
            total_tokens: 10000,
            cost_change_percent: 0.0,
            efficiency_change_percent: 0.0,
            avg_efficiency: 0.70,
        };

        let previous = TrendSummary {
            daily: vec![],
            total_sessions: 10,
            total_cost: 100.0,
            total_tokens: 20000,
            cost_change_percent: 0.0,
            efficiency_change_percent: 0.0,
            avg_efficiency: 0.80,
        };

        let with_comparison = current.with_comparison(&previous);

        // Cost decreased by 50%
        assert!((with_comparison.cost_change_percent - (-50.0)).abs() < 0.001);
        // Efficiency decreased by 12.5%
        assert!((with_comparison.efficiency_change_percent - (-12.5)).abs() < 0.001);
    }

    #[test]
    fn test_granularity_default() {
        let default = Granularity::default();
        assert_eq!(default, Granularity::Daily);
    }
}

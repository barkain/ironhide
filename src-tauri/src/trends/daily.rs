//! Daily trend calculations
//!
//! Aggregates session data by day for trend analysis.

use std::collections::HashMap;
use chrono::{NaiveDate, Utc, Duration as ChronoDuration};

use super::{DailyTrend, TrendSummary};

/// Parse a date string in YYYY-MM-DD format
pub fn parse_date(date_str: &str) -> Option<NaiveDate> {
    NaiveDate::parse_from_str(date_str, "%Y-%m-%d").ok()
}

/// Extract date from ISO 8601 timestamp
///
/// Handles formats like:
/// - "2026-02-05T10:30:00.000Z"
/// - "2026-02-05T10:30:00Z"
/// - "2026-02-05"
pub fn extract_date_from_timestamp(timestamp: &str) -> Option<String> {
    // Try to extract just the date portion
    if timestamp.len() >= 10 {
        let date_part = &timestamp[0..10];
        if parse_date(date_part).is_some() {
            return Some(date_part.to_string());
        }
    }
    None
}

/// Get current date as YYYY-MM-DD string
pub fn today() -> String {
    Utc::now().format("%Y-%m-%d").to_string()
}

/// Get date N days ago as YYYY-MM-DD string
pub fn days_ago(n: i64) -> String {
    let date = Utc::now() - ChronoDuration::days(n);
    date.format("%Y-%m-%d").to_string()
}

/// Session data for aggregation
#[derive(Debug, Clone)]
pub struct SessionData {
    pub started_at: String,
    pub turns: u32,
    pub tokens: u64,
    pub cost: f64,
    pub efficiency: f64,
}

/// Aggregate session data by day
///
/// Takes a list of session data and returns a map of date -> DailyTrend
pub fn aggregate_by_day(sessions: &[SessionData]) -> HashMap<String, DailyTrend> {
    let mut daily_map: HashMap<String, DailyTrend> = HashMap::new();

    for session in sessions {
        if let Some(date) = extract_date_from_timestamp(&session.started_at) {
            let trend = daily_map.entry(date.clone())
                .or_insert_with(|| DailyTrend::new(date));
            trend.add_session(session.turns, session.tokens, session.cost, session.efficiency);
        }
    }

    daily_map
}

/// Convert daily map to sorted vector
pub fn daily_map_to_sorted_vec(map: HashMap<String, DailyTrend>) -> Vec<DailyTrend> {
    let mut trends: Vec<DailyTrend> = map.into_values().collect();
    trends.sort_by(|a, b| a.date.cmp(&b.date));
    trends
}

/// Filter daily trends by date range
pub fn filter_by_date_range(
    trends: Vec<DailyTrend>,
    start_date: Option<&str>,
    end_date: Option<&str>,
) -> Vec<DailyTrend> {
    let start = start_date.and_then(parse_date);
    let end = end_date.and_then(parse_date);

    trends.into_iter()
        .filter(|t| {
            let date = match parse_date(&t.date) {
                Some(d) => d,
                None => return false,
            };

            let after_start = match start {
                Some(s) => date >= s,
                None => true,
            };

            let before_end = match end {
                Some(e) => date <= e,
                None => true,
            };

            after_start && before_end
        })
        .collect()
}

/// Get daily trends for the last N days
pub fn get_daily_trends(
    sessions: &[SessionData],
    days: u32,
    start_date: Option<&str>,
    end_date: Option<&str>,
) -> Vec<DailyTrend> {
    // Aggregate by day
    let daily_map = aggregate_by_day(sessions);

    // Convert to sorted vector
    let mut trends = daily_map_to_sorted_vec(daily_map);

    // Apply date range filter if provided
    if start_date.is_some() || end_date.is_some() {
        trends = filter_by_date_range(trends, start_date, end_date);
    } else {
        // Filter to last N days
        let cutoff = days_ago(days as i64);
        trends = trends.into_iter()
            .filter(|t| t.date >= cutoff)
            .collect();
    }

    // Fill in missing days with empty trends
    fill_missing_days(&mut trends, start_date, end_date, days);

    trends
}

/// Fill in missing days with zero values
fn fill_missing_days(
    trends: &mut Vec<DailyTrend>,
    start_date: Option<&str>,
    end_date: Option<&str>,
    days: u32,
) {
    // Determine date range
    let start = start_date
        .and_then(parse_date)
        .unwrap_or_else(|| {
            parse_date(&days_ago(days as i64)).unwrap()
        });

    let end = end_date
        .and_then(parse_date)
        .unwrap_or_else(|| {
            parse_date(&today()).unwrap()
        });

    // Create set of existing dates
    let existing: std::collections::HashSet<String> = trends.iter()
        .map(|t| t.date.clone())
        .collect();

    // Add missing dates
    let mut current = start;
    while current <= end {
        let date_str = current.format("%Y-%m-%d").to_string();
        if !existing.contains(&date_str) {
            trends.push(DailyTrend::new(date_str));
        }
        current = current.succ_opt().unwrap_or(current);
    }

    // Re-sort
    trends.sort_by(|a, b| a.date.cmp(&b.date));
}

/// Calculate trend summary with period-over-period comparison
pub fn calculate_trend_summary(
    sessions: &[SessionData],
    start_date: Option<&str>,
    end_date: Option<&str>,
    days: u32,
) -> TrendSummary {
    let daily = get_daily_trends(sessions, days, start_date, end_date);
    let current = TrendSummary::from_daily(daily);

    // Calculate previous period for comparison
    let current_days = current.daily.len() as i64;
    if current_days == 0 {
        return current;
    }

    // Determine previous period dates
    let (prev_start, prev_end) = if let (Some(start), Some(end)) = (start_date, end_date) {
        // Calculate period length
        if let (Some(s), Some(e)) = (parse_date(start), parse_date(end)) {
            let period_days = (e - s).num_days() + 1;
            let prev_end = s - ChronoDuration::days(1);
            let prev_start = prev_end - ChronoDuration::days(period_days - 1);
            (
                Some(prev_start.format("%Y-%m-%d").to_string()),
                Some(prev_end.format("%Y-%m-%d").to_string()),
            )
        } else {
            (None, None)
        }
    } else {
        // Use days parameter
        let period_days = days as i64;
        let prev_end = days_ago(period_days + 1);
        let prev_start = days_ago(period_days * 2);
        (Some(prev_start), Some(prev_end))
    };

    // Get previous period data
    let prev_daily = get_daily_trends(
        sessions,
        days,
        prev_start.as_deref(),
        prev_end.as_deref(),
    );
    let previous = TrendSummary::from_daily(prev_daily);

    current.with_comparison(&previous)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[allow(unused_imports)]
    use chrono::Datelike;

    #[test]
    fn test_extract_date_from_timestamp() {
        assert_eq!(
            extract_date_from_timestamp("2026-02-05T10:30:00.000Z"),
            Some("2026-02-05".to_string())
        );
        assert_eq!(
            extract_date_from_timestamp("2026-02-05T10:30:00Z"),
            Some("2026-02-05".to_string())
        );
        assert_eq!(
            extract_date_from_timestamp("2026-02-05"),
            Some("2026-02-05".to_string())
        );
        assert_eq!(extract_date_from_timestamp("invalid"), None);
        assert_eq!(extract_date_from_timestamp("2026-99-99T00:00:00Z"), None);
    }

    #[test]
    fn test_parse_date() {
        let date = parse_date("2026-02-05");
        assert!(date.is_some());
        let d = date.unwrap();
        assert_eq!(d.year(), 2026);
        assert_eq!(d.month(), 2);
        assert_eq!(d.day(), 5);

        assert!(parse_date("invalid").is_none());
        assert!(parse_date("2026-13-45").is_none());
    }

    #[test]
    fn test_aggregate_by_day() {
        let sessions = vec![
            SessionData {
                started_at: "2026-02-05T10:00:00Z".to_string(),
                turns: 10,
                tokens: 5000,
                cost: 1.50,
                efficiency: 0.80,
            },
            SessionData {
                started_at: "2026-02-05T14:00:00Z".to_string(),
                turns: 5,
                tokens: 3000,
                cost: 0.75,
                efficiency: 0.90,
            },
            SessionData {
                started_at: "2026-02-06T09:00:00Z".to_string(),
                turns: 15,
                tokens: 8000,
                cost: 2.00,
                efficiency: 0.85,
            },
        ];

        let daily = aggregate_by_day(&sessions);

        assert_eq!(daily.len(), 2);

        let feb5 = daily.get("2026-02-05").unwrap();
        assert_eq!(feb5.sessions, 2);
        assert_eq!(feb5.turns, 15);
        assert_eq!(feb5.total_tokens, 8000);
        assert_eq!(feb5.total_cost, 2.25);

        let feb6 = daily.get("2026-02-06").unwrap();
        assert_eq!(feb6.sessions, 1);
        assert_eq!(feb6.turns, 15);
        assert_eq!(feb6.total_tokens, 8000);
        assert_eq!(feb6.total_cost, 2.00);
    }

    #[test]
    fn test_filter_by_date_range() {
        let trends = vec![
            DailyTrend::new("2026-02-01".to_string()),
            DailyTrend::new("2026-02-02".to_string()),
            DailyTrend::new("2026-02-03".to_string()),
            DailyTrend::new("2026-02-04".to_string()),
            DailyTrend::new("2026-02-05".to_string()),
        ];

        // Filter from Feb 2 to Feb 4
        let filtered = filter_by_date_range(
            trends.clone(),
            Some("2026-02-02"),
            Some("2026-02-04"),
        );
        assert_eq!(filtered.len(), 3);
        assert_eq!(filtered[0].date, "2026-02-02");
        assert_eq!(filtered[2].date, "2026-02-04");

        // Filter with only start date
        let filtered = filter_by_date_range(
            trends.clone(),
            Some("2026-02-03"),
            None,
        );
        assert_eq!(filtered.len(), 3);
        assert_eq!(filtered[0].date, "2026-02-03");

        // Filter with only end date
        let filtered = filter_by_date_range(
            trends.clone(),
            None,
            Some("2026-02-02"),
        );
        assert_eq!(filtered.len(), 2);
        assert_eq!(filtered[1].date, "2026-02-02");
    }

    #[test]
    fn test_daily_map_to_sorted_vec() {
        let mut map = HashMap::new();
        map.insert("2026-02-03".to_string(), DailyTrend::new("2026-02-03".to_string()));
        map.insert("2026-02-01".to_string(), DailyTrend::new("2026-02-01".to_string()));
        map.insert("2026-02-02".to_string(), DailyTrend::new("2026-02-02".to_string()));

        let sorted = daily_map_to_sorted_vec(map);
        assert_eq!(sorted.len(), 3);
        assert_eq!(sorted[0].date, "2026-02-01");
        assert_eq!(sorted[1].date, "2026-02-02");
        assert_eq!(sorted[2].date, "2026-02-03");
    }

    #[test]
    fn test_session_data_aggregation() {
        let sessions = vec![
            SessionData {
                started_at: "2026-02-01T10:00:00Z".to_string(),
                turns: 10,
                tokens: 5000,
                cost: 1.00,
                efficiency: 0.80,
            },
        ];

        let daily = get_daily_trends(&sessions, 1, Some("2026-02-01"), Some("2026-02-01"));
        assert!(!daily.is_empty());

        let first = &daily[0];
        assert_eq!(first.date, "2026-02-01");
        assert_eq!(first.sessions, 1);
        assert_eq!(first.turns, 10);
    }

    #[test]
    fn test_today_returns_valid_date() {
        let date = today();
        // Should be in YYYY-MM-DD format
        assert_eq!(date.len(), 10);
        assert!(date.contains("-"));
        assert!(parse_date(&date).is_some());
    }

    #[test]
    fn test_days_ago_returns_valid_date() {
        let date = days_ago(7);
        assert!(parse_date(&date).is_some());
        // Should be 7 days before today
        let today_date = parse_date(&today()).unwrap();
        let ago_date = parse_date(&date).unwrap();
        assert_eq!((today_date - ago_date).num_days(), 7);
    }

    #[test]
    fn test_extract_date_handles_various_formats() {
        // Full ISO 8601 with milliseconds
        assert_eq!(
            extract_date_from_timestamp("2026-02-05T10:30:00.123Z"),
            Some("2026-02-05".to_string())
        );

        // Without milliseconds
        assert_eq!(
            extract_date_from_timestamp("2026-02-05T10:30:00Z"),
            Some("2026-02-05".to_string())
        );

        // Date only
        assert_eq!(
            extract_date_from_timestamp("2026-02-05"),
            Some("2026-02-05".to_string())
        );

        // With timezone offset
        assert_eq!(
            extract_date_from_timestamp("2026-02-05T10:30:00+05:00"),
            Some("2026-02-05".to_string())
        );

        // Too short
        assert_eq!(extract_date_from_timestamp("2026"), None);

        // Empty string
        assert_eq!(extract_date_from_timestamp(""), None);
    }

    #[test]
    fn test_aggregate_by_day_with_empty_sessions() {
        let sessions: Vec<SessionData> = vec![];
        let daily = aggregate_by_day(&sessions);
        assert!(daily.is_empty());
    }

    #[test]
    fn test_aggregate_by_day_with_invalid_timestamps() {
        let sessions = vec![
            SessionData {
                started_at: "invalid-date".to_string(),
                turns: 10,
                tokens: 5000,
                cost: 1.00,
                efficiency: 0.80,
            },
        ];
        let daily = aggregate_by_day(&sessions);
        assert!(daily.is_empty());
    }

    #[test]
    fn test_filter_by_date_range_no_filter() {
        let trends = vec![
            DailyTrend::new("2026-02-01".to_string()),
            DailyTrend::new("2026-02-02".to_string()),
        ];

        let filtered = filter_by_date_range(trends.clone(), None, None);
        assert_eq!(filtered.len(), 2);
    }

    #[test]
    fn test_daily_map_to_sorted_vec_preserves_data() {
        let mut map = HashMap::new();
        let mut trend1 = DailyTrend::new("2026-02-01".to_string());
        trend1.sessions = 5;
        trend1.total_cost = 10.0;
        map.insert("2026-02-01".to_string(), trend1);

        let sorted = daily_map_to_sorted_vec(map);
        assert_eq!(sorted.len(), 1);
        assert_eq!(sorted[0].sessions, 5);
        assert_eq!(sorted[0].total_cost, 10.0);
    }
}

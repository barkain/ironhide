//! Weekly trend calculations
//!
//! Aggregates session data by week for trend analysis.

use std::collections::HashMap;
use chrono::{Datelike, NaiveDate};

use super::{DailyTrend, WeeklyTrend};
use super::daily::parse_date;

/// Get the Monday of the week containing the given date
fn week_start(date: NaiveDate) -> NaiveDate {
    let days_from_monday = date.weekday().num_days_from_monday();
    date - chrono::Duration::days(days_from_monday as i64)
}

/// Get the Sunday of the week containing the given date
fn week_end(date: NaiveDate) -> NaiveDate {
    let days_to_sunday = 6 - date.weekday().num_days_from_monday();
    date + chrono::Duration::days(days_to_sunday as i64)
}

/// Get ISO week number for a date
fn iso_week(date: NaiveDate) -> u32 {
    date.iso_week().week()
}

/// Aggregate daily trends into weekly trends
pub fn aggregate_to_weekly(daily_trends: Vec<DailyTrend>) -> Vec<WeeklyTrend> {
    let mut weekly_map: HashMap<String, WeeklyTrend> = HashMap::new();

    for daily in daily_trends {
        if let Some(date) = parse_date(&daily.date) {
            let start = week_start(date);
            let end = week_end(date);
            let week_key = start.format("%Y-%m-%d").to_string();

            let weekly = weekly_map.entry(week_key.clone()).or_insert_with(|| {
                WeeklyTrend {
                    week_start: start.format("%Y-%m-%d").to_string(),
                    week_end: end.format("%Y-%m-%d").to_string(),
                    week_number: iso_week(date),
                    sessions: 0,
                    turns: 0,
                    total_tokens: 0,
                    total_cost: 0.0,
                    avg_efficiency: 0.0,
                    daily: Vec::new(),
                }
            });

            // Add daily data to weekly totals
            let prev_total_eff = weekly.avg_efficiency * weekly.sessions as f64;
            weekly.sessions += daily.sessions;
            weekly.turns += daily.turns;
            weekly.total_tokens += daily.total_tokens;
            weekly.total_cost += daily.total_cost;

            // Update weighted efficiency average
            if weekly.sessions > 0 {
                let daily_eff_contribution = daily.avg_efficiency * daily.sessions as f64;
                weekly.avg_efficiency = (prev_total_eff + daily_eff_contribution) / weekly.sessions as f64;
            }

            weekly.daily.push(daily);
        }
    }

    // Sort daily within each week and convert to vec
    let mut weeks: Vec<WeeklyTrend> = weekly_map.into_values()
        .map(|mut w| {
            w.daily.sort_by(|a, b| a.date.cmp(&b.date));
            w
        })
        .collect();

    // Sort weeks by start date
    weeks.sort_by(|a, b| a.week_start.cmp(&b.week_start));

    weeks
}

/// Get the week start date for a given date string
pub fn get_week_start(date_str: &str) -> Option<String> {
    parse_date(date_str).map(|d| week_start(d).format("%Y-%m-%d").to_string())
}

/// Get the week end date for a given date string
pub fn get_week_end(date_str: &str) -> Option<String> {
    parse_date(date_str).map(|d| week_end(d).format("%Y-%m-%d").to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Weekday;

    #[test]
    fn test_week_start() {
        // Wednesday, Feb 5, 2026
        let date = NaiveDate::from_ymd_opt(2026, 2, 5).unwrap();
        let start = week_start(date);
        assert_eq!(start.weekday(), Weekday::Mon);
        assert_eq!(start.format("%Y-%m-%d").to_string(), "2026-02-02");

        // Monday itself
        let monday = NaiveDate::from_ymd_opt(2026, 2, 2).unwrap();
        assert_eq!(week_start(monday), monday);

        // Sunday
        let sunday = NaiveDate::from_ymd_opt(2026, 2, 8).unwrap();
        let start = week_start(sunday);
        assert_eq!(start.format("%Y-%m-%d").to_string(), "2026-02-02");
    }

    #[test]
    fn test_week_end() {
        // Wednesday, Feb 5, 2026
        let date = NaiveDate::from_ymd_opt(2026, 2, 5).unwrap();
        let end = week_end(date);
        assert_eq!(end.weekday(), Weekday::Sun);
        assert_eq!(end.format("%Y-%m-%d").to_string(), "2026-02-08");

        // Sunday itself
        let sunday = NaiveDate::from_ymd_opt(2026, 2, 8).unwrap();
        assert_eq!(week_end(sunday), sunday);
    }

    #[test]
    fn test_aggregate_to_weekly() {
        let daily = vec![
            {
                let mut t = DailyTrend::new("2026-02-02".to_string()); // Monday
                t.add_session(10, 5000, 1.00, 0.80);
                t
            },
            {
                let mut t = DailyTrend::new("2026-02-03".to_string()); // Tuesday
                t.add_session(15, 8000, 2.00, 0.90);
                t
            },
            {
                let mut t = DailyTrend::new("2026-02-09".to_string()); // Next Monday
                t.add_session(5, 3000, 0.50, 0.75);
                t
            },
        ];

        let weekly = aggregate_to_weekly(daily);

        assert_eq!(weekly.len(), 2);

        // First week (Feb 2-8)
        let week1 = &weekly[0];
        assert_eq!(week1.week_start, "2026-02-02");
        assert_eq!(week1.week_end, "2026-02-08");
        assert_eq!(week1.sessions, 2);
        assert_eq!(week1.turns, 25);
        assert_eq!(week1.total_tokens, 13000);
        assert_eq!(week1.total_cost, 3.00);
        assert_eq!(week1.daily.len(), 2);

        // Second week (Feb 9-15)
        let week2 = &weekly[1];
        assert_eq!(week2.week_start, "2026-02-09");
        assert_eq!(week2.sessions, 1);
    }

    #[test]
    fn test_get_week_start_end() {
        assert_eq!(get_week_start("2026-02-05"), Some("2026-02-02".to_string()));
        assert_eq!(get_week_end("2026-02-05"), Some("2026-02-08".to_string()));
        assert_eq!(get_week_start("invalid"), None);
    }

    #[test]
    fn test_iso_week() {
        let date = NaiveDate::from_ymd_opt(2026, 2, 5).unwrap();
        let week = iso_week(date);
        assert_eq!(week, 6); // Week 6 of 2026
    }

    #[test]
    fn test_weekly_trend_serialization() {
        let weekly = WeeklyTrend {
            week_start: "2026-02-02".to_string(),
            week_end: "2026-02-08".to_string(),
            week_number: 6,
            sessions: 5,
            turns: 50,
            total_tokens: 25000,
            total_cost: 10.0,
            avg_efficiency: 0.85,
            daily: vec![DailyTrend::new("2026-02-02".to_string())],
        };

        let json = serde_json::to_string(&weekly).unwrap();
        assert!(json.contains("\"week_start\":\"2026-02-02\""));
        assert!(json.contains("\"week_end\":\"2026-02-08\""));
        assert!(json.contains("\"week_number\":6"));
        assert!(json.contains("\"sessions\":5"));
    }
}

//! Monthly trend calculations
//!
//! Aggregates session data by month for trend analysis.

use std::collections::HashMap;
use chrono::{Datelike, NaiveDate};

use super::{DailyTrend, MonthlyTrend};
#[cfg(test)]
use super::WeeklyTrend;
use super::daily::parse_date;
use super::weekly::aggregate_to_weekly;

/// Get the month identifier (YYYY-MM) for a date
fn month_key(date: NaiveDate) -> String {
    date.format("%Y-%m").to_string()
}

/// Aggregate daily trends into monthly trends
pub fn aggregate_to_monthly(daily_trends: Vec<DailyTrend>) -> Vec<MonthlyTrend> {
    // First aggregate to weekly
    let weekly = aggregate_to_weekly(daily_trends.clone());

    // Group weeks by month
    let mut monthly_map: HashMap<String, MonthlyTrend> = HashMap::new();

    for daily in daily_trends {
        if let Some(date) = parse_date(&daily.date) {
            let key = month_key(date);

            let monthly = monthly_map.entry(key.clone()).or_insert_with(|| {
                MonthlyTrend {
                    month: key,
                    sessions: 0,
                    turns: 0,
                    total_tokens: 0,
                    total_cost: 0.0,
                    avg_efficiency: 0.0,
                    weekly: Vec::new(),
                }
            });

            // Add daily data to monthly totals
            let prev_total_eff = monthly.avg_efficiency * monthly.sessions as f64;
            monthly.sessions += daily.sessions;
            monthly.turns += daily.turns;
            monthly.total_tokens += daily.total_tokens;
            monthly.total_cost += daily.total_cost;

            // Update weighted efficiency average
            if monthly.sessions > 0 {
                let daily_eff_contribution = daily.avg_efficiency * daily.sessions as f64;
                monthly.avg_efficiency = (prev_total_eff + daily_eff_contribution) / monthly.sessions as f64;
            }
        }
    }

    // Assign weekly data to corresponding months
    for week in weekly {
        // Assign week to month based on week start date
        if let Some(date) = parse_date(&week.week_start) {
            let key = month_key(date);
            if let Some(monthly) = monthly_map.get_mut(&key) {
                monthly.weekly.push(week);
            }
        }
    }

    // Sort weekly within each month and convert to vec
    let mut months: Vec<MonthlyTrend> = monthly_map.into_values()
        .map(|mut m| {
            m.weekly.sort_by(|a, b| a.week_start.cmp(&b.week_start));
            m
        })
        .collect();

    // Sort months
    months.sort_by(|a, b| a.month.cmp(&b.month));

    months
}

/// Get the month key for a date string
pub fn get_month_key(date_str: &str) -> Option<String> {
    parse_date(date_str).map(|d| month_key(d))
}

/// Get the first day of the month for a date
pub fn month_start(date: NaiveDate) -> NaiveDate {
    NaiveDate::from_ymd_opt(date.year(), date.month(), 1).unwrap()
}

/// Get the last day of the month for a date
pub fn month_end(date: NaiveDate) -> NaiveDate {
    let next_month = if date.month() == 12 {
        NaiveDate::from_ymd_opt(date.year() + 1, 1, 1)
    } else {
        NaiveDate::from_ymd_opt(date.year(), date.month() + 1, 1)
    };
    next_month.unwrap() - chrono::Duration::days(1)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_month_key() {
        let date = NaiveDate::from_ymd_opt(2026, 2, 5).unwrap();
        assert_eq!(month_key(date), "2026-02");

        let date = NaiveDate::from_ymd_opt(2026, 12, 31).unwrap();
        assert_eq!(month_key(date), "2026-12");
    }

    #[test]
    fn test_aggregate_to_monthly() {
        let daily = vec![
            {
                let mut t = DailyTrend::new("2026-01-15".to_string());
                t.add_session(10, 5000, 1.00, 0.80);
                t
            },
            {
                let mut t = DailyTrend::new("2026-01-20".to_string());
                t.add_session(15, 8000, 2.00, 0.85);
                t
            },
            {
                let mut t = DailyTrend::new("2026-02-05".to_string());
                t.add_session(5, 3000, 0.50, 0.90);
                t
            },
        ];

        let monthly = aggregate_to_monthly(daily);

        assert_eq!(monthly.len(), 2);

        // January
        let jan = &monthly[0];
        assert_eq!(jan.month, "2026-01");
        assert_eq!(jan.sessions, 2);
        assert_eq!(jan.turns, 25);
        assert_eq!(jan.total_tokens, 13000);
        assert_eq!(jan.total_cost, 3.00);

        // February
        let feb = &monthly[1];
        assert_eq!(feb.month, "2026-02");
        assert_eq!(feb.sessions, 1);
    }

    #[test]
    fn test_month_start_end() {
        let date = NaiveDate::from_ymd_opt(2026, 2, 15).unwrap();

        let start = month_start(date);
        assert_eq!(start.format("%Y-%m-%d").to_string(), "2026-02-01");

        let end = month_end(date);
        assert_eq!(end.format("%Y-%m-%d").to_string(), "2026-02-28");

        // December edge case
        let dec = NaiveDate::from_ymd_opt(2026, 12, 15).unwrap();
        let dec_end = month_end(dec);
        assert_eq!(dec_end.format("%Y-%m-%d").to_string(), "2026-12-31");

        // Leap year February
        let feb_leap = NaiveDate::from_ymd_opt(2024, 2, 15).unwrap();
        let feb_leap_end = month_end(feb_leap);
        assert_eq!(feb_leap_end.format("%Y-%m-%d").to_string(), "2024-02-29");
    }

    #[test]
    fn test_get_month_key() {
        assert_eq!(get_month_key("2026-02-05"), Some("2026-02".to_string()));
        assert_eq!(get_month_key("invalid"), None);
    }

    #[test]
    fn test_monthly_trend_serialization() {
        let monthly = MonthlyTrend {
            month: "2026-02".to_string(),
            sessions: 20,
            turns: 200,
            total_tokens: 100000,
            total_cost: 50.0,
            avg_efficiency: 0.82,
            weekly: vec![
                WeeklyTrend {
                    week_start: "2026-02-02".to_string(),
                    week_end: "2026-02-08".to_string(),
                    week_number: 6,
                    sessions: 10,
                    turns: 100,
                    total_tokens: 50000,
                    total_cost: 25.0,
                    avg_efficiency: 0.80,
                    daily: vec![],
                },
            ],
        };

        let json = serde_json::to_string(&monthly).unwrap();
        assert!(json.contains("\"month\":\"2026-02\""));
        assert!(json.contains("\"sessions\":20"));
        assert!(json.contains("\"weekly\":["));
    }

    #[test]
    fn test_monthly_includes_weekly_breakdown() {
        let daily = vec![
            {
                let mut t = DailyTrend::new("2026-02-02".to_string()); // Monday, Week 6
                t.add_session(10, 5000, 1.00, 0.80);
                t
            },
            {
                let mut t = DailyTrend::new("2026-02-09".to_string()); // Monday, Week 7
                t.add_session(15, 8000, 2.00, 0.90);
                t
            },
        ];

        let monthly = aggregate_to_monthly(daily);

        assert_eq!(monthly.len(), 1);
        let feb = &monthly[0];
        assert_eq!(feb.month, "2026-02");
        assert_eq!(feb.weekly.len(), 2);
        assert_eq!(feb.weekly[0].week_start, "2026-02-02");
        assert_eq!(feb.weekly[1].week_start, "2026-02-09");
    }
}

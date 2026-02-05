//! JSON export functionality
//!
//! Provides JSON serialization for sessions, turns, and trends
//! with full structure preservation.

use std::collections::HashMap;
use std::io::Write;
use std::path::PathBuf;

use serde::Serialize;

use super::{ExportableSession, ExportableTurn, ExportableTrend};
use crate::CommandError;

/// Full session export with optional turns
#[derive(Debug, Clone, Serialize)]
pub struct SessionExportJson {
    pub session: ExportableSession,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub turns: Option<Vec<ExportableTurn>>,
}

/// Complete export structure for JSON
#[derive(Debug, Clone, Serialize)]
pub struct SessionsExportJson {
    pub export_date: String,
    pub export_version: &'static str,
    pub total_sessions: usize,
    pub total_turns: usize,
    pub sessions: Vec<SessionExportJson>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub summary: Option<ExportSummary>,
}

/// Summary statistics for the export
#[derive(Debug, Clone, Serialize)]
pub struct ExportSummary {
    pub total_cost: f64,
    pub total_tokens: u64,
    pub avg_cost_per_session: f64,
    pub avg_turns_per_session: f64,
    pub date_range: Option<(String, String)>,
}

/// Trends export structure
#[derive(Debug, Clone, Serialize)]
pub struct TrendsExportJson {
    pub export_date: String,
    pub export_version: &'static str,
    pub days_included: u32,
    pub trends: Vec<ExportableTrend>,
    pub summary: TrendsSummary,
}

/// Summary of trend data
#[derive(Debug, Clone, Serialize)]
pub struct TrendsSummary {
    pub total_sessions: i32,
    pub total_turns: i32,
    pub total_cost: f64,
    pub total_tokens: i64,
    pub avg_daily_cost: f64,
    pub avg_daily_sessions: f64,
}

const EXPORT_VERSION: &str = "1.0.0";

/// Write sessions to JSON format
pub fn write_sessions_json(
    sessions: &[ExportableSession],
    turns_map: Option<&HashMap<String, Vec<ExportableTurn>>>,
    include_summary: bool,
    path: &PathBuf,
) -> Result<(), CommandError> {
    let mut session_exports = Vec::new();
    let mut total_turns = 0usize;

    for session in sessions {
        let turns = turns_map.and_then(|m| m.get(&session.session_id).cloned());
        if let Some(ref t) = turns {
            total_turns += t.len();
        }
        session_exports.push(SessionExportJson {
            session: session.clone(),
            turns,
        });
    }

    let summary = if include_summary && !sessions.is_empty() {
        let total_cost: f64 = sessions.iter().map(|s| s.cost).sum();
        let total_tokens: u64 = sessions.iter().map(|s| s.tokens).sum();
        let total_sessions = sessions.len();
        let total_turns_summary: u32 = sessions.iter().map(|s| s.turns).sum();

        let dates: Vec<&str> = sessions.iter().map(|s| s.date.as_str()).collect();
        let date_range = if !dates.is_empty() {
            let min_date = dates.iter().min().unwrap().to_string();
            let max_date = dates.iter().max().unwrap().to_string();
            Some((min_date, max_date))
        } else {
            None
        };

        Some(ExportSummary {
            total_cost,
            total_tokens,
            avg_cost_per_session: total_cost / total_sessions as f64,
            avg_turns_per_session: total_turns_summary as f64 / total_sessions as f64,
            date_range,
        })
    } else {
        None
    };

    let export = SessionsExportJson {
        export_date: chrono::Utc::now().to_rfc3339(),
        export_version: EXPORT_VERSION,
        total_sessions: sessions.len(),
        total_turns,
        sessions: session_exports,
        summary,
    };

    let json = serde_json::to_string_pretty(&export)
        .map_err(|e| CommandError::Internal(format!("Failed to serialize JSON: {}", e)))?;

    let mut file = std::fs::File::create(path)
        .map_err(|e| CommandError::Internal(format!("Failed to create JSON file: {}", e)))?;

    file.write_all(json.as_bytes())
        .map_err(|e| CommandError::Internal(format!("Failed to write JSON file: {}", e)))?;

    Ok(())
}

/// Write trends to JSON format
pub fn write_trends_json(
    trends: &[ExportableTrend],
    days: u32,
    path: &PathBuf,
) -> Result<(), CommandError> {
    let total_sessions: i32 = trends.iter().map(|t| t.session_count).sum();
    let total_turns: i32 = trends.iter().map(|t| t.total_turns).sum();
    let total_cost: f64 = trends.iter().map(|t| t.total_cost).sum();
    let total_tokens: i64 = trends.iter().map(|t| t.total_tokens).sum();

    let num_days = trends.len().max(1) as f64;

    let summary = TrendsSummary {
        total_sessions,
        total_turns,
        total_cost,
        total_tokens,
        avg_daily_cost: total_cost / num_days,
        avg_daily_sessions: total_sessions as f64 / num_days,
    };

    let export = TrendsExportJson {
        export_date: chrono::Utc::now().to_rfc3339(),
        export_version: EXPORT_VERSION,
        days_included: days,
        trends: trends.to_vec(),
        summary,
    };

    let json = serde_json::to_string_pretty(&export)
        .map_err(|e| CommandError::Internal(format!("Failed to serialize JSON: {}", e)))?;

    let mut file = std::fs::File::create(path)
        .map_err(|e| CommandError::Internal(format!("Failed to create JSON file: {}", e)))?;

    file.write_all(json.as_bytes())
        .map_err(|e| CommandError::Internal(format!("Failed to write JSON file: {}", e)))?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn create_test_session() -> ExportableSession {
        ExportableSession {
            session_id: "test-123".to_string(),
            date: "2026-01-14T07:00:00Z".to_string(),
            project_name: "test-project".to_string(),
            model: Some("claude-opus-4-5-20251101".to_string()),
            turns: 5,
            tokens: 10000,
            cost: 1.50,
            duration_ms: 60000,
            efficiency_score: Some(0.85),
        }
    }

    fn create_test_turn() -> ExportableTurn {
        ExportableTurn {
            session_id: "test-123".to_string(),
            turn_number: 1,
            started_at: "2026-01-14T07:00:00Z".to_string(),
            ended_at: Some("2026-01-14T07:01:00Z".to_string()),
            model: Some("claude-opus-4-5-20251101".to_string()),
            input_tokens: 1000,
            output_tokens: 500,
            cache_read_tokens: 2000,
            cache_write_tokens: 100,
            total_tokens: 3600,
            cost: 0.30,
            tool_count: 2,
            tools_used: "Read, Write".to_string(),
            user_message_preview: Some("Hello".to_string()),
        }
    }

    fn create_test_trend() -> ExportableTrend {
        ExportableTrend {
            date: "2026-01-14".to_string(),
            session_count: 3,
            total_turns: 15,
            total_cost: 4.50,
            total_tokens: 30000,
            avg_efficiency_score: Some(0.82),
        }
    }

    #[test]
    fn test_write_sessions_json_without_turns() {
        let temp_dir = std::env::temp_dir();
        let path = temp_dir.join("test_sessions.json");

        let sessions = vec![create_test_session()];
        write_sessions_json(&sessions, None, true, &path).unwrap();

        let content = fs::read_to_string(&path).unwrap();
        let parsed: serde_json::Value = serde_json::from_str(&content).unwrap();

        assert_eq!(parsed["total_sessions"], 1);
        assert_eq!(parsed["sessions"][0]["session"]["session_id"], "test-123");
        assert!(parsed["summary"].is_object());

        fs::remove_file(&path).ok();
    }

    #[test]
    fn test_write_sessions_json_with_turns() {
        let temp_dir = std::env::temp_dir();
        let path = temp_dir.join("test_sessions_with_turns.json");

        let sessions = vec![create_test_session()];
        let mut turns_map = HashMap::new();
        turns_map.insert("test-123".to_string(), vec![create_test_turn()]);

        write_sessions_json(&sessions, Some(&turns_map), true, &path).unwrap();

        let content = fs::read_to_string(&path).unwrap();
        let parsed: serde_json::Value = serde_json::from_str(&content).unwrap();

        assert_eq!(parsed["total_turns"], 1);
        assert!(parsed["sessions"][0]["turns"].is_array());
        assert_eq!(parsed["sessions"][0]["turns"][0]["turn_number"], 1);

        fs::remove_file(&path).ok();
    }

    #[test]
    fn test_write_trends_json() {
        let temp_dir = std::env::temp_dir();
        let path = temp_dir.join("test_trends.json");

        let trends = vec![create_test_trend()];
        write_trends_json(&trends, 7, &path).unwrap();

        let content = fs::read_to_string(&path).unwrap();
        let parsed: serde_json::Value = serde_json::from_str(&content).unwrap();

        assert_eq!(parsed["days_included"], 7);
        assert!(parsed["trends"].is_array());
        assert!(parsed["summary"]["total_cost"].as_f64().unwrap() > 0.0);

        fs::remove_file(&path).ok();
    }

    #[test]
    fn test_write_sessions_json_without_summary() {
        let temp_dir = std::env::temp_dir();
        let path = temp_dir.join("test_sessions_no_summary.json");

        let sessions = vec![create_test_session()];
        write_sessions_json(&sessions, None, false, &path).unwrap();

        let content = fs::read_to_string(&path).unwrap();
        let parsed: serde_json::Value = serde_json::from_str(&content).unwrap();

        // Summary should be null when not requested
        assert!(parsed["summary"].is_null());
        assert_eq!(parsed["total_sessions"], 1);

        fs::remove_file(&path).ok();
    }

    #[test]
    fn test_json_export_version() {
        let temp_dir = std::env::temp_dir();
        let path = temp_dir.join("test_version.json");

        let sessions = vec![create_test_session()];
        write_sessions_json(&sessions, None, true, &path).unwrap();

        let content = fs::read_to_string(&path).unwrap();
        let parsed: serde_json::Value = serde_json::from_str(&content).unwrap();

        assert_eq!(parsed["export_version"], "1.0.0");
        assert!(parsed["export_date"].is_string());

        fs::remove_file(&path).ok();
    }

    #[test]
    fn test_json_summary_date_range() {
        let temp_dir = std::env::temp_dir();
        let path = temp_dir.join("test_date_range.json");

        let sessions = vec![
            ExportableSession {
                session_id: "test-1".to_string(),
                date: "2026-01-10T07:00:00Z".to_string(),
                project_name: "test".to_string(),
                model: None,
                turns: 5,
                tokens: 10000,
                cost: 1.0,
                duration_ms: 60000,
                efficiency_score: None,
            },
            ExportableSession {
                session_id: "test-2".to_string(),
                date: "2026-01-20T07:00:00Z".to_string(),
                project_name: "test".to_string(),
                model: None,
                turns: 5,
                tokens: 10000,
                cost: 1.0,
                duration_ms: 60000,
                efficiency_score: None,
            },
        ];

        write_sessions_json(&sessions, None, true, &path).unwrap();

        let content = fs::read_to_string(&path).unwrap();
        let parsed: serde_json::Value = serde_json::from_str(&content).unwrap();

        // Check date range is included
        assert!(parsed["summary"]["date_range"].is_array());
        let date_range = parsed["summary"]["date_range"].as_array().unwrap();
        assert_eq!(date_range.len(), 2);

        fs::remove_file(&path).ok();
    }

    #[test]
    fn test_json_summary_calculations() {
        let temp_dir = std::env::temp_dir();
        let path = temp_dir.join("test_summary_calc.json");

        let sessions = vec![
            ExportableSession {
                session_id: "test-1".to_string(),
                date: "2026-01-10T07:00:00Z".to_string(),
                project_name: "test".to_string(),
                model: None,
                turns: 10,
                tokens: 20000,
                cost: 2.0,
                duration_ms: 60000,
                efficiency_score: None,
            },
            ExportableSession {
                session_id: "test-2".to_string(),
                date: "2026-01-20T07:00:00Z".to_string(),
                project_name: "test".to_string(),
                model: None,
                turns: 20,
                tokens: 40000,
                cost: 4.0,
                duration_ms: 120000,
                efficiency_score: None,
            },
        ];

        write_sessions_json(&sessions, None, true, &path).unwrap();

        let content = fs::read_to_string(&path).unwrap();
        let parsed: serde_json::Value = serde_json::from_str(&content).unwrap();

        // Check calculated values
        assert_eq!(parsed["summary"]["total_cost"].as_f64().unwrap(), 6.0);
        assert_eq!(parsed["summary"]["total_tokens"].as_u64().unwrap(), 60000);
        assert_eq!(parsed["summary"]["avg_cost_per_session"].as_f64().unwrap(), 3.0);
        assert_eq!(parsed["summary"]["avg_turns_per_session"].as_f64().unwrap(), 15.0);

        fs::remove_file(&path).ok();
    }

    #[test]
    fn test_trends_json_summary() {
        let temp_dir = std::env::temp_dir();
        let path = temp_dir.join("test_trends_summary.json");

        let trends = vec![
            ExportableTrend {
                date: "2026-01-14".to_string(),
                session_count: 5,
                total_turns: 50,
                total_cost: 10.0,
                total_tokens: 100000,
                avg_efficiency_score: Some(0.80),
            },
            ExportableTrend {
                date: "2026-01-15".to_string(),
                session_count: 3,
                total_turns: 30,
                total_cost: 5.0,
                total_tokens: 50000,
                avg_efficiency_score: Some(0.85),
            },
        ];

        write_trends_json(&trends, 14, &path).unwrap();

        let content = fs::read_to_string(&path).unwrap();
        let parsed: serde_json::Value = serde_json::from_str(&content).unwrap();

        assert_eq!(parsed["days_included"], 14);
        assert_eq!(parsed["summary"]["total_sessions"], 8);
        assert_eq!(parsed["summary"]["total_turns"], 80);
        assert_eq!(parsed["summary"]["total_cost"].as_f64().unwrap(), 15.0);
        assert_eq!(parsed["summary"]["total_tokens"], 150000);

        // Check averages
        let avg_daily_cost = parsed["summary"]["avg_daily_cost"].as_f64().unwrap();
        assert!((avg_daily_cost - 7.5).abs() < 0.001);

        fs::remove_file(&path).ok();
    }

    #[test]
    fn test_write_empty_trends_json() {
        let temp_dir = std::env::temp_dir();
        let path = temp_dir.join("test_empty_trends.json");

        let trends: Vec<ExportableTrend> = vec![];
        write_trends_json(&trends, 7, &path).unwrap();

        let content = fs::read_to_string(&path).unwrap();
        let parsed: serde_json::Value = serde_json::from_str(&content).unwrap();

        assert!(parsed["trends"].as_array().unwrap().is_empty());
        assert_eq!(parsed["summary"]["total_sessions"], 0);
        assert_eq!(parsed["summary"]["total_cost"].as_f64().unwrap(), 0.0);

        fs::remove_file(&path).ok();
    }

    #[test]
    fn test_json_is_pretty_printed() {
        let temp_dir = std::env::temp_dir();
        let path = temp_dir.join("test_pretty.json");

        let sessions = vec![create_test_session()];
        write_sessions_json(&sessions, None, true, &path).unwrap();

        let content = fs::read_to_string(&path).unwrap();

        // Pretty printed JSON should have newlines and indentation
        assert!(content.contains('\n'));
        assert!(content.contains("  ")); // Indentation

        fs::remove_file(&path).ok();
    }

    #[test]
    fn test_session_export_json_structure() {
        let session_export = SessionExportJson {
            session: create_test_session(),
            turns: Some(vec![create_test_turn()]),
        };

        let json = serde_json::to_string(&session_export).unwrap();

        assert!(json.contains("\"session\""));
        assert!(json.contains("\"turns\""));
        assert!(json.contains("\"session_id\""));
        assert!(json.contains("\"turn_number\""));
    }

    #[test]
    fn test_session_export_json_without_turns() {
        let session_export = SessionExportJson {
            session: create_test_session(),
            turns: None,
        };

        let json = serde_json::to_string(&session_export).unwrap();

        // turns should be omitted when None (skip_serializing_if)
        assert!(!json.contains("\"turns\":null"));
        assert!(json.contains("\"session\""));
    }
}

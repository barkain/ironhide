//! Export module for CSV and JSON export functionality
//!
//! Provides Tauri commands for exporting session data and trends
//! in CSV and JSON formats.

pub mod csv_export;
pub mod json_export;

use std::path::PathBuf;

use serde::{Deserialize, Serialize};

use crate::commands::{SessionSummary, TurnSummary};
use crate::CommandError;
use crate::models::metrics::DailyMetrics;

/// Export format options
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ExportFormat {
    Csv,
    Json,
}

impl std::str::FromStr for ExportFormat {
    type Err = CommandError;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.to_lowercase().as_str() {
            "csv" => Ok(ExportFormat::Csv),
            "json" => Ok(ExportFormat::Json),
            _ => Err(CommandError::Internal(format!(
                "Invalid export format: {}. Use 'csv' or 'json'",
                s
            ))),
        }
    }
}

impl ExportFormat {
    /// Get file extension for format
    pub fn extension(&self) -> &'static str {
        match self {
            ExportFormat::Csv => "csv",
            ExportFormat::Json => "json",
        }
    }
}

/// Options for export operations
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ExportOptions {
    /// Export format (csv or json)
    pub format: String,
    /// Include turn-level details
    #[serde(default)]
    pub include_turns: bool,
    /// Include calculated metrics
    #[serde(default = "default_true")]
    pub include_metrics: bool,
    /// Optional date range filter (start, end) in ISO-8601 format
    pub date_range: Option<(String, String)>,
}

fn default_true() -> bool {
    true
}

/// Exportable session record for CSV/JSON
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportableSession {
    pub session_id: String,
    pub date: String,
    pub project_name: String,
    pub model: Option<String>,
    pub turns: u32,
    pub tokens: u64,
    pub cost: f64,
    pub duration_ms: u64,
    pub efficiency_score: Option<f64>,
}

impl From<&SessionSummary> for ExportableSession {
    fn from(summary: &SessionSummary) -> Self {
        Self {
            session_id: summary.id.clone(),
            date: summary.started_at.clone(),
            project_name: summary.project_name.clone(),
            model: summary.model.clone(),
            turns: summary.total_turns,
            tokens: summary.total_tokens,
            cost: summary.total_cost,
            duration_ms: summary.duration_ms,
            efficiency_score: None, // Will be populated separately if metrics included
        }
    }
}

/// Exportable turn record for CSV/JSON
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportableTurn {
    pub session_id: String,
    pub turn_number: u32,
    pub started_at: String,
    pub ended_at: Option<String>,
    pub model: Option<String>,
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub cache_read_tokens: u64,
    pub cache_write_tokens: u64,
    pub total_tokens: u64,
    pub cost: f64,
    pub tool_count: u32,
    pub tools_used: String, // Comma-separated
    pub user_message_preview: Option<String>,
}

impl ExportableTurn {
    pub fn from_turn_summary(session_id: &str, turn: &TurnSummary) -> Self {
        Self {
            session_id: session_id.to_string(),
            turn_number: turn.turn_number,
            started_at: turn.started_at.clone(),
            ended_at: turn.ended_at.clone(),
            model: turn.model.clone(),
            input_tokens: turn.tokens.input,
            output_tokens: turn.tokens.output,
            cache_read_tokens: turn.tokens.cache_read,
            cache_write_tokens: turn.tokens.cache_write,
            total_tokens: turn.tokens.total,
            cost: turn.cost,
            tool_count: turn.tool_count,
            tools_used: turn.tools_used.join(", "),
            user_message_preview: turn.user_message.as_ref().map(|m| {
                if m.len() > 100 {
                    format!("{}...", &m[..100])
                } else {
                    m.clone()
                }
            }),
        }
    }
}

/// Exportable trend data point
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportableTrend {
    pub date: String,
    pub session_count: i32,
    pub total_turns: i32,
    pub total_cost: f64,
    pub total_tokens: i64,
    pub avg_efficiency_score: Option<f64>,
}

impl From<&DailyMetrics> for ExportableTrend {
    fn from(metrics: &DailyMetrics) -> Self {
        Self {
            date: metrics.date.clone(),
            session_count: metrics.session_count,
            total_turns: metrics.total_turns,
            total_cost: metrics.total_cost,
            total_tokens: metrics.total_tokens,
            avg_efficiency_score: metrics.avg_efficiency_score,
        }
    }
}

/// Get the default export directory (Downloads folder or temp dir)
pub fn get_export_directory() -> PathBuf {
    dirs::download_dir()
        .or_else(dirs::document_dir)
        .unwrap_or_else(std::env::temp_dir)
}

/// Generate a timestamped filename for exports
pub fn generate_export_filename(prefix: &str, extension: &str) -> String {
    let timestamp = chrono::Utc::now().format("%Y%m%d_%H%M%S");
    format!("{}_{}.{}", prefix, timestamp, extension)
}

// Re-export commands
pub use csv_export::*;
pub use json_export::*;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_export_format_from_str() {
        assert!(matches!("csv".parse::<ExportFormat>().unwrap(), ExportFormat::Csv));
        assert!(matches!("CSV".parse::<ExportFormat>().unwrap(), ExportFormat::Csv));
        assert!(matches!("json".parse::<ExportFormat>().unwrap(), ExportFormat::Json));
        assert!(matches!("JSON".parse::<ExportFormat>().unwrap(), ExportFormat::Json));
        assert!("xml".parse::<ExportFormat>().is_err());
    }

    #[test]
    fn test_export_format_extension() {
        assert_eq!(ExportFormat::Csv.extension(), "csv");
        assert_eq!(ExportFormat::Json.extension(), "json");
    }

    #[test]
    fn test_generate_export_filename() {
        let filename = generate_export_filename("sessions", "csv");
        assert!(filename.starts_with("sessions_"));
        assert!(filename.ends_with(".csv"));
    }

    #[test]
    fn test_get_export_directory() {
        let dir = get_export_directory();
        // Should return some path (either Downloads, Documents, or temp)
        assert!(dir.to_str().is_some());
    }

    #[test]
    fn test_export_format_serialization() {
        let csv_format = ExportFormat::Csv;
        let json_format = ExportFormat::Json;

        let csv_json = serde_json::to_string(&csv_format).unwrap();
        let json_json = serde_json::to_string(&json_format).unwrap();

        assert!(csv_json.contains("csv"));
        assert!(json_json.contains("json"));
    }

    #[test]
    fn test_export_format_deserialization() {
        let csv: ExportFormat = serde_json::from_str("\"csv\"").unwrap();
        let json: ExportFormat = serde_json::from_str("\"json\"").unwrap();

        assert!(matches!(csv, ExportFormat::Csv));
        assert!(matches!(json, ExportFormat::Json));
    }

    #[test]
    fn test_export_options_defaults() {
        let options: ExportOptions = serde_json::from_str(r#"{"format": "csv"}"#).unwrap();

        assert_eq!(options.format, "csv");
        assert!(!options.include_turns);
        assert!(options.include_metrics); // Default is true
        assert!(options.date_range.is_none());
    }

    #[test]
    fn test_export_options_with_date_range() {
        let options = ExportOptions {
            format: "json".to_string(),
            include_turns: true,
            include_metrics: true,
            date_range: Some(("2026-01-01".to_string(), "2026-01-31".to_string())),
        };

        assert_eq!(options.format, "json");
        assert!(options.include_turns);
        let (start, end) = options.date_range.unwrap();
        assert_eq!(start, "2026-01-01");
        assert_eq!(end, "2026-01-31");
    }

    #[test]
    fn test_exportable_session_from_session_summary() {
        use crate::commands::SessionSummary;

        let summary = SessionSummary {
            id: "session-123".to_string(),
            project_path: "/path/to/project".to_string(),
            project_name: "test-project".to_string(),
            started_at: "2026-02-05T10:00:00Z".to_string(),
            last_activity_at: Some("2026-02-05T11:00:00Z".to_string()),
            model: Some("claude-opus-4-5-20251101".to_string()),
            total_turns: 10,
            total_tokens: 50000,
            total_cost: 5.0,
            duration_ms: 3600000,
            is_subagent: false,
            file_path: "/path/to/session.jsonl".to_string(),
        };

        let exportable: ExportableSession = (&summary).into();

        assert_eq!(exportable.session_id, "session-123");
        assert_eq!(exportable.project_name, "test-project");
        assert_eq!(exportable.turns, 10);
        assert_eq!(exportable.tokens, 50000);
        assert!(exportable.efficiency_score.is_none());
    }

    #[test]
    fn test_exportable_turn_from_turn_summary() {
        use crate::commands::TurnSummary;
        use crate::commands::TurnTokensResponse;

        let turn_summary = TurnSummary {
            turn_number: 5,
            started_at: "2026-02-05T10:00:00Z".to_string(),
            ended_at: Some("2026-02-05T10:01:00Z".to_string()),
            duration_ms: Some(60000),
            user_message: Some("Hello there".to_string()),
            assistant_message: Some("Response".to_string()),
            model: Some("claude-opus-4-5-20251101".to_string()),
            tokens: TurnTokensResponse {
                input: 1000,
                output: 500,
                cache_read: 2000,
                cache_write: 100,
                total: 3600,
            },
            cost: 0.30,
            tool_count: 3,
            tools_used: vec!["Read".to_string(), "Write".to_string(), "Bash".to_string()],
            has_subagents: false,
            stop_reason: Some("end_turn".to_string()),
        };

        let exportable = ExportableTurn::from_turn_summary("session-123", &turn_summary);

        assert_eq!(exportable.session_id, "session-123");
        assert_eq!(exportable.turn_number, 5);
        assert_eq!(exportable.input_tokens, 1000);
        assert_eq!(exportable.output_tokens, 500);
        assert_eq!(exportable.tools_used, "Read, Write, Bash");
    }

    #[test]
    fn test_exportable_turn_truncates_long_message() {
        use crate::commands::TurnSummary;
        use crate::commands::TurnTokensResponse;

        let long_message = "x".repeat(200);

        let turn_summary = TurnSummary {
            turn_number: 1,
            started_at: "2026-02-05T10:00:00Z".to_string(),
            ended_at: None,
            duration_ms: None,
            user_message: Some(long_message),
            assistant_message: None,
            model: None,
            tokens: TurnTokensResponse {
                input: 0,
                output: 0,
                cache_read: 0,
                cache_write: 0,
                total: 0,
            },
            cost: 0.0,
            tool_count: 0,
            tools_used: vec![],
            has_subagents: false,
            stop_reason: None,
        };

        let exportable = ExportableTurn::from_turn_summary("sess", &turn_summary);

        // Message should be truncated to 100 chars + "..."
        assert!(exportable.user_message_preview.is_some());
        let preview = exportable.user_message_preview.unwrap();
        assert!(preview.len() <= 103);
        assert!(preview.ends_with("..."));
    }

    #[test]
    fn test_exportable_trend_from_daily_metrics() {
        use crate::models::metrics::DailyMetrics;

        let metrics = DailyMetrics {
            date: "2026-02-05".to_string(),
            session_count: 5,
            total_turns: 50,
            total_cost: 10.0,
            total_tokens: 100000,
            avg_efficiency_score: Some(0.85),
        };

        let exportable: ExportableTrend = (&metrics).into();

        assert_eq!(exportable.date, "2026-02-05");
        assert_eq!(exportable.session_count, 5);
        assert_eq!(exportable.total_turns, 50);
        assert_eq!(exportable.total_cost, 10.0);
        assert_eq!(exportable.avg_efficiency_score, Some(0.85));
    }

    #[test]
    fn test_generate_export_filename_format() {
        let filename = generate_export_filename("sessions", "csv");

        // Should follow pattern: sessions_YYYYMMDD_HHMMSS.csv
        assert!(filename.starts_with("sessions_"));
        assert!(filename.ends_with(".csv"));
        // Filename should include timestamp (at least 15 chars for YYYYMMDD_HHMMSS)
        assert!(filename.len() > 20);
    }

    #[test]
    fn test_generate_export_filename_unique() {
        // Two calls should potentially generate different filenames (due to timestamp)
        let filename1 = generate_export_filename("test", "json");
        std::thread::sleep(std::time::Duration::from_millis(1));
        let filename2 = generate_export_filename("test", "json");

        // Both should start with prefix and end with extension
        assert!(filename1.starts_with("test_"));
        assert!(filename2.starts_with("test_"));
        assert!(filename1.ends_with(".json"));
        assert!(filename2.ends_with(".json"));
    }
}

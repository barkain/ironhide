//! CSV export functionality
//!
//! Provides CSV serialization for sessions, turns, and trends.

use std::path::PathBuf;

use csv::Writer;

use super::{
    ExportableSession, ExportableTurn, ExportableTrend,
};
use crate::CommandError;

/// Write sessions to CSV format
pub fn write_sessions_csv(
    sessions: &[ExportableSession],
    path: &PathBuf,
) -> Result<(), CommandError> {
    let file = std::fs::File::create(path)
        .map_err(|e| CommandError::Internal(format!("Failed to create CSV file: {}", e)))?;

    let mut writer = Writer::from_writer(file);

    // Write headers and data
    for session in sessions {
        writer
            .serialize(session)
            .map_err(|e| CommandError::Internal(format!("Failed to write CSV record: {}", e)))?;
    }

    writer
        .flush()
        .map_err(|e| CommandError::Internal(format!("Failed to flush CSV: {}", e)))?;

    Ok(())
}

/// Write turns to CSV format
pub fn write_turns_csv(
    turns: &[ExportableTurn],
    path: &PathBuf,
) -> Result<(), CommandError> {
    let file = std::fs::File::create(path)
        .map_err(|e| CommandError::Internal(format!("Failed to create CSV file: {}", e)))?;

    let mut writer = Writer::from_writer(file);

    for turn in turns {
        writer
            .serialize(turn)
            .map_err(|e| CommandError::Internal(format!("Failed to write CSV record: {}", e)))?;
    }

    writer
        .flush()
        .map_err(|e| CommandError::Internal(format!("Failed to flush CSV: {}", e)))?;

    Ok(())
}

/// Write trends to CSV format
pub fn write_trends_csv(
    trends: &[ExportableTrend],
    path: &PathBuf,
) -> Result<(), CommandError> {
    let file = std::fs::File::create(path)
        .map_err(|e| CommandError::Internal(format!("Failed to create CSV file: {}", e)))?;

    let mut writer = Writer::from_writer(file);

    for trend in trends {
        writer
            .serialize(trend)
            .map_err(|e| CommandError::Internal(format!("Failed to write CSV record: {}", e)))?;
    }

    writer
        .flush()
        .map_err(|e| CommandError::Internal(format!("Failed to flush CSV: {}", e)))?;

    Ok(())
}

/// Write combined session and turn data to CSV
/// Creates a flattened structure with session info repeated for each turn
pub fn write_combined_csv(
    sessions: &[ExportableSession],
    turns_map: &std::collections::HashMap<String, Vec<ExportableTurn>>,
    path: &PathBuf,
) -> Result<(), CommandError> {
    let file = std::fs::File::create(path)
        .map_err(|e| CommandError::Internal(format!("Failed to create CSV file: {}", e)))?;

    let mut writer = Writer::from_writer(file);

    // Custom combined record
    #[derive(serde::Serialize)]
    struct CombinedRecord {
        session_id: String,
        session_date: String,
        project_name: String,
        session_model: Option<String>,
        session_turns: u32,
        session_tokens: u64,
        session_cost: f64,
        session_efficiency: Option<f64>,
        turn_number: u32,
        turn_started_at: String,
        turn_model: Option<String>,
        turn_input_tokens: u64,
        turn_output_tokens: u64,
        turn_cache_tokens: u64,
        turn_total_tokens: u64,
        turn_cost: f64,
        turn_tools: String,
    }

    for session in sessions {
        if let Some(turns) = turns_map.get(&session.session_id) {
            for turn in turns {
                let record = CombinedRecord {
                    session_id: session.session_id.clone(),
                    session_date: session.date.clone(),
                    project_name: session.project_name.clone(),
                    session_model: session.model.clone(),
                    session_turns: session.turns,
                    session_tokens: session.tokens,
                    session_cost: session.cost,
                    session_efficiency: session.efficiency_score,
                    turn_number: turn.turn_number,
                    turn_started_at: turn.started_at.clone(),
                    turn_model: turn.model.clone(),
                    turn_input_tokens: turn.input_tokens,
                    turn_output_tokens: turn.output_tokens,
                    turn_cache_tokens: turn.cache_read_tokens + turn.cache_write_tokens,
                    turn_total_tokens: turn.total_tokens,
                    turn_cost: turn.cost,
                    turn_tools: turn.tools_used.clone(),
                };

                writer
                    .serialize(&record)
                    .map_err(|e| CommandError::Internal(format!("Failed to write CSV record: {}", e)))?;
            }
        } else {
            // Session without turns - write session-only record
            let record = CombinedRecord {
                session_id: session.session_id.clone(),
                session_date: session.date.clone(),
                project_name: session.project_name.clone(),
                session_model: session.model.clone(),
                session_turns: session.turns,
                session_tokens: session.tokens,
                session_cost: session.cost,
                session_efficiency: session.efficiency_score,
                turn_number: 0,
                turn_started_at: String::new(),
                turn_model: None,
                turn_input_tokens: 0,
                turn_output_tokens: 0,
                turn_cache_tokens: 0,
                turn_total_tokens: 0,
                turn_cost: 0.0,
                turn_tools: String::new(),
            };

            writer
                .serialize(&record)
                .map_err(|e| CommandError::Internal(format!("Failed to write CSV record: {}", e)))?;
        }
    }

    writer
        .flush()
        .map_err(|e| CommandError::Internal(format!("Failed to flush CSV: {}", e)))?;

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
    fn test_write_sessions_csv() {
        let temp_dir = std::env::temp_dir();
        let path = temp_dir.join("test_sessions.csv");

        let sessions = vec![create_test_session()];
        write_sessions_csv(&sessions, &path).unwrap();

        let content = fs::read_to_string(&path).unwrap();
        assert!(content.contains("session_id"));
        assert!(content.contains("test-123"));
        assert!(content.contains("test-project"));

        fs::remove_file(&path).ok();
    }

    #[test]
    fn test_write_turns_csv() {
        let temp_dir = std::env::temp_dir();
        let path = temp_dir.join("test_turns.csv");

        let turns = vec![create_test_turn()];
        write_turns_csv(&turns, &path).unwrap();

        let content = fs::read_to_string(&path).unwrap();
        assert!(content.contains("turn_number"));
        assert!(content.contains("test-123"));
        assert!(content.contains("Read, Write"));

        fs::remove_file(&path).ok();
    }

    #[test]
    fn test_write_trends_csv() {
        let temp_dir = std::env::temp_dir();
        let path = temp_dir.join("test_trends.csv");

        let trends = vec![create_test_trend()];
        write_trends_csv(&trends, &path).unwrap();

        let content = fs::read_to_string(&path).unwrap();
        assert!(content.contains("date"));
        assert!(content.contains("2026-01-14"));
        assert!(content.contains("session_count"));

        fs::remove_file(&path).ok();
    }

    #[test]
    fn test_write_multiple_sessions_csv() {
        let temp_dir = std::env::temp_dir();
        let path = temp_dir.join("test_multiple_sessions.csv");

        let sessions = vec![
            ExportableSession {
                session_id: "test-1".to_string(),
                date: "2026-01-14T07:00:00Z".to_string(),
                project_name: "project-a".to_string(),
                model: Some("claude-opus-4-5-20251101".to_string()),
                turns: 5,
                tokens: 10000,
                cost: 1.50,
                duration_ms: 60000,
                efficiency_score: Some(0.85),
            },
            ExportableSession {
                session_id: "test-2".to_string(),
                date: "2026-01-15T08:00:00Z".to_string(),
                project_name: "project-b".to_string(),
                model: Some("claude-sonnet-4-5-20251101".to_string()),
                turns: 10,
                tokens: 20000,
                cost: 2.00,
                duration_ms: 120000,
                efficiency_score: Some(0.90),
            },
        ];

        write_sessions_csv(&sessions, &path).unwrap();

        let content = fs::read_to_string(&path).unwrap();
        assert!(content.contains("test-1"));
        assert!(content.contains("test-2"));
        assert!(content.contains("project-a"));
        assert!(content.contains("project-b"));

        fs::remove_file(&path).ok();
    }

    #[test]
    fn test_write_combined_csv() {
        let temp_dir = std::env::temp_dir();
        let path = temp_dir.join("test_combined.csv");

        let sessions = vec![create_test_session()];
        let mut turns_map = std::collections::HashMap::new();
        turns_map.insert("test-123".to_string(), vec![
            create_test_turn(),
            ExportableTurn {
                session_id: "test-123".to_string(),
                turn_number: 2,
                started_at: "2026-01-14T07:01:00Z".to_string(),
                ended_at: Some("2026-01-14T07:02:00Z".to_string()),
                model: Some("claude-opus-4-5-20251101".to_string()),
                input_tokens: 1500,
                output_tokens: 700,
                cache_read_tokens: 2500,
                cache_write_tokens: 150,
                total_tokens: 4850,
                cost: 0.40,
                tool_count: 1,
                tools_used: "Bash".to_string(),
                user_message_preview: Some("Run tests".to_string()),
            },
        ]);

        write_combined_csv(&sessions, &turns_map, &path).unwrap();

        let content = fs::read_to_string(&path).unwrap();
        // Check combined record fields
        assert!(content.contains("session_id"));
        assert!(content.contains("turn_number"));
        assert!(content.contains("test-123"));
        // Should have records for both turns
        let lines: Vec<&str> = content.lines().collect();
        assert_eq!(lines.len(), 3); // Header + 2 turns

        fs::remove_file(&path).ok();
    }

    #[test]
    fn test_write_combined_csv_session_without_turns() {
        let temp_dir = std::env::temp_dir();
        let path = temp_dir.join("test_combined_no_turns.csv");

        let sessions = vec![create_test_session()];
        let turns_map = std::collections::HashMap::new(); // Empty turns

        write_combined_csv(&sessions, &turns_map, &path).unwrap();

        let content = fs::read_to_string(&path).unwrap();
        assert!(content.contains("test-123"));
        // Should have session-only record with turn_number 0
        let lines: Vec<&str> = content.lines().collect();
        assert_eq!(lines.len(), 2); // Header + 1 session record

        fs::remove_file(&path).ok();
    }

    #[test]
    fn test_write_empty_sessions_csv() {
        let temp_dir = std::env::temp_dir();
        let path = temp_dir.join("test_empty_sessions.csv");

        let sessions: Vec<ExportableSession> = vec![];
        write_sessions_csv(&sessions, &path).unwrap();

        let content = fs::read_to_string(&path).unwrap();
        // Should have only header or be empty
        let lines: Vec<&str> = content.lines().filter(|l| !l.is_empty()).collect();
        assert!(lines.len() <= 1);

        fs::remove_file(&path).ok();
    }

    #[test]
    fn test_csv_contains_all_session_fields() {
        let temp_dir = std::env::temp_dir();
        let path = temp_dir.join("test_all_fields.csv");

        let sessions = vec![create_test_session()];
        write_sessions_csv(&sessions, &path).unwrap();

        let content = fs::read_to_string(&path).unwrap();

        // Check all fields are present
        assert!(content.contains("session_id"));
        assert!(content.contains("date"));
        assert!(content.contains("project_name"));
        assert!(content.contains("model"));
        assert!(content.contains("turns"));
        assert!(content.contains("tokens"));
        assert!(content.contains("cost"));
        assert!(content.contains("duration_ms"));
        assert!(content.contains("efficiency_score"));

        fs::remove_file(&path).ok();
    }

    #[test]
    fn test_csv_contains_all_turn_fields() {
        let temp_dir = std::env::temp_dir();
        let path = temp_dir.join("test_all_turn_fields.csv");

        let turns = vec![create_test_turn()];
        write_turns_csv(&turns, &path).unwrap();

        let content = fs::read_to_string(&path).unwrap();

        // Check all turn fields are present
        assert!(content.contains("session_id"));
        assert!(content.contains("turn_number"));
        assert!(content.contains("started_at"));
        assert!(content.contains("input_tokens"));
        assert!(content.contains("output_tokens"));
        assert!(content.contains("cache_read_tokens"));
        assert!(content.contains("tools_used"));

        fs::remove_file(&path).ok();
    }
}

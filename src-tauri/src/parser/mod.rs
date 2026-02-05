//! JSONL parsing module
//!
//! This module handles parsing Claude Code session JSONL files:
//! - Streaming line-by-line parsing for memory efficiency
//! - Full entry type validation and field extraction
//! - Turn aggregation from entries (user -> assistant cycles)
//! - Session file discovery across Claude projects

pub mod jsonl;
pub mod session;

use std::path::PathBuf;

use thiserror::Error;

// Re-export commonly used types
pub use jsonl::{
    ContentBlock, Entry, EntryType, IncrementalReader, MessageContent, ParsedEntry,
    ThinkingMetadata, ToolResult, Usage,
};
pub use session::{CompletedTurn, SessionStats, ToolUse, TurnAggregator};

/// Parser errors
#[derive(Error, Debug)]
pub enum ParserError {
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("JSON parse error: {0}")]
    Json(#[from] serde_json::Error),

    #[error("Invalid entry: {0}")]
    InvalidEntry(String),

    #[error("Missing field: {0}")]
    MissingField(String),

    #[error("Session not found: {0}")]
    SessionNotFound(String),
}

/// Result type for parser operations
pub type ParserResult<T> = Result<T, ParserError>;

/// Information about a discovered session file
#[derive(Debug, Clone)]
pub struct SessionFileInfo {
    /// Path to the session JSONL file
    pub path: PathBuf,
    /// Session ID (extracted from filename)
    pub session_id: String,
    /// Project path (decoded from directory name)
    pub project_path: Option<String>,
    /// File modification time
    pub modified: std::time::SystemTime,
    /// File size in bytes
    pub size: u64,
    /// Whether this is a subagent file
    pub is_subagent: bool,
}

/// Scan for all Claude Code session files
///
/// Looks for JSONL files in:
/// - ~/.claude/projects/*/*.jsonl (main session files)
/// - ~/.claude/projects/*/<session-id>/subagents/*.jsonl (subagent files)
/// - ~/.claude/history.jsonl (global history)
///
/// Returns files sorted by modification time (most recent first)
pub fn scan_claude_sessions() -> Vec<SessionFileInfo> {
    let mut sessions = Vec::new();

    // Get home directory
    let home = match dirs::home_dir() {
        Some(h) => h,
        None => {
            tracing::warn!("Could not determine home directory");
            return sessions;
        }
    };

    let claude_dir = home.join(".claude");
    if !claude_dir.exists() {
        tracing::info!("Claude directory not found: {:?}", claude_dir);
        return sessions;
    }

    // Scan projects directory
    let projects_dir = claude_dir.join("projects");
    if projects_dir.exists() {
        scan_projects_directory(&projects_dir, &mut sessions);
    }

    // Check for global history
    let history_file = claude_dir.join("history.jsonl");
    if history_file.exists() {
        if let Some(info) = create_session_info(&history_file, None, false) {
            sessions.push(info);
        }
    }

    // Sort by modification time (most recent first)
    sessions.sort_by(|a, b| b.modified.cmp(&a.modified));

    sessions
}

/// Scan the projects directory for session files
fn scan_projects_directory(projects_dir: &std::path::Path, sessions: &mut Vec<SessionFileInfo>) {
    let entries = match std::fs::read_dir(projects_dir) {
        Ok(e) => e,
        Err(e) => {
            tracing::warn!("Failed to read projects directory: {}", e);
            return;
        }
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }

        // This is a project directory (encoded path)
        let project_path = decode_project_path(&path);

        // Look for session JSONL files in this directory
        if let Ok(dir_entries) = std::fs::read_dir(&path) {
            for file_entry in dir_entries.flatten() {
                let file_path = file_entry.path();

                if file_path.is_file() {
                    // Main session file (UUID.jsonl)
                    if let Some(ext) = file_path.extension() {
                        if ext == "jsonl" {
                            if let Some(info) =
                                create_session_info(&file_path, project_path.clone(), false)
                            {
                                sessions.push(info);
                            }
                        }
                    }
                } else if file_path.is_dir() {
                    // This might be a session directory with subagents
                    let subagents_dir = file_path.join("subagents");
                    if subagents_dir.exists() {
                        scan_subagents_directory(&subagents_dir, project_path.clone(), sessions);
                    }
                }
            }
        }
    }
}

/// Scan a subagents directory for agent session files
fn scan_subagents_directory(
    subagents_dir: &std::path::Path,
    project_path: Option<String>,
    sessions: &mut Vec<SessionFileInfo>,
) {
    if let Ok(entries) = std::fs::read_dir(subagents_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() {
                if let Some(ext) = path.extension() {
                    if ext == "jsonl" {
                        if let Some(info) = create_session_info(&path, project_path.clone(), true) {
                            sessions.push(info);
                        }
                    }
                }
            }
        }
    }
}

/// Create session info from a file path
fn create_session_info(
    path: &std::path::Path,
    project_path: Option<String>,
    is_subagent: bool,
) -> Option<SessionFileInfo> {
    let metadata = std::fs::metadata(path).ok()?;

    let session_id = path
        .file_stem()
        .and_then(|s| s.to_str())
        .map(|s| {
            // Remove "agent-" prefix for subagent files
            if is_subagent && s.starts_with("agent-") {
                s.strip_prefix("agent-").unwrap_or(s).to_string()
            } else {
                s.to_string()
            }
        })
        .unwrap_or_else(|| "unknown".to_string());

    Some(SessionFileInfo {
        path: path.to_path_buf(),
        session_id,
        project_path,
        modified: metadata.modified().ok()?,
        size: metadata.len(),
        is_subagent,
    })
}

/// Decode project path from encoded directory name
///
/// Claude encodes paths like /Users/user/Projects/myproject as
/// -Users-user-Projects-myproject
fn decode_project_path(dir_path: &std::path::Path) -> Option<String> {
    let dir_name = dir_path.file_name()?.to_str()?;

    // Replace dashes with slashes, handling the leading dash
    if dir_name.starts_with('-') {
        Some(dir_name.replace('-', "/"))
    } else {
        Some(format!("/{}", dir_name.replace('-', "/")))
    }
}

/// Find session file by ID
pub fn find_session_by_id(session_id: &str) -> Option<SessionFileInfo> {
    scan_claude_sessions()
        .into_iter()
        .find(|s| s.session_id == session_id)
}

/// Get all sessions for a specific project
pub fn get_sessions_for_project(project_path: &str) -> Vec<SessionFileInfo> {
    scan_claude_sessions()
        .into_iter()
        .filter(|s| s.project_path.as_deref() == Some(project_path))
        .collect()
}

/// Parse a session file by ID
pub fn parse_session_by_id(
    session_id: &str,
) -> ParserResult<(Vec<CompletedTurn>, SessionStats)> {
    let session_info = find_session_by_id(session_id)
        .ok_or_else(|| ParserError::SessionNotFound(session_id.to_string()))?;

    let turns = session::parse_session_to_turns(&session_info.path)?;
    let stats = SessionStats::from_turns(&turns, Some(session_id.to_string()));

    Ok((turns, stats))
}

/// Parse a session file by path
pub fn parse_session_by_path(
    path: &std::path::Path,
) -> ParserResult<(Vec<CompletedTurn>, SessionStats)> {
    let turns = session::parse_session_to_turns(path)?;

    // Extract session ID from filename
    let session_id = path
        .file_stem()
        .and_then(|s| s.to_str())
        .map(String::from);

    let stats = SessionStats::from_turns(&turns, session_id);

    Ok((turns, stats))
}

/// Streaming session parser that yields turns as they're completed
///
/// This is memory-efficient for very large session files
pub fn parse_session_streaming_by_id<F>(
    session_id: &str,
    on_turn: F,
) -> ParserResult<SessionStats>
where
    F: FnMut(&CompletedTurn),
{
    let session_info = find_session_by_id(session_id)
        .ok_or_else(|| ParserError::SessionNotFound(session_id.to_string()))?;

    session::parse_session_streaming(&session_info.path, on_turn)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_decode_project_path() {
        let path = PathBuf::from("/home/user/.claude/projects/-Users-user-Projects-myapp");
        let decoded = decode_project_path(&path);
        assert_eq!(decoded, Some("/Users/user/Projects/myapp".to_string()));
    }

    #[test]
    fn test_decode_project_path_no_leading_dash() {
        let path = PathBuf::from("/home/user/.claude/projects/Users-user-Projects-myapp");
        let decoded = decode_project_path(&path);
        assert_eq!(decoded, Some("/Users/user/Projects/myapp".to_string()));
    }

    #[test]
    fn test_parser_error_display() {
        let io_err = ParserError::Io(std::io::Error::new(
            std::io::ErrorKind::NotFound,
            "file not found",
        ));
        assert!(io_err.to_string().contains("IO error"));

        let invalid_err = ParserError::InvalidEntry("bad entry".to_string());
        assert_eq!(invalid_err.to_string(), "Invalid entry: bad entry");

        let missing_err = ParserError::MissingField("uuid".to_string());
        assert_eq!(missing_err.to_string(), "Missing field: uuid");

        let not_found = ParserError::SessionNotFound("abc123".to_string());
        assert_eq!(not_found.to_string(), "Session not found: abc123");
    }
}

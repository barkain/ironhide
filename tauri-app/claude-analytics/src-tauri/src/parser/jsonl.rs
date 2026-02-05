//! JSONL line parser
//!
//! Handles streaming parsing of JSONL files with incremental reading

use std::fs::File;
use std::io::{BufRead, BufReader, Seek, SeekFrom};
use std::path::Path;

use serde_json::Value;

use super::ParserResult;

/// Entry types in Claude Code JSONL files
#[derive(Debug, Clone, PartialEq)]
pub enum EntryType {
    User,
    Assistant,
    Progress,
    Summary,
    FileHistorySnapshot,
    Unknown(String),
}

impl From<&str> for EntryType {
    fn from(s: &str) -> Self {
        match s {
            "user" => EntryType::User,
            "assistant" => EntryType::Assistant,
            "progress" => EntryType::Progress,
            "summary" => EntryType::Summary,
            "file-history-snapshot" => EntryType::FileHistorySnapshot,
            other => EntryType::Unknown(other.to_string()),
        }
    }
}

/// A parsed JSONL entry
#[derive(Debug, Clone)]
pub struct ParsedEntry {
    pub entry_type: EntryType,
    pub timestamp: Option<String>,
    pub raw: Value,
}

/// Incremental JSONL reader
pub struct IncrementalReader {
    path: std::path::PathBuf,
    position: u64,
}

impl IncrementalReader {
    /// Create a new incremental reader
    pub fn new<P: AsRef<Path>>(path: P) -> Self {
        Self {
            path: path.as_ref().to_path_buf(),
            position: 0,
        }
    }

    /// Create a new reader starting from a specific position
    pub fn from_position<P: AsRef<Path>>(path: P, position: u64) -> Self {
        Self {
            path: path.as_ref().to_path_buf(),
            position,
        }
    }

    /// Read new lines from the file since last read
    pub fn read_new_lines(&mut self) -> ParserResult<Vec<ParsedEntry>> {
        let file = File::open(&self.path)?;
        let mut reader = BufReader::new(file);

        // Seek to last known position
        reader.seek(SeekFrom::Start(self.position))?;

        let mut entries = Vec::new();
        let mut line = String::new();

        loop {
            line.clear();
            let bytes_read = reader.read_line(&mut line)?;

            if bytes_read == 0 {
                break;
            }

            self.position += bytes_read as u64;

            let trimmed = line.trim();
            if trimmed.is_empty() {
                continue;
            }

            match parse_line(trimmed) {
                Ok(entry) => entries.push(entry),
                Err(e) => {
                    tracing::warn!("Failed to parse line: {}", e);
                    continue;
                }
            }
        }

        Ok(entries)
    }

    /// Get current file position
    pub fn position(&self) -> u64 {
        self.position
    }

    /// Reset position to beginning
    pub fn reset(&mut self) {
        self.position = 0;
    }
}

/// Parse a single JSONL line
pub fn parse_line(line: &str) -> ParserResult<ParsedEntry> {
    let value: Value = serde_json::from_str(line)?;

    let entry_type = value
        .get("type")
        .and_then(|t| t.as_str())
        .map(EntryType::from)
        .unwrap_or(EntryType::Unknown("missing".to_string()));

    let timestamp = value
        .get("timestamp")
        .and_then(|t| t.as_str())
        .map(|s| s.to_string());

    Ok(ParsedEntry {
        entry_type,
        timestamp,
        raw: value,
    })
}

/// Read all entries from a JSONL file
pub fn read_all_entries<P: AsRef<Path>>(path: P) -> ParserResult<Vec<ParsedEntry>> {
    let mut reader = IncrementalReader::new(path);
    reader.read_new_lines()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_line_user() {
        let line = r#"{"type": "user", "timestamp": "2024-01-01T00:00:00Z"}"#;
        let entry = parse_line(line).unwrap();
        assert_eq!(entry.entry_type, EntryType::User);
        assert_eq!(entry.timestamp, Some("2024-01-01T00:00:00Z".to_string()));
    }

    #[test]
    fn test_parse_line_assistant() {
        let line = r#"{"type": "assistant", "message": {"content": "Hello"}}"#;
        let entry = parse_line(line).unwrap();
        assert_eq!(entry.entry_type, EntryType::Assistant);
    }

    #[test]
    fn test_entry_type_from_str() {
        assert_eq!(EntryType::from("user"), EntryType::User);
        assert_eq!(EntryType::from("assistant"), EntryType::Assistant);
        assert_eq!(EntryType::from("progress"), EntryType::Progress);
        assert_eq!(EntryType::from("summary"), EntryType::Summary);
        assert_eq!(EntryType::from("unknown"), EntryType::Unknown("unknown".to_string()));
    }
}

//! JSONL line parser
//!
//! Handles streaming parsing of Claude Code JSONL files with full entry parsing
//! for all entry types: user, assistant, progress, summary, file-history-snapshot

use std::fs::File;
use std::io::{BufRead, BufReader, Seek, SeekFrom};
use std::path::Path;

use serde::{Deserialize, Serialize};
use serde_json::Value;

use super::ParserResult;

/// Entry types in Claude Code JSONL files
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum EntryType {
    User,
    Assistant,
    Progress,
    Summary,
    FileHistorySnapshot,
    #[serde(other)]
    Unknown,
}

impl From<&str> for EntryType {
    fn from(s: &str) -> Self {
        match s {
            "user" => EntryType::User,
            "assistant" => EntryType::Assistant,
            "progress" => EntryType::Progress,
            "summary" => EntryType::Summary,
            "file-history-snapshot" => EntryType::FileHistorySnapshot,
            _ => EntryType::Unknown,
        }
    }
}

impl std::fmt::Display for EntryType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            EntryType::User => write!(f, "user"),
            EntryType::Assistant => write!(f, "assistant"),
            EntryType::Progress => write!(f, "progress"),
            EntryType::Summary => write!(f, "summary"),
            EntryType::FileHistorySnapshot => write!(f, "file-history-snapshot"),
            EntryType::Unknown => write!(f, "unknown"),
        }
    }
}

/// Token usage from assistant messages
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct Usage {
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub cache_read_input_tokens: u64,
    pub cache_creation_input_tokens: u64,
    /// 5-minute ephemeral cache writes
    pub cache_write_5m_tokens: u64,
    /// 1-hour ephemeral cache writes
    pub cache_write_1h_tokens: u64,
}

impl Usage {
    /// Extract usage from a JSON value
    pub fn from_value(value: &Value) -> Self {
        let mut usage = Self::default();

        if let Some(obj) = value.as_object() {
            usage.input_tokens = obj
                .get("input_tokens")
                .and_then(|v| v.as_u64())
                .unwrap_or(0);
            usage.output_tokens = obj
                .get("output_tokens")
                .and_then(|v| v.as_u64())
                .unwrap_or(0);
            usage.cache_read_input_tokens = obj
                .get("cache_read_input_tokens")
                .and_then(|v| v.as_u64())
                .unwrap_or(0);
            usage.cache_creation_input_tokens = obj
                .get("cache_creation_input_tokens")
                .and_then(|v| v.as_u64())
                .unwrap_or(0);

            // Extract ephemeral cache creation details
            if let Some(cache_creation) = obj.get("cache_creation") {
                usage.cache_write_5m_tokens = cache_creation
                    .get("ephemeral_5m_input_tokens")
                    .and_then(|v| v.as_u64())
                    .unwrap_or(0);
                usage.cache_write_1h_tokens = cache_creation
                    .get("ephemeral_1h_input_tokens")
                    .and_then(|v| v.as_u64())
                    .unwrap_or(0);
            }
        }

        usage
    }

    /// Total tokens consumed
    pub fn total_tokens(&self) -> u64 {
        self.input_tokens + self.output_tokens
    }

    /// Total context tokens (input + cache)
    pub fn total_context(&self) -> u64 {
        self.input_tokens
            + self.cache_read_input_tokens
            + self.cache_creation_input_tokens
    }
}

/// Content block types in assistant messages
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ContentBlock {
    Text {
        text: String,
    },
    ToolUse {
        id: String,
        name: String,
        input: Value,
    },
    Thinking {
        thinking: String,
    },
    #[serde(other)]
    Unknown,
}

/// Tool result in user message content
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolResult {
    pub tool_use_id: String,
    pub content: Value,
    #[serde(default)]
    pub is_error: bool,
}

/// Message content - can be string or array of blocks
#[derive(Debug, Clone)]
pub enum MessageContent {
    /// Simple text content (user messages)
    Text(String),
    /// Array of content blocks (assistant messages)
    Blocks(Vec<ContentBlock>),
    /// Array of tool results (tool result messages)
    ToolResults(Vec<ToolResult>),
}

impl MessageContent {
    /// Extract from JSON value
    pub fn from_value(value: &Value) -> Option<Self> {
        if let Some(s) = value.as_str() {
            return Some(MessageContent::Text(s.to_string()));
        }

        if let Some(arr) = value.as_array() {
            // Check if it's tool results
            if arr.first().and_then(|v| v.get("type")).and_then(|t| t.as_str()) == Some("tool_result") {
                let results: Vec<ToolResult> = arr
                    .iter()
                    .filter_map(|v| serde_json::from_value(v.clone()).ok())
                    .collect();
                if !results.is_empty() {
                    return Some(MessageContent::ToolResults(results));
                }
            }

            // Otherwise it's content blocks
            let blocks: Vec<ContentBlock> = arr
                .iter()
                .filter_map(|v| serde_json::from_value(v.clone()).ok())
                .collect();
            if !blocks.is_empty() {
                return Some(MessageContent::Blocks(blocks));
            }
        }

        None
    }

    /// Get text content (concatenates text blocks if multiple)
    pub fn as_text(&self) -> Option<String> {
        match self {
            MessageContent::Text(s) => Some(s.clone()),
            MessageContent::Blocks(blocks) => {
                let texts: Vec<&str> = blocks
                    .iter()
                    .filter_map(|b| match b {
                        ContentBlock::Text { text } => Some(text.as_str()),
                        _ => None,
                    })
                    .collect();
                if texts.is_empty() {
                    None
                } else {
                    Some(texts.join("\n"))
                }
            }
            MessageContent::ToolResults(_) => None,
        }
    }

    /// Extract tool uses from content blocks
    pub fn tool_uses(&self) -> Vec<(String, String, Value)> {
        match self {
            MessageContent::Blocks(blocks) => blocks
                .iter()
                .filter_map(|b| match b {
                    ContentBlock::ToolUse { id, name, input } => {
                        Some((id.clone(), name.clone(), input.clone()))
                    }
                    _ => None,
                })
                .collect(),
            _ => Vec::new(),
        }
    }

    /// Check if content contains tool results (indicating this is a tool result message)
    pub fn is_tool_result(&self) -> bool {
        matches!(self, MessageContent::ToolResults(_))
    }
}

/// Thinking metadata from user messages
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ThinkingMetadata {
    pub level: Option<String>,
    #[serde(default)]
    pub disabled: bool,
}

/// A fully parsed JSONL entry
#[derive(Debug, Clone)]
pub struct Entry {
    // Core fields present on all entries
    pub entry_type: EntryType,
    pub uuid: Option<String>,
    pub parent_uuid: Option<String>,
    pub session_id: Option<String>,
    pub timestamp: Option<String>,

    // Subagent identification
    pub agent_id: Option<String>,
    pub slug: Option<String>,
    pub is_sidechain: bool,

    // User entry fields
    pub user_type: Option<String>,
    pub cwd: Option<String>,
    pub version: Option<String>,
    pub git_branch: Option<String>,
    pub thinking_metadata: Option<ThinkingMetadata>,

    // Message fields
    pub message_role: Option<String>,
    pub message_content: Option<MessageContent>,

    // Assistant-specific fields
    pub model: Option<String>,
    pub message_id: Option<String>,
    pub stop_reason: Option<String>,
    pub usage: Option<Usage>,

    // Cost tracking
    pub cost_usd: Option<f64>,

    // Progress entry fields
    pub hook_event: Option<String>,
    pub hook_name: Option<String>,
    pub tool_use: Option<Value>,

    // Summary entry fields
    pub summary: Option<String>,
    pub leaf_uuid: Option<String>,

    // File history snapshot
    pub snapshot: Option<Value>,

    // Keep raw value for unparsed fields
    pub raw: Value,
}

impl Entry {
    /// Check if this is a user input message (not a tool result)
    pub fn is_user_input(&self) -> bool {
        self.entry_type == EntryType::User
            && self.message_role.as_deref() == Some("user")
            && self
                .message_content
                .as_ref()
                .map(|c| !c.is_tool_result())
                .unwrap_or(true)
    }

    /// Check if this is a subagent entry
    pub fn is_subagent(&self) -> bool {
        self.agent_id.is_some() || self.is_sidechain
    }

    /// Extract tool uses from assistant message
    pub fn tool_uses(&self) -> Vec<(String, String, Value)> {
        self.message_content
            .as_ref()
            .map(|c| c.tool_uses())
            .unwrap_or_default()
    }
}

/// Parse a single JSONL line into a fully structured Entry
pub fn parse_line(line: &str) -> ParserResult<Entry> {
    let value: Value = serde_json::from_str(line)?;

    let entry_type = value
        .get("type")
        .and_then(|t| t.as_str())
        .map(EntryType::from)
        .unwrap_or(EntryType::Unknown);

    let uuid = value.get("uuid").and_then(|v| v.as_str()).map(String::from);
    let parent_uuid = value
        .get("parentUuid")
        .and_then(|v| v.as_str())
        .map(String::from);
    let session_id = value
        .get("sessionId")
        .and_then(|v| v.as_str())
        .map(String::from);
    let timestamp = value
        .get("timestamp")
        .and_then(|v| v.as_str())
        .map(String::from);

    // Subagent fields
    let agent_id = value
        .get("agentId")
        .and_then(|v| v.as_str())
        .map(String::from);
    let slug = value.get("slug").and_then(|v| v.as_str()).map(String::from);
    let is_sidechain = value
        .get("isSidechain")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);

    // User-specific fields
    let user_type = value
        .get("userType")
        .and_then(|v| v.as_str())
        .map(String::from);
    let cwd = value.get("cwd").and_then(|v| v.as_str()).map(String::from);
    let version = value
        .get("version")
        .and_then(|v| v.as_str())
        .map(String::from);
    let git_branch = value
        .get("gitBranch")
        .and_then(|v| v.as_str())
        .map(String::from);
    let thinking_metadata = value
        .get("thinkingMetadata")
        .and_then(|v| serde_json::from_value(v.clone()).ok());

    // Message fields
    let message = value.get("message");
    let message_role = message
        .and_then(|m| m.get("role"))
        .and_then(|v| v.as_str())
        .map(String::from);
    let message_content = message
        .and_then(|m| m.get("content"))
        .and_then(MessageContent::from_value);

    // Assistant-specific fields
    let model = message
        .and_then(|m| m.get("model"))
        .and_then(|v| v.as_str())
        .map(String::from);
    let message_id = message
        .and_then(|m| m.get("id"))
        .and_then(|v| v.as_str())
        .map(String::from);
    let stop_reason = message
        .and_then(|m| m.get("stop_reason"))
        .and_then(|v| v.as_str())
        .map(String::from);
    let usage = message.and_then(|m| m.get("usage")).map(Usage::from_value);

    // Cost tracking (may be at top level)
    let cost_usd = value.get("costUSD").and_then(|v| v.as_f64());

    // Progress entry fields
    let hook_event = value
        .get("hookEvent")
        .and_then(|v| v.as_str())
        .map(String::from);
    let hook_name = value
        .get("hookName")
        .and_then(|v| v.as_str())
        .map(String::from);
    let tool_use = value.get("toolUse").cloned();

    // Summary entry fields
    let summary = value
        .get("summary")
        .and_then(|v| v.as_str())
        .map(String::from);
    let leaf_uuid = value
        .get("leafUuid")
        .and_then(|v| v.as_str())
        .map(String::from);

    // File history snapshot
    let snapshot = value.get("snapshot").cloned();

    Ok(Entry {
        entry_type,
        uuid,
        parent_uuid,
        session_id,
        timestamp,
        agent_id,
        slug,
        is_sidechain,
        user_type,
        cwd,
        version,
        git_branch,
        thinking_metadata,
        message_role,
        message_content,
        model,
        message_id,
        stop_reason,
        usage,
        cost_usd,
        hook_event,
        hook_name,
        tool_use,
        summary,
        leaf_uuid,
        snapshot,
        raw: value,
    })
}

/// Incremental JSONL reader for streaming large files
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
    pub fn read_new_lines(&mut self) -> ParserResult<Vec<Entry>> {
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

/// Read all entries from a JSONL file
pub fn read_all_entries<P: AsRef<Path>>(path: P) -> ParserResult<Vec<Entry>> {
    let mut reader = IncrementalReader::new(path);
    reader.read_new_lines()
}

/// Streaming parser that calls a callback for each entry
/// This is memory-efficient for very large files
pub fn parse_streaming<P, F>(path: P, mut callback: F) -> ParserResult<()>
where
    P: AsRef<Path>,
    F: FnMut(Entry),
{
    let file = File::open(path.as_ref())?;
    let reader = BufReader::new(file);

    for line in reader.lines() {
        let line = line?;
        let trimmed = line.trim();

        if trimmed.is_empty() {
            continue;
        }

        match parse_line(trimmed) {
            Ok(entry) => callback(entry),
            Err(e) => {
                tracing::warn!("Failed to parse line: {}", e);
                continue;
            }
        }
    }

    Ok(())
}

/// Legacy ParsedEntry type for backward compatibility
#[derive(Debug, Clone)]
pub struct ParsedEntry {
    pub entry_type: EntryType,
    pub timestamp: Option<String>,
    pub raw: Value,
}

impl From<Entry> for ParsedEntry {
    fn from(entry: Entry) -> Self {
        Self {
            entry_type: entry.entry_type,
            timestamp: entry.timestamp,
            raw: entry.raw,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_user_entry() {
        let line = r#"{
            "type": "user",
            "uuid": "abc123",
            "parentUuid": null,
            "sessionId": "session-1",
            "timestamp": "2026-01-14T07:44:28.531Z",
            "isSidechain": false,
            "userType": "external",
            "cwd": "/Users/user/Projects",
            "version": "2.1.7",
            "gitBranch": "main",
            "message": {
                "role": "user",
                "content": "Hello, Claude!"
            },
            "thinkingMetadata": {"level": "high", "disabled": false}
        }"#;

        let entry = parse_line(line).unwrap();

        assert_eq!(entry.entry_type, EntryType::User);
        assert_eq!(entry.uuid, Some("abc123".to_string()));
        assert!(entry.parent_uuid.is_none());
        assert_eq!(entry.session_id, Some("session-1".to_string()));
        assert_eq!(entry.user_type, Some("external".to_string()));
        assert_eq!(entry.git_branch, Some("main".to_string()));
        assert_eq!(entry.message_role, Some("user".to_string()));
        assert!(entry.is_user_input());
        assert!(!entry.is_subagent());

        if let Some(MessageContent::Text(text)) = &entry.message_content {
            assert_eq!(text, "Hello, Claude!");
        } else {
            panic!("Expected text content");
        }
    }

    #[test]
    fn test_parse_assistant_entry_with_tool_use() {
        let line = r#"{
            "type": "assistant",
            "uuid": "def456",
            "parentUuid": "abc123",
            "sessionId": "session-1",
            "timestamp": "2026-01-14T07:44:30.000Z",
            "isSidechain": false,
            "message": {
                "model": "claude-opus-4-5-20251101",
                "id": "msg_123",
                "role": "assistant",
                "content": [
                    {"type": "text", "text": "Let me check that."},
                    {"type": "tool_use", "id": "toolu_123", "name": "Bash", "input": {"command": "git status"}}
                ],
                "stop_reason": "tool_use",
                "usage": {
                    "input_tokens": 100,
                    "output_tokens": 50,
                    "cache_read_input_tokens": 1000,
                    "cache_creation_input_tokens": 500,
                    "cache_creation": {
                        "ephemeral_5m_input_tokens": 300,
                        "ephemeral_1h_input_tokens": 200
                    }
                }
            }
        }"#;

        let entry = parse_line(line).unwrap();

        assert_eq!(entry.entry_type, EntryType::Assistant);
        assert_eq!(entry.model, Some("claude-opus-4-5-20251101".to_string()));
        assert_eq!(entry.stop_reason, Some("tool_use".to_string()));

        let usage = entry.usage.as_ref().unwrap();
        assert_eq!(usage.input_tokens, 100);
        assert_eq!(usage.output_tokens, 50);
        assert_eq!(usage.cache_read_input_tokens, 1000);
        assert_eq!(usage.cache_creation_input_tokens, 500);
        assert_eq!(usage.cache_write_5m_tokens, 300);
        assert_eq!(usage.cache_write_1h_tokens, 200);
        assert_eq!(usage.total_tokens(), 150);
        assert_eq!(usage.total_context(), 1600);

        let tool_uses = entry.tool_uses();
        assert_eq!(tool_uses.len(), 1);
        assert_eq!(tool_uses[0].0, "toolu_123");
        assert_eq!(tool_uses[0].1, "Bash");
    }

    #[test]
    fn test_parse_tool_result_entry() {
        let line = r#"{
            "type": "user",
            "uuid": "ghi789",
            "parentUuid": "def456",
            "message": {
                "role": "user",
                "content": [
                    {
                        "type": "tool_result",
                        "tool_use_id": "toolu_123",
                        "content": "On branch main",
                        "is_error": false
                    }
                ]
            }
        }"#;

        let entry = parse_line(line).unwrap();

        assert_eq!(entry.entry_type, EntryType::User);
        assert!(!entry.is_user_input()); // Tool result, not user input

        if let Some(MessageContent::ToolResults(results)) = &entry.message_content {
            assert_eq!(results.len(), 1);
            assert_eq!(results[0].tool_use_id, "toolu_123");
            assert!(!results[0].is_error);
        } else {
            panic!("Expected tool results");
        }
    }

    #[test]
    fn test_parse_subagent_entry() {
        let line = r#"{
            "type": "assistant",
            "uuid": "jkl012",
            "agentId": "a053f8b",
            "slug": "fuzzy-rolling-llama",
            "isSidechain": true,
            "message": {
                "model": "claude-opus-4-5-20251101",
                "role": "assistant",
                "content": [{"type": "text", "text": "Working on it..."}],
                "stop_reason": "end_turn"
            }
        }"#;

        let entry = parse_line(line).unwrap();

        assert!(entry.is_subagent());
        assert_eq!(entry.agent_id, Some("a053f8b".to_string()));
        assert_eq!(entry.slug, Some("fuzzy-rolling-llama".to_string()));
        assert!(entry.is_sidechain);
    }

    #[test]
    fn test_parse_progress_entry() {
        let line = r#"{
            "type": "progress",
            "timestamp": "2026-01-14T07:44:35.000Z",
            "hookEvent": "PreToolUse",
            "hookName": "Bash",
            "toolUse": {
                "name": "Bash",
                "input": {"command": "ls -la"}
            }
        }"#;

        let entry = parse_line(line).unwrap();

        assert_eq!(entry.entry_type, EntryType::Progress);
        assert_eq!(entry.hook_event, Some("PreToolUse".to_string()));
        assert_eq!(entry.hook_name, Some("Bash".to_string()));
        assert!(entry.tool_use.is_some());
    }

    #[test]
    fn test_parse_summary_entry() {
        let line = r#"{
            "type": "summary",
            "summary": "Implemented calculator module with tests",
            "leafUuid": "xyz999"
        }"#;

        let entry = parse_line(line).unwrap();

        assert_eq!(entry.entry_type, EntryType::Summary);
        assert_eq!(
            entry.summary,
            Some("Implemented calculator module with tests".to_string())
        );
        assert_eq!(entry.leaf_uuid, Some("xyz999".to_string()));
    }

    #[test]
    fn test_parse_file_history_snapshot() {
        let line = r#"{
            "type": "file-history-snapshot",
            "snapshot": {
                "trackedFileBackups": ["/path/to/file.rs"]
            }
        }"#;

        let entry = parse_line(line).unwrap();

        assert_eq!(entry.entry_type, EntryType::FileHistorySnapshot);
        assert!(entry.snapshot.is_some());
    }

    #[test]
    fn test_entry_type_from_str() {
        assert_eq!(EntryType::from("user"), EntryType::User);
        assert_eq!(EntryType::from("assistant"), EntryType::Assistant);
        assert_eq!(EntryType::from("progress"), EntryType::Progress);
        assert_eq!(EntryType::from("summary"), EntryType::Summary);
        assert_eq!(
            EntryType::from("file-history-snapshot"),
            EntryType::FileHistorySnapshot
        );
        assert_eq!(EntryType::from("something-else"), EntryType::Unknown);
    }

    #[test]
    fn test_usage_defaults() {
        let usage = Usage::default();
        assert_eq!(usage.input_tokens, 0);
        assert_eq!(usage.output_tokens, 0);
        assert_eq!(usage.total_tokens(), 0);
        assert_eq!(usage.total_context(), 0);
    }

    #[test]
    fn test_parse_invalid_json() {
        let result = parse_line("not valid json");
        assert!(result.is_err());
    }

    #[test]
    fn test_parse_missing_type() {
        let line = r#"{"uuid": "test"}"#;
        let entry = parse_line(line).unwrap();
        assert_eq!(entry.entry_type, EntryType::Unknown);
    }
}

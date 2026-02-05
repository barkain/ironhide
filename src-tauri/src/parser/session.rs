//! Session aggregator
//!
//! Aggregates JSONL entries into turns (cycles) and sessions
//! A turn/cycle starts with a user message and ends with an assistant message
//! with stop_reason: "end_turn"

use serde::{Deserialize, Serialize};
use serde_json::Value;

use super::jsonl::{Entry, EntryType, MessageContent, Usage};

/// Tool use within a turn
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolUse {
    pub id: String,
    pub name: String,
    pub input: Option<Value>,
    pub result: Option<String>,
    pub is_error: bool,
}

/// A completed turn (cycle) in a session
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompletedTurn {
    pub turn_number: u32,
    pub started_at: String,
    pub ended_at: Option<String>,
    pub duration_ms: Option<i64>,
    pub user_message: Option<String>,
    pub assistant_message: Option<String>,
    pub model: Option<String>,
    pub stop_reason: Option<String>,

    // Token usage (aggregated across all assistant responses in turn)
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub cache_read_tokens: u64,
    pub cache_write_5m_tokens: u64,
    pub cache_write_1h_tokens: u64,

    // Derived metrics
    pub total_tokens: u64,
    pub total_context: u64,

    // Tool tracking
    pub tool_uses: Vec<ToolUse>,
    pub tool_count: u32,

    // Subagent tracking
    pub has_subagents: bool,
    pub subagent_ids: Vec<String>,

    // Entry UUIDs for reference
    pub start_uuid: Option<String>,
    pub end_uuid: Option<String>,

    // All entries in this turn (for detailed analysis)
    pub entry_count: u32,
}

impl CompletedTurn {
    /// Calculate duration if both timestamps are present
    pub fn calculate_duration(&self) -> Option<i64> {
        let started = chrono::DateTime::parse_from_rfc3339(&self.started_at).ok()?;
        let ended = self
            .ended_at
            .as_ref()
            .and_then(|e| chrono::DateTime::parse_from_rfc3339(e).ok())?;
        Some((ended - started).num_milliseconds())
    }
}

/// A turn that is being built
struct PartialTurn {
    turn_number: u32,
    started_at: String,
    start_uuid: Option<String>,
    user_message: Option<String>,
    assistant_messages: Vec<String>,
    model: Option<String>,
    stop_reason: Option<String>,
    ended_at: Option<String>,
    end_uuid: Option<String>,

    // Aggregated usage
    input_tokens: u64,
    output_tokens: u64,
    cache_read_tokens: u64,
    cache_write_5m_tokens: u64,
    cache_write_1h_tokens: u64,

    // Tool tracking
    tool_uses: Vec<ToolUse>,
    pending_tool_uses: Vec<(String, String, Value)>, // (id, name, input) waiting for results

    // Subagent tracking
    subagent_ids: Vec<String>,

    // Entry count
    entry_count: u32,
}

impl PartialTurn {
    fn new(turn_number: u32, started_at: String, start_uuid: Option<String>) -> Self {
        Self {
            turn_number,
            started_at,
            start_uuid,
            user_message: None,
            assistant_messages: Vec::new(),
            model: None,
            stop_reason: None,
            ended_at: None,
            end_uuid: None,
            input_tokens: 0,
            output_tokens: 0,
            cache_read_tokens: 0,
            cache_write_5m_tokens: 0,
            cache_write_1h_tokens: 0,
            tool_uses: Vec::new(),
            pending_tool_uses: Vec::new(),
            subagent_ids: Vec::new(),
            entry_count: 0,
        }
    }

    fn add_usage(&mut self, usage: &Usage) {
        self.input_tokens += usage.input_tokens;
        self.output_tokens += usage.output_tokens;
        self.cache_read_tokens += usage.cache_read_input_tokens;
        // Use the more detailed cache write tokens if available, otherwise fall back
        if usage.cache_write_5m_tokens > 0 || usage.cache_write_1h_tokens > 0 {
            self.cache_write_5m_tokens += usage.cache_write_5m_tokens;
            self.cache_write_1h_tokens += usage.cache_write_1h_tokens;
        } else {
            // Fall back to legacy field - treat as 5m cache
            self.cache_write_5m_tokens += usage.cache_creation_input_tokens;
        }
    }

    fn complete(self) -> CompletedTurn {
        let assistant_message = if self.assistant_messages.is_empty() {
            None
        } else {
            Some(self.assistant_messages.join("\n"))
        };

        let total_tokens = self.input_tokens + self.output_tokens;
        let total_context = self.input_tokens
            + self.cache_read_tokens
            + self.cache_write_5m_tokens
            + self.cache_write_1h_tokens;

        let mut turn = CompletedTurn {
            turn_number: self.turn_number,
            started_at: self.started_at,
            ended_at: self.ended_at,
            duration_ms: None,
            user_message: self.user_message,
            assistant_message,
            model: self.model,
            stop_reason: self.stop_reason,
            input_tokens: self.input_tokens,
            output_tokens: self.output_tokens,
            cache_read_tokens: self.cache_read_tokens,
            cache_write_5m_tokens: self.cache_write_5m_tokens,
            cache_write_1h_tokens: self.cache_write_1h_tokens,
            total_tokens,
            total_context,
            tool_uses: self.tool_uses,
            tool_count: 0,
            has_subagents: !self.subagent_ids.is_empty(),
            subagent_ids: self.subagent_ids,
            start_uuid: self.start_uuid,
            end_uuid: self.end_uuid,
            entry_count: self.entry_count,
        };

        turn.tool_count = turn.tool_uses.len() as u32;
        turn.duration_ms = turn.calculate_duration();

        turn
    }
}

/// Aggregates entries into complete turns
pub struct TurnAggregator {
    current_turn: Option<PartialTurn>,
    turn_number: u32,
    completed_turns: Vec<CompletedTurn>,
}

impl TurnAggregator {
    /// Create a new turn aggregator
    pub fn new() -> Self {
        Self {
            current_turn: None,
            turn_number: 0,
            completed_turns: Vec::new(),
        }
    }

    /// Process an entry, potentially completing a turn
    pub fn process_entry(&mut self, entry: Entry) -> Option<CompletedTurn> {
        // Increment entry count if we have a current turn
        if let Some(ref mut turn) = self.current_turn {
            turn.entry_count += 1;
        }

        match entry.entry_type {
            EntryType::User => self.process_user_entry(entry),
            EntryType::Assistant => self.process_assistant_entry(entry),
            EntryType::Progress => self.process_progress_entry(entry),
            _ => None,
        }
    }

    fn process_user_entry(&mut self, entry: Entry) -> Option<CompletedTurn> {
        // Check if this is a user input (not tool result)
        if !entry.is_user_input() {
            // This is a tool result - try to match it with pending tool uses
            if let Some(ref mut turn) = self.current_turn {
                if let Some(MessageContent::ToolResults(results)) = &entry.message_content {
                    for result in results {
                        // Find matching pending tool use
                        if let Some(pos) = turn
                            .pending_tool_uses
                            .iter()
                            .position(|(id, _, _)| id == &result.tool_use_id)
                        {
                            let (id, name, input) = turn.pending_tool_uses.remove(pos);
                            let result_str = match &result.content {
                                Value::String(s) => Some(s.clone()),
                                v => Some(v.to_string()),
                            };
                            turn.tool_uses.push(ToolUse {
                                id,
                                name,
                                input: Some(input),
                                result: result_str,
                                is_error: result.is_error,
                            });
                        }
                    }
                }
            }
            return None;
        }

        // Complete previous turn if exists
        let completed = self.flush();

        // Start new turn
        self.turn_number += 1;
        let mut new_turn = PartialTurn::new(
            self.turn_number,
            entry.timestamp.clone().unwrap_or_default(),
            entry.uuid.clone(),
        );

        // Extract user message
        if let Some(content) = &entry.message_content {
            new_turn.user_message = content.as_text();
        }

        new_turn.entry_count = 1;
        self.current_turn = Some(new_turn);

        completed
    }

    fn process_assistant_entry(&mut self, entry: Entry) -> Option<CompletedTurn> {
        if let Some(ref mut turn) = self.current_turn {
            // Track subagent
            if entry.is_subagent() {
                if let Some(agent_id) = &entry.agent_id {
                    if !turn.subagent_ids.contains(agent_id) {
                        turn.subagent_ids.push(agent_id.clone());
                    }
                }
            }

            // Extract message content
            if let Some(content) = &entry.message_content {
                if let Some(text) = content.as_text() {
                    turn.assistant_messages.push(text);
                }

                // Track tool uses
                for (id, name, input) in content.tool_uses() {
                    turn.pending_tool_uses.push((id, name, input));
                }
            }

            // Extract model (first one seen)
            if turn.model.is_none() {
                turn.model = entry.model.clone();
            }

            // Extract usage
            if let Some(usage) = &entry.usage {
                turn.add_usage(usage);
            }

            // Extract stop reason
            turn.stop_reason = entry.stop_reason.clone();

            // Check if turn is complete
            if turn.stop_reason.as_deref() == Some("end_turn") {
                turn.ended_at = entry.timestamp.clone();
                turn.end_uuid = entry.uuid.clone();

                // Complete any remaining pending tool uses (no result received)
                for (id, name, input) in turn.pending_tool_uses.drain(..) {
                    turn.tool_uses.push(ToolUse {
                        id,
                        name,
                        input: Some(input),
                        result: None,
                        is_error: false,
                    });
                }

                return self.flush();
            }
        }

        None
    }

    fn process_progress_entry(&mut self, entry: Entry) -> Option<CompletedTurn> {
        // Progress entries may contain tool use information from hooks
        if let Some(ref mut turn) = self.current_turn {
            if let Some(tool_use) = entry.tool_use {
                let name = tool_use
                    .get("name")
                    .and_then(|v| v.as_str())
                    .unwrap_or("unknown")
                    .to_string();

                // Check if we already have this tool use (from assistant message)
                let already_tracked = turn.tool_uses.iter().any(|t| t.name == name)
                    || turn.pending_tool_uses.iter().any(|(_, n, _)| n == &name);

                if !already_tracked {
                    // This is additional tool info from progress event
                    let id = tool_use
                        .get("id")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string();
                    let input = tool_use.get("input").cloned();
                    let result = tool_use
                        .get("result")
                        .and_then(|v| v.as_str())
                        .map(String::from);
                    let is_error = tool_use
                        .get("is_error")
                        .and_then(|v| v.as_bool())
                        .unwrap_or(false);

                    turn.tool_uses.push(ToolUse {
                        id,
                        name,
                        input,
                        result,
                        is_error,
                    });
                }
            }
        }

        None
    }

    /// Flush the current turn, returning it if it exists
    pub fn flush(&mut self) -> Option<CompletedTurn> {
        self.current_turn.take().map(|turn| {
            let completed = turn.complete();
            self.completed_turns.push(completed.clone());
            completed
        })
    }

    /// Get all completed turns
    pub fn turns(&self) -> &[CompletedTurn] {
        &self.completed_turns
    }

    /// Get number of completed turns
    pub fn turn_count(&self) -> usize {
        self.completed_turns.len()
    }

    /// Check if there's an in-progress turn
    pub fn has_partial_turn(&self) -> bool {
        self.current_turn.is_some()
    }

    /// Reset the aggregator
    pub fn reset(&mut self) {
        self.current_turn = None;
        self.turn_number = 0;
        self.completed_turns.clear();
    }
}

impl Default for TurnAggregator {
    fn default() -> Self {
        Self::new()
    }
}

/// Session-level aggregated statistics
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct SessionStats {
    pub session_id: Option<String>,
    pub turn_count: u32,
    pub total_input_tokens: u64,
    pub total_output_tokens: u64,
    pub total_cache_read_tokens: u64,
    pub total_cache_write_tokens: u64,
    pub total_tool_uses: u32,
    pub unique_tools: Vec<String>,
    pub models_used: Vec<String>,
    pub subagent_count: u32,
    pub first_timestamp: Option<String>,
    pub last_timestamp: Option<String>,
    pub total_duration_ms: Option<i64>,
}

impl SessionStats {
    /// Calculate stats from completed turns
    pub fn from_turns(turns: &[CompletedTurn], session_id: Option<String>) -> Self {
        let mut stats = Self {
            session_id,
            turn_count: turns.len() as u32,
            ..Default::default()
        };

        let mut unique_tools = std::collections::HashSet::new();
        let mut models = std::collections::HashSet::new();
        let mut subagent_ids = std::collections::HashSet::new();

        for turn in turns {
            stats.total_input_tokens += turn.input_tokens;
            stats.total_output_tokens += turn.output_tokens;
            stats.total_cache_read_tokens += turn.cache_read_tokens;
            stats.total_cache_write_tokens += turn.cache_write_5m_tokens + turn.cache_write_1h_tokens;
            stats.total_tool_uses += turn.tool_count;

            for tool in &turn.tool_uses {
                unique_tools.insert(tool.name.clone());
            }

            if let Some(model) = &turn.model {
                models.insert(model.clone());
            }

            for agent_id in &turn.subagent_ids {
                subagent_ids.insert(agent_id.clone());
            }

            // Track timestamps
            if stats.first_timestamp.is_none() {
                stats.first_timestamp = Some(turn.started_at.clone());
            }
            if let Some(ended) = &turn.ended_at {
                stats.last_timestamp = Some(ended.clone());
            }
        }

        stats.unique_tools = unique_tools.into_iter().collect();
        stats.models_used = models.into_iter().collect();
        stats.subagent_count = subagent_ids.len() as u32;

        // Calculate total duration
        if let (Some(first), Some(last)) = (&stats.first_timestamp, &stats.last_timestamp) {
            if let (Ok(start), Ok(end)) = (
                chrono::DateTime::parse_from_rfc3339(first),
                chrono::DateTime::parse_from_rfc3339(last),
            ) {
                stats.total_duration_ms = Some((end - start).num_milliseconds());
            }
        }

        stats
    }
}

/// Parse a session file and return all turns
pub fn parse_session_to_turns(path: &std::path::Path) -> super::ParserResult<Vec<CompletedTurn>> {
    let entries = super::jsonl::read_all_entries(path)?;
    let mut aggregator = TurnAggregator::new();

    for entry in entries {
        aggregator.process_entry(entry);
    }

    // Flush any remaining partial turn
    aggregator.flush();

    Ok(aggregator.completed_turns)
}

/// Parse a session file with streaming for memory efficiency
pub fn parse_session_streaming<F>(
    path: &std::path::Path,
    mut on_turn: F,
) -> super::ParserResult<SessionStats>
where
    F: FnMut(&CompletedTurn),
{
    let mut aggregator = TurnAggregator::new();
    let mut session_id = None;

    super::jsonl::parse_streaming(path, |entry| {
        // Capture session ID from first entry that has it
        if session_id.is_none() {
            session_id = entry.session_id.clone();
        }

        if let Some(turn) = aggregator.process_entry(entry) {
            on_turn(&turn);
        }
    })?;

    // Flush any remaining partial turn
    if let Some(turn) = aggregator.flush() {
        on_turn(&turn);
    }

    Ok(SessionStats::from_turns(aggregator.turns(), session_id))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::parser::jsonl::parse_line;

    fn create_user_entry(uuid: &str, content: &str) -> Entry {
        let json = format!(
            r#"{{
                "type": "user",
                "uuid": "{}",
                "timestamp": "2026-01-14T07:44:28.531Z",
                "message": {{"role": "user", "content": "{}"}}
            }}"#,
            uuid, content
        );
        parse_line(&json).unwrap()
    }

    fn create_assistant_entry(uuid: &str, parent: &str, stop_reason: &str) -> Entry {
        let json = format!(
            r#"{{
                "type": "assistant",
                "uuid": "{}",
                "parentUuid": "{}",
                "timestamp": "2026-01-14T07:44:30.000Z",
                "message": {{
                    "model": "claude-opus-4-5-20251101",
                    "role": "assistant",
                    "content": [{{"type": "text", "text": "Response text"}}],
                    "stop_reason": "{}",
                    "usage": {{
                        "input_tokens": 100,
                        "output_tokens": 50,
                        "cache_read_input_tokens": 1000,
                        "cache_creation_input_tokens": 500
                    }}
                }}
            }}"#,
            uuid, parent, stop_reason
        );
        parse_line(&json).unwrap()
    }

    #[test]
    fn test_single_turn() {
        let mut aggregator = TurnAggregator::new();

        let user = create_user_entry("user-1", "Hello");
        let assistant = create_assistant_entry("asst-1", "user-1", "end_turn");

        let completed_after_user = aggregator.process_entry(user);
        assert!(completed_after_user.is_none()); // No turn completed yet

        let completed_after_assistant = aggregator.process_entry(assistant);
        assert!(completed_after_assistant.is_some());

        let turn = completed_after_assistant.unwrap();
        assert_eq!(turn.turn_number, 1);
        assert_eq!(turn.user_message, Some("Hello".to_string()));
        assert_eq!(turn.assistant_message, Some("Response text".to_string()));
        assert_eq!(turn.stop_reason, Some("end_turn".to_string()));
        assert_eq!(turn.input_tokens, 100);
        assert_eq!(turn.output_tokens, 50);
        assert_eq!(turn.cache_read_tokens, 1000);
    }

    #[test]
    fn test_multiple_turns() {
        let mut aggregator = TurnAggregator::new();

        // First turn
        aggregator.process_entry(create_user_entry("user-1", "First question"));
        let turn1 = aggregator.process_entry(create_assistant_entry("asst-1", "user-1", "end_turn"));
        assert!(turn1.is_some());

        // Second turn
        let turn2_started =
            aggregator.process_entry(create_user_entry("user-2", "Second question"));
        assert!(turn2_started.is_none()); // Previous turn already completed

        let turn2 = aggregator.process_entry(create_assistant_entry("asst-2", "user-2", "end_turn"));
        assert!(turn2.is_some());

        assert_eq!(aggregator.turn_count(), 2);
        assert_eq!(aggregator.turns()[0].turn_number, 1);
        assert_eq!(aggregator.turns()[1].turn_number, 2);
    }

    #[test]
    fn test_tool_use_turn() {
        let mut aggregator = TurnAggregator::new();

        // User message
        aggregator.process_entry(create_user_entry("user-1", "Run git status"));

        // Assistant with tool use
        let assistant_with_tool = parse_line(
            r#"{
                "type": "assistant",
                "uuid": "asst-1",
                "timestamp": "2026-01-14T07:44:30.000Z",
                "message": {
                    "model": "claude-opus-4-5-20251101",
                    "role": "assistant",
                    "content": [
                        {"type": "text", "text": "Let me check."},
                        {"type": "tool_use", "id": "toolu_123", "name": "Bash", "input": {"command": "git status"}}
                    ],
                    "stop_reason": "tool_use",
                    "usage": {"input_tokens": 100, "output_tokens": 50}
                }
            }"#,
        )
        .unwrap();

        let result = aggregator.process_entry(assistant_with_tool);
        assert!(result.is_none()); // Not end_turn

        // Tool result
        let tool_result = parse_line(
            r#"{
                "type": "user",
                "uuid": "tool-1",
                "message": {
                    "role": "user",
                    "content": [
                        {"type": "tool_result", "tool_use_id": "toolu_123", "content": "On branch main", "is_error": false}
                    ]
                }
            }"#,
        )
        .unwrap();

        aggregator.process_entry(tool_result);

        // Final assistant response
        let final_response = create_assistant_entry("asst-2", "tool-1", "end_turn");
        let completed = aggregator.process_entry(final_response);

        assert!(completed.is_some());
        let turn = completed.unwrap();

        assert_eq!(turn.tool_uses.len(), 1);
        assert_eq!(turn.tool_uses[0].name, "Bash");
        assert_eq!(turn.tool_uses[0].result, Some("On branch main".to_string()));
        assert!(!turn.tool_uses[0].is_error);
    }

    #[test]
    fn test_subagent_detection() {
        let mut aggregator = TurnAggregator::new();

        aggregator.process_entry(create_user_entry("user-1", "Complex task"));

        // Subagent response
        let subagent = parse_line(
            r#"{
                "type": "assistant",
                "uuid": "sub-1",
                "agentId": "agent-123",
                "slug": "fuzzy-llama",
                "isSidechain": true,
                "timestamp": "2026-01-14T07:44:30.000Z",
                "message": {
                    "model": "claude-opus-4-5-20251101",
                    "role": "assistant",
                    "content": [{"type": "text", "text": "Working..."}],
                    "stop_reason": "end_turn",
                    "usage": {"input_tokens": 100, "output_tokens": 50}
                }
            }"#,
        )
        .unwrap();

        let completed = aggregator.process_entry(subagent);
        assert!(completed.is_some());

        let turn = completed.unwrap();
        assert!(turn.has_subagents);
        assert!(turn.subagent_ids.contains(&"agent-123".to_string()));
    }

    #[test]
    fn test_session_stats() {
        let turns = vec![
            CompletedTurn {
                turn_number: 1,
                started_at: "2026-01-14T07:44:28.000Z".to_string(),
                ended_at: Some("2026-01-14T07:44:30.000Z".to_string()),
                duration_ms: Some(2000),
                user_message: Some("Hello".to_string()),
                assistant_message: Some("Hi".to_string()),
                model: Some("claude-opus-4-5-20251101".to_string()),
                stop_reason: Some("end_turn".to_string()),
                input_tokens: 100,
                output_tokens: 50,
                cache_read_tokens: 1000,
                cache_write_5m_tokens: 500,
                cache_write_1h_tokens: 0,
                total_tokens: 150,
                total_context: 1600,
                tool_uses: vec![ToolUse {
                    id: "t1".to_string(),
                    name: "Bash".to_string(),
                    input: None,
                    result: None,
                    is_error: false,
                }],
                tool_count: 1,
                has_subagents: false,
                subagent_ids: vec![],
                start_uuid: Some("u1".to_string()),
                end_uuid: Some("a1".to_string()),
                entry_count: 2,
            },
            CompletedTurn {
                turn_number: 2,
                started_at: "2026-01-14T07:44:35.000Z".to_string(),
                ended_at: Some("2026-01-14T07:44:40.000Z".to_string()),
                duration_ms: Some(5000),
                user_message: Some("More".to_string()),
                assistant_message: Some("Sure".to_string()),
                model: Some("claude-opus-4-5-20251101".to_string()),
                stop_reason: Some("end_turn".to_string()),
                input_tokens: 200,
                output_tokens: 100,
                cache_read_tokens: 2000,
                cache_write_5m_tokens: 0,
                cache_write_1h_tokens: 300,
                total_tokens: 300,
                total_context: 2500,
                tool_uses: vec![
                    ToolUse {
                        id: "t2".to_string(),
                        name: "Read".to_string(),
                        input: None,
                        result: None,
                        is_error: false,
                    },
                    ToolUse {
                        id: "t3".to_string(),
                        name: "Bash".to_string(),
                        input: None,
                        result: None,
                        is_error: false,
                    },
                ],
                tool_count: 2,
                has_subagents: true,
                subagent_ids: vec!["agent-1".to_string()],
                start_uuid: Some("u2".to_string()),
                end_uuid: Some("a2".to_string()),
                entry_count: 5,
            },
        ];

        let stats = SessionStats::from_turns(&turns, Some("session-1".to_string()));

        assert_eq!(stats.turn_count, 2);
        assert_eq!(stats.total_input_tokens, 300);
        assert_eq!(stats.total_output_tokens, 150);
        assert_eq!(stats.total_cache_read_tokens, 3000);
        assert_eq!(stats.total_cache_write_tokens, 800);
        assert_eq!(stats.total_tool_uses, 3);
        assert_eq!(stats.unique_tools.len(), 2);
        assert!(stats.unique_tools.contains(&"Bash".to_string()));
        assert!(stats.unique_tools.contains(&"Read".to_string()));
        assert_eq!(stats.subagent_count, 1);
    }
}

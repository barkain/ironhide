//! Session aggregator
//!
//! Aggregates JSONL entries into turns and sessions

use serde_json::Value;

use super::jsonl::{EntryType, ParsedEntry};

/// Aggregates entries into complete turns
pub struct TurnAggregator {
    current_turn: Option<PartialTurn>,
    turn_number: u32,
}

/// A turn that is being built
struct PartialTurn {
    started_at: String,
    user_message: Option<String>,
    assistant_message: Option<String>,
    model: Option<String>,
    stop_reason: Option<String>,
    input_tokens: u32,
    output_tokens: u32,
    cache_read_tokens: u32,
    cache_write_tokens: u32,
    tool_uses: Vec<ToolUse>,
}

/// A tool use within a turn
#[derive(Debug, Clone)]
pub struct ToolUse {
    pub name: String,
    pub input: Option<Value>,
    pub result: Option<String>,
    pub is_error: bool,
}

/// A completed turn
#[derive(Debug, Clone)]
pub struct CompletedTurn {
    pub turn_number: u32,
    pub started_at: String,
    pub ended_at: Option<String>,
    pub user_message: Option<String>,
    pub assistant_message: Option<String>,
    pub model: Option<String>,
    pub stop_reason: Option<String>,
    pub input_tokens: u32,
    pub output_tokens: u32,
    pub cache_read_tokens: u32,
    pub cache_write_tokens: u32,
    pub tool_uses: Vec<ToolUse>,
}

impl TurnAggregator {
    /// Create a new turn aggregator
    pub fn new() -> Self {
        Self {
            current_turn: None,
            turn_number: 0,
        }
    }

    /// Process an entry, returning a completed turn if one is finished
    pub fn process_entry(&mut self, entry: ParsedEntry) -> Option<CompletedTurn> {
        match entry.entry_type {
            EntryType::User => {
                // Complete previous turn if exists
                let completed = self.flush();

                // Start new turn
                self.turn_number += 1;
                self.current_turn = Some(PartialTurn {
                    started_at: entry.timestamp.unwrap_or_default(),
                    user_message: extract_user_message(&entry.raw),
                    assistant_message: None,
                    model: None,
                    stop_reason: None,
                    input_tokens: 0,
                    output_tokens: 0,
                    cache_read_tokens: 0,
                    cache_write_tokens: 0,
                    tool_uses: Vec::new(),
                });

                completed
            }
            EntryType::Assistant => {
                if let Some(ref mut turn) = self.current_turn {
                    // Extract message and usage
                    if let Some(message) = entry.raw.get("message") {
                        turn.assistant_message = extract_assistant_message(message);

                        // Extract token usage
                        if let Some(usage) = message.get("usage") {
                            turn.input_tokens = usage.get("input_tokens")
                                .and_then(|v| v.as_u64())
                                .unwrap_or(0) as u32;
                            turn.output_tokens = usage.get("output_tokens")
                                .and_then(|v| v.as_u64())
                                .unwrap_or(0) as u32;
                            turn.cache_read_tokens = usage.get("cache_read_input_tokens")
                                .and_then(|v| v.as_u64())
                                .unwrap_or(0) as u32;
                            turn.cache_write_tokens = usage.get("cache_creation_input_tokens")
                                .and_then(|v| v.as_u64())
                                .unwrap_or(0) as u32;
                        }

                        // Extract model
                        turn.model = message.get("model")
                            .and_then(|v| v.as_str())
                            .map(|s| s.to_string());

                        // Extract stop reason
                        turn.stop_reason = message.get("stop_reason")
                            .and_then(|v| v.as_str())
                            .map(|s| s.to_string());

                        // Check if turn is complete
                        if turn.stop_reason.as_deref() == Some("end_turn") {
                            return self.flush();
                        }
                    }
                }
                None
            }
            EntryType::Progress => {
                // Tool use events
                if let Some(ref mut turn) = self.current_turn {
                    if let Some(tool_use) = extract_tool_use(&entry.raw) {
                        turn.tool_uses.push(tool_use);
                    }
                }
                None
            }
            _ => None,
        }
    }

    /// Flush the current turn, returning it if it exists
    pub fn flush(&mut self) -> Option<CompletedTurn> {
        self.current_turn.take().map(|turn| {
            CompletedTurn {
                turn_number: self.turn_number,
                started_at: turn.started_at,
                ended_at: None, // TODO: Calculate from last entry
                user_message: turn.user_message,
                assistant_message: turn.assistant_message,
                model: turn.model,
                stop_reason: turn.stop_reason,
                input_tokens: turn.input_tokens,
                output_tokens: turn.output_tokens,
                cache_read_tokens: turn.cache_read_tokens,
                cache_write_tokens: turn.cache_write_tokens,
                tool_uses: turn.tool_uses,
            }
        })
    }
}

/// Extract user message content from entry
fn extract_user_message(value: &Value) -> Option<String> {
    value
        .get("message")?
        .get("content")
        .and_then(|c| {
            if let Some(s) = c.as_str() {
                Some(s.to_string())
            } else if let Some(arr) = c.as_array() {
                // Handle array of content blocks
                arr.iter()
                    .filter_map(|block| {
                        if block.get("type")?.as_str()? == "text" {
                            block.get("text")?.as_str().map(|s| s.to_string())
                        } else {
                            None
                        }
                    })
                    .next()
            } else {
                None
            }
        })
}

/// Extract assistant message content
fn extract_assistant_message(message: &Value) -> Option<String> {
    message
        .get("content")
        .and_then(|c| {
            if let Some(arr) = c.as_array() {
                // Concatenate text blocks
                let texts: Vec<String> = arr
                    .iter()
                    .filter_map(|block| {
                        if block.get("type")?.as_str()? == "text" {
                            block.get("text")?.as_str().map(|s| s.to_string())
                        } else {
                            None
                        }
                    })
                    .collect();

                if texts.is_empty() {
                    None
                } else {
                    Some(texts.join("\n"))
                }
            } else {
                None
            }
        })
}

/// Extract tool use from progress entry
fn extract_tool_use(value: &Value) -> Option<ToolUse> {
    let tool_use = value.get("toolUse")?;

    Some(ToolUse {
        name: tool_use.get("name")?.as_str()?.to_string(),
        input: tool_use.get("input").cloned(),
        result: tool_use.get("result").and_then(|v| v.as_str()).map(|s| s.to_string()),
        is_error: tool_use.get("is_error").and_then(|v| v.as_bool()).unwrap_or(false),
    })
}

impl Default for TurnAggregator {
    fn default() -> Self {
        Self::new()
    }
}

//! Turn (cycle) data types
//!
//! Types representing individual turns within a session

use serde::{Deserialize, Serialize};

/// A complete turn record
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Turn {
    pub turn_id: String,
    pub session_id: String,
    pub turn_number: i32,
    pub started_at: String,
    pub ended_at: Option<String>,
    pub duration_ms: Option<i64>,
    pub user_message: Option<String>,
    pub assistant_message: Option<String>,
    pub model: Option<String>,
    pub stop_reason: Option<String>,
    pub created_at: String,
}

/// Turn with associated metrics
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TurnWithMetrics {
    pub turn: Turn,
    pub metrics: TurnMetrics,
}

/// Token and cost metrics for a turn
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TurnMetrics {
    pub turn_id: String,
    pub input_tokens: i64,
    pub output_tokens: i64,
    pub cache_read_tokens: i64,
    pub cache_write_5m_tokens: i64,
    pub cache_write_1h_tokens: i64,
    pub total_cost: f64,
    pub context_usage_pct: f64,
    pub tool_count: i32,
}

impl TurnMetrics {
    /// Total tokens (input + output)
    pub fn total_tokens(&self) -> i64 {
        self.input_tokens + self.output_tokens
    }

    /// Total cache tokens
    pub fn total_cache(&self) -> i64 {
        self.cache_read_tokens + self.cache_write_5m_tokens + self.cache_write_1h_tokens
    }
}

/// Tool use within a turn
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolUse {
    pub tool_use_id: String,
    pub turn_id: String,
    pub tool_name: String,
    pub input_json: Option<String>,
    pub result: Option<String>,
    pub is_error: bool,
    pub duration_ms: Option<i64>,
    pub created_at: String,
}

/// Code change within a turn
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CodeChange {
    pub change_id: String,
    pub turn_id: String,
    pub file_path: String,
    pub change_type: ChangeType,
    pub lines_added: i32,
    pub lines_removed: i32,
    pub extension: Option<String>,
    pub created_at: String,
}

/// Type of code change
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ChangeType {
    Create,
    Modify,
    Delete,
}

impl std::fmt::Display for ChangeType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ChangeType::Create => write!(f, "create"),
            ChangeType::Modify => write!(f, "modify"),
            ChangeType::Delete => write!(f, "delete"),
        }
    }
}

/// Builder for turn records
pub struct TurnBuilder {
    turn_id: String,
    session_id: String,
    turn_number: i32,
    started_at: String,
    ended_at: Option<String>,
    user_message: Option<String>,
    assistant_message: Option<String>,
    model: Option<String>,
    stop_reason: Option<String>,
}

impl TurnBuilder {
    /// Create a new turn builder
    pub fn new(session_id: String, turn_number: i32, started_at: String) -> Self {
        let turn_id = format!("{}_{}", session_id, turn_number);

        Self {
            turn_id,
            session_id,
            turn_number,
            started_at,
            ended_at: None,
            user_message: None,
            assistant_message: None,
            model: None,
            stop_reason: None,
        }
    }

    /// Set user message
    pub fn user_message(mut self, message: String) -> Self {
        self.user_message = Some(message);
        self
    }

    /// Set assistant message
    pub fn assistant_message(mut self, message: String) -> Self {
        self.assistant_message = Some(message);
        self
    }

    /// Set model
    pub fn model(mut self, model: String) -> Self {
        self.model = Some(model);
        self
    }

    /// Set stop reason
    pub fn stop_reason(mut self, reason: String) -> Self {
        self.stop_reason = Some(reason);
        self
    }

    /// Set end time
    pub fn ended_at(mut self, ended_at: String) -> Self {
        self.ended_at = Some(ended_at);
        self
    }

    /// Build the turn
    pub fn build(self) -> Turn {
        let duration_ms = self.calculate_duration();

        Turn {
            turn_id: self.turn_id,
            session_id: self.session_id,
            turn_number: self.turn_number,
            started_at: self.started_at,
            ended_at: self.ended_at,
            duration_ms,
            user_message: self.user_message,
            assistant_message: self.assistant_message,
            model: self.model,
            stop_reason: self.stop_reason,
            created_at: chrono::Utc::now().to_rfc3339(),
        }
    }

    /// Calculate duration from start and end times
    fn calculate_duration(&self) -> Option<i64> {
        let started = chrono::DateTime::parse_from_rfc3339(&self.started_at).ok()?;
        let ended = self.ended_at.as_ref()
            .and_then(|e| chrono::DateTime::parse_from_rfc3339(e).ok())?;

        Some((ended - started).num_milliseconds())
    }
}

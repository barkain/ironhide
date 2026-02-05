//! Session data types
//!
//! Types representing Claude Code sessions

use serde::{Deserialize, Serialize};

/// Full session record
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Session {
    pub session_id: String,
    pub project_path: String,
    pub project_name: String,
    pub branch: Option<String>,
    pub started_at: String,
    pub last_activity_at: String,
    pub model: String,
    pub is_active: bool,
    pub file_path: String,
    pub created_at: String,
    pub updated_at: String,
}

/// Summary view of a session for list display
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionSummary {
    pub session_id: String,
    pub project_name: String,
    pub branch: Option<String>,
    pub started_at: String,
    pub last_activity_at: String,
    pub model: String,
    pub is_active: bool,
    pub total_turns: i32,
    pub total_cost: f64,
    pub total_tokens: i64,
}

/// Session with full details including metrics
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionDetail {
    pub session: Session,
    pub metrics: Option<crate::models::metrics::SessionMetrics>,
    pub git_info: Option<GitInfo>,
}

/// Git context for a session
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitInfo {
    pub session_id: String,
    pub branch: Option<String>,
    pub worktree: Option<String>,
    pub commit_count: i32,
    pub last_commit_hash: Option<String>,
    pub last_commit_time: Option<String>,
}

/// Filter options for session queries
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct SessionFilter {
    /// Filter by project name (partial match)
    pub project_name: Option<String>,
    /// Filter by branch name
    pub branch: Option<String>,
    /// Filter by model
    pub model: Option<String>,
    /// Only active sessions
    pub active_only: Option<bool>,
    /// Start date (ISO-8601)
    pub start_date: Option<String>,
    /// End date (ISO-8601)
    pub end_date: Option<String>,
    /// Minimum cost
    pub min_cost: Option<f64>,
    /// Maximum cost
    pub max_cost: Option<f64>,
}

/// Builder for creating session records
pub struct SessionBuilder {
    session_id: String,
    project_path: String,
    project_name: String,
    branch: Option<String>,
    started_at: String,
    model: String,
    file_path: String,
}

impl SessionBuilder {
    /// Create a new session builder
    pub fn new(
        session_id: String,
        project_path: String,
        model: String,
        file_path: String,
    ) -> Self {
        let project_name = std::path::Path::new(&project_path)
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("Unknown")
            .to_string();

        Self {
            session_id,
            project_path,
            project_name,
            branch: None,
            started_at: chrono::Utc::now().to_rfc3339(),
            model,
            file_path,
        }
    }

    /// Set branch
    pub fn branch(mut self, branch: String) -> Self {
        self.branch = Some(branch);
        self
    }

    /// Set start time
    pub fn started_at(mut self, started_at: String) -> Self {
        self.started_at = started_at;
        self
    }

    /// Build the session
    pub fn build(self) -> Session {
        let now = chrono::Utc::now().to_rfc3339();

        Session {
            session_id: self.session_id,
            project_path: self.project_path,
            project_name: self.project_name,
            branch: self.branch,
            started_at: self.started_at.clone(),
            last_activity_at: self.started_at,
            model: self.model,
            is_active: true,
            file_path: self.file_path,
            created_at: now.clone(),
            updated_at: now,
        }
    }
}

//! Claude Code Analytics - Tauri Backend
//!
//! This library provides the Rust backend for the Claude Code Analytics dashboard.
//! It handles:
//! - JSONL session file parsing
//! - SQLite database management
//! - Metrics calculation
//! - File system watching for live updates
//! - Session caching for performance

pub mod commands;
pub mod db;
pub mod export;
pub mod metrics;
pub mod models;
pub mod parser;
pub mod patterns;
pub mod recommendations;
pub mod trends;
pub mod watcher;

use std::sync::Mutex;

use db::Database;

/// Application state managed by Tauri
pub struct AppState {
    pub db: Mutex<Option<Database>>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            db: Mutex::new(None),
        }
    }
}

/// Error type for Tauri commands
#[derive(Debug, thiserror::Error)]
pub enum CommandError {
    #[error("Database error: {0}")]
    Database(#[from] db::DbError),

    #[error("Database not initialized")]
    NotInitialized,

    #[error("Session not found: {0}")]
    SessionNotFound(String),

    #[error("Internal error: {0}")]
    Internal(String),

    #[error("Parser error: {0}")]
    Parser(String),
}

// Implement serialization for Tauri
impl serde::Serialize for CommandError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

// ============================================================================
// Tauri Application Setup
// ============================================================================

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Initialize logging
    tracing_subscriber::fmt()
        .with_max_level(tracing::Level::INFO)
        .init();

    tracing::info!("Starting Claude Code Analytics backend");
    tracing::info!("Scanning for sessions in ~/.claude/projects/");

    // Do initial session scan on startup
    let session_count = parser::scan_claude_sessions().len();
    tracing::info!("Found {} session files", session_count);

    tauri::Builder::default()
        .manage(AppState::default())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            // Session commands
            commands::get_sessions,
            commands::get_session,
            commands::get_session_metrics,
            commands::get_session_count,
            // Turn commands
            commands::get_turns,
            // Subagent commands
            commands::get_session_subagents,
            // Comparison commands
            commands::compare_sessions,
            // Code changes commands
            commands::get_session_code_changes,
            // Trend commands
            commands::get_trends,
            commands::get_cost_trend,
            commands::get_efficiency_trend,
            // Utility commands
            commands::get_db_path,
            commands::refresh_sessions,
            commands::scan_new_sessions,
            // Export commands
            commands::export_sessions,
            commands::export_trends,
            // Recommendations commands
            commands::get_recommendations,
            // Anti-pattern detection commands
            commands::detect_antipatterns,
        ])
        .setup(|app| {
            // Spawn background task to watch for new sessions
            let app_handle = app.handle().clone();
            std::thread::spawn(move || {
                session_watcher_task(app_handle);
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

/// Background task that periodically checks for new/updated sessions
fn session_watcher_task(app_handle: tauri::AppHandle) {
    use std::collections::HashSet;
    use std::time::Duration;
    use tauri::Emitter;

    let mut known_sessions: HashSet<String> = HashSet::new();

    // Initial population
    for session in parser::scan_claude_sessions() {
        known_sessions.insert(session.session_id);
    }

    loop {
        // Check every 30 seconds
        std::thread::sleep(Duration::from_secs(30));

        let current_sessions = parser::scan_claude_sessions();
        let mut new_sessions = Vec::new();

        for session in &current_sessions {
            if !known_sessions.contains(&session.session_id) {
                tracing::info!("New session discovered: {}", session.session_id);
                new_sessions.push(session.session_id.clone());
                known_sessions.insert(session.session_id.clone());
            }
        }

        // Emit event if new sessions found
        if !new_sessions.is_empty() {
            let _ = app_handle.emit("sessions-updated", &new_sessions);
        }
    }
}

//! Claude Code Analytics - Tauri Backend
//!
//! This library provides the Rust backend for the Claude Code Analytics dashboard.
//! It handles:
//! - JSONL session file parsing
//! - SQLite database management
//! - Metrics calculation
//! - File system watching for live updates

pub mod commands;
pub mod db;
pub mod metrics;
pub mod models;
pub mod parser;
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

    tauri::Builder::default()
        .manage(AppState::default())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            commands::get_sessions,
            commands::get_session,
            commands::get_db_path,
            commands::get_session_metrics,
            commands::get_turns,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

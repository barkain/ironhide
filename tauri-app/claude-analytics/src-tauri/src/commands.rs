//! Tauri command handlers
//!
//! All IPC commands exposed to the frontend

use crate::db;
use crate::models::session::{Session, SessionSummary};
use crate::models::metrics::SessionMetrics;
use crate::models::turn::Turn;
use crate::AppState;
use crate::CommandError;

/// Initialize the database if needed
fn init_database(state: &AppState) -> Result<(), CommandError> {
    let mut db_lock = state.db.lock().unwrap();

    if db_lock.is_some() {
        return Ok(());
    }

    // Ensure directory exists
    let db_path = db::default_db_path();
    if let Some(parent) = db_path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| CommandError::Internal(e.to_string()))?;
    }

    // Create database
    let database = db::Database::new(db_path)?;
    database.initialize()?;

    *db_lock = Some(database);

    tracing::info!("Database initialized");
    Ok(())
}

/// Get all sessions with optional pagination
#[tauri::command]
pub fn get_sessions(
    state: tauri::State<'_, AppState>,
    limit: Option<u32>,
    offset: Option<u32>,
) -> Result<Vec<SessionSummary>, CommandError> {
    init_database(&state)?;

    let db_lock = state.db.lock().unwrap();
    let db = db_lock.as_ref().ok_or(CommandError::NotInitialized)?;

    Ok(db.with_connection(|conn| {
        db::queries::get_sessions(conn, limit, offset)
    })?)
}

/// Get a single session by ID
#[tauri::command]
pub fn get_session(
    state: tauri::State<'_, AppState>,
    session_id: String,
) -> Result<Session, CommandError> {
    init_database(&state)?;

    let db_lock = state.db.lock().unwrap();
    let db = db_lock.as_ref().ok_or(CommandError::NotInitialized)?;

    db.with_connection(|conn| {
        db::queries::get_session(conn, &session_id)?
            .ok_or_else(|| db::DbError::NotInitialized)
    }).map_err(|_| CommandError::SessionNotFound(session_id))
}

/// Get the database path
#[tauri::command]
pub fn get_db_path(state: tauri::State<'_, AppState>) -> Result<String, CommandError> {
    init_database(&state)?;

    let db_lock = state.db.lock().unwrap();
    let db = db_lock.as_ref().ok_or(CommandError::NotInitialized)?;

    Ok(db.path().to_string_lossy().to_string())
}

/// Get session metrics
#[tauri::command]
pub fn get_session_metrics(
    state: tauri::State<'_, AppState>,
    session_id: String,
) -> Result<Option<SessionMetrics>, CommandError> {
    init_database(&state)?;

    let db_lock = state.db.lock().unwrap();
    let db = db_lock.as_ref().ok_or(CommandError::NotInitialized)?;

    Ok(db.with_connection(|conn| {
        db::queries::get_session_metrics(conn, &session_id)
    })?)
}

/// Get turns for a session
#[tauri::command]
pub fn get_turns(
    state: tauri::State<'_, AppState>,
    session_id: String,
    limit: Option<u32>,
    offset: Option<u32>,
) -> Result<Vec<Turn>, CommandError> {
    init_database(&state)?;

    let db_lock = state.db.lock().unwrap();
    let db = db_lock.as_ref().ok_or(CommandError::NotInitialized)?;

    Ok(db.with_connection(|conn| {
        db::queries::get_turns(conn, &session_id, limit, offset)
    })?)
}

//! Database query implementations
//!
//! Contains functions for querying sessions, turns, and metrics

use rusqlite::{params, Connection, OptionalExtension};
use std::collections::HashMap;
use super::DbError;
use crate::models::session::{Session, SessionSummary};
use crate::models::turn::Turn;
use crate::models::metrics::SessionMetrics;

/// Cached session data from database including mtime for validation
#[derive(Debug, Clone)]
pub struct CachedSessionData {
    pub session_id: String,
    pub project_path: String,
    pub project_name: String,
    pub branch: Option<String>,
    pub started_at: String,
    pub last_activity_at: Option<String>,
    pub model: Option<String>,
    pub is_active: bool,
    pub total_turns: u32,
    pub total_cost: f64,
    pub total_tokens: u64,
    pub total_duration_ms: u64,
    pub file_path: String,
    pub file_mtime: Option<String>,
}

/// Get all sessions with optional filtering
pub fn get_sessions(
    conn: &Connection,
    limit: Option<u32>,
    offset: Option<u32>,
) -> Result<Vec<SessionSummary>, DbError> {
    let limit = limit.unwrap_or(100);
    let offset = offset.unwrap_or(0);

    let mut stmt = conn.prepare(
        r#"
        SELECT
            s.session_id,
            s.project_name,
            s.branch,
            s.started_at,
            s.last_activity_at,
            s.model,
            s.is_active,
            COALESCE(m.total_turns, 0) as total_turns,
            COALESCE(m.total_cost, 0.0) as total_cost,
            COALESCE(m.total_input_tokens + m.total_output_tokens + m.total_cache_read + m.total_cache_write, 0) as total_tokens
        FROM sessions s
        LEFT JOIN session_metrics m ON s.session_id = m.session_id
        ORDER BY s.last_activity_at DESC
        LIMIT ?1 OFFSET ?2
        "#,
    )?;

    let sessions = stmt
        .query_map(params![limit, offset], |row| {
            Ok(SessionSummary {
                session_id: row.get(0)?,
                project_name: row.get(1)?,
                branch: row.get(2)?,
                started_at: row.get(3)?,
                last_activity_at: row.get(4)?,
                model: row.get(5)?,
                is_active: row.get::<_, i32>(6)? == 1,
                total_turns: row.get(7)?,
                total_cost: row.get(8)?,
                total_tokens: row.get(9)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(sessions)
}

/// Get a single session by ID
pub fn get_session(conn: &Connection, session_id: &str) -> Result<Option<Session>, DbError> {
    let mut stmt = conn.prepare(
        r#"
        SELECT
            session_id,
            project_path,
            project_name,
            branch,
            started_at,
            last_activity_at,
            model,
            is_active,
            file_path,
            created_at,
            updated_at
        FROM sessions
        WHERE session_id = ?1
        "#,
    )?;

    let session = stmt
        .query_row(params![session_id], |row| {
            Ok(Session {
                session_id: row.get(0)?,
                project_path: row.get(1)?,
                project_name: row.get(2)?,
                branch: row.get(3)?,
                started_at: row.get(4)?,
                last_activity_at: row.get(5)?,
                model: row.get(6)?,
                is_active: row.get::<_, i32>(7)? == 1,
                file_path: row.get(8)?,
                created_at: row.get(9)?,
                updated_at: row.get(10)?,
            })
        })
        .optional()?;

    Ok(session)
}

/// Get session metrics by session ID
pub fn get_session_metrics(
    conn: &Connection,
    session_id: &str,
) -> Result<Option<SessionMetrics>, DbError> {
    let mut stmt = conn.prepare(
        r#"
        SELECT
            session_id,
            total_turns,
            total_duration_ms,
            total_cost,
            total_input_tokens,
            total_output_tokens,
            total_cache_read,
            total_cache_write,
            avg_cost_per_turn,
            avg_tokens_per_turn,
            peak_context_pct,
            efficiency_score,
            cache_hit_rate,
            updated_at
        FROM session_metrics
        WHERE session_id = ?1
        "#,
    )?;

    let metrics = stmt
        .query_row(params![session_id], |row| {
            Ok(SessionMetrics {
                session_id: row.get(0)?,
                total_turns: row.get(1)?,
                total_duration_ms: row.get(2)?,
                total_cost: row.get(3)?,
                total_input_tokens: row.get(4)?,
                total_output_tokens: row.get(5)?,
                total_cache_read: row.get(6)?,
                total_cache_write: row.get(7)?,
                avg_cost_per_turn: row.get(8)?,
                avg_tokens_per_turn: row.get(9)?,
                peak_context_pct: row.get(10)?,
                efficiency_score: row.get(11)?,
                cache_hit_rate: row.get(12)?,
                updated_at: row.get(13)?,
            })
        })
        .optional()?;

    Ok(metrics)
}

/// Get turns for a session
pub fn get_turns(
    conn: &Connection,
    session_id: &str,
    limit: Option<u32>,
    offset: Option<u32>,
) -> Result<Vec<Turn>, DbError> {
    let limit = limit.unwrap_or(100);
    let offset = offset.unwrap_or(0);

    let mut stmt = conn.prepare(
        r#"
        SELECT
            turn_id,
            session_id,
            turn_number,
            started_at,
            ended_at,
            duration_ms,
            user_message,
            assistant_message,
            model,
            stop_reason,
            created_at
        FROM turns
        WHERE session_id = ?1
        ORDER BY turn_number ASC
        LIMIT ?2 OFFSET ?3
        "#,
    )?;

    let turns = stmt
        .query_map(params![session_id, limit, offset], |row| {
            Ok(Turn {
                turn_id: row.get(0)?,
                session_id: row.get(1)?,
                turn_number: row.get(2)?,
                started_at: row.get(3)?,
                ended_at: row.get(4)?,
                duration_ms: row.get(5)?,
                user_message: row.get(6)?,
                assistant_message: row.get(7)?,
                model: row.get(8)?,
                stop_reason: row.get(9)?,
                created_at: row.get(10)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(turns)
}

/// Get file position for incremental parsing
pub fn get_file_position(conn: &Connection, file_path: &str) -> Result<Option<u64>, DbError> {
    let mut stmt = conn.prepare(
        "SELECT byte_position FROM file_positions WHERE file_path = ?1",
    )?;

    let position = stmt
        .query_row(params![file_path], |row| row.get::<_, i64>(0))
        .optional()?
        .map(|p| p as u64);

    Ok(position)
}

/// Update file position after parsing
pub fn update_file_position(
    conn: &Connection,
    file_path: &str,
    position: u64,
) -> Result<(), DbError> {
    conn.execute(
        r#"
        INSERT INTO file_positions (file_path, byte_position, last_read_at)
        VALUES (?1, ?2, CURRENT_TIMESTAMP)
        ON CONFLICT(file_path) DO UPDATE SET
            byte_position = excluded.byte_position,
            last_read_at = excluded.last_read_at
        "#,
        params![file_path, position as i64],
    )?;

    Ok(())
}

/// Insert or update a session
pub fn upsert_session(
    conn: &Connection,
    session_id: &str,
    project_path: &str,
    project_name: &str,
    branch: Option<&str>,
    started_at: &str,
    last_activity_at: &str,
    model: &str,
    is_active: bool,
    file_path: &str,
) -> Result<(), DbError> {
    conn.execute(
        r#"
        INSERT INTO sessions (
            session_id, project_path, project_name, branch,
            started_at, last_activity_at, model, is_active, file_path
        )
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
        ON CONFLICT(session_id) DO UPDATE SET
            last_activity_at = excluded.last_activity_at,
            is_active = excluded.is_active,
            updated_at = CURRENT_TIMESTAMP
        "#,
        params![
            session_id,
            project_path,
            project_name,
            branch,
            started_at,
            last_activity_at,
            model,
            if is_active { 1 } else { 0 },
            file_path
        ],
    )?;
    Ok(())
}

/// Insert or update session metrics
pub fn upsert_session_metrics(
    conn: &Connection,
    session_id: &str,
    total_turns: u32,
    total_duration_ms: u64,
    total_cost: f64,
    total_input_tokens: u64,
    total_output_tokens: u64,
    total_cache_read: u64,
    total_cache_write: u64,
    efficiency_score: f64,
    cache_hit_rate: f64,
    peak_context_pct: f64,
) -> Result<(), DbError> {
    let avg_cost_per_turn = if total_turns > 0 {
        total_cost / total_turns as f64
    } else {
        0.0
    };
    let avg_tokens_per_turn = if total_turns > 0 {
        (total_input_tokens + total_output_tokens + total_cache_read + total_cache_write) as f64 / total_turns as f64
    } else {
        0.0
    };

    conn.execute(
        r#"
        INSERT INTO session_metrics (
            session_id, total_turns, total_duration_ms, total_cost,
            total_input_tokens, total_output_tokens,
            total_cache_read, total_cache_write,
            avg_cost_per_turn, avg_tokens_per_turn,
            peak_context_pct, efficiency_score, cache_hit_rate
        )
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)
        ON CONFLICT(session_id) DO UPDATE SET
            total_turns = excluded.total_turns,
            total_duration_ms = excluded.total_duration_ms,
            total_cost = excluded.total_cost,
            total_input_tokens = excluded.total_input_tokens,
            total_output_tokens = excluded.total_output_tokens,
            total_cache_read = excluded.total_cache_read,
            total_cache_write = excluded.total_cache_write,
            avg_cost_per_turn = excluded.avg_cost_per_turn,
            avg_tokens_per_turn = excluded.avg_tokens_per_turn,
            peak_context_pct = excluded.peak_context_pct,
            efficiency_score = excluded.efficiency_score,
            cache_hit_rate = excluded.cache_hit_rate,
            updated_at = CURRENT_TIMESTAMP
        "#,
        params![
            session_id,
            total_turns,
            total_duration_ms as i64,
            total_cost,
            total_input_tokens as i64,
            total_output_tokens as i64,
            total_cache_read as i64,
            total_cache_write as i64,
            avg_cost_per_turn,
            avg_tokens_per_turn,
            peak_context_pct,
            efficiency_score,
            cache_hit_rate
        ],
    )?;
    Ok(())
}

/// Get all cached session summaries from database
pub fn get_all_cached_sessions(conn: &Connection) -> Result<Vec<SessionSummary>, DbError> {
    let mut stmt = conn.prepare(
        r#"
        SELECT
            s.session_id,
            s.project_name,
            s.branch,
            s.started_at,
            s.last_activity_at,
            s.model,
            s.is_active,
            COALESCE(m.total_turns, 0) as total_turns,
            COALESCE(m.total_cost, 0.0) as total_cost,
            COALESCE(m.total_input_tokens + m.total_output_tokens + m.total_cache_read + m.total_cache_write, 0) as total_tokens
        FROM sessions s
        LEFT JOIN session_metrics m ON s.session_id = m.session_id
        ORDER BY s.last_activity_at DESC
        "#,
    )?;

    let sessions = stmt
        .query_map([], |row| {
            Ok(SessionSummary {
                session_id: row.get(0)?,
                project_name: row.get(1)?,
                branch: row.get(2)?,
                started_at: row.get(3)?,
                last_activity_at: row.get(4)?,
                model: row.get(5)?,
                is_active: row.get::<_, i32>(6)? == 1,
                total_turns: row.get(7)?,
                total_cost: row.get(8)?,
                total_tokens: row.get(9)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(sessions)
}

/// Check if a session exists in the database
pub fn session_exists(conn: &Connection, session_id: &str) -> Result<bool, DbError> {
    let count: i32 = conn.query_row(
        "SELECT COUNT(*) FROM sessions WHERE session_id = ?1",
        params![session_id],
        |row| row.get(0),
    )?;
    Ok(count > 0)
}

/// Get the file modification time stored for a session
pub fn get_session_file_mtime(conn: &Connection, session_id: &str) -> Result<Option<String>, DbError> {
    let mut stmt = conn.prepare(
        "SELECT file_mtime FROM sessions WHERE session_id = ?1",
    )?;

    let mtime = stmt
        .query_row(params![session_id], |row| row.get::<_, Option<String>>(0))
        .optional()?
        .flatten();

    Ok(mtime)
}

/// Check if a session has valid cached data by comparing file mtime
/// Returns true if the session exists in DB and the stored mtime matches the provided mtime
pub fn is_session_cache_valid(
    conn: &Connection,
    session_id: &str,
    current_mtime: &str,
) -> Result<bool, DbError> {
    let stored_mtime = get_session_file_mtime(conn, session_id)?;

    match stored_mtime {
        Some(stored) => Ok(stored == current_mtime),
        None => Ok(false),
    }
}

/// Get count of cached sessions
pub fn get_cached_session_count(conn: &Connection) -> Result<u32, DbError> {
    let count: i32 = conn.query_row(
        "SELECT COUNT(*) FROM sessions",
        [],
        |row| row.get(0),
    )?;
    Ok(count as u32)
}

/// Get all cached sessions with their file mtimes for cache validation
/// This is the main function for loading session cache on startup
pub fn get_all_sessions_with_mtime(
    conn: &Connection,
) -> Result<HashMap<String, CachedSessionData>, DbError> {
    let mut stmt = conn.prepare(
        r#"
        SELECT
            s.session_id,
            s.project_path,
            s.project_name,
            s.branch,
            s.started_at,
            s.last_activity_at,
            s.model,
            s.is_active,
            s.file_path,
            s.file_mtime,
            COALESCE(m.total_turns, 0) as total_turns,
            COALESCE(m.total_cost, 0.0) as total_cost,
            COALESCE(m.total_input_tokens + m.total_output_tokens + m.total_cache_read + m.total_cache_write, 0) as total_tokens,
            COALESCE(m.total_duration_ms, 0) as total_duration_ms
        FROM sessions s
        LEFT JOIN session_metrics m ON s.session_id = m.session_id
        "#,
    )?;

    let mut result = HashMap::new();
    let rows = stmt.query_map([], |row| {
        Ok(CachedSessionData {
            session_id: row.get(0)?,
            project_path: row.get(1)?,
            project_name: row.get(2)?,
            branch: row.get(3)?,
            started_at: row.get(4)?,
            last_activity_at: row.get(5)?,
            model: row.get(6)?,
            is_active: row.get::<_, i32>(7)? == 1,
            file_path: row.get(8)?,
            file_mtime: row.get(9)?,
            total_turns: row.get(10)?,
            total_cost: row.get(11)?,
            total_tokens: row.get::<_, i64>(12)? as u64,
            total_duration_ms: row.get::<_, i64>(13)? as u64,
        })
    })?;

    for row in rows {
        let data = row?;
        result.insert(data.session_id.clone(), data);
    }

    Ok(result)
}

/// Insert or update a session with file modification time
/// This is used by the caching layer to track which sessions have been parsed
/// and whether their source files have changed.
pub fn upsert_session_with_mtime(
    conn: &Connection,
    session_id: &str,
    project_path: &str,
    project_name: &str,
    branch: Option<&str>,
    started_at: &str,
    last_activity_at: &str,
    model: &str,
    is_active: bool,
    file_path: &str,
    file_mtime: &str,
) -> Result<(), DbError> {
    conn.execute(
        r#"
        INSERT INTO sessions (
            session_id, project_path, project_name, branch,
            started_at, last_activity_at, model, is_active, file_path, file_mtime
        )
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
        ON CONFLICT(session_id) DO UPDATE SET
            last_activity_at = excluded.last_activity_at,
            is_active = excluded.is_active,
            file_mtime = excluded.file_mtime,
            updated_at = CURRENT_TIMESTAMP
        "#,
        params![
            session_id,
            project_path,
            project_name,
            branch,
            started_at,
            last_activity_at,
            model,
            if is_active { 1 } else { 0 },
            file_path,
            file_mtime
        ],
    )?;
    Ok(())
}

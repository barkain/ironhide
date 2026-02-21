//! Database query implementations
//!
//! Contains functions for querying sessions, turns, and metrics

use rusqlite::{params, Connection, OptionalExtension};
use std::collections::HashMap;
use super::DbError;
use crate::models::session::{Session, SessionSummary};
use crate::models::turn::Turn;
use crate::models::metrics::SessionMetrics;

/// Dashboard aggregate results from SQL query
#[derive(Debug, Clone)]
pub struct DashboardAggregates {
    pub total_sessions: u32,
    pub user_sessions: u32,
    pub subagent_sessions: u32,
    pub total_cost: f64,
    pub total_turns: u32,
    pub total_tokens: u64,
    pub active_projects: u32,
    pub avg_efficiency: Option<f64>,
}

/// Daily aggregate results from SQL query
#[derive(Debug, Clone)]
pub struct DailyAggregates {
    pub date: String,
    pub session_count: u32,
    pub user_session_count: u32,
    pub subagent_session_count: u32,
    pub total_turns: u32,
    pub total_cost: f64,
    pub total_tokens: u64,
    pub avg_efficiency: Option<f64>,
}

/// Project aggregate results from SQL query
#[derive(Debug, Clone)]
pub struct ProjectAggregates {
    pub project_path: String,
    pub project_name: String,
    pub session_count: u32,
    pub total_cost: f64,
    pub total_turns: u32,
    pub total_tokens: u64,
    pub last_activity: String,
}

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

/// Frontend session summary - contains all fields needed by the commands::SessionSummary struct.
/// This avoids the need to parse JSONL files when the DB already has the data.
#[derive(Debug, Clone)]
pub struct FrontendSessionSummary {
    pub session_id: String,
    pub project_path: String,
    pub project_name: String,
    pub started_at: String,
    pub last_activity_at: Option<String>,
    pub model: Option<String>,
    pub total_cost: f64,
    pub total_turns: u32,
    pub total_tokens: u64,
    pub duration_ms: u64,
    pub is_subagent: bool,
    pub file_path: String,
}

/// Get all sessions from the DB with fields needed for the frontend SessionSummary.
/// This is the fast path that avoids JSONL parsing.
/// Sessions are returned sorted by last_activity_at DESC.
pub fn get_sessions_for_frontend(
    conn: &Connection,
    limit: usize,
    offset: usize,
) -> Result<Vec<FrontendSessionSummary>, DbError> {
    let mut stmt = conn.prepare(
        r#"
        SELECT
            s.session_id,
            s.project_path,
            s.project_name,
            s.started_at,
            s.last_activity_at,
            s.model,
            s.file_path,
            COALESCE(m.total_turns, 0) as total_turns,
            COALESCE(m.total_cost, 0.0) as total_cost,
            COALESCE(m.total_input_tokens + m.total_output_tokens + m.total_cache_read + m.total_cache_write, 0) as total_tokens,
            COALESCE(m.total_duration_ms, 0) as duration_ms
        FROM sessions s
        LEFT JOIN session_metrics m ON s.session_id = m.session_id
        WHERE COALESCE(m.total_turns, 0) > 0
        ORDER BY s.last_activity_at DESC
        LIMIT ?1 OFFSET ?2
        "#,
    )?;

    let sessions = stmt
        .query_map(params![limit as i64, offset as i64], |row| {
            let file_path: String = row.get(6)?;
            let is_subagent = file_path.contains("subagent");
            Ok(FrontendSessionSummary {
                session_id: row.get(0)?,
                project_path: row.get(1)?,
                project_name: row.get(2)?,
                started_at: row.get(3)?,
                last_activity_at: row.get::<_, Option<String>>(4)?,
                model: row.get::<_, Option<String>>(5)?,
                file_path,
                total_turns: row.get::<_, i32>(7)? as u32,
                total_cost: row.get(8)?,
                total_tokens: row.get::<_, i64>(9)? as u64,
                duration_ms: row.get::<_, i64>(10)? as u64,
                is_subagent,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(sessions)
}

/// Get sessions from the DB filtered by date range, with fields needed for the frontend.
/// This is the fast path that avoids JSONL parsing.
pub fn get_sessions_for_frontend_filtered(
    conn: &Connection,
    start_date: Option<&str>,
    end_date: Option<&str>,
    limit: usize,
    offset: usize,
) -> Result<Vec<FrontendSessionSummary>, DbError> {
    // Build query dynamically based on which date filters are provided
    let mut sql = String::from(
        r#"
        SELECT
            s.session_id,
            s.project_path,
            s.project_name,
            s.started_at,
            s.last_activity_at,
            s.model,
            s.file_path,
            COALESCE(m.total_turns, 0) as total_turns,
            COALESCE(m.total_cost, 0.0) as total_cost,
            COALESCE(m.total_input_tokens + m.total_output_tokens + m.total_cache_read + m.total_cache_write, 0) as total_tokens,
            COALESCE(m.total_duration_ms, 0) as duration_ms
        FROM sessions s
        LEFT JOIN session_metrics m ON s.session_id = m.session_id
        WHERE COALESCE(m.total_turns, 0) > 0
        "#,
    );

    if start_date.is_some() {
        sql.push_str(" AND substr(s.started_at, 1, 10) >= ?3");
    }
    if end_date.is_some() {
        sql.push_str(if start_date.is_some() {
            " AND substr(s.started_at, 1, 10) <= ?4"
        } else {
            " AND substr(s.started_at, 1, 10) <= ?3"
        });
    }

    sql.push_str(" ORDER BY s.last_activity_at DESC LIMIT ?1 OFFSET ?2");

    let mut stmt = conn.prepare(&sql)?;

    // Bind parameters dynamically
    let rows: Vec<FrontendSessionSummary> = match (start_date, end_date) {
        (Some(start), Some(end)) => {
            stmt.query_map(params![limit as i64, offset as i64, start, end], |row| {
                let file_path: String = row.get(6)?;
                let is_subagent = file_path.contains("subagent");
                Ok(FrontendSessionSummary {
                    session_id: row.get(0)?,
                    project_path: row.get(1)?,
                    project_name: row.get(2)?,
                    started_at: row.get(3)?,
                    last_activity_at: row.get::<_, Option<String>>(4)?,
                    model: row.get::<_, Option<String>>(5)?,
                    file_path,
                    total_turns: row.get::<_, i32>(7)? as u32,
                    total_cost: row.get(8)?,
                    total_tokens: row.get::<_, i64>(9)? as u64,
                    duration_ms: row.get::<_, i64>(10)? as u64,
                    is_subagent,
                })
            })?.collect::<Result<Vec<_>, _>>()?
        }
        (Some(start), None) => {
            stmt.query_map(params![limit as i64, offset as i64, start], |row| {
                let file_path: String = row.get(6)?;
                let is_subagent = file_path.contains("subagent");
                Ok(FrontendSessionSummary {
                    session_id: row.get(0)?,
                    project_path: row.get(1)?,
                    project_name: row.get(2)?,
                    started_at: row.get(3)?,
                    last_activity_at: row.get::<_, Option<String>>(4)?,
                    model: row.get::<_, Option<String>>(5)?,
                    file_path,
                    total_turns: row.get::<_, i32>(7)? as u32,
                    total_cost: row.get(8)?,
                    total_tokens: row.get::<_, i64>(9)? as u64,
                    duration_ms: row.get::<_, i64>(10)? as u64,
                    is_subagent,
                })
            })?.collect::<Result<Vec<_>, _>>()?
        }
        (None, Some(end)) => {
            stmt.query_map(params![limit as i64, offset as i64, end], |row| {
                let file_path: String = row.get(6)?;
                let is_subagent = file_path.contains("subagent");
                Ok(FrontendSessionSummary {
                    session_id: row.get(0)?,
                    project_path: row.get(1)?,
                    project_name: row.get(2)?,
                    started_at: row.get(3)?,
                    last_activity_at: row.get::<_, Option<String>>(4)?,
                    model: row.get::<_, Option<String>>(5)?,
                    file_path,
                    total_turns: row.get::<_, i32>(7)? as u32,
                    total_cost: row.get(8)?,
                    total_tokens: row.get::<_, i64>(9)? as u64,
                    duration_ms: row.get::<_, i64>(10)? as u64,
                    is_subagent,
                })
            })?.collect::<Result<Vec<_>, _>>()?
        }
        (None, None) => {
            stmt.query_map(params![limit as i64, offset as i64], |row| {
                let file_path: String = row.get(6)?;
                let is_subagent = file_path.contains("subagent");
                Ok(FrontendSessionSummary {
                    session_id: row.get(0)?,
                    project_path: row.get(1)?,
                    project_name: row.get(2)?,
                    started_at: row.get(3)?,
                    last_activity_at: row.get::<_, Option<String>>(4)?,
                    model: row.get::<_, Option<String>>(5)?,
                    file_path,
                    total_turns: row.get::<_, i32>(7)? as u32,
                    total_cost: row.get(8)?,
                    total_tokens: row.get::<_, i64>(9)? as u64,
                    duration_ms: row.get::<_, i64>(10)? as u64,
                    is_subagent,
                })
            })?.collect::<Result<Vec<_>, _>>()?
        }
    };

    Ok(rows)
}

/// Get sessions from the DB for a specific project path, with fields needed for the frontend.
/// This is the fast path that avoids JSONL parsing.
pub fn get_sessions_for_frontend_by_project(
    conn: &Connection,
    project_path: &str,
) -> Result<Vec<FrontendSessionSummary>, DbError> {
    let mut stmt = conn.prepare(
        r#"
        SELECT
            s.session_id,
            s.project_path,
            s.project_name,
            s.started_at,
            s.last_activity_at,
            s.model,
            s.file_path,
            COALESCE(m.total_turns, 0) as total_turns,
            COALESCE(m.total_cost, 0.0) as total_cost,
            COALESCE(m.total_input_tokens + m.total_output_tokens + m.total_cache_read + m.total_cache_write, 0) as total_tokens,
            COALESCE(m.total_duration_ms, 0) as duration_ms
        FROM sessions s
        LEFT JOIN session_metrics m ON s.session_id = m.session_id
        WHERE s.project_path = ?1
          AND COALESCE(m.total_turns, 0) > 0
        ORDER BY s.last_activity_at DESC
        "#,
    )?;

    let sessions = stmt
        .query_map(params![project_path], |row| {
            let file_path: String = row.get(6)?;
            let is_subagent = file_path.contains("subagent");
            Ok(FrontendSessionSummary {
                session_id: row.get(0)?,
                project_path: row.get(1)?,
                project_name: row.get(2)?,
                started_at: row.get(3)?,
                last_activity_at: row.get::<_, Option<String>>(4)?,
                model: row.get::<_, Option<String>>(5)?,
                file_path,
                total_turns: row.get::<_, i32>(7)? as u32,
                total_cost: row.get(8)?,
                total_tokens: row.get::<_, i64>(9)? as u64,
                duration_ms: row.get::<_, i64>(10)? as u64,
                is_subagent,
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

/// Dashboard aggregate: total_sessions, total_cost, total_turns, total_tokens, active_projects
/// Filters to real user projects (project_path LIKE '/Users/%') and sessions with turns > 0.
/// When `days` is Some, only includes sessions from the last N days.
/// Uses substr() for date comparisons to handle RFC3339 timestamps safely,
/// and guards against non-date values (e.g. 'unknown') with a LIKE '20%' check.
pub fn get_dashboard_summary_from_db(conn: &Connection, days: Option<u32>) -> Result<DashboardAggregates, DbError> {
    let date_filter = if days.is_some() {
        "AND s.started_at LIKE '20%' AND substr(s.started_at, 1, 10) >= date('now', '-' || ?1 || ' days')"
    } else {
        ""
    };

    let sql = format!(
        r#"
        SELECT
            COUNT(*) as total_sessions,
            COUNT(CASE WHEN s.file_path NOT LIKE '%/subagents/%' AND s.file_path NOT LIKE '%/agent-%' THEN 1 END) as user_sessions,
            COUNT(CASE WHEN s.file_path LIKE '%/subagents/%' OR s.file_path LIKE '%/agent-%' THEN 1 END) as subagent_sessions,
            COALESCE(SUM(m.total_cost), 0.0) as total_cost,
            COALESCE(SUM(m.total_turns), 0) as total_turns,
            COALESCE(SUM(m.total_input_tokens + m.total_output_tokens + m.total_cache_read + m.total_cache_write), 0) as total_tokens,
            COUNT(DISTINCT s.project_path) as active_projects
        FROM sessions s
        LEFT JOIN session_metrics m ON s.session_id = m.session_id
        WHERE s.project_path LIKE '/Users/%'
          AND COALESCE(m.total_turns, 0) > 0
          {date_filter}
        "#,
    );

    let mut stmt = conn.prepare(&sql)?;

    let (total_sessions, user_sessions, subagent_sessions, total_cost, total_turns, total_tokens, active_projects) = if let Some(d) = days {
        stmt.query_row(params![d], |row| {
            Ok((
                row.get::<_, i32>(0)? as u32,
                row.get::<_, i32>(1)? as u32,
                row.get::<_, i32>(2)? as u32,
                row.get::<_, f64>(3)?,
                row.get::<_, i32>(4)? as u32,
                row.get::<_, i64>(5)? as u64,
                row.get::<_, i32>(6)? as u32,
            ))
        })?
    } else {
        stmt.query_row([], |row| {
            Ok((
                row.get::<_, i32>(0)? as u32,
                row.get::<_, i32>(1)? as u32,
                row.get::<_, i32>(2)? as u32,
                row.get::<_, f64>(3)?,
                row.get::<_, i32>(4)? as u32,
                row.get::<_, i64>(5)? as u64,
                row.get::<_, i32>(6)? as u32,
            ))
        })?
    };

    // Compute global CER = SUM(cache_read) / (SUM(cache_read) + SUM(cache_write))
    // Using global totals instead of averaging per-session CERs avoids skew from
    // many small sessions (e.g. subagents) with tiny or zero cache values.
    let eff_sql = format!(
        r#"
        SELECT
            CASE WHEN SUM(m.total_cache_read) + SUM(m.total_cache_write) > 0
            THEN CAST(SUM(m.total_cache_read) AS REAL) / (SUM(m.total_cache_read) + SUM(m.total_cache_write))
            ELSE NULL END
        FROM sessions s
        JOIN session_metrics m ON s.session_id = m.session_id
        WHERE s.project_path LIKE '/Users/%'
          AND m.total_turns > 0
          {date_filter}
        "#,
    );

    let avg_efficiency: Option<f64> = if let Some(d) = days {
        conn.query_row(&eff_sql, params![d], |row| row.get::<_, Option<f64>>(0))?
    } else {
        conn.query_row(&eff_sql, [], |row| row.get::<_, Option<f64>>(0))?
    };

    Ok(DashboardAggregates {
        total_sessions,
        user_sessions,
        subagent_sessions,
        total_cost,
        total_turns,
        total_tokens,
        active_projects,
        avg_efficiency,
    })
}

/// Daily metrics aggregate grouped by date.
/// When `days` is Some, only includes sessions from the last N days.
/// When `days` is None, includes all sessions (no date filter).
/// Uses substr() for date comparisons to handle RFC3339 timestamps safely,
/// and guards against non-date values (e.g. 'unknown') with a LIKE '20%' check.
pub fn get_daily_metrics_from_db(conn: &Connection, days: Option<u32>) -> Result<Vec<DailyAggregates>, DbError> {
    let date_filter = if days.is_some() {
        "AND substr(s.started_at, 1, 10) >= date('now', '-' || ?1 || ' days')"
    } else {
        ""
    };

    let sql = format!(
        r#"
        SELECT
            substr(s.started_at, 1, 10) as day,
            COUNT(*) as session_count,
            COUNT(CASE WHEN s.file_path NOT LIKE '%/subagents/%' AND s.file_path NOT LIKE '%/agent-%' THEN 1 END) as user_session_count,
            COUNT(CASE WHEN s.file_path LIKE '%/subagents/%' OR s.file_path LIKE '%/agent-%' THEN 1 END) as subagent_session_count,
            COALESCE(SUM(m.total_turns), 0) as total_turns,
            COALESCE(SUM(m.total_cost), 0.0) as total_cost,
            COALESCE(SUM(m.total_input_tokens + m.total_output_tokens + m.total_cache_read + m.total_cache_write), 0) as total_tokens,
            CASE WHEN SUM(m.total_cache_read) + SUM(m.total_cache_write) > 0
            THEN CAST(SUM(m.total_cache_read) AS REAL) / (SUM(m.total_cache_read) + SUM(m.total_cache_write))
            ELSE NULL END as avg_efficiency
        FROM sessions s
        LEFT JOIN session_metrics m ON s.session_id = m.session_id
        WHERE s.project_path LIKE '/Users/%'
          AND COALESCE(m.total_turns, 0) > 0
          AND s.started_at LIKE '20%'
          {date_filter}
        GROUP BY substr(s.started_at, 1, 10)
        ORDER BY day DESC
        "#,
    );

    let mut stmt = conn.prepare(&sql)?;

    let result = if let Some(d) = days {
        let rows = stmt.query_map(params![d], |row| {
            Ok(DailyAggregates {
                date: row.get(0)?,
                session_count: row.get::<_, i32>(1)? as u32,
                user_session_count: row.get::<_, i32>(2)? as u32,
                subagent_session_count: row.get::<_, i32>(3)? as u32,
                total_turns: row.get::<_, i32>(4)? as u32,
                total_cost: row.get::<_, f64>(5)?,
                total_tokens: row.get::<_, i64>(6)? as u64,
                avg_efficiency: row.get::<_, Option<f64>>(7)?,
            })
        })?;
        rows.collect::<Result<Vec<_>, _>>()?
    } else {
        let rows = stmt.query_map([], |row| {
            Ok(DailyAggregates {
                date: row.get(0)?,
                session_count: row.get::<_, i32>(1)? as u32,
                user_session_count: row.get::<_, i32>(2)? as u32,
                subagent_session_count: row.get::<_, i32>(3)? as u32,
                total_turns: row.get::<_, i32>(4)? as u32,
                total_cost: row.get::<_, f64>(5)?,
                total_tokens: row.get::<_, i64>(6)? as u64,
                avg_efficiency: row.get::<_, Option<f64>>(7)?,
            })
        })?;
        rows.collect::<Result<Vec<_>, _>>()?
    };

    Ok(result)
}

/// Project metrics aggregate grouped by project_path.
/// When `days` is Some, only includes sessions from the last N days.
/// Uses substr() for date comparisons to handle RFC3339 timestamps safely,
/// and guards against non-date values (e.g. 'unknown') with a LIKE '20%' check.
pub fn get_project_metrics_from_db(conn: &Connection, days: Option<u32>) -> Result<Vec<ProjectAggregates>, DbError> {
    let date_filter = if days.is_some() {
        "AND s.started_at LIKE '20%' AND substr(s.started_at, 1, 10) >= date('now', '-' || ?1 || ' days')"
    } else {
        ""
    };

    let sql = format!(
        r#"
        SELECT
            s.project_path,
            COUNT(*) as session_count,
            COALESCE(SUM(m.total_cost), 0.0) as total_cost,
            COALESCE(SUM(m.total_turns), 0) as total_turns,
            COALESCE(SUM(m.total_input_tokens + m.total_output_tokens + m.total_cache_read + m.total_cache_write), 0) as total_tokens,
            MAX(s.last_activity_at) as last_activity
        FROM sessions s
        LEFT JOIN session_metrics m ON s.session_id = m.session_id
        WHERE s.project_path LIKE '/Users/%'
          AND COALESCE(m.total_turns, 0) > 0
          {date_filter}
        GROUP BY s.project_path
        "#,
    );

    let mut stmt = conn.prepare(&sql)?;

    let rows = if let Some(d) = days {
        stmt.query_map(params![d], |row| {
            let project_path: String = row.get(0)?;
            let project_name = project_path
                .rsplit('/')
                .next()
                .unwrap_or(&project_path)
                .to_string();
            Ok(ProjectAggregates {
                project_path,
                project_name,
                session_count: row.get::<_, i32>(1)? as u32,
                total_cost: row.get::<_, f64>(2)?,
                total_turns: row.get::<_, i32>(3)? as u32,
                total_tokens: row.get::<_, i64>(4)? as u64,
                last_activity: row.get::<_, String>(5).unwrap_or_default(),
            })
        })?.collect::<Result<Vec<_>, _>>()?
    } else {
        stmt.query_map([], |row| {
            let project_path: String = row.get(0)?;
            let project_name = project_path
                .rsplit('/')
                .next()
                .unwrap_or(&project_path)
                .to_string();
            Ok(ProjectAggregates {
                project_path,
                project_name,
                session_count: row.get::<_, i32>(1)? as u32,
                total_cost: row.get::<_, f64>(2)?,
                total_turns: row.get::<_, i32>(3)? as u32,
                total_tokens: row.get::<_, i64>(4)? as u64,
                last_activity: row.get::<_, String>(5).unwrap_or_default(),
            })
        })?.collect::<Result<Vec<_>, _>>()?
    };

    Ok(rows)
}

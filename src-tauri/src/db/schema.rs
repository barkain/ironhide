//! Database schema definitions
//!
//! Contains SQL for creating all tables and indexes

use rusqlite::Connection;
use super::DbError;

/// SQL schema for all tables
const SCHEMA: &str = r#"
-- Core session tracking
CREATE TABLE IF NOT EXISTS sessions (
    session_id TEXT PRIMARY KEY,
    project_path TEXT NOT NULL,
    project_name TEXT NOT NULL,
    branch TEXT,
    started_at TEXT NOT NULL,
    last_activity_at TEXT NOT NULL,
    model TEXT NOT NULL,
    is_active INTEGER DEFAULT 1,
    file_path TEXT NOT NULL,
    file_mtime TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sessions_project ON sessions(project_path);
CREATE INDEX IF NOT EXISTS idx_sessions_activity ON sessions(last_activity_at DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_active ON sessions(is_active);

-- Turn (cycle) tracking
CREATE TABLE IF NOT EXISTS turns (
    turn_id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
    turn_number INTEGER NOT NULL,
    started_at TEXT NOT NULL,
    ended_at TEXT,
    duration_ms INTEGER,
    user_message TEXT,
    assistant_message TEXT,
    model TEXT,
    stop_reason TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(session_id, turn_number)
);

CREATE INDEX IF NOT EXISTS idx_turns_session ON turns(session_id, turn_number);
CREATE INDEX IF NOT EXISTS idx_turns_time ON turns(started_at);

-- Turn token metrics
CREATE TABLE IF NOT EXISTS turn_metrics (
    turn_id TEXT PRIMARY KEY REFERENCES turns(turn_id) ON DELETE CASCADE,
    input_tokens INTEGER DEFAULT 0,
    output_tokens INTEGER DEFAULT 0,
    cache_read_tokens INTEGER DEFAULT 0,
    cache_write_5m_tokens INTEGER DEFAULT 0,
    cache_write_1h_tokens INTEGER DEFAULT 0,
    total_cost REAL DEFAULT 0.0,
    context_usage_pct REAL DEFAULT 0.0,
    tool_count INTEGER DEFAULT 0
);

-- Session aggregated metrics
CREATE TABLE IF NOT EXISTS session_metrics (
    session_id TEXT PRIMARY KEY REFERENCES sessions(session_id) ON DELETE CASCADE,
    total_turns INTEGER DEFAULT 0,
    total_duration_ms INTEGER DEFAULT 0,
    total_cost REAL DEFAULT 0.0,
    total_input_tokens INTEGER DEFAULT 0,
    total_output_tokens INTEGER DEFAULT 0,
    total_cache_read INTEGER DEFAULT 0,
    total_cache_write INTEGER DEFAULT 0,
    avg_cost_per_turn REAL DEFAULT 0.0,
    avg_tokens_per_turn REAL DEFAULT 0.0,
    peak_context_pct REAL DEFAULT 0.0,
    efficiency_score REAL,
    cache_hit_rate REAL DEFAULT 0.0,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Tool usage tracking
CREATE TABLE IF NOT EXISTS tool_uses (
    tool_use_id TEXT PRIMARY KEY,
    turn_id TEXT NOT NULL REFERENCES turns(turn_id) ON DELETE CASCADE,
    tool_name TEXT NOT NULL,
    input_json TEXT,
    result TEXT,
    is_error INTEGER DEFAULT 0,
    duration_ms INTEGER,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tool_uses_turn ON tool_uses(turn_id);
CREATE INDEX IF NOT EXISTS idx_tool_uses_name ON tool_uses(tool_name);

-- Code change tracking
CREATE TABLE IF NOT EXISTS code_changes (
    change_id TEXT PRIMARY KEY,
    turn_id TEXT NOT NULL REFERENCES turns(turn_id) ON DELETE CASCADE,
    file_path TEXT NOT NULL,
    change_type TEXT NOT NULL,
    lines_added INTEGER DEFAULT 0,
    lines_removed INTEGER DEFAULT 0,
    extension TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_code_changes_turn ON code_changes(turn_id);
CREATE INDEX IF NOT EXISTS idx_code_changes_file ON code_changes(file_path);

-- Subagent tracking
CREATE TABLE IF NOT EXISTS subagents (
    subagent_id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
    agent_hash TEXT NOT NULL,
    slug TEXT,
    started_at TEXT NOT NULL,
    ended_at TEXT,
    total_input_tokens INTEGER DEFAULT 0,
    total_output_tokens INTEGER DEFAULT 0,
    total_cache_tokens INTEGER DEFAULT 0,
    total_cost REAL DEFAULT 0.0,
    tool_count INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_subagents_session ON subagents(session_id);

-- Git context tracking
CREATE TABLE IF NOT EXISTS git_info (
    session_id TEXT PRIMARY KEY REFERENCES sessions(session_id) ON DELETE CASCADE,
    branch TEXT,
    worktree TEXT,
    commit_count INTEGER DEFAULT 0,
    last_commit_hash TEXT,
    last_commit_time TEXT
);

-- File position tracking (for incremental parsing)
CREATE TABLE IF NOT EXISTS file_positions (
    file_path TEXT PRIMARY KEY,
    byte_position INTEGER DEFAULT 0,
    last_read_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Model pricing configuration
CREATE TABLE IF NOT EXISTS pricing (
    model_id TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    input_price_per_million REAL NOT NULL,
    output_price_per_million REAL NOT NULL,
    cache_write_5m_per_million REAL NOT NULL,
    cache_write_1h_per_million REAL NOT NULL,
    cache_read_per_million REAL NOT NULL,
    max_context_tokens INTEGER,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
"#;

/// Default pricing data for Claude models
const DEFAULT_PRICING: &str = r#"
INSERT OR REPLACE INTO pricing VALUES
    ('claude-opus-4-5-20251101', 'Claude Opus 4.5', 5.00, 25.00, 6.25, 10.00, 0.50, 200000, CURRENT_TIMESTAMP),
    ('claude-sonnet-4-5-20251101', 'Claude Sonnet 4.5', 3.00, 15.00, 3.75, 6.00, 0.30, 200000, CURRENT_TIMESTAMP),
    ('claude-haiku-4-5-20251101', 'Claude Haiku 4.5', 1.00, 5.00, 1.25, 2.00, 0.10, 200000, CURRENT_TIMESTAMP);
"#;

/// Create all database tables
pub fn create_tables(conn: &Connection) -> Result<(), DbError> {
    conn.execute_batch(SCHEMA)?;
    Ok(())
}

/// Insert default pricing data
pub fn insert_default_pricing(conn: &Connection) -> Result<(), DbError> {
    conn.execute_batch(DEFAULT_PRICING)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_create_tables() {
        let conn = Connection::open_in_memory().unwrap();
        create_tables(&conn).unwrap();
        insert_default_pricing(&conn).unwrap();

        // Verify tables exist
        let count: i32 = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='table'",
                [],
                |row| row.get(0),
            )
            .unwrap();

        assert!(count > 0);
    }
}

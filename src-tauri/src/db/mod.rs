//! Database module for SQLite operations
//!
//! This module handles all database interactions including:
//! - Schema creation and migrations
//! - Session and turn queries
//! - Metrics storage and retrieval

pub mod schema;
pub mod queries;

use std::path::PathBuf;
use std::sync::Mutex;

use rusqlite::Connection;
use thiserror::Error;

/// Database errors
#[derive(Error, Debug)]
pub enum DbError {
    #[error("SQLite error: {0}")]
    Sqlite(#[from] rusqlite::Error),

    #[error("Database not initialized")]
    NotInitialized,

    #[error("Migration failed: {0}")]
    Migration(String),

    #[error("Lock poisoned")]
    LockPoisoned,
}

/// Database connection wrapper
pub struct Database {
    conn: Mutex<Connection>,
    path: PathBuf,
}

impl Database {
    /// Create a new database connection
    pub fn new(path: PathBuf) -> Result<Self, DbError> {
        let conn = Connection::open(&path)?;

        // Enable foreign keys
        conn.execute_batch("PRAGMA foreign_keys = ON;")?;

        Ok(Self {
            conn: Mutex::new(conn),
            path,
        })
    }

    /// Initialize the database schema
    pub fn initialize(&self) -> Result<(), DbError> {
        let conn = self.conn.lock().map_err(|_| DbError::LockPoisoned)?;
        schema::create_tables(&conn)?;
        schema::insert_default_pricing(&conn)?;

        // Migration: Fix last_activity_at for sessions where it was incorrectly set equal to started_at.
        // Computes correct value from started_at + total_duration_ms from session_metrics.
        conn.execute_batch(r#"
            UPDATE sessions
            SET last_activity_at = strftime('%Y-%m-%dT%H:%M:%fZ',
                julianday(sessions.started_at) + (
                    SELECT CAST(m.total_duration_ms AS REAL) / 86400000.0
                    FROM session_metrics m
                    WHERE m.session_id = sessions.session_id
                )
            )
            WHERE sessions.last_activity_at = sessions.started_at
            AND EXISTS (
                SELECT 1 FROM session_metrics m
                WHERE m.session_id = sessions.session_id
                AND m.total_duration_ms > 0
            );
        "#)?;

        Ok(())
    }

    /// Get the database file path
    pub fn path(&self) -> &PathBuf {
        &self.path
    }

    /// Execute a query with the database connection
    pub fn with_connection<F, T>(&self, f: F) -> Result<T, DbError>
    where
        F: FnOnce(&Connection) -> Result<T, DbError>,
    {
        let conn = self.conn.lock().map_err(|_| DbError::LockPoisoned)?;
        f(&conn)
    }
}

/// Get the default database path
pub fn default_db_path() -> PathBuf {
    let data_dir = dirs::data_local_dir()
        .unwrap_or_else(|| PathBuf::from("."));

    data_dir.join("ironhide").join("analytics.db")
}

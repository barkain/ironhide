//! JSONL parsing module
//!
//! This module handles parsing Claude Code session JSONL files:
//! - Streaming line-by-line parsing
//! - Entry type validation
//! - Turn aggregation from entries

pub mod jsonl;
pub mod session;

use thiserror::Error;

/// Parser errors
#[derive(Error, Debug)]
pub enum ParserError {
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("JSON parse error: {0}")]
    Json(#[from] serde_json::Error),

    #[error("Invalid entry: {0}")]
    InvalidEntry(String),

    #[error("Missing field: {0}")]
    MissingField(String),
}

/// Result type for parser operations
pub type ParserResult<T> = Result<T, ParserError>;

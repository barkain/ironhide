//! Metrics calculation module
//!
//! This module handles computing analytics metrics:
//! - Token aggregation
//! - Cost calculations
//! - Efficiency scoring (OES, CER, SEI)

pub mod tokens;
pub mod cost;
pub mod efficiency;

use thiserror::Error;

/// Metrics calculation errors
#[derive(Error, Debug)]
pub enum MetricsError {
    #[error("Pricing not found for model: {0}")]
    PricingNotFound(String),

    #[error("Invalid metric value: {0}")]
    InvalidValue(String),

    #[error("Calculation error: {0}")]
    Calculation(String),
}

/// Result type for metrics operations
pub type MetricsResult<T> = Result<T, MetricsError>;

//! Recommendations module
//!
//! Provides intelligent recommendations for cost savings and efficiency improvements
//! based on session analysis and metrics.

pub mod engine;
pub mod types;

// Re-export commonly used types
pub use engine::generate_recommendations;
pub use types::{Recommendation, RecommendationSummary, RecommendationType};

//! Anti-pattern detection module
//!
//! Detects inefficient patterns in Claude Code sessions:
//! - SubagentSprawl: Too many subagents for the output
//! - ContextChurn: Poor cache utilization
//! - CostSpike: Turn cost significantly above average
//! - LongTurn: Turn duration exceeds threshold
//! - ToolFailureSpree: Consecutive tool failures
//! - HighReworkRatio: Many edits to same files

pub mod detector;
pub mod types;

pub use detector::detect_antipatterns;
pub use types::{AntiPatternType, DetectedPattern};

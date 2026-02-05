//! Token calculation utilities
//!
//! Handles token counting and aggregation

use serde::{Deserialize, Serialize};

/// Token metrics for a single turn
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct TurnTokens {
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub cache_read_tokens: u64,
    pub cache_write_5m_tokens: u64,
    pub cache_write_1h_tokens: u64,
}

impl TurnTokens {
    /// Create new token metrics
    pub fn new(
        input: u64,
        output: u64,
        cache_read: u64,
        cache_write_5m: u64,
        cache_write_1h: u64,
    ) -> Self {
        Self {
            input_tokens: input,
            output_tokens: output,
            cache_read_tokens: cache_read,
            cache_write_5m_tokens: cache_write_5m,
            cache_write_1h_tokens: cache_write_1h,
        }
    }

    /// Total tokens (input + output)
    pub fn total(&self) -> u64 {
        self.input_tokens + self.output_tokens
    }

    /// Total cache tokens
    pub fn total_cache(&self) -> u64 {
        self.cache_read_tokens + self.cache_write_5m_tokens + self.cache_write_1h_tokens
    }

    /// Total cache write tokens
    pub fn total_cache_write(&self) -> u64 {
        self.cache_write_5m_tokens + self.cache_write_1h_tokens
    }
}

/// Aggregated token metrics for a session
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct SessionTokens {
    pub total_input: u64,
    pub total_output: u64,
    pub total_cache_read: u64,
    pub total_cache_write_5m: u64,
    pub total_cache_write_1h: u64,
    pub turn_count: u32,
}

impl SessionTokens {
    /// Create new session token metrics
    pub fn new() -> Self {
        Self::default()
    }

    /// Add turn tokens to session
    pub fn add_turn(&mut self, turn: &TurnTokens) {
        self.total_input += turn.input_tokens;
        self.total_output += turn.output_tokens;
        self.total_cache_read += turn.cache_read_tokens;
        self.total_cache_write_5m += turn.cache_write_5m_tokens;
        self.total_cache_write_1h += turn.cache_write_1h_tokens;
        self.turn_count += 1;
    }

    /// Total tokens across all turns
    pub fn total(&self) -> u64 {
        self.total_input + self.total_output
    }

    /// Total cache tokens
    pub fn total_cache(&self) -> u64 {
        self.total_cache_read + self.total_cache_write_5m + self.total_cache_write_1h
    }

    /// Total cache write tokens
    pub fn total_cache_write(&self) -> u64 {
        self.total_cache_write_5m + self.total_cache_write_1h
    }

    /// Average tokens per turn
    pub fn avg_per_turn(&self) -> f64 {
        if self.turn_count == 0 {
            0.0
        } else {
            self.total() as f64 / self.turn_count as f64
        }
    }

    /// Input/Output ratio
    pub fn io_ratio(&self) -> f64 {
        if self.total_input == 0 {
            0.0
        } else {
            self.total_output as f64 / self.total_input as f64
        }
    }
}

/// Calculate token velocity (tokens per second)
pub fn token_velocity(tokens: u64, duration_ms: u64) -> f64 {
    if duration_ms == 0 {
        0.0
    } else {
        (tokens as f64) / (duration_ms as f64 / 1000.0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_turn_tokens() {
        let tokens = TurnTokens::new(1000, 500, 200, 100, 50);
        assert_eq!(tokens.total(), 1500);
        assert_eq!(tokens.total_cache(), 350);
        assert_eq!(tokens.total_cache_write(), 150);
    }

    #[test]
    fn test_session_tokens() {
        let mut session = SessionTokens::new();

        session.add_turn(&TurnTokens::new(1000, 500, 200, 100, 50));
        session.add_turn(&TurnTokens::new(2000, 1000, 400, 200, 100));

        assert_eq!(session.turn_count, 2);
        assert_eq!(session.total_input, 3000);
        assert_eq!(session.total_output, 1500);
        assert_eq!(session.avg_per_turn(), 2250.0);
    }

    #[test]
    fn test_token_velocity() {
        assert_eq!(token_velocity(1000, 1000), 1000.0);
        assert_eq!(token_velocity(1000, 2000), 500.0);
        assert_eq!(token_velocity(0, 1000), 0.0);
        assert_eq!(token_velocity(1000, 0), 0.0);
    }
}

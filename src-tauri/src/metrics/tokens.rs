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

    /// Total tokens (input + output + all cache tokens)
    pub fn total(&self) -> u64 {
        self.input_tokens + self.output_tokens + self.cache_read_tokens + self.cache_write_5m_tokens + self.cache_write_1h_tokens
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

    /// Total tokens across all turns (input + output + all cache tokens)
    pub fn total(&self) -> u64 {
        self.total_input + self.total_output + self.total_cache_read + self.total_cache_write_5m + self.total_cache_write_1h
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

/// Detailed token summary (as specified in task requirements)
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct TokenSummary {
    pub input: u64,
    pub output: u64,
    pub cache_read: u64,
    pub cache_write_5m: u64,
    pub cache_write_1h: u64,
    pub total: u64,
    pub context_used: u64,
}

impl TokenSummary {
    /// Create from turn tokens
    pub fn from_turn(turn: &TurnTokens) -> Self {
        let total = turn.input_tokens + turn.output_tokens + turn.cache_read_tokens
            + turn.cache_write_5m_tokens + turn.cache_write_1h_tokens;
        let context_used = turn.input_tokens + turn.cache_read_tokens
            + turn.cache_write_5m_tokens + turn.cache_write_1h_tokens;

        Self {
            input: turn.input_tokens,
            output: turn.output_tokens,
            cache_read: turn.cache_read_tokens,
            cache_write_5m: turn.cache_write_5m_tokens,
            cache_write_1h: turn.cache_write_1h_tokens,
            total,
            context_used,
        }
    }

    /// Create from session tokens
    pub fn from_session(session: &SessionTokens) -> Self {
        let total = session.total_input + session.total_output + session.total_cache_read
            + session.total_cache_write_5m + session.total_cache_write_1h;
        let context_used = session.total_input + session.total_cache_read
            + session.total_cache_write_5m + session.total_cache_write_1h;

        Self {
            input: session.total_input,
            output: session.total_output,
            cache_read: session.total_cache_read,
            cache_write_5m: session.total_cache_write_5m,
            cache_write_1h: session.total_cache_write_1h,
            total,
            context_used,
        }
    }

    /// Total cache tokens
    pub fn total_cache(&self) -> u64 {
        self.cache_read + self.cache_write_5m + self.cache_write_1h
    }

    /// Total cache write tokens
    pub fn total_cache_write(&self) -> u64 {
        self.cache_write_5m + self.cache_write_1h
    }
}

/// Aggregate turn tokens into a summary
pub fn aggregate_turn_tokens(turn: &TurnTokens) -> TokenSummary {
    TokenSummary::from_turn(turn)
}

/// Aggregate session tokens into a summary
pub fn aggregate_session_tokens(session: &SessionTokens) -> TokenSummary {
    TokenSummary::from_session(session)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_turn_tokens() {
        let tokens = TurnTokens::new(1000, 500, 200, 100, 50);
        assert_eq!(tokens.total(), 1850); // 1000 + 500 + 200 + 100 + 50
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
        assert_eq!(session.total(), 5550); // 3000 + 1500 + 600 + 300 + 150
        assert_eq!(session.avg_per_turn(), 2775.0); // 5550 / 2
    }

    #[test]
    fn test_token_velocity() {
        assert_eq!(token_velocity(1000, 1000), 1000.0);
        assert_eq!(token_velocity(1000, 2000), 500.0);
        assert_eq!(token_velocity(0, 1000), 0.0);
        assert_eq!(token_velocity(1000, 0), 0.0);
    }

    #[test]
    fn test_token_summary_from_turn() {
        let turn = TurnTokens::new(1000, 500, 5000, 200, 100);
        let summary = TokenSummary::from_turn(&turn);

        assert_eq!(summary.input, 1000);
        assert_eq!(summary.output, 500);
        assert_eq!(summary.cache_read, 5000);
        assert_eq!(summary.cache_write_5m, 200);
        assert_eq!(summary.cache_write_1h, 100);
        assert_eq!(summary.total, 6800); // 1000 + 500 + 5000 + 200 + 100
        assert_eq!(summary.context_used, 6300); // 1000 + 5000 + 200 + 100
        assert_eq!(summary.total_cache(), 5300);
        assert_eq!(summary.total_cache_write(), 300);
    }

    #[test]
    fn test_token_summary_from_session() {
        let mut session = SessionTokens::new();
        session.add_turn(&TurnTokens::new(1000, 500, 5000, 200, 100));
        session.add_turn(&TurnTokens::new(2000, 1000, 8000, 300, 200));

        let summary = TokenSummary::from_session(&session);

        assert_eq!(summary.input, 3000);
        assert_eq!(summary.output, 1500);
        assert_eq!(summary.cache_read, 13000);
        assert_eq!(summary.cache_write_5m, 500);
        assert_eq!(summary.cache_write_1h, 300);
        assert_eq!(summary.total, 18300); // 3000 + 1500 + 13000 + 500 + 300
        assert_eq!(summary.context_used, 16800); // 3000 + 13000 + 500 + 300
    }

    #[test]
    fn test_aggregate_functions() {
        let turn = TurnTokens::new(1000, 500, 5000, 200, 100);
        let summary = aggregate_turn_tokens(&turn);
        assert_eq!(summary.input, 1000);

        let session = SessionTokens::new();
        let session_summary = aggregate_session_tokens(&session);
        assert_eq!(session_summary.total, 0);
    }
}

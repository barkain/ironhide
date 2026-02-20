//! Anti-pattern detection logic
//!
//! Implements detection algorithms for various anti-patterns
//! in Claude Code sessions.

use std::collections::HashMap;

use crate::metrics::cost::calculate_turn_cost;
use crate::metrics::efficiency::{calculate_cer_raw, calculate_sei_f64};
use crate::metrics::session::estimate_deliverable_units;
use crate::metrics::tokens::TurnTokens;
use crate::parser::{find_session_by_id, parse_session_by_id, scan_claude_sessions, CompletedTurn};

use super::types::{AntiPatternType, DetectedPattern, DetectionThresholds, Severity};

/// Detect anti-patterns in one or more sessions
///
/// # Arguments
/// * `session_id` - Optional specific session to analyze. If None, scans all sessions.
/// * `pattern_types` - Optional filter for specific pattern types. If None, checks all.
/// * `thresholds` - Detection thresholds to use. If None, uses defaults.
///
/// # Returns
/// Vector of detected patterns sorted by severity (critical first) then impact cost
pub fn detect_antipatterns(
    session_id: Option<String>,
    pattern_types: Option<Vec<AntiPatternType>>,
    thresholds: Option<DetectionThresholds>,
) -> Result<Vec<DetectedPattern>, String> {
    let thresholds = thresholds.unwrap_or_default();
    let patterns_to_check = pattern_types.unwrap_or_else(AntiPatternType::all);

    let mut detected: Vec<DetectedPattern> = Vec::new();

    // Get sessions to analyze
    let sessions = if let Some(sid) = session_id {
        // Single session
        match find_session_by_id(&sid) {
            Some(info) => vec![info],
            None => return Err(format!("Session not found: {}", sid)),
        }
    } else {
        // All sessions
        scan_claude_sessions()
    };

    // Analyze each session
    for session_info in sessions {
        let session_id = session_info.session_id.clone();

        // Parse session turns
        let (turns, _stats) = match parse_session_by_id(&session_id) {
            Ok(result) => result,
            Err(e) => {
                tracing::warn!("Failed to parse session {}: {}", session_id, e);
                continue;
            }
        };

        if turns.is_empty() {
            continue;
        }

        // Run each detector
        for pattern_type in &patterns_to_check {
            let patterns = match pattern_type {
                AntiPatternType::SubagentSprawl => {
                    detect_subagent_sprawl(&session_id, &turns, &thresholds)
                }
                AntiPatternType::ContextChurn => {
                    detect_context_churn(&session_id, &turns, &thresholds)
                }
                AntiPatternType::CostSpike => detect_cost_spike(&session_id, &turns, &thresholds),
                AntiPatternType::LongTurn => detect_long_turn(&session_id, &turns, &thresholds),
                AntiPatternType::ToolFailureSpree => {
                    detect_tool_failure_spree(&session_id, &turns, &thresholds)
                }
                AntiPatternType::HighReworkRatio => {
                    detect_high_rework_ratio(&session_id, &turns, &thresholds)
                }
            };

            detected.extend(patterns);
        }
    }

    // Sort by severity (critical first), then by impact cost (highest first)
    detected.sort_by(|a, b| {
        let sev_order = |s: &Severity| match s {
            Severity::Critical => 0,
            Severity::Warning => 1,
            Severity::Info => 2,
        };

        let sev_cmp = sev_order(&a.severity).cmp(&sev_order(&b.severity));
        if sev_cmp != std::cmp::Ordering::Equal {
            return sev_cmp;
        }

        // Higher impact cost first
        b.impact_cost
            .partial_cmp(&a.impact_cost)
            .unwrap_or(std::cmp::Ordering::Equal)
    });

    Ok(detected)
}

/// Detect SubagentSprawl: SEI < threshold
fn detect_subagent_sprawl(
    session_id: &str,
    turns: &[CompletedTurn],
    thresholds: &DetectionThresholds,
) -> Vec<DetectedPattern> {
    let mut patterns = Vec::new();

    // Count subagents and calculate output
    let mut subagent_count = 0u32;
    let mut total_output_tokens = 0u64;
    let mut total_cost = 0.0f64;

    for turn in turns {
        subagent_count += turn.subagent_ids.len() as u32;
        total_output_tokens += turn.output_tokens;

        let turn_tokens = TurnTokens::new(
            turn.input_tokens,
            turn.output_tokens,
            turn.cache_read_tokens,
            turn.cache_write_5m_tokens,
            turn.cache_write_1h_tokens,
        );
        let model = turn.model.as_deref().unwrap_or("claude-opus-4-5-20251101");
        total_cost += calculate_turn_cost(&turn_tokens, model).total_cost;
    }

    if subagent_count == 0 {
        return patterns;
    }

    let deliverable_units = estimate_deliverable_units(total_output_tokens);
    let sei = calculate_sei_f64(deliverable_units, subagent_count);

    if let Some(sei_value) = sei {
        if sei_value < thresholds.sei_min {
            // Estimate cost impact: extra subagent overhead
            let expected_subagents = (deliverable_units / thresholds.sei_min).ceil() as u32;
            let excess_subagents = subagent_count.saturating_sub(expected_subagents.max(1));
            let avg_cost_per_subagent = if subagent_count > 0 {
                total_cost * 0.3 / subagent_count as f64 // Assume 30% of cost is subagent-related
            } else {
                0.0
            };
            let impact_cost = excess_subagents as f64 * avg_cost_per_subagent;

            let severity = if sei_value < thresholds.sei_min / 2.0 {
                Severity::Critical
            } else {
                Severity::Warning
            };

            patterns.push(DetectedPattern::new(
                AntiPatternType::SubagentSprawl,
                severity,
                session_id.to_string(),
                None,
                format!(
                    "Session spawned {} subagents but only produced {:.1} deliverable units (SEI: {:.2})",
                    subagent_count, deliverable_units, sei_value
                ),
                impact_cost,
                "Consider consolidating tasks to reduce subagent overhead. Use fewer, more targeted subagents.".to_string(),
                sei_value,
                thresholds.sei_min,
            ));
        }
    }

    patterns
}

/// Detect ContextChurn: CER < threshold
fn detect_context_churn(
    session_id: &str,
    turns: &[CompletedTurn],
    thresholds: &DetectionThresholds,
) -> Vec<DetectedPattern> {
    let mut patterns = Vec::new();

    // Calculate session-wide cache efficiency
    let mut total_cache_read = 0u64;
    let mut total_cache_write = 0u64;
    let mut total_cost = 0.0f64;

    for turn in turns {
        total_cache_read += turn.cache_read_tokens;
        total_cache_write += turn.cache_write_5m_tokens + turn.cache_write_1h_tokens;

        let turn_tokens = TurnTokens::new(
            turn.input_tokens,
            turn.output_tokens,
            turn.cache_read_tokens,
            turn.cache_write_5m_tokens,
            turn.cache_write_1h_tokens,
        );
        let model = turn.model.as_deref().unwrap_or("claude-opus-4-5-20251101");
        total_cost += calculate_turn_cost(&turn_tokens, model).total_cost;
    }

    // Need some cache activity to analyze
    if total_cache_read + total_cache_write < 1000 {
        return patterns;
    }

    let cer = calculate_cer_raw(total_cache_read, total_cache_write);

    if cer < thresholds.cer_min {
        // Estimate cost impact: if CER was at threshold, how much would we have saved?
        // Cache writes cost more than cache reads, so poor CER means overpaying
        // Rough estimate: each percentage point below threshold costs ~1% of cache-related costs
        let cache_related_cost = total_cost * 0.15; // Estimate 15% is cache-related
        let cer_deficit = thresholds.cer_min - cer;
        let impact_cost = cache_related_cost * cer_deficit * 2.0;

        let severity = if cer < thresholds.cer_min / 2.0 {
            Severity::Critical
        } else {
            Severity::Warning
        };

        patterns.push(DetectedPattern::new(
            AntiPatternType::ContextChurn,
            severity,
            session_id.to_string(),
            None,
            format!(
                "Session has poor cache efficiency (CER: {:.2}). Cache reads: {}, Cache writes: {}",
                cer, total_cache_read, total_cache_write
            ),
            impact_cost,
            "Review context management. Avoid operations that invalidate cache. Consider structuring tasks to maintain context.".to_string(),
            cer,
            thresholds.cer_min,
        ));
    }

    patterns
}

/// Detect CostSpike: Turn cost > multiplier * average
fn detect_cost_spike(
    session_id: &str,
    turns: &[CompletedTurn],
    thresholds: &DetectionThresholds,
) -> Vec<DetectedPattern> {
    let mut patterns = Vec::new();

    if turns.len() < 2 {
        return patterns; // Need at least 2 turns to compare
    }

    // Calculate cost for each turn
    let turn_costs: Vec<(u32, f64)> = turns
        .iter()
        .map(|turn| {
            let turn_tokens = TurnTokens::new(
                turn.input_tokens,
                turn.output_tokens,
                turn.cache_read_tokens,
                turn.cache_write_5m_tokens,
                turn.cache_write_1h_tokens,
            );
            let model = turn.model.as_deref().unwrap_or("claude-opus-4-5-20251101");
            let cost = calculate_turn_cost(&turn_tokens, model).total_cost;
            (turn.turn_number, cost)
        })
        .collect();

    let total_cost: f64 = turn_costs.iter().map(|(_, c)| c).sum();
    let avg_cost = total_cost / turns.len() as f64;

    if avg_cost < 0.01 {
        return patterns; // Trivial costs, skip
    }

    let spike_threshold = avg_cost * thresholds.cost_spike_multiplier;

    for (turn_number, cost) in &turn_costs {
        if *cost > spike_threshold {
            let spike_ratio = cost / avg_cost;
            let excess_cost = cost - avg_cost;

            let severity = if spike_ratio > thresholds.cost_spike_multiplier * 2.0 {
                Severity::Critical
            } else {
                Severity::Warning
            };

            patterns.push(DetectedPattern::new(
                AntiPatternType::CostSpike,
                severity,
                session_id.to_string(),
                Some(*turn_number),
                format!(
                    "Turn {} cost ${:.2} which is {:.1}x the session average of ${:.2}",
                    turn_number, cost, spike_ratio, avg_cost
                ),
                excess_cost,
                "Consider breaking expensive turns into smaller steps. Check if large files or context can be optimized.".to_string(),
                spike_ratio,
                thresholds.cost_spike_multiplier,
            ));
        }
    }

    patterns
}

/// Detect LongTurn: Duration > threshold
fn detect_long_turn(
    session_id: &str,
    turns: &[CompletedTurn],
    thresholds: &DetectionThresholds,
) -> Vec<DetectedPattern> {
    let mut patterns = Vec::new();

    // Calculate average turn cost for impact estimation
    let total_cost: f64 = turns
        .iter()
        .map(|turn| {
            let turn_tokens = TurnTokens::new(
                turn.input_tokens,
                turn.output_tokens,
                turn.cache_read_tokens,
                turn.cache_write_5m_tokens,
                turn.cache_write_1h_tokens,
            );
            let model = turn.model.as_deref().unwrap_or("claude-opus-4-5-20251101");
            calculate_turn_cost(&turn_tokens, model).total_cost
        })
        .sum();

    for turn in turns {
        if let Some(duration_ms) = turn.duration_ms {
            if duration_ms > thresholds.long_turn_ms {
                let duration_minutes = duration_ms as f64 / 60_000.0;
                let threshold_minutes = thresholds.long_turn_ms as f64 / 60_000.0;
                let excess_minutes = duration_minutes - threshold_minutes;

                // Estimate cost impact based on time overhead
                // Assumption: longer turns indicate rework or inefficiency
                let impact_cost = (total_cost / turns.len() as f64) * (excess_minutes / threshold_minutes);

                let severity = if duration_ms > thresholds.long_turn_ms * 2 {
                    Severity::Critical
                } else {
                    Severity::Warning
                };

                patterns.push(DetectedPattern::new(
                    AntiPatternType::LongTurn,
                    severity,
                    session_id.to_string(),
                    Some(turn.turn_number),
                    format!(
                        "Turn {} took {:.1} minutes (threshold: {:.1} min)",
                        turn.turn_number, duration_minutes, threshold_minutes
                    ),
                    impact_cost,
                    "Long turns may indicate complex tasks. Consider breaking into smaller, focused tasks.".to_string(),
                    duration_ms as f64,
                    thresholds.long_turn_ms as f64,
                ));
            }
        }
    }

    patterns
}

/// Detect ToolFailureSpree: Consecutive tool failures >= threshold
fn detect_tool_failure_spree(
    session_id: &str,
    turns: &[CompletedTurn],
    thresholds: &DetectionThresholds,
) -> Vec<DetectedPattern> {
    let mut patterns = Vec::new();

    // Track consecutive failures across all turns
    let mut consecutive_failures = 0u32;
    let mut spree_start_turn: Option<u32> = None;
    let mut sprees: Vec<(u32, u32, u32)> = Vec::new(); // (start_turn, end_turn, failure_count)

    for turn in turns {
        let turn_failures: u32 = turn.tool_uses.iter().filter(|t| t.is_error).count() as u32;

        if turn_failures > 0 {
            if consecutive_failures == 0 {
                spree_start_turn = Some(turn.turn_number);
            }
            consecutive_failures += turn_failures;
        } else {
            // End of spree
            if consecutive_failures >= thresholds.consecutive_failures {
                if let Some(start) = spree_start_turn {
                    sprees.push((start, turn.turn_number.saturating_sub(1), consecutive_failures));
                }
            }
            consecutive_failures = 0;
            spree_start_turn = None;
        }
    }

    // Check final spree
    if consecutive_failures >= thresholds.consecutive_failures {
        if let Some(start) = spree_start_turn {
            let end = turns.last().map(|t| t.turn_number).unwrap_or(start);
            sprees.push((start, end, consecutive_failures));
        }
    }

    // Calculate average turn cost for impact estimation
    let total_cost: f64 = turns
        .iter()
        .map(|turn| {
            let turn_tokens = TurnTokens::new(
                turn.input_tokens,
                turn.output_tokens,
                turn.cache_read_tokens,
                turn.cache_write_5m_tokens,
                turn.cache_write_1h_tokens,
            );
            let model = turn.model.as_deref().unwrap_or("claude-opus-4-5-20251101");
            calculate_turn_cost(&turn_tokens, model).total_cost
        })
        .sum();
    let avg_turn_cost = total_cost / turns.len().max(1) as f64;

    for (start, end, failure_count) in sprees {
        // Estimate impact: failed tool calls often require retries
        let impact_cost = failure_count as f64 * avg_turn_cost * 0.3; // 30% of turn cost per failure

        let severity = if failure_count >= thresholds.consecutive_failures * 2 {
            Severity::Critical
        } else {
            Severity::Warning
        };

        patterns.push(DetectedPattern::new(
            AntiPatternType::ToolFailureSpree,
            severity,
            session_id.to_string(),
            Some(start),
            format!(
                "{} consecutive tool failures from turn {} to {}",
                failure_count, start, end
            ),
            impact_cost,
            "Multiple tool failures indicate environmental issues or incorrect tool usage. Check tool inputs and environment.".to_string(),
            failure_count as f64,
            thresholds.consecutive_failures as f64,
        ));
    }

    patterns
}

/// Detect HighReworkRatio: Many edits to same files
fn detect_high_rework_ratio(
    session_id: &str,
    turns: &[CompletedTurn],
    thresholds: &DetectionThresholds,
) -> Vec<DetectedPattern> {
    let mut patterns = Vec::new();

    // Track file edit counts
    let mut file_edits: HashMap<String, u32> = HashMap::new();
    let mut total_edits = 0u32;

    for turn in turns {
        for tool_use in &turn.tool_uses {
            // Check for Write or Edit tools
            if matches!(tool_use.name.as_str(), "Write" | "Edit" | "write" | "edit") {
                if let Some(input) = &tool_use.input {
                    if let Some(file_path) = input.get("file_path").and_then(|v| v.as_str()) {
                        *file_edits.entry(file_path.to_string()).or_insert(0) += 1;
                        total_edits += 1;
                    }
                }
            }
        }
    }

    if total_edits < 3 {
        return patterns; // Not enough edits to analyze
    }

    // Calculate rework: edits beyond the first to each file
    let rework_edits: u32 = file_edits.values().map(|&count| count.saturating_sub(1)).sum();
    let rework_ratio = rework_edits as f64 / total_edits as f64;

    if rework_ratio > thresholds.rework_ratio_max {
        // Find the most reworked files
        let mut files: Vec<(&String, &u32)> = file_edits.iter().filter(|(_, &c)| c > 1).collect();
        files.sort_by(|a, b| b.1.cmp(a.1));
        let top_files: Vec<String> = files
            .iter()
            .take(3)
            .map(|(f, c)| format!("{} ({}x)", f, c))
            .collect();

        // Calculate cost impact
        let total_cost: f64 = turns
            .iter()
            .map(|turn| {
                let turn_tokens = TurnTokens::new(
                    turn.input_tokens,
                    turn.output_tokens,
                    turn.cache_read_tokens,
                    turn.cache_write_5m_tokens,
                    turn.cache_write_1h_tokens,
                );
                let model = turn.model.as_deref().unwrap_or("claude-opus-4-5-20251101");
                calculate_turn_cost(&turn_tokens, model).total_cost
            })
            .sum();

        // Rework edits represent wasted effort
        let impact_cost = total_cost * rework_ratio * 0.5; // 50% of rework is waste

        let severity = if rework_ratio > thresholds.rework_ratio_max * 1.5 {
            Severity::Critical
        } else {
            Severity::Warning
        };

        patterns.push(DetectedPattern::new(
            AntiPatternType::HighReworkRatio,
            severity,
            session_id.to_string(),
            None,
            format!(
                "High rework detected: {:.0}% of edits ({}/{}) are to previously edited files. Top files: {}",
                rework_ratio * 100.0, rework_edits, total_edits, top_files.join(", ")
            ),
            impact_cost,
            "Plan changes more thoroughly before implementing. Consider writing tests first to catch issues early.".to_string(),
            rework_ratio,
            thresholds.rework_ratio_max,
        ));
    }

    patterns
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::parser::session::ToolUse;

    fn create_test_turn(turn_number: u32, input_tokens: u64, output_tokens: u64) -> CompletedTurn {
        CompletedTurn {
            turn_number,
            started_at: "2026-01-14T07:44:28.000Z".to_string(),
            ended_at: Some("2026-01-14T07:44:30.000Z".to_string()),
            duration_ms: Some(2000),
            user_message: Some("Test".to_string()),
            assistant_message: Some("Response".to_string()),
            model: Some("claude-opus-4-5-20251101".to_string()),
            stop_reason: Some("end_turn".to_string()),
            input_tokens,
            output_tokens,
            cache_read_tokens: 1000,
            cache_write_5m_tokens: 500,
            cache_write_1h_tokens: 0,
            total_tokens: input_tokens + output_tokens + 1000 + 500 + 0, // input + output + cache_read + cache_write_5m + cache_write_1h
            total_context: input_tokens + 1500,
            tool_uses: vec![],
            tool_count: 0,
            has_subagents: false,
            subagent_ids: vec![],
            start_uuid: None,
            end_uuid: None,
            entry_count: 2,
        }
    }

    #[test]
    fn test_detect_subagent_sprawl() {
        let mut turn = create_test_turn(1, 1000, 500);
        turn.has_subagents = true;
        turn.subagent_ids = vec![
            "agent1".to_string(),
            "agent2".to_string(),
            "agent3".to_string(),
            "agent4".to_string(),
            "agent5".to_string(),
        ];

        let turns = vec![turn];
        let thresholds = DetectionThresholds::default();

        let patterns = detect_subagent_sprawl("test-session", &turns, &thresholds);

        // With 5 subagents and ~0.1 deliverable units, SEI should be very low
        assert!(!patterns.is_empty());
        assert_eq!(patterns[0].pattern_type, AntiPatternType::SubagentSprawl);
    }

    #[test]
    fn test_detect_context_churn() {
        let mut turn = create_test_turn(1, 1000, 500);
        // Set very low cache read to trigger churn detection
        turn.cache_read_tokens = 100;
        turn.cache_write_5m_tokens = 5000;

        let turns = vec![turn];
        let thresholds = DetectionThresholds::default();

        let patterns = detect_context_churn("test-session", &turns, &thresholds);

        // CER should be very low (100 / 5100 = ~0.02)
        assert!(!patterns.is_empty());
        assert_eq!(patterns[0].pattern_type, AntiPatternType::ContextChurn);
    }

    #[test]
    fn test_detect_cost_spike() {
        let mut turns: Vec<CompletedTurn> = (1..=5)
            .map(|i| create_test_turn(i, 1000, 500))
            .collect();

        // Make turn 3 have a huge cost spike
        turns[2].input_tokens = 100_000;
        turns[2].output_tokens = 50_000;

        let thresholds = DetectionThresholds::default();

        let patterns = detect_cost_spike("test-session", &turns, &thresholds);

        assert!(!patterns.is_empty());
        assert_eq!(patterns[0].pattern_type, AntiPatternType::CostSpike);
        assert_eq!(patterns[0].turn_number, Some(3));
    }

    #[test]
    fn test_detect_long_turn() {
        let mut turn = create_test_turn(1, 1000, 500);
        turn.duration_ms = Some(600_000); // 10 minutes

        let turns = vec![turn];
        let thresholds = DetectionThresholds::default();

        let patterns = detect_long_turn("test-session", &turns, &thresholds);

        assert!(!patterns.is_empty());
        assert_eq!(patterns[0].pattern_type, AntiPatternType::LongTurn);
    }

    #[test]
    fn test_detect_tool_failure_spree() {
        let turns: Vec<CompletedTurn> = (1..=3)
            .map(|i| {
                let mut turn = create_test_turn(i, 1000, 500);
                turn.tool_uses = vec![
                    ToolUse {
                        id: format!("t{}", i),
                        name: "Bash".to_string(),
                        input: None,
                        result: Some("error".to_string()),
                        is_error: true,
                    },
                    ToolUse {
                        id: format!("t{}b", i),
                        name: "Read".to_string(),
                        input: None,
                        result: Some("error".to_string()),
                        is_error: true,
                    },
                ];
                turn
            })
            .collect();

        let thresholds = DetectionThresholds::default();

        let patterns = detect_tool_failure_spree("test-session", &turns, &thresholds);

        // 6 consecutive failures across 3 turns
        assert!(!patterns.is_empty());
        assert_eq!(patterns[0].pattern_type, AntiPatternType::ToolFailureSpree);
    }

    #[test]
    fn test_detect_high_rework_ratio() {
        let turns: Vec<CompletedTurn> = (1..=5)
            .map(|i| {
                let mut turn = create_test_turn(i, 1000, 500);
                turn.tool_uses = vec![ToolUse {
                    id: format!("t{}", i),
                    name: "Edit".to_string(),
                    input: Some(serde_json::json!({"file_path": "/path/to/file.rs"})),
                    result: Some("ok".to_string()),
                    is_error: false,
                }];
                turn.tool_count = 1;
                turn
            })
            .collect();

        let thresholds = DetectionThresholds::default();

        let patterns = detect_high_rework_ratio("test-session", &turns, &thresholds);

        // 5 edits to same file = 4 rework edits = 80% rework ratio
        assert!(!patterns.is_empty());
        assert_eq!(patterns[0].pattern_type, AntiPatternType::HighReworkRatio);
    }

    #[test]
    fn test_no_false_positives_for_healthy_session() {
        let turns: Vec<CompletedTurn> = (1..=3)
            .map(|i| {
                let mut turn = create_test_turn(i, 1000, 5000);
                // Healthy cache ratio
                turn.cache_read_tokens = 8000;
                turn.cache_write_5m_tokens = 2000;
                // Normal duration
                turn.duration_ms = Some(30_000);
                // Successful tools
                turn.tool_uses = vec![ToolUse {
                    id: format!("t{}", i),
                    name: "Read".to_string(),
                    input: None,
                    result: Some("ok".to_string()),
                    is_error: false,
                }];
                turn
            })
            .collect();

        let thresholds = DetectionThresholds::default();

        // Check each detector returns no patterns
        assert!(detect_subagent_sprawl("test-session", &turns, &thresholds).is_empty());
        assert!(detect_context_churn("test-session", &turns, &thresholds).is_empty());
        assert!(detect_cost_spike("test-session", &turns, &thresholds).is_empty());
        assert!(detect_long_turn("test-session", &turns, &thresholds).is_empty());
        assert!(detect_tool_failure_spree("test-session", &turns, &thresholds).is_empty());
        assert!(detect_high_rework_ratio("test-session", &turns, &thresholds).is_empty());
    }

    #[test]
    fn test_severity_levels() {
        // Test Critical severity for very bad metrics
        let mut turn = create_test_turn(1, 1000, 500);
        turn.cache_read_tokens = 10;
        turn.cache_write_5m_tokens = 10000;

        let thresholds = DetectionThresholds::default();
        let patterns = detect_context_churn("test-session", &[turn], &thresholds);

        assert!(!patterns.is_empty());
        // CER is ~0.001, which is < 0.4/2 = 0.2, so should be Critical
        assert_eq!(patterns[0].severity, Severity::Critical);
    }

    #[test]
    fn test_detect_context_churn_warning_severity() {
        // Test Warning severity for moderately bad CER
        let mut turn = create_test_turn(1, 1000, 500);
        // CER = 1500 / 3000 = 0.33, which is < 0.4 but >= 0.2
        turn.cache_read_tokens = 1500;
        turn.cache_write_5m_tokens = 3000;

        let thresholds = DetectionThresholds::default();
        let patterns = detect_context_churn("test-session", &[turn], &thresholds);

        assert!(!patterns.is_empty());
        assert_eq!(patterns[0].severity, Severity::Warning);
    }

    #[test]
    fn test_detect_subagent_sprawl_no_subagents() {
        // Session with no subagents should not trigger SubagentSprawl
        let turn = create_test_turn(1, 1000, 500);
        let thresholds = DetectionThresholds::default();

        let patterns = detect_subagent_sprawl("test-session", &[turn], &thresholds);
        assert!(patterns.is_empty());
    }

    #[test]
    fn test_detect_cost_spike_single_turn() {
        // Single turn sessions should not trigger cost spike
        let turn = create_test_turn(1, 100_000, 50_000);
        let thresholds = DetectionThresholds::default();

        let patterns = detect_cost_spike("test-session", &[turn], &thresholds);
        assert!(patterns.is_empty());
    }

    #[test]
    fn test_detect_cost_spike_trivial_cost() {
        // Trivial costs should not trigger warnings
        let turns: Vec<CompletedTurn> = (1..=5)
            .map(|i| {
                let mut t = create_test_turn(i, 10, 5);
                // All turns have trivial cost
                t
            })
            .collect();

        let thresholds = DetectionThresholds::default();
        let patterns = detect_cost_spike("test-session", &turns, &thresholds);
        assert!(patterns.is_empty());
    }

    #[test]
    fn test_detect_long_turn_below_threshold() {
        // Turn within threshold should not be detected
        let mut turn = create_test_turn(1, 1000, 500);
        turn.duration_ms = Some(240_000); // 4 minutes, below 5 minute threshold

        let thresholds = DetectionThresholds::default();
        let patterns = detect_long_turn("test-session", &[turn], &thresholds);

        assert!(patterns.is_empty());
    }

    #[test]
    fn test_detect_long_turn_critical_severity() {
        // Very long turn should get critical severity
        let mut turn = create_test_turn(1, 1000, 500);
        turn.duration_ms = Some(900_000); // 15 minutes, > 2x threshold

        let thresholds = DetectionThresholds::default();
        let patterns = detect_long_turn("test-session", &[turn], &thresholds);

        assert!(!patterns.is_empty());
        assert_eq!(patterns[0].severity, Severity::Critical);
    }

    #[test]
    fn test_detect_tool_failure_spree_below_threshold() {
        // 2 failures (below 3 threshold) should not trigger
        let turns: Vec<CompletedTurn> = (1..=2)
            .map(|i| {
                let mut turn = create_test_turn(i, 1000, 500);
                turn.tool_uses = vec![ToolUse {
                    id: format!("t{}", i),
                    name: "Bash".to_string(),
                    input: None,
                    result: Some("error".to_string()),
                    is_error: true,
                }];
                turn
            })
            .collect();

        let thresholds = DetectionThresholds::default();
        let patterns = detect_tool_failure_spree("test-session", &turns, &thresholds);

        assert!(patterns.is_empty());
    }

    #[test]
    fn test_detect_high_rework_ratio_insufficient_edits() {
        // Less than 3 edits should not trigger detection
        let turns: Vec<CompletedTurn> = (1..=2)
            .map(|i| {
                let mut turn = create_test_turn(i, 1000, 500);
                turn.tool_uses = vec![ToolUse {
                    id: format!("t{}", i),
                    name: "Edit".to_string(),
                    input: Some(serde_json::json!({"file_path": "/path/to/file.rs"})),
                    result: Some("ok".to_string()),
                    is_error: false,
                }];
                turn.tool_count = 1;
                turn
            })
            .collect();

        let thresholds = DetectionThresholds::default();
        let patterns = detect_high_rework_ratio("test-session", &turns, &thresholds);

        assert!(patterns.is_empty());
    }

    #[test]
    fn test_detect_high_rework_ratio_different_files() {
        // Edits to different files should not trigger rework detection
        let turns: Vec<CompletedTurn> = (1..=5)
            .map(|i| {
                let mut turn = create_test_turn(i, 1000, 500);
                turn.tool_uses = vec![ToolUse {
                    id: format!("t{}", i),
                    name: "Edit".to_string(),
                    input: Some(serde_json::json!({"file_path": format!("/path/to/file{}.rs", i)})),
                    result: Some("ok".to_string()),
                    is_error: false,
                }];
                turn.tool_count = 1;
                turn
            })
            .collect();

        let thresholds = DetectionThresholds::default();
        let patterns = detect_high_rework_ratio("test-session", &turns, &thresholds);

        // No rework since all files are different
        assert!(patterns.is_empty());
    }

    #[test]
    fn test_context_churn_insufficient_cache_activity() {
        // Minimal cache activity should not trigger detection
        let mut turn = create_test_turn(1, 1000, 500);
        turn.cache_read_tokens = 100;
        turn.cache_write_5m_tokens = 100;

        let thresholds = DetectionThresholds::default();
        let patterns = detect_context_churn("test-session", &[turn], &thresholds);

        assert!(patterns.is_empty());
    }

    #[test]
    fn test_subagent_sprawl_critical_severity() {
        // Very low SEI should get critical severity
        let mut turn = create_test_turn(1, 1000, 100); // Very low output
        turn.has_subagents = true;
        turn.subagent_ids = vec![
            "agent1".to_string(),
            "agent2".to_string(),
            "agent3".to_string(),
            "agent4".to_string(),
            "agent5".to_string(),
            "agent6".to_string(),
            "agent7".to_string(),
            "agent8".to_string(),
            "agent9".to_string(),
            "agent10".to_string(),
        ];

        let turns = vec![turn];
        let thresholds = DetectionThresholds::default();

        let patterns = detect_subagent_sprawl("test-session", &turns, &thresholds);

        assert!(!patterns.is_empty());
        // Very low SEI should trigger Critical
        assert_eq!(patterns[0].severity, Severity::Critical);
    }

    #[test]
    fn test_tool_failure_spree_critical_severity() {
        // Many failures should get critical severity
        let turns: Vec<CompletedTurn> = (1..=3)
            .map(|i| {
                let mut turn = create_test_turn(i, 1000, 500);
                // Multiple failures per turn
                turn.tool_uses = vec![
                    ToolUse {
                        id: format!("t{}a", i),
                        name: "Bash".to_string(),
                        input: None,
                        result: Some("error".to_string()),
                        is_error: true,
                    },
                    ToolUse {
                        id: format!("t{}b", i),
                        name: "Bash".to_string(),
                        input: None,
                        result: Some("error".to_string()),
                        is_error: true,
                    },
                    ToolUse {
                        id: format!("t{}c", i),
                        name: "Bash".to_string(),
                        input: None,
                        result: Some("error".to_string()),
                        is_error: true,
                    },
                ];
                turn
            })
            .collect();

        let thresholds = DetectionThresholds::default();
        let patterns = detect_tool_failure_spree("test-session", &turns, &thresholds);

        assert!(!patterns.is_empty());
        // 9 consecutive failures >= 3 * 2 = 6, should be Critical
        assert_eq!(patterns[0].severity, Severity::Critical);
    }
}

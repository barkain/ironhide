//! Developer Performance metrics
//!
//! Computes a 7-axis spider chart profile from session data:
//! 1. Session Velocity - deliverable units per hour
//! 2. Tool Reliability - success rate of tool invocations
//! 3. Workflow Efficiency - inverse of workflow friction
//! 4. Cost Efficiency - inverse of cost per deliverable unit
//! 5. Cache Utilization - cache read efficiency
//! 6. Scope Discipline - percentage of sessions within P75 turn count
//! 7. Parallel Throughput - concurrent sessions per day

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Developer performance profile across 7 axes (all 0-10 scale)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeveloperPerformanceMetrics {
    /// Deliverable units per session hour, normalized 0-10
    pub session_velocity: f64,
    /// (1 - error_tool_uses/total_tool_uses) * 10
    pub tool_reliability: f64,
    /// (1 - avg_WFS) * 10
    pub workflow_efficiency: f64,
    /// min(10/avg_CPDU, 10)
    pub cost_efficiency: f64,
    /// avg_CER * 10
    pub cache_utilization: f64,
    /// (sessions_within_p75_turns / total) * 10
    pub scope_discipline: f64,
    /// avg_concurrent_sessions_per_day, normalized 0-10
    pub parallel_throughput: f64,
    /// Detected archetype label
    pub archetype: String,
    /// Average of all 7 axes
    pub overall_score: f64,
    /// Number of sessions analyzed
    pub session_count: u32,
    /// Baseline comparison metrics (prior period)
    pub baseline: Option<Box<DeveloperPerformanceMetrics>>,
}

/// Per-session data needed for developer metrics calculation
#[derive(Debug, Clone)]
pub struct SessionInput {
    /// Session ID
    pub session_id: String,
    /// Duration in milliseconds
    pub duration_ms: u64,
    /// Estimated deliverable units
    pub deliverable_units: f64,
    /// Total tool invocations
    pub tool_count: u32,
    /// Tool invocations that resulted in errors
    pub error_tool_count: u32,
    /// Workflow Friction Score (0.0-1.0)
    pub wfs: f64,
    /// Cost Per Deliverable Unit
    pub cpdu: f64,
    /// Cache Efficiency Ratio (0.0-1.0)
    pub cer: f64,
    /// Number of turns in session
    pub turn_count: u32,
    /// Session start timestamp (ISO 8601)
    pub started_at: String,
    /// Is this a subagent session?
    pub is_subagent: bool,
}

/// Calculate developer performance metrics from a set of sessions.
///
/// `sessions` is the primary analysis window.
/// `baseline_sessions` is an optional prior period for comparison.
pub fn calculate_developer_metrics(
    sessions: &[SessionInput],
    baseline_sessions: Option<&[SessionInput]>,
) -> DeveloperPerformanceMetrics {
    let metrics = compute_axes(sessions);

    let baseline = baseline_sessions.map(|bs| {
        let mut baseline_metrics = compute_axes(bs);
        baseline_metrics.baseline = None; // No nested baselines
        Box::new(baseline_metrics)
    });

    DeveloperPerformanceMetrics {
        baseline,
        ..metrics
    }
}

/// Compute all 7 axes and archetype from session inputs.
fn compute_axes(sessions: &[SessionInput]) -> DeveloperPerformanceMetrics {
    if sessions.is_empty() {
        return DeveloperPerformanceMetrics {
            session_velocity: 0.0,
            tool_reliability: 10.0,
            workflow_efficiency: 10.0,
            cost_efficiency: 10.0,
            cache_utilization: 0.0,
            scope_discipline: 10.0,
            parallel_throughput: 0.0,
            archetype: "Developing".to_string(),
            overall_score: 0.0,
            session_count: 0,
            baseline: None,
        };
    }

    let session_count = sessions.len() as u32;

    // 1. Session Velocity: deliverable_units / session_hours, normalized
    let session_velocity = {
        let total_du: f64 = sessions.iter().map(|s| s.deliverable_units).sum();
        let total_hours: f64 = sessions
            .iter()
            .map(|s| s.duration_ms as f64 / 3_600_000.0)
            .sum();
        let raw = if total_hours > 0.0 {
            total_du / total_hours
        } else {
            0.0
        };
        (raw / 2.0).min(10.0)
    };

    // 2. Tool Reliability: (1 - error_rate) * 10
    let tool_reliability = {
        let total_tools: u32 = sessions.iter().map(|s| s.tool_count).sum();
        let total_errors: u32 = sessions.iter().map(|s| s.error_tool_count).sum();
        if total_tools > 0 {
            (1.0 - total_errors as f64 / total_tools as f64) * 10.0
        } else {
            10.0
        }
    };

    // 3. Workflow Efficiency: (1 - avg_WFS) * 10
    let workflow_efficiency = {
        let avg_wfs: f64 =
            sessions.iter().map(|s| s.wfs).sum::<f64>() / session_count as f64;
        ((1.0 - avg_wfs) * 10.0).clamp(0.0, 10.0)
    };

    // 4. Cost Efficiency: min(10/avg_CPDU, 10)
    let cost_efficiency = {
        let avg_cpdu: f64 =
            sessions.iter().map(|s| s.cpdu).sum::<f64>() / session_count as f64;
        if avg_cpdu > 0.0 {
            (10.0 / avg_cpdu).min(10.0)
        } else {
            10.0
        }
    };

    // 5. Cache Utilization: avg_CER * 10
    let cache_utilization = {
        let avg_cer: f64 =
            sessions.iter().map(|s| s.cer).sum::<f64>() / session_count as f64;
        (avg_cer * 10.0).min(10.0)
    };

    // 6. Scope Discipline: proportion of sessions within P75 turn count
    let scope_discipline = {
        let mut turn_counts: Vec<u32> = sessions.iter().map(|s| s.turn_count).collect();
        turn_counts.sort_unstable();
        let p75_idx = (turn_counts.len() as f64 * 0.75).ceil() as usize;
        let p75_value = turn_counts[p75_idx.min(turn_counts.len() - 1)];
        let within_p75 = sessions
            .iter()
            .filter(|s| s.turn_count <= p75_value)
            .count();
        (within_p75 as f64 / session_count as f64 * 10.0).min(10.0)
    };

    // 7. Parallel Throughput: average concurrent sessions per day
    let parallel_throughput = {
        let mut sessions_per_day: HashMap<String, u32> = HashMap::new();
        for s in sessions {
            let date = s.started_at.split('T').next().unwrap_or("unknown");
            *sessions_per_day.entry(date.to_string()).or_default() += 1;
        }
        let num_days = sessions_per_day.len() as f64;
        let avg_per_day = if num_days > 0.0 {
            session_count as f64 / num_days
        } else {
            0.0
        };
        (avg_per_day * 3.33).min(10.0)
    };

    let axes = [
        session_velocity,
        tool_reliability,
        workflow_efficiency,
        cost_efficiency,
        cache_utilization,
        scope_discipline,
        parallel_throughput,
    ];
    let overall_score = axes.iter().sum::<f64>() / axes.len() as f64;

    let archetype = detect_archetype(&axes);

    DeveloperPerformanceMetrics {
        session_velocity,
        tool_reliability,
        workflow_efficiency,
        cost_efficiency,
        cache_utilization,
        scope_discipline,
        parallel_throughput,
        archetype,
        overall_score,
        session_count,
        baseline: None,
    }
}

/// Detect developer archetype from the 7-axis scores.
///
/// Axes order: [velocity, tool_reliability, workflow, cost, cache, scope, parallel]
fn detect_archetype(axes: &[f64; 7]) -> String {
    let [velocity, _tool, workflow, cost, cache, scope, parallel] = *axes;
    let all_min = axes.iter().copied().fold(f64::INFINITY, f64::min);
    let all_max = axes.iter().copied().fold(f64::NEG_INFINITY, f64::max);

    if velocity >= 8.0 && scope >= 7.0 {
        "Velocity Master".to_string()
    } else if cost >= 8.0 && cache >= 7.0 {
        "Efficiency Expert".to_string()
    } else if parallel >= 7.0 && workflow >= 6.0 {
        "Multitasker".to_string()
    } else if all_min >= 4.0 && axes.iter().all(|&v| v >= 5.0) {
        "Balanced Pro".to_string()
    } else if all_max >= 9.0 && all_min <= 4.0 {
        "Specialist".to_string()
    } else {
        "Developing".to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_session(
        id: &str,
        du: f64,
        duration_ms: u64,
        tools: u32,
        errors: u32,
        wfs: f64,
        cpdu: f64,
        cer: f64,
        turns: u32,
        date: &str,
    ) -> SessionInput {
        SessionInput {
            session_id: id.to_string(),
            duration_ms,
            deliverable_units: du,
            tool_count: tools,
            error_tool_count: errors,
            wfs,
            cpdu,
            cer,
            turn_count: turns,
            started_at: format!("{}T10:00:00Z", date),
            is_subagent: false,
        }
    }

    #[test]
    fn test_empty_sessions() {
        let metrics = calculate_developer_metrics(&[], None);
        assert_eq!(metrics.session_count, 0);
        assert_eq!(metrics.overall_score, 0.0);
        assert_eq!(metrics.archetype, "Developing");
    }

    #[test]
    fn test_single_session() {
        let sessions = vec![make_session(
            "s1", 5.0, 3_600_000, 50, 2, 0.1, 1.0, 0.7, 15, "2026-01-15",
        )];
        let metrics = calculate_developer_metrics(&sessions, None);

        assert_eq!(metrics.session_count, 1);
        // velocity: 5 DU / 1 hour = 5, normalized = min(5/2, 10) = 2.5
        assert!((metrics.session_velocity - 2.5).abs() < 0.01);
        // tool reliability: (1 - 2/50) * 10 = 9.6
        assert!((metrics.tool_reliability - 9.6).abs() < 0.01);
        // workflow: (1 - 0.1) * 10 = 9.0
        assert!((metrics.workflow_efficiency - 9.0).abs() < 0.01);
        // cost: min(10/1.0, 10) = 10.0
        assert!((metrics.cost_efficiency - 10.0).abs() < 0.01);
        // cache: 0.7 * 10 = 7.0
        assert!((metrics.cache_utilization - 7.0).abs() < 0.01);
        assert!(metrics.overall_score > 0.0);
    }

    #[test]
    fn test_baseline_comparison() {
        let current = vec![make_session(
            "s1", 5.0, 3_600_000, 50, 2, 0.1, 1.0, 0.7, 15, "2026-02-15",
        )];
        let baseline = vec![make_session(
            "s0", 3.0, 3_600_000, 40, 5, 0.3, 2.0, 0.5, 20, "2026-01-15",
        )];
        let metrics = calculate_developer_metrics(&current, Some(&baseline));

        assert!(metrics.baseline.is_some());
        let bl = metrics.baseline.as_ref().unwrap();
        assert_eq!(bl.session_count, 1);
        assert!(bl.baseline.is_none()); // No nested baselines
    }

    #[test]
    fn test_archetype_velocity_master() {
        // High velocity (needs raw DU/hour >= 16 -> normalized = 16/2 = 8)
        // and scope >= 7
        let sessions = vec![
            make_session("s1", 20.0, 3_600_000, 50, 0, 0.0, 1.0, 0.5, 10, "2026-01-15"),
            make_session("s2", 12.0, 3_600_000, 40, 0, 0.0, 1.0, 0.5, 8, "2026-01-16"),
        ];
        let metrics = calculate_developer_metrics(&sessions, None);
        assert_eq!(metrics.archetype, "Velocity Master");
    }

    #[test]
    fn test_archetype_efficiency_expert() {
        let sessions = vec![
            make_session("s1", 5.0, 3_600_000, 50, 0, 0.0, 0.5, 0.8, 10, "2026-01-15"),
            make_session("s2", 5.0, 3_600_000, 40, 0, 0.0, 0.5, 0.75, 12, "2026-01-16"),
        ];
        let metrics = calculate_developer_metrics(&sessions, None);
        // cost_efficiency = min(10/0.5, 10) = 10, cache = 0.775*10 = 7.75
        assert_eq!(metrics.archetype, "Efficiency Expert");
    }

    #[test]
    fn test_parallel_throughput() {
        // 6 sessions across 2 days => avg 3/day => 3 * 3.33 = 9.99
        let sessions: Vec<SessionInput> = (0..6)
            .map(|i| {
                let date = if i < 3 { "2026-01-15" } else { "2026-01-16" };
                make_session(
                    &format!("s{}", i),
                    2.0,
                    1_800_000,
                    20,
                    0,
                    0.1,
                    1.0,
                    0.5,
                    10,
                    date,
                )
            })
            .collect();
        let metrics = calculate_developer_metrics(&sessions, None);
        assert!((metrics.parallel_throughput - 9.99).abs() < 0.1);
    }

    #[test]
    fn test_all_axes_bounded() {
        let sessions = vec![
            make_session("s1", 100.0, 100, 1000, 0, 0.0, 0.01, 1.0, 5, "2026-01-15"),
        ];
        let metrics = calculate_developer_metrics(&sessions, None);
        let axes = [
            metrics.session_velocity,
            metrics.tool_reliability,
            metrics.workflow_efficiency,
            metrics.cost_efficiency,
            metrics.cache_utilization,
            metrics.scope_discipline,
            metrics.parallel_throughput,
        ];
        for (i, &v) in axes.iter().enumerate() {
            assert!(v >= 0.0 && v <= 10.0, "Axis {} out of bounds: {}", i, v);
        }
    }
}

//! Developer AI Adoption Metrics
//!
//! Computes a 3-axis performance profile:
//! 1. Throughput Velocity - PRs merged per sprint
//! 2. Parallelism Ratio - concurrent commit-days / sprint days
//! 3. AI ROI - PRs merged per $100 of Claude Code spend

use serde::{Deserialize, Serialize};

/// Developer performance profile across 3 axes (all 0-10 scale)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeveloperPerformanceMetrics {
    /// Raw: PRs merged per sprint
    pub throughput_velocity: f64,
    /// Raw: concurrent commit-days / sprint days
    pub parallelism_ratio: f64,
    /// Raw: PRs merged per $100 CC spend
    pub ai_roi: f64,
    /// Score 0-10
    pub throughput_velocity_score: f64,
    /// Score 0-10
    pub parallelism_ratio_score: f64,
    /// Score 0-10
    pub ai_roi_score: f64,
    /// Detected archetype label
    pub archetype: String,
    /// Average of all 3 scores
    pub overall_score: f64,
    /// Number of sprints analyzed
    pub sprint_count: u32,
    /// Total PRs merged in analysis window
    pub prs_merged: u32,
    /// Total CC spend in USD
    pub total_cc_spend: f64,
    /// Per-sprint scores for individual bubble rendering
    pub sprints: Vec<SprintScore>,
    /// Baseline comparison (prior period)
    pub baseline: Option<Box<DeveloperPerformanceMetrics>>,
}

/// Per-sprint computed scores (for individual bubble rendering)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SprintScore {
    /// Sprint index (0 = most recent)
    pub index: u32,
    /// Sprint start date (ISO format)
    pub start_date: String,
    /// Sprint end date (ISO format)
    pub end_date: String,
    /// Raw values
    pub throughput_velocity: f64,
    pub parallelism_ratio: f64,
    pub ai_roi: f64,
    /// Scores 0-10
    pub throughput_velocity_score: f64,
    pub parallelism_ratio_score: f64,
    pub ai_roi_score: f64,
}

/// Per-sprint input data
#[derive(Debug, Clone)]
pub struct SprintInput {
    pub prs_merged: u32,
    pub concurrent_commit_days: u32,
    pub sprint_days: u32,
    pub cc_spend_usd: f64,
    pub start_date: String,
    pub end_date: String,
}

/// Calculate developer metrics from sprint data.
///
/// `sprints` is the primary analysis window.
/// `baseline_sprints` is an optional prior period for comparison.
pub fn calculate_developer_metrics(
    sprints: &[SprintInput],
    baseline_sprints: Option<&[SprintInput]>,
) -> DeveloperPerformanceMetrics {
    let metrics = compute_axes(sprints);

    let baseline = baseline_sprints.map(|bs| {
        let mut baseline_metrics = compute_axes(bs);
        baseline_metrics.baseline = None;
        Box::new(baseline_metrics)
    });

    DeveloperPerformanceMetrics {
        baseline,
        ..metrics
    }
}

fn compute_axes(sprints: &[SprintInput]) -> DeveloperPerformanceMetrics {
    if sprints.is_empty() {
        return DeveloperPerformanceMetrics {
            throughput_velocity: 0.0,
            parallelism_ratio: 0.0,
            ai_roi: 0.0,
            throughput_velocity_score: 0.0,
            parallelism_ratio_score: 0.0,
            ai_roi_score: 0.0,
            archetype: "Early Adopter".to_string(),
            overall_score: 0.0,
            sprint_count: 0,
            prs_merged: 0,
            total_cc_spend: 0.0,
            sprints: Vec::new(),
            baseline: None,
        };
    }

    let sprint_count = sprints.len() as u32;
    let total_prs: u32 = sprints.iter().map(|s| s.prs_merged).sum();
    let total_cc_spend: f64 = sprints.iter().map(|s| s.cc_spend_usd).sum();
    let total_concurrent_days: u32 = sprints.iter().map(|s| s.concurrent_commit_days).sum();
    let total_sprint_days: u32 = sprints.iter().map(|s| s.sprint_days).sum();

    // Raw values (per sprint averages)
    let throughput_velocity = total_prs as f64 / sprint_count as f64;
    let parallelism_ratio = if total_sprint_days > 0 {
        total_concurrent_days as f64 / total_sprint_days as f64
    } else {
        0.0
    };
    let ai_roi = if total_cc_spend > 0.0 {
        (total_prs as f64 / total_cc_spend) * 100.0
    } else {
        0.0
    };

    // Scoring (0-10 scale based on PDF thresholds)
    let throughput_velocity_score = score_throughput(throughput_velocity);
    let parallelism_ratio_score = score_parallelism(parallelism_ratio);
    let ai_roi_score = score_roi(ai_roi);

    let scores = [throughput_velocity_score, parallelism_ratio_score, ai_roi_score];
    let overall_score = scores.iter().sum::<f64>() / scores.len() as f64;

    let archetype = detect_archetype(throughput_velocity_score, parallelism_ratio_score, ai_roi_score);

    let sprint_scores: Vec<SprintScore> = sprints.iter().enumerate().map(|(i, s)| {
        let tv = s.prs_merged as f64; // raw: PRs this sprint (already per-sprint)
        let pr = if s.sprint_days > 0 {
            s.concurrent_commit_days as f64 / s.sprint_days as f64
        } else {
            0.0
        };
        let roi = if s.cc_spend_usd > 0.0 {
            (s.prs_merged as f64 / s.cc_spend_usd) * 100.0
        } else {
            0.0
        };
        SprintScore {
            index: i as u32,
            start_date: s.start_date.clone(),
            end_date: s.end_date.clone(),
            throughput_velocity: tv,
            parallelism_ratio: pr,
            ai_roi: roi,
            throughput_velocity_score: score_throughput(tv),
            parallelism_ratio_score: score_parallelism(pr),
            ai_roi_score: score_roi(roi),
        }
    }).collect();

    DeveloperPerformanceMetrics {
        throughput_velocity,
        parallelism_ratio,
        ai_roi,
        throughput_velocity_score,
        parallelism_ratio_score,
        ai_roi_score,
        archetype,
        overall_score,
        sprint_count,
        prs_merged: total_prs,
        total_cc_spend,
        sprints: sprint_scores,
        baseline: None,
    }
}

/// Score throughput velocity (PRs per sprint) on 0-10 scale
/// Based on PDF: <3 = 1-3, 3-6 = 4-6, 7-10 = 7-8, >10 = 9-10
fn score_throughput(prs_per_sprint: f64) -> f64 {
    if prs_per_sprint <= 0.0 {
        0.0
    } else if prs_per_sprint < 3.0 {
        // Linear 0-3 maps to 1-3
        (prs_per_sprint / 3.0 * 2.0 + 1.0).clamp(0.0, 3.0)
    } else if prs_per_sprint <= 6.0 {
        // Linear 3-6 maps to 4-6
        ((prs_per_sprint - 3.0) / 3.0 * 2.0 + 4.0).clamp(4.0, 6.0)
    } else if prs_per_sprint <= 10.0 {
        // Linear 7-10 maps to 7-8
        ((prs_per_sprint - 7.0) / 3.0 + 7.0).clamp(7.0, 8.0)
    } else {
        // >10 maps to 9-10
        ((prs_per_sprint - 10.0) / 5.0 + 9.0).clamp(9.0, 10.0)
    }
}

/// Score parallelism ratio on 0-10 scale
/// Based on PDF: 0-0.3 = 1-3, 0.3-0.8 = 4-6, 0.8-1.5 = 7-8, >1.5 = 9-10
fn score_parallelism(ratio: f64) -> f64 {
    if ratio <= 0.0 {
        0.0
    } else if ratio < 0.3 {
        (ratio / 0.3 * 2.0 + 1.0).clamp(0.0, 3.0)
    } else if ratio <= 0.8 {
        ((ratio - 0.3) / 0.5 * 2.0 + 4.0).clamp(4.0, 6.0)
    } else if ratio <= 1.5 {
        ((ratio - 0.8) / 0.7 + 7.0).clamp(7.0, 8.0)
    } else {
        ((ratio - 1.5) / 1.0 + 9.0).clamp(9.0, 10.0)
    }
}

/// Score AI ROI (PRs per $100 CC spend) on 0-10 scale
/// Based on PDF: <0.5 = 1-3, 0.5-1.5 = 4-6, 1.5-3.0 = 7-8, >3.0 = 9-10
fn score_roi(roi: f64) -> f64 {
    if roi <= 0.0 {
        0.0
    } else if roi < 0.5 {
        (roi / 0.5 * 2.0 + 1.0).clamp(0.0, 3.0)
    } else if roi <= 1.5 {
        ((roi - 0.5) / 1.0 * 2.0 + 4.0).clamp(4.0, 6.0)
    } else if roi <= 3.0 {
        ((roi - 1.5) / 1.5 + 7.0).clamp(7.0, 8.0)
    } else {
        ((roi - 3.0) / 3.0 + 9.0).clamp(9.0, 10.0)
    }
}

/// Detect developer archetype from 3-axis scores.
/// 5 archetypes from PDF:
/// - AI-Native Power User: high all three
/// - Volume Spammer: high throughput, low parallelism, low ROI
/// - Deep Single-Threader: moderate throughput, low parallelism, high ROI
/// - Expensive Explorer: low throughput, high parallelism, low ROI
/// - Early Adopter: low all three
fn detect_archetype(throughput: f64, parallelism: f64, roi: f64) -> String {
    if throughput >= 7.0 && parallelism >= 7.0 && roi >= 6.0 {
        "AI-Native Power User".to_string()
    } else if throughput >= 7.0 && parallelism <= 4.0 && roi <= 4.0 {
        "Volume Spammer".to_string()
    } else if throughput >= 4.0 && parallelism <= 4.0 && roi >= 6.0 {
        "Deep Single-Threader".to_string()
    } else if throughput <= 5.0 && parallelism >= 5.0 && roi <= 4.0 {
        "Expensive Explorer".to_string()
    } else {
        "Early Adopter".to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_sprint(prs: u32, concurrent_days: u32, sprint_days: u32, spend: f64) -> SprintInput {
        SprintInput {
            prs_merged: prs,
            concurrent_commit_days: concurrent_days,
            sprint_days,
            cc_spend_usd: spend,
            start_date: "2026-01-01".to_string(),
            end_date: "2026-01-15".to_string(),
        }
    }

    #[test]
    fn test_empty_sprints() {
        let metrics = calculate_developer_metrics(&[], None);
        assert_eq!(metrics.sprint_count, 0);
        assert_eq!(metrics.overall_score, 0.0);
        assert_eq!(metrics.archetype, "Early Adopter");
    }

    #[test]
    fn test_single_sprint() {
        let sprints = vec![make_sprint(5, 3, 14, 50.0)];
        let metrics = calculate_developer_metrics(&sprints, None);

        assert_eq!(metrics.sprint_count, 1);
        assert_eq!(metrics.prs_merged, 5);
        assert!((metrics.throughput_velocity - 5.0).abs() < 0.01);
        assert!((metrics.parallelism_ratio - 3.0 / 14.0).abs() < 0.01);
        assert!((metrics.ai_roi - 10.0).abs() < 0.01); // 5/50*100 = 10
    }

    #[test]
    fn test_power_user_archetype() {
        // High everything: 10 PRs, 12 concurrent days, 14 sprint days, $50 spend
        let sprints = vec![make_sprint(10, 12, 14, 50.0)];
        let metrics = calculate_developer_metrics(&sprints, None);
        assert_eq!(metrics.archetype, "AI-Native Power User");
    }

    #[test]
    fn test_baseline_comparison() {
        let current = vec![make_sprint(8, 6, 14, 40.0)];
        let baseline = vec![make_sprint(4, 2, 14, 60.0)];
        let metrics = calculate_developer_metrics(&current, Some(&baseline));

        assert!(metrics.baseline.is_some());
        let bl = metrics.baseline.as_ref().unwrap();
        assert_eq!(bl.prs_merged, 4);
        assert!(bl.baseline.is_none());
    }

    #[test]
    fn test_scores_bounded() {
        let sprints = vec![make_sprint(50, 14, 14, 10.0)];
        let metrics = calculate_developer_metrics(&sprints, None);
        assert!(metrics.throughput_velocity_score >= 0.0 && metrics.throughput_velocity_score <= 10.0);
        assert!(metrics.parallelism_ratio_score >= 0.0 && metrics.parallelism_ratio_score <= 10.0);
        assert!(metrics.ai_roi_score >= 0.0 && metrics.ai_roi_score <= 10.0);
    }

    #[test]
    fn test_zero_spend_roi() {
        let sprints = vec![make_sprint(5, 3, 14, 0.0)];
        let metrics = calculate_developer_metrics(&sprints, None);
        assert_eq!(metrics.ai_roi, 0.0);
        assert_eq!(metrics.ai_roi_score, 0.0);
    }
}

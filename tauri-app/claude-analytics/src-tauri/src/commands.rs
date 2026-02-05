//! Tauri command handlers
//!
//! All IPC commands exposed to the frontend.
//! These commands use the real parser and metrics calculators
//! instead of relying solely on database queries.

use std::collections::{HashMap, HashSet};
use std::sync::RwLock;
use std::time::SystemTime;

use serde::Serialize;

use crate::db;
use crate::metrics::cost::{calculate_turn_cost, CostBreakdown};
use crate::metrics::session::{
    calculate_session_metrics, estimate_deliverable_units, SessionMetricsInput,
};
use crate::metrics::tokens::{SessionTokens, TurnTokens};
use crate::parser::{
    find_session_by_id, parse_session_by_id, scan_claude_sessions, CompletedTurn, SessionFileInfo,
};
use crate::AppState;
use crate::CommandError;

// ============================================================================
// Response DTOs for Frontend
// ============================================================================

/// Session summary for list views
#[derive(Debug, Clone, Serialize)]
pub struct SessionSummary {
    pub id: String,
    pub project_path: String,
    pub project_name: String,
    pub started_at: String,
    pub last_activity_at: Option<String>,
    pub model: Option<String>,
    pub total_cost: f64,
    pub total_turns: u32,
    pub total_tokens: u64,
    pub duration_ms: u64,
    pub is_subagent: bool,
    pub file_path: String,
}

/// Full session detail with all metrics
#[derive(Debug, Clone, Serialize)]
pub struct SessionDetail {
    pub id: String,
    pub project_path: String,
    pub project_name: String,
    pub started_at: String,
    pub last_activity_at: Option<String>,
    pub model: Option<String>,
    pub is_subagent: bool,
    pub file_path: String,
    pub metrics: SessionMetricsResponse,
}

/// Session metrics response
#[derive(Debug, Clone, Serialize)]
pub struct SessionMetricsResponse {
    pub tokens: TokenSummaryResponse,
    pub cost: CostSummaryResponse,
    pub efficiency: EfficiencyResponse,
    pub duration_ms: u64,
    pub turn_count: u32,
    pub tool_count: u32,
    pub unique_tools: Vec<String>,
    pub models_used: Vec<String>,
    pub subagent_count: u32,
}

/// Token summary response
#[derive(Debug, Clone, Serialize)]
pub struct TokenSummaryResponse {
    pub input: u64,
    pub output: u64,
    pub cache_read: u64,
    pub cache_write_5m: u64,
    pub cache_write_1h: u64,
    pub total: u64,
    pub context_used_pct: f64,
}

/// Cost summary response
#[derive(Debug, Clone, Serialize)]
pub struct CostSummaryResponse {
    pub input_cost: f64,
    pub output_cost: f64,
    pub cache_read_cost: f64,
    pub cache_write_cost: f64,
    pub total_cost: f64,
    pub avg_cost_per_turn: f64,
}

/// Efficiency metrics response
#[derive(Debug, Clone, Serialize)]
pub struct EfficiencyResponse {
    pub cer: f64,         // Cache Efficiency Ratio
    pub cgr: f64,         // Context Growth Rate
    pub sei: Option<f64>, // Subagent Efficiency Index
    pub wfs: f64,         // Workflow Friction Score
    pub cpdu: f64,        // Cost per Deliverable Unit
    pub cpd: f64,         // Cycles per Deliverable
    pub oes_score: f64,   // Overall Efficiency Score
    pub oes_grade: String,
}

/// Turn summary for list views
#[derive(Debug, Clone, Serialize)]
pub struct TurnSummary {
    pub turn_number: u32,
    pub started_at: String,
    pub ended_at: Option<String>,
    pub duration_ms: Option<i64>,
    pub user_message: Option<String>,
    pub assistant_message: Option<String>,
    pub model: Option<String>,
    pub tokens: TurnTokensResponse,
    pub cost: f64,
    pub tool_count: u32,
    pub tools_used: Vec<String>,
    pub is_subagent: bool,
    pub stop_reason: Option<String>,
}

/// Turn tokens response
#[derive(Debug, Clone, Serialize)]
pub struct TurnTokensResponse {
    pub input: u64,
    pub output: u64,
    pub cache_read: u64,
    pub cache_write: u64,
    pub total: u64,
}

// ============================================================================
// Session Cache
// ============================================================================

/// Cached session data to avoid re-parsing unchanged files
struct CachedSession {
    last_modified: SystemTime,
    file_size: u64,
    turns: Vec<CompletedTurn>,
}

// Global session cache using lazy_static
lazy_static::lazy_static! {
    static ref SESSION_CACHE: RwLock<HashMap<String, CachedSession>> = RwLock::new(HashMap::new());
}

/// Check if a session is cached and still valid
fn get_cached_session(session_id: &str, file_info: &SessionFileInfo) -> Option<Vec<CompletedTurn>> {
    let cache = SESSION_CACHE.read().ok()?;
    let cached = cache.get(session_id)?;

    // Check if file has been modified
    if cached.last_modified == file_info.modified && cached.file_size == file_info.size {
        Some(cached.turns.clone())
    } else {
        None
    }
}

/// Store parsed session in cache
fn cache_session(session_id: &str, file_info: &SessionFileInfo, turns: Vec<CompletedTurn>) {
    if let Ok(mut cache) = SESSION_CACHE.write() {
        // Limit cache size to avoid memory issues
        if cache.len() > 100 {
            // Remove oldest entries (simple eviction - could be improved with LRU)
            let keys: Vec<String> = cache.keys().take(20).cloned().collect();
            for key in keys {
                cache.remove(&key);
            }
        }

        cache.insert(
            session_id.to_string(),
            CachedSession {
                last_modified: file_info.modified,
                file_size: file_info.size,
                turns,
            },
        );
    }
}

/// Clear the session cache
fn clear_cache() {
    if let Ok(mut cache) = SESSION_CACHE.write() {
        cache.clear();
    }
}

// ============================================================================
// Helper Functions
// ============================================================================

/// Initialize the database if needed
fn init_database(state: &AppState) -> Result<(), CommandError> {
    let mut db_lock = state.db.lock().unwrap();

    if db_lock.is_some() {
        return Ok(());
    }

    // Ensure directory exists
    let db_path = db::default_db_path();
    if let Some(parent) = db_path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| CommandError::Internal(e.to_string()))?;
    }

    // Create database
    let database = db::Database::new(db_path)?;
    database.initialize()?;

    *db_lock = Some(database);

    tracing::info!("Database initialized");
    Ok(())
}

/// Parse a session and get its turns, using cache when available
fn get_session_turns(session_id: &str) -> Result<(Vec<CompletedTurn>, SessionFileInfo), CommandError> {
    let file_info = find_session_by_id(session_id)
        .ok_or_else(|| CommandError::SessionNotFound(session_id.to_string()))?;

    // Try cache first
    if let Some(cached_turns) = get_cached_session(session_id, &file_info) {
        return Ok((cached_turns, file_info));
    }

    // Parse the session
    let (turns, _stats) = parse_session_by_id(session_id)
        .map_err(|e| CommandError::Internal(e.to_string()))?;

    // Cache the result
    cache_session(session_id, &file_info, turns.clone());

    Ok((turns, file_info))
}

/// Calculate metrics from parsed turns
fn calculate_metrics_from_turns(
    turns: &[CompletedTurn],
) -> (SessionTokens, CostBreakdown, HashSet<String>, HashSet<String>, u32, u32, u64) {
    let mut session_tokens = SessionTokens::new();
    let mut total_breakdown = CostBreakdown::default();
    let mut unique_tools: HashSet<String> = HashSet::new();
    let mut models: HashSet<String> = HashSet::new();
    let mut tool_count = 0u32;
    let mut subagent_count = 0u32;
    let mut duration_ms = 0u64;

    for turn in turns {
        // Aggregate tokens
        let turn_tokens = TurnTokens::new(
            turn.input_tokens,
            turn.output_tokens,
            turn.cache_read_tokens,
            turn.cache_write_5m_tokens,
            turn.cache_write_1h_tokens,
        );
        session_tokens.add_turn(&turn_tokens);

        // Calculate cost for this turn
        let model = turn.model.as_deref().unwrap_or("claude-opus-4-5-20251101");
        let turn_cost = calculate_turn_cost(&turn_tokens, model);
        total_breakdown.add(&turn_cost);

        // Track tools
        for tool in &turn.tool_uses {
            unique_tools.insert(tool.name.clone());
        }
        tool_count += turn.tool_count;

        // Track models
        if let Some(m) = &turn.model {
            models.insert(m.clone());
        }

        // Track subagents
        if turn.has_subagents {
            subagent_count += turn.subagent_ids.len() as u32;
        }

        // Accumulate duration
        if let Some(d) = turn.duration_ms {
            duration_ms += d as u64;
        }
    }

    (
        session_tokens,
        total_breakdown,
        unique_tools,
        models,
        tool_count,
        subagent_count,
        duration_ms,
    )
}

/// Convert CompletedTurn to TurnSummary response
fn turn_to_summary(turn: &CompletedTurn) -> TurnSummary {
    let turn_tokens = TurnTokens::new(
        turn.input_tokens,
        turn.output_tokens,
        turn.cache_read_tokens,
        turn.cache_write_5m_tokens,
        turn.cache_write_1h_tokens,
    );

    let model = turn.model.as_deref().unwrap_or("claude-opus-4-5-20251101");
    let cost = calculate_turn_cost(&turn_tokens, model);

    let tools_used: Vec<String> = turn.tool_uses.iter().map(|t| t.name.clone()).collect();

    TurnSummary {
        turn_number: turn.turn_number,
        started_at: turn.started_at.clone(),
        ended_at: turn.ended_at.clone(),
        duration_ms: turn.duration_ms,
        user_message: turn.user_message.clone(),
        assistant_message: turn.assistant_message.clone(),
        model: turn.model.clone(),
        tokens: TurnTokensResponse {
            input: turn.input_tokens,
            output: turn.output_tokens,
            cache_read: turn.cache_read_tokens,
            cache_write: turn.cache_write_5m_tokens + turn.cache_write_1h_tokens,
            total: turn.total_tokens,
        },
        cost: cost.total_cost,
        tool_count: turn.tool_count,
        tools_used,
        is_subagent: turn.has_subagents,
        stop_reason: turn.stop_reason.clone(),
    }
}

/// Extract project name from path
fn extract_project_name(path: &str) -> String {
    std::path::Path::new(path)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("Unknown")
        .to_string()
}

// ============================================================================
// Tauri Commands
// ============================================================================

/// Scan and get all sessions with basic metrics
#[tauri::command]
pub fn get_sessions(
    _state: tauri::State<'_, AppState>,
    limit: Option<i64>,
    offset: Option<i64>,
) -> Result<Vec<SessionSummary>, CommandError> {
    let limit = limit.unwrap_or(100) as usize;
    let offset = offset.unwrap_or(0) as usize;

    // Scan for all session files
    let sessions = scan_claude_sessions();

    // Apply pagination
    let paginated: Vec<SessionFileInfo> = sessions
        .into_iter()
        .skip(offset)
        .take(limit)
        .collect();

    // Process each session
    let mut summaries = Vec::new();

    for file_info in paginated {
        // Try to parse and get basic metrics
        let summary = match get_session_turns(&file_info.session_id) {
            Ok((turns, _)) => {
                let (
                    session_tokens,
                    total_breakdown,
                    _unique_tools,
                    models,
                    _tool_count,
                    _subagent_count,
                    duration_ms,
                ) = calculate_metrics_from_turns(&turns);

                let started_at = turns.first().map(|t| t.started_at.clone());
                let last_activity = turns.last().and_then(|t| t.ended_at.clone());
                let model = models.into_iter().next();

                SessionSummary {
                    id: file_info.session_id.clone(),
                    project_path: file_info.project_path.clone().unwrap_or_default(),
                    project_name: extract_project_name(
                        &file_info.project_path.clone().unwrap_or_default(),
                    ),
                    started_at: started_at.unwrap_or_else(|| "unknown".to_string()),
                    last_activity_at: last_activity,
                    model,
                    total_cost: total_breakdown.total_cost,
                    total_turns: turns.len() as u32,
                    total_tokens: session_tokens.total(),
                    duration_ms,
                    is_subagent: file_info.is_subagent,
                    file_path: file_info.path.to_string_lossy().to_string(),
                }
            }
            Err(_) => {
                // If parsing fails, return basic info from file metadata
                SessionSummary {
                    id: file_info.session_id.clone(),
                    project_path: file_info.project_path.clone().unwrap_or_default(),
                    project_name: extract_project_name(
                        &file_info.project_path.clone().unwrap_or_default(),
                    ),
                    started_at: "unknown".to_string(),
                    last_activity_at: None,
                    model: None,
                    total_cost: 0.0,
                    total_turns: 0,
                    total_tokens: 0,
                    duration_ms: 0,
                    is_subagent: file_info.is_subagent,
                    file_path: file_info.path.to_string_lossy().to_string(),
                }
            }
        };

        summaries.push(summary);
    }

    Ok(summaries)
}

/// Get a single session by ID with full details
#[tauri::command]
pub fn get_session(
    _state: tauri::State<'_, AppState>,
    id: String,
) -> Result<Option<SessionDetail>, CommandError> {
    let file_info = match find_session_by_id(&id) {
        Some(f) => f,
        None => return Ok(None),
    };

    let (turns, _) = get_session_turns(&id)?;

    if turns.is_empty() {
        return Ok(None);
    }

    let (
        session_tokens,
        total_breakdown,
        unique_tools,
        models,
        tool_count,
        subagent_count,
        duration_ms,
    ) = calculate_metrics_from_turns(&turns);

    // Calculate full metrics
    let deliverable_units = estimate_deliverable_units(session_tokens.total_output);
    let turn_count = turns.len() as u32;

    let metrics_input = SessionMetricsInput {
        tokens: session_tokens.clone(),
        total_cost: total_breakdown.total_cost,
        cost_breakdown: total_breakdown.clone(),
        duration_ms,
        turn_count,
        tool_count,
        unique_tools: unique_tools.clone(),
        models_used: models.clone(),
        subagent_count,
        subagent_cost: 0.0, // TODO: Calculate from subagent sessions
        deliverable_units,
        rework_cycles: 0, // TODO: Detect rework patterns
        clarification_cycles: 0,
    };

    let full_metrics = calculate_session_metrics(metrics_input);

    let started_at = turns.first().map(|t| t.started_at.clone());
    let last_activity = turns.last().and_then(|t| t.ended_at.clone());
    let model = models.into_iter().next();

    let metrics = SessionMetricsResponse {
        tokens: TokenSummaryResponse {
            input: full_metrics.tokens.input,
            output: full_metrics.tokens.output,
            cache_read: full_metrics.tokens.cache_read,
            cache_write_5m: full_metrics.tokens.cache_write_5m,
            cache_write_1h: full_metrics.tokens.cache_write_1h,
            total: full_metrics.tokens.total,
            context_used_pct: full_metrics.tokens.context_used_pct,
        },
        cost: CostSummaryResponse {
            input_cost: full_metrics.cost.input_cost,
            output_cost: full_metrics.cost.output_cost,
            cache_read_cost: full_metrics.cost.cache_read_cost,
            cache_write_cost: full_metrics.cost.cache_write_5m_cost
                + full_metrics.cost.cache_write_1h_cost,
            total_cost: full_metrics.cost.total_cost,
            avg_cost_per_turn: full_metrics.cost.avg_cost_per_turn,
        },
        efficiency: EfficiencyResponse {
            cer: full_metrics.efficiency.cer,
            cgr: full_metrics.efficiency.cgr,
            sei: full_metrics.efficiency.sei,
            wfs: full_metrics.efficiency.wfs,
            cpdu: full_metrics.efficiency.cpdu,
            cpd: full_metrics.efficiency.cpd,
            oes_score: full_metrics.efficiency.oes.overall,
            oes_grade: full_metrics.efficiency.oes.rating.label().to_string(),
        },
        duration_ms: full_metrics.duration_ms,
        turn_count: full_metrics.turn_count,
        tool_count: full_metrics.tool_count,
        unique_tools: full_metrics.unique_tools,
        models_used: full_metrics.models_used,
        subagent_count,
    };

    Ok(Some(SessionDetail {
        id: file_info.session_id.clone(),
        project_path: file_info.project_path.clone().unwrap_or_default(),
        project_name: extract_project_name(&file_info.project_path.clone().unwrap_or_default()),
        started_at: started_at.unwrap_or_else(|| "unknown".to_string()),
        last_activity_at: last_activity,
        model,
        is_subagent: file_info.is_subagent,
        file_path: file_info.path.to_string_lossy().to_string(),
        metrics,
    }))
}

/// Get the database path
#[tauri::command]
pub fn get_db_path(state: tauri::State<'_, AppState>) -> Result<String, CommandError> {
    init_database(&state)?;

    let db_lock = state.db.lock().unwrap();
    let db = db_lock.as_ref().ok_or(CommandError::NotInitialized)?;

    Ok(db.path().to_string_lossy().to_string())
}

/// Get session metrics by ID
#[tauri::command]
pub fn get_session_metrics(
    _state: tauri::State<'_, AppState>,
    id: String,
) -> Result<Option<SessionMetricsResponse>, CommandError> {
    // Get the session detail which includes metrics
    let detail = get_session(_state, id)?;
    Ok(detail.map(|d| d.metrics))
}

/// Get turns for a session with pagination
#[tauri::command]
pub fn get_turns(
    _state: tauri::State<'_, AppState>,
    session_id: String,
    limit: Option<i64>,
    offset: Option<i64>,
) -> Result<Vec<TurnSummary>, CommandError> {
    let limit = limit.unwrap_or(100) as usize;
    let offset = offset.unwrap_or(0) as usize;

    let (turns, _) = get_session_turns(&session_id)?;

    let paginated: Vec<TurnSummary> = turns
        .into_iter()
        .skip(offset)
        .take(limit)
        .map(|t| turn_to_summary(&t))
        .collect();

    Ok(paginated)
}

/// Force refresh of session cache
#[tauri::command]
pub fn refresh_sessions() -> Result<(), CommandError> {
    clear_cache();
    tracing::info!("Session cache cleared");
    Ok(())
}

/// Get a quick count of available sessions
#[tauri::command]
pub fn get_session_count() -> Result<u32, CommandError> {
    let sessions = scan_claude_sessions();
    Ok(sessions.len() as u32)
}

/// Scan for new sessions and return any newly discovered ones
#[tauri::command]
pub fn scan_new_sessions(
    known_ids: Vec<String>,
) -> Result<Vec<SessionSummary>, CommandError> {
    let sessions = scan_claude_sessions();
    let known_set: HashSet<String> = known_ids.into_iter().collect();

    let new_sessions: Vec<SessionFileInfo> = sessions
        .into_iter()
        .filter(|s| !known_set.contains(&s.session_id))
        .collect();

    let mut summaries = Vec::new();

    for file_info in new_sessions {
        let summary = match get_session_turns(&file_info.session_id) {
            Ok((turns, _)) => {
                let (
                    session_tokens,
                    total_breakdown,
                    _unique_tools,
                    models,
                    _tool_count,
                    _subagent_count,
                    duration_ms,
                ) = calculate_metrics_from_turns(&turns);

                let started_at = turns.first().map(|t| t.started_at.clone());
                let last_activity = turns.last().and_then(|t| t.ended_at.clone());
                let model = models.into_iter().next();

                SessionSummary {
                    id: file_info.session_id.clone(),
                    project_path: file_info.project_path.clone().unwrap_or_default(),
                    project_name: extract_project_name(
                        &file_info.project_path.clone().unwrap_or_default(),
                    ),
                    started_at: started_at.unwrap_or_else(|| "unknown".to_string()),
                    last_activity_at: last_activity,
                    model,
                    total_cost: total_breakdown.total_cost,
                    total_turns: turns.len() as u32,
                    total_tokens: session_tokens.total(),
                    duration_ms,
                    is_subagent: file_info.is_subagent,
                    file_path: file_info.path.to_string_lossy().to_string(),
                }
            }
            Err(_) => continue,
        };

        summaries.push(summary);
    }

    Ok(summaries)
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_project_name() {
        assert_eq!(
            extract_project_name("/Users/user/Projects/myapp"),
            "myapp"
        );
        assert_eq!(extract_project_name("/some/path/project"), "project");
        assert_eq!(extract_project_name(""), "Unknown");
    }

    #[test]
    fn test_token_summary_response_serialization() {
        let summary = TokenSummaryResponse {
            input: 1000,
            output: 500,
            cache_read: 2000,
            cache_write_5m: 100,
            cache_write_1h: 50,
            total: 1500,
            context_used_pct: 1.5,
        };

        let json = serde_json::to_string(&summary).unwrap();
        assert!(json.contains("\"input\":1000"));
        assert!(json.contains("\"context_used_pct\":1.5"));
    }

    #[test]
    fn test_session_summary_serialization() {
        let summary = SessionSummary {
            id: "test-123".to_string(),
            project_path: "/path/to/project".to_string(),
            project_name: "project".to_string(),
            started_at: "2026-01-14T07:44:28.531Z".to_string(),
            last_activity_at: Some("2026-01-14T08:00:00.000Z".to_string()),
            model: Some("claude-opus-4-5-20251101".to_string()),
            total_cost: 5.25,
            total_turns: 10,
            total_tokens: 50000,
            duration_ms: 900000,
            is_subagent: false,
            file_path: "/path/to/file.jsonl".to_string(),
        };

        let json = serde_json::to_string(&summary).unwrap();
        assert!(json.contains("\"id\":\"test-123\""));
        assert!(json.contains("\"total_cost\":5.25"));
    }

    #[test]
    fn test_turn_summary_serialization() {
        let turn = TurnSummary {
            turn_number: 1,
            started_at: "2026-01-14T07:44:28.531Z".to_string(),
            ended_at: Some("2026-01-14T07:44:30.000Z".to_string()),
            duration_ms: Some(1469),
            user_message: Some("Hello".to_string()),
            assistant_message: Some("Hi there!".to_string()),
            model: Some("claude-opus-4-5-20251101".to_string()),
            tokens: TurnTokensResponse {
                input: 100,
                output: 50,
                cache_read: 1000,
                cache_write: 500,
                total: 150,
            },
            cost: 0.15,
            tool_count: 2,
            tools_used: vec!["Read".to_string(), "Bash".to_string()],
            is_subagent: false,
            stop_reason: Some("end_turn".to_string()),
        };

        let json = serde_json::to_string(&turn).unwrap();
        assert!(json.contains("\"turn_number\":1"));
        assert!(json.contains("\"tools_used\":[\"Read\",\"Bash\"]"));
    }
}

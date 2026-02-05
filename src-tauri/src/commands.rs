//! Tauri command handlers
//!
//! All IPC commands exposed to the frontend.
//! These commands use the real parser and metrics calculators
//! instead of relying solely on database queries.

use std::collections::{HashMap, HashSet};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::RwLock;
use std::time::{Instant, SystemTime};

use serde::Serialize;

use crate::db;
use crate::metrics::cost::{calculate_turn_cost, CostBreakdown};
use crate::metrics::session::{
    calculate_session_metrics, estimate_deliverable_units, SessionMetricsInput,
};
use crate::metrics::tokens::{SessionTokens, TurnTokens};
use crate::export::{
    ExportFormat, ExportOptions, ExportableSession, ExportableTrend, ExportableTurn,
    csv_export, json_export, get_export_directory, generate_export_filename,
};
use crate::parser::{
    find_session_by_id, parse_session_by_id, scan_claude_sessions, CompletedTurn, SessionFileInfo,
};
use crate::recommendations::{
    engine::{generate_recommendations, generate_aggregate_recommendations},
    types::{RecommendationInput, RecommendationSummary},
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

/// Subagent summary for detailed subagent tracking
#[derive(Debug, Clone, Serialize)]
pub struct SubagentSummary {
    pub agent_id: String,
    pub slug: Option<String>,
    pub turn_count: u32,
    pub total_cost: f64,
    pub total_tokens: u64,
    pub tools_used: Vec<String>,
}

/// Session comparison result
#[derive(Debug, Clone, Serialize)]
pub struct SessionComparison {
    pub sessions: Vec<SessionSummary>,
    pub metrics_comparison: MetricsComparison,
}

/// Metrics comparison between sessions
#[derive(Debug, Clone, Serialize)]
pub struct MetricsComparison {
    pub cost_diff: f64,
    pub token_diff: i64,
    pub efficiency_diff: f64,
    pub duration_diff: i64,
}

/// Code change tracked during a session
#[derive(Debug, Clone, Serialize)]
pub struct CodeChange {
    pub file_path: String,
    pub change_type: String,  // "create", "edit", "delete"
    pub tool_name: String,    // "Write", "Edit", "Bash"
    pub turn_number: u32,
    pub timestamp: String,
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

/// Cached session list with pre-computed summaries
struct SessionListCache {
    /// When the cache was last refreshed
    last_refresh: Instant,
    /// Cached session file infos
    sessions: Vec<SessionFileInfo>,
    /// Pre-computed session summaries (keyed by session ID)
    summaries: HashMap<String, SessionSummary>,
}

impl SessionListCache {
    fn new() -> Self {
        Self {
            last_refresh: Instant::now() - std::time::Duration::from_secs(3600), // Force initial refresh
            sessions: Vec::new(),
            summaries: HashMap::new(),
        }
    }
}

// Cache validity duration (30 seconds - can be tuned)
const SESSION_LIST_CACHE_TTL_SECS: u64 = 30;

// Global session cache using lazy_static
lazy_static::lazy_static! {
    static ref SESSION_CACHE: RwLock<HashMap<String, CachedSession>> = RwLock::new(HashMap::new());
    static ref SESSION_LIST_CACHE: RwLock<SessionListCache> = RwLock::new(SessionListCache::new());
}

/// Flag to track if initial preload is complete
static SESSIONS_PRELOADED: AtomicBool = AtomicBool::new(false);

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
        // Limit cache size to avoid memory issues (500 sessions covers most preloaded data)
        if cache.len() > 500 {
            // Remove oldest entries (simple eviction - could be improved with LRU)
            let keys: Vec<String> = cache.keys().take(50).cloned().collect();
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

/// Clear all caches (turn cache and session list cache)
fn clear_all_caches() {
    clear_cache();
    if let Ok(mut list_cache) = SESSION_LIST_CACHE.write() {
        list_cache.sessions.clear();
        list_cache.summaries.clear();
        list_cache.last_refresh = Instant::now() - std::time::Duration::from_secs(3600);
    }
    SESSIONS_PRELOADED.store(false, Ordering::SeqCst);
}

/// Get cached session list, refreshing if stale
fn get_cached_session_list() -> Vec<SessionFileInfo> {
    // Check if cache is valid
    {
        let cache = SESSION_LIST_CACHE.read().ok();
        if let Some(c) = cache {
            let elapsed = c.last_refresh.elapsed().as_secs();
            if elapsed < SESSION_LIST_CACHE_TTL_SECS && !c.sessions.is_empty() {
                return c.sessions.clone();
            }
        }
    }

    // Refresh the cache
    let sessions = scan_claude_sessions();
    if let Ok(mut cache) = SESSION_LIST_CACHE.write() {
        cache.sessions = sessions.clone();
        cache.last_refresh = Instant::now();
    }
    sessions
}

/// Get or compute a session summary from cache
fn get_cached_summary(session: &SessionFileInfo) -> SessionSummary {
    // Check if we have a cached summary
    {
        let cache = SESSION_LIST_CACHE.read().ok();
        if let Some(c) = cache {
            if let Some(summary) = c.summaries.get(&session.session_id) {
                return summary.clone();
            }
        }
    }

    // Compute the summary
    let summary = compute_session_summary(session);

    // Cache it
    if let Ok(mut cache) = SESSION_LIST_CACHE.write() {
        cache.summaries.insert(session.session_id.clone(), summary.clone());
    }

    summary
}

/// Compute session summary from session file info
fn compute_session_summary(file_info: &SessionFileInfo) -> SessionSummary {
    match get_session_turns(&file_info.session_id) {
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

    // Calculate session duration from first and last timestamps
    if !turns.is_empty() {
        let first_timestamp = &turns[0].started_at;
        // Get the last ended_at timestamp, or fall back to the last started_at
        let last_timestamp = turns
            .iter()
            .rev()
            .find_map(|t| t.ended_at.as_ref())
            .unwrap_or(&turns.last().unwrap().started_at);

        if let (Ok(start), Ok(end)) = (
            chrono::DateTime::parse_from_rfc3339(first_timestamp),
            chrono::DateTime::parse_from_rfc3339(last_timestamp),
        ) {
            let diff = (end - start).num_milliseconds();
            if diff > 0 {
                duration_ms = diff as u64;
            }
        }
    }

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
/// Uses cached session list and summaries for fast response
#[tauri::command]
pub async fn get_sessions(
    _state: tauri::State<'_, AppState>,
    limit: Option<i64>,
    offset: Option<i64>,
) -> Result<Vec<SessionSummary>, CommandError> {
    let limit = limit.unwrap_or(100) as usize;
    let offset = offset.unwrap_or(0) as usize;

    // Use cached session list
    let sessions = get_cached_session_list();

    // Apply pagination
    let paginated: Vec<SessionFileInfo> = sessions
        .into_iter()
        .skip(offset)
        .take(limit)
        .collect();

    // Get or compute summaries from cache
    let summaries: Vec<SessionSummary> = paginated
        .iter()
        .map(|file_info| get_cached_summary(file_info))
        .collect();

    Ok(summaries)
}

/// Get a single session by ID with full details
#[tauri::command]
pub async fn get_session(
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
pub async fn get_db_path(state: tauri::State<'_, AppState>) -> Result<String, CommandError> {
    init_database(&state)?;

    let db_lock = state.db.lock().unwrap();
    let db = db_lock.as_ref().ok_or(CommandError::NotInitialized)?;

    Ok(db.path().to_string_lossy().to_string())
}

/// Get session metrics by ID
#[tauri::command]
pub async fn get_session_metrics(
    _state: tauri::State<'_, AppState>,
    id: String,
) -> Result<Option<SessionMetricsResponse>, CommandError> {
    // Get the session detail which includes metrics
    let detail: Option<SessionDetail> = get_session(_state, id).await?;
    Ok(detail.map(|d| d.metrics))
}

/// Get turns for a session with pagination
#[tauri::command]
pub async fn get_turns(
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
pub async fn refresh_sessions() -> Result<(), CommandError> {
    clear_all_caches();
    tracing::info!("All session caches cleared");
    Ok(())
}

/// Get a quick count of available sessions
#[tauri::command]
pub async fn get_session_count() -> Result<u32, CommandError> {
    let sessions = get_cached_session_list();
    Ok(sessions.len() as u32)
}

/// Scan for new sessions and return any newly discovered ones
#[tauri::command]
pub async fn scan_new_sessions(
    known_ids: Vec<String>,
) -> Result<Vec<SessionSummary>, CommandError> {
    // Force a fresh scan for new sessions
    let sessions = scan_claude_sessions();
    let known_set: HashSet<String> = known_ids.into_iter().collect();

    let new_sessions: Vec<SessionFileInfo> = sessions
        .into_iter()
        .filter(|s| !known_set.contains(&s.session_id))
        .collect();

    // Update the cache with new sessions
    if !new_sessions.is_empty() {
        if let Ok(mut cache) = SESSION_LIST_CACHE.write() {
            for session in &new_sessions {
                if !cache.sessions.iter().any(|s| s.session_id == session.session_id) {
                    cache.sessions.push(session.clone());
                }
            }
            // Re-sort by modification time
            cache.sessions.sort_by(|a, b| b.modified.cmp(&a.modified));
        }
    }

    // Get summaries using cache
    let summaries: Vec<SessionSummary> = new_sessions
        .iter()
        .filter_map(|file_info| {
            match get_session_turns(&file_info.session_id) {
                Ok(_) => Some(get_cached_summary(file_info)),
                Err(_) => None,
            }
        })
        .collect();

    Ok(summaries)
}

/// Preload all sessions into cache at startup
/// Returns the count of sessions loaded
#[tauri::command]
pub async fn preload_all_sessions() -> Result<u32, CommandError> {
    if SESSIONS_PRELOADED.load(Ordering::SeqCst) {
        // Already preloaded, return current count
        let sessions = get_cached_session_list();
        return Ok(sessions.len() as u32);
    }

    tracing::info!("Preloading all sessions into cache...");
    let start = Instant::now();

    // Scan for sessions
    let sessions = scan_claude_sessions();
    let count = sessions.len();

    // Precompute summaries for all sessions (or just the most recent ones)
    let preload_limit = 500; // Preload up to 500 most recent sessions
    let preload_count = std::cmp::min(preload_limit, sessions.len());

    // Update the session list cache first
    if let Ok(mut cache) = SESSION_LIST_CACHE.write() {
        cache.sessions = sessions;
        cache.last_refresh = Instant::now();
    }

    // Now compute and cache summaries from the cached list
    let cached_sessions = get_cached_session_list();
    for session in cached_sessions.iter().take(preload_limit) {
        let _ = get_cached_summary(session);
    }

    SESSIONS_PRELOADED.store(true, Ordering::SeqCst);
    let elapsed = start.elapsed();
    tracing::info!(
        "Preloaded {} sessions ({} cached summaries) in {:?}",
        count,
        preload_count,
        elapsed
    );

    Ok(count as u32)
}

/// Get sessions filtered by date range efficiently
/// Uses cached summaries and filters in memory
#[tauri::command]
pub async fn get_sessions_filtered(
    _state: tauri::State<'_, AppState>,
    start_date: Option<String>,
    end_date: Option<String>,
    limit: Option<i64>,
    offset: Option<i64>,
) -> Result<Vec<SessionSummary>, CommandError> {
    let limit = limit.unwrap_or(100) as usize;
    let offset = offset.unwrap_or(0) as usize;

    // Use cached session list
    let sessions = get_cached_session_list();

    // Get summaries and filter by date
    let summaries: Vec<SessionSummary> = sessions
        .iter()
        .map(|file_info| get_cached_summary(file_info))
        .filter(|summary| {
            // Filter by date range if provided
            if summary.started_at == "unknown" {
                return true; // Include sessions with unknown dates
            }

            let session_date = &summary.started_at[..10]; // Extract YYYY-MM-DD

            if let Some(ref start) = start_date {
                if session_date < start.as_str() {
                    return false;
                }
            }
            if let Some(ref end) = end_date {
                if session_date > end.as_str() {
                    return false;
                }
            }
            true
        })
        .skip(offset)
        .take(limit)
        .collect();

    Ok(summaries)
}

/// Get subagent details for a session
///
/// Returns information about all subagents spawned during the session,
/// including their costs, tokens, and tools used.
#[tauri::command]
pub async fn get_session_subagents(
    _state: tauri::State<'_, AppState>,
    session_id: String,
) -> Result<Vec<SubagentSummary>, CommandError> {
    let (turns, _) = get_session_turns(&session_id)?;

    // Collect all subagent IDs from the session turns
    let mut subagent_info: HashMap<String, SubagentSummary> = HashMap::new();

    for turn in &turns {
        for agent_id in &turn.subagent_ids {
            let entry = subagent_info.entry(agent_id.clone()).or_insert_with(|| {
                SubagentSummary {
                    agent_id: agent_id.clone(),
                    slug: None,
                    turn_count: 0,
                    total_cost: 0.0,
                    total_tokens: 0,
                    tools_used: Vec::new(),
                }
            });

            entry.turn_count += 1;

            // Add tools from this turn
            for tool in &turn.tool_uses {
                if !entry.tools_used.contains(&tool.name) {
                    entry.tools_used.push(tool.name.clone());
                }
            }
        }
    }

    // Try to load actual subagent session files for detailed metrics
    let all_sessions = get_cached_session_list();
    for session in all_sessions {
        if session.is_subagent {
            // Check if this subagent belongs to our session
            if let Some(entry) = subagent_info.get_mut(&session.session_id) {
                // Parse the subagent session for detailed metrics
                if let Ok((subagent_turns, _)) = get_session_turns(&session.session_id) {
                    let (
                        session_tokens,
                        total_breakdown,
                        unique_tools,
                        _models,
                        _tool_count,
                        _subagent_count,
                        _duration_ms,
                    ) = calculate_metrics_from_turns(&subagent_turns);

                    entry.total_cost = total_breakdown.total_cost;
                    entry.total_tokens = session_tokens.total();
                    entry.turn_count = subagent_turns.len() as u32;
                    entry.tools_used = unique_tools.into_iter().collect();
                }
            }
        }
    }

    Ok(subagent_info.into_values().collect())
}

/// Compare multiple sessions
///
/// Returns the sessions with their metrics and a comparison of key metrics
/// between the first session and subsequent sessions.
#[tauri::command]
pub async fn compare_sessions(
    _state: tauri::State<'_, AppState>,
    session_ids: Vec<String>,
) -> Result<SessionComparison, CommandError> {
    if session_ids.is_empty() {
        return Err(CommandError::Internal("No sessions provided for comparison".to_string()));
    }

    let mut summaries = Vec::new();
    let mut metrics_data: Vec<(f64, u64, f64, u64)> = Vec::new(); // (cost, tokens, cer, duration)

    for id in &session_ids {
        let file_info = find_session_by_id(id)
            .ok_or_else(|| CommandError::SessionNotFound(id.to_string()))?;

        let (turns, _) = get_session_turns(id)?;

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

        // Calculate CER for efficiency comparison
        let total_tokens_val = session_tokens.total();
        let cache_read = session_tokens.total_cache_read;
        let cache_write = session_tokens.total_cache_write_5m + session_tokens.total_cache_write_1h;
        let cer = if total_tokens_val > 0 {
            cache_read as f64 / (cache_read + cache_write + session_tokens.total_input + session_tokens.total_output) as f64
        } else {
            0.0
        };

        metrics_data.push((total_breakdown.total_cost, total_tokens_val, cer, duration_ms));

        summaries.push(SessionSummary {
            id: file_info.session_id.clone(),
            project_path: file_info.project_path.clone().unwrap_or_default(),
            project_name: extract_project_name(&file_info.project_path.clone().unwrap_or_default()),
            started_at: started_at.unwrap_or_else(|| "unknown".to_string()),
            last_activity_at: last_activity,
            model,
            total_cost: total_breakdown.total_cost,
            total_turns: turns.len() as u32,
            total_tokens: total_tokens_val,
            duration_ms,
            is_subagent: file_info.is_subagent,
            file_path: file_info.path.to_string_lossy().to_string(),
        });
    }

    // Calculate comparison metrics (difference between first and last session)
    let comparison = if metrics_data.len() >= 2 {
        let first = &metrics_data[0];
        let last = &metrics_data[metrics_data.len() - 1];

        MetricsComparison {
            cost_diff: last.0 - first.0,
            token_diff: last.1 as i64 - first.1 as i64,
            efficiency_diff: last.2 - first.2,
            duration_diff: last.3 as i64 - first.3 as i64,
        }
    } else {
        MetricsComparison {
            cost_diff: 0.0,
            token_diff: 0,
            efficiency_diff: 0.0,
            duration_diff: 0,
        }
    };

    Ok(SessionComparison {
        sessions: summaries,
        metrics_comparison: comparison,
    })
}

/// Get code changes made during a session
///
/// Analyzes tool uses to identify file operations (Write, Edit, Bash with file-modifying commands)
/// and returns a list of code changes with their metadata.
#[tauri::command]
pub async fn get_session_code_changes(
    _state: tauri::State<'_, AppState>,
    session_id: String,
) -> Result<Vec<CodeChange>, CommandError> {
    let (turns, _) = get_session_turns(&session_id)?;

    let mut changes = Vec::new();

    for turn in &turns {
        for tool in &turn.tool_uses {
            match tool.name.as_str() {
                "Write" | "write" => {
                    // Write tool creates or overwrites files
                    if let Some(input) = &tool.input {
                        if let Some(file_path) = input.get("file_path").and_then(|v| v.as_str()) {
                            changes.push(CodeChange {
                                file_path: file_path.to_string(),
                                change_type: "create".to_string(),
                                tool_name: "Write".to_string(),
                                turn_number: turn.turn_number,
                                timestamp: turn.started_at.clone(),
                            });
                        }
                    }
                }
                "Edit" | "edit" => {
                    // Edit tool modifies existing files
                    if let Some(input) = &tool.input {
                        if let Some(file_path) = input.get("file_path").and_then(|v| v.as_str()) {
                            changes.push(CodeChange {
                                file_path: file_path.to_string(),
                                change_type: "edit".to_string(),
                                tool_name: "Edit".to_string(),
                                turn_number: turn.turn_number,
                                timestamp: turn.started_at.clone(),
                            });
                        }
                    }
                }
                "Bash" | "bash" => {
                    // Bash tool might contain file operations
                    if let Some(input) = &tool.input {
                        if let Some(command) = input.get("command").and_then(|v| v.as_str()) {
                            // Check for common file operations
                            let file_ops = [
                                ("rm ", "delete"),
                                ("rm -", "delete"),
                                ("touch ", "create"),
                                ("mkdir ", "create"),
                                ("mv ", "edit"),
                                ("cp ", "create"),
                                ("echo ", "edit"),  // echo > file
                                ("cat >", "create"),
                            ];

                            for (pattern, change_type) in &file_ops {
                                if command.contains(pattern) {
                                    // Extract file path (simplified - takes first path-like argument)
                                    let parts: Vec<&str> = command.split_whitespace().collect();
                                    if let Some(file_path) = parts.iter().skip(1).find(|p| {
                                        p.starts_with('/') || p.starts_with('.') || p.contains('/')
                                    }) {
                                        changes.push(CodeChange {
                                            file_path: file_path.to_string(),
                                            change_type: change_type.to_string(),
                                            tool_name: "Bash".to_string(),
                                            turn_number: turn.turn_number,
                                            timestamp: turn.started_at.clone(),
                                        });
                                    }
                                    break;
                                }
                            }
                        }
                    }
                }
                "NotebookEdit" | "notebook_edit" => {
                    // NotebookEdit modifies Jupyter notebooks
                    if let Some(input) = &tool.input {
                        if let Some(notebook_path) = input.get("notebook_path").and_then(|v| v.as_str()) {
                            changes.push(CodeChange {
                                file_path: notebook_path.to_string(),
                                change_type: "edit".to_string(),
                                tool_name: "NotebookEdit".to_string(),
                                turn_number: turn.turn_number,
                                timestamp: turn.started_at.clone(),
                            });
                        }
                    }
                }
                _ => {}
            }
        }
    }

    Ok(changes)
}

// ============================================================================
// Export Commands
// ============================================================================

/// Export sessions to CSV or JSON format
///
/// Returns the file path of the exported file.
#[tauri::command]
pub async fn export_sessions(
    _state: tauri::State<'_, AppState>,
    session_ids: Option<Vec<String>>,
    options: ExportOptions,
) -> Result<String, CommandError> {
    let format = ExportFormat::from_str(&options.format)?;

    // Get sessions to export from cache
    let all_sessions = get_cached_session_list();
    let sessions_to_export: Vec<SessionFileInfo> = if let Some(ids) = session_ids {
        let id_set: HashSet<String> = ids.into_iter().collect();
        all_sessions
            .into_iter()
            .filter(|s| id_set.contains(&s.session_id))
            .collect()
    } else {
        all_sessions
    };

    // Filter by date range if specified
    let sessions_to_export: Vec<SessionFileInfo> = if let Some((start, end)) = &options.date_range {
        sessions_to_export
            .into_iter()
            .filter(|s| {
                // Get session start date from parsing
                if let Ok((turns, _)) = get_session_turns(&s.session_id) {
                    if let Some(first_turn) = turns.first() {
                        let session_date = &first_turn.started_at;
                        return session_date >= start && session_date <= end;
                    }
                }
                true // Include if we can't determine date
            })
            .collect()
    } else {
        sessions_to_export
    };

    // Convert to exportable format
    let mut exportable_sessions: Vec<ExportableSession> = Vec::new();
    let mut turns_map: HashMap<String, Vec<ExportableTurn>> = HashMap::new();

    for file_info in &sessions_to_export {
        match get_session_turns(&file_info.session_id) {
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
                let model = models.into_iter().next();

                let mut exportable = ExportableSession {
                    session_id: file_info.session_id.clone(),
                    date: started_at.unwrap_or_else(|| "unknown".to_string()),
                    project_name: extract_project_name(
                        &file_info.project_path.clone().unwrap_or_default(),
                    ),
                    model,
                    turns: turns.len() as u32,
                    tokens: session_tokens.total(),
                    cost: total_breakdown.total_cost,
                    duration_ms,
                    efficiency_score: None,
                };

                // Add efficiency score if metrics requested
                if options.include_metrics && !turns.is_empty() {
                    // Calculate CER as efficiency score using correct formula:
                    // CER = cache_read / (cache_read + cache_write)
                    let total_cache = session_tokens.total_cache();
                    if total_cache > 0 {
                        let cer = session_tokens.total_cache_read as f64 / total_cache as f64;
                        exportable.efficiency_score = Some(cer);
                    }
                }

                // Collect turns if requested
                if options.include_turns {
                    let exportable_turns: Vec<ExportableTurn> = turns
                        .iter()
                        .map(|t| ExportableTurn::from_turn_summary(&file_info.session_id, &turn_to_summary(t)))
                        .collect();
                    turns_map.insert(file_info.session_id.clone(), exportable_turns);
                }

                exportable_sessions.push(exportable);
            }
            Err(_) => continue,
        }
    }

    // Generate export path
    let export_dir = get_export_directory();
    let filename = generate_export_filename("claude_sessions", format.extension());
    let export_path = export_dir.join(&filename);

    // Write to file
    match format {
        ExportFormat::Csv => {
            if options.include_turns && !turns_map.is_empty() {
                csv_export::write_combined_csv(&exportable_sessions, &turns_map, &export_path)?;
            } else {
                csv_export::write_sessions_csv(&exportable_sessions, &export_path)?;
            }
        }
        ExportFormat::Json => {
            let turns_ref = if options.include_turns {
                Some(&turns_map)
            } else {
                None
            };
            json_export::write_sessions_json(&exportable_sessions, turns_ref, options.include_metrics, &export_path)?;
        }
    }

    tracing::info!("Exported {} sessions to {}", exportable_sessions.len(), export_path.display());

    Ok(export_path.to_string_lossy().to_string())
}

/// Export usage trends to CSV or JSON format
///
/// Aggregates session data by day for the specified number of days.
/// Returns the file path of the exported file.
#[tauri::command]
pub async fn export_trends(
    _state: tauri::State<'_, AppState>,
    days: u32,
    format: String,
) -> Result<String, CommandError> {
    let export_format = ExportFormat::from_str(&format)?;

    // Calculate the date range
    let end_date = chrono::Utc::now();
    let start_date = end_date - chrono::Duration::days(days as i64);

    // Get all sessions from cache
    let all_sessions = get_cached_session_list();

    // Group sessions by date and aggregate metrics
    let mut daily_data: HashMap<String, ExportableTrend> = HashMap::new();

    for file_info in &all_sessions {
        if let Ok((turns, _)) = get_session_turns(&file_info.session_id) {
            if turns.is_empty() {
                continue;
            }

            // Get session date
            let session_date = turns.first().map(|t| &t.started_at).unwrap();

            // Parse date and check if in range
            if let Ok(parsed) = chrono::DateTime::parse_from_rfc3339(session_date) {
                let utc_date = parsed.with_timezone(&chrono::Utc);
                if utc_date < start_date || utc_date > end_date {
                    continue;
                }

                let date_key = utc_date.format("%Y-%m-%d").to_string();

                let (
                    session_tokens,
                    total_breakdown,
                    _unique_tools,
                    _models,
                    _tool_count,
                    _subagent_count,
                    _duration_ms,
                ) = calculate_metrics_from_turns(&turns);

                // Calculate CER efficiency using correct formula:
                // CER = cache_read / (cache_read + cache_write)
                let total_tokens = session_tokens.total();
                let total_cache = session_tokens.total_cache();
                let efficiency = if total_cache > 0 {
                    Some(session_tokens.total_cache_read as f64 / total_cache as f64)
                } else {
                    None
                };

                let entry = daily_data.entry(date_key.clone()).or_insert_with(|| {
                    ExportableTrend {
                        date: date_key,
                        session_count: 0,
                        total_turns: 0,
                        total_cost: 0.0,
                        total_tokens: 0,
                        avg_efficiency_score: None,
                    }
                });

                entry.session_count += 1;
                entry.total_turns += turns.len() as i32;
                entry.total_cost += total_breakdown.total_cost;
                entry.total_tokens += total_tokens as i64;

                // Running average for efficiency
                if let Some(eff) = efficiency {
                    let current_avg = entry.avg_efficiency_score.unwrap_or(0.0);
                    let count = entry.session_count as f64;
                    entry.avg_efficiency_score = Some((current_avg * (count - 1.0) + eff) / count);
                }
            }
        }
    }

    // Sort by date
    let mut trends: Vec<ExportableTrend> = daily_data.into_values().collect();
    trends.sort_by(|a, b| a.date.cmp(&b.date));

    // Generate export path
    let export_dir = get_export_directory();
    let filename = generate_export_filename("claude_trends", export_format.extension());
    let export_path = export_dir.join(&filename);

    // Write to file
    match export_format {
        ExportFormat::Csv => {
            csv_export::write_trends_csv(&trends, &export_path)?;
        }
        ExportFormat::Json => {
            json_export::write_trends_json(&trends, days, &export_path)?;
        }
    }

    tracing::info!("Exported {} days of trends to {}", trends.len(), export_path.display());

    Ok(export_path.to_string_lossy().to_string())
}

// ============================================================================
// Trend Commands
// ============================================================================

use crate::trends::{DailyTrend, TrendSummary, Granularity};
use crate::trends::daily::{SessionData, calculate_trend_summary, get_daily_trends};

/// Helper to convert sessions to trend data using cached session list
fn collect_session_trend_data() -> Vec<SessionData> {
    let all_sessions = get_cached_session_list();
    let mut session_data = Vec::new();

    for file_info in &all_sessions {
        if let Ok((turns, _)) = get_session_turns(&file_info.session_id) {
            if turns.is_empty() {
                continue;
            }

            let (
                session_tokens,
                total_breakdown,
                _unique_tools,
                _models,
                _tool_count,
                _subagent_count,
                _duration_ms,
            ) = calculate_metrics_from_turns(&turns);

            // Calculate efficiency (CER) using correct formula:
            // CER = cache_read / (cache_read + cache_write)
            let total_tokens = session_tokens.total();
            let total_cache = session_tokens.total_cache();
            let efficiency = if total_cache > 0 {
                session_tokens.total_cache_read as f64 / total_cache as f64
            } else {
                0.0
            };

            let started_at = turns.first().map(|t| t.started_at.clone()).unwrap_or_default();

            session_data.push(SessionData {
                started_at,
                turns: turns.len() as u32,
                tokens: total_tokens,
                cost: total_breakdown.total_cost,
                efficiency,
            });
        }
    }

    session_data
}

/// Get historical trends with optional date range and granularity
///
/// Returns aggregated session data with period-over-period comparisons.
#[tauri::command]
pub async fn get_trends(
    _state: tauri::State<'_, AppState>,
    start_date: Option<String>,
    end_date: Option<String>,
    granularity: Option<String>,
) -> Result<TrendSummary, String> {
    let session_data = collect_session_trend_data();
    let days = 30u32; // Default to 30 days if no date range specified

    let summary = calculate_trend_summary(
        &session_data,
        start_date.as_deref(),
        end_date.as_deref(),
        days,
    );

    // Apply granularity transformation if needed
    let _granularity = Granularity::from(granularity);

    Ok(summary)
}

/// Get cost trend for the last N days
///
/// Returns daily cost data for chart visualization.
#[tauri::command]
pub async fn get_cost_trend(
    _state: tauri::State<'_, AppState>,
    days: Option<u32>,
) -> Result<Vec<DailyTrend>, String> {
    let days = days.unwrap_or(30);
    let session_data = collect_session_trend_data();

    let daily = get_daily_trends(&session_data, days, None, None);

    Ok(daily)
}

/// Get efficiency trend for the last N days
///
/// Returns daily efficiency data for chart visualization.
#[tauri::command]
pub async fn get_efficiency_trend(
    _state: tauri::State<'_, AppState>,
    days: Option<u32>,
) -> Result<Vec<DailyTrend>, String> {
    let days = days.unwrap_or(30);
    let session_data = collect_session_trend_data();

    let daily = get_daily_trends(&session_data, days, None, None);

    Ok(daily)
}

// ============================================================================
// Recommendations Commands
// ============================================================================

/// Get recommendations for cost savings and efficiency improvements
///
/// Analyzes session metrics and generates actionable recommendations.
/// If session_id is None, analyzes all sessions for aggregate recommendations.
#[tauri::command]
pub async fn get_recommendations(
    _state: tauri::State<'_, AppState>,
    session_id: Option<String>,
    limit: Option<u32>,
) -> Result<RecommendationSummary, CommandError> {
    if let Some(id) = session_id {
        // Analyze single session
        get_session_recommendations(&id, limit)
    } else {
        // Analyze all sessions for aggregate recommendations
        get_aggregate_recommendations(limit)
    }
}

/// Get recommendations for a specific session
fn get_session_recommendations(
    session_id: &str,
    limit: Option<u32>,
) -> Result<RecommendationSummary, CommandError> {
    let file_info = find_session_by_id(session_id)
        .ok_or_else(|| CommandError::SessionNotFound(session_id.to_string()))?;

    let (turns, _) = get_session_turns(session_id)?;

    if turns.is_empty() {
        return Ok(RecommendationSummary::from_recommendations(
            Vec::new(),
            Some(session_id.to_string()),
            1,
        ));
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

    // Calculate full metrics for efficiency scores
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

    // Build recommendation input
    let primary_model = models.into_iter().next()
        .unwrap_or_else(|| "claude-opus-4-5-20251101".to_string());

    let rec_input = RecommendationInput {
        session_id: Some(session_id.to_string()),
        total_cost: total_breakdown.total_cost,
        cer: full_metrics.efficiency.cer,
        cgr: full_metrics.efficiency.cgr,
        sei: full_metrics.efficiency.sei,
        wfs: full_metrics.efficiency.wfs,
        oes: full_metrics.efficiency.oes.overall,
        turn_count,
        subagent_count,
        subagent_cost: 0.0, // TODO: Calculate from subagent sessions
        primary_model,
        input_tokens: session_tokens.total_input,
        output_tokens: session_tokens.total_output,
        cache_read_tokens: session_tokens.total_cache_read,
        cache_write_tokens: session_tokens.total_cache_write_5m + session_tokens.total_cache_write_1h,
        project_path: file_info.project_path.clone(),
        branch: None, // TODO: Extract from session data if available
        avg_cost_per_turn: full_metrics.cost.avg_cost_per_turn,
    };

    let mut summary = generate_recommendations(&rec_input);

    // Apply limit if specified
    if let Some(n) = limit {
        summary = summary.limit(n as usize);
    }

    Ok(summary)
}

/// Get aggregate recommendations across all sessions using cached data
fn get_aggregate_recommendations(limit: Option<u32>) -> Result<RecommendationSummary, CommandError> {
    let sessions = get_cached_session_list();

    if sessions.is_empty() {
        return Ok(RecommendationSummary::from_recommendations(Vec::new(), None, 0));
    }

    // Collect inputs from recent sessions (last 50 or fewer)
    let mut inputs = Vec::new();

    for file_info in sessions.iter().take(50) {
        if let Ok((turns, _)) = get_session_turns(&file_info.session_id) {
            if turns.is_empty() {
                continue;
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
                subagent_cost: 0.0,
                deliverable_units,
                rework_cycles: 0,
                clarification_cycles: 0,
            };

            let full_metrics = calculate_session_metrics(metrics_input);

            let primary_model = models.into_iter().next()
                .unwrap_or_else(|| "claude-opus-4-5-20251101".to_string());

            inputs.push(RecommendationInput {
                session_id: Some(file_info.session_id.clone()),
                total_cost: total_breakdown.total_cost,
                cer: full_metrics.efficiency.cer,
                cgr: full_metrics.efficiency.cgr,
                sei: full_metrics.efficiency.sei,
                wfs: full_metrics.efficiency.wfs,
                oes: full_metrics.efficiency.oes.overall,
                turn_count,
                subagent_count,
                subagent_cost: 0.0,
                primary_model,
                input_tokens: session_tokens.total_input,
                output_tokens: session_tokens.total_output,
                cache_read_tokens: session_tokens.total_cache_read,
                cache_write_tokens: session_tokens.total_cache_write_5m + session_tokens.total_cache_write_1h,
                project_path: file_info.project_path.clone(),
                branch: None,
                avg_cost_per_turn: full_metrics.cost.avg_cost_per_turn,
            });
        }
    }

    let mut summary = generate_aggregate_recommendations(&inputs);

    // Apply limit if specified
    if let Some(n) = limit {
        summary = summary.limit(n as usize);
    }

    Ok(summary)
}

// ============================================================================
// Dashboard Summary Commands (Efficient aggregation)
// ============================================================================

/// Dashboard summary response
#[derive(Debug, Clone, Serialize)]
pub struct DashboardSummaryResponse {
    pub total_sessions: u32,
    pub total_cost: f64,
    pub total_turns: u32,
    pub total_tokens: u64,
    pub avg_cost_per_session: f64,
    pub avg_turns_per_session: f64,
    pub avg_efficiency_score: Option<f64>,
    pub active_projects: u32,
}

/// Daily metrics response
#[derive(Debug, Clone, Serialize)]
pub struct DailyMetricsResponse {
    pub date: String,
    pub session_count: u32,
    pub total_turns: u32,
    pub total_cost: f64,
    pub total_tokens: u64,
    pub avg_efficiency_score: Option<f64>,
}

/// Project metrics response
#[derive(Debug, Clone, Serialize)]
pub struct ProjectMetricsResponse {
    pub project_path: String,
    pub project_name: String,
    pub session_count: u32,
    pub total_cost: f64,
    pub total_turns: u32,
    pub total_tokens: u64,
    pub avg_cost_per_session: f64,
    pub last_activity: String,
}

/// Get dashboard summary metrics efficiently
///
/// This command uses cached session data for fast aggregates,
/// without re-scanning the filesystem on every call.
#[tauri::command]
pub async fn get_dashboard_summary(
    _state: tauri::State<'_, AppState>,
    limit: Option<u32>,
) -> Result<DashboardSummaryResponse, CommandError> {
    let limit = limit.unwrap_or(100) as usize; // Default to 100 sessions for fast load

    // Use cached session list
    let sessions = get_cached_session_list();
    let total_session_count = sessions.len();

    // Count unique projects from all sessions (quick operation)
    let unique_projects: HashSet<String> = sessions
        .iter()
        .filter_map(|s| s.project_path.clone())
        .collect();

    // Process only limited sessions for metrics
    let limited_sessions: Vec<_> = sessions.into_iter().take(limit).collect();

    let mut total_cost = 0.0;
    let mut total_turns = 0u32;
    let mut total_tokens = 0u64;
    let mut efficiency_sum = 0.0;
    let mut efficiency_count = 0u32;
    let mut processed_count = 0u32;

    for file_info in limited_sessions {
        if let Ok((turns, _)) = get_session_turns(&file_info.session_id) {
            let (
                session_tokens,
                total_breakdown,
                _unique_tools,
                _models,
                _tool_count,
                _subagent_count,
                _duration_ms,
            ) = calculate_metrics_from_turns(&turns);

            total_cost += total_breakdown.total_cost;
            total_turns += turns.len() as u32;
            total_tokens += session_tokens.total();
            processed_count += 1;

            // Calculate CER for efficiency using correct formula:
            // CER = cache_read / (cache_read + cache_write)
            let total_cache = session_tokens.total_cache();
            if total_cache > 0 {
                let cer = session_tokens.total_cache_read as f64 / total_cache as f64;
                efficiency_sum += cer;
                efficiency_count += 1;
            }
        }
    }

    let avg_efficiency = if efficiency_count > 0 {
        Some(efficiency_sum / efficiency_count as f64)
    } else {
        None
    };

    Ok(DashboardSummaryResponse {
        total_sessions: total_session_count as u32,
        total_cost,
        total_turns,
        total_tokens,
        avg_cost_per_session: if processed_count > 0 { total_cost / processed_count as f64 } else { 0.0 },
        avg_turns_per_session: if processed_count > 0 { total_turns as f64 / processed_count as f64 } else { 0.0 },
        avg_efficiency_score: avg_efficiency,
        active_projects: unique_projects.len() as u32,
    })
}

/// Get daily metrics efficiently
///
/// Returns aggregated metrics grouped by day using cached session data.
#[tauri::command]
pub async fn get_daily_metrics(
    _state: tauri::State<'_, AppState>,
    days: Option<u32>,
) -> Result<Vec<DailyMetricsResponse>, CommandError> {
    let days = days.unwrap_or(30);
    let cutoff = chrono::Utc::now() - chrono::Duration::days(days as i64);

    // Use cached session list
    let sessions = get_cached_session_list();

    let mut by_date: HashMap<String, (u32, u32, f64, u64, f64, u32)> = HashMap::new();
    // (session_count, total_turns, total_cost, total_tokens, efficiency_sum, efficiency_count)

    for file_info in sessions.iter().take(200) { // Limit to 200 most recent
        if let Ok((turns, _)) = get_session_turns(&file_info.session_id) {
            if turns.is_empty() {
                continue;
            }

            let started_at = &turns[0].started_at;

            // Parse date and check if within range
            if let Ok(parsed) = chrono::DateTime::parse_from_rfc3339(started_at) {
                let utc_date = parsed.with_timezone(&chrono::Utc);
                if utc_date < cutoff {
                    continue;
                }

                let date_key = utc_date.format("%Y-%m-%d").to_string();

                let (
                    session_tokens,
                    total_breakdown,
                    _unique_tools,
                    _models,
                    _tool_count,
                    _subagent_count,
                    _duration_ms,
                ) = calculate_metrics_from_turns(&turns);

                // Calculate CER efficiency using correct formula:
                // CER = cache_read / (cache_read + cache_write)
                let total = session_tokens.total();
                let total_cache = session_tokens.total_cache();
                let efficiency = if total_cache > 0 {
                    session_tokens.total_cache_read as f64 / total_cache as f64
                } else {
                    0.0
                };

                let entry = by_date.entry(date_key).or_insert((0, 0, 0.0, 0, 0.0, 0));
                entry.0 += 1; // session_count
                entry.1 += turns.len() as u32; // total_turns
                entry.2 += total_breakdown.total_cost; // total_cost
                entry.3 += total; // total_tokens
                entry.4 += efficiency; // efficiency_sum
                entry.5 += 1; // efficiency_count
            }
        }
    }

    let mut result: Vec<DailyMetricsResponse> = by_date
        .into_iter()
        .map(|(date, (session_count, total_turns, total_cost, total_tokens, eff_sum, eff_count))| {
            DailyMetricsResponse {
                date,
                session_count,
                total_turns,
                total_cost,
                total_tokens,
                avg_efficiency_score: if eff_count > 0 { Some(eff_sum / eff_count as f64) } else { None },
            }
        })
        .collect();

    // Sort by date descending
    result.sort_by(|a, b| b.date.cmp(&a.date));

    Ok(result)
}

/// Get project metrics efficiently
///
/// Returns metrics grouped by project path using cached session data.
#[tauri::command]
pub async fn get_project_metrics(
    _state: tauri::State<'_, AppState>,
    limit: Option<u32>,
) -> Result<Vec<ProjectMetricsResponse>, CommandError> {
    let limit = limit.unwrap_or(20) as usize;

    // Use cached session list
    let sessions = get_cached_session_list();

    let mut by_project: HashMap<String, (String, u32, f64, u32, u64, String)> = HashMap::new();
    // (project_name, session_count, total_cost, total_turns, total_tokens, last_activity)

    for file_info in sessions.iter().take(200) { // Limit to 200 most recent
        let project_path = file_info.project_path.clone().unwrap_or_default();
        if project_path.is_empty() {
            continue;
        }

        if let Ok((turns, _)) = get_session_turns(&file_info.session_id) {
            if turns.is_empty() {
                continue;
            }

            let started_at = turns[0].started_at.clone();
            let project_name = extract_project_name(&project_path);

            let (
                session_tokens,
                total_breakdown,
                _unique_tools,
                _models,
                _tool_count,
                _subagent_count,
                _duration_ms,
            ) = calculate_metrics_from_turns(&turns);

            let entry = by_project
                .entry(project_path.clone())
                .or_insert((project_name, 0, 0.0, 0, 0, String::new()));

            entry.1 += 1; // session_count
            entry.2 += total_breakdown.total_cost; // total_cost
            entry.3 += turns.len() as u32; // total_turns
            entry.4 += session_tokens.total(); // total_tokens

            // Update last_activity if this is more recent
            if entry.5.is_empty() || started_at > entry.5 {
                entry.5 = started_at;
            }
        }
    }

    let mut result: Vec<ProjectMetricsResponse> = by_project
        .into_iter()
        .map(|(project_path, (project_name, session_count, total_cost, total_turns, total_tokens, last_activity))| {
            ProjectMetricsResponse {
                project_path,
                project_name,
                session_count,
                total_cost,
                total_turns,
                total_tokens,
                avg_cost_per_session: if session_count > 0 { total_cost / session_count as f64 } else { 0.0 },
                last_activity,
            }
        })
        .collect();

    // Sort by total cost descending
    result.sort_by(|a, b| b.total_cost.partial_cmp(&a.total_cost).unwrap_or(std::cmp::Ordering::Equal));

    // Limit results
    result.truncate(limit);

    Ok(result)
}

// ============================================================================
// Anti-Pattern Detection Commands
// ============================================================================

/// Detect anti-patterns in sessions
///
/// Analyzes sessions for inefficient patterns:
/// - SubagentSprawl: Too many subagents for output
/// - ContextChurn: Poor cache utilization (CER < 0.4)
/// - CostSpike: Turn cost > 3x session average
/// - LongTurn: Turn duration > 5 minutes
/// - ToolFailureSpree: 3+ consecutive tool failures
/// - HighReworkRatio: Many edits to same files
///
/// # Arguments
/// * `session_id` - Optional specific session to analyze. If None, scans all sessions.
/// * `pattern_types` - Optional filter for specific patterns. If None, checks all.
#[tauri::command]
pub async fn detect_antipatterns(
    session_id: Option<String>,
    pattern_types: Option<Vec<String>>,
) -> Result<Vec<crate::patterns::DetectedPattern>, String> {
    // Convert string pattern types to enum
    let patterns = pattern_types.map(|types| {
        types
            .iter()
            .filter_map(|s| crate::patterns::types::AntiPatternType::from_str(s))
            .collect()
    });

    crate::patterns::detect_antipatterns(session_id, patterns, None)
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

    #[test]
    fn test_subagent_summary_serialization() {
        let subagent = SubagentSummary {
            agent_id: "agent-abc123".to_string(),
            slug: Some("code-reviewer".to_string()),
            turn_count: 5,
            total_cost: 1.25,
            total_tokens: 25000,
            tools_used: vec!["Read".to_string(), "Grep".to_string(), "Glob".to_string()],
        };

        let json = serde_json::to_string(&subagent).unwrap();
        assert!(json.contains("\"agent_id\":\"agent-abc123\""));
        assert!(json.contains("\"slug\":\"code-reviewer\""));
        assert!(json.contains("\"turn_count\":5"));
        assert!(json.contains("\"total_cost\":1.25"));
        assert!(json.contains("\"total_tokens\":25000"));
        assert!(json.contains("\"tools_used\":[\"Read\",\"Grep\",\"Glob\"]"));
    }

    #[test]
    fn test_subagent_summary_without_slug() {
        let subagent = SubagentSummary {
            agent_id: "agent-def456".to_string(),
            slug: None,
            turn_count: 3,
            total_cost: 0.75,
            total_tokens: 15000,
            tools_used: vec!["Bash".to_string()],
        };

        let json = serde_json::to_string(&subagent).unwrap();
        assert!(json.contains("\"agent_id\":\"agent-def456\""));
        assert!(json.contains("\"slug\":null"));
        assert!(json.contains("\"turn_count\":3"));
    }

    #[test]
    fn test_metrics_comparison_serialization() {
        let comparison = MetricsComparison {
            cost_diff: 2.50,
            token_diff: 10000,
            efficiency_diff: 0.15,
            duration_diff: 120000,
        };

        let json = serde_json::to_string(&comparison).unwrap();
        assert!(json.contains("\"cost_diff\":2.5"));
        assert!(json.contains("\"token_diff\":10000"));
        assert!(json.contains("\"efficiency_diff\":0.15"));
        assert!(json.contains("\"duration_diff\":120000"));
    }

    #[test]
    fn test_metrics_comparison_negative_values() {
        let comparison = MetricsComparison {
            cost_diff: -1.25,
            token_diff: -5000,
            efficiency_diff: -0.10,
            duration_diff: -60000,
        };

        let json = serde_json::to_string(&comparison).unwrap();
        assert!(json.contains("\"cost_diff\":-1.25"));
        assert!(json.contains("\"token_diff\":-5000"));
        assert!(json.contains("\"efficiency_diff\":-0.1"));
        assert!(json.contains("\"duration_diff\":-60000"));
    }

    #[test]
    fn test_session_comparison_serialization() {
        let session1 = SessionSummary {
            id: "session-1".to_string(),
            project_path: "/path/to/project".to_string(),
            project_name: "project".to_string(),
            started_at: "2026-01-14T07:00:00.000Z".to_string(),
            last_activity_at: Some("2026-01-14T08:00:00.000Z".to_string()),
            model: Some("claude-opus-4-5-20251101".to_string()),
            total_cost: 3.00,
            total_turns: 5,
            total_tokens: 30000,
            duration_ms: 600000,
            is_subagent: false,
            file_path: "/path/to/session1.jsonl".to_string(),
        };

        let session2 = SessionSummary {
            id: "session-2".to_string(),
            project_path: "/path/to/project".to_string(),
            project_name: "project".to_string(),
            started_at: "2026-01-14T09:00:00.000Z".to_string(),
            last_activity_at: Some("2026-01-14T10:00:00.000Z".to_string()),
            model: Some("claude-opus-4-5-20251101".to_string()),
            total_cost: 5.50,
            total_turns: 8,
            total_tokens: 40000,
            duration_ms: 720000,
            is_subagent: false,
            file_path: "/path/to/session2.jsonl".to_string(),
        };

        let comparison = SessionComparison {
            sessions: vec![session1, session2],
            metrics_comparison: MetricsComparison {
                cost_diff: 2.50,
                token_diff: 10000,
                efficiency_diff: 0.05,
                duration_diff: 120000,
            },
        };

        let json = serde_json::to_string(&comparison).unwrap();
        assert!(json.contains("\"sessions\":["));
        assert!(json.contains("\"session-1\""));
        assert!(json.contains("\"session-2\""));
        assert!(json.contains("\"metrics_comparison\""));
        assert!(json.contains("\"cost_diff\":2.5"));
    }

    #[test]
    fn test_code_change_serialization() {
        let change = CodeChange {
            file_path: "/path/to/file.rs".to_string(),
            change_type: "edit".to_string(),
            tool_name: "Edit".to_string(),
            turn_number: 3,
            timestamp: "2026-01-14T07:45:00.000Z".to_string(),
        };

        let json = serde_json::to_string(&change).unwrap();
        assert!(json.contains("\"file_path\":\"/path/to/file.rs\""));
        assert!(json.contains("\"change_type\":\"edit\""));
        assert!(json.contains("\"tool_name\":\"Edit\""));
        assert!(json.contains("\"turn_number\":3"));
        assert!(json.contains("\"timestamp\":\"2026-01-14T07:45:00.000Z\""));
    }

    #[test]
    fn test_code_change_create_type() {
        let change = CodeChange {
            file_path: "/new/file.ts".to_string(),
            change_type: "create".to_string(),
            tool_name: "Write".to_string(),
            turn_number: 1,
            timestamp: "2026-01-14T07:30:00.000Z".to_string(),
        };

        let json = serde_json::to_string(&change).unwrap();
        assert!(json.contains("\"change_type\":\"create\""));
        assert!(json.contains("\"tool_name\":\"Write\""));
    }

    #[test]
    fn test_code_change_delete_type() {
        let change = CodeChange {
            file_path: "/old/file.py".to_string(),
            change_type: "delete".to_string(),
            tool_name: "Bash".to_string(),
            turn_number: 10,
            timestamp: "2026-01-14T09:00:00.000Z".to_string(),
        };

        let json = serde_json::to_string(&change).unwrap();
        assert!(json.contains("\"change_type\":\"delete\""));
        assert!(json.contains("\"tool_name\":\"Bash\""));
        assert!(json.contains("\"turn_number\":10"));
    }

    #[test]
    fn test_code_change_notebook_edit() {
        let change = CodeChange {
            file_path: "/notebooks/analysis.ipynb".to_string(),
            change_type: "edit".to_string(),
            tool_name: "NotebookEdit".to_string(),
            turn_number: 7,
            timestamp: "2026-01-14T08:30:00.000Z".to_string(),
        };

        let json = serde_json::to_string(&change).unwrap();
        assert!(json.contains("\"file_path\":\"/notebooks/analysis.ipynb\""));
        assert!(json.contains("\"tool_name\":\"NotebookEdit\""));
    }
}

//! Tauri command handlers
//!
//! All IPC commands exposed to the frontend.
//! These commands use the real parser and metrics calculators
//! instead of relying solely on database queries.

use std::collections::{HashMap, HashSet};
use std::path::Path;
use std::sync::Arc;
use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::RwLock;
use std::time::{Duration, Instant, SystemTime};

use serde::Serialize;

use crate::db;
use crate::metrics::cost::{calculate_turn_cost, CostBreakdown};
use crate::metrics::session::{
    calculate_session_metrics, estimate_deliverable_units, estimate_deliverable_units_v2,
    SessionMetricsInput,
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
    pub has_subagents: bool,
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

/// Cost trend data point for charts
#[derive(Debug, Clone, Serialize)]
pub struct CostTrendPoint {
    pub date: String,
    pub cost: f64,
    pub cumulative_cost: f64,
}

/// Efficiency trend data point for charts
#[derive(Debug, Clone, Serialize)]
pub struct EfficiencyTrendPoint {
    pub date: String,
    pub efficiency: f64,
    pub sessions: u32,
}

// ============================================================================
// Session Cache
// ============================================================================

/// Cached session data to avoid re-parsing unchanged files
struct CachedSession {
    last_modified: SystemTime,
    file_size: u64,
    turns: Arc<Vec<CompletedTurn>>,
    last_accessed: Instant,
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

// ============================================================================
// TTL Cache for Expensive Aggregations
// ============================================================================

/// Generic in-memory cache with time-to-live expiration.
///
/// Used to avoid recomputing expensive aggregate metrics (dashboard summary,
/// daily metrics, project metrics) on every request. Each cached value is
/// keyed by the `days` parameter (represented as Option<u32>) so that
/// switching between time ranges (7d, 30d, 90d, All) returns the correct
/// data instead of a stale result from a different range. Reads return
/// `None` once the TTL has elapsed, causing the next caller to recompute.
struct AggregateCache<T: Clone> {
    data: HashMap<Option<u32>, (Instant, T)>,
    ttl: Duration,
}

impl<T: Clone> AggregateCache<T> {
    fn new(ttl_secs: u64) -> Self {
        Self {
            data: HashMap::new(),
            ttl: Duration::from_secs(ttl_secs),
        }
    }

    fn get(&self, days: Option<u32>) -> Option<T> {
        self.data.get(&days).and_then(|(time, data)| {
            if time.elapsed() < self.ttl {
                Some(data.clone())
            } else {
                None
            }
        })
    }

    fn set(&mut self, days: Option<u32>, data: T) {
        self.data.insert(days, (Instant::now(), data));
    }
}

lazy_static::lazy_static! {
    /// Cache for `get_dashboard_summary` - TTL 30 seconds
    static ref DASHBOARD_CACHE: Mutex<AggregateCache<DashboardSummaryResponse>> =
        Mutex::new(AggregateCache::new(30));

    /// Cache for `get_daily_metrics` - TTL 60 seconds
    static ref DAILY_CACHE: Mutex<AggregateCache<Vec<DailyMetricsResponse>>> =
        Mutex::new(AggregateCache::new(60));

    /// Cache for `get_project_metrics` - TTL 60 seconds
    static ref PROJECT_CACHE: Mutex<AggregateCache<Vec<ProjectMetricsResponse>>> =
        Mutex::new(AggregateCache::new(60));
}

/// Flag to track if initial preload is complete
static SESSIONS_PRELOADED: AtomicBool = AtomicBool::new(false);

/// Check if a session is cached and still valid
fn get_cached_session(session_id: &str, file_info: &SessionFileInfo) -> Option<Arc<Vec<CompletedTurn>>> {
    let cache = SESSION_CACHE.read().ok()?;
    let cached = cache.get(session_id)?;

    // Check if file has been modified
    if cached.last_modified == file_info.modified && cached.file_size == file_info.size {
        Some(cached.turns.clone()) // Arc clone is cheap
    } else {
        None
    }
}

/// Store parsed session in cache
fn cache_session(session_id: &str, file_info: &SessionFileInfo, turns: Vec<CompletedTurn>) {
    if let Ok(mut cache) = SESSION_CACHE.write() {
        // Limit cache size to avoid memory issues (500 sessions covers most preloaded data)
        if cache.len() > 500 {
            // Evict oldest 50 entries by last_accessed
            let mut entries: Vec<(String, Instant)> = cache
                .iter()
                .map(|(k, v)| (k.clone(), v.last_accessed))
                .collect();
            entries.sort_by_key(|(_, t)| *t);
            for (key, _) in entries.into_iter().take(50) {
                cache.remove(&key);
            }
        }

        cache.insert(
            session_id.to_string(),
            CachedSession {
                last_modified: file_info.modified,
                file_size: file_info.size,
                turns: Arc::new(turns),
                last_accessed: Instant::now(),
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

/// Get file modification time as ISO-8601 timestamp string
///
/// Returns None if the file doesn't exist or metadata cannot be read.
/// Used for cache invalidation - if the mtime changes, we need to re-parse.
pub fn get_file_mtime(path: &Path) -> Option<String> {
    let metadata = std::fs::metadata(path).ok()?;
    let modified = metadata.modified().ok()?;

    // Convert SystemTime to DateTime<Utc>
    let datetime: chrono::DateTime<chrono::Utc> = modified.into();
    Some(datetime.to_rfc3339())
}

/// Check if a session is cached in the database with a matching file mtime
///
/// This checks:
/// 1. If the session exists in the database
/// 2. If the stored file_mtime matches the current file's modification time
///
/// Returns Some(true) if cache is valid, Some(false) if needs re-parsing, None on error
#[allow(dead_code)]
fn is_db_cache_valid(state: &AppState, session_id: &str, file_path: &Path) -> Option<bool> {
    // Get current file mtime
    let current_mtime = get_file_mtime(file_path)?;

    // Check database using with_connection pattern
    let db = state.db.get()?;

    match db.with_connection(|conn| {
        db::queries::is_session_cache_valid(conn, session_id, &current_mtime)
    }) {
        Ok(valid) => Some(valid),
        Err(e) => {
            tracing::warn!("Error checking DB cache for session {}: {:?}", session_id, e);
            Some(false) // Treat errors as cache miss
        }
    }
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
            // Find the last ended_at from any turn (not just the final turn, which often has None)
            let last_activity = turns.iter().rev()
                .find_map(|t| t.ended_at.clone())
                .or_else(|| {
                    // Fallback: compute from first started_at + duration
                    if duration_ms > 0 {
                        if let Some(ref start_str) = started_at {
                            if let Ok(start) = chrono::DateTime::parse_from_rfc3339(start_str) {
                                let end = start + chrono::Duration::milliseconds(duration_ms as i64);
                                return Some(end.to_rfc3339());
                            }
                        }
                    }
                    turns.last().map(|t| t.started_at.clone())
                });
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

/// Get the database reference, returning error if not initialized
fn get_database(state: &AppState) -> Result<&db::Database, CommandError> {
    state.db.get().ok_or(CommandError::NotInitialized)
}

/// Parse a session and get its turns, using cache when available
///
/// Cache check priority:
/// 1. In-memory cache (fast, per-process)
/// 2. Database cache (persistent, checks file mtime)
/// 3. Parse from JSONL file (slowest, but always accurate)
///
/// Note: Database cache check requires AppState for DB access.
/// Use `get_session_turns_with_db_cache` when AppState is available.
fn get_session_turns(session_id: &str) -> Result<(Vec<CompletedTurn>, SessionFileInfo), CommandError> {
    let file_info = find_session_by_id(session_id)
        .ok_or_else(|| CommandError::SessionNotFound(session_id.to_string()))?;

    // Try in-memory cache first
    if let Some(cached_turns) = get_cached_session(session_id, &file_info) {
        return Ok(((*cached_turns).to_vec(), file_info));
    }

    // Parse the session
    let (turns, _stats) = parse_session_by_id(session_id)
        .map_err(|e| CommandError::Internal(e.to_string()))?;

    // Cache the result in memory
    cache_session(session_id, &file_info, turns.clone());

    Ok((turns, file_info))
}

/// Parse a session and get its turns, checking database cache first
///
/// This version checks the database cache before parsing:
/// 1. In-memory cache (fast, per-process)
/// 2. Database cache with file mtime check (persistent across restarts)
/// 3. Parse from JSONL file (if cache miss or mtime changed)
///
/// Returns:
/// - `needs_db_store = true` if the session was parsed and should be stored to DB
/// - `needs_db_store = false` if data came from cache
#[allow(dead_code)]
fn get_session_turns_with_db_cache(
    session_id: &str,
    state: &AppState,
) -> Result<(Vec<CompletedTurn>, SessionFileInfo, bool), CommandError> {
    let file_info = find_session_by_id(session_id)
        .ok_or_else(|| CommandError::SessionNotFound(session_id.to_string()))?;

    // 1. Try in-memory cache first (fastest)
    if let Some(cached_turns) = get_cached_session(session_id, &file_info) {
        tracing::trace!("Session {} found in memory cache", session_id);
        return Ok(((*cached_turns).to_vec(), file_info, false)); // No need to store, already cached
    }

    // 2. Check database cache with file mtime validation
    if let Some(true) = is_db_cache_valid(state, session_id, &file_info.path) {
        tracing::debug!("Session {} has valid DB cache (mtime match), skipping parse", session_id);
        // DB cache is valid - the data is already in the database
        // We still need to parse to get the turns for this request,
        // but we know the DB data is up to date, so no need to re-store
        //
        // Note: This optimization helps when multiple processes/restarts occur.
        // The in-memory cache gets this data after parsing once.
        let (turns, _stats) = parse_session_by_id(session_id)
            .map_err(|e| CommandError::Internal(e.to_string()))?;

        // Cache in memory for subsequent requests
        cache_session(session_id, &file_info, turns.clone());

        return Ok((turns, file_info, false)); // DB already has current data
    }

    tracing::debug!(
        "Session {} cache miss (not in memory, DB cache invalid/missing), parsing JSONL",
        session_id
    );

    // 3. Parse the session (cache miss or mtime mismatch)
    let (turns, _stats) = parse_session_by_id(session_id)
        .map_err(|e| CommandError::Internal(e.to_string()))?;

    // Cache the result in memory
    cache_session(session_id, &file_info, turns.clone());

    // Signal that this session needs to be stored to DB (Task 48 handles this)
    Ok((turns, file_info, true))
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
        has_subagents: turn.has_subagents,
        stop_reason: turn.stop_reason.clone(),
    }
}

/// Check if a project path represents a real user project.
///
/// Claude Code stores session files under `~/.claude/projects/` in directories
/// whose names are encoded filesystem paths (e.g., `-Users-nadavbarkai-dev-ironhide`
/// decodes to `/Users/nadavbarkai/dev/ironhide`).
///
/// Some sessions live under temporary/artifact paths like `/private/tmp/madrox-logs-...`
/// which are not real user projects. This function filters those out by requiring
/// the decoded path to start with `/Users/`.
fn is_real_user_project(project_path: &str) -> bool {
    project_path.starts_with("/Users/")
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
/// Uses DB-first approach for fast response, falls back to JSONL parsing
#[tauri::command]
pub async fn get_sessions(
    state: tauri::State<'_, AppState>,
    limit: Option<i64>,
    offset: Option<i64>,
) -> Result<Vec<SessionSummary>, CommandError> {
    let limit = limit.unwrap_or(100) as usize;
    let offset = offset.unwrap_or(0) as usize;

    // Try DB-first path for instant response (no JSONL parsing)
    if let Some(db) = state.db.get() {
        if let Ok(db_sessions) = db.with_connection(|conn| {
            db::queries::get_sessions_for_frontend(conn, limit, offset)
        }) {
            if !db_sessions.is_empty() {
                let summaries: Vec<SessionSummary> = db_sessions
                    .into_iter()
                    .filter(|s| s.project_path.is_empty() || is_real_user_project(&s.project_path))
                    .map(|s| SessionSummary {
                        id: s.session_id,
                        project_path: s.project_path.clone(),
                        project_name: if s.project_name.is_empty() {
                            extract_project_name(&s.project_path)
                        } else {
                            s.project_name
                        },
                        started_at: s.started_at,
                        last_activity_at: s.last_activity_at,
                        model: s.model,
                        total_cost: s.total_cost,
                        total_turns: s.total_turns,
                        total_tokens: s.total_tokens,
                        duration_ms: s.duration_ms,
                        is_subagent: s.is_subagent,
                        file_path: s.file_path,
                    })
                    .collect();
                return Ok(summaries);
            }
        }
    }

    // Fallback: Use cached session list with JSONL parsing
    let sessions = get_cached_session_list();

    // Get or compute summaries from cache, filtering out empty sessions
    // and sessions from temporary/artifact paths
    let summaries: Vec<SessionSummary> = sessions
        .iter()
        .map(|file_info| get_cached_summary(file_info))
        .filter(|s| s.total_turns > 0)
        .filter(|s| s.project_path.is_empty() || is_real_user_project(&s.project_path))
        .skip(offset)
        .take(limit)
        .collect();

    Ok(summaries)
}

/// Detect rework cycles by looking for user messages indicating corrections.
fn detect_rework_cycles(turns: &[CompletedTurn]) -> u32 {
    let rework_keywords = [
        "fix", "wrong", "error", "try again", "doesn't work", "broken",
        "bug", "incorrect", "failed", "redo", "revert", "not working",
    ];
    let mut count = 0u32;
    for turn in turns {
        if let Some(ref msg) = turn.user_message {
            let lower = msg.to_lowercase();
            if rework_keywords.iter().any(|kw| lower.contains(kw)) {
                count += 1;
            }
        }
    }
    count
}

/// Detect clarification cycles from short question-like user messages.
fn detect_clarification_cycles(turns: &[CompletedTurn]) -> u32 {
    let clarification_keywords = [
        "?", "what", "how", "which", "clarify", "explain", "why", "where",
        "can you", "could you", "do you mean",
    ];
    let mut count = 0u32;
    for turn in turns {
        if let Some(ref msg) = turn.user_message {
            let lower = msg.to_lowercase();
            let is_short = msg.len() < 200;
            let has_question = clarification_keywords.iter().any(|kw| lower.contains(kw));
            if is_short && has_question {
                count += 1;
            }
        }
    }
    count
}

/// Calculate cost attributable to subagent turns.
fn calculate_subagent_cost_from_turns(turns: &[CompletedTurn]) -> f64 {
    use crate::metrics::cost::calculate_turn_cost;
    use crate::metrics::tokens::TurnTokens;

    let mut cost = 0.0;
    for turn in turns {
        if turn.has_subagents {
            let turn_tokens = TurnTokens::new(
                turn.input_tokens,
                turn.output_tokens,
                turn.cache_read_tokens,
                turn.cache_write_5m_tokens,
                turn.cache_write_1h_tokens,
            );
            let model = turn.model.as_deref().unwrap_or("claude-opus-4-5-20251101");
            let turn_cost = calculate_turn_cost(&turn_tokens, model);
            cost += turn_cost.total_cost;
        }
    }
    cost
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
    let turn_data: Vec<(u64, u32)> = turns
        .iter()
        .map(|t| (t.output_tokens, t.tool_count))
        .collect();
    let deliverable_units = estimate_deliverable_units_v2(tool_count, &turn_data);
    let rework_cycles = detect_rework_cycles(&turns);
    let clarification_cycles = detect_clarification_cycles(&turns);
    let subagent_cost = calculate_subagent_cost_from_turns(&turns);
    let turn_count = turns.len() as u32;

    let per_turn_tokens: Vec<TurnTokens> = turns.iter().map(|t| {
        TurnTokens::new(t.input_tokens, t.output_tokens, t.cache_read_tokens, t.cache_write_5m_tokens, t.cache_write_1h_tokens)
    }).collect();

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
        subagent_cost,
        deliverable_units,
        rework_cycles,
        clarification_cycles,
        per_turn_tokens: Some(per_turn_tokens),
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
    let db = get_database(&state)?;
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
    let count = sessions
        .iter()
        .map(|file_info| get_cached_summary(file_info))
        .filter(|s| s.total_turns > 0)
        .count();
    Ok(count as u32)
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

    // Get summaries using cache, filtering out empty sessions
    let summaries: Vec<SessionSummary> = new_sessions
        .iter()
        .filter_map(|file_info| {
            match get_session_turns(&file_info.session_id) {
                Ok(_) => Some(get_cached_summary(file_info)),
                Err(_) => None,
            }
        })
        .filter(|s| s.total_turns > 0)
        .collect();

    Ok(summaries)
}

/// Load all cached sessions from the database
/// Returns a HashMap keyed by session_id for fast lookup
fn load_cached_sessions_from_db(state: &AppState) -> HashMap<String, db::queries::CachedSessionData> {
    let db = match state.db.get() {
        Some(db) => db,
        None => {
            tracing::debug!("DB not initialized, skipping cache load");
            return HashMap::new();
        }
    };

    match db.with_connection(|conn| db::queries::get_all_sessions_with_mtime(conn)) {
        Ok(sessions) => sessions,
        Err(e) => {
            tracing::warn!("Failed to load sessions from DB: {:?}", e);
            HashMap::new()
        }
    }
}

/// Store a session and its metrics to the database for persistent caching
fn store_session_to_db(
    state: &AppState,
    _file_info: &SessionFileInfo,  // Reserved for future use (e.g., git branch extraction)
    summary: &SessionSummary,
    session_tokens: &SessionTokens,
    file_mtime: &str,
) {
    let db = match state.db.get() {
        Some(db) => db,
        None => {
            tracing::debug!("DB not initialized, skipping session store");
            return;
        }
    };

    // Store session with mtime
    if let Err(e) = db.with_connection(|conn| {
        db::queries::upsert_session_with_mtime(
            conn,
            &summary.id,
            &summary.project_path,
            &summary.project_name,
            None, // branch - could be extracted from git info
            &summary.started_at,
            summary.last_activity_at.as_deref().unwrap_or(&summary.started_at),
            summary.model.as_deref().unwrap_or("unknown"),
            false, // is_active
            &summary.file_path,
            file_mtime,
        )?;

        // Compute cache_hit_rate (CER) = cache_read / (cache_read + cache_write)
        let total_cache_write = session_tokens.total_cache_write_5m + session_tokens.total_cache_write_1h;
        let total_cache = session_tokens.total_cache_read + total_cache_write;
        let cache_hit_rate = if total_cache > 0 {
            session_tokens.total_cache_read as f64 / total_cache as f64
        } else {
            0.0
        };

        // Peak context % heuristic (no per-turn data available in this function)
        const MAX_CONTEXT: f64 = 200_000.0;
        let peak_context_pct = (session_tokens.total_input.max(session_tokens.total_cache_read) as f64
            / MAX_CONTEXT * 100.0).min(100.0);

        db::queries::upsert_session_metrics(
            conn,
            &summary.id,
            summary.total_turns,
            summary.duration_ms,
            summary.total_cost,
            session_tokens.total_input,
            session_tokens.total_output,
            session_tokens.total_cache_read,
            total_cache_write,
            0.0, // TODO: efficiency_score (OES) requires deliverable_units, subagent data not available here
            cache_hit_rate,
            peak_context_pct,
        )
    }) {
        tracing::warn!("Failed to store session {} to DB: {:?}", summary.id, e);
    }
}

/// Convert DB cached session data to the SessionSummary format used by commands
fn convert_db_cache_to_summary(
    cached: &db::queries::CachedSessionData,
    file_info: &SessionFileInfo,
) -> SessionSummary {
    SessionSummary {
        id: cached.session_id.clone(),
        project_path: cached.project_path.clone(),
        project_name: cached.project_name.clone(),
        started_at: cached.started_at.clone(),
        last_activity_at: cached.last_activity_at.clone(),
        model: cached.model.clone(),
        total_cost: cached.total_cost,
        total_turns: cached.total_turns,
        total_tokens: cached.total_tokens,
        duration_ms: cached.total_duration_ms,
        // Use file_info for current file state (subagent status and path)
        is_subagent: file_info.is_subagent,
        file_path: file_info.path.to_string_lossy().to_string(),
    }
}

/// Preload all sessions into cache at startup with persistent DB caching
///
/// On first run: Parses all sessions from JSONL files, stores to SQLite DB
/// On subsequent runs: Loads from DB (fast), only re-parses if file mtime changed
///
/// Returns the count of sessions loaded
#[tauri::command]
pub async fn preload_all_sessions(
    state: tauri::State<'_, AppState>,
) -> Result<u32, CommandError> {
    if SESSIONS_PRELOADED.load(Ordering::SeqCst) {
        // Already preloaded, return current count
        let sessions = get_cached_session_list();
        return Ok(sessions.len() as u32);
    }

    tracing::info!("Preloading all sessions with persistent DB caching...");
    let start = Instant::now();

    // Step 1: Load all cached sessions from DB (fast)
    let db_cached_sessions = load_cached_sessions_from_db(&state);
    tracing::info!("Loaded {} sessions from DB cache", db_cached_sessions.len());

    // Step 2: Scan filesystem for all session files
    let file_sessions = scan_claude_sessions();
    let total_count = file_sessions.len();
    tracing::info!("Found {} session files on disk", total_count);

    // Update the session list cache first
    if let Ok(mut cache) = SESSION_LIST_CACHE.write() {
        cache.sessions = file_sessions.clone();
        cache.last_refresh = Instant::now();
    }

    // Step 3: Process sessions - cache hits immediately, collect misses for parallel parsing
    let mut cache_hits = 0;
    let mut cache_misses_list: Vec<SessionFileInfo> = Vec::new();
    let preload_limit = 500;

    for session in file_sessions.iter().take(preload_limit) {
        let current_mtime = get_file_mtime(&session.path);

        // Check if DB has valid cached data
        if let Some(cached) = db_cached_sessions.get(&session.session_id) {
            let mtime_matches = match (&cached.file_mtime, &current_mtime) {
                (Some(stored), Some(current)) => stored == current,
                _ => false,
            };

            if mtime_matches {
                cache_hits += 1;
                let summary = convert_db_cache_to_summary(cached, session);
                if let Ok(mut list_cache) = SESSION_LIST_CACHE.write() {
                    list_cache.summaries.insert(session.session_id.clone(), summary);
                }
                continue;
            }
        }

        cache_misses_list.push(session.clone());
    }

    // Step 4: Parse cache misses in parallel (up to 8 concurrent)
    let cache_misses = cache_misses_list.len();
    if !cache_misses_list.is_empty() {
        let semaphore = Arc::new(tokio::sync::Semaphore::new(8));
        let mut handles = Vec::new();

        for session in cache_misses_list {
            let sem = semaphore.clone();
            let handle = tokio::spawn(async move {
                let _permit = sem.acquire_owned().await.unwrap();
                tokio::task::spawn_blocking(move || {
                    let current_mtime = get_file_mtime(&session.path);
                    let summary = compute_session_summary(&session);

                    let session_tokens = if let Ok((turns, _)) = get_session_turns(&session.session_id) {
                        let (tokens, _, _, _, _, _, _) = calculate_metrics_from_turns(&turns);
                        tokens
                    } else {
                        SessionTokens::new()
                    };

                    (session, summary, session_tokens, current_mtime)
                }).await
            });
            handles.push(handle);
        }

        // Collect results and store to DB + memory cache
        for handle in handles {
            if let Ok(Ok((session, summary, session_tokens, current_mtime))) = handle.await {
                if let Some(ref mtime) = current_mtime {
                    store_session_to_db(&state, &session, &summary, &session_tokens, mtime);
                }
                if let Ok(mut list_cache) = SESSION_LIST_CACHE.write() {
                    list_cache.summaries.insert(session.session_id.clone(), summary);
                }
            }
        }
    }

    SESSIONS_PRELOADED.store(true, Ordering::SeqCst);
    let elapsed = start.elapsed();
    tracing::info!(
        "Phase 1 complete: Preloaded {} sessions (DB cache hits: {}, misses: {}) in {:?}",
        total_count,
        cache_hits,
        cache_misses,
        elapsed
    );

    // Phase 2: Process remaining sessions in background
    let remaining_count = file_sessions.len().saturating_sub(preload_limit);
    if remaining_count > 0 {
        let remaining_sessions: Vec<SessionFileInfo> = file_sessions.into_iter().skip(preload_limit).collect();
        // Move the DB cache into the background task for cache-hit checking
        let db_cache_for_phase2 = db_cached_sessions;

        tokio::spawn(async move {
            tracing::info!("Phase 2: Processing {} remaining sessions in background...", remaining_sessions.len());
            let phase2_start = Instant::now();
            let mut phase2_processed = 0u32;
            let mut phase2_cached = 0u32;
            let mut phase2_skipped = 0u32;

            // Create a dedicated DB connection for Phase 2
            // (Database wraps Mutex<Connection> and doesn't impl Clone)
            let phase2_db = match db::Database::new(db::default_db_path()) {
                Ok(db) => {
                    if let Err(e) = db.initialize() {
                        tracing::warn!("Phase 2: Failed to initialize DB: {:?}", e);
                        return;
                    }
                    Some(db)
                }
                Err(e) => {
                    tracing::warn!("Phase 2: Failed to open DB connection: {:?}", e);
                    None
                }
            };

            // Process in chunks of 50 to avoid overwhelming the system
            for chunk in remaining_sessions.chunks(50) {
                // First, separate DB cache hits from misses to avoid unnecessary JSONL parsing
                let mut chunk_cache_hits: Vec<(&SessionFileInfo, SessionSummary)> = Vec::new();
                let mut chunk_misses: Vec<SessionFileInfo> = Vec::new();

                for session in chunk {
                    let current_mtime = get_file_mtime(&session.path);
                    if let Some(cached) = db_cache_for_phase2.get(&session.session_id) {
                        let mtime_matches = match (&cached.file_mtime, &current_mtime) {
                            (Some(stored), Some(current)) => stored == current,
                            _ => false,
                        };
                        if mtime_matches {
                            let summary = convert_db_cache_to_summary(cached, session);
                            chunk_cache_hits.push((session, summary));
                            continue;
                        }
                    }
                    chunk_misses.push(session.clone());
                }

                // Store cache hits into the memory cache immediately (no JSONL parsing needed)
                for (session, summary) in chunk_cache_hits {
                    phase2_cached += 1;
                    if let Ok(mut list_cache) = SESSION_LIST_CACHE.write() {
                        list_cache.summaries.insert(session.session_id.clone(), summary);
                    }
                }

                // Parse cache misses in parallel
                if !chunk_misses.is_empty() {
                    let mut handles = Vec::new();
                    let semaphore = Arc::new(tokio::sync::Semaphore::new(8));

                    for session in chunk_misses {
                        let sem = semaphore.clone();

                        let handle = tokio::spawn(async move {
                            let _permit = sem.acquire_owned().await;
                            tokio::task::spawn_blocking(move || {
                                let current_mtime = get_file_mtime(&session.path);
                                let summary = compute_session_summary(&session);

                                let session_tokens = if let Ok((turns, _)) = get_session_turns(&session.session_id) {
                                    let (tokens, _, _, _, _, _, _) = calculate_metrics_from_turns(&turns);
                                    tokens
                                } else {
                                    SessionTokens::new()
                                };

                                (session, summary, session_tokens, current_mtime)
                            }).await
                        });
                        handles.push(handle);
                    }

                    // Collect results and store to DB + memory cache
                    for handle in handles {
                        if let Ok(Ok((session, summary, session_tokens, current_mtime))) = handle.await {
                            if let Some(ref mtime) = current_mtime {
                                // Store to DB using the dedicated Phase 2 connection
                                if let Some(ref db) = phase2_db {
                                    let total_cache_write = session_tokens.total_cache_write_5m + session_tokens.total_cache_write_1h;
                                    let total_cache = session_tokens.total_cache_read + total_cache_write;
                                    let cache_hit_rate = if total_cache > 0 {
                                        session_tokens.total_cache_read as f64 / total_cache as f64
                                    } else {
                                        0.0
                                    };
                                    const MAX_CONTEXT: f64 = 200_000.0;
                                    let peak_context_pct = (session_tokens.total_input.max(session_tokens.total_cache_read) as f64
                                        / MAX_CONTEXT * 100.0).min(100.0);

                                    let _ = db.with_connection(|conn| {
                                        db::queries::upsert_session_with_mtime(
                                            conn,
                                            &summary.id,
                                            &summary.project_path,
                                            &summary.project_name,
                                            None,
                                            &summary.started_at,
                                            summary.last_activity_at.as_deref().unwrap_or(&summary.started_at),
                                            summary.model.as_deref().unwrap_or("unknown"),
                                            false,
                                            &summary.file_path,
                                            mtime,
                                        )?;
                                        db::queries::upsert_session_metrics(
                                            conn,
                                            &summary.id,
                                            summary.total_turns,
                                            summary.duration_ms,
                                            summary.total_cost,
                                            session_tokens.total_input,
                                            session_tokens.total_output,
                                            session_tokens.total_cache_read,
                                            total_cache_write,
                                            0.0,
                                            cache_hit_rate,
                                            peak_context_pct,
                                        )?;
                                        Ok(())
                                    });
                                    phase2_processed += 1;
                                }
                            } else {
                                phase2_skipped += 1;
                            }

                            // Also cache in memory
                            if let Ok(mut list_cache) = SESSION_LIST_CACHE.write() {
                                list_cache.summaries.insert(session.session_id.clone(), summary);
                            }
                        }
                    }
                }
            }

            // Invalidate aggregate caches so next dashboard request picks up Phase 2 data
            if let Ok(mut cache) = DASHBOARD_CACHE.lock() {
                cache.data.clear();
            }
            if let Ok(mut cache) = DAILY_CACHE.lock() {
                cache.data.clear();
            }
            if let Ok(mut cache) = PROJECT_CACHE.lock() {
                cache.data.clear();
            }

            tracing::info!(
                "Phase 2 complete: processed {} sessions, cached {}, skipped {} in {:?}",
                phase2_processed, phase2_cached, phase2_skipped, phase2_start.elapsed()
            );
        });
    }

    Ok(total_count as u32)
}

/// Get sessions filtered by date range efficiently
/// Uses DB-first approach for fast response, falls back to JSONL parsing
#[tauri::command]
pub async fn get_sessions_filtered(
    state: tauri::State<'_, AppState>,
    start_date: Option<String>,
    end_date: Option<String>,
    limit: Option<i64>,
    offset: Option<i64>,
) -> Result<Vec<SessionSummary>, CommandError> {
    let limit = limit.unwrap_or(100) as usize;
    let offset = offset.unwrap_or(0) as usize;

    // Try DB-first path for instant response (no JSONL parsing)
    if let Some(db) = state.db.get() {
        if let Ok(db_sessions) = db.with_connection(|conn| {
            db::queries::get_sessions_for_frontend_filtered(
                conn,
                start_date.as_deref(),
                end_date.as_deref(),
                limit,
                offset,
            )
        }) {
            if !db_sessions.is_empty() {
                let summaries: Vec<SessionSummary> = db_sessions
                    .into_iter()
                    .filter(|s| s.project_path.is_empty() || is_real_user_project(&s.project_path))
                    .map(|s| SessionSummary {
                        id: s.session_id,
                        project_path: s.project_path.clone(),
                        project_name: if s.project_name.is_empty() {
                            extract_project_name(&s.project_path)
                        } else {
                            s.project_name
                        },
                        started_at: s.started_at,
                        last_activity_at: s.last_activity_at,
                        model: s.model,
                        total_cost: s.total_cost,
                        total_turns: s.total_turns,
                        total_tokens: s.total_tokens,
                        duration_ms: s.duration_ms,
                        is_subagent: s.is_subagent,
                        file_path: s.file_path,
                    })
                    .collect();
                return Ok(summaries);
            }
        }
    }

    // Fallback: Use cached session list with JSONL parsing
    let sessions = get_cached_session_list();

    // Get summaries, filter out empty sessions, temp paths, and filter by date
    let summaries: Vec<SessionSummary> = sessions
        .iter()
        .map(|file_info| get_cached_summary(file_info))
        .filter(|s| s.total_turns > 0)
        .filter(|s| s.project_path.is_empty() || is_real_user_project(&s.project_path))
        .filter(|summary| {
            // Filter by date range if provided
            if summary.started_at == "unknown" {
                return true; // Include sessions with unknown dates
            }

            if summary.started_at.len() < 10 {
                return true; // Include sessions with short date strings
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

/// Get all sessions for a specific project path
///
/// Returns all sessions (including subagent sessions) that belong to the
/// given project path, applying the same filtering as get_project_metrics
/// to ensure the session list matches the aggregate metrics shown on
/// project cards.
/// Uses DB-first approach for fast response, falls back to JSONL parsing.
#[tauri::command]
pub async fn get_sessions_by_project(
    state: tauri::State<'_, AppState>,
    project_path: String,
) -> Result<Vec<SessionSummary>, CommandError> {
    // Try DB-first path for instant response (no JSONL parsing)
    if let Some(db) = state.db.get() {
        if let Ok(db_sessions) = db.with_connection(|conn| {
            db::queries::get_sessions_for_frontend_by_project(conn, &project_path)
        }) {
            if !db_sessions.is_empty() {
                let summaries: Vec<SessionSummary> = db_sessions
                    .into_iter()
                    .map(|s| SessionSummary {
                        id: s.session_id,
                        project_path: s.project_path.clone(),
                        project_name: if s.project_name.is_empty() {
                            extract_project_name(&s.project_path)
                        } else {
                            s.project_name
                        },
                        started_at: s.started_at,
                        last_activity_at: s.last_activity_at,
                        model: s.model,
                        total_cost: s.total_cost,
                        total_turns: s.total_turns,
                        total_tokens: s.total_tokens,
                        duration_ms: s.duration_ms,
                        is_subagent: s.is_subagent,
                        file_path: s.file_path,
                    })
                    .collect();
                return Ok(summaries);
            }
        }
    }

    // Fallback: Use cached session list with JSONL parsing
    let sessions = get_cached_session_list();

    let summaries: Vec<SessionSummary> = sessions
        .iter()
        .filter(|file_info| {
            file_info.project_path.as_deref() == Some(project_path.as_str())
        })
        .map(|file_info| get_cached_summary(file_info))
        .filter(|s| s.total_turns > 0)
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
        // CER = cache_read / (cache_read + cache_write) per efficiency.rs
        let total_tokens_val = session_tokens.total();
        let cache_read = session_tokens.total_cache_read;
        let cache_write = session_tokens.total_cache_write_5m + session_tokens.total_cache_write_1h;
        let total_cache = cache_read + cache_write;
        let cer = if total_cache > 0 {
            cache_read as f64 / total_cache as f64
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
    let format = options.format.parse::<ExportFormat>()?;

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
    let export_format = format.parse::<ExportFormat>()?;

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

use crate::trends::DailyTrend;
use crate::trends::daily::{SessionData, get_daily_trends};

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
/// Returns daily trend data for chart visualization.
#[tauri::command]
pub async fn get_trends(
    _state: tauri::State<'_, AppState>,
    start_date: Option<String>,
    end_date: Option<String>,
    _granularity: Option<String>,
) -> Result<Vec<DailyTrend>, String> {
    let session_data = collect_session_trend_data();

    // Calculate days from date range, default to 30
    let days = if let (Some(start), Some(end)) = (&start_date, &end_date) {
        if let (Ok(start_dt), Ok(end_dt)) = (
            chrono::NaiveDate::parse_from_str(start, "%Y-%m-%d"),
            chrono::NaiveDate::parse_from_str(end, "%Y-%m-%d"),
        ) {
            (end_dt - start_dt).num_days().max(1) as u32
        } else {
            30
        }
    } else {
        30
    };

    let daily = get_daily_trends(&session_data, days, start_date.as_deref(), end_date.as_deref());

    Ok(daily)
}

/// Get cost trend for the last N days
///
/// Returns daily cost data with cumulative totals for chart visualization.
#[tauri::command]
pub async fn get_cost_trend(
    _state: tauri::State<'_, AppState>,
    days: Option<u32>,
) -> Result<Vec<CostTrendPoint>, String> {
    let days = days.unwrap_or(30);
    let session_data = collect_session_trend_data();

    let daily = get_daily_trends(&session_data, days, None, None);

    let mut cumulative = 0.0;
    Ok(daily.into_iter().map(|d| {
        cumulative += d.total_cost;
        CostTrendPoint {
            date: d.date,
            cost: d.total_cost,
            cumulative_cost: cumulative,
        }
    }).collect())
}

/// Get efficiency trend for the last N days
///
/// Returns daily efficiency data for chart visualization.
#[tauri::command]
pub async fn get_efficiency_trend(
    _state: tauri::State<'_, AppState>,
    days: Option<u32>,
) -> Result<Vec<EfficiencyTrendPoint>, String> {
    let days = days.unwrap_or(30);
    let session_data = collect_session_trend_data();

    let daily = get_daily_trends(&session_data, days, None, None);

    Ok(daily.into_iter().map(|d| {
        EfficiencyTrendPoint {
            date: d.date,
            efficiency: d.avg_efficiency,
            sessions: d.sessions,
        }
    }).collect())
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

    let per_turn_tokens: Vec<TurnTokens> = turns.iter().map(|t| {
        TurnTokens::new(t.input_tokens, t.output_tokens, t.cache_read_tokens, t.cache_write_5m_tokens, t.cache_write_1h_tokens)
    }).collect();

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
        per_turn_tokens: Some(per_turn_tokens),
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

            let per_turn_tokens: Vec<TurnTokens> = turns.iter().map(|t| {
                TurnTokens::new(t.input_tokens, t.output_tokens, t.cache_read_tokens, t.cache_write_5m_tokens, t.cache_write_1h_tokens)
            }).collect();

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
                per_turn_tokens: Some(per_turn_tokens),
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
    pub user_sessions: u32,
    pub subagent_sessions: u32,
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
    pub user_session_count: u32,
    pub subagent_session_count: u32,
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
    state: tauri::State<'_, AppState>,
    days: Option<u32>,
) -> Result<DashboardSummaryResponse, CommandError> {
    // Return cached result if still valid (TTL 30s) and for the same time range
    if let Ok(cache) = DASHBOARD_CACHE.lock() {
        if let Some(cached) = cache.get(days) {
            return Ok(cached);
        }
    }

    // Try DB aggregate query - the DB may have data from previous runs even before
    // preload completes. The total_sessions > 0 check handles the empty DB case.
    if let Some(db) = state.db.get() {
        if let Ok(agg) = db.with_connection(|conn| {
            db::queries::get_dashboard_summary_from_db(conn, days)
        }) {
            if agg.total_sessions > 0 {
                let result = DashboardSummaryResponse {
                    total_sessions: agg.total_sessions,
                    user_sessions: agg.user_sessions,
                    subagent_sessions: agg.subagent_sessions,
                    total_cost: agg.total_cost,
                    total_turns: agg.total_turns,
                    total_tokens: agg.total_tokens,
                    avg_cost_per_session: if agg.total_sessions > 0 { agg.total_cost / agg.total_sessions as f64 } else { 0.0 },
                    avg_turns_per_session: if agg.total_sessions > 0 { agg.total_turns as f64 / agg.total_sessions as f64 } else { 0.0 },
                    avg_efficiency_score: agg.avg_efficiency,
                    active_projects: agg.active_projects,
                };
                // Store in cache keyed by days
                if let Ok(mut cache) = DASHBOARD_CACHE.lock() {
                    cache.set(days, result.clone());
                }
                return Ok(result);
            }
        }
    }

    // Compute cutoff date if days is specified
    let cutoff = days.map(|d| chrono::Utc::now() - chrono::Duration::days(d as i64));

    // Use cached session list
    let sessions = get_cached_session_list();

    let mut unique_projects: HashSet<String> = HashSet::new();
    let mut total_cost = 0.0;
    let mut total_turns = 0u32;
    let mut total_tokens = 0u64;
    let mut global_cache_read = 0u64;
    let mut global_cache_write = 0u64;
    let mut processed_count = 0u32;
    let mut user_session_count = 0u32;
    let mut subagent_session_count = 0u32;

    // Process sessions, filtering by date range when specified
    for file_info in sessions {
        // Skip sessions from temporary/artifact paths
        let project_path = file_info.project_path.clone().unwrap_or_default();
        if !project_path.is_empty() && !is_real_user_project(&project_path) {
            continue;
        }

        if let Ok((turns, _)) = get_session_turns(&file_info.session_id) {
            if turns.is_empty() {
                continue;
            }

            // Filter by date if days is specified
            if let Some(cutoff_date) = cutoff {
                let started_at = &turns[0].started_at;
                if let Ok(parsed) = chrono::DateTime::parse_from_rfc3339(started_at) {
                    let utc_date = parsed.with_timezone(&chrono::Utc);
                    if utc_date < cutoff_date {
                        continue;
                    }
                }
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

            total_cost += total_breakdown.total_cost;
            total_turns += turns.len() as u32;
            total_tokens += session_tokens.total();
            processed_count += 1;

            // Track user vs subagent sessions
            if file_info.is_subagent {
                subagent_session_count += 1;
            } else {
                user_session_count += 1;
            }

            // Track unique projects only for sessions that pass the date filter
            if !project_path.is_empty() && is_real_user_project(&project_path) {
                unique_projects.insert(project_path);
            }

            // Accumulate global cache totals for CER calculation
            global_cache_read += session_tokens.total_cache_read;
            global_cache_write += session_tokens.total_cache_write();
        }
    }

    // Global CER = SUM(cache_read) / (SUM(cache_read) + SUM(cache_write))
    let total_cache = global_cache_read + global_cache_write;
    let avg_efficiency = if total_cache > 0 {
        Some(global_cache_read as f64 / total_cache as f64)
    } else {
        None
    };

    let result = DashboardSummaryResponse {
        total_sessions: processed_count as u32,
        user_sessions: user_session_count,
        subagent_sessions: subagent_session_count,
        total_cost,
        total_turns,
        total_tokens,
        avg_cost_per_session: if processed_count > 0 { total_cost / processed_count as f64 } else { 0.0 },
        avg_turns_per_session: if processed_count > 0 { total_turns as f64 / processed_count as f64 } else { 0.0 },
        avg_efficiency_score: avg_efficiency,
        active_projects: unique_projects.len() as u32,
    };

    // Store in cache keyed by days for subsequent requests
    if let Ok(mut cache) = DASHBOARD_CACHE.lock() {
        cache.set(days, result.clone());
    }

    Ok(result)
}

/// Get daily metrics efficiently
///
/// Returns aggregated metrics grouped by day using cached session data.
#[tauri::command]
pub async fn get_daily_metrics(
    state: tauri::State<'_, AppState>,
    days: Option<u32>,
) -> Result<Vec<DailyMetricsResponse>, CommandError> {
    if let Ok(cache) = DAILY_CACHE.lock() {
        if let Some(cached) = cache.get(days) {
            return Ok(cached);
        }
    }

    // Try DB aggregate query - the DB may have data from previous runs even before
    // preload completes. The !daily.is_empty() check handles the empty DB case.
    if let Some(db) = state.db.get() {
        if let Ok(daily) = db.with_connection(|conn| {
            db::queries::get_daily_metrics_from_db(conn, days)
        }) {
            if !daily.is_empty() {
                let mut result: Vec<DailyMetricsResponse> = daily.into_iter().map(|d| {
                    DailyMetricsResponse {
                        date: d.date,
                        session_count: d.session_count,
                        user_session_count: d.user_session_count,
                        subagent_session_count: d.subagent_session_count,
                        total_turns: d.total_turns,
                        total_cost: d.total_cost,
                        total_tokens: d.total_tokens,
                        avg_efficiency_score: d.avg_efficiency,
                    }
                }).collect();
                result.sort_by(|a, b| b.date.cmp(&a.date));
                if let Ok(mut cache) = DAILY_CACHE.lock() {
                    cache.set(days, result.clone());
                }
                return Ok(result);
            }
        }
    }

    let cutoff = days.map(|d| chrono::Utc::now() - chrono::Duration::days(d as i64));

    // Use cached session list
    let sessions = get_cached_session_list();

    // (session_count, user_session_count, subagent_session_count, total_turns, total_cost, total_tokens, efficiency_sum, efficiency_count)
    let mut by_date: HashMap<String, (u32, u32, u32, u32, f64, u64, f64, u32)> = HashMap::new();

    for file_info in sessions.iter() { // Process ALL sessions within date range
        // Skip sessions from temporary/artifact paths
        let project_path = file_info.project_path.clone().unwrap_or_default();
        if !project_path.is_empty() && !is_real_user_project(&project_path) {
            continue;
        }

        if let Ok((turns, _)) = get_session_turns(&file_info.session_id) {
            if turns.is_empty() {
                continue;
            }

            let started_at = &turns[0].started_at;

            // Parse date and check if within range (skip cutoff check when days is None = all time)
            if let Ok(parsed) = chrono::DateTime::parse_from_rfc3339(started_at) {
                let utc_date = parsed.with_timezone(&chrono::Utc);
                if let Some(cutoff_date) = cutoff {
                    if utc_date < cutoff_date {
                        continue;
                    }
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

                let entry = by_date.entry(date_key).or_insert((0, 0, 0, 0, 0.0, 0, 0.0, 0));
                entry.0 += 1; // session_count
                if file_info.is_subagent {
                    entry.2 += 1; // subagent_session_count
                } else {
                    entry.1 += 1; // user_session_count
                }
                entry.3 += turns.len() as u32; // total_turns
                entry.4 += total_breakdown.total_cost; // total_cost
                entry.5 += total; // total_tokens
                entry.6 += efficiency; // efficiency_sum
                entry.7 += 1; // efficiency_count
            }
        }
    }

    let mut result: Vec<DailyMetricsResponse> = by_date
        .into_iter()
        .map(|(date, (session_count, user_session_count, subagent_session_count, total_turns, total_cost, total_tokens, eff_sum, eff_count))| {
            DailyMetricsResponse {
                date,
                session_count,
                user_session_count,
                subagent_session_count,
                total_turns,
                total_cost,
                total_tokens,
                avg_efficiency_score: if eff_count > 0 { Some(eff_sum / eff_count as f64) } else { None },
            }
        })
        .collect();

    // Sort by date descending
    result.sort_by(|a, b| b.date.cmp(&a.date));

    if let Ok(mut cache) = DAILY_CACHE.lock() {
        cache.set(days, result.clone());
    }

    Ok(result)
}

/// Get project metrics efficiently
///
/// Returns metrics grouped by project path using cached session data.
/// Accepts an optional `days` parameter to filter to recent sessions.
#[tauri::command]
pub async fn get_project_metrics(
    state: tauri::State<'_, AppState>,
    days: Option<u32>,
) -> Result<Vec<ProjectMetricsResponse>, CommandError> {
    if let Ok(cache) = PROJECT_CACHE.lock() {
        if let Some(cached) = cache.get(days) {
            return Ok(cached);
        }
    }

    // Try DB aggregate query - the DB may have data from previous runs even before
    // preload completes. The !projects.is_empty() check handles the empty DB case.
    if let Some(db) = state.db.get() {
        if let Ok(projects) = db.with_connection(|conn| {
            db::queries::get_project_metrics_from_db(conn, days)
        }) {
            if !projects.is_empty() {
                let mut result: Vec<ProjectMetricsResponse> = projects.into_iter().map(|p| {
                    ProjectMetricsResponse {
                        project_path: p.project_path,
                        project_name: p.project_name,
                        session_count: p.session_count,
                        total_cost: p.total_cost,
                        total_turns: p.total_turns,
                        total_tokens: p.total_tokens,
                        avg_cost_per_session: if p.session_count > 0 { p.total_cost / p.session_count as f64 } else { 0.0 },
                        last_activity: p.last_activity,
                    }
                }).collect();
                result.sort_by(|a, b| b.total_cost.partial_cmp(&a.total_cost).unwrap_or(std::cmp::Ordering::Equal));
                if let Ok(mut cache) = PROJECT_CACHE.lock() {
                    cache.set(days, result.clone());
                }
                return Ok(result);
            }
        }
    }

    // Compute cutoff date if days is specified
    let cutoff = days.map(|d| chrono::Utc::now() - chrono::Duration::days(d as i64));

    // Use cached session list
    let sessions = get_cached_session_list();

    let mut by_project: HashMap<String, (String, u32, f64, u32, u64, String)> = HashMap::new();
    // (project_name, session_count, total_cost, total_turns, total_tokens, last_activity)

    for file_info in sessions.iter() {
        let project_path = file_info.project_path.clone().unwrap_or_default();
        if project_path.is_empty() || !is_real_user_project(&project_path) {
            continue;
        }

        if let Ok((turns, _)) = get_session_turns(&file_info.session_id) {
            if turns.is_empty() {
                continue;
            }

            let started_at = turns[0].started_at.clone();

            // Filter by date if days is specified
            if let Some(cutoff_date) = cutoff {
                if let Ok(parsed) = chrono::DateTime::parse_from_rfc3339(&started_at) {
                    let utc_date = parsed.with_timezone(&chrono::Utc);
                    if utc_date < cutoff_date {
                        continue;
                    }
                }
            }

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

    if let Ok(mut cache) = PROJECT_CACHE.lock() {
        cache.set(days, result.clone());
    }

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
            total: 3650, // 1000+500+2000+100+50
            context_used_pct: 75.0, // 0-100 scale
        };

        let json = serde_json::to_string(&summary).unwrap();
        assert!(json.contains("\"input\":1000"));
        assert!(json.contains("\"context_used_pct\":75.0"));
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
            has_subagents: false,
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

import { invoke } from '@tauri-apps/api/core';
import type {
  SessionSummary,
  SessionDetail,
  SessionMetrics,
  TurnSummary,
  DashboardSummary,
  DailyMetrics,
  ProjectMetrics,
  DateRange,
} from '../types';

// ============================================================================
// Session Commands
// ============================================================================

/** Get all sessions with pagination */
export async function getSessions(limit = 50, offset = 0): Promise<SessionSummary[]> {
  return invoke('get_sessions', { limit, offset });
}

/** Get a single session by ID with full details */
export async function getSession(id: string): Promise<SessionDetail | null> {
  return invoke('get_session', { id });
}

/** Get session metrics by ID */
export async function getSessionMetrics(id: string): Promise<SessionMetrics | null> {
  return invoke('get_session_metrics', { id });
}

/** Get turns for a session with pagination */
export async function getTurns(sessionId: string, limit = 100, offset = 0): Promise<TurnSummary[]> {
  return invoke('get_turns', { sessionId, limit, offset });
}

/** Get total session count */
export async function getSessionCount(): Promise<number> {
  return invoke('get_session_count');
}

/** Scan for new sessions (returns only newly discovered ones) */
export async function scanNewSessions(knownIds: string[]): Promise<SessionSummary[]> {
  return invoke('scan_new_sessions', { knownIds });
}

/** Preload all sessions into cache at startup - call this once when app starts */
export async function preloadAllSessions(): Promise<number> {
  return invoke('preload_all_sessions');
}

/** Get sessions filtered by date range (uses cached data for efficiency) */
export async function getSessionsFiltered(
  startDate?: string,
  endDate?: string,
  limit = 100,
  offset = 0
): Promise<SessionSummary[]> {
  return invoke('get_sessions_filtered', {
    startDate: startDate ?? null,
    endDate: endDate ?? null,
    limit,
    offset,
  });
}

// ============================================================================
// Dashboard/Aggregate Commands
// ============================================================================

/** Get dashboard summary metrics (using efficient backend command) */
export async function getDashboardSummary(_dateRange?: DateRange): Promise<DashboardSummary> {
  // Use the efficient backend command that limits processing
  return invoke('get_dashboard_summary', { limit: 100 });
}

/** Get daily metrics for charts (using efficient backend command) */
export async function getDailyMetrics(_dateRange?: DateRange): Promise<DailyMetrics[]> {
  // Use the efficient backend command
  return invoke('get_daily_metrics', { days: 30 });
}

/** Get project-level metrics (using efficient backend command) */
export async function getProjectMetrics(): Promise<ProjectMetrics[]> {
  // Use the efficient backend command
  return invoke('get_project_metrics', { limit: 20 });
}

// ============================================================================
// Data Management Commands
// ============================================================================

/** Force refresh of session cache */
export async function refreshData(): Promise<void> {
  return invoke('refresh_sessions');
}

/** Get the database path */
export async function getDbPath(): Promise<string> {
  return invoke('get_db_path');
}

// ============================================================================
// Settings Types and Commands
// ============================================================================

export interface AppSettings {
  claudeHomePath: string;
  autoRefresh: boolean;
  refreshIntervalMinutes: number;
  theme: 'light' | 'dark' | 'system';
}

// Settings are managed client-side for now
const DEFAULT_SETTINGS: AppSettings = {
  claudeHomePath: '~/.claude',
  autoRefresh: true,
  refreshIntervalMinutes: 5,
  theme: 'dark',
};

export async function getSettings(): Promise<AppSettings> {
  // Load from localStorage
  const stored = localStorage.getItem('claude-analytics-settings');
  if (stored) {
    try {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
    } catch {
      return DEFAULT_SETTINGS;
    }
  }
  return DEFAULT_SETTINGS;
}

export async function updateSettings(settings: Partial<AppSettings>): Promise<void> {
  const current = await getSettings();
  const updated = { ...current, ...settings };
  localStorage.setItem('claude-analytics-settings', JSON.stringify(updated));
}

// ============================================================================
// Legacy Compatibility (will be removed)
// ============================================================================

/** @deprecated Use getSession instead */
export async function getSessionsByProject(projectPath: string): Promise<SessionSummary[]> {
  // Limit to 100 sessions for performance
  const sessions = await getSessions(100, 0);
  return sessions.filter(s => s.project_path === projectPath);
}

/** @deprecated Use getSessionsFiltered instead for efficient backend filtering */
export async function getSessionsByDateRange(dateRange: DateRange): Promise<SessionSummary[]> {
  return getSessionsFiltered(dateRange.start, dateRange.end);
}

/** @deprecated No longer needed */
export async function getLastSyncTime(): Promise<string | null> {
  return new Date().toISOString();
}

/** @deprecated Use getProjectMetrics instead */
export async function getModelMetrics(): Promise<{ model: string; usage_count: number; total_cost: number }[]> {
  // Limit to 100 sessions for performance
  const sessions = await getSessions(100, 0);

  const byModel = new Map<string, { count: number; cost: number }>();

  for (const session of sessions) {
    const model = session.model || 'unknown';
    const current = byModel.get(model) || { count: 0, cost: 0 };
    byModel.set(model, {
      count: current.count + 1,
      cost: current.cost + session.total_cost,
    });
  }

  return Array.from(byModel.entries()).map(([model, data]) => ({
    model,
    usage_count: data.count,
    total_cost: data.cost,
  }));
}

/** @deprecated Not implemented in new backend */
export async function getToolUsage(): Promise<{ tool_name: string; usage_count: number }[]> {
  return [];
}

/** @deprecated Use other export method */
export async function exportData(_format: 'csv' | 'json', _dateRange?: DateRange): Promise<string> {
  return '';
}

// ============================================================================
// Session Comparison Commands
// ============================================================================

/** Comparison metrics between sessions */
export interface MetricsComparison {
  cost_diff: number;
  token_diff: number;
  efficiency_diff: number;
  duration_diff: number;
}

/** Session comparison result */
export interface SessionComparisonResult {
  sessions: SessionSummary[];
  metrics_comparison: MetricsComparison;
}

/** Compare multiple sessions by IDs (2-3 sessions) */
export async function compareSessions(sessionIds: string[]): Promise<SessionComparisonResult> {
  return invoke('compare_sessions', { sessionIds });
}

// ============================================================================
// Anti-Pattern Detection and Recommendations
// ============================================================================

/** Detected anti-pattern from analysis */
export interface DetectedPattern {
  pattern_type: string;
  severity: string;  // 'critical' | 'warning' | 'info'
  session_id: string;
  turn_number?: number;
  description: string;
  impact_cost: number;
  suggestion: string;
}

/** Recommendation for improving Claude usage */
export interface Recommendation {
  rec_type: string;
  title: string;
  description: string;
  potential_savings: number;
  confidence: number;  // 0.0 to 1.0
  action_items: string[];
}

/** Detect anti-patterns in sessions */
export async function detectAntipatterns(sessionId?: string): Promise<DetectedPattern[]> {
  return invoke('detect_antipatterns', { sessionId });
}

/** Get recommendations for improving Claude usage */
export async function getRecommendations(sessionId?: string, limit?: number): Promise<Recommendation[]> {
  return invoke('get_recommendations', { sessionId, limit });
}

// ============================================================================
// Export Commands
// ============================================================================

/** Options for export operations */
export interface ExportOptions {
  /** Export format (csv or json) */
  format: 'csv' | 'json';
  /** Include turn-level details */
  include_turns: boolean;
  /** Include calculated metrics */
  include_metrics: boolean;
  /** Optional date range filter (start, end) in ISO-8601 format */
  date_range?: [string, string];
}

/**
 * Export sessions to CSV or JSON format.
 * @param sessionIds - Optional array of session IDs to export. If not provided, exports all sessions.
 * @param options - Export options including format, whether to include turns and metrics.
 * @returns The file path of the exported file.
 */
export async function exportSessions(
  sessionIds?: string[],
  options: ExportOptions = { format: 'csv', include_turns: false, include_metrics: true }
): Promise<string> {
  return invoke('export_sessions', { sessionIds, options });
}

/**
 * Export usage trends to CSV or JSON format.
 * Aggregates session data by day for the specified number of days.
 * @param days - Number of days to include in the export.
 * @param format - Export format (csv or json).
 * @returns The file path of the exported file.
 */
export async function exportTrends(days: number, format: 'csv' | 'json'): Promise<string> {
  return invoke('export_trends', { days, format });
}

// ============================================================================
// Trends Commands
// ============================================================================

/** Daily trend data point */
export interface DailyTrend {
  date: string;
  sessions: number;
  turns: number;
  total_tokens: number;
  total_cost: number;
  avg_efficiency: number;
}

/** Cost trend data point */
export interface CostTrendPoint {
  date: string;
  cost: number;
  cumulative_cost: number;
}

/** Efficiency trend data point */
export interface EfficiencyTrendPoint {
  date: string;
  efficiency: number;
  sessions: number;
}

/** Get daily trends within a date range */
export async function getTrends(
  startDate?: string,
  endDate?: string,
  granularity?: string
): Promise<DailyTrend[]> {
  try {
    return await invoke('get_trends', {
      startDate: startDate ?? null,
      endDate: endDate ?? null,
      granularity: granularity ?? 'daily',
    });
  } catch (error) {
    // Fallback to computing from sessions if backend doesn't support this command
    console.warn('get_trends not available, falling back to computed data:', error);
    return computeTrendsFromSessions(startDate, endDate);
  }
}

/** Get cost trend over specified number of days */
export async function getCostTrend(days?: number): Promise<CostTrendPoint[]> {
  try {
    return await invoke('get_cost_trend', { days: days ?? 30 });
  } catch (error) {
    console.warn('get_cost_trend not available, falling back to computed data:', error);
    return computeCostTrendFromSessions(days ?? 30);
  }
}

/** Get efficiency trend over specified number of days */
export async function getEfficiencyTrend(days?: number): Promise<EfficiencyTrendPoint[]> {
  try {
    return await invoke('get_efficiency_trend', { days: days ?? 30 });
  } catch (error) {
    console.warn('get_efficiency_trend not available, falling back to computed data:', error);
    return computeEfficiencyTrendFromSessions(days ?? 30);
  }
}

// ============================================================================
// Fallback Computations (when backend commands not available)
// ============================================================================

async function computeTrendsFromSessions(
  startDate?: string,
  endDate?: string
): Promise<DailyTrend[]> {
  // Limit to 100 sessions for fallback to avoid slow loads
  const sessions = await getSessions(100, 0);

  // Filter by date range
  const filteredSessions = sessions.filter((s) => {
    const date = s.started_at.split('T')[0];
    if (startDate && date < startDate) return false;
    if (endDate && date > endDate) return false;
    return true;
  });

  // Group by date
  const byDate = new Map<string, typeof filteredSessions>();
  for (const session of filteredSessions) {
    const date = session.started_at.split('T')[0];
    if (!byDate.has(date)) {
      byDate.set(date, []);
    }
    byDate.get(date)!.push(session);
  }

  // Convert to daily trends
  const trends: DailyTrend[] = [];
  for (const [date, daySessions] of byDate.entries()) {
    trends.push({
      date,
      sessions: daySessions.length,
      turns: daySessions.reduce((sum, s) => sum + s.total_turns, 0),
      total_tokens: daySessions.reduce((sum, s) => sum + s.total_tokens, 0),
      total_cost: daySessions.reduce((sum, s) => sum + s.total_cost, 0),
      avg_efficiency: 75, // Default efficiency when not available
    });
  }

  return trends.sort((a, b) => a.date.localeCompare(b.date));
}

async function computeCostTrendFromSessions(days: number): Promise<CostTrendPoint[]> {
  const now = new Date();
  const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000)
    .toISOString()
    .split('T')[0];

  // Limit to 100 sessions for fallback to avoid slow loads
  const sessions = await getSessions(100, 0);
  const filteredSessions = sessions.filter((s) => {
    const date = s.started_at.split('T')[0];
    return date >= startDate;
  });

  // Group by date
  const byDate = new Map<string, number>();
  for (const session of filteredSessions) {
    const date = session.started_at.split('T')[0];
    byDate.set(date, (byDate.get(date) || 0) + session.total_cost);
  }

  // Convert to sorted array with cumulative
  const sorted = Array.from(byDate.entries())
    .sort(([a], [b]) => a.localeCompare(b));

  let cumulative = 0;
  return sorted.map(([date, cost]) => {
    cumulative += cost;
    return { date, cost, cumulative_cost: cumulative };
  });
}

async function computeEfficiencyTrendFromSessions(days: number): Promise<EfficiencyTrendPoint[]> {
  const now = new Date();
  const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000)
    .toISOString()
    .split('T')[0];

  // Limit to 100 sessions for fallback to avoid slow loads
  const sessions = await getSessions(100, 0);
  const filteredSessions = sessions.filter((s) => {
    const date = s.started_at.split('T')[0];
    return date >= startDate;
  });

  // Group by date
  const byDate = new Map<string, { sessions: number }>();
  for (const session of filteredSessions) {
    const date = session.started_at.split('T')[0];
    if (!byDate.has(date)) {
      byDate.set(date, { sessions: 0 });
    }
    byDate.get(date)!.sessions += 1;
  }

  return Array.from(byDate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, data]) => ({
      date,
      efficiency: 75, // Default when not available
      sessions: data.sessions,
    }));
}

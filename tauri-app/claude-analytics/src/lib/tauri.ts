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

// ============================================================================
// Dashboard/Aggregate Commands
// ============================================================================

/** Get dashboard summary metrics (computed from session data) */
export async function getDashboardSummary(_dateRange?: DateRange): Promise<DashboardSummary> {
  // Since the backend doesn't have a dedicated dashboard summary command,
  // we compute it from sessions data
  const sessions = await getSessions(1000, 0);

  const uniqueProjects = new Set(sessions.map(s => s.project_path));

  const totalCost = sessions.reduce((sum, s) => sum + s.total_cost, 0);
  const totalTurns = sessions.reduce((sum, s) => sum + s.total_turns, 0);
  const totalTokens = sessions.reduce((sum, s) => sum + s.total_tokens, 0);

  return {
    total_sessions: sessions.length,
    total_cost: totalCost,
    total_turns: totalTurns,
    total_tokens: totalTokens,
    avg_cost_per_session: sessions.length > 0 ? totalCost / sessions.length : 0,
    avg_turns_per_session: sessions.length > 0 ? totalTurns / sessions.length : 0,
    avg_efficiency_score: null, // Computed from individual sessions
    active_projects: uniqueProjects.size,
  };
}

/** Get daily metrics for charts */
export async function getDailyMetrics(_dateRange?: DateRange): Promise<DailyMetrics[]> {
  // Compute daily metrics from sessions
  const sessions = await getSessions(1000, 0);

  // Group sessions by date
  const byDate = new Map<string, SessionSummary[]>();

  for (const session of sessions) {
    const date = session.started_at.split('T')[0];
    if (!byDate.has(date)) {
      byDate.set(date, []);
    }
    byDate.get(date)!.push(session);
  }

  // Convert to daily metrics
  const dailyMetrics: DailyMetrics[] = [];

  for (const [date, daySessions] of byDate.entries()) {
    dailyMetrics.push({
      date,
      session_count: daySessions.length,
      total_turns: daySessions.reduce((sum, s) => sum + s.total_turns, 0),
      total_cost: daySessions.reduce((sum, s) => sum + s.total_cost, 0),
      total_tokens: daySessions.reduce((sum, s) => sum + s.total_tokens, 0),
      avg_efficiency_score: null,
    });
  }

  // Sort by date descending
  dailyMetrics.sort((a, b) => b.date.localeCompare(a.date));

  return dailyMetrics;
}

/** Get project-level metrics */
export async function getProjectMetrics(): Promise<ProjectMetrics[]> {
  const sessions = await getSessions(1000, 0);

  // Group by project
  const byProject = new Map<string, SessionSummary[]>();

  for (const session of sessions) {
    const path = session.project_path;
    if (!byProject.has(path)) {
      byProject.set(path, []);
    }
    byProject.get(path)!.push(session);
  }

  // Convert to project metrics
  const projectMetrics: ProjectMetrics[] = [];

  for (const [path, projectSessions] of byProject.entries()) {
    const totalCost = projectSessions.reduce((sum, s) => sum + s.total_cost, 0);
    const lastActivity = projectSessions.reduce((latest, s) => {
      return s.started_at > latest ? s.started_at : latest;
    }, projectSessions[0].started_at);

    projectMetrics.push({
      project_path: path,
      project_name: projectSessions[0].project_name,
      session_count: projectSessions.length,
      total_cost: totalCost,
      total_turns: projectSessions.reduce((sum, s) => sum + s.total_turns, 0),
      total_tokens: projectSessions.reduce((sum, s) => sum + s.total_tokens, 0),
      avg_cost_per_session: projectSessions.length > 0 ? totalCost / projectSessions.length : 0,
      last_activity: lastActivity,
    });
  }

  // Sort by total cost descending
  projectMetrics.sort((a, b) => b.total_cost - a.total_cost);

  return projectMetrics;
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
  const sessions = await getSessions(1000, 0);
  return sessions.filter(s => s.project_path === projectPath);
}

/** @deprecated Use getSessions with date filtering instead */
export async function getSessionsByDateRange(dateRange: DateRange): Promise<SessionSummary[]> {
  const sessions = await getSessions(1000, 0);
  return sessions.filter(s => {
    const date = s.started_at.split('T')[0];
    return date >= dateRange.start && date <= dateRange.end;
  });
}

/** @deprecated No longer needed */
export async function getLastSyncTime(): Promise<string | null> {
  return new Date().toISOString();
}

/** @deprecated Use getProjectMetrics instead */
export async function getModelMetrics(): Promise<{ model: string; usage_count: number; total_cost: number }[]> {
  const sessions = await getSessions(1000, 0);

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

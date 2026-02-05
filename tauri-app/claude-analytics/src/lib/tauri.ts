import { invoke } from '@tauri-apps/api/core';
import type {
  Session,
  SessionDetail,
  DailyMetrics,
  ProjectMetrics,
  ModelMetrics,
  ToolUsage,
  DashboardSummary,
  DateRange,
} from '../types';

// Session queries
export async function getSessions(limit = 50, offset = 0): Promise<Session[]> {
  return invoke('get_sessions', { limit, offset });
}

export async function getSession(id: string): Promise<SessionDetail | null> {
  return invoke('get_session', { id });
}

export async function getSessionsByProject(projectPath: string): Promise<Session[]> {
  return invoke('get_sessions_by_project', { projectPath });
}

export async function getSessionsByDateRange(dateRange: DateRange): Promise<Session[]> {
  return invoke('get_sessions_by_date_range', { startDate: dateRange.start, endDate: dateRange.end });
}

// Metrics queries
export async function getDashboardSummary(dateRange?: DateRange): Promise<DashboardSummary> {
  return invoke('get_dashboard_summary', { dateRange });
}

export async function getDailyMetrics(dateRange?: DateRange): Promise<DailyMetrics[]> {
  return invoke('get_daily_metrics', { dateRange });
}

export async function getProjectMetrics(): Promise<ProjectMetrics[]> {
  return invoke('get_project_metrics');
}

export async function getModelMetrics(): Promise<ModelMetrics[]> {
  return invoke('get_model_metrics');
}

export async function getToolUsage(): Promise<ToolUsage[]> {
  return invoke('get_tool_usage');
}

// Data management
export async function refreshData(): Promise<void> {
  return invoke('refresh_data');
}

export async function getLastSyncTime(): Promise<string | null> {
  return invoke('get_last_sync_time');
}

// Settings
export interface AppSettings {
  claudeHomePath: string;
  autoRefresh: boolean;
  refreshIntervalMinutes: number;
  theme: 'light' | 'dark' | 'system';
}

export async function getSettings(): Promise<AppSettings> {
  return invoke('get_settings');
}

export async function updateSettings(settings: Partial<AppSettings>): Promise<void> {
  return invoke('update_settings', { settings });
}

// Export functionality
export async function exportData(format: 'csv' | 'json', dateRange?: DateRange): Promise<string> {
  return invoke('export_data', { format, dateRange });
}

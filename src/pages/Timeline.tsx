import { useState, useMemo } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { Header } from '../components/layout/Header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/Card';
import { GanttChart } from '../components/charts/GanttChart';
import type { GanttSession } from '../components/charts/GanttChart';
import { getSessionsFiltered, getSessions, getDashboardSummary } from '../lib/tauri';
import type { SessionSummary, DashboardSummary } from '../types';
import { formatCurrency, formatNumber, getProjectDisplayName } from '../lib/utils';
import {
  Calendar,
  Filter,
  BarChart3,
  Clock,
  DollarSign,
  FolderOpen,
  X,
} from 'lucide-react';

// ============================================================================
// Types
// ============================================================================

type TimeRange = '7d' | '30d' | '90d' | 'all';

// ============================================================================
// Helpers
// ============================================================================

/** Compute ISO date strings for the start of a time range */
function timeRangeToStartDate(range: TimeRange): string | undefined {
  if (range === 'all') return undefined;
  const days = range === '7d' ? 7 : range === '30d' ? 30 : 90;
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return cutoff.toISOString();
}

/** Convert TimeRange to days parameter for backend queries */
function timeRangeToDays(range: TimeRange): number | undefined {
  switch (range) {
    case '7d': return 7;
    case '30d': return 30;
    case '90d': return 90;
    case 'all': return undefined;
  }
}

// ============================================================================
// Component
// ============================================================================

function Timeline() {
  const [timeRange, setTimeRange] = useState<TimeRange>('30d');
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [hideSubagents, setHideSubagents] = useState(true);

  // Compute date range from the local time range selector
  const startDate = useMemo(() => timeRangeToStartDate(timeRange), [timeRange]);
  const summaryDays = useMemo(() => timeRangeToDays(timeRange), [timeRange]);

  // Fetch ALL sessions for the selected time range via the backend.
  // Used for the Gantt chart visualization (with client-side project/subagent filtering).
  const { data: sessions, isLoading } = useQuery<SessionSummary[]>({
    queryKey: ['timeline-sessions', startDate],
    queryFn: () => {
      if (startDate) {
        return getSessionsFiltered(startDate, undefined, 100000, 0);
      }
      return getSessions(100000, 0);
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });

  // Fetch dashboard summary for the summary cards.
  // Uses the same backend aggregate as the Dashboard page so numbers always match.
  const { data: summary, isLoading: summaryLoading } = useQuery<DashboardSummary>({
    queryKey: ['dashboardSummary', summaryDays],
    queryFn: () => getDashboardSummary(summaryDays),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    placeholderData: keepPreviousData,
  });

  // Apply client-side filters (project and subagent) on top of backend date filtering
  const filteredSessions = useMemo(() => {
    if (!sessions) return [];

    return sessions.filter((session) => {
      // Project filter - match by project_path for accurate grouping
      if (selectedProject && session.project_path !== selectedProject) {
        return false;
      }

      // Subagent filter
      if (hideSubagents && session.is_subagent) {
        return false;
      }

      return true;
    });
  }, [sessions, selectedProject, hideSubagents]);

  // Map SessionSummary to GanttSession
  const ganttSessions = useMemo<GanttSession[]>(() => {
    return filteredSessions.map((s) => ({
      id: s.id,
      project_name: s.project_name,
      project_path: s.project_path,
      started_at: s.started_at,
      ended_at: s.last_activity_at,
      duration_ms: s.duration_ms,
      model: s.model,
      total_cost: s.total_cost,
      total_turns: s.total_turns,
      is_subagent: s.is_subagent,
    }));
  }, [filteredSessions]);

  // Get unique projects for the filter dropdown (keyed by path, showing readable name)
  // Safety net: exclude non-user projects (temp/artifact paths)
  const projectOptions = useMemo(() => {
    if (!sessions) return [];
    const pathMap = new Map<string, string>();
    for (const s of sessions) {
      const path = s.project_path || s.project_name || 'Unknown';
      // Only include real user projects
      if (!path.includes('/Users/') && !path.includes('-Users-')) continue;
      if (!pathMap.has(path)) {
        // Extract disambiguated display name (strips /Users/<username>/ prefix)
        const displayName = getProjectDisplayName(path);
        pathMap.set(path, displayName);
      }
    }
    return Array.from(pathMap.entries())
      .map(([path, name]) => ({ path, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [sessions]);

  // Summary loading state: loading if either sessions or summary is loading
  const statsLoading = isLoading || summaryLoading;

  return (
    <div className="flex flex-col">
      <Header
        title="Timeline"
        subtitle="Gantt chart of sessions across projects over time"
      />

      <div className="flex-1 space-y-6 p-6">
        {/* Controls Row */}
        <Card>
          <CardContent className="flex flex-wrap items-center gap-4 py-3">
            {/* Time range selector */}
            <div className="flex items-center gap-3">
              <Calendar className="h-5 w-5 text-gray-400 shrink-0" />
              <div className="flex gap-2">
                {(['7d', '30d', '90d', 'all'] as TimeRange[]).map((range) => (
                  <button
                    key={range}
                    onClick={() => setTimeRange(range)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      timeRange === range
                        ? 'bg-[var(--color-primary-600)] text-white'
                        : 'bg-[var(--color-background)] text-gray-400 hover:text-white hover:bg-gray-700'
                    }`}
                  >
                    {range === '7d'
                      ? 'Last 7 Days'
                      : range === '30d'
                      ? 'Last 30 Days'
                      : range === '90d'
                      ? 'Last 90 Days'
                      : 'All Time'}
                  </button>
                ))}
              </div>
            </div>

            {/* Divider */}
            <div className="h-8 w-px bg-[var(--color-border)]" />

            {/* Project filter */}
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-gray-400 shrink-0" />
              <select
                value={selectedProject ?? ''}
                onChange={(e) =>
                  setSelectedProject(e.target.value || null)
                }
                className="rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm text-gray-200 focus:border-[var(--color-primary-500)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary-500)]"
              >
                <option value="">All Projects</option>
                {projectOptions.map(({ path, name }) => (
                  <option key={path} value={path}>
                    {name}
                  </option>
                ))}
              </select>
              {selectedProject && (
                <button
                  onClick={() => setSelectedProject(null)}
                  className="rounded-md p-1 text-gray-400 hover:bg-gray-700 hover:text-white"
                  title="Clear project filter"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            {/* Subagent toggle */}
            <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={hideSubagents}
                onChange={(e) => setHideSubagents(e.target.checked)}
                className="rounded border-gray-600 bg-gray-800 text-[var(--color-primary-500)] focus:ring-[var(--color-primary-500)] focus:ring-offset-0"
              />
              Hide subagents
            </label>
          </CardContent>
        </Card>

        {/* Summary Stats (uses same backend aggregate as Dashboard for consistency) */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Card>
            <CardContent className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-gray-400">Sessions</p>
                <p className="mt-1 text-2xl font-bold text-white">
                  {statsLoading ? (
                    <span className="inline-block h-8 w-16 animate-pulse rounded bg-gray-700" />
                  ) : (
                    formatNumber(summary?.total_sessions ?? 0)
                  )}
                </p>
              </div>
              <div className="rounded-lg bg-[var(--color-primary-600)]/20 p-3">
                <BarChart3 className="h-6 w-6 text-[var(--color-primary-400)]" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-gray-400">Projects</p>
                <p className="mt-1 text-2xl font-bold text-white">
                  {statsLoading ? (
                    <span className="inline-block h-8 w-16 animate-pulse rounded bg-gray-700" />
                  ) : (
                    formatNumber(summary?.active_projects ?? 0)
                  )}
                </p>
              </div>
              <div className="rounded-lg bg-purple-600/20 p-3">
                <FolderOpen className="h-6 w-6 text-purple-400" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-gray-400">Total Cost</p>
                <p className="mt-1 text-2xl font-bold text-white">
                  {statsLoading ? (
                    <span className="inline-block h-8 w-16 animate-pulse rounded bg-gray-700" />
                  ) : (
                    formatCurrency(summary?.total_cost ?? 0)
                  )}
                </p>
              </div>
              <div className="rounded-lg bg-green-600/20 p-3">
                <DollarSign className="h-6 w-6 text-green-400" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-gray-400">Total Turns</p>
                <p className="mt-1 text-2xl font-bold text-white">
                  {statsLoading ? (
                    <span className="inline-block h-8 w-16 animate-pulse rounded bg-gray-700" />
                  ) : (
                    formatNumber(summary?.total_turns ?? 0)
                  )}
                </p>
              </div>
              <div className="rounded-lg bg-amber-600/20 p-3">
                <Clock className="h-6 w-6 text-amber-400" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Gantt Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Session Timeline</CardTitle>
            <CardDescription>
              Each bar represents a session. Click a bar to view session details. Overlapping sessions within a project are stacked.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex h-64 items-center justify-center">
                <div className="animate-pulse text-gray-500">Loading sessions...</div>
              </div>
            ) : ganttSessions.length === 0 ? (
              <div className="flex h-64 flex-col items-center justify-center">
                <Calendar className="h-12 w-12 text-gray-600" />
                <p className="mt-4 text-lg font-medium text-gray-400">
                  No sessions found
                </p>
                <p className="mt-1 text-sm text-gray-500">
                  {selectedProject
                    ? 'Try selecting a different project or time range'
                    : 'Sessions will appear here once you use Claude Code'}
                </p>
              </div>
            ) : (
              <GanttChart sessions={ganttSessions} />
            )}
          </CardContent>
        </Card>

        {/* Legend */}
        <Card>
          <CardContent className="flex flex-wrap items-center gap-6 py-3">
            <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">Legend:</span>
            <div className="flex items-center gap-2">
              <div className="h-3 w-8 rounded-sm bg-gray-500 opacity-80" />
              <span className="text-xs text-gray-400">Session bar (color = project)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative h-3 w-8 rounded-sm bg-gray-500 opacity-80">
                <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-2 w-2 rounded-full bg-black/50 border border-white" />
              </div>
              <span className="text-xs text-gray-400">Subagent session</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-6 w-0.5 bg-red-500 opacity-70" />
              <span className="text-xs text-gray-400">Current time</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default Timeline;

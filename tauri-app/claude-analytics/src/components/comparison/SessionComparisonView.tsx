import { useState, useMemo, useCallback, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  BarChart,
  Bar,
} from 'recharts';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/Card';
import { Button } from '../ui/Button';
import {
  formatCurrency,
  formatNumber,
  formatCompactNumber,
  formatDuration,
  cn,
} from '../../lib/utils';
import { compareSessions, getSessions, getSession, getTurns } from '../../lib/tauri';
import type { SessionSummary, SessionDetail, TurnSummary } from '../../types';
import {
  Plus,
  X,
  TrendingUp,
  TrendingDown,
  Search,
  Download,
  Trophy,
  AlertCircle,
} from 'lucide-react';

interface SessionSelectorProps {
  selectedId: string | null;
  onSelect: (id: string) => void;
  onRemove: () => void;
  index: number;
  excludeIds: string[];
  sessions: SessionSummary[];
  isLoading?: boolean;
}

function SessionSelector({
  selectedId,
  onSelect,
  onRemove,
  index,
  excludeIds,
  sessions,
  isLoading,
}: SessionSelectorProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);

  const filteredSessions = useMemo(() => {
    return sessions
      .filter((s) => !excludeIds.includes(s.id))
      .filter(
        (s) =>
          s.project_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          s.id.toLowerCase().includes(searchQuery.toLowerCase())
      )
      .slice(0, 10);
  }, [sessions, excludeIds, searchQuery]);

  const selectedSession = sessions.find((s) => s.id === selectedId);

  const colors = ['bg-blue-500', 'bg-green-500', 'bg-purple-500'];
  const color = colors[index % colors.length];

  if (selectedSession) {
    return (
      <div className={cn('rounded-lg border-2 p-4', `border-${color.replace('bg-', '')}`)}>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <div className={cn('h-3 w-3 rounded-full', color)} />
            <span className="font-semibold text-white">{selectedSession.project_name}</span>
          </div>
          <button
            onClick={onRemove}
            className="text-gray-400 hover:text-white transition-colors"
            title="Remove from comparison"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-1 text-xs text-gray-400 truncate">{selectedSession.id}</p>
        <div className="mt-2 flex items-center gap-3 text-sm text-gray-300">
          <span>{formatCurrency(selectedSession.total_cost)}</span>
          <span>{formatCompactNumber(selectedSession.total_tokens)} tokens</span>
          <span>{selectedSession.total_turns} turns</span>
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      <div
        className="rounded-lg border-2 border-dashed border-gray-600 p-4 cursor-pointer hover:border-gray-500 transition-colors"
        onClick={() => setIsOpen(true)}
      >
        <div className="flex items-center justify-center gap-2 text-gray-400">
          <Plus className="h-5 w-5" />
          <span>Add Session {index + 1}</span>
        </div>
      </div>

      {isOpen && (
        <div className="absolute z-50 top-full left-0 right-0 mt-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] shadow-lg">
          <div className="p-2 border-b border-[var(--color-border)]">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search sessions..."
                className="w-full rounded bg-[var(--color-background)] pl-8 pr-3 py-2 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-1 focus:ring-[var(--color-primary-500)]"
                autoFocus
              />
            </div>
          </div>
          <div className="max-h-64 overflow-y-auto">
            {isLoading ? (
              <div className="p-4 text-center text-gray-400">Loading sessions...</div>
            ) : filteredSessions.length === 0 ? (
              <div className="p-4 text-center text-gray-400">No sessions found</div>
            ) : (
              filteredSessions.map((session) => (
                <button
                  key={session.id}
                  onClick={() => {
                    onSelect(session.id);
                    setIsOpen(false);
                    setSearchQuery('');
                  }}
                  className="w-full text-left p-3 hover:bg-gray-800 transition-colors"
                >
                  <div className="font-medium text-white">{session.project_name}</div>
                  <div className="text-xs text-gray-400 truncate">{session.id}</div>
                  <div className="mt-1 flex items-center gap-3 text-xs text-gray-500">
                    <span>{formatCurrency(session.total_cost)}</span>
                    <span>{session.total_turns} turns</span>
                    <span>{new Date(session.started_at).toLocaleDateString()}</span>
                  </div>
                </button>
              ))
            )}
          </div>
          <div className="p-2 border-t border-[var(--color-border)]">
            <button
              onClick={() => {
                setIsOpen(false);
                setSearchQuery('');
              }}
              className="w-full text-center text-sm text-gray-400 hover:text-white py-1"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

interface MetricCardProps {
  label: string;
  values: (number | null)[];
  format: 'currency' | 'number' | 'duration' | 'percent' | 'compact';
  higherIsBetter?: boolean;
  sessions: SessionSummary[];
}

function MetricCard({ label, values, format, higherIsBetter = false, sessions }: MetricCardProps) {
  const colors = ['text-blue-400', 'text-green-400', 'text-purple-400'];

  const formatValue = (value: number | null): string => {
    if (value === null) return '-';
    switch (format) {
      case 'currency':
        return formatCurrency(value);
      case 'number':
        return formatNumber(value);
      case 'compact':
        return formatCompactNumber(value);
      case 'duration':
        return formatDuration(value / 1000);
      case 'percent':
        return `${(value * 100).toFixed(1)}%`;
      default:
        return String(value);
    }
  };

  // Find best and worst values
  const validValues = values.filter((v): v is number => v !== null);
  const bestValue = higherIsBetter ? Math.max(...validValues) : Math.min(...validValues);
  const worstValue = higherIsBetter ? Math.min(...validValues) : Math.max(...validValues);

  // Calculate differences from first session
  const diffs = values.map((v, i) => {
    if (i === 0 || v === null || values[0] === null) return null;
    return v - values[0];
  });

  return (
    <Card>
      <CardContent>
        <p className="text-sm font-medium text-gray-400 mb-3">{label}</p>
        <div className="space-y-2">
          {sessions.map((session, i) => {
            const value = values[i];
            const diff = diffs[i];
            const isBest = value === bestValue && validValues.length > 1;
            const isWorst = value === worstValue && validValues.length > 1;

            return (
              <div key={session.id} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div
                    className={cn(
                      'h-2 w-2 rounded-full',
                      i === 0 ? 'bg-blue-500' : i === 1 ? 'bg-green-500' : 'bg-purple-500'
                    )}
                  />
                  <span className="text-xs text-gray-500 truncate max-w-[100px]">
                    {session.project_name}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={cn('font-semibold', colors[i % colors.length])}>
                    {formatValue(value)}
                  </span>
                  {isBest && (
                    <Trophy className="h-3 w-3 text-yellow-400" aria-label="Best" />
                  )}
                  {isWorst && validValues.length > 1 && (
                    <AlertCircle className="h-3 w-3 text-red-400" aria-label="Worst" />
                  )}
                  {diff !== null && diff !== 0 && (
                    <span
                      className={cn(
                        'text-xs flex items-center',
                        (diff > 0 && higherIsBetter) || (diff < 0 && !higherIsBetter)
                          ? 'text-green-400'
                          : 'text-red-400'
                      )}
                    >
                      {diff > 0 ? (
                        <TrendingUp className="h-3 w-3 mr-0.5" />
                      ) : (
                        <TrendingDown className="h-3 w-3 mr-0.5" />
                      )}
                      {format === 'currency'
                        ? formatCurrency(Math.abs(diff))
                        : format === 'percent'
                        ? `${(Math.abs(diff) * 100).toFixed(1)}%`
                        : formatCompactNumber(Math.abs(diff))}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

interface ComparisonChartProps {
  sessions: SessionSummary[];
  turnsData: Map<string, TurnSummary[]>;
  metric: 'cost' | 'tokens';
}

function ComparisonChart({ sessions, turnsData, metric }: ComparisonChartProps) {
  const colors = ['#3b82f6', '#10b981', '#a855f7'];

  // Build cumulative data for each session
  const chartData = useMemo(() => {
    const maxTurns = Math.max(...sessions.map((s) => s.total_turns));
    const data: Array<{ turn: number } & Record<string, number>> = [];

    for (let turn = 1; turn <= maxTurns; turn++) {
      const point: { turn: number } & Record<string, number> = { turn };

      sessions.forEach((session, index) => {
        const turns = turnsData.get(session.id) || [];
        const cumulative = turns
          .filter((t) => t.turn_number <= turn)
          .reduce((sum, t) => sum + (metric === 'cost' ? t.cost : t.tokens.total), 0);
        point[`session${index}`] = cumulative;
      });

      data.push(point);
    }

    return data;
  }, [sessions, turnsData, metric]);

  const title = metric === 'cost' ? 'Cumulative Cost Over Turns' : 'Cumulative Tokens Over Turns';
  const formatter = metric === 'cost' ? formatCurrency : formatCompactNumber;

  return (
    <Card className="h-80">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2e" />
            <XAxis
              dataKey="turn"
              stroke="#6b7280"
              fontSize={12}
              tickLine={false}
              label={{ value: 'Turn', position: 'bottom', offset: -5, fill: '#6b7280' }}
            />
            <YAxis
              stroke="#6b7280"
              fontSize={12}
              tickLine={false}
              tickFormatter={(value) => formatter(value)}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#1a1a1c',
                border: '1px solid #2a2a2e',
                borderRadius: '8px',
              }}
              labelStyle={{ color: '#fff' }}
              formatter={(value, name) => {
                const index = parseInt(String(name).replace('session', ''));
                const session = sessions[index];
                return [formatter(value as number), session?.project_name || name];
              }}
            />
            <Legend
              formatter={(value) => {
                const index = parseInt(value.replace('session', ''));
                return sessions[index]?.project_name || value;
              }}
            />
            {sessions.map((_, index) => (
              <Line
                key={index}
                type="monotone"
                dataKey={`session${index}`}
                name={`session${index}`}
                stroke={colors[index]}
                strokeWidth={2}
                dot={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

interface ToolDistributionChartProps {
  sessions: SessionSummary[];
  sessionDetails: Map<string, SessionDetail>;
}

function ToolDistributionChart({ sessions, sessionDetails }: ToolDistributionChartProps) {
  const colors = ['#3b82f6', '#10b981', '#a855f7'];

  // Collect all tools across sessions
  const allTools = new Set<string>();
  sessions.forEach((session) => {
    const detail = sessionDetails.get(session.id);
    if (detail?.metrics.unique_tools) {
      detail.metrics.unique_tools.forEach((tool) => allTools.add(tool));
    }
  });

  // Build data for bar chart
  const chartData = useMemo(() => {
    return Array.from(allTools).map((tool) => {
      const point: Record<string, string | number> = { tool };
      sessions.forEach((session, index) => {
        const detail = sessionDetails.get(session.id);
        const toolCount = detail?.metrics.unique_tools.filter((t) => t === tool).length || 0;
        point[`session${index}`] = toolCount;
      });
      return point;
    });
  }, [sessions, sessionDetails, allTools]);

  if (chartData.length === 0) {
    return (
      <Card className="h-80">
        <CardHeader>
          <CardTitle>Tool Usage Comparison</CardTitle>
        </CardHeader>
        <CardContent className="flex h-56 items-center justify-center">
          <div className="text-gray-500">No tool data available</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-80">
      <CardHeader>
        <CardTitle>Tool Usage Comparison</CardTitle>
      </CardHeader>
      <CardContent className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2e" />
            <XAxis
              dataKey="tool"
              stroke="#6b7280"
              fontSize={10}
              tickLine={false}
              angle={-45}
              textAnchor="end"
              height={60}
            />
            <YAxis stroke="#6b7280" fontSize={12} tickLine={false} />
            <Tooltip
              contentStyle={{
                backgroundColor: '#1a1a1c',
                border: '1px solid #2a2a2e',
                borderRadius: '8px',
              }}
              labelStyle={{ color: '#fff' }}
              formatter={(value, name) => {
                const index = parseInt(String(name).replace('session', ''));
                const session = sessions[index];
                return [value, session?.project_name || name];
              }}
            />
            <Legend
              formatter={(value) => {
                const index = parseInt(value.replace('session', ''));
                return sessions[index]?.project_name || value;
              }}
            />
            {sessions.map((_, index) => (
              <Bar
                key={index}
                dataKey={`session${index}`}
                name={`session${index}`}
                fill={colors[index]}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

interface SessionComparisonViewProps {
  initialSessionIds?: string[];
}

export function SessionComparisonView({ initialSessionIds }: SessionComparisonViewProps) {
  // Initialize with provided IDs or default to two empty slots
  const [selectedIds, setSelectedIds] = useState<(string | null)[]>(() => {
    if (initialSessionIds && initialSessionIds.length > 0) {
      // Fill with provided IDs, ensure at least 2 slots
      const ids: (string | null)[] = initialSessionIds.slice(0, 3);
      while (ids.length < 2) {
        ids.push(null);
      }
      return ids;
    }
    return [null, null];
  });
  const [exportLoading, setExportLoading] = useState(false);

  // Update selected IDs when initialSessionIds changes (e.g., from URL navigation)
  useEffect(() => {
    if (initialSessionIds && initialSessionIds.length > 0) {
      const ids: (string | null)[] = initialSessionIds.slice(0, 3);
      while (ids.length < 2) {
        ids.push(null);
      }
      setSelectedIds(ids);
    }
  }, [initialSessionIds]);

  // Fetch all sessions for the selector
  const { data: allSessions = [], isLoading: sessionsLoading } = useQuery({
    queryKey: ['sessions', 1000, 0],
    queryFn: () => getSessions(1000, 0),
  });

  // Fetch comparison data when we have at least 2 sessions selected
  const validSelectedIds = selectedIds.filter((id): id is string => id !== null);
  const canCompare = validSelectedIds.length >= 2;

  const { data: comparisonResult, isLoading: comparisonLoading } = useQuery({
    queryKey: ['comparison', validSelectedIds],
    queryFn: () => compareSessions(validSelectedIds),
    enabled: canCompare,
  });

  // Fetch detailed session data
  const sessionDetailsQueries = validSelectedIds.map((id) =>
    useQuery({
      queryKey: ['session', id],
      queryFn: () => getSession(id),
      enabled: !!id,
    })
  );

  // Fetch turns data for charts
  const turnsQueries = validSelectedIds.map((id) =>
    useQuery({
      queryKey: ['turns', id, 1000, 0],
      queryFn: () => getTurns(id, 1000, 0),
      enabled: !!id,
    })
  );

  const sessionDetails = useMemo(() => {
    const map = new Map<string, SessionDetail>();
    sessionDetailsQueries.forEach((query, index) => {
      if (query.data) {
        map.set(validSelectedIds[index], query.data);
      }
    });
    return map;
  }, [sessionDetailsQueries, validSelectedIds]);

  const turnsData = useMemo(() => {
    const map = new Map<string, TurnSummary[]>();
    turnsQueries.forEach((query, index) => {
      if (query.data) {
        map.set(validSelectedIds[index], query.data);
      }
    });
    return map;
  }, [turnsQueries, validSelectedIds]);

  const handleSelectSession = useCallback((index: number, id: string) => {
    setSelectedIds((prev) => {
      const newIds = [...prev];
      newIds[index] = id;
      return newIds;
    });
  }, []);

  const handleRemoveSession = useCallback((index: number) => {
    setSelectedIds((prev) => {
      const newIds = [...prev];
      newIds[index] = null;
      return newIds;
    });
  }, []);

  const handleAddSlot = useCallback(() => {
    if (selectedIds.length < 3) {
      setSelectedIds((prev) => [...prev, null]);
    }
  }, [selectedIds.length]);

  const handleExportComparison = useCallback(async () => {
    if (!comparisonResult) return;

    setExportLoading(true);
    try {
      const data = {
        exportedAt: new Date().toISOString(),
        sessions: comparisonResult.sessions,
        metricsComparison: comparisonResult.metrics_comparison,
        sessionDetails: Array.from(sessionDetails.entries()).map(([id, detail]) => ({
          id,
          metrics: detail.metrics,
        })),
      };

      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `session-comparison-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } finally {
      setExportLoading(false);
    }
  }, [comparisonResult, sessionDetails]);

  const sessions = comparisonResult?.sessions || [];
  const excludeIds = selectedIds.filter((id): id is string => id !== null);

  return (
    <div className="space-y-6">
      {/* Session Selectors */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Select Sessions to Compare</CardTitle>
          <div className="flex items-center gap-2">
            {selectedIds.length < 3 && (
              <Button variant="ghost" size="sm" onClick={handleAddSlot}>
                <Plus className="h-4 w-4 mr-1" />
                Add Session
              </Button>
            )}
            {canCompare && (
              <Button
                variant="secondary"
                size="sm"
                onClick={handleExportComparison}
                isLoading={exportLoading}
              >
                <Download className="h-4 w-4 mr-1" />
                Export
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {selectedIds.map((id, index) => (
              <SessionSelector
                key={index}
                selectedId={id}
                onSelect={(newId) => handleSelectSession(index, newId)}
                onRemove={() => handleRemoveSession(index)}
                index={index}
                excludeIds={excludeIds.filter((_, i) => i !== index)}
                sessions={allSessions}
                isLoading={sessionsLoading}
              />
            ))}
          </div>
          {!canCompare && (
            <p className="mt-4 text-center text-sm text-gray-400">
              Select at least 2 sessions to compare
            </p>
          )}
        </CardContent>
      </Card>

      {/* Loading state */}
      {comparisonLoading && canCompare && (
        <div className="text-center py-8">
          <div className="animate-spin h-8 w-8 border-2 border-[var(--color-primary-500)] border-t-transparent rounded-full mx-auto" />
          <p className="mt-2 text-gray-400">Loading comparison...</p>
        </div>
      )}

      {/* Comparison Results */}
      {comparisonResult && sessions.length >= 2 && (
        <>
          {/* Summary Comparison */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <MetricCard
              label="Total Cost"
              values={sessions.map((s) => s.total_cost)}
              format="currency"
              higherIsBetter={false}
              sessions={sessions}
            />
            <MetricCard
              label="Total Tokens"
              values={sessions.map((s) => s.total_tokens)}
              format="compact"
              higherIsBetter={false}
              sessions={sessions}
            />
            <MetricCard
              label="Duration"
              values={sessions.map((s) => s.duration_ms)}
              format="duration"
              higherIsBetter={false}
              sessions={sessions}
            />
            <MetricCard
              label="Turn Count"
              values={sessions.map((s) => s.total_turns)}
              format="number"
              higherIsBetter={false}
              sessions={sessions}
            />
            <MetricCard
              label="Efficiency Score"
              values={sessions.map((s) => {
                const detail = sessionDetails.get(s.id);
                return detail?.metrics.efficiency.oes_score ?? null;
              })}
              format="percent"
              higherIsBetter={true}
              sessions={sessions}
            />
            <MetricCard
              label="Cache Efficiency (CER)"
              values={sessions.map((s) => {
                const detail = sessionDetails.get(s.id);
                return detail?.metrics.efficiency.cer ?? null;
              })}
              format="percent"
              higherIsBetter={true}
              sessions={sessions}
            />
          </div>

          {/* Efficiency Grades */}
          <Card>
            <CardHeader>
              <CardTitle>Efficiency Grades</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-around">
                {sessions.map((session, index) => {
                  const detail = sessionDetails.get(session.id);
                  const grade = detail?.metrics.efficiency.oes_grade || '-';
                  const colors = ['border-blue-500', 'border-green-500', 'border-purple-500'];
                  const bgColors = ['bg-blue-500/20', 'bg-green-500/20', 'bg-purple-500/20'];

                  return (
                    <div key={session.id} className="flex flex-col items-center">
                      <div
                        className={cn(
                          'h-16 w-16 rounded-full border-4 flex items-center justify-center',
                          colors[index % colors.length],
                          bgColors[index % bgColors.length]
                        )}
                      >
                        <span className="text-2xl font-bold text-white">{grade}</span>
                      </div>
                      <span className="mt-2 text-sm text-gray-400 truncate max-w-[120px]">
                        {session.project_name}
                      </span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ComparisonChart sessions={sessions} turnsData={turnsData} metric="cost" />
            <ComparisonChart sessions={sessions} turnsData={turnsData} metric="tokens" />
          </div>

          {/* Tool Usage Comparison */}
          <ToolDistributionChart sessions={sessions} sessionDetails={sessionDetails} />

          {/* Detailed Metrics Table */}
          <Card>
            <CardHeader>
              <CardTitle>Detailed Metrics</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-[var(--color-border)]">
                      <th className="text-left py-3 px-4 text-sm font-medium text-gray-400">
                        Metric
                      </th>
                      {sessions.map((session, index) => {
                        const colors = ['text-blue-400', 'text-green-400', 'text-purple-400'];
                        return (
                          <th
                            key={session.id}
                            className={cn(
                              'text-right py-3 px-4 text-sm font-medium',
                              colors[index % colors.length]
                            )}
                          >
                            {session.project_name}
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-[var(--color-border)]">
                      <td className="py-3 px-4 text-sm text-gray-300">Total Cost</td>
                      {sessions.map((session) => (
                        <td key={session.id} className="text-right py-3 px-4 text-sm text-white">
                          {formatCurrency(session.total_cost)}
                        </td>
                      ))}
                    </tr>
                    <tr className="border-b border-[var(--color-border)]">
                      <td className="py-3 px-4 text-sm text-gray-300">Total Tokens</td>
                      {sessions.map((session) => (
                        <td key={session.id} className="text-right py-3 px-4 text-sm text-white">
                          {formatCompactNumber(session.total_tokens)}
                        </td>
                      ))}
                    </tr>
                    <tr className="border-b border-[var(--color-border)]">
                      <td className="py-3 px-4 text-sm text-gray-300">Turns</td>
                      {sessions.map((session) => (
                        <td key={session.id} className="text-right py-3 px-4 text-sm text-white">
                          {formatNumber(session.total_turns)}
                        </td>
                      ))}
                    </tr>
                    <tr className="border-b border-[var(--color-border)]">
                      <td className="py-3 px-4 text-sm text-gray-300">Duration</td>
                      {sessions.map((session) => (
                        <td key={session.id} className="text-right py-3 px-4 text-sm text-white">
                          {formatDuration(session.duration_ms / 1000)}
                        </td>
                      ))}
                    </tr>
                    <tr className="border-b border-[var(--color-border)]">
                      <td className="py-3 px-4 text-sm text-gray-300">Input Tokens</td>
                      {sessions.map((session) => {
                        const detail = sessionDetails.get(session.id);
                        return (
                          <td key={session.id} className="text-right py-3 px-4 text-sm text-white">
                            {detail
                              ? formatCompactNumber(detail.metrics.tokens.input)
                              : '-'}
                          </td>
                        );
                      })}
                    </tr>
                    <tr className="border-b border-[var(--color-border)]">
                      <td className="py-3 px-4 text-sm text-gray-300">Output Tokens</td>
                      {sessions.map((session) => {
                        const detail = sessionDetails.get(session.id);
                        return (
                          <td key={session.id} className="text-right py-3 px-4 text-sm text-white">
                            {detail
                              ? formatCompactNumber(detail.metrics.tokens.output)
                              : '-'}
                          </td>
                        );
                      })}
                    </tr>
                    <tr className="border-b border-[var(--color-border)]">
                      <td className="py-3 px-4 text-sm text-gray-300">Cache Read</td>
                      {sessions.map((session) => {
                        const detail = sessionDetails.get(session.id);
                        return (
                          <td key={session.id} className="text-right py-3 px-4 text-sm text-white">
                            {detail
                              ? formatCompactNumber(detail.metrics.tokens.cache_read)
                              : '-'}
                          </td>
                        );
                      })}
                    </tr>
                    <tr className="border-b border-[var(--color-border)]">
                      <td className="py-3 px-4 text-sm text-gray-300">Cache Efficiency (CER)</td>
                      {sessions.map((session) => {
                        const detail = sessionDetails.get(session.id);
                        return (
                          <td key={session.id} className="text-right py-3 px-4 text-sm text-white">
                            {detail
                              ? `${(detail.metrics.efficiency.cer * 100).toFixed(1)}%`
                              : '-'}
                          </td>
                        );
                      })}
                    </tr>
                    <tr className="border-b border-[var(--color-border)]">
                      <td className="py-3 px-4 text-sm text-gray-300">Tool Count</td>
                      {sessions.map((session) => {
                        const detail = sessionDetails.get(session.id);
                        return (
                          <td key={session.id} className="text-right py-3 px-4 text-sm text-white">
                            {detail ? formatNumber(detail.metrics.tool_count) : '-'}
                          </td>
                        );
                      })}
                    </tr>
                    <tr className="border-b border-[var(--color-border)]">
                      <td className="py-3 px-4 text-sm text-gray-300">Unique Tools</td>
                      {sessions.map((session) => {
                        const detail = sessionDetails.get(session.id);
                        return (
                          <td key={session.id} className="text-right py-3 px-4 text-sm text-white">
                            {detail ? detail.metrics.unique_tools.length : '-'}
                          </td>
                        );
                      })}
                    </tr>
                    <tr>
                      <td className="py-3 px-4 text-sm text-gray-300">Efficiency Score</td>
                      {sessions.map((session) => {
                        const detail = sessionDetails.get(session.id);
                        return (
                          <td key={session.id} className="text-right py-3 px-4 text-sm text-white">
                            {detail
                              ? `${(detail.metrics.efficiency.oes_score * 100).toFixed(1)}%`
                              : '-'}
                          </td>
                        );
                      })}
                    </tr>
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

import { Link } from 'react-router-dom';
import { Header } from '../components/layout/Header';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { TokenChart } from '../components/charts/TokenChart';
import { CostChart } from '../components/charts/CostChart';
import { EfficiencyGauge } from '../components/charts/EfficiencyGauge';
import {
  useDashboardSummary,
  useDailyMetrics,
  useProjectMetrics,
} from '../hooks/useMetrics';
import { useSessions, useSessionUpdates } from '../hooks/useSessions';
import {
  formatCurrency,
  formatCompactNumber,
  formatNumber,
  formatRelativeTime,
  formatDuration,
} from '../lib/utils';
import {
  DollarSign,
  MessageSquare,
  Zap,
  FolderOpen,
  TrendingUp,
  TrendingDown,
  ChevronRight,
  Clock,
} from 'lucide-react';

interface StatCardProps {
  title: string;
  value: string;
  subtitle?: string;
  icon: React.ElementType;
  trend?: { value: number; isPositive: boolean };
  isLoading?: boolean;
}

function StatCard({ title, value, subtitle, icon: Icon, trend, isLoading }: StatCardProps) {
  return (
    <Card>
      <CardContent className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-gray-400">{title}</p>
          {isLoading ? (
            <div className="mt-1 h-8 w-24 animate-pulse rounded bg-gray-700" />
          ) : (
            <p className="mt-1 text-2xl font-bold text-white">{value}</p>
          )}
          {subtitle && <p className="mt-1 text-xs text-gray-500">{subtitle}</p>}
          {trend && (
            <div className={`mt-2 flex items-center text-xs ${trend.isPositive ? 'text-green-400' : 'text-red-400'}`}>
              {trend.isPositive ? (
                <TrendingUp className="mr-1 h-3 w-3" />
              ) : (
                <TrendingDown className="mr-1 h-3 w-3" />
              )}
              {trend.value}% from last period
            </div>
          )}
        </div>
        <div className="rounded-lg bg-[var(--color-primary-600)]/20 p-3">
          <Icon className="h-6 w-6 text-[var(--color-primary-400)]" />
        </div>
      </CardContent>
    </Card>
  );
}

export function Dashboard() {
  // Subscribe to real-time updates
  useSessionUpdates();

  const { data: summary, isLoading: summaryLoading } = useDashboardSummary();
  const { data: dailyMetrics, isLoading: dailyLoading } = useDailyMetrics();
  const { data: projectMetrics, isLoading: projectsLoading } = useProjectMetrics();
  const { data: recentSessions, isLoading: sessionsLoading } = useSessions(5, 0);

  // Calculate average efficiency from recent sessions if available
  const avgEfficiency = summary?.avg_efficiency_score;

  return (
    <div className="flex flex-col">
      <Header
        title="Dashboard"
        subtitle="Overview of your Claude Code usage"
      />

      <div className="flex-1 space-y-6 p-6">
        {/* Stats row */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Total Cost"
            value={summary ? formatCurrency(summary.total_cost) : '$0.00'}
            subtitle={summary ? `${formatNumber(summary.total_sessions)} sessions` : undefined}
            icon={DollarSign}
            isLoading={summaryLoading}
          />
          <StatCard
            title="Total Turns"
            value={summary ? formatNumber(summary.total_turns) : '0'}
            subtitle={summary ? `Avg ${summary.avg_turns_per_session.toFixed(1)} per session` : undefined}
            icon={MessageSquare}
            isLoading={summaryLoading}
          />
          <StatCard
            title="Total Tokens"
            value={summary ? formatCompactNumber(summary.total_tokens) : '0'}
            subtitle="Input + Output tokens"
            icon={Zap}
            isLoading={summaryLoading}
          />
          <StatCard
            title="Active Projects"
            value={summary ? formatNumber(summary.active_projects) : '0'}
            subtitle="Unique project paths"
            icon={FolderOpen}
            isLoading={summaryLoading}
          />
        </div>

        {/* Charts row */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <TokenChart data={dailyMetrics || []} isLoading={dailyLoading} />
          <CostChart data={projectMetrics || []} isLoading={projectsLoading} />
        </div>

        {/* Efficiency and Recent Sessions row */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <EfficiencyGauge
            value={avgEfficiency ?? 0}
            label="Avg Efficiency Score"
            description="Overall efficiency across sessions"
            isLoading={summaryLoading}
          />

          <Card className="lg:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Recent Sessions</CardTitle>
              <Link
                to="/sessions"
                className="text-sm text-[var(--color-primary-400)] hover:text-[var(--color-primary-300)]"
              >
                View all
              </Link>
            </CardHeader>
            <CardContent>
              {sessionsLoading ? (
                <div className="space-y-3">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="h-16 animate-pulse rounded-lg bg-gray-700" />
                  ))}
                </div>
              ) : recentSessions && recentSessions.length > 0 ? (
                <div className="space-y-3">
                  {recentSessions.map((session) => (
                    <Link
                      key={session.id}
                      to={`/sessions/${session.id}`}
                      className="flex items-center justify-between rounded-lg bg-[var(--color-background)] p-3 transition-colors hover:bg-gray-800"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-white truncate">
                            {session.project_name}
                          </span>
                          {session.model && (
                            <Badge variant="info" className="text-xs">
                              {session.model.split('-').slice(-1)[0]}
                            </Badge>
                          )}
                          {session.is_subagent && (
                            <Badge variant="warning" className="text-xs">
                              Subagent
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 truncate">
                          {session.project_path}
                        </p>
                      </div>
                      <div className="flex items-center gap-4 text-sm text-gray-400 ml-4">
                        <div className="flex items-center gap-1">
                          <MessageSquare className="h-3 w-3" />
                          <span>{session.total_turns}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <DollarSign className="h-3 w-3" />
                          <span>{formatCurrency(session.total_cost)}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          <span>{formatDuration(session.duration_ms / 1000)}</span>
                        </div>
                        <span className="text-xs text-gray-500">
                          {formatRelativeTime(session.started_at)}
                        </span>
                        <ChevronRight className="h-4 w-4 text-gray-600" />
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-8 text-gray-500">
                  <MessageSquare className="h-8 w-8 mb-2" />
                  <p>No sessions found</p>
                  <p className="text-xs">Sessions will appear here once you use Claude Code</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Cost Efficiency stats */}
        <Card>
          <CardHeader>
            <CardTitle>Cost Efficiency</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div className="rounded-lg bg-[var(--color-background)] p-4">
                <p className="text-sm text-gray-400">Avg Cost/Session</p>
                {summaryLoading ? (
                  <div className="mt-1 h-6 w-20 animate-pulse rounded bg-gray-700" />
                ) : (
                  <p className="mt-1 text-xl font-semibold text-white">
                    {summary ? formatCurrency(summary.avg_cost_per_session) : '$0.00'}
                  </p>
                )}
              </div>
              <div className="rounded-lg bg-[var(--color-background)] p-4">
                <p className="text-sm text-gray-400">Avg Turns/Session</p>
                {summaryLoading ? (
                  <div className="mt-1 h-6 w-20 animate-pulse rounded bg-gray-700" />
                ) : (
                  <p className="mt-1 text-xl font-semibold text-white">
                    {summary ? summary.avg_turns_per_session.toFixed(1) : '0'}
                  </p>
                )}
              </div>
              <div className="rounded-lg bg-[var(--color-background)] p-4">
                <p className="text-sm text-gray-400">Total Sessions</p>
                {summaryLoading ? (
                  <div className="mt-1 h-6 w-20 animate-pulse rounded bg-gray-700" />
                ) : (
                  <p className="mt-1 text-xl font-semibold text-white">
                    {summary ? formatNumber(summary.total_sessions) : '0'}
                  </p>
                )}
              </div>
              <div className="rounded-lg bg-[var(--color-background)] p-4">
                <p className="text-sm text-gray-400">Active Projects</p>
                {summaryLoading ? (
                  <div className="mt-1 h-6 w-20 animate-pulse rounded bg-gray-700" />
                ) : (
                  <p className="mt-1 text-xl font-semibold text-white">
                    {summary ? formatNumber(summary.active_projects) : '0'}
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

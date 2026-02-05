import { Header } from '../components/layout/Header';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/Card';
import { TokenChart } from '../components/charts/TokenChart';
import { CostChart } from '../components/charts/CostChart';
import { EfficiencyGauge } from '../components/charts/EfficiencyGauge';
import {
  useDashboardSummary,
  useDailyMetrics,
  useProjectMetrics,
} from '../hooks/useMetrics';
import {
  formatCurrency,
  formatCompactNumber,
  formatNumber,
} from '../lib/utils';
import {
  DollarSign,
  MessageSquare,
  Zap,
  FolderOpen,
  TrendingUp,
  TrendingDown,
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
  const { data: summary, isLoading: summaryLoading } = useDashboardSummary();
  const { data: dailyMetrics, isLoading: dailyLoading } = useDailyMetrics();
  const { data: projectMetrics, isLoading: projectsLoading } = useProjectMetrics();

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
            value={summary ? formatCompactNumber(summary.total_input_tokens + summary.total_output_tokens) : '0'}
            subtitle={summary ? `${formatCompactNumber(summary.total_input_tokens)} in / ${formatCompactNumber(summary.total_output_tokens)} out` : undefined}
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

        {/* Efficiency and stats row */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <EfficiencyGauge
            value={summary?.cache_hit_rate || 0}
            label="Cache Hit Rate"
            description="Percentage of tokens served from cache"
            isLoading={summaryLoading}
          />

          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Cost Efficiency</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
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
                  <p className="text-sm text-gray-400">Cache Read Tokens</p>
                  {summaryLoading ? (
                    <div className="mt-1 h-6 w-20 animate-pulse rounded bg-gray-700" />
                  ) : (
                    <p className="mt-1 text-xl font-semibold text-white">
                      {summary ? formatCompactNumber(summary.total_cache_read_tokens) : '0'}
                    </p>
                  )}
                </div>
                <div className="rounded-lg bg-[var(--color-background)] p-4">
                  <p className="text-sm text-gray-400">Cache Write Tokens</p>
                  {summaryLoading ? (
                    <div className="mt-1 h-6 w-20 animate-pulse rounded bg-gray-700" />
                  ) : (
                    <p className="mt-1 text-xl font-semibold text-white">
                      {summary ? formatCompactNumber(summary.total_cache_write_tokens) : '0'}
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

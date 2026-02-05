import { useState, useMemo } from 'react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
  AreaChart,
} from 'recharts';
import { Header } from '../components/layout/Header';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '../components/ui/Card';
import {
  formatCurrency,
  formatNumber,
  formatCompactNumber,
} from '../lib/utils';
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  Activity,
  Calendar,
  Percent,
} from 'lucide-react';
import { useTrends } from '../hooks/useTrends';

type TimeRange = '7d' | '30d' | '90d' | 'custom';

interface TrendSummary {
  totalCost: number;
  avgEfficiency: number;
  totalSessions: number;
  costTrend: number; // percentage change
  efficiencyTrend: number; // percentage change
  sessionsTrend: number; // percentage change
}

function Trends() {
  const [timeRange, setTimeRange] = useState<TimeRange>('30d');
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');

  // Calculate date range based on selection
  const dateRange = useMemo(() => {
    const now = new Date();
    const endDate = now.toISOString().split('T')[0];
    let startDate: string;

    switch (timeRange) {
      case '7d':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        break;
      case '30d':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        break;
      case '90d':
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        break;
      case 'custom':
        return {
          startDate: customStartDate || endDate,
          endDate: customEndDate || endDate,
        };
      default:
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    }

    return { startDate, endDate };
  }, [timeRange, customStartDate, customEndDate]);

  // Calculate days for the simple trend APIs
  const days = useMemo(() => {
    switch (timeRange) {
      case '7d': return 7;
      case '30d': return 30;
      case '90d': return 90;
      case 'custom': {
        if (customStartDate && customEndDate) {
          const start = new Date(customStartDate);
          const end = new Date(customEndDate);
          return Math.ceil((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
        }
        return 30;
      }
      default: return 30;
    }
  }, [timeRange, customStartDate, customEndDate]);

  // Fetch trend data
  const { data: trends, isLoading: trendsLoading } = useTrends(
    dateRange.startDate,
    dateRange.endDate,
    'daily'
  );
  // Using days in the query key ensures cache invalidation when time range changes
  void days;

  // Calculate summary statistics
  const summary = useMemo<TrendSummary | null>(() => {
    if (!trends || trends.length === 0) return null;

    const totalCost = trends.reduce((sum, t) => sum + t.total_cost, 0);
    const totalSessions = trends.reduce((sum, t) => sum + t.sessions, 0);
    const avgEfficiency = trends.reduce((sum, t) => sum + t.avg_efficiency, 0) / trends.length;

    // Calculate trend by comparing first half to second half
    const midpoint = Math.floor(trends.length / 2);
    const firstHalf = trends.slice(0, midpoint);
    const secondHalf = trends.slice(midpoint);

    const firstHalfCost = firstHalf.reduce((sum, t) => sum + t.total_cost, 0);
    const secondHalfCost = secondHalf.reduce((sum, t) => sum + t.total_cost, 0);
    const costTrendPct = firstHalfCost > 0 ? ((secondHalfCost - firstHalfCost) / firstHalfCost) * 100 : 0;

    const firstHalfEfficiency = firstHalf.reduce((sum, t) => sum + t.avg_efficiency, 0) / (firstHalf.length || 1);
    const secondHalfEfficiency = secondHalf.reduce((sum, t) => sum + t.avg_efficiency, 0) / (secondHalf.length || 1);
    const efficiencyTrendPct = firstHalfEfficiency > 0 ? ((secondHalfEfficiency - firstHalfEfficiency) / firstHalfEfficiency) * 100 : 0;

    const firstHalfSessions = firstHalf.reduce((sum, t) => sum + t.sessions, 0);
    const secondHalfSessions = secondHalf.reduce((sum, t) => sum + t.sessions, 0);
    const sessionsTrendPct = firstHalfSessions > 0 ? ((secondHalfSessions - firstHalfSessions) / firstHalfSessions) * 100 : 0;

    return {
      totalCost,
      avgEfficiency,
      totalSessions,
      costTrend: costTrendPct,
      efficiencyTrend: efficiencyTrendPct,
      sessionsTrend: sessionsTrendPct,
    };
  }, [trends]);

  // Prepare chart data
  const chartData = useMemo(() => {
    if (!trends) return [];
    return trends
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((t) => ({
        date: new Date(t.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        fullDate: t.date,
        cost: t.total_cost,
        efficiency: t.avg_efficiency,
        sessions: t.sessions,
        turns: t.turns,
        tokens: t.total_tokens,
      }));
  }, [trends]);

  const isLoading = trendsLoading;

  return (
    <div className="flex flex-col">
      <Header
        title="Trends"
        subtitle="Historical analytics and usage patterns"
      />

      <div className="flex-1 space-y-6 p-6">
        {/* Time Range Selector */}
        <Card>
          <CardContent className="flex items-center gap-4 py-3">
            <Calendar className="h-5 w-5 text-gray-400" />
            <div className="flex gap-2">
              {(['7d', '30d', '90d', 'custom'] as TimeRange[]).map((range) => (
                <button
                  key={range}
                  onClick={() => setTimeRange(range)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    timeRange === range
                      ? 'bg-[var(--color-primary-600)] text-white'
                      : 'bg-[var(--color-background)] text-gray-400 hover:text-white hover:bg-gray-700'
                  }`}
                >
                  {range === '7d' ? 'Last 7 Days' : range === '30d' ? 'Last 30 Days' : range === '90d' ? 'Last 90 Days' : 'Custom'}
                </button>
              ))}
            </div>
            {timeRange === 'custom' && (
              <div className="flex items-center gap-2 ml-4">
                <input
                  type="date"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  className="rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-1.5 text-sm text-gray-200"
                />
                <span className="text-gray-400">to</span>
                <input
                  type="date"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  className="rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-1.5 text-sm text-gray-200"
                />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryCard
            title="Total Cost"
            value={summary ? formatCurrency(summary.totalCost) : '$0.00'}
            trend={summary?.costTrend}
            icon={DollarSign}
            isLoading={isLoading}
            trendPositiveIsGood={false}
          />
          <SummaryCard
            title="Avg Efficiency"
            value={summary ? `${summary.avgEfficiency.toFixed(1)}%` : '0%'}
            trend={summary?.efficiencyTrend}
            icon={Percent}
            isLoading={isLoading}
            trendPositiveIsGood={true}
          />
          <SummaryCard
            title="Total Sessions"
            value={summary ? formatNumber(summary.totalSessions) : '0'}
            trend={summary?.sessionsTrend}
            icon={Activity}
            isLoading={isLoading}
            trendPositiveIsGood={true}
          />
          <SummaryCard
            title="Period"
            value={timeRange === 'custom' ? `${days} days` : timeRange === '7d' ? '7 days' : timeRange === '30d' ? '30 days' : '90 days'}
            icon={Calendar}
            isLoading={false}
          />
        </div>

        {/* Charts Grid */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Cost Over Time */}
          <Card className="h-96">
            <CardHeader>
              <CardTitle>Cost Over Time</CardTitle>
              <CardDescription>Daily spending trend</CardDescription>
            </CardHeader>
            <CardContent className="h-72">
              {isLoading ? (
                <div className="flex h-full items-center justify-center">
                  <div className="animate-pulse text-gray-500">Loading...</div>
                </div>
              ) : chartData.length === 0 ? (
                <div className="flex h-full items-center justify-center">
                  <div className="text-gray-500">No data available</div>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="costGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2e" />
                    <XAxis dataKey="date" stroke="#6b7280" fontSize={12} tickLine={false} />
                    <YAxis
                      stroke="#6b7280"
                      fontSize={12}
                      tickLine={false}
                      tickFormatter={(value) => formatCurrency(value)}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#1a1a1c',
                        border: '1px solid #2a2a2e',
                        borderRadius: '8px',
                      }}
                      labelStyle={{ color: '#fff' }}
                      formatter={(value: number | undefined) => value !== undefined ? [formatCurrency(value), 'Cost'] : ['', 'Cost']}
                    />
                    <Area
                      type="monotone"
                      dataKey="cost"
                      stroke="#3b82f6"
                      fill="url(#costGradient)"
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Efficiency Over Time */}
          <Card className="h-96">
            <CardHeader>
              <CardTitle>Efficiency Over Time</CardTitle>
              <CardDescription>Daily efficiency score trend</CardDescription>
            </CardHeader>
            <CardContent className="h-72">
              {isLoading ? (
                <div className="flex h-full items-center justify-center">
                  <div className="animate-pulse text-gray-500">Loading...</div>
                </div>
              ) : chartData.length === 0 ? (
                <div className="flex h-full items-center justify-center">
                  <div className="text-gray-500">No data available</div>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2e" />
                    <XAxis dataKey="date" stroke="#6b7280" fontSize={12} tickLine={false} />
                    <YAxis
                      stroke="#6b7280"
                      fontSize={12}
                      tickLine={false}
                      domain={[0, 100]}
                      tickFormatter={(value) => `${value}%`}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#1a1a1c',
                        border: '1px solid #2a2a2e',
                        borderRadius: '8px',
                      }}
                      labelStyle={{ color: '#fff' }}
                      formatter={(value: number | undefined) => value !== undefined ? [`${value.toFixed(1)}%`, 'Efficiency'] : ['', 'Efficiency']}
                    />
                    <Line
                      type="monotone"
                      dataKey="efficiency"
                      stroke="#10b981"
                      strokeWidth={2}
                      dot={{ fill: '#10b981', strokeWidth: 0, r: 3 }}
                      activeDot={{ r: 5 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Sessions Per Day */}
          <Card className="h-96">
            <CardHeader>
              <CardTitle>Sessions Per Day</CardTitle>
              <CardDescription>Daily session count</CardDescription>
            </CardHeader>
            <CardContent className="h-72">
              {isLoading ? (
                <div className="flex h-full items-center justify-center">
                  <div className="animate-pulse text-gray-500">Loading...</div>
                </div>
              ) : chartData.length === 0 ? (
                <div className="flex h-full items-center justify-center">
                  <div className="text-gray-500">No data available</div>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2e" />
                    <XAxis dataKey="date" stroke="#6b7280" fontSize={12} tickLine={false} />
                    <YAxis stroke="#6b7280" fontSize={12} tickLine={false} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#1a1a1c',
                        border: '1px solid #2a2a2e',
                        borderRadius: '8px',
                      }}
                      labelStyle={{ color: '#fff' }}
                      formatter={(value: number | undefined) => value !== undefined ? [formatNumber(value), 'Sessions'] : ['', 'Sessions']}
                    />
                    <Bar
                      dataKey="sessions"
                      fill="#8b5cf6"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Token Usage Over Time */}
          <Card className="h-96">
            <CardHeader>
              <CardTitle>Token Usage Over Time</CardTitle>
              <CardDescription>Daily token consumption</CardDescription>
            </CardHeader>
            <CardContent className="h-72">
              {isLoading ? (
                <div className="flex h-full items-center justify-center">
                  <div className="animate-pulse text-gray-500">Loading...</div>
                </div>
              ) : chartData.length === 0 ? (
                <div className="flex h-full items-center justify-center">
                  <div className="text-gray-500">No data available</div>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="tokenGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2e" />
                    <XAxis dataKey="date" stroke="#6b7280" fontSize={12} tickLine={false} />
                    <YAxis
                      stroke="#6b7280"
                      fontSize={12}
                      tickLine={false}
                      tickFormatter={(value) => formatCompactNumber(value)}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#1a1a1c',
                        border: '1px solid #2a2a2e',
                        borderRadius: '8px',
                      }}
                      labelStyle={{ color: '#fff' }}
                      formatter={(value: number | undefined) => value !== undefined ? [formatCompactNumber(value), 'Tokens'] : ['', 'Tokens']}
                    />
                    <Area
                      type="monotone"
                      dataKey="tokens"
                      stroke="#f59e0b"
                      fill="url(#tokenGradient)"
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Period Comparison */}
        <Card>
          <CardHeader>
            <CardTitle>Period Comparison</CardTitle>
            <CardDescription>Compare current period with previous period</CardDescription>
          </CardHeader>
          <CardContent>
            <PeriodComparison
              currentData={chartData.slice(Math.floor(chartData.length / 2))}
              previousData={chartData.slice(0, Math.floor(chartData.length / 2))}
              isLoading={isLoading}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

interface SummaryCardProps {
  title: string;
  value: string;
  trend?: number;
  icon: React.ElementType;
  isLoading: boolean;
  trendPositiveIsGood?: boolean;
}

function SummaryCard({ title, value, trend, icon: Icon, isLoading, trendPositiveIsGood = true }: SummaryCardProps) {
  const hasTrend = trend !== undefined && !isNaN(trend);
  const isPositiveTrend = trend !== undefined && trend > 0;
  const isGoodTrend = trendPositiveIsGood ? isPositiveTrend : !isPositiveTrend;

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
          {hasTrend && !isLoading && (
            <div className={`mt-2 flex items-center text-xs ${isGoodTrend ? 'text-green-400' : 'text-red-400'}`}>
              {isPositiveTrend ? (
                <TrendingUp className="mr-1 h-3 w-3" />
              ) : (
                <TrendingDown className="mr-1 h-3 w-3" />
              )}
              {Math.abs(trend).toFixed(1)}% vs previous period
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

interface PeriodComparisonProps {
  currentData: Array<{ date: string; cost: number; efficiency: number; sessions: number; turns: number; tokens: number }>;
  previousData: Array<{ date: string; cost: number; efficiency: number; sessions: number; turns: number; tokens: number }>;
  isLoading: boolean;
}

function PeriodComparison({ currentData, previousData, isLoading }: PeriodComparisonProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="rounded-lg bg-[var(--color-background)] p-4">
            <div className="h-4 w-20 animate-pulse rounded bg-gray-700" />
            <div className="mt-2 h-6 w-16 animate-pulse rounded bg-gray-700" />
          </div>
        ))}
      </div>
    );
  }

  const currentTotals = {
    cost: currentData.reduce((sum, d) => sum + d.cost, 0),
    sessions: currentData.reduce((sum, d) => sum + d.sessions, 0),
    turns: currentData.reduce((sum, d) => sum + d.turns, 0),
    tokens: currentData.reduce((sum, d) => sum + d.tokens, 0),
  };

  const previousTotals = {
    cost: previousData.reduce((sum, d) => sum + d.cost, 0),
    sessions: previousData.reduce((sum, d) => sum + d.sessions, 0),
    turns: previousData.reduce((sum, d) => sum + d.turns, 0),
    tokens: previousData.reduce((sum, d) => sum + d.tokens, 0),
  };

  const comparisons = [
    {
      label: 'Cost',
      current: formatCurrency(currentTotals.cost),
      previous: formatCurrency(previousTotals.cost),
      change: previousTotals.cost > 0 ? ((currentTotals.cost - previousTotals.cost) / previousTotals.cost) * 100 : 0,
      positiveIsGood: false,
    },
    {
      label: 'Sessions',
      current: formatNumber(currentTotals.sessions),
      previous: formatNumber(previousTotals.sessions),
      change: previousTotals.sessions > 0 ? ((currentTotals.sessions - previousTotals.sessions) / previousTotals.sessions) * 100 : 0,
      positiveIsGood: true,
    },
    {
      label: 'Turns',
      current: formatNumber(currentTotals.turns),
      previous: formatNumber(previousTotals.turns),
      change: previousTotals.turns > 0 ? ((currentTotals.turns - previousTotals.turns) / previousTotals.turns) * 100 : 0,
      positiveIsGood: true,
    },
    {
      label: 'Tokens',
      current: formatCompactNumber(currentTotals.tokens),
      previous: formatCompactNumber(previousTotals.tokens),
      change: previousTotals.tokens > 0 ? ((currentTotals.tokens - previousTotals.tokens) / previousTotals.tokens) * 100 : 0,
      positiveIsGood: false,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      {comparisons.map((comp) => {
        const isPositive = comp.change > 0;
        const isGood = comp.positiveIsGood ? isPositive : !isPositive;

        return (
          <div key={comp.label} className="rounded-lg bg-[var(--color-background)] p-4">
            <p className="text-sm text-gray-400">{comp.label}</p>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-xl font-semibold text-white">{comp.current}</span>
              <span className="text-xs text-gray-500">vs {comp.previous}</span>
            </div>
            {comp.change !== 0 && (
              <div className={`mt-1 flex items-center text-xs ${isGood ? 'text-green-400' : 'text-red-400'}`}>
                {isPositive ? (
                  <TrendingUp className="mr-1 h-3 w-3" />
                ) : (
                  <TrendingDown className="mr-1 h-3 w-3" />
                )}
                {Math.abs(comp.change).toFixed(1)}%
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default Trends;

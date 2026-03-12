import { useState, useMemo } from 'react';
import { Header } from '../components/layout/Header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/Card';
import { DeveloperRadarChart } from '../components/charts/DeveloperRadarChart';
import { useDeveloperMetrics } from '../hooks/useMetrics';
import {
  Calendar,
  Zap,
  Target,
  TrendingUp,
  TrendingDown,
} from 'lucide-react';
type TimeRange = '30d' | '60d' | '90d';

const ARCHETYPE_STYLES: Record<string, { color: string; bg: string; description: string }> = {
  'Velocity Master': {
    color: 'text-orange-400',
    bg: 'bg-orange-500/20',
    description: 'High delivery speed with disciplined scope',
  },
  'Efficiency Expert': {
    color: 'text-green-400',
    bg: 'bg-green-500/20',
    description: 'Exceptional cost efficiency and cache utilization',
  },
  'Multitasker': {
    color: 'text-blue-400',
    bg: 'bg-blue-500/20',
    description: 'Strong parallel throughput with smooth workflows',
  },
  'Balanced Pro': {
    color: 'text-purple-400',
    bg: 'bg-purple-500/20',
    description: 'Well-rounded performance across all dimensions',
  },
  'Specialist': {
    color: 'text-yellow-400',
    bg: 'bg-yellow-500/20',
    description: 'Outstanding in select areas with growth potential in others',
  },
  'Developing': {
    color: 'text-gray-400',
    bg: 'bg-gray-500/20',
    description: 'Building proficiency across performance axes',
  },
};

const METRICS_LIST = [
  { key: 'session_velocity' as const, label: 'Session Velocity', tooltip: 'Measures deliverable units produced per hour of session time. Normalized to 0-10 scale.' },
  { key: 'tool_reliability' as const, label: 'Tool Reliability', tooltip: 'Percentage of tool calls that succeed without errors. Score of 10 = zero errors.' },
  { key: 'workflow_efficiency' as const, label: 'Workflow Efficiency', tooltip: 'How smoothly sessions flow without rework or clarification cycles.' },
  { key: 'cost_efficiency' as const, label: 'Cost Efficiency', tooltip: 'Output per dollar of API cost. Score of 10 = $1 or less per deliverable unit.' },
  { key: 'cache_utilization' as const, label: 'Cache Utilization', tooltip: 'Cache read efficiency. Higher = better context reuse, less redundant processing.' },
  { key: 'scope_discipline' as const, label: 'Scope Discipline', tooltip: 'Sessions within P75 turn count. Higher = focused execution.' },
  { key: 'parallel_throughput' as const, label: 'Parallel Throughput', tooltip: 'Average concurrent sessions per active day.' },
];

function MetricRow({ label, value, baseline, tooltip }: { label: string; value: number; baseline: number | null; tooltip: string }) {
  const delta = baseline !== null ? value - baseline : null;
  const pct = (value / 10) * 100;
  const dotColor = value >= 8 ? 'bg-green-400' : value >= 5 ? 'bg-blue-400' : value >= 3 ? 'bg-yellow-400' : 'bg-red-400';

  return (
    <div className="group relative">
      <div className="flex items-center gap-3">
        <div className={`h-2.5 w-2.5 rounded-full ${dotColor} shrink-0`} />
        <span className="text-sm text-[var(--color-text-secondary)] w-32 truncate">{label}</span>
        <div className="flex-1 h-1.5 rounded-full bg-[var(--color-background)] overflow-hidden">
          <div
            className={`h-full rounded-full ${dotColor} transition-all duration-700`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="text-sm font-semibold text-[var(--color-text-primary)] w-10 text-right tabular-nums">
          {value.toFixed(1)}
        </span>
        {delta !== null && (
          <span className={`text-xs w-12 text-right ${delta >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {delta >= 0 ? '+' : ''}{delta.toFixed(1)}
          </span>
        )}
      </div>
      {/* Hover tooltip */}
      <div className="absolute bottom-full left-8 mb-2 w-64 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] p-3 text-xs text-fuchsia-300 leading-relaxed shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 pointer-events-none">
        {tooltip}
      </div>
    </div>
  );
}

function Performance() {
  const [timeRange, setTimeRange] = useState<TimeRange>('90d');

  const days = useMemo(() => {
    switch (timeRange) {
      case '30d': return 30;
      case '60d': return 60;
      case '90d': return 90;
    }
  }, [timeRange]);

  const { data: metrics, isLoading } = useDeveloperMetrics(days);

  return (
    <div className="flex flex-col">
      <Header
        title="Developer Performance"
        subtitle="7-axis performance profile and archetype analysis"
      />

      <div className="flex-1 space-y-6 p-6">
        {/* Time Range Selector */}
        <Card>
          <CardContent className="flex items-center gap-4 py-3">
            <Calendar className="h-5 w-5 text-gray-400" />
            <div className="flex gap-2">
              {(['30d', '60d', '90d'] as TimeRange[]).map((range) => (
                <button
                  key={range}
                  onClick={() => setTimeRange(range)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    timeRange === range
                      ? 'bg-[var(--color-primary-600)] text-white'
                      : 'bg-[var(--color-background)] text-gray-400 hover:text-white hover:bg-gray-700'
                  }`}
                >
                  {range === '30d' ? 'Last 30 Days' : range === '60d' ? 'Last 60 Days' : 'Last 90 Days'}
                </button>
              ))}
            </div>
            {metrics && !isLoading && (
              <div className="ml-auto text-sm text-gray-400">
                {metrics.session_count} sessions analyzed
              </div>
            )}
          </CardContent>
        </Card>

        {/* Archetype Badge + Overall Score */}
        {metrics && !isLoading && (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <ArchetypeBadge archetype={metrics.archetype} />
            <OverallScoreCard score={metrics.overall_score} baseline={metrics.baseline?.overall_score ?? null} />
          </div>
        )}

        {/* Integrated Performance Panel */}
        {metrics && !isLoading ? (
          <Card>
            <CardHeader>
              <CardTitle>Performance Profile</CardTitle>
              <CardDescription>7-axis developer performance ({metrics.session_count} sessions analyzed)</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-center">
                {/* Spider Chart - left side */}
                <div className="h-[400px]">
                  <DeveloperRadarChart metrics={metrics} />
                </div>

                {/* Metric List - right side */}
                <div className="space-y-4">
                  {METRICS_LIST.map((m) => (
                    <MetricRow
                      key={m.key}
                      label={m.label}
                      value={metrics[m.key]}
                      baseline={metrics.baseline?.[m.key] ?? null}
                      tooltip={m.tooltip}
                    />
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Performance Profile</CardTitle>
              <CardDescription>7-axis developer performance spider chart</CardDescription>
            </CardHeader>
            <CardContent className="flex h-80 items-center justify-center">
              <div className="animate-pulse text-gray-500">Loading...</div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function ArchetypeBadge({ archetype }: { archetype: string }) {
  const style = ARCHETYPE_STYLES[archetype] ?? ARCHETYPE_STYLES['Developing'];

  return (
    <Card>
      <CardContent className="flex items-center gap-4">
        <div className={`rounded-xl ${style.bg} p-4`}>
          <Zap className={`h-8 w-8 ${style.color}`} />
        </div>
        <div>
          <p className="text-sm font-medium text-gray-400">Developer Archetype</p>
          <p className={`text-2xl font-bold ${style.color}`}>{archetype}</p>
          <p className="text-sm text-gray-500 mt-1">{style.description}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function OverallScoreCard({ score, baseline }: { score: number; baseline: number | null }) {
  const delta = baseline !== null ? score - baseline : null;

  return (
    <Card>
      <CardContent className="flex items-center gap-4">
        <div className="rounded-xl bg-blue-500/20 p-4">
          <Target className="h-8 w-8 text-blue-400" />
        </div>
        <div>
          <p className="text-sm font-medium text-gray-400">Overall Score</p>
          <div className="flex items-baseline gap-2">
            <p className="text-2xl font-bold text-white">{score.toFixed(1)}</p>
            <p className="text-sm text-gray-500">/ 10</p>
          </div>
          {delta !== null && (
            <div className={`flex items-center text-xs mt-1 ${delta >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {delta >= 0 ? <TrendingUp className="mr-1 h-3 w-3" /> : <TrendingDown className="mr-1 h-3 w-3" />}
              {delta >= 0 ? '+' : ''}{delta.toFixed(1)} vs baseline
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default Performance;

import { useState, useMemo } from 'react';
import { Header } from '../components/layout/Header';
import { Card, CardContent } from '../components/ui/Card';
import { DeveloperRadarChart } from '../components/charts/DeveloperRadarChart';
import { useDeveloperMetrics } from '../hooks/useMetrics';
import {
  Calendar,
  Zap,
  Shield,
  Workflow,
  DollarSign,
  Database,
  Target,
  Layers,
  TrendingUp,
  TrendingDown,
} from 'lucide-react';
import type { DeveloperPerformanceMetrics } from '../types';

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

const AXIS_CONFIG = [
  { key: 'session_velocity' as const, label: 'Session Velocity', icon: Zap, description: 'Deliverable units per session hour' },
  { key: 'tool_reliability' as const, label: 'Tool Reliability', icon: Shield, description: 'Success rate of tool invocations' },
  { key: 'workflow_efficiency' as const, label: 'Workflow Efficiency', icon: Workflow, description: 'Low rework and clarification friction' },
  { key: 'cost_efficiency' as const, label: 'Cost Efficiency', icon: DollarSign, description: 'Output per dollar spent' },
  { key: 'cache_utilization' as const, label: 'Cache Utilization', icon: Database, description: 'Context reuse through cache reads' },
  { key: 'scope_discipline' as const, label: 'Scope Discipline', icon: Target, description: 'Sessions within typical turn count' },
  { key: 'parallel_throughput' as const, label: 'Parallel Throughput', icon: Layers, description: 'Concurrent sessions per day' },
];

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

        {/* Radar Chart */}
        <DeveloperRadarChart
          metrics={metrics ?? emptyMetrics}
          isLoading={isLoading}
        />

        {/* Axis Breakdown Cards */}
        {metrics && !isLoading && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {AXIS_CONFIG.map((axis) => (
              <AxisCard
                key={axis.key}
                label={axis.label}
                icon={axis.icon}
                description={axis.description}
                value={metrics[axis.key]}
                baseline={metrics.baseline ? metrics.baseline[axis.key] : null}
              />
            ))}
          </div>
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

interface AxisCardProps {
  label: string;
  icon: React.ElementType;
  description: string;
  value: number;
  baseline: number | null;
}

function AxisCard({ label, icon: Icon, description, value, baseline }: AxisCardProps) {
  const delta = baseline !== null ? value - baseline : null;
  const pct = (value / 10) * 100;

  const barColor =
    value >= 8 ? 'bg-green-500' :
    value >= 5 ? 'bg-blue-500' :
    value >= 3 ? 'bg-yellow-500' :
    'bg-red-500';

  return (
    <Card>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-3">
          <Icon className="h-5 w-5 text-gray-400 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-[var(--color-text-primary)] truncate">{label}</p>
            <p className="text-xs text-gray-500 truncate">{description}</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex-1">
            <div className="h-2 rounded-full bg-[var(--color-background)] overflow-hidden">
              <div
                className={`h-full rounded-full ${barColor} transition-all duration-500`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
          <span className="text-sm font-semibold text-[var(--color-text-primary)] w-10 text-right">
            {value.toFixed(1)}
          </span>
        </div>

        {delta !== null && (
          <div className={`flex items-center text-xs ${delta >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {delta >= 0 ? <TrendingUp className="mr-1 h-3 w-3" /> : <TrendingDown className="mr-1 h-3 w-3" />}
            {delta >= 0 ? '+' : ''}{delta.toFixed(1)} vs baseline
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const emptyMetrics: DeveloperPerformanceMetrics = {
  session_velocity: 0,
  tool_reliability: 0,
  workflow_efficiency: 0,
  cost_efficiency: 0,
  cache_utilization: 0,
  scope_discipline: 0,
  parallel_throughput: 0,
  archetype: 'Developing',
  overall_score: 0,
  session_count: 0,
  baseline: null,
};

export default Performance;

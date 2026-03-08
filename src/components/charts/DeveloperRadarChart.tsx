import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '../ui/Card';
import { useThemeColors } from '../../hooks/useThemeColors';
import type { DeveloperPerformanceMetrics } from '../../types';

interface DeveloperRadarChartProps {
  metrics: DeveloperPerformanceMetrics;
  isLoading?: boolean;
}

interface RadarDataPoint {
  axis: string;
  fullName: string;
  current: number;
  baseline: number | null;
  fullMark: number;
}

function prepareRadarData(metrics: DeveloperPerformanceMetrics): RadarDataPoint[] {
  const axes = [
    { key: 'session_velocity', short: 'Velocity', full: 'Session Velocity' },
    { key: 'tool_reliability', short: 'Reliability', full: 'Tool Reliability' },
    { key: 'workflow_efficiency', short: 'Workflow', full: 'Workflow Efficiency' },
    { key: 'cost_efficiency', short: 'Cost', full: 'Cost Efficiency' },
    { key: 'cache_utilization', short: 'Cache', full: 'Cache Utilization' },
    { key: 'scope_discipline', short: 'Scope', full: 'Scope Discipline' },
    { key: 'parallel_throughput', short: 'Parallel', full: 'Parallel Throughput' },
  ] as const;

  return axes.map(({ key, short, full }) => ({
    axis: short,
    fullName: full,
    current: metrics[key],
    baseline: metrics.baseline ? metrics.baseline[key] : null,
    fullMark: 10,
  }));
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{
    payload: RadarDataPoint;
    name: string;
    value: number;
  }>;
  themeColors?: ReturnType<typeof useThemeColors>;
}

function CustomTooltip({ active, payload, themeColors }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;

  const data = payload[0].payload;

  return (
    <div
      style={{
        backgroundColor: themeColors?.tooltipBg ?? '#1a1a1c',
        border: `1px solid ${themeColors?.tooltipBorder ?? '#2a2a2e'}`,
        borderRadius: '8px',
        padding: '10px 14px',
      }}
    >
      <p style={{ color: themeColors?.tooltipText ?? '#fff', fontWeight: 600, marginBottom: 4 }}>
        {data.fullName}
      </p>
      <p style={{ color: '#3b82f6', fontSize: 14 }}>
        Current: {data.current.toFixed(1)} / 10
      </p>
      {data.baseline !== null && (
        <p style={{ color: '#8b5cf6', fontSize: 14 }}>
          Baseline: {data.baseline.toFixed(1)} / 10
        </p>
      )}
      {data.baseline !== null && (
        <p
          style={{
            color: data.current >= data.baseline ? '#10b981' : '#ef4444',
            fontSize: 12,
            marginTop: 2,
          }}
        >
          {data.current >= data.baseline ? '+' : ''}
          {(data.current - data.baseline).toFixed(1)} vs baseline
        </p>
      )}
    </div>
  );
}

export function DeveloperRadarChart({ metrics, isLoading }: DeveloperRadarChartProps) {
  const tc = useThemeColors();

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Performance Profile</CardTitle>
          <CardDescription>7-axis developer performance spider chart</CardDescription>
        </CardHeader>
        <CardContent className="flex h-80 items-center justify-center">
          <div className="animate-pulse text-gray-500">Loading...</div>
        </CardContent>
      </Card>
    );
  }

  const radarData = prepareRadarData(metrics);
  const hasBaseline = metrics.baseline !== null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Performance Profile</CardTitle>
        <CardDescription>
          7-axis developer performance ({metrics.session_count} sessions analyzed)
        </CardDescription>
      </CardHeader>
      <CardContent className="h-96">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart cx="50%" cy="50%" outerRadius="70%" data={radarData}>
            <defs>
              <linearGradient id="devRadarCurrent" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.8} />
                <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.3} />
              </linearGradient>
              <linearGradient id="devRadarBaseline" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.5} />
                <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0.1} />
              </linearGradient>
            </defs>
            <PolarGrid stroke={tc.gridStroke} gridType="polygon" />
            <PolarRadiusAxis
              angle={90}
              domain={[0, 10]}
              tick={false}
              axisLine={false}
              tickCount={6}
            />
            <PolarAngleAxis
              dataKey="axis"
              tick={{ fill: tc.textSecondary, fontSize: 12 }}
              tickLine={false}
            />
            {hasBaseline && (
              <Radar
                name="Baseline"
                dataKey="baseline"
                stroke="#8b5cf6"
                fill="url(#devRadarBaseline)"
                fillOpacity={0.3}
                strokeWidth={1}
                strokeDasharray="4 4"
              />
            )}
            <Radar
              name="Current"
              dataKey="current"
              stroke="#3b82f6"
              fill="url(#devRadarCurrent)"
              fillOpacity={0.5}
              strokeWidth={2}
            />
            <Tooltip content={<CustomTooltip themeColors={tc} />} />
            {hasBaseline && <Legend />}
          </RadarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

export default DeveloperRadarChart;

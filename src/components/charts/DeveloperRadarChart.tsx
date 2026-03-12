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
import { useThemeColors } from '../../hooks/useThemeColors';
import type { DeveloperPerformanceMetrics } from '../../types';

interface DeveloperRadarChartProps {
  metrics: DeveloperPerformanceMetrics;
}

interface RadarDataPoint {
  axis: string;
  fullName: string;
  current: number;
  baseline: number | null;
  fullMark: number;
  tooltip: string;
}

const AXIS_TOOLTIPS: Record<string, string> = {
  'Session Velocity': 'Measures deliverable units produced per hour of session time. Normalized to 0-10 scale.',
  'Tool Reliability': 'Percentage of tool calls that succeed without errors. Score of 10 = zero errors.',
  'Workflow Efficiency': 'How smoothly sessions flow without rework or clarification. Based on inverse of Workflow Friction Score.',
  'Cost Efficiency': 'Output per dollar of API cost. 10/avg_CPDU, capped at 10. Score of 10 = $1 or less per deliverable unit.',
  'Cache Utilization': 'Cache read efficiency ratio. Higher = better context reuse, less redundant token processing.',
  'Scope Discipline': 'Proportion of sessions within P75 turn count. Higher = focused execution without excessive back-and-forth.',
  'Parallel Throughput': 'Average concurrent sessions per active day. Higher = effective parallel workflows.',
};

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
    tooltip: AXIS_TOOLTIPS[full] ?? '',
  }));
}

function CustomAxisTick({ x, y, payload, data }: { x: number; y: number; payload: { value: string }; data: RadarDataPoint[] }) {
  const point = data.find((d: RadarDataPoint) => d.axis === payload.value);
  if (!point) return null;

  return (
    <g>
      <text x={x} y={y} textAnchor="middle" fill="var(--color-text-secondary)" fontSize={12}>
        {payload.value}
      </text>
      <text x={x} y={y + 16} textAnchor="middle" fill="#3b82f6" fontSize={13} fontWeight="600">
        {point.current.toFixed(1)}
      </text>
    </g>
  );
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
        backgroundColor: themeColors?.tooltipBg ?? '#1a2332',
        border: `1px solid ${themeColors?.tooltipBorder ?? '#2a3a4e'}`,
        borderRadius: '8px',
        padding: '10px 14px',
        maxWidth: '280px',
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
      {data.tooltip && (
        <p style={{ color: '#e879f9', fontSize: 11, marginTop: 6, lineHeight: '1.4' }}>
          {data.tooltip}
        </p>
      )}
    </div>
  );
}

export function DeveloperRadarChart({ metrics }: DeveloperRadarChartProps) {
  const tc = useThemeColors();

  const radarData = prepareRadarData(metrics);
  const hasBaseline = metrics.baseline !== null;

  return (
    <ResponsiveContainer width="100%" height="100%">
      <RadarChart cx="50%" cy="50%" outerRadius="75%" data={radarData}>
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
          tick={(props: any) => <CustomAxisTick {...props} data={radarData} />}
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
  );
}

export default DeveloperRadarChart;

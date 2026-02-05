import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '../ui/Card';
import type { EfficiencyMetrics } from '../../types';

interface EfficiencyRadarChartProps {
  efficiency: EfficiencyMetrics;
  isLoading?: boolean;
}

interface RadarDataPoint {
  metric: string;
  fullMetric: string;
  value: number;
  fullMark: number;
  rawValue: number;
  rawLabel: string;
}

/**
 * Normalizes a value to 0-1 range with min/max bounds
 */
function normalize(value: number, min: number, max: number): number {
  if (max === min) return 0.5;
  const normalized = (value - min) / (max - min);
  return Math.max(0, Math.min(1, normalized));
}

/**
 * Prepares radar chart data from efficiency metrics
 * All values are normalized to 0-1 scale for the radar chart
 */
function prepareRadarData(efficiency: EfficiencyMetrics): RadarDataPoint[] {
  // Cost Efficiency: Lower CPDU is better, so we invert (1 - normalized)
  // Typical range: $0 - $5 per deliverable unit
  const costEfficiency = 1 - normalize(efficiency.cpdu, 0, 5);

  // Time Efficiency: Lower CPD (cycles per deliverable) is better
  // Typical range: 0 - 10 cycles
  const timeEfficiency = 1 - normalize(efficiency.cpd, 0, 10);

  // Cache Efficiency: CER is already 0-1 (or can exceed 1)
  // Higher is better
  const cacheEfficiency = normalize(efficiency.cer, 0, 1);

  // Subagent Efficiency: SEI normalized to 0-1
  // Higher is better, null means no subagents (show as neutral 0.5)
  const subagentEfficiency = efficiency.sei !== null
    ? normalize(efficiency.sei, 0, 1)
    : 0.5;

  // Workflow Smoothness: WFS is friction, lower is better
  // So we use 1 - WFS (normalized)
  const workflowSmoothness = 1 - normalize(efficiency.wfs, 0, 1);

  return [
    {
      metric: 'Cost',
      fullMetric: 'Cost Efficiency',
      value: costEfficiency,
      fullMark: 1,
      rawValue: efficiency.cpdu,
      rawLabel: `CPDU: $${efficiency.cpdu.toFixed(4)}`,
    },
    {
      metric: 'Time',
      fullMetric: 'Time Efficiency',
      value: timeEfficiency,
      fullMark: 1,
      rawValue: efficiency.cpd,
      rawLabel: `CpD: ${efficiency.cpd.toFixed(2)}`,
    },
    {
      metric: 'Cache',
      fullMetric: 'Cache Efficiency',
      value: cacheEfficiency,
      fullMark: 1,
      rawValue: efficiency.cer,
      rawLabel: `CER: ${(efficiency.cer * 100).toFixed(1)}%`,
    },
    {
      metric: 'Subagent',
      fullMetric: 'Subagent Efficiency',
      value: subagentEfficiency,
      fullMark: 1,
      rawValue: efficiency.sei ?? 0,
      rawLabel: efficiency.sei !== null
        ? `SEI: ${(efficiency.sei * 100).toFixed(1)}%`
        : 'SEI: N/A (no subagents)',
    },
    {
      metric: 'Workflow',
      fullMetric: 'Workflow Smoothness',
      value: workflowSmoothness,
      fullMark: 1,
      rawValue: efficiency.wfs,
      rawLabel: `WFS: ${(efficiency.wfs * 100).toFixed(1)}% friction`,
    },
  ];
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{
    payload: RadarDataPoint;
  }>;
}

function CustomTooltip({ active, payload }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  const data = payload[0].payload;

  return (
    <div
      style={{
        backgroundColor: '#1a1a1c',
        border: '1px solid #2a2a2e',
        borderRadius: '8px',
        padding: '10px 14px',
      }}
    >
      <p style={{ color: '#fff', fontWeight: 600, marginBottom: 4 }}>
        {data.fullMetric}
      </p>
      <p style={{ color: '#9ca3af', fontSize: 14 }}>
        Score: {(data.value * 100).toFixed(1)}%
      </p>
      <p style={{ color: '#6b7280', fontSize: 12 }}>
        {data.rawLabel}
      </p>
    </div>
  );
}

export function EfficiencyRadarChart({ efficiency, isLoading }: EfficiencyRadarChartProps) {
  if (isLoading) {
    return (
      <Card className="h-80">
        <CardHeader>
          <CardTitle>Efficiency Overview</CardTitle>
          <CardDescription>Multi-dimensional efficiency metrics</CardDescription>
        </CardHeader>
        <CardContent className="flex h-56 items-center justify-center">
          <div className="animate-pulse text-gray-500">Loading...</div>
        </CardContent>
      </Card>
    );
  }

  const radarData = prepareRadarData(efficiency);

  return (
    <Card className="h-80">
      <CardHeader>
        <CardTitle>Efficiency Overview</CardTitle>
        <CardDescription>Multi-dimensional efficiency metrics</CardDescription>
      </CardHeader>
      <CardContent className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart cx="50%" cy="50%" outerRadius="70%" data={radarData}>
            <defs>
              <linearGradient id="radarGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.8} />
                <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0.4} />
              </linearGradient>
            </defs>
            <PolarGrid
              stroke="#2a2a2e"
              gridType="polygon"
            />
            <PolarRadiusAxis
              angle={90}
              domain={[0, 1]}
              tick={false}
              axisLine={false}
              tickCount={5}
            />
            <PolarAngleAxis
              dataKey="metric"
              tick={{
                fill: '#9ca3af',
                fontSize: 11,
              }}
              tickLine={false}
            />
            <Radar
              name="Efficiency"
              dataKey="value"
              stroke="#3b82f6"
              fill="url(#radarGradient)"
              fillOpacity={0.6}
              strokeWidth={2}
            />
            <Tooltip content={<CustomTooltip />} />
          </RadarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

export default EfficiencyRadarChart;

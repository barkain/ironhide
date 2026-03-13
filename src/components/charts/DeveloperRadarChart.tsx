import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  ZAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Label,
} from 'recharts';
import { useThemeColors } from '../../hooks/useThemeColors';
import type { DeveloperPerformanceMetrics } from '../../types';

interface DeveloperBubbleChartProps {
  metrics: DeveloperPerformanceMetrics;
}

/**
 * Compute bubble color based on position in the chart using 4-corner bilinear interpolation.
 * - Bottom-left (low X, low Y): Grey #9ca3af
 * - Top-left (low X, high Y): Orange #fb923c
 * - Bottom-right (high X, low Y): Magenta #e879f9
 * - Top-right (high X, high Y): Green #22c55e
 */
function getBubbleColor(x: number, y: number): { fill: string; opacity: number } {
  const nx = Math.min(x / 10, 1);
  const ny = Math.min(y / 10, 1);

  // 4-corner colors
  const bl = { r: 156, g: 163, b: 175 }; // grey (low X, low Y)
  const tl = { r: 251, g: 146, b: 60 };  // orange (low X, high Y)
  const br = { r: 232, g: 121, b: 249 }; // magenta (high X, low Y)
  const tr = { r: 34, g: 197, b: 94 };   // green (high X, high Y)

  // Bilinear interpolation
  const r = Math.round(
    bl.r * (1 - nx) * (1 - ny) +
    br.r * nx * (1 - ny) +
    tl.r * (1 - nx) * ny +
    tr.r * nx * ny
  );
  const g = Math.round(
    bl.g * (1 - nx) * (1 - ny) +
    br.g * nx * (1 - ny) +
    tl.g * (1 - nx) * ny +
    tr.g * nx * ny
  );
  const b = Math.round(
    bl.b * (1 - nx) * (1 - ny) +
    br.b * nx * (1 - ny) +
    tl.b * (1 - nx) * ny +
    tr.b * nx * ny
  );

  // Opacity: more opaque toward top-right (better position)
  const opacity = 0.3 + (nx + ny) / 2 * 0.6;

  return { fill: `rgb(${r}, ${g}, ${b})`, opacity };
}

interface SprintDataPoint {
  name: string;
  x: number;
  y: number;
  z: number;
  isMostRecent: boolean;
  startDate: string;
  endDate: string;
  rawThroughput: number;
  rawParallelism: number;
  rawRoi: number;
  fill: string;
  opacity: number;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: SprintDataPoint }>;
}

function CustomTooltip({ active, payload }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const d = payload[0].payload;

  return (
    <div
      style={{
        backgroundColor: '#1a2332',
        border: '1px solid #2a3a4e',
        borderRadius: '8px',
        padding: '10px 14px',
        maxWidth: '260px',
      }}
    >
      <p style={{ color: '#fff', fontWeight: 600, marginBottom: 4 }}>
        {d.name}
      </p>
      <p style={{ color: 'var(--color-text-muted)', fontSize: 12, marginBottom: 6 }}>
        {d.startDate} → {d.endDate}
      </p>
      <p style={{ color: '#e879f9', fontSize: 13 }}>
        Throughput: {d.x.toFixed(1)} ({d.rawThroughput.toFixed(1)} PRs/sprint)
      </p>
      <p style={{ color: '#fb923c', fontSize: 13 }}>
        Parallelism: {d.y.toFixed(1)} ({d.rawParallelism.toFixed(2)} ratio)
      </p>
      <p style={{ color: '#10b981', fontSize: 13 }}>
        AI ROI: {d.z.toFixed(1)} ({d.rawRoi.toFixed(1)} PRs/$100)
      </p>
    </div>
  );
}

function renderSprintBubble(props: any) {
  const { cx, cy, payload } = props;
  if (cx === undefined || cy === undefined) return null;

  const baseSize = Math.max(12, payload.z * 3);
  const size = payload.isMostRecent ? baseSize + 4 : baseSize;
  const { fill, opacity } = getBubbleColor(payload.x, payload.y);

  return (
    <g>
      <circle
        cx={cx}
        cy={cy}
        r={size}
        fill={fill}
        opacity={opacity}
        stroke={payload.isMostRecent ? '#fff' : fill}
        strokeWidth={payload.isMostRecent ? 2 : 0}
      />
      {/* Show ROI score inside for most recent sprint */}
      {payload.isMostRecent && (
        <text
          x={cx}
          y={cy}
          textAnchor="middle"
          dominantBaseline="central"
          fill="#fff"
          fontSize={12}
          fontWeight="700"
        >
          {payload.z.toFixed(1)}
        </text>
      )}
    </g>
  );
}

export function DeveloperRadarChart({ metrics }: DeveloperBubbleChartProps) {
  const tc = useThemeColors();

  const sprintData: SprintDataPoint[] = (metrics.sprints || []).map((s, _i) => {
    const color = getBubbleColor(s.throughput_velocity_score, s.parallelism_ratio_score);
    return {
      name: `Sprint ${metrics.sprints.length - s.index}`,
      x: s.throughput_velocity_score,
      y: s.parallelism_ratio_score,
      z: s.ai_roi_score,
      isMostRecent: s.index === 0,
      startDate: s.start_date,
      endDate: s.end_date,
      rawThroughput: s.throughput_velocity,
      rawParallelism: s.parallelism_ratio,
      rawRoi: s.ai_roi,
      fill: color.fill,
      opacity: color.opacity,
    };
  });

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ScatterChart margin={{ top: 20, right: 30, bottom: 20, left: 10 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={tc.gridStroke} opacity={0.3} />
        <XAxis
          type="number"
          dataKey="x"
          domain={[0, 10]}
          tickCount={6}
          tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }}
          stroke={tc.gridStroke}
        >
          <Label
            value="Throughput Velocity"
            position="bottom"
            offset={0}
            style={{ fill: 'var(--color-text-secondary)', fontSize: 13, fontWeight: 500 }}
          />
        </XAxis>
        <YAxis
          type="number"
          dataKey="y"
          domain={[0, 10]}
          tickCount={6}
          tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }}
          stroke={tc.gridStroke}
        >
          <Label
            value="Parallelism Ratio"
            angle={-90}
            position="insideLeft"
            offset={10}
            style={{ fill: 'var(--color-text-secondary)', fontSize: 13, fontWeight: 500 }}
          />
        </YAxis>
        <ZAxis type="number" dataKey="z" domain={[0, 10]} range={[80, 400]} />
        <Tooltip content={<CustomTooltip />} />

        <Scatter data={sprintData} shape={renderSprintBubble} />
      </ScatterChart>
    </ResponsiveContainer>
  );
}

export default DeveloperRadarChart;

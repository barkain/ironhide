'use client';

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Brush,
} from 'recharts';
import { ChartCard } from './ChartCard';
import { formatDuration } from '@/lib/utils';
import type { SerializedTurnMetrics } from '@analytics/shared';

interface TurnDurationChartProps {
  data: SerializedTurnMetrics[];
}

interface ChartDataPoint {
  turn: number;
  duration: number;
}

function TurnDurationLineChart({
  chartData,
  showBrush = false,
  isExpanded = false,
}: {
  chartData: ChartDataPoint[];
  showBrush?: boolean;
  isExpanded?: boolean;
}) {
  // Calculate brush indices - when expanded, show all data; otherwise show last 50 points
  const dataLength = chartData.length;
  const defaultVisiblePoints = 50;
  const brushStartIndex = isExpanded ? 0 : Math.max(0, dataLength - defaultVisiblePoints);
  const brushEndIndex = Math.max(0, dataLength - 1);

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart
        data={chartData}
        margin={{ top: 10, right: 30, left: 0, bottom: showBrush ? 30 : 0 }}
      >
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
        <XAxis
          dataKey="turn"
          className="text-xs"
          tickFormatter={(value) => `T${value}`}
        />
        <YAxis
          className="text-xs"
          tickFormatter={(value) => formatDuration(value)}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: 'hsl(var(--card))',
            border: '1px solid hsl(var(--border))',
            borderRadius: 'var(--radius)',
          }}
          formatter={(value: number) => [formatDuration(value), 'Duration']}
          labelFormatter={(label) => `Turn ${label}`}
        />
        <Line
          type="monotone"
          dataKey="duration"
          stroke="hsl(var(--chart-4))"
          strokeWidth={2}
          dot={false}
          name="Duration"
        />
        {showBrush && dataLength > 10 && (
          <Brush
            key={`brush-${dataLength}-${isExpanded}`}
            dataKey="turn"
            height={30}
            stroke="hsl(var(--chart-4))"
            fill="hsl(var(--muted))"
            startIndex={brushStartIndex}
            endIndex={brushEndIndex}
            tickFormatter={(value) => `T${value}`}
          />
        )}
      </LineChart>
    </ResponsiveContainer>
  );
}

export function TurnDurationChart({ data }: TurnDurationChartProps) {
  const chartData: ChartDataPoint[] = data.map((metric) => ({
    turn: metric.turnNumber,
    duration: metric.durationMs,
  }));

  return (
    <ChartCard
      title="Turn Duration"
      expandedContent={() => (
        <TurnDurationLineChart chartData={chartData} showBrush={true} isExpanded={true} />
      )}
    >
      <TurnDurationLineChart chartData={chartData} />
    </ChartCard>
  );
}

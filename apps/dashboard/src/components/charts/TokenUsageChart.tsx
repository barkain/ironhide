'use client';

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  Brush,
} from 'recharts';
import { ChartCard } from './ChartCard';
import { formatNumber } from '@/lib/utils';
import type { SerializedTurnMetrics } from '@analytics/shared';

interface TokenUsageChartProps {
  data: SerializedTurnMetrics[];
  showBreakdown?: boolean;
}

interface ChartDataPoint {
  turn: number;
  input: number;
  output: number;
  cacheCreation: number;
  cacheRead: number;
  total: number;
}

function TokenUsageLineChart({
  chartData,
  showBreakdown,
  showBrush = false,
  isExpanded = false,
}: {
  chartData: ChartDataPoint[];
  showBreakdown: boolean;
  showBrush?: boolean;
  isExpanded?: boolean;
}) {
  // Calculate brush indices - when expanded, show all data; otherwise show last 50 points
  const dataLength = chartData.length;
  const defaultVisiblePoints = 50;
  const brushStartIndex = isExpanded ? 0 : Math.max(0, dataLength - defaultVisiblePoints);
  const brushEndIndex = Math.max(0, dataLength - 1);

  // Calculate max for domain - ensure chart has reasonable scale even if all values are 0
  const maxValue = Math.max(
    ...chartData.map(d => Math.max(d.total, d.input, d.output, d.cacheRead)),
    1 // Minimum of 1 to prevent empty chart
  );

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
          tickFormatter={(value) => `Turn ${value}`}
        />
        <YAxis
          className="text-xs"
          tickFormatter={(value) => formatNumber(value)}
          domain={[0, maxValue]}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: 'hsl(var(--card))',
            border: '1px solid hsl(var(--border))',
            borderRadius: 'var(--radius)',
          }}
          formatter={(value: number, name: string) => [formatNumber(value), name]}
          labelFormatter={(label) => `Turn ${label}`}
        />
        {showBreakdown ? (
          <>
            <Legend />
            <Line
              type="monotone"
              dataKey="input"
              stroke="hsl(var(--chart-1))"
              strokeWidth={2}
              dot={false}
              name="Input"
              connectNulls
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="output"
              stroke="hsl(var(--chart-2))"
              strokeWidth={2}
              dot={false}
              name="Output"
              connectNulls
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="cacheRead"
              stroke="hsl(var(--chart-3))"
              strokeWidth={2}
              dot={false}
              name="Cache Read"
              connectNulls
              isAnimationActive={false}
            />
          </>
        ) : (
          <Line
            type="monotone"
            dataKey="total"
            stroke="hsl(var(--primary))"
            strokeWidth={2}
            dot={false}
            name="Total Tokens"
            connectNulls
            isAnimationActive={false}
          />
        )}
        {showBrush && dataLength > 10 && (
          <Brush
            key={`brush-${dataLength}-${isExpanded}`}
            dataKey="turn"
            height={30}
            stroke="hsl(var(--primary))"
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

export function TokenUsageChart({ data, showBreakdown = true }: TokenUsageChartProps) {
  const chartData: ChartDataPoint[] = data.map((metric) => {
    // Extract tokens with fallback - handle both direct and nested access patterns
    const tokens = metric.tokens ?? {
      input: 0,
      output: 0,
      cacheCreation: 0,
      cacheRead: 0,
      total: 0,
    };

    return {
      turn: metric.turnNumber,
      input: tokens.input ?? 0,
      output: tokens.output ?? 0,
      cacheCreation: tokens.cacheCreation ?? 0,
      cacheRead: tokens.cacheRead ?? 0,
      total: tokens.total ?? 0,
    };
  });

  // Debug log to verify data structure
  if (typeof window !== 'undefined' && data.length > 0) {
    console.log('[TokenUsageChart] Raw metric data:', {
      turnNumber: data[0]?.turnNumber,
      tokens: data[0]?.tokens,
      durationMs: data[0]?.durationMs,
    });
    console.log('[TokenUsageChart] Processed chart data:', chartData[0]);
  }

  // Check if we have any non-zero token data
  const hasData = chartData.some(d => d.total > 0 || d.input > 0 || d.output > 0);

  if (!hasData && chartData.length > 0) {
    console.warn('[TokenUsageChart] All token values are zero. Check if token data is being parsed correctly from JSONL.');
  }

  return (
    <ChartCard
      title="Token Usage Over Turns"
      expandedContent={() => (
        <TokenUsageLineChart chartData={chartData} showBreakdown={true} showBrush={true} isExpanded={true} />
      )}
    >
      <TokenUsageLineChart chartData={chartData} showBreakdown={showBreakdown} />
    </ChartCard>
  );
}

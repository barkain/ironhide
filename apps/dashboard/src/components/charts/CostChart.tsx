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
import { formatCurrency } from '@/lib/utils';
import type { SerializedTurnMetrics } from '@analytics/shared';

interface CostChartProps {
  data: SerializedTurnMetrics[];
  showBreakdown?: boolean;
}

interface ChartDataPoint {
  turn: number;
  total: number;
  input: number;
  output: number;
  cacheCreation: number;
  turnCost: number;
}

function CostLineChart({
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
          tickFormatter={(value) => `$${value.toFixed(2)}`}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: 'hsl(var(--card))',
            border: '1px solid hsl(var(--border))',
            borderRadius: 'var(--radius)',
          }}
          formatter={(value: number, name: string) => [formatCurrency(value), name]}
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
              name="Input Cost"
            />
            <Line
              type="monotone"
              dataKey="output"
              stroke="hsl(var(--chart-2))"
              strokeWidth={2}
              dot={false}
              name="Output Cost"
            />
            <Line
              type="monotone"
              dataKey="cacheCreation"
              stroke="hsl(var(--chart-3))"
              strokeWidth={2}
              dot={false}
              name="Cache Creation"
            />
          </>
        ) : (
          <Line
            type="monotone"
            dataKey="total"
            stroke="hsl(var(--primary))"
            strokeWidth={2}
            dot={false}
            name="Total Cost"
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

export function CostChart({ data, showBreakdown = true }: CostChartProps) {
  // Calculate cumulative costs
  let cumulativeTotal = 0;
  let cumulativeInput = 0;
  let cumulativeOutput = 0;
  let cumulativeCacheCreation = 0;

  const chartData: ChartDataPoint[] = data.map((metric) => {
    // Extract cost with fallback - handle both direct and nested access patterns
    const cost = metric.cost ?? {
      input: 0,
      output: 0,
      cacheCreation: 0,
      total: 0,
    };

    cumulativeTotal += cost.total ?? 0;
    cumulativeInput += cost.input ?? 0;
    cumulativeOutput += cost.output ?? 0;
    cumulativeCacheCreation += cost.cacheCreation ?? 0;

    return {
      turn: metric.turnNumber,
      total: cumulativeTotal,
      input: cumulativeInput,
      output: cumulativeOutput,
      cacheCreation: cumulativeCacheCreation,
      turnCost: cost.total ?? 0,
    };
  });

  // Debug log to verify data structure
  if (typeof window !== 'undefined' && data.length > 0) {
    console.log('[CostChart] Raw metric data:', {
      turnNumber: data[0]?.turnNumber,
      cost: data[0]?.cost,
      durationMs: data[0]?.durationMs,
    });
    console.log('[CostChart] Processed chart data:', chartData[0]);
  }

  // Check if we have any non-zero cost data
  const hasData = chartData.some(d => d.total > 0 || d.turnCost > 0);

  if (!hasData && chartData.length > 0) {
    console.warn('[CostChart] All cost values are zero. Check if cost data is being calculated correctly.');
  }

  return (
    <ChartCard
      title="Cumulative Cost Over Turns"
      expandedContent={() => (
        <CostLineChart chartData={chartData} showBreakdown={true} showBrush={true} isExpanded={true} />
      )}
    >
      <CostLineChart chartData={chartData} showBreakdown={showBreakdown} />
    </ChartCard>
  );
}

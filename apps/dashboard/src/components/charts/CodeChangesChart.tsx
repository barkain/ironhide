'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  Brush,
  ReferenceLine,
} from 'recharts';
import { ChartCard } from './ChartCard';
import { formatNumber } from '@/lib/utils';
import type { SerializedTurnMetrics } from '@analytics/shared';

interface CodeChangesChartProps {
  data: SerializedTurnMetrics[];
}

interface ChartDataPoint {
  turn: number;
  added: number;
  removed: number; // Negative value for display below zero
  net: number;
  filesCreated: number;
  filesModified: number;
  filesDeleted: number;
}

function CodeChangesBarChart({
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
      <BarChart
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
          domain={['auto', 'auto']}
          tickFormatter={(value) => formatNumber(Math.abs(value))}
        />
        {/* Reference line at zero */}
        <ReferenceLine y={0} stroke="hsl(var(--border))" />
        <Tooltip
          contentStyle={{
            backgroundColor: 'hsl(var(--card))',
            border: '1px solid hsl(var(--border))',
            borderRadius: 'var(--radius)',
          }}
          formatter={(value: number, name: string) => {
            // Show absolute value for removed lines
            return [formatNumber(Math.abs(value)), name];
          }}
          labelFormatter={(label) => `Turn ${label}`}
        />
        <Legend />
        <Bar
          dataKey="added"
          fill="hsl(142 76% 36%)"
          name="Lines Added"
          radius={[4, 4, 0, 0]}
        />
        <Bar
          dataKey="removed"
          fill="hsl(0 84% 60%)"
          name="Lines Removed"
          radius={[4, 4, 0, 0]}
        />
        {showBrush && dataLength > 10 && (
          <Brush
            key={`brush-${dataLength}-${isExpanded}`}
            dataKey="turn"
            height={30}
            stroke="hsl(142 76% 36%)"
            fill="hsl(var(--muted))"
            startIndex={brushStartIndex}
            endIndex={brushEndIndex}
            tickFormatter={(value) => `T${value}`}
          />
        )}
      </BarChart>
    </ResponsiveContainer>
  );
}

export function CodeChangesChart({ data }: CodeChangesChartProps) {
  const chartData: ChartDataPoint[] = data.map((metric) => {
    // Extract codeMetrics with fallback
    const codeMetrics = metric.codeMetrics ?? {
      linesAdded: 0,
      linesRemoved: 0,
      netLinesChanged: 0,
      filesCreated: 0,
      filesModified: 0,
      filesDeleted: 0,
    };

    return {
      turn: metric.turnNumber,
      added: codeMetrics.linesAdded ?? 0,
      removed: -(codeMetrics.linesRemoved ?? 0), // Negative to show below zero
      net: codeMetrics.netLinesChanged ?? 0,
      filesCreated: codeMetrics.filesCreated ?? 0,
      filesModified: codeMetrics.filesModified ?? 0,
      filesDeleted: codeMetrics.filesDeleted ?? 0,
    };
  });

  return (
    <ChartCard
      title="Code Changes"
      info="A turn is one complete user prompt → assistant response cycle, including all tool uses in between."
      expandedContent={() => (
        <CodeChangesBarChart chartData={chartData} showBrush={true} isExpanded={true} />
      )}
    >
      <CodeChangesBarChart chartData={chartData} />
    </ChartCard>
  );
}

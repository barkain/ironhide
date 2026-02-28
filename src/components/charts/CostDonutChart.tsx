import { useState, useCallback } from 'react';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Sector,
} from 'recharts';
import type { PieSectorDataItem } from 'recharts/types/polar/Pie';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/Card';
import { formatCurrency } from '../../lib/utils';
import { useThemeColors } from '../../hooks/useThemeColors';
import type { CostSummary } from '../../types';

interface CostDonutChartProps {
  cost: CostSummary;
  isLoading?: boolean;
}

// Blues/purples color scheme as specified
const COLORS = {
  input: '#3b82f6',      // Blue-500
  output: '#8b5cf6',     // Violet-500
  cacheWrite: '#6366f1', // Indigo-500
  cacheRead: '#a78bfa',  // Violet-400
};

interface ChartDataItem {
  name: string;
  value: number;
  color: string;
  key: string;
}

// Custom active shape for hover effect
const renderActiveShape = (props: PieSectorDataItem) => {
  const {
    cx,
    cy,
    innerRadius,
    outerRadius,
    startAngle,
    endAngle,
    fill,
  } = props;

  return (
    <g>
      <Sector
        cx={cx}
        cy={cy}
        innerRadius={innerRadius}
        outerRadius={(outerRadius ?? 0) + 8}
        startAngle={startAngle}
        endAngle={endAngle}
        fill={fill}
        style={{
          filter: 'drop-shadow(0 4px 8px rgba(0, 0, 0, 0.3))',
          transition: 'all 0.2s ease-out',
        }}
      />
    </g>
  );
};

// Custom tooltip component
interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{
    name: string;
    value: number;
    payload: ChartDataItem;
  }>;
  totalCost: number;
  themeColors?: ReturnType<typeof useThemeColors>;
}

function CustomTooltip({ active, payload, totalCost, themeColors }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  const data = payload[0];
  const percentage = totalCost > 0 ? ((data.value / totalCost) * 100).toFixed(1) : '0.0';

  return (
    <div
      style={{
        backgroundColor: themeColors?.tooltipBg ?? '#1a1a1c',
        border: `1px solid ${themeColors?.tooltipBorder ?? '#2a2a2e'}`,
        borderRadius: '8px',
        padding: '12px',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
      }}
    >
      <div className="flex items-center gap-2 mb-1">
        <div
          className="w-3 h-3 rounded-full"
          style={{ backgroundColor: data.payload.color }}
        />
        <span className="text-white font-medium">{data.name}</span>
      </div>
      <div className="text-gray-300 text-sm">
        {formatCurrency(data.value)}
      </div>
      <div className="text-gray-400 text-xs mt-1">
        {percentage}% of total
      </div>
    </div>
  );
}

export function CostDonutChart({ cost, isLoading }: CostDonutChartProps) {
  const tc = useThemeColors();
  const [activeIndex, setActiveIndex] = useState<number | undefined>(undefined);

  const onPieEnter = useCallback((_: unknown, index: number) => {
    setActiveIndex(index);
  }, []);

  const onPieLeave = useCallback(() => {
    setActiveIndex(undefined);
  }, []);

  if (isLoading) {
    return (
      <Card className="h-80">
        <CardHeader>
          <CardTitle>Cost Breakdown</CardTitle>
        </CardHeader>
        <CardContent className="flex h-56 items-center justify-center">
          <div className="animate-pulse text-gray-500">Loading...</div>
        </CardContent>
      </Card>
    );
  }

  // Prepare chart data - filter out zero values for cleaner display
  const chartData: ChartDataItem[] = [
    {
      name: 'Input Cost',
      value: cost.input_cost,
      color: COLORS.input,
      key: 'input',
    },
    {
      name: 'Output Cost',
      value: cost.output_cost,
      color: COLORS.output,
      key: 'output',
    },
    {
      name: 'Cache Write',
      value: cost.cache_write_cost,
      color: COLORS.cacheWrite,
      key: 'cacheWrite',
    },
    {
      name: 'Cache Read',
      value: cost.cache_read_cost,
      color: COLORS.cacheRead,
      key: 'cacheRead',
    },
  ].filter((item) => item.value > 0);

  // Handle case where all costs are zero
  if (chartData.length === 0 || cost.total_cost === 0) {
    return (
      <Card className="h-80">
        <CardHeader>
          <CardTitle>Cost Breakdown</CardTitle>
        </CardHeader>
        <CardContent className="flex h-56 items-center justify-center">
          <div className="text-gray-500">No cost data available</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-80">
      <CardHeader>
        <CardTitle>Cost Breakdown</CardTitle>
      </CardHeader>
      <CardContent className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={80}
              paddingAngle={2}
              dataKey="value"
              nameKey="name"
              activeShape={activeIndex !== undefined ? renderActiveShape : undefined}
              onMouseEnter={onPieEnter}
              onMouseLeave={onPieLeave}
              animationBegin={0}
              animationDuration={800}
              animationEasing="ease-out"
            >
              {chartData.map((entry) => (
                <Cell
                  key={entry.key}
                  fill={entry.color}
                  stroke="transparent"
                  style={{
                    transition: 'opacity 0.2s ease-out',
                    opacity: activeIndex === undefined || chartData[activeIndex]?.key === entry.key ? 1 : 0.6,
                  }}
                />
              ))}
            </Pie>
            <Tooltip
              content={<CustomTooltip totalCost={cost.total_cost} themeColors={tc} />}
            />
            {/* Custom center label */}
            <text x="50%" y="45%" textAnchor="middle" dominantBaseline="middle">
              <tspan
                x="50%"
                dy="-4"
                fill={tc.textSecondary}
                style={{ fontSize: '12px' }}
              >
                Total Cost
              </tspan>
            </text>
            <text x="50%" y="55%" textAnchor="middle" dominantBaseline="middle">
              <tspan
                x="50%"
                dy="4"
                fill={tc.textPrimary}
                fontWeight="600"
                style={{ fontSize: '16px' }}
              >
                {formatCurrency(cost.total_cost)}
              </tspan>
            </text>
          </PieChart>
        </ResponsiveContainer>

        {/* Legend */}
        <div className="flex flex-wrap justify-center gap-4 mt-2 -translate-y-2">
          {chartData.map((entry) => {
            const percentage = ((entry.value / cost.total_cost) * 100).toFixed(0);
            return (
              <div
                key={entry.key}
                className="flex items-center gap-1.5 text-xs"
              >
                <div
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ backgroundColor: entry.color }}
                />
                <span className="text-gray-400">
                  {entry.name}: {formatCurrency(entry.value)} ({percentage}%)
                </span>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

export default CostDonutChart;

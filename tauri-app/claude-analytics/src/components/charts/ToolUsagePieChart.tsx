import { useState, useCallback } from 'react';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from 'recharts';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/Card';
import { formatNumber } from '../../lib/utils';

export interface ToolUsageData {
  name: string;
  count: number;
}

interface ToolUsagePieChartProps {
  tools: ToolUsageData[];
  isLoading?: boolean;
  onToolClick?: (toolName: string) => void;
}

// Color palette for tool types - distinctive colors for each common tool
const TOOL_COLORS: Record<string, string> = {
  Bash: '#3b82f6',      // Blue
  Read: '#10b981',      // Green
  Write: '#f59e0b',     // Amber
  Edit: '#ef4444',      // Red
  Grep: '#8b5cf6',      // Purple
  Glob: '#ec4899',      // Pink
  Task: '#06b6d4',      // Cyan
  WebFetch: '#84cc16',  // Lime
  WebSearch: '#f97316', // Orange
  Skill: '#6366f1',     // Indigo
  NotebookEdit: '#14b8a6', // Teal
  SubagentTask: '#a855f7', // Violet
  AgentTask: '#0ea5e9', // Sky
  AskUserQuestion: '#d946ef', // Fuchsia
  TodoWrite: '#22c55e', // Emerald
};

// Fallback colors for tools not in the predefined list
const FALLBACK_COLORS = [
  '#64748b', // Slate
  '#78716c', // Stone
  '#737373', // Neutral
  '#71717a', // Zinc
  '#a1a1aa', // Gray
];

function getToolColor(toolName: string, index: number): string {
  return TOOL_COLORS[toolName] || FALLBACK_COLORS[index % FALLBACK_COLORS.length];
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{
    name: string;
    value: number;
    payload: {
      name: string;
      count: number;
      percentage: number;
    };
  }>;
}

function CustomTooltip({ active, payload }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  const data = payload[0].payload;

  return (
    <div
      className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3 shadow-lg"
    >
      <p className="font-semibold text-white">{data.name}</p>
      <p className="text-sm text-gray-300">
        Count: <span className="font-medium text-white">{formatNumber(data.count)}</span>
      </p>
      <p className="text-sm text-gray-300">
        Percentage: <span className="font-medium text-white">{data.percentage.toFixed(1)}%</span>
      </p>
    </div>
  );
}

const RADIAN = Math.PI / 180;

interface PieLabelRenderPropsExtended {
  cx?: number;
  cy?: number;
  midAngle?: number;
  innerRadius?: number;
  outerRadius?: number;
  percent?: number;
  name?: string;
}

function renderCustomLabel(props: PieLabelRenderPropsExtended) {
  const { cx = 0, cy = 0, midAngle = 0, innerRadius = 0, outerRadius = 0, percent = 0 } = props;
  const percentage = percent * 100;

  // Only show label if percentage is >= 5%
  if (percentage < 5) return null;

  const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);

  return (
    <text
      x={x}
      y={y}
      fill="white"
      textAnchor="middle"
      dominantBaseline="central"
      fontSize={12}
      fontWeight={600}
    >
      {`${percentage.toFixed(0)}%`}
    </text>
  );
}

interface LegendPayload {
  value: string;
  color?: string;
  payload?: {
    count: number;
  };
}

interface CustomLegendProps {
  payload?: LegendPayload[];
}

function CustomLegend({ payload }: CustomLegendProps) {
  if (!payload) return null;

  return (
    <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 mt-2">
      {payload.map((entry, index) => (
        <div key={`legend-${index}`} className="flex items-center gap-1.5">
          <div
            className="w-3 h-3 rounded-sm"
            style={{ backgroundColor: entry.color }}
          />
          <span className="text-xs text-gray-300">
            {entry.value} ({formatNumber(entry.payload?.count || 0)})
          </span>
        </div>
      ))}
    </div>
  );
}

export function ToolUsagePieChart({ tools, isLoading, onToolClick }: ToolUsagePieChartProps) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const handleMouseEnter = useCallback((_: unknown, index: number) => {
    setActiveIndex(index);
  }, []);

  const handleMouseLeave = useCallback(() => {
    setActiveIndex(null);
  }, []);

  const handleClick = useCallback(
    (data: { name: string }) => {
      if (onToolClick) {
        onToolClick(data.name);
      }
    },
    [onToolClick]
  );

  if (isLoading) {
    return (
      <Card className="h-80">
        <CardHeader>
          <CardTitle>Tool Usage Distribution</CardTitle>
        </CardHeader>
        <CardContent className="flex h-56 items-center justify-center">
          <div className="animate-pulse text-gray-500">Loading...</div>
        </CardContent>
      </Card>
    );
  }

  if (!tools || tools.length === 0) {
    return (
      <Card className="h-80">
        <CardHeader>
          <CardTitle>Tool Usage Distribution</CardTitle>
        </CardHeader>
        <CardContent className="flex h-56 items-center justify-center">
          <div className="text-gray-500">No data available</div>
        </CardContent>
      </Card>
    );
  }

  // Calculate total and percentages
  const total = tools.reduce((sum, tool) => sum + tool.count, 0);

  // Sort by count descending and add percentage
  const chartData = tools
    .sort((a, b) => b.count - a.count)
    .map((tool) => ({
      ...tool,
      percentage: total > 0 ? (tool.count / total) * 100 : 0,
    }));

  return (
    <Card className="h-80">
      <CardHeader>
        <CardTitle>Tool Usage Distribution</CardTitle>
      </CardHeader>
      <CardContent className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="45%"
              labelLine={false}
              label={renderCustomLabel}
              outerRadius={70}
              innerRadius={35}
              paddingAngle={2}
              dataKey="count"
              nameKey="name"
              onMouseEnter={handleMouseEnter}
              onMouseLeave={handleMouseLeave}
              onClick={handleClick}
              style={{ cursor: onToolClick ? 'pointer' : 'default' }}
            >
              {chartData.map((entry, index) => (
                <Cell
                  key={`cell-${entry.name}`}
                  fill={getToolColor(entry.name, index)}
                  stroke={activeIndex === index ? '#fff' : 'transparent'}
                  strokeWidth={activeIndex === index ? 2 : 0}
                  opacity={activeIndex === null || activeIndex === index ? 1 : 0.6}
                />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
            <Legend
              content={<CustomLegend />}
              verticalAlign="bottom"
              align="center"
            />
          </PieChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

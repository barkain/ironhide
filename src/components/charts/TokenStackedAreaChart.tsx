import { useState, useMemo, useCallback } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  Brush,
} from 'recharts';
import { formatCompactNumber } from '../../lib/utils';
import { useThemeColors } from '../../hooks/useThemeColors';
import type { TurnSummary } from '../../types';

/** Data point for token stacked area chart */
export interface TokenDataPoint {
  turnNumber: number;
  label: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  total: number;
}

interface TokenStackedAreaChartProps {
  /** Turn data from session */
  turns?: TurnSummary[];
  /** Pre-processed data points (alternative to turns) */
  data?: TokenDataPoint[];
  /** Chart title */
  title?: string;
  /** Show loading state */
  isLoading?: boolean;
  /** Chart height */
  height?: number;
  /** Show brush for range selection */
  showBrush?: boolean;
}

// Color scheme for stacked areas
const COLORS = {
  input: '#3b82f6',      // blue
  output: '#10b981',     // green
  cacheRead: '#06b6d4',  // cyan
  cacheWrite: '#f59e0b', // orange
};

/**
 * Transform TurnSummary array to chart data points
 */
function transformTurnsToData(turns: TurnSummary[]): TokenDataPoint[] {
  return turns.map((turn) => ({
    turnNumber: turn.turn_number,
    label: `Turn ${turn.turn_number}`,
    inputTokens: turn.tokens.input,
    outputTokens: turn.tokens.output,
    cacheReadTokens: turn.tokens.cache_read,
    cacheWriteTokens: turn.tokens.cache_write,
    total: turn.tokens.total,
  }));
}

/**
 * Custom tooltip component for displaying token breakdown
 */
interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{
    name: string;
    value: number;
    color: string;
    dataKey: string;
  }>;
  label?: string;
}

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  // Calculate total from all visible series
  const total = payload.reduce((sum, entry) => sum + (entry.value || 0), 0);

  return (
    <div
      className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3 shadow-lg"
    >
      <p className="mb-2 font-medium text-white">{label}</p>
      <div className="space-y-1">
        {payload.map((entry) => (
          <div key={entry.dataKey} className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div
                className="h-3 w-3 rounded-sm"
                style={{ backgroundColor: entry.color }}
              />
              <span className="text-sm text-gray-300">{entry.name}</span>
            </div>
            <span className="text-sm font-medium text-white">
              {formatCompactNumber(entry.value)}
            </span>
          </div>
        ))}
        <div className="mt-2 border-t border-[var(--color-border)] pt-2">
          <div className="flex items-center justify-between gap-4">
            <span className="text-sm font-medium text-gray-300">Total</span>
            <span className="text-sm font-bold text-white">
              {formatCompactNumber(total)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// Legend entry type for custom legend (compatible with Recharts LegendPayload)
interface LegendEntry {
  value: string;
  color?: string;
  dataKey?: string | number;
}

// Props type for custom legend render function
interface CustomLegendProps {
  payload?: readonly LegendEntry[];
}

/**
 * Token usage stacked area chart with breakdown by token type
 * Shows input, output, cache read, and cache write tokens per turn
 */
export function TokenStackedAreaChart({
  turns,
  data,
  title = 'Token Usage by Turn',
  isLoading = false,
  height = 400,
  showBrush = true,
}: TokenStackedAreaChartProps) {
  const tc = useThemeColors();
  // Track which series are visible (for toggleable legend)
  const [visibleSeries, setVisibleSeries] = useState({
    inputTokens: true,
    outputTokens: true,
    cacheReadTokens: true,
    cacheWriteTokens: true,
  });

  // Transform turns to data points if provided
  const chartData = useMemo(() => {
    if (data) return data;
    if (turns) return transformTurnsToData(turns);
    return [];
  }, [turns, data]);

  // Handle legend click to toggle series visibility
  const handleLegendClick = useCallback((dataKey: string) => {
    setVisibleSeries((prev) => ({
      ...prev,
      [dataKey]: !prev[dataKey as keyof typeof prev],
    }));
  }, []);

  // Custom legend with toggle support
  const renderLegend = useCallback(
    (props: CustomLegendProps) => {
      const { payload } = props;
      if (!payload) return null;

      return (
        <div className="flex flex-wrap justify-center gap-4 pt-2">
          {payload.map((entry) => {
            const dataKey = String(entry.dataKey || '');
            const isVisible = visibleSeries[dataKey as keyof typeof visibleSeries];
            return (
              <button
                key={dataKey}
                type="button"
                className={`flex items-center gap-2 rounded px-2 py-1 text-sm transition-opacity ${
                  isVisible ? 'opacity-100' : 'opacity-40'
                } hover:bg-[var(--color-surface-hover)]`}
                onClick={() => handleLegendClick(dataKey)}
              >
                <div
                  className="h-3 w-3 rounded-sm"
                  style={{ backgroundColor: entry.color }}
                />
                <span className="text-gray-300">{entry.value}</span>
              </button>
            );
          })}
        </div>
      );
    },
    [visibleSeries, handleLegendClick]
  );

  // Calculate content height (total height minus header ~80px)
  const contentHeight = height - 80;

  // Loading state
  if (isLoading) {
    return (
      <div
        className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-sm"
        style={{ height }}
      >
        <div className="mb-4">
          <h3 className="text-lg font-semibold text-white">{title}</h3>
        </div>
        <div
          className="flex items-center justify-center"
          style={{ height: contentHeight }}
        >
          <div className="animate-pulse text-gray-500">Loading...</div>
        </div>
      </div>
    );
  }

  // Empty state
  if (chartData.length === 0) {
    return (
      <div
        className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-sm"
        style={{ height }}
      >
        <div className="mb-4">
          <h3 className="text-lg font-semibold text-white">{title}</h3>
        </div>
        <div
          className="flex items-center justify-center"
          style={{ height: contentHeight }}
        >
          <div className="text-gray-500">No data available</div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-sm"
      style={{ height }}
    >
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-white">{title}</h3>
      </div>
      <div style={{ height: contentHeight }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={chartData}
            margin={{ top: 10, right: 30, left: 0, bottom: showBrush ? 30 : 0 }}
          >
            <defs>
              <linearGradient id="inputGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={COLORS.input} stopOpacity={0.8} />
                <stop offset="95%" stopColor={COLORS.input} stopOpacity={0.2} />
              </linearGradient>
              <linearGradient id="outputGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={COLORS.output} stopOpacity={0.8} />
                <stop offset="95%" stopColor={COLORS.output} stopOpacity={0.2} />
              </linearGradient>
              <linearGradient id="cacheReadGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={COLORS.cacheRead} stopOpacity={0.8} />
                <stop offset="95%" stopColor={COLORS.cacheRead} stopOpacity={0.2} />
              </linearGradient>
              <linearGradient id="cacheWriteGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={COLORS.cacheWrite} stopOpacity={0.8} />
                <stop offset="95%" stopColor={COLORS.cacheWrite} stopOpacity={0.2} />
              </linearGradient>
            </defs>

            <CartesianGrid strokeDasharray="3 3" stroke={tc.gridStroke} />

            <XAxis
              dataKey="label"
              stroke={tc.axisStroke}
              fontSize={12}
              tickLine={false}
              axisLine={{ stroke: tc.gridStroke }}
            />

            <YAxis
              stroke={tc.axisStroke}
              fontSize={12}
              tickLine={false}
              axisLine={{ stroke: tc.gridStroke }}
              tickFormatter={(value) => formatCompactNumber(value)}
            />

            <Tooltip content={<CustomTooltip />} />

            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            <Legend content={renderLegend as any} />

            {/* Stacked areas - order matters for visual stacking */}
            {visibleSeries.cacheWriteTokens && (
              <Area
                type="monotone"
                dataKey="cacheWriteTokens"
                name="Cache Write"
                stackId="tokens"
                stroke={COLORS.cacheWrite}
                fill="url(#cacheWriteGradient)"
                strokeWidth={2}
              />
            )}
            {visibleSeries.cacheReadTokens && (
              <Area
                type="monotone"
                dataKey="cacheReadTokens"
                name="Cache Read"
                stackId="tokens"
                stroke={COLORS.cacheRead}
                fill="url(#cacheReadGradient)"
                strokeWidth={2}
              />
            )}
            {visibleSeries.outputTokens && (
              <Area
                type="monotone"
                dataKey="outputTokens"
                name="Output"
                stackId="tokens"
                stroke={COLORS.output}
                fill="url(#outputGradient)"
                strokeWidth={2}
              />
            )}
            {visibleSeries.inputTokens && (
              <Area
                type="monotone"
                dataKey="inputTokens"
                name="Input"
                stackId="tokens"
                stroke={COLORS.input}
                fill="url(#inputGradient)"
                strokeWidth={2}
              />
            )}

            {/* Brush for range selection */}
            {showBrush && chartData.length > 10 && (
              <Brush
                dataKey="label"
                height={30}
                stroke="#3b82f6"
                fill={tc.surface}
                tickFormatter={() => ''}
              />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export default TokenStackedAreaChart;

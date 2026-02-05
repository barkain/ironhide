import { useMemo, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '../ui/Card';
import { formatCurrency, formatDuration, cn } from '../../lib/utils';
import type { TurnSummary } from '../../types';

/** Health status classification for a turn */
export type HealthStatus = 'efficient' | 'warning' | 'inefficient';

/** Turn data with health classification */
interface TurnHealthData {
  turn: TurnSummary;
  health: HealthStatus;
  costRatio: number;
  durationRatio: number;
}

/** Props for TurnHealthTimeline component */
interface TurnHealthTimelineProps {
  turns: TurnSummary[];
  onTurnClick?: (turnNumber: number) => void;
  isLoading?: boolean;
}

/** Summary statistics for health distribution */
interface HealthSummary {
  efficient: number;
  warning: number;
  inefficient: number;
  total: number;
}

// Health status colors matching the codebase color scheme
const HEALTH_COLORS: Record<HealthStatus, string> = {
  efficient: '#10b981',   // green
  warning: '#f59e0b',     // yellow/amber
  inefficient: '#ef4444', // red
};

const HEALTH_BG_CLASSES: Record<HealthStatus, string> = {
  efficient: 'bg-emerald-500',
  warning: 'bg-amber-500',
  inefficient: 'bg-red-500',
};

const HEALTH_LABELS: Record<HealthStatus, string> = {
  efficient: 'Efficient',
  warning: 'Warning',
  inefficient: 'Inefficient',
};

/**
 * Classify a turn's health status based on cost and duration ratios to average
 */
function classifyTurnHealth(
  turn: TurnSummary,
  avgCost: number,
  avgDuration: number
): { health: HealthStatus; costRatio: number; durationRatio: number } {
  const cost = turn.cost;
  const duration = turn.duration_ms ?? 0;

  const costRatio = avgCost > 0 ? cost / avgCost : 1;
  const durationRatio = avgDuration > 0 ? duration / avgDuration : 1;

  // Inefficient: cost > 2x avg OR duration > 2x avg
  if (costRatio > 2 || durationRatio > 2) {
    return { health: 'inefficient', costRatio, durationRatio };
  }

  // Warning: cost 1.5-2x avg OR duration 1.5-2x avg
  if (costRatio > 1.5 || durationRatio > 1.5) {
    return { health: 'warning', costRatio, durationRatio };
  }

  // Efficient: cost <= avg AND duration <= avg
  return { health: 'efficient', costRatio, durationRatio };
}

/**
 * Individual turn marker on the timeline with tooltip
 */
function TurnMarker({
  data,
  index,
  total,
  onTurnClick,
}: {
  data: TurnHealthData;
  index: number;
  total: number;
  onTurnClick?: (turnNumber: number) => void;
}) {
  const [showTooltip, setShowTooltip] = useState(false);

  const handleClick = () => {
    if (onTurnClick) {
      onTurnClick(data.turn.turn_number);
    }
  };

  // Calculate position percentage along the timeline
  const position = total > 1 ? (index / (total - 1)) * 100 : 50;

  return (
    <div
      className="absolute transform -translate-x-1/2"
      style={{ left: `${position}%` }}
    >
      {/* Tooltip */}
      {showTooltip && (
        <div
          className="absolute bottom-full mb-2 left-1/2 transform -translate-x-1/2 z-10
                     bg-[#1a1a1c] border border-[var(--color-border)] rounded-lg p-3 shadow-lg
                     whitespace-nowrap min-w-[200px]"
        >
          <div className="text-sm font-semibold text-white mb-2">
            Turn {data.turn.turn_number}
          </div>
          <div className="space-y-1 text-xs">
            <div className="flex justify-between gap-4">
              <span className="text-gray-400">Status:</span>
              <span
                className="font-medium"
                style={{ color: HEALTH_COLORS[data.health] }}
              >
                {HEALTH_LABELS[data.health]}
              </span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-gray-400">Cost:</span>
              <span className="text-white">
                {formatCurrency(data.turn.cost)} ({data.costRatio.toFixed(1)}x avg)
              </span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-gray-400">Duration:</span>
              <span className="text-white">
                {formatDuration((data.turn.duration_ms ?? 0) / 1000)} ({data.durationRatio.toFixed(1)}x avg)
              </span>
            </div>
            {data.turn.tools_used.length > 0 && (
              <div className="flex justify-between gap-4">
                <span className="text-gray-400">Tools:</span>
                <span className="text-white">{data.turn.tools_used.length}</span>
              </div>
            )}
            {data.turn.model && (
              <div className="flex justify-between gap-4">
                <span className="text-gray-400">Model:</span>
                <span className="text-white truncate max-w-[120px]">{data.turn.model}</span>
              </div>
            )}
          </div>
          {/* Tooltip arrow */}
          <div className="absolute top-full left-1/2 transform -translate-x-1/2
                          border-8 border-transparent border-t-[#2a2a2e]" />
        </div>
      )}

      {/* Marker button */}
      <button
        type="button"
        className={cn(
          'w-4 h-4 rounded-full transition-all duration-150 hover:scale-125 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[var(--color-surface)]',
          HEALTH_BG_CLASSES[data.health],
          onTurnClick ? 'cursor-pointer' : 'cursor-default'
        )}
        style={{
          boxShadow: `0 0 0 2px var(--color-surface), 0 0 8px ${HEALTH_COLORS[data.health]}40`,
        }}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        onClick={handleClick}
        aria-label={`Turn ${data.turn.turn_number}: ${HEALTH_LABELS[data.health]}`}
      />
    </div>
  );
}

/**
 * Summary statistics showing distribution of health statuses
 */
function HealthSummaryStats({ summary }: { summary: HealthSummary }) {
  const getPercentage = (count: number) => {
    if (summary.total === 0) return '0.0';
    return ((count / summary.total) * 100).toFixed(1);
  };

  return (
    <div className="flex flex-wrap items-center gap-4 text-sm">
      <div className="flex items-center gap-2">
        <div className={cn('w-3 h-3 rounded-full', HEALTH_BG_CLASSES.efficient)} />
        <span className="text-gray-400">Efficient:</span>
        <span className="text-white font-medium">
          {summary.efficient} ({getPercentage(summary.efficient)}%)
        </span>
      </div>
      <div className="flex items-center gap-2">
        <div className={cn('w-3 h-3 rounded-full', HEALTH_BG_CLASSES.warning)} />
        <span className="text-gray-400">Warning:</span>
        <span className="text-white font-medium">
          {summary.warning} ({getPercentage(summary.warning)}%)
        </span>
      </div>
      <div className="flex items-center gap-2">
        <div className={cn('w-3 h-3 rounded-full', HEALTH_BG_CLASSES.inefficient)} />
        <span className="text-gray-400">Inefficient:</span>
        <span className="text-white font-medium">
          {summary.inefficient} ({getPercentage(summary.inefficient)}%)
        </span>
      </div>
    </div>
  );
}

/**
 * TurnHealthTimeline - Visual timeline showing turn health status
 *
 * Displays a horizontal timeline with color-coded markers for each turn:
 * - Green (Efficient): cost < avg AND duration < avg
 * - Yellow (Warning): cost 1.5-2x avg OR duration 1.5-2x avg
 * - Red (Inefficient): cost > 2x avg OR duration > 2x avg
 */
export function TurnHealthTimeline({ turns, onTurnClick, isLoading }: TurnHealthTimelineProps) {
  const { healthData, summary, avgCost, avgDuration } = useMemo(() => {
    if (!turns || turns.length === 0) {
      return {
        healthData: [] as TurnHealthData[],
        summary: { efficient: 0, warning: 0, inefficient: 0, total: 0 },
        avgCost: 0,
        avgDuration: 0,
      };
    }

    // Calculate averages
    const totalCost = turns.reduce((sum, t) => sum + t.cost, 0);
    const totalDuration = turns.reduce((sum, t) => sum + (t.duration_ms ?? 0), 0);
    const avgCost = totalCost / turns.length;
    const avgDuration = totalDuration / turns.length;

    // Classify each turn
    const healthData: TurnHealthData[] = turns.map((turn) => {
      const classification = classifyTurnHealth(turn, avgCost, avgDuration);
      return {
        turn,
        ...classification,
      };
    });

    // Calculate summary
    const summary: HealthSummary = {
      efficient: healthData.filter((d) => d.health === 'efficient').length,
      warning: healthData.filter((d) => d.health === 'warning').length,
      inefficient: healthData.filter((d) => d.health === 'inefficient').length,
      total: healthData.length,
    };

    return { healthData, summary, avgCost, avgDuration };
  }, [turns]);

  // Loading state
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Turn Health Timeline</CardTitle>
          <CardDescription>Visual timeline showing turn efficiency status</CardDescription>
        </CardHeader>
        <CardContent className="flex h-32 items-center justify-center">
          <div className="animate-pulse text-gray-500">Loading...</div>
        </CardContent>
      </Card>
    );
  }

  // Empty state
  if (!turns || turns.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Turn Health Timeline</CardTitle>
          <CardDescription>Visual timeline showing turn efficiency status</CardDescription>
        </CardHeader>
        <CardContent className="flex h-32 items-center justify-center">
          <div className="text-gray-500">No turns available</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Turn Health Timeline</CardTitle>
        <CardDescription>
          Avg cost: {formatCurrency(avgCost)} | Avg duration: {formatDuration(avgDuration / 1000)}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* Summary statistics */}
        <div className="mb-6">
          <HealthSummaryStats summary={summary} />
        </div>

        {/* Timeline visualization */}
        <div className="relative py-8 px-2">
          {/* Timeline track */}
          <div className="absolute top-1/2 left-2 right-2 h-1 bg-[var(--color-border)] transform -translate-y-1/2 rounded-full" />

          {/* Turn start and end labels */}
          <div className="absolute left-0 top-full mt-2 text-xs text-gray-400">
            Turn 1
          </div>
          <div className="absolute right-0 top-full mt-2 text-xs text-gray-400">
            Turn {turns.length}
          </div>

          {/* Health markers */}
          <div className="relative h-4 mx-2">
            {healthData.map((data, index) => (
              <TurnMarker
                key={data.turn.turn_number}
                data={data}
                index={index}
                total={healthData.length}
                onTurnClick={onTurnClick}
              />
            ))}
          </div>
        </div>

        {/* Legend */}
        <div className="mt-8 pt-4 border-t border-[var(--color-border)]">
          <div className="text-xs text-gray-400 space-y-1">
            <div className="flex items-center gap-2">
              <div className={cn('w-2 h-2 rounded-full', HEALTH_BG_CLASSES.efficient)} />
              <span><strong className="text-gray-300">Efficient:</strong> Cost and duration at or below average</span>
            </div>
            <div className="flex items-center gap-2">
              <div className={cn('w-2 h-2 rounded-full', HEALTH_BG_CLASSES.warning)} />
              <span><strong className="text-gray-300">Warning:</strong> Cost or duration 1.5-2x average</span>
            </div>
            <div className="flex items-center gap-2">
              <div className={cn('w-2 h-2 rounded-full', HEALTH_BG_CLASSES.inefficient)} />
              <span><strong className="text-gray-300">Inefficient:</strong> Cost or duration over 2x average</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

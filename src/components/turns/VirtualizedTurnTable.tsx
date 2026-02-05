import { useRef, useCallback, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Badge } from '../ui/Badge';
import { cn, formatCurrency, formatCompactNumber, formatDateTime, formatDuration } from '../../lib/utils';
import { Bot, Wrench, ChevronDown, ChevronUp, Clock, Zap, DollarSign } from 'lucide-react';
import type { TurnSummary } from '../../types';

interface VirtualizedTurnTableProps {
  turns: TurnSummary[];
  onTurnClick?: (turn: TurnSummary) => void;
  className?: string;
}

// Estimated row heights for virtual scrolling
const ROW_HEIGHT_COLLAPSED = 72; // Base height for collapsed rows
const ROW_HEIGHT_EXPANDED_BASE = 200; // Base height for expanded rows
const HEADER_HEIGHT = 48;

export function VirtualizedTurnTable({ turns, onTurnClick, className }: VirtualizedTurnTableProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const [expandedTurns, setExpandedTurns] = useState<Set<number>>(new Set());

  // Calculate row height based on expanded state and content
  const getRowHeight = useCallback(
    (index: number) => {
      const turn = turns[index];
      if (!expandedTurns.has(turn.turn_number)) {
        return ROW_HEIGHT_COLLAPSED;
      }
      // Estimate expanded height based on content
      let height = ROW_HEIGHT_EXPANDED_BASE;
      if (turn.tools_used.length > 0) height += 40;
      if (turn.user_message) height += Math.min(160, Math.ceil(turn.user_message.length / 100) * 20 + 40);
      if (turn.assistant_message) height += Math.min(240, Math.ceil(turn.assistant_message.length / 100) * 20 + 40);
      return height;
    },
    [turns, expandedTurns]
  );

  const virtualizer = useVirtualizer({
    count: turns.length,
    getScrollElement: () => parentRef.current,
    estimateSize: getRowHeight,
    overscan: 5,
  });

  const toggleExpanded = useCallback((turnNumber: number) => {
    setExpandedTurns((prev) => {
      const next = new Set(prev);
      if (next.has(turnNumber)) {
        next.delete(turnNumber);
      } else {
        next.add(turnNumber);
      }
      return next;
    });
  }, []);

  const handleRowClick = useCallback(
    (turn: TurnSummary) => {
      toggleExpanded(turn.turn_number);
      onTurnClick?.(turn);
    },
    [toggleExpanded, onTurnClick]
  );

  return (
    <div className={cn('flex flex-col', className)}>
      {/* Fixed Header */}
      <div
        className="sticky top-0 z-10 grid grid-cols-[80px_1fr_120px_120px_120px_100px_40px] gap-4 bg-[var(--color-surface)] px-4 py-3 border-b border-gray-700 text-xs font-medium text-gray-400"
        style={{ height: HEADER_HEIGHT }}
      >
        <div>Turn</div>
        <div>Details</div>
        <div className="text-right">Input</div>
        <div className="text-right">Output</div>
        <div className="text-right">Cache</div>
        <div className="text-right">Cost</div>
        <div />
      </div>

      {/* Virtual scroll container */}
      <div
        ref={parentRef}
        className="flex-1 overflow-auto"
        style={{ height: 'calc(100vh - 400px)', minHeight: '400px' }}
      >
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            width: '100%',
            position: 'relative',
          }}
        >
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const turn = turns[virtualRow.index];
            const isExpanded = expandedTurns.has(turn.turn_number);

            return (
              <div
                key={turn.turn_number}
                className="absolute left-0 top-0 w-full"
                style={{
                  height: `${virtualRow.size}px`,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                <TurnRow
                  turn={turn}
                  isExpanded={isExpanded}
                  onClick={() => handleRowClick(turn)}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* Footer with count */}
      <div className="px-4 py-2 text-xs text-gray-500 border-t border-gray-700">
        Showing {turns.length} turns (virtualized)
      </div>
    </div>
  );
}

interface TurnRowProps {
  turn: TurnSummary;
  isExpanded: boolean;
  onClick: () => void;
}

function TurnRow({ turn, isExpanded, onClick }: TurnRowProps) {
  return (
    <div
      className={cn(
        'mx-2 my-1 rounded-lg bg-[var(--color-background)] cursor-pointer transition-colors hover:bg-gray-800/50',
        isExpanded && 'ring-1 ring-[var(--color-primary-500)]/30'
      )}
      onClick={onClick}
    >
      {/* Main row content */}
      <div className="grid grid-cols-[80px_1fr_120px_120px_120px_100px_40px] gap-4 items-center px-4 py-3">
        {/* Turn number */}
        <div className="font-medium text-white">
          #{turn.turn_number}
        </div>

        {/* Details with badges */}
        <div className="flex items-center gap-2 overflow-hidden">
          {turn.model && (
            <Badge variant="info" className="shrink-0 text-xs">
              {turn.model.split('-').slice(-1)[0]}
            </Badge>
          )}
          {turn.is_subagent && (
            <Badge variant="warning" className="shrink-0 text-xs">
              <Bot className="mr-1 h-3 w-3" />
              Subagent
            </Badge>
          )}
          {turn.tool_count > 0 && (
            <Badge variant="default" className="shrink-0 text-xs">
              <Wrench className="mr-1 h-3 w-3" />
              {turn.tool_count}
            </Badge>
          )}
          {turn.stop_reason && turn.stop_reason !== 'end_turn' && (
            <Badge variant="error" className="shrink-0 text-xs">
              {turn.stop_reason}
            </Badge>
          )}
          {turn.duration_ms && (
            <span className="text-xs text-gray-500 shrink-0">
              <Clock className="inline mr-1 h-3 w-3" />
              {formatDuration(turn.duration_ms / 1000)}
            </span>
          )}
        </div>

        {/* Input tokens */}
        <div className="text-right">
          <MetricBadge
            value={turn.tokens.input}
            icon={<Zap className="h-3 w-3" />}
            color="purple"
          />
        </div>

        {/* Output tokens */}
        <div className="text-right">
          <MetricBadge
            value={turn.tokens.output}
            icon={<Zap className="h-3 w-3" />}
            color="green"
          />
        </div>

        {/* Cache tokens */}
        <div className="text-right text-xs text-gray-400">
          <span className="text-green-400">{formatCompactNumber(turn.tokens.cache_read)}</span>
          {' / '}
          <span className="text-orange-400">{formatCompactNumber(turn.tokens.cache_write)}</span>
        </div>

        {/* Cost */}
        <div className="text-right">
          <MetricBadge
            value={turn.cost}
            formatter={formatCurrency}
            icon={<DollarSign className="h-3 w-3" />}
            color="yellow"
          />
        </div>

        {/* Expand toggle */}
        <div className="flex justify-center">
          <button
            className="p-1 hover:bg-gray-700 rounded transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              onClick();
            }}
          >
            {isExpanded ? (
              <ChevronUp className="h-4 w-4 text-gray-400" />
            ) : (
              <ChevronDown className="h-4 w-4 text-gray-400" />
            )}
          </button>
        </div>
      </div>

      {/* Expanded content */}
      {isExpanded && (
        <div className="px-4 pb-4 space-y-4 border-t border-gray-700/50 mt-2 pt-4">
          {/* Timestamp */}
          <div className="text-xs text-gray-500">
            {formatDateTime(turn.started_at)}
            {turn.ended_at && ` - ${formatDateTime(turn.ended_at)}`}
          </div>

          {/* Tools used */}
          {turn.tools_used.length > 0 && (
            <div>
              <p className="text-xs text-gray-400 mb-2">Tools Used</p>
              <div className="flex flex-wrap gap-2">
                {turn.tools_used.map((tool, i) => (
                  <Badge key={i} variant="default" className="text-xs">
                    {tool}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* User message */}
          {turn.user_message && (
            <div>
              <p className="text-xs text-gray-400 mb-2">User Message</p>
              <div className="rounded bg-gray-800 p-3 text-sm text-gray-300 max-h-40 overflow-y-auto">
                <pre className="whitespace-pre-wrap font-sans">{turn.user_message}</pre>
              </div>
            </div>
          )}

          {/* Assistant message */}
          {turn.assistant_message && (
            <div>
              <p className="text-xs text-gray-400 mb-2">Assistant Response</p>
              <div className="rounded bg-gray-800 p-3 text-sm text-gray-300 max-h-60 overflow-y-auto">
                <pre className="whitespace-pre-wrap font-sans">{turn.assistant_message}</pre>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface MetricBadgeProps {
  value: number;
  formatter?: (value: number) => string;
  icon?: React.ReactNode;
  color: 'purple' | 'green' | 'yellow' | 'orange' | 'blue';
}

const colorStyles: Record<MetricBadgeProps['color'], string> = {
  purple: 'bg-purple-900/30 text-purple-400 border-purple-800/50',
  green: 'bg-green-900/30 text-green-400 border-green-800/50',
  yellow: 'bg-yellow-900/30 text-yellow-400 border-yellow-800/50',
  orange: 'bg-orange-900/30 text-orange-400 border-orange-800/50',
  blue: 'bg-blue-900/30 text-blue-400 border-blue-800/50',
};

function MetricBadge({ value, formatter, icon, color }: MetricBadgeProps) {
  const displayValue = formatter ? formatter(value) : formatCompactNumber(value);

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium',
        colorStyles[color]
      )}
    >
      {icon}
      {displayValue}
    </span>
  );
}

export default VirtualizedTurnTable;

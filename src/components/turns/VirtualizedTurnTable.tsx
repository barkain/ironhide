import { useRef, useCallback, useState, useMemo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Badge } from '../ui/Badge';
import { cn, formatCurrency, formatCompactNumber, formatDateTime, formatDuration, cleanMessageContent } from '../../lib/utils';
import { Bot, Wrench, ChevronDown, ChevronUp, Clock, Zap, DollarSign, Search, SortAsc, SortDesc, Filter } from 'lucide-react';
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
const CONTROLS_HEIGHT = 56;

type SortField = 'turn' | 'cost' | 'input' | 'output' | 'duration';
type SortDirection = 'asc' | 'desc';

export function VirtualizedTurnTable({ turns, onTurnClick, className }: VirtualizedTurnTableProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const [expandedTurns, setExpandedTurns] = useState<Set<number>>(new Set());

  // Filter and sort state
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<SortField>('turn');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [minCost, setMinCost] = useState<string>('');
  const [hasToolsOnly, setHasToolsOnly] = useState(false);

  // Filter and sort turns
  const filteredTurns = useMemo(() => {
    let result = [...turns];

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter((turn) => {
        const userMsg = turn.user_message?.toLowerCase() || '';
        const assistantMsg = turn.assistant_message?.toLowerCase() || '';
        const tools = turn.tools_used.join(' ').toLowerCase();
        return userMsg.includes(query) || assistantMsg.includes(query) || tools.includes(query);
      });
    }

    // Apply min cost filter
    if (minCost) {
      const minCostValue = parseFloat(minCost);
      if (!isNaN(minCostValue)) {
        result = result.filter((turn) => turn.cost >= minCostValue);
      }
    }

    // Apply has tools filter
    if (hasToolsOnly) {
      result = result.filter((turn) => turn.tool_count > 0);
    }

    // Apply sorting
    result.sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case 'turn':
          comparison = a.turn_number - b.turn_number;
          break;
        case 'cost':
          comparison = a.cost - b.cost;
          break;
        case 'input':
          comparison = a.tokens.input - b.tokens.input;
          break;
        case 'output':
          comparison = a.tokens.output - b.tokens.output;
          break;
        case 'duration':
          comparison = (a.duration_ms ?? 0) - (b.duration_ms ?? 0);
          break;
      }
      return sortDirection === 'asc' ? comparison : -comparison;
    });

    return result;
  }, [turns, searchQuery, sortField, sortDirection, minCost, hasToolsOnly]);

  const handleSort = useCallback((field: SortField) => {
    if (sortField === field) {
      setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection(field === 'turn' ? 'asc' : 'desc');
    }
  }, [sortField]);

  // Calculate row height based on expanded state and content
  const getRowHeight = useCallback(
    (index: number) => {
      const turn = filteredTurns[index];
      if (!turn || !expandedTurns.has(turn.turn_number)) {
        return ROW_HEIGHT_COLLAPSED;
      }
      // Estimate expanded height based on content
      let height = ROW_HEIGHT_EXPANDED_BASE;
      if (turn.tools_used.length > 0) height += 40;
      if (turn.user_message) height += Math.min(160, Math.ceil(turn.user_message.length / 100) * 20 + 40);
      if (turn.assistant_message) height += Math.min(240, Math.ceil(turn.assistant_message.length / 100) * 20 + 40);
      return height;
    },
    [filteredTurns, expandedTurns]
  );

  const virtualizer = useVirtualizer({
    count: filteredTurns.length,
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
      {/* Filter and Sort Controls */}
      <div
        className="sticky top-0 z-20 flex flex-wrap items-center gap-3 bg-[var(--color-surface)] px-4 py-3 border-b border-gray-700"
        style={{ height: CONTROLS_HEIGHT }}
      >
        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search turns..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-md border border-gray-700 bg-[var(--color-background)] py-1.5 pl-8 pr-3 text-sm text-white placeholder-gray-500 focus:border-[var(--color-primary-500)] focus:outline-none"
          />
        </div>

        {/* Sort dropdown */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-400">Sort:</span>
          <select
            value={sortField}
            onChange={(e) => setSortField(e.target.value as SortField)}
            className="rounded-md border border-gray-700 bg-[var(--color-background)] px-2 py-1.5 text-sm text-white focus:border-[var(--color-primary-500)] focus:outline-none"
          >
            <option value="turn">Turn #</option>
            <option value="cost">Cost</option>
            <option value="input">Input Tokens</option>
            <option value="output">Output Tokens</option>
            <option value="duration">Duration</option>
          </select>
          <button
            onClick={() => setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'))}
            className="p-1.5 rounded-md border border-gray-700 bg-[var(--color-background)] text-gray-400 hover:text-white hover:border-gray-600 transition-colors"
            title={sortDirection === 'asc' ? 'Ascending' : 'Descending'}
          >
            {sortDirection === 'asc' ? <SortAsc className="h-4 w-4" /> : <SortDesc className="h-4 w-4" />}
          </button>
        </div>

        {/* Min cost filter */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-400">Min $:</span>
          <input
            type="number"
            step="0.01"
            min="0"
            placeholder="0.00"
            value={minCost}
            onChange={(e) => setMinCost(e.target.value)}
            className="w-20 rounded-md border border-gray-700 bg-[var(--color-background)] px-2 py-1.5 text-sm text-white placeholder-gray-500 focus:border-[var(--color-primary-500)] focus:outline-none"
          />
        </div>

        {/* Has tools filter */}
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input
            type="checkbox"
            checked={hasToolsOnly}
            onChange={(e) => setHasToolsOnly(e.target.checked)}
            className="rounded border-gray-700 bg-[var(--color-background)] text-[var(--color-primary-500)] focus:ring-[var(--color-primary-500)]"
          />
          <span className="text-xs text-gray-400">Has tools</span>
        </label>

        {/* Results count */}
        <span className="text-xs text-gray-500 ml-auto">
          {filteredTurns.length} of {turns.length} turns
        </span>
      </div>

      {/* Fixed Header */}
      <div
        className="sticky z-10 grid grid-cols-[80px_1fr_120px_120px_120px_100px_40px] gap-4 bg-[var(--color-surface)] px-4 py-3 border-b border-gray-700 text-xs font-medium text-gray-400"
        style={{ top: CONTROLS_HEIGHT, height: HEADER_HEIGHT }}
      >
        <button
          onClick={() => handleSort('turn')}
          className={cn('text-left flex items-center gap-1', sortField === 'turn' && 'text-white')}
        >
          Turn
          {sortField === 'turn' && (sortDirection === 'asc' ? <SortAsc className="h-3 w-3" /> : <SortDesc className="h-3 w-3" />)}
        </button>
        <div>Details</div>
        <button
          onClick={() => handleSort('input')}
          className={cn('text-right flex items-center justify-end gap-1', sortField === 'input' && 'text-white')}
        >
          Input
          {sortField === 'input' && (sortDirection === 'asc' ? <SortAsc className="h-3 w-3" /> : <SortDesc className="h-3 w-3" />)}
        </button>
        <button
          onClick={() => handleSort('output')}
          className={cn('text-right flex items-center justify-end gap-1', sortField === 'output' && 'text-white')}
        >
          Output
          {sortField === 'output' && (sortDirection === 'asc' ? <SortAsc className="h-3 w-3" /> : <SortDesc className="h-3 w-3" />)}
        </button>
        <div className="text-right">Cache</div>
        <button
          onClick={() => handleSort('cost')}
          className={cn('text-right flex items-center justify-end gap-1', sortField === 'cost' && 'text-white')}
        >
          Cost
          {sortField === 'cost' && (sortDirection === 'asc' ? <SortAsc className="h-3 w-3" /> : <SortDesc className="h-3 w-3" />)}
        </button>
        <div />
      </div>

      {/* Virtual scroll container */}
      <div
        ref={parentRef}
        className="flex-1 overflow-auto"
        style={{ height: 'calc(100vh - 500px)', minHeight: '400px' }}
      >
        {filteredTurns.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-gray-500">
            <Filter className="h-8 w-8 mb-2" />
            <p>No turns match your filters</p>
            <button
              onClick={() => {
                setSearchQuery('');
                setMinCost('');
                setHasToolsOnly(false);
              }}
              className="mt-2 text-sm text-[var(--color-primary-400)] hover:text-[var(--color-primary-300)]"
            >
              Clear filters
            </button>
          </div>
        ) : (
          <div
            style={{
              height: `${virtualizer.getTotalSize()}px`,
              width: '100%',
              position: 'relative',
            }}
          >
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const turn = filteredTurns[virtualRow.index];
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
        )}
      </div>

      {/* Footer with count */}
      <div className="px-4 py-2 text-xs text-gray-500 border-t border-gray-700">
        Showing {filteredTurns.length} of {turns.length} turns (virtualized)
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
                <pre className="whitespace-pre-wrap font-sans">{cleanMessageContent(turn.user_message)}</pre>
              </div>
            </div>
          )}

          {/* Assistant message */}
          {turn.assistant_message && (
            <div>
              <p className="text-xs text-gray-400 mb-2">Assistant Response</p>
              <div className="rounded bg-gray-800 p-3 text-sm text-gray-300 max-h-60 overflow-y-auto">
                <pre className="whitespace-pre-wrap font-sans">{cleanMessageContent(turn.assistant_message)}</pre>
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

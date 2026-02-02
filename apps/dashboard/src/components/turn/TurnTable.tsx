'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { formatCurrency, formatCurrencyCompact, formatNumber, formatDuration, truncate } from '@/lib/utils';
import type { SerializedTurn, SerializedTurnMetrics } from '@analytics/shared';
import { ChevronDown, ChevronUp, Clock, DollarSign, Gauge, Search, ArrowUpDown, Filter, X, Users, User } from 'lucide-react';

type SortField = 'turnNumber' | 'duration' | 'contextUsage' | 'cost';
type SortDirection = 'asc' | 'desc';

interface Filters {
  minDuration: number | null;
  minContextUsage: number | null;
  minCost: number | null;
}

interface TurnTableProps {
  turns: SerializedTurn[];
  metrics: SerializedTurnMetrics[];
  isLoading?: boolean;
  onLoadMore?: () => void;
  hasMore?: boolean;
}

export function TurnTable({
  turns,
  metrics,
  isLoading,
  onLoadMore,
  hasMore,
}: TurnTableProps) {
  const [expandedTurn, setExpandedTurn] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState<SortField>('turnNumber');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [filters, setFilters] = useState<Filters>({
    minDuration: null,
    minContextUsage: null,
    minCost: null,
  });
  const [showFilters, setShowFilters] = useState(false);
  const [showSubagents, setShowSubagents] = useState(false);

  const metricsMap = new Map(metrics.map((m) => [m.turnId, m]));

  // Count subagent turns for display
  const subagentCount = useMemo(() => {
    return turns.filter((turn) => turn.isSubagent).length;
  }, [turns]);

  // Filter and sort turns
  const filteredAndSortedTurns = useMemo(() => {
    let result = [...turns];

    // Filter out subagent turns by default (they have their own context windows)
    if (!showSubagents) {
      result = result.filter((turn) => !turn.isSubagent);
    }

    // Apply search filter
    if (searchTerm.trim()) {
      const lowerSearch = searchTerm.toLowerCase();
      result = result.filter(
        (turn) =>
          turn.userMessage.toLowerCase().includes(lowerSearch) ||
          turn.assistantMessage.toLowerCase().includes(lowerSearch)
      );
    }

    // Apply filters
    if (filters.minDuration !== null) {
      result = result.filter((turn) => {
        const turnMetrics = metricsMap.get(turn.id);
        const duration = turnMetrics?.durationMs ?? turn.durationMs ?? 0;
        return duration >= filters.minDuration! * 1000; // Convert seconds to ms
      });
    }

    if (filters.minContextUsage !== null) {
      result = result.filter((turn) => {
        const turnMetrics = metricsMap.get(turn.id);
        return (turnMetrics?.contextUsagePercent ?? 0) >= filters.minContextUsage!;
      });
    }

    if (filters.minCost !== null) {
      result = result.filter((turn) => {
        const turnMetrics = metricsMap.get(turn.id);
        return (turnMetrics?.cost?.total ?? 0) >= filters.minCost!;
      });
    }

    // Apply sorting
    result.sort((a, b) => {
      const aMetrics = metricsMap.get(a.id);
      const bMetrics = metricsMap.get(b.id);

      let comparison = 0;
      switch (sortField) {
        case 'turnNumber':
          comparison = a.turnNumber - b.turnNumber;
          break;
        case 'duration':
          comparison =
            (aMetrics?.durationMs ?? a.durationMs ?? 0) -
            (bMetrics?.durationMs ?? b.durationMs ?? 0);
          break;
        case 'contextUsage':
          comparison =
            (aMetrics?.contextUsagePercent ?? 0) -
            (bMetrics?.contextUsagePercent ?? 0);
          break;
        case 'cost':
          comparison =
            (aMetrics?.cost?.total ?? 0) - (bMetrics?.cost?.total ?? 0);
          break;
      }

      return sortDirection === 'asc' ? comparison : -comparison;
    });

    return result;
  }, [turns, searchTerm, sortField, sortDirection, filters, metricsMap, showSubagents]);

  const hasActiveFilters =
    filters.minDuration !== null ||
    filters.minContextUsage !== null ||
    filters.minCost !== null;

  const clearFilters = () => {
    setFilters({
      minDuration: null,
      minContextUsage: null,
      minCost: null,
    });
  };

  const toggleSortDirection = () => {
    setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
  };

  if (isLoading && turns.length === 0) {
    return <TurnTableSkeleton />;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Turn History</CardTitle>
      </CardHeader>
      <CardContent>
        {/* Filter Header */}
        <div className="mb-4 space-y-3">
          {/* Main filter row */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Search */}
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search turns..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8 h-9"
              />
            </div>

            {/* Sort dropdown */}
            <div className="flex items-center gap-1">
              <Select
                value={sortField}
                onChange={(e) => setSortField(e.target.value as SortField)}
                className="w-[140px]"
              >
                <option value="turnNumber">Turn #</option>
                <option value="duration">Duration</option>
                <option value="contextUsage">Context %</option>
                <option value="cost">Cost</option>
              </Select>
              <Button
                variant="outline"
                size="icon"
                onClick={toggleSortDirection}
                className="h-9 w-9"
                title={sortDirection === 'asc' ? 'Ascending' : 'Descending'}
              >
                <ArrowUpDown className={`h-4 w-4 ${sortDirection === 'desc' ? 'rotate-180' : ''}`} />
              </Button>
            </div>

            {/* Filters toggle */}
            <Button
              variant={showFilters || hasActiveFilters ? 'secondary' : 'outline'}
              size="sm"
              onClick={() => setShowFilters(!showFilters)}
              className="h-9"
            >
              <Filter className="h-4 w-4 mr-1" />
              Filters
              {hasActiveFilters && (
                <Badge variant="default" className="ml-1 h-5 px-1.5">
                  {[filters.minDuration, filters.minContextUsage, filters.minCost].filter(
                    (f) => f !== null
                  ).length}
                </Badge>
              )}
            </Button>

            {/* Subagent toggle - only show if there are subagent turns */}
            {subagentCount > 0 && (
              <Button
                variant={showSubagents ? 'secondary' : 'outline'}
                size="sm"
                onClick={() => setShowSubagents(!showSubagents)}
                className="h-9"
                title={showSubagents ? 'Hide subagent turns' : 'Show subagent turns'}
              >
                <Users className="h-4 w-4 mr-1" />
                {showSubagents ? 'Hide' : 'Show'} Subagents
                <Badge variant="outline" className="ml-1 h-5 px-1.5">
                  {subagentCount}
                </Badge>
              </Button>
            )}

            {/* Clear filters */}
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="h-9">
                <X className="h-4 w-4 mr-1" />
                Clear
              </Button>
            )}
          </div>

          {/* Filter options panel */}
          {showFilters && (
            <div className="flex flex-wrap items-center gap-3 p-3 bg-muted/50 rounded-md">
              {/* Duration filter */}
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground whitespace-nowrap">Duration:</span>
                <Select
                  value={filters.minDuration?.toString() ?? ''}
                  onChange={(e) =>
                    setFilters((prev) => ({
                      ...prev,
                      minDuration: e.target.value ? Number(e.target.value) : null,
                    }))
                  }
                  className="w-[100px]"
                >
                  <option value="">Any</option>
                  <option value="10">&gt; 10s</option>
                  <option value="30">&gt; 30s</option>
                  <option value="60">&gt; 1m</option>
                  <option value="300">&gt; 5m</option>
                </Select>
              </div>

              {/* Context usage filter */}
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground whitespace-nowrap">Context:</span>
                <Select
                  value={filters.minContextUsage?.toString() ?? ''}
                  onChange={(e) =>
                    setFilters((prev) => ({
                      ...prev,
                      minContextUsage: e.target.value ? Number(e.target.value) : null,
                    }))
                  }
                  className="w-[100px]"
                >
                  <option value="">Any</option>
                  <option value="25">&gt; 25%</option>
                  <option value="50">&gt; 50%</option>
                  <option value="75">&gt; 75%</option>
                  <option value="90">&gt; 90%</option>
                </Select>
              </div>

              {/* Cost filter */}
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground whitespace-nowrap">Cost:</span>
                <Select
                  value={filters.minCost?.toString() ?? ''}
                  onChange={(e) =>
                    setFilters((prev) => ({
                      ...prev,
                      minCost: e.target.value ? Number(e.target.value) : null,
                    }))
                  }
                  className="w-[110px]"
                >
                  <option value="">Any</option>
                  <option value="0.01">&gt; $0.01</option>
                  <option value="0.10">&gt; $0.10</option>
                  <option value="0.50">&gt; $0.50</option>
                  <option value="1.00">&gt; $1.00</option>
                </Select>
              </div>
            </div>
          )}

          {/* Results count */}
          {(searchTerm || hasActiveFilters || !showSubagents) && (
            <div className="text-sm text-muted-foreground">
              Showing {filteredAndSortedTurns.length} of {turns.length} turns
              {!showSubagents && subagentCount > 0 && (
                <span className="ml-1">({subagentCount} subagent turns hidden)</span>
              )}
            </div>
          )}
        </div>

        <ScrollArea className="h-[500px] w-full">
          <div className="space-y-2 pr-4 w-full max-w-full">
            {filteredAndSortedTurns.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Search className="h-12 w-12 mb-4 opacity-50" />
                <p className="text-lg font-medium">No matching turns</p>
                <p className="text-sm">
                  {searchTerm
                    ? 'Try a different search term'
                    : 'Adjust your filters to see more results'}
                </p>
                {(searchTerm || hasActiveFilters) && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-4"
                    onClick={() => {
                      setSearchTerm('');
                      clearFilters();
                    }}
                  >
                    Clear all filters
                  </Button>
                )}
              </div>
            ) : (
              filteredAndSortedTurns.map((turn) => {
                const turnMetrics = metricsMap.get(turn.id);
                const isExpanded = expandedTurn === turn.id;

                return (
                  <TurnRow
                    key={turn.id}
                    turn={turn}
                    metrics={turnMetrics}
                    isExpanded={isExpanded}
                    onToggle={() =>
                      setExpandedTurn(isExpanded ? null : turn.id)
                    }
                  />
                );
              })
            )}
          </div>
          {hasMore && onLoadMore && filteredAndSortedTurns.length > 0 && (
            <div className="mt-4 text-center">
              <Button variant="outline" onClick={onLoadMore} disabled={isLoading}>
                {isLoading ? 'Loading...' : 'Load More'}
              </Button>
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

interface TurnRowProps {
  turn: SerializedTurn;
  metrics?: SerializedTurnMetrics;
  isExpanded: boolean;
  onToggle: () => void;
}

function TurnRow({ turn, metrics, isExpanded, onToggle }: TurnRowProps) {
  return (
    <div className="border rounded-lg">
      <button
        onClick={onToggle}
        className="w-full text-left p-4 hover:bg-accent/50 transition-colors"
      >
        {/* Top row: Turn badge + stats (left) + expand icon (right) */}
        <div className="flex items-center justify-between gap-4 mb-2 min-w-0">
          <div className="flex items-center gap-3 flex-shrink-0">
            <Badge variant="outline">Turn {turn.turnNumber}</Badge>
            {/* Subagent indicator */}
            {turn.isSubagent && (
              <Badge variant="secondary" className="bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200">
                <Users className="h-3 w-3 mr-1" />
                {turn.agentId || 'Subagent'}
              </Badge>
            )}
            {/* Stats - compact, positioned after turn badge with phosphoric badges */}
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-cyan-400 text-black text-xs font-medium whitespace-nowrap">
                <Clock className="h-3 w-3 flex-shrink-0" />
                {formatDuration(metrics?.durationMs ?? turn.durationMs ?? 0)}
              </span>
              {/* Context badge: show "--" for subagent turns since they have their own context window */}
              {turn.isSubagent ? (
                <span
                  className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-300 text-gray-600 text-xs font-medium whitespace-nowrap"
                  title="Subagent context usage is not shown (uses separate context window)"
                >
                  <Gauge className="h-3 w-3 flex-shrink-0" />
                  --
                </span>
              ) : (
                <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-lime-400 text-black text-xs font-medium whitespace-nowrap">
                  <Gauge className="h-3 w-3 flex-shrink-0" />
                  {(metrics?.contextUsagePercent ?? 0).toFixed(1)}%
                </span>
              )}
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-fuchsia-400 text-black text-xs font-medium whitespace-nowrap tabular-nums">
                <DollarSign className="h-3 w-3 flex-shrink-0" />
                {formatCurrencyCompact(metrics?.cost?.total ?? 0)}
              </span>
            </div>
          </div>

          {/* Expand/collapse icon on the right */}
          <div className="flex-shrink-0">
            {isExpanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </div>
        </div>

        {/* Content: User message and assistant response */}
        <div className="min-w-0">
          <p className="font-medium truncate">{truncate(turn.userMessage, 100)}</p>
          <p className="text-sm text-muted-foreground truncate mt-1">
            {truncate(turn.assistantMessage, 150)}
          </p>
        </div>
      </button>

      {isExpanded && (
        <div className="px-4 pb-4 border-t bg-muted/30">
          <div className="grid grid-cols-2 gap-6 mt-4">
            <div>
              <h4 className="font-medium mb-2">User Message</h4>
              <p className="text-sm whitespace-pre-wrap bg-background p-3 rounded-md border">
                {turn.userMessage}
              </p>
            </div>
            <div>
              <h4 className="font-medium mb-2">Assistant Response</h4>
              <p className="text-sm whitespace-pre-wrap bg-background p-3 rounded-md border max-h-48 overflow-y-auto">
                {turn.assistantMessage}
              </p>
            </div>
          </div>

          {turn.toolUses.length > 0 && (
            <div className="mt-4">
              <h4 className="font-medium mb-2">Tool Uses ({turn.toolUses.length})</h4>
              <div className="flex flex-wrap gap-2">
                {turn.toolUses.map((tool) => (
                  <Badge
                    key={tool.id}
                    variant={tool.isError ? 'destructive' : 'secondary'}
                  >
                    {tool.name}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {turn.codeChanges.length > 0 && (
            <div className="mt-4">
              <h4 className="font-medium mb-2">Code Changes ({turn.codeChanges.length})</h4>
              <div className="space-y-1 text-sm">
                {turn.codeChanges.map((change, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <Badge
                      variant={
                        change.type === 'create'
                          ? 'success'
                          : change.type === 'delete'
                          ? 'destructive'
                          : 'secondary'
                      }
                    >
                      {change.type}
                    </Badge>
                    <span className="font-mono truncate">{change.filePath}</span>
                    {change.linesAdded > 0 && (
                      <span className="text-green-600">+{change.linesAdded}</span>
                    )}
                    {change.linesRemoved > 0 && (
                      <span className="text-red-600">-{change.linesRemoved}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {metrics && (
            <div className="mt-4 grid grid-cols-4 gap-4">
              <div className="bg-background p-3 rounded-md border">
                <p className="text-xs text-muted-foreground">Input Tokens</p>
                <p className="font-medium">{formatNumber(metrics.tokens.input)}</p>
              </div>
              <div className="bg-background p-3 rounded-md border">
                <p className="text-xs text-muted-foreground">Output Tokens</p>
                <p className="font-medium">{formatNumber(metrics.tokens.output)}</p>
              </div>
              <div className="bg-background p-3 rounded-md border">
                <p className="text-xs text-muted-foreground">Cache Read</p>
                <p className="font-medium">{formatNumber(metrics.tokens.cacheRead)}</p>
              </div>
              <div className="bg-background p-3 rounded-md border">
                <p className="text-xs text-muted-foreground">Context Usage</p>
                {turn.isSubagent ? (
                  <p className="font-medium text-muted-foreground" title="Subagent uses separate context window">
                    -- (subagent)
                  </p>
                ) : (
                  <p className="font-medium">{metrics.contextUsagePercent.toFixed(1)}%</p>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TurnTableSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-6 w-32" />
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="border rounded-lg p-4">
              <div className="flex items-start gap-4">
                <Skeleton className="h-6 w-20" />
                <div className="flex-1">
                  <Skeleton className="h-4 w-3/4 mb-2" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
                <div className="flex gap-4">
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-4 w-16" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

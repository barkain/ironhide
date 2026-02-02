'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCurrency, formatNumber, formatDuration, truncate } from '@/lib/utils';
import type { SerializedTurn, SerializedTurnMetrics } from '@analytics/shared';
import { ChevronDown, ChevronUp, Clock, DollarSign, Zap, Wrench } from 'lucide-react';

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

  const metricsMap = new Map(metrics.map((m) => [m.turnId, m]));

  if (isLoading && turns.length === 0) {
    return <TurnTableSkeleton />;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Turn History</CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[500px]">
          <div className="space-y-2">
            {turns.map((turn) => {
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
            })}
          </div>
          {hasMore && onLoadMore && (
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
        className="w-full text-left p-4 hover:bg-accent/50 transition-colors flex items-start gap-4"
      >
        <div className="flex items-center gap-2 shrink-0">
          <Badge variant="outline">Turn {turn.turnNumber}</Badge>
          {isExpanded ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <p className="font-medium truncate">{truncate(turn.userMessage, 100)}</p>
          <p className="text-sm text-muted-foreground truncate mt-1">
            {truncate(turn.assistantMessage, 150)}
          </p>
        </div>

        <div className="shrink-0 flex items-center gap-4 text-sm text-muted-foreground">
          {metrics && (
            <>
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {formatDuration(metrics.durationMs)}
              </span>
              <span className="flex items-center gap-1">
                <Zap className="h-3 w-3" />
                {formatNumber(metrics.tokens.total)}
              </span>
              <span className="flex items-center gap-1">
                <DollarSign className="h-3 w-3" />
                {formatCurrency(metrics.cost.total)}
              </span>
              <span className="flex items-center gap-1">
                <Wrench className="h-3 w-3" />
                {metrics.toolCount}
              </span>
            </>
          )}
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
                <p className="font-medium">{metrics.contextUsagePercent.toFixed(1)}%</p>
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

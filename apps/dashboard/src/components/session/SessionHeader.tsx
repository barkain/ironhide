'use client';

import { formatDistanceToNow, format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatDuration } from '@/lib/utils';
import type { SerializedSession, SessionMetrics } from '@analytics/shared';
import { ArrowLeft, GitBranch, Clock, RefreshCw } from 'lucide-react';
import Link from 'next/link';

interface SessionHeaderProps {
  session: SerializedSession;
  metrics: SessionMetrics | null;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

export function SessionHeader({
  session,
  metrics,
  onRefresh,
  isRefreshing,
}: SessionHeaderProps) {
  const startedAt = new Date(session.startedAt);
  const lastActivityAt = new Date(session.lastActivityAt);

  return (
    <div className="border-b pb-4 mb-6">
      <div className="flex items-center gap-4 mb-4">
        <Link href="/">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{session.projectName}</h1>
            {session.isActive && <Badge variant="success">Active</Badge>}
          </div>
          {session.branch && (
            <div className="flex items-center gap-1 text-muted-foreground mt-1">
              <GitBranch className="h-4 w-4" />
              <span>{session.branch}</span>
            </div>
          )}
        </div>
        {onRefresh && (
          <Button variant="outline" size="sm" onClick={onRefresh} disabled={isRefreshing}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-6 text-sm text-muted-foreground">
        <div className="flex items-center gap-1">
          <Clock className="h-4 w-4" />
          <span>Started {format(startedAt, 'MMM d, yyyy h:mm a')}</span>
        </div>
        <div>
          Last activity {formatDistanceToNow(lastActivityAt, { addSuffix: true })}
        </div>
        {metrics && (
          <>
            <div>Duration: {formatDuration(metrics.totalDurationMs)}</div>
            <div>Model: {session.model}</div>
          </>
        )}
      </div>
    </div>
  );
}

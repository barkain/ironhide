'use client';

import { useRouter } from 'next/navigation';
import { formatDistanceToNow } from 'date-fns';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn, formatCurrency, formatNumber } from '@/lib/utils';
import type { SessionListItem } from '@/lib/api';
import { FolderGit2, GitBranch, Clock, DollarSign } from 'lucide-react';

interface SessionListProps {
  sessions: SessionListItem[];
  selectedSessionId: string | null;
  isLoading?: boolean;
}

export function SessionList({ sessions, selectedSessionId, isLoading }: SessionListProps) {
  const router = useRouter();

  if (isLoading) {
    return (
      <div className="space-y-3 p-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <SessionListSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className="p-4 text-center text-muted-foreground">
        <p>No sessions found</p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-[calc(100vh-200px)]">
      <div className="space-y-2 p-4">
        {sessions.map((session) => (
          <SessionListItem
            key={session.id}
            session={session}
            isSelected={session.id === selectedSessionId}
            onClick={() => router.push(`/?session=${session.id}`)}
          />
        ))}
      </div>
    </ScrollArea>
  );
}

interface SessionListItemProps {
  session: SessionListItem;
  isSelected: boolean;
  onClick: () => void;
}

function SessionListItem({ session, isSelected, onClick }: SessionListItemProps) {
  const lastActivity = new Date(session.lastActivityAt);

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full text-left p-3 rounded-lg border transition-colors',
        isSelected
          ? 'bg-primary/10 border-primary'
          : 'bg-card hover:bg-accent border-border'
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <FolderGit2 className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="font-medium truncate">{session.projectName}</span>
            {session.isActive && (
              <Badge variant="success" className="shrink-0">Active</Badge>
            )}
          </div>

          {session.branch && (
            <div className="flex items-center gap-1 mt-1 text-sm text-muted-foreground">
              <GitBranch className="h-3 w-3" />
              <span className="truncate">{session.branch}</span>
            </div>
          )}
        </div>
      </div>

      <div className="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {formatDistanceToNow(lastActivity, { addSuffix: true })}
        </span>
        <span className="flex items-center gap-1">
          <DollarSign className="h-3 w-3" />
          {formatCurrency(session.summary.totalCost)}
        </span>
        <span>{formatNumber(session.summary.totalTurns)} turns</span>
      </div>
    </button>
  );
}

function SessionListSkeleton() {
  return (
    <div className="p-3 rounded-lg border">
      <div className="flex items-center gap-2">
        <Skeleton className="h-4 w-4 rounded" />
        <Skeleton className="h-4 w-32" />
      </div>
      <Skeleton className="h-3 w-24 mt-2" />
      <div className="flex gap-4 mt-2">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-3 w-12" />
        <Skeleton className="h-3 w-14" />
      </div>
    </div>
  );
}

'use client';

import { useRouter } from 'next/navigation';
import { formatDistanceToNow } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatCurrency, formatNumber, formatDuration } from '@/lib/utils';
import type { SessionListItem } from '@/lib/api';
import { FolderGit2, GitBranch, Clock, DollarSign, Hash, Zap } from 'lucide-react';

interface SessionCardProps {
  session: SessionListItem;
}

export function SessionCard({ session }: SessionCardProps) {
  const router = useRouter();
  const lastActivity = new Date(session.lastActivityAt);
  const startedAt = new Date(session.startedAt);
  const durationMs = lastActivity.getTime() - startedAt.getTime();

  const handleClick = () => {
    router.push(`/?session=${session.id}`);
  };

  return (
    <Card
      className="hover:bg-accent/50 transition-colors cursor-pointer"
      onClick={handleClick}
    >
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              <FolderGit2 className="h-5 w-5 text-muted-foreground" />
              <CardTitle className="text-lg">{session.projectName}</CardTitle>
            </div>
            {session.isActive && <Badge variant="success">Active</Badge>}
          </div>
          {session.branch && (
            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              <GitBranch className="h-4 w-4" />
              <span>{session.branch}</span>
            </div>
          )}
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-center gap-2">
              <Hash className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">Turns</p>
                <p className="font-medium">{formatNumber(session.summary.totalTurns)}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">Cost</p>
                <p className="font-medium">{formatCurrency(session.summary.totalCost)}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">Tokens</p>
                <p className="font-medium">{formatNumber(session.summary.totalTokens)}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">Duration</p>
                <p className="font-medium">{formatDuration(durationMs)}</p>
              </div>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-4">
            Last activity {formatDistanceToNow(lastActivity, { addSuffix: true })}
          </p>
        </CardContent>
      </Card>
  );
}

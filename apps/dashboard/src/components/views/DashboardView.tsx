'use client';

import { SessionCard } from '@/components/session/SessionCard';
import { MetricCard } from '@/components/metrics/MetricCard';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCurrency, formatNumber } from '@/lib/utils';
import type { SessionListItem } from '@/lib/api';
import { DollarSign, Zap, Hash, Activity } from 'lucide-react';

interface DashboardViewProps {
  sessions: SessionListItem[];
  total: number;
  isLoading?: boolean;
}

export function DashboardView({ sessions, total, isLoading }: DashboardViewProps) {
  // Calculate aggregate metrics
  const aggregateMetrics = sessions.reduce(
    (acc, session) => ({
      totalCost: acc.totalCost + session.summary.totalCost,
      totalTokens: acc.totalTokens + session.summary.totalTokens,
      totalTurns: acc.totalTurns + session.summary.totalTurns,
      activeSessions: acc.activeSessions + (session.isActive ? 1 : 0),
    }),
    { totalCost: 0, totalTokens: 0, totalTurns: 0, activeSessions: 0 }
  );

  return (
    <>
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Dashboard</h1>
        <p className="text-muted-foreground">
          Overview of your Claude Code sessions and usage
        </p>
      </div>

      {/* Aggregate Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <MetricCard
          title="Total Cost"
          value={formatCurrency(aggregateMetrics.totalCost)}
          icon={DollarSign}
          iconColor="text-green-600"
          isLoading={isLoading}
        />
        <MetricCard
          title="Total Tokens"
          value={formatNumber(aggregateMetrics.totalTokens)}
          icon={Zap}
          iconColor="text-yellow-600"
          isLoading={isLoading}
        />
        <MetricCard
          title="Total Turns"
          value={formatNumber(aggregateMetrics.totalTurns)}
          icon={Hash}
          iconColor="text-blue-600"
          isLoading={isLoading}
        />
        <MetricCard
          title="Active Sessions"
          value={aggregateMetrics.activeSessions}
          subtitle={`of ${total} total`}
          icon={Activity}
          iconColor="text-purple-600"
          isLoading={isLoading}
        />
      </div>

      {/* Sessions Grid */}
      <div className="mb-6">
        <h2 className="text-xl font-semibold mb-4">Recent Sessions</h2>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-48 rounded-lg" />
          ))}
        </div>
      ) : sessions.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Activity className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p className="text-lg">No sessions found</p>
          <p className="text-sm">
            Start using Claude Code to see your sessions here
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {sessions.map((session) => (
            <SessionCard key={session.id} session={session} />
          ))}
        </div>
      )}
    </>
  );
}

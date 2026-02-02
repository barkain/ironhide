'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { SessionHeader } from '@/components/session/SessionHeader';
import { MetricCard } from '@/components/metrics/MetricCard';
import { CostDisplay } from '@/components/metrics/CostDisplay';
import { EfficiencyScore } from '@/components/metrics/EfficiencyScore';
import { TokenUsageChart } from '@/components/charts/TokenUsageChart';
import { CostChart } from '@/components/charts/CostChart';
import { TurnDurationChart } from '@/components/charts/TurnDurationChart';
import { ContextUsageGauge } from '@/components/charts/ContextUsageGauge';
import { CodeChangesChart } from '@/components/charts/CodeChangesChart';
import { ToolUsageChart } from '@/components/charts/ToolUsageChart';
import { TurnTable } from '@/components/turn/TurnTable';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { useSession } from '@/hooks/useSessionData';
import { useTurns } from '@/hooks/useTurnData';
import { useMetrics } from '@/hooks/useMetrics';
import { formatNumber, formatDuration } from '@/lib/utils';
import type { SessionListItem } from '@/lib/api';
import { DollarSign, Zap, Hash, Clock, FileCode, Wrench, ArrowLeft } from 'lucide-react';

interface SessionDetailViewProps {
  sessionId: string;
  sessions: SessionListItem[];
  isLoadingSessions?: boolean;
}

export function SessionDetailView({
  sessionId,
  sessions,
  isLoadingSessions,
}: SessionDetailViewProps) {
  const router = useRouter();
  const { data: sessionData, isLoading: isLoadingSession, refetch } = useSession(sessionId);
  const { data: turnsData, isLoading: isLoadingTurns } = useTurns(sessionId);
  const { data: metricsData, isLoading: isLoadingMetrics } = useMetrics(sessionId);

  const isLoading = isLoadingSession || isLoadingMetrics;
  const session = sessionData?.session;
  const metrics = metricsData?.sessionMetrics;
  const efficiency = metricsData?.efficiency;
  const turnMetrics = metricsData?.turnMetrics ?? [];

  // Debug log to verify API data
  useEffect(() => {
    if (turnMetrics.length > 0) {
      console.log('[SessionPage] turnMetrics count:', turnMetrics.length);
      console.log('[SessionPage] First turn tokens:', turnMetrics[0]?.tokens);
      console.log('[SessionPage] First turn cost:', turnMetrics[0]?.cost);
    }
  }, [turnMetrics]);

  const handleBack = () => {
    router.push('/');
  };

  return (
    <>
      <div className="mb-4">
        <Button variant="ghost" onClick={handleBack} className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          Back to Dashboard
        </Button>
      </div>

      {isLoadingSession ? (
        <div className="space-y-4">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-48" />
        </div>
      ) : session ? (
        <SessionHeader
          session={session}
          metrics={metrics ?? null}
          onRefresh={() => refetch()}
          isRefreshing={isLoading}
        />
      ) : (
        <div className="text-center py-12">
          <p className="text-muted-foreground">Session not found</p>
        </div>
      )}

      {session && (
        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="charts">Charts</TabsTrigger>
            <TabsTrigger value="turns">Turns</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            {/* Metrics Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
              <MetricCard
                title="Total Cost"
                value={metrics ? `$${metrics.totalCost.toFixed(4)}` : '$0.00'}
                icon={DollarSign}
                iconColor="text-green-600"
                isLoading={isLoadingMetrics}
              />
              <MetricCard
                title="Total Tokens"
                value={formatNumber(metrics?.totalTokens.total ?? 0)}
                icon={Zap}
                iconColor="text-yellow-600"
                isLoading={isLoadingMetrics}
              />
              <MetricCard
                title="Turns"
                value={formatNumber(metrics?.totalTurns ?? 0)}
                icon={Hash}
                iconColor="text-blue-600"
                isLoading={isLoadingMetrics}
              />
              <MetricCard
                title="Duration"
                value={formatDuration(metrics?.totalDurationMs ?? 0)}
                icon={Clock}
                iconColor="text-purple-600"
                isLoading={isLoadingMetrics}
              />
              <MetricCard
                title="Code Changes"
                value={formatNumber(metrics?.totalCodeChanges.netLinesChanged ?? 0)}
                subtitle="net lines"
                icon={FileCode}
                iconColor="text-orange-600"
                isLoading={isLoadingMetrics}
              />
              <MetricCard
                title="Tool Uses"
                value={formatNumber(metrics?.totalToolUses ?? 0)}
                icon={Wrench}
                iconColor="text-cyan-600"
                isLoading={isLoadingMetrics}
              />
            </div>

            {/* Cost & Efficiency */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {metrics && (
                <CostDisplay
                  totalCost={metrics.totalCost}
                  costBreakdown={metrics.costBreakdown}
                  avgCostPerTurn={metrics.averages.costPerTurn}
                />
              )}
              {efficiency && <EfficiencyScore efficiency={efficiency} />}
              {metrics && (
                <ContextUsageGauge value={metrics.averages.contextUsagePercent} />
              )}
            </div>

            {/* Quick Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {turnMetrics.length > 0 && (
                <>
                  <TokenUsageChart data={turnMetrics} showBreakdown={false} />
                  <CostChart data={turnMetrics} showBreakdown={false} />
                </>
              )}
            </div>

            {/* Tool Usage */}
            {metrics && Object.keys(metrics.toolBreakdown).length > 0 && (
              <ToolUsageChart toolBreakdown={metrics.toolBreakdown} />
            )}
          </TabsContent>

          <TabsContent value="charts" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {turnMetrics.length > 0 ? (
                <>
                  <TokenUsageChart data={turnMetrics} showBreakdown={true} />
                  <CostChart data={turnMetrics} showBreakdown={true} />
                  <TurnDurationChart data={turnMetrics} />
                  <CodeChangesChart data={turnMetrics} />
                </>
              ) : (
                <div className="col-span-2 text-center py-12 text-muted-foreground">
                  <p>No turn data available for charts</p>
                </div>
              )}
            </div>

            {metrics && Object.keys(metrics.toolBreakdown).length > 0 && (
              <ToolUsageChart toolBreakdown={metrics.toolBreakdown} />
            )}
          </TabsContent>

          <TabsContent value="turns">
            <TurnTable
              turns={turnsData?.turns ?? []}
              metrics={turnsData?.metrics ?? []}
              isLoading={isLoadingTurns}
            />
          </TabsContent>
        </Tabs>
      )}
    </>
  );
}

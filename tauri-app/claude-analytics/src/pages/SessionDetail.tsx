import React, { useState, useMemo, useCallback, Suspense } from 'react';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import { Header } from '../components/layout/Header';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { EfficiencyGauge } from '../components/charts/EfficiencyGauge';
import { DrillDownBreadcrumb } from '../components/navigation/DrillDownBreadcrumb';
import { VirtualizedTurnTable } from '../components/turns/VirtualizedTurnTable';
import { TurnDetailView } from '../components/turns/TurnDetailView';
import { ComponentLoadingSpinner } from '../components/ui/PageLoadingSpinner';
import type { ToolUsageData } from '../components/charts/ToolUsagePieChart';
import { useSession, useTurns } from '../hooks/useSessions';

// Lazy load heavy chart components
const TokenStackedAreaChart = React.lazy(() => import('../components/charts/TokenStackedAreaChart'));
const CostDonutChart = React.lazy(() => import('../components/charts/CostDonutChart'));
const EfficiencyRadarChart = React.lazy(() => import('../components/charts/EfficiencyRadarChart'));
const ToolUsagePieChart = React.lazy(() => import('../components/charts/ToolUsagePieChart').then(m => ({ default: m.ToolUsagePieChart })));
const CodeChurnChart = React.lazy(() => import('../components/charts/CodeChurnChart'));
const TurnHealthTimeline = React.lazy(() => import('../components/charts/TurnHealthTimeline'));
const SubagentSankeyChart = React.lazy(() => import('../components/charts/SubagentSankeyChart').then(m => ({ default: m.SubagentSankeyChart })));
import {
  formatCurrency,
  formatNumber,
  formatDateTime,
  formatDuration,
  formatCompactNumber,
  cn,
} from '../lib/utils';
import {
  Clock,
  MessageSquare,
  DollarSign,
  Zap,
  Wrench,
  Bot,
  Activity,
  FileCode,
  BarChart3,
  GitBranch,
  Heart,
  Layers,
} from 'lucide-react';
import type { TurnSummary, SubagentSummary } from '../types';

// ============================================================================
// Tab Types and Configuration
// ============================================================================

type TabId = 'overview' | 'turns' | 'tokens' | 'tools' | 'code' | 'subagents' | 'health';

interface TabConfig {
  id: TabId;
  label: string;
  icon: React.ReactNode;
  showWhen?: (metrics: { subagentCount: number; hasCodeChurn: boolean }) => boolean;
}

const TABS: TabConfig[] = [
  { id: 'overview', label: 'Overview', icon: <BarChart3 className="h-4 w-4" /> },
  { id: 'turns', label: 'Turns', icon: <MessageSquare className="h-4 w-4" /> },
  { id: 'tokens', label: 'Tokens', icon: <Zap className="h-4 w-4" /> },
  { id: 'tools', label: 'Tools', icon: <Wrench className="h-4 w-4" /> },
  { id: 'code', label: 'Code', icon: <FileCode className="h-4 w-4" />, showWhen: ({ hasCodeChurn }) => hasCodeChurn },
  { id: 'subagents', label: 'Subagents', icon: <GitBranch className="h-4 w-4" />, showWhen: ({ subagentCount }) => subagentCount > 0 },
  { id: 'health', label: 'Health', icon: <Heart className="h-4 w-4" /> },
];

// ============================================================================
// Main Component
// ============================================================================

function SessionDetail() {
  const { id } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();

  const { data: session, isLoading: sessionLoading } = useSession(id || null);
  const { data: turns, isLoading: turnsLoading } = useTurns(id || '', 500, 0);

  const [activeTab, setActiveTab] = useState<TabId>('overview');

  // Handle turn selection via query params (deep linking support)
  const selectedTurnNumber = searchParams.get('turn') ? parseInt(searchParams.get('turn')!, 10) : null;
  const selectedTurn = selectedTurnNumber !== null
    ? turns?.find((t) => t.turn_number === selectedTurnNumber)
    : null;

  // Compute derived data
  const { toolUsageData, codeChurnData, subagentData, hasCodeChurn } = useMemo(() => {
    if (!turns || turns.length === 0) {
      return { toolUsageData: [], codeChurnData: [], subagentData: [], hasCodeChurn: false };
    }

    // Tool usage aggregation
    const toolCounts = new Map<string, number>();
    turns.forEach((turn) => {
      turn.tools_used.forEach((tool) => {
        toolCounts.set(tool, (toolCounts.get(tool) || 0) + 1);
      });
    });
    const toolUsageData: ToolUsageData[] = Array.from(toolCounts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    // Code churn data (based on Write/Edit tool usage - simulated for demo)
    // In a real implementation, this would come from actual file change data
    const codeChurnData = turns
      .filter((turn) => turn.tools_used.some((t) => ['Write', 'Edit', 'NotebookEdit'].includes(t)))
      .map((turn) => ({
        turn: turn.turn_number,
        added: Math.floor(turn.tokens.output * 0.1), // Rough estimation
        removed: Math.floor(turn.tokens.output * 0.02), // Rough estimation
      }));

    // Subagent data aggregation
    const subagentMap = new Map<string, SubagentSummary>();
    turns
      .filter((turn) => turn.is_subagent)
      .forEach((turn) => {
        const agentId = turn.model || 'unknown-agent';
        const existing = subagentMap.get(agentId);
        if (existing) {
          existing.turn_count++;
          existing.total_cost += turn.cost;
          existing.total_tokens += turn.tokens.total;
          turn.tools_used.forEach((tool) => {
            if (!existing.tools_used.includes(tool)) {
              existing.tools_used.push(tool);
            }
          });
        } else {
          subagentMap.set(agentId, {
            agent_id: agentId,
            slug: null,
            turn_count: 1,
            total_cost: turn.cost,
            total_tokens: turn.tokens.total,
            tools_used: [...turn.tools_used],
          });
        }
      });
    const subagentData = Array.from(subagentMap.values());

    return {
      toolUsageData,
      codeChurnData,
      subagentData,
      hasCodeChurn: codeChurnData.length > 0,
    };
  }, [turns]);

  // Determine which tabs to show
  const visibleTabs = useMemo(() => {
    const context = {
      subagentCount: session?.metrics.subagent_count ?? 0,
      hasCodeChurn,
    };
    return TABS.filter((tab) => !tab.showWhen || tab.showWhen(context));
  }, [session?.metrics.subagent_count, hasCodeChurn]);

  // Handlers
  const handleTurnClick = useCallback((turn: TurnSummary) => {
    setSearchParams({ turn: turn.turn_number.toString() });
  }, [setSearchParams]);

  const handleCloseTurnDetail = useCallback(() => {
    setSearchParams((params) => {
      params.delete('turn');
      return params;
    });
  }, [setSearchParams]);

  const handleTurnHealthClick = useCallback((turnNumber: number) => {
    setSearchParams({ turn: turnNumber.toString() });
  }, [setSearchParams]);

  // Loading state
  if (sessionLoading) {
    return (
      <div className="flex flex-col">
        <Header title="Session Details" />
        <div className="flex-1 p-6">
          <LoadingState />
        </div>
      </div>
    );
  }

  // Not found state
  if (!session) {
    return (
      <div className="flex flex-col">
        <Header title="Session Not Found" />
        <div className="flex-1 p-6">
          <NotFoundState />
        </div>
      </div>
    );
  }

  const { metrics } = session;

  return (
    <div className="flex flex-col min-h-screen">
      <Header title={session.project_name} subtitle={session.project_path} />

      <div className="flex-1 p-6 space-y-6">
        {/* Breadcrumb navigation */}
        <DrillDownBreadcrumb />

        {/* Stats row */}
        <StatsRow metrics={metrics} session={session} />

        {/* Tab navigation */}
        <div className="border-b border-gray-700">
          <nav className="flex space-x-1 overflow-x-auto" aria-label="Tabs">
            {visibleTabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap',
                  activeTab === tab.id
                    ? 'border-[var(--color-primary-500)] text-white'
                    : 'border-transparent text-gray-400 hover:text-white hover:border-gray-600'
                )}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Tab content */}
        <div className="min-h-[600px]">
          {activeTab === 'overview' && (
            <OverviewTab
              metrics={metrics}
              session={session}
              turns={turns}
              turnsLoading={turnsLoading}
            />
          )}

          {activeTab === 'turns' && (
            <TurnsTab
              turns={turns || []}
              turnsLoading={turnsLoading}
              onTurnClick={handleTurnClick}
            />
          )}

          {activeTab === 'tokens' && (
            <TokensTab
              turns={turns || []}
              turnsLoading={turnsLoading}
              metrics={metrics}
            />
          )}

          {activeTab === 'tools' && (
            <ToolsTab
              toolUsageData={toolUsageData}
              uniqueTools={metrics.unique_tools}
              toolCount={metrics.tool_count}
              isLoading={turnsLoading}
            />
          )}

          {activeTab === 'code' && (
            <CodeTab
              codeChurnData={codeChurnData}
              isLoading={turnsLoading}
            />
          )}

          {activeTab === 'subagents' && (
            <SubagentsTab
              subagentData={subagentData}
              sessionCost={metrics.cost.total_cost}
              subagentCount={metrics.subagent_count}
              efficiency={metrics.efficiency}
              isLoading={turnsLoading}
            />
          )}

          {activeTab === 'health' && (
            <HealthTab
              turns={turns || []}
              onTurnClick={handleTurnHealthClick}
              isLoading={turnsLoading}
            />
          )}
        </div>
      </div>

      {/* Turn detail modal */}
      {selectedTurn && (
        <TurnDetailView turn={selectedTurn} onClose={handleCloseTurnDetail} />
      )}
    </div>
  );
}

// ============================================================================
// Stats Row Component
// ============================================================================

interface StatsRowProps {
  metrics: NonNullable<ReturnType<typeof useSession>['data']>['metrics'];
  session: NonNullable<ReturnType<typeof useSession>['data']>;
}

function StatsRow({ metrics, session }: StatsRowProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
      <StatCard
        icon={<DollarSign className="h-5 w-5 text-[var(--color-primary-400)]" />}
        iconBg="bg-[var(--color-primary-600)]/20"
        label="Total Cost"
        value={formatCurrency(metrics.cost.total_cost)}
      />
      <StatCard
        icon={<MessageSquare className="h-5 w-5 text-green-400" />}
        iconBg="bg-green-600/20"
        label="Total Turns"
        value={formatNumber(metrics.turn_count)}
      />
      <StatCard
        icon={<Zap className="h-5 w-5 text-purple-400" />}
        iconBg="bg-purple-600/20"
        label="Total Tokens"
        value={formatCompactNumber(metrics.tokens.total)}
      />
      <StatCard
        icon={<Clock className="h-5 w-5 text-orange-400" />}
        iconBg="bg-orange-600/20"
        label="Duration"
        value={formatDuration(metrics.duration_ms / 1000)}
      />
      <StatCard
        icon={<Wrench className="h-5 w-5 text-blue-400" />}
        iconBg="bg-blue-600/20"
        label="Tools Used"
        value={formatNumber(metrics.tool_count)}
        badge={
          session.is_subagent ? (
            <Badge variant="warning" className="ml-2 text-xs">
              <Bot className="mr-1 h-3 w-3" />
              Subagent
            </Badge>
          ) : null
        }
      />
    </div>
  );
}

interface StatCardProps {
  icon: React.ReactNode;
  iconBg: string;
  label: string;
  value: string;
  badge?: React.ReactNode;
}

function StatCard({ icon, iconBg, label, value, badge }: StatCardProps) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4">
        <div className={cn('rounded-lg p-3', iconBg)}>{icon}</div>
        <div className="flex-1">
          <p className="text-sm text-gray-400">{label}</p>
          <div className="flex items-center">
            <p className="text-xl font-semibold text-white">{value}</p>
            {badge}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Overview Tab
// ============================================================================

interface OverviewTabProps {
  metrics: NonNullable<ReturnType<typeof useSession>['data']>['metrics'];
  session: NonNullable<ReturnType<typeof useSession>['data']>;
  turns: TurnSummary[] | undefined;
  turnsLoading: boolean;
}

function OverviewTab({ metrics, session, turns, turnsLoading }: OverviewTabProps) {
  return (
    <div className="space-y-6">
      {/* Efficiency and Cost charts */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <EfficiencyGauge
          value={metrics.efficiency.oes_score}
          label="Efficiency Score"
          description={`Grade: ${metrics.efficiency.oes_grade}`}
        />
        <Suspense fallback={<ComponentLoadingSpinner height={250} />}>
          <EfficiencyRadarChart
            efficiency={metrics.efficiency}
            isLoading={false}
          />
        </Suspense>
        <Suspense fallback={<ComponentLoadingSpinner height={250} />}>
          <CostDonutChart cost={metrics.cost} isLoading={false} />
        </Suspense>
      </div>

      {/* Session info and Efficiency metrics */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Session Info</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-3">
              <div className="flex justify-between">
                <dt className="text-gray-400">Session ID</dt>
                <dd className="font-mono text-sm text-white truncate max-w-[200px]">
                  {session.id}
                </dd>
              </div>
              <div className="flex justify-between items-center">
                <dt className="text-gray-400">Model</dt>
                <dd>
                  {session.model ? (
                    <Badge variant="info">{session.model}</Badge>
                  ) : (
                    <span className="text-gray-500">Unknown</span>
                  )}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-400">Started At</dt>
                <dd className="text-white">{formatDateTime(session.started_at)}</dd>
              </div>
              {session.last_activity_at && (
                <div className="flex justify-between">
                  <dt className="text-gray-400">Last Activity</dt>
                  <dd className="text-white">{formatDateTime(session.last_activity_at)}</dd>
                </div>
              )}
              <div className="flex justify-between items-center">
                <dt className="text-gray-400">Subagent</dt>
                <dd>
                  {session.is_subagent ? (
                    <Badge variant="warning">Yes</Badge>
                  ) : (
                    <span className="text-gray-500">No</span>
                  )}
                </dd>
              </div>
              {metrics.subagent_count > 0 && (
                <div className="flex justify-between">
                  <dt className="text-gray-400">Subagent Count</dt>
                  <dd className="text-white">{metrics.subagent_count}</dd>
                </div>
              )}
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Efficiency Metrics</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <MetricItem
                label="Cache Efficiency"
                value={`${(metrics.efficiency.cer * 100).toFixed(1)}%`}
              />
              <MetricItem
                label="Context Growth"
                value={`${metrics.efficiency.cgr.toFixed(2)}x`}
              />
              <MetricItem
                label="Workflow Friction"
                value={metrics.efficiency.wfs.toFixed(2)}
              />
              <MetricItem
                label="Cost/Deliverable"
                value={formatCurrency(metrics.efficiency.cpdu)}
              />
              <MetricItem
                label="Cycles/Deliverable"
                value={metrics.efficiency.cpd.toFixed(1)}
              />
              {metrics.efficiency.sei !== null && (
                <MetricItem
                  label="Subagent Efficiency"
                  value={`${(metrics.efficiency.sei * 100).toFixed(1)}%`}
                />
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Turn Health Timeline */}
      <Suspense fallback={<ComponentLoadingSpinner height={200} />}>
        <TurnHealthTimeline
          turns={turns || []}
          isLoading={turnsLoading}
        />
      </Suspense>

      {/* Tools summary */}
      {metrics.unique_tools.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Tools Used ({metrics.unique_tools.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {metrics.unique_tools.map((tool) => (
                <Badge key={tool} variant="default">
                  <Wrench className="mr-1 h-3 w-3" />
                  {tool}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function MetricItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-[var(--color-background)] p-4">
      <p className="text-xs text-gray-400">{label}</p>
      <p className="mt-1 text-lg font-semibold text-white">{value}</p>
    </div>
  );
}

// ============================================================================
// Turns Tab
// ============================================================================

interface TurnsTabProps {
  turns: TurnSummary[];
  turnsLoading: boolean;
  onTurnClick: (turn: TurnSummary) => void;
}

function TurnsTab({ turns, turnsLoading, onTurnClick }: TurnsTabProps) {
  if (turnsLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-20">
          <div className="animate-pulse text-gray-500">Loading turns...</div>
        </CardContent>
      </Card>
    );
  }

  if (turns.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-20">
          <MessageSquare className="h-12 w-12 text-gray-600 mb-4" />
          <p className="text-gray-500">No turns recorded</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <CardTitle>Session Turns ({turns.length})</CardTitle>
        <CardDescription>Click on a turn to view full details</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <VirtualizedTurnTable
          turns={turns}
          onTurnClick={onTurnClick}
        />
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Tokens Tab
// ============================================================================

interface TokensTabProps {
  turns: TurnSummary[];
  turnsLoading: boolean;
  metrics: NonNullable<ReturnType<typeof useSession>['data']>['metrics'];
}

function TokensTab({ turns, turnsLoading, metrics }: TokensTabProps) {
  return (
    <div className="space-y-6">
      {/* Token breakdown summary */}
      <Card>
        <CardHeader>
          <CardTitle>Token Summary</CardTitle>
          <CardDescription>Distribution of tokens in this session</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            <TokenSummaryItem label="Input" value={metrics.tokens.input} color="blue" />
            <TokenSummaryItem label="Output" value={metrics.tokens.output} color="green" />
            <TokenSummaryItem label="Cache Read" value={metrics.tokens.cache_read} color="cyan" />
            <TokenSummaryItem label="Cache Write (5m)" value={metrics.tokens.cache_write_5m} color="orange" />
            <TokenSummaryItem label="Cache Write (1h)" value={metrics.tokens.cache_write_1h} color="yellow" />
            <div className="rounded-lg bg-[var(--color-background)] p-4">
              <p className="text-sm text-gray-400">Context Used</p>
              <p className="mt-1 text-xl font-semibold text-white">
                {metrics.tokens.context_used_pct.toFixed(1)}%
              </p>
              <div className="mt-2 h-1 bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-blue-500 to-purple-500"
                  style={{ width: `${Math.min(100, metrics.tokens.context_used_pct)}%` }}
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Token stacked area chart */}
      <Suspense fallback={<ComponentLoadingSpinner height={450} />}>
        <TokenStackedAreaChart
          turns={turns}
          isLoading={turnsLoading}
          title="Token Usage Over Time"
          height={450}
          showBrush={true}
        />
      </Suspense>

      {/* Cost breakdown */}
      <Card>
        <CardHeader>
          <CardTitle>Cost Breakdown by Token Type</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <CostBreakdownRow
              label="Input Cost"
              value={metrics.cost.input_cost}
              total={metrics.cost.total_cost}
              color="blue"
            />
            <CostBreakdownRow
              label="Output Cost"
              value={metrics.cost.output_cost}
              total={metrics.cost.total_cost}
              color="green"
            />
            <CostBreakdownRow
              label="Cache Read Cost"
              value={metrics.cost.cache_read_cost}
              total={metrics.cost.total_cost}
              color="cyan"
            />
            <CostBreakdownRow
              label="Cache Write Cost"
              value={metrics.cost.cache_write_cost}
              total={metrics.cost.total_cost}
              color="orange"
            />
            <div className="border-t border-gray-700 pt-3 flex justify-between items-center">
              <span className="text-white font-medium">Total</span>
              <span className="text-white font-semibold">
                {formatCurrency(metrics.cost.total_cost)}
              </span>
            </div>
            <div className="text-xs text-gray-500">
              Avg: {formatCurrency(metrics.cost.avg_cost_per_turn)} per turn
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

interface TokenSummaryItemProps {
  label: string;
  value: number;
  color: 'blue' | 'green' | 'cyan' | 'orange' | 'yellow';
}

const tokenColors: Record<TokenSummaryItemProps['color'], string> = {
  blue: 'text-blue-400',
  green: 'text-green-400',
  cyan: 'text-cyan-400',
  orange: 'text-orange-400',
  yellow: 'text-yellow-400',
};

function TokenSummaryItem({ label, value, color }: TokenSummaryItemProps) {
  return (
    <div className="rounded-lg bg-[var(--color-background)] p-4">
      <p className="text-sm text-gray-400">{label}</p>
      <p className={cn('mt-1 text-xl font-semibold', tokenColors[color])}>
        {formatCompactNumber(value)}
      </p>
      <p className="text-xs text-gray-500">{formatNumber(value)}</p>
    </div>
  );
}

interface CostBreakdownRowProps {
  label: string;
  value: number;
  total: number;
  color: 'blue' | 'green' | 'cyan' | 'orange';
}

const costBarColors: Record<CostBreakdownRowProps['color'], string> = {
  blue: 'bg-blue-500',
  green: 'bg-green-500',
  cyan: 'bg-cyan-500',
  orange: 'bg-orange-500',
};

function CostBreakdownRow({ label, value, total, color }: CostBreakdownRowProps) {
  const percentage = total > 0 ? (value / total) * 100 : 0;

  return (
    <div className="space-y-1">
      <div className="flex justify-between items-center">
        <span className="text-gray-400">{label}</span>
        <span className="text-white">{formatCurrency(value)}</span>
      </div>
      <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
        <div
          className={cn('h-full rounded-full', costBarColors[color])}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

// ============================================================================
// Tools Tab
// ============================================================================

interface ToolsTabProps {
  toolUsageData: ToolUsageData[];
  uniqueTools: string[];
  toolCount: number;
  isLoading: boolean;
}

function ToolsTab({ toolUsageData, uniqueTools, toolCount, isLoading }: ToolsTabProps) {
  return (
    <div className="space-y-6">
      {/* Tool usage pie chart */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Suspense fallback={<ComponentLoadingSpinner height={350} />}>
          <ToolUsagePieChart tools={toolUsageData} isLoading={isLoading} />
        </Suspense>

        <Card>
          <CardHeader>
            <CardTitle>Tool Statistics</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="rounded-lg bg-[var(--color-background)] p-4 text-center">
                <p className="text-3xl font-bold text-white">{uniqueTools.length}</p>
                <p className="text-sm text-gray-400 mt-1">Unique Tools</p>
              </div>
              <div className="rounded-lg bg-[var(--color-background)] p-4 text-center">
                <p className="text-3xl font-bold text-white">{toolCount}</p>
                <p className="text-sm text-gray-400 mt-1">Total Invocations</p>
              </div>
            </div>

            {/* Tools list with counts */}
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {toolUsageData.map((tool, index) => (
                <div
                  key={tool.name}
                  className="flex items-center justify-between p-3 rounded-lg bg-[var(--color-background)]"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-gray-500 text-sm w-6">#{index + 1}</span>
                    <Badge variant="default">
                      <Wrench className="mr-1 h-3 w-3" />
                      {tool.name}
                    </Badge>
                  </div>
                  <span className="text-white font-medium">{tool.count} uses</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* All tools badges */}
      <Card>
        <CardHeader>
          <CardTitle>All Tools ({uniqueTools.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {uniqueTools.map((tool) => {
              const usage = toolUsageData.find((t) => t.name === tool);
              return (
                <Badge key={tool} variant="default" className="text-sm">
                  <Wrench className="mr-1 h-3 w-3" />
                  {tool}
                  {usage && (
                    <span className="ml-2 text-xs text-gray-400">({usage.count})</span>
                  )}
                </Badge>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================================
// Code Tab
// ============================================================================

interface CodeTabProps {
  codeChurnData: Array<{ turn: number; added: number; removed: number }>;
  isLoading: boolean;
}

function CodeTab({ codeChurnData, isLoading }: CodeTabProps) {
  const totalAdded = codeChurnData.reduce((sum, d) => sum + d.added, 0);
  const totalRemoved = codeChurnData.reduce((sum, d) => sum + d.removed, 0);
  const netChange = totalAdded - totalRemoved;

  return (
    <div className="space-y-6">
      {/* Code churn summary */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-4">
            <div className="rounded-lg bg-green-600/20 p-3">
              <Activity className="h-5 w-5 text-green-400" />
            </div>
            <div>
              <p className="text-sm text-gray-400">Lines Added</p>
              <p className="text-xl font-semibold text-green-400">
                +{formatCompactNumber(totalAdded)}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-4">
            <div className="rounded-lg bg-red-600/20 p-3">
              <Activity className="h-5 w-5 text-red-400" />
            </div>
            <div>
              <p className="text-sm text-gray-400">Lines Removed</p>
              <p className="text-xl font-semibold text-red-400">
                -{formatCompactNumber(totalRemoved)}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-4">
            <div className={cn(
              'rounded-lg p-3',
              netChange >= 0 ? 'bg-green-600/20' : 'bg-red-600/20'
            )}>
              <FileCode className={cn(
                'h-5 w-5',
                netChange >= 0 ? 'text-green-400' : 'text-red-400'
              )} />
            </div>
            <div>
              <p className="text-sm text-gray-400">Net Change</p>
              <p className={cn(
                'text-xl font-semibold',
                netChange >= 0 ? 'text-green-400' : 'text-red-400'
              )}>
                {netChange >= 0 ? '+' : ''}{formatCompactNumber(netChange)}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Code churn chart */}
      <Suspense fallback={<ComponentLoadingSpinner height={300} />}>
        <CodeChurnChart data={codeChurnData} isLoading={isLoading} />
      </Suspense>

      {/* Info card */}
      <Card>
        <CardContent className="py-4">
          <p className="text-sm text-gray-400">
            Code churn is estimated based on Write and Edit tool invocations.
            Actual line counts may vary based on the specific operations performed.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================================
// Subagents Tab
// ============================================================================

interface SubagentsTabProps {
  subagentData: SubagentSummary[];
  sessionCost: number;
  subagentCount: number;
  efficiency: NonNullable<ReturnType<typeof useSession>['data']>['metrics']['efficiency'];
  isLoading: boolean;
}

function SubagentsTab({ subagentData, sessionCost, subagentCount, efficiency, isLoading }: SubagentsTabProps) {
  return (
    <div className="space-y-6">
      {/* Subagent stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-4">
            <div className="rounded-lg bg-purple-600/20 p-3">
              <Bot className="h-5 w-5 text-purple-400" />
            </div>
            <div>
              <p className="text-sm text-gray-400">Total Subagents</p>
              <p className="text-xl font-semibold text-white">{subagentCount}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-4">
            <div className="rounded-lg bg-blue-600/20 p-3">
              <DollarSign className="h-5 w-5 text-blue-400" />
            </div>
            <div>
              <p className="text-sm text-gray-400">Subagent Cost</p>
              <p className="text-xl font-semibold text-white">
                {formatCurrency(subagentData.reduce((sum, a) => sum + a.total_cost, 0))}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-4">
            <div className="rounded-lg bg-green-600/20 p-3">
              <Activity className="h-5 w-5 text-green-400" />
            </div>
            <div>
              <p className="text-sm text-gray-400">Subagent Efficiency</p>
              <p className="text-xl font-semibold text-white">
                {efficiency.sei !== null
                  ? `${(efficiency.sei * 100).toFixed(1)}%`
                  : 'N/A'}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Sankey chart */}
      <Suspense fallback={<ComponentLoadingSpinner height={384} />}>
        <SubagentSankeyChart
          subagents={subagentData}
          sessionCost={sessionCost}
          isLoading={isLoading}
        />
      </Suspense>

      {/* Subagent details table */}
      {subagentData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Subagent Details</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {subagentData.map((agent) => (
                <div
                  key={agent.agent_id}
                  className="p-4 rounded-lg bg-[var(--color-background)]"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Bot className="h-4 w-4 text-purple-400" />
                      <span className="font-medium text-white">
                        {agent.slug || agent.agent_id}
                      </span>
                    </div>
                    <Badge variant="info">{agent.turn_count} turns</Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-gray-400">Cost:</span>
                      <span className="ml-2 text-white">{formatCurrency(agent.total_cost)}</span>
                    </div>
                    <div>
                      <span className="text-gray-400">Tokens:</span>
                      <span className="ml-2 text-white">{formatCompactNumber(agent.total_tokens)}</span>
                    </div>
                  </div>
                  {agent.tools_used.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1">
                      {agent.tools_used.map((tool) => (
                        <Badge key={tool} variant="default" className="text-xs">
                          {tool}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ============================================================================
// Health Tab
// ============================================================================

interface HealthTabProps {
  turns: TurnSummary[];
  onTurnClick: (turnNumber: number) => void;
  isLoading: boolean;
}

function HealthTab({ turns, onTurnClick, isLoading }: HealthTabProps) {
  // Compute health statistics
  const stats = useMemo(() => {
    if (!turns || turns.length === 0) {
      return { avgCost: 0, avgDuration: 0, expensive: [] as TurnSummary[], slow: [] as TurnSummary[] };
    }

    const totalCost = turns.reduce((sum, t) => sum + t.cost, 0);
    const totalDuration = turns.reduce((sum, t) => sum + (t.duration_ms ?? 0), 0);
    const avgCost = totalCost / turns.length;
    const avgDuration = totalDuration / turns.length;

    const expensive = turns
      .filter((t) => t.cost > avgCost * 2)
      .sort((a, b) => b.cost - a.cost)
      .slice(0, 5);

    const slow = turns
      .filter((t) => (t.duration_ms ?? 0) > avgDuration * 2)
      .sort((a, b) => (b.duration_ms ?? 0) - (a.duration_ms ?? 0))
      .slice(0, 5);

    return { avgCost, avgDuration, expensive, slow };
  }, [turns]);

  return (
    <div className="space-y-6">
      {/* Health timeline */}
      <Suspense fallback={<ComponentLoadingSpinner height={200} />}>
        <TurnHealthTimeline
          turns={turns}
          onTurnClick={onTurnClick}
          isLoading={isLoading}
        />
      </Suspense>

      {/* Problematic turns */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Expensive turns */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-yellow-400" />
              Most Expensive Turns
            </CardTitle>
            <CardDescription>Turns with cost &gt; 2x average</CardDescription>
          </CardHeader>
          <CardContent>
            {stats.expensive.length === 0 ? (
              <p className="text-center text-gray-500 py-4">No expensive turns detected</p>
            ) : (
              <div className="space-y-2">
                {stats.expensive.map((turn) => (
                  <button
                    key={turn.turn_number}
                    onClick={() => onTurnClick(turn.turn_number)}
                    className="w-full p-3 rounded-lg bg-[var(--color-background)] hover:bg-gray-800 transition-colors text-left"
                  >
                    <div className="flex justify-between items-center">
                      <span className="text-white font-medium">Turn #{turn.turn_number}</span>
                      <Badge variant="warning">{formatCurrency(turn.cost)}</Badge>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      {(turn.cost / stats.avgCost).toFixed(1)}x avg cost
                    </p>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Slow turns */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-orange-400" />
              Slowest Turns
            </CardTitle>
            <CardDescription>Turns with duration &gt; 2x average</CardDescription>
          </CardHeader>
          <CardContent>
            {stats.slow.length === 0 ? (
              <p className="text-center text-gray-500 py-4">No slow turns detected</p>
            ) : (
              <div className="space-y-2">
                {stats.slow.map((turn) => (
                  <button
                    key={turn.turn_number}
                    onClick={() => onTurnClick(turn.turn_number)}
                    className="w-full p-3 rounded-lg bg-[var(--color-background)] hover:bg-gray-800 transition-colors text-left"
                  >
                    <div className="flex justify-between items-center">
                      <span className="text-white font-medium">Turn #{turn.turn_number}</span>
                      <Badge variant="warning">
                        {formatDuration((turn.duration_ms ?? 0) / 1000)}
                      </Badge>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      {((turn.duration_ms ?? 0) / stats.avgDuration).toFixed(1)}x avg duration
                    </p>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Health recommendations */}
      <Card>
        <CardHeader>
          <CardTitle>Health Insights</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {stats.expensive.length > 0 && (
              <div className="p-4 rounded-lg bg-yellow-900/20 border border-yellow-800/30">
                <div className="flex items-start gap-3">
                  <DollarSign className="h-5 w-5 text-yellow-400 mt-0.5" />
                  <div>
                    <p className="font-medium text-yellow-400">High Cost Turns Detected</p>
                    <p className="text-sm text-gray-400 mt-1">
                      {stats.expensive.length} turn(s) have costs significantly above average.
                      Review these turns for potential optimization opportunities.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {stats.slow.length > 0 && (
              <div className="p-4 rounded-lg bg-orange-900/20 border border-orange-800/30">
                <div className="flex items-start gap-3">
                  <Clock className="h-5 w-5 text-orange-400 mt-0.5" />
                  <div>
                    <p className="font-medium text-orange-400">Slow Turns Detected</p>
                    <p className="text-sm text-gray-400 mt-1">
                      {stats.slow.length} turn(s) took significantly longer than average.
                      These may indicate complex operations or potential bottlenecks.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {stats.expensive.length === 0 && stats.slow.length === 0 && (
              <div className="p-4 rounded-lg bg-green-900/20 border border-green-800/30">
                <div className="flex items-start gap-3">
                  <Heart className="h-5 w-5 text-green-400 mt-0.5" />
                  <div>
                    <p className="font-medium text-green-400">Session Health is Good</p>
                    <p className="text-sm text-gray-400 mt-1">
                      No significant performance issues detected. All turns are within
                      acceptable cost and duration thresholds.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================================
// Loading and Error States
// ============================================================================

function LoadingState() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-8 w-64 rounded bg-gray-700" />
      <div className="h-4 w-96 rounded bg-gray-700" />
      <div className="mt-6 grid grid-cols-5 gap-4">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-24 rounded-lg bg-gray-700" />
        ))}
      </div>
      <div className="h-12 w-full rounded bg-gray-700 mt-6" />
      <div className="h-96 w-full rounded-lg bg-gray-700" />
    </div>
  );
}

function NotFoundState() {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center py-12">
        <Layers className="h-12 w-12 text-gray-600 mb-4" />
        <p className="text-lg font-medium text-gray-400">Session not found</p>
        <Link
          to="/sessions"
          className="mt-4 text-[var(--color-primary-400)] hover:text-[var(--color-primary-300)]"
        >
          Back to sessions
        </Link>
      </CardContent>
    </Card>
  );
}

export default SessionDetail;

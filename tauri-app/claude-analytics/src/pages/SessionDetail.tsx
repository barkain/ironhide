import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Header } from '../components/layout/Header';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { EfficiencyGauge } from '../components/charts/EfficiencyGauge';
import { useSession, useTurns } from '../hooks/useSessions';
import {
  formatCurrency,
  formatNumber,
  formatDateTime,
  formatDuration,
  formatCompactNumber,
} from '../lib/utils';
import {
  ArrowLeft,
  Clock,
  MessageSquare,
  DollarSign,
  Zap,
  Wrench,
  ChevronDown,
  ChevronUp,
  Bot,
} from 'lucide-react';
import type { TurnSummary } from '../types';

export function SessionDetail() {
  const { id } = useParams<{ id: string }>();
  const { data: session, isLoading: sessionLoading } = useSession(id || null);
  const { data: turns, isLoading: turnsLoading } = useTurns(id || '', 100, 0);

  if (sessionLoading) {
    return (
      <div className="flex flex-col">
        <Header title="Session Details" />
        <div className="flex-1 p-6">
          <div className="animate-pulse space-y-4">
            <div className="h-8 w-64 rounded bg-gray-700" />
            <div className="h-4 w-96 rounded bg-gray-700" />
            <div className="mt-6 grid grid-cols-4 gap-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-24 rounded-lg bg-gray-700" />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex flex-col">
        <Header title="Session Not Found" />
        <div className="flex-1 p-6">
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <p className="text-lg font-medium text-gray-400">Session not found</p>
              <Link
                to="/sessions"
                className="mt-4 text-[var(--color-primary-400)] hover:text-[var(--color-primary-300)]"
              >
                Back to sessions
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const { metrics } = session;

  return (
    <div className="flex flex-col">
      <Header
        title={session.project_name}
        subtitle={session.project_path}
      />

      <div className="flex-1 p-6 space-y-6">
        {/* Back link */}
        <Link
          to="/sessions"
          className="inline-flex items-center text-sm text-gray-400 hover:text-white"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to sessions
        </Link>

        {/* Stats row */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <Card>
            <CardContent className="flex items-center gap-4">
              <div className="rounded-lg bg-[var(--color-primary-600)]/20 p-3">
                <DollarSign className="h-5 w-5 text-[var(--color-primary-400)]" />
              </div>
              <div>
                <p className="text-sm text-gray-400">Total Cost</p>
                <p className="text-xl font-semibold text-white">
                  {formatCurrency(metrics.cost.total_cost)}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex items-center gap-4">
              <div className="rounded-lg bg-green-600/20 p-3">
                <MessageSquare className="h-5 w-5 text-green-400" />
              </div>
              <div>
                <p className="text-sm text-gray-400">Total Turns</p>
                <p className="text-xl font-semibold text-white">
                  {formatNumber(metrics.turn_count)}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex items-center gap-4">
              <div className="rounded-lg bg-purple-600/20 p-3">
                <Zap className="h-5 w-5 text-purple-400" />
              </div>
              <div>
                <p className="text-sm text-gray-400">Total Tokens</p>
                <p className="text-xl font-semibold text-white">
                  {formatCompactNumber(metrics.tokens.total)}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex items-center gap-4">
              <div className="rounded-lg bg-orange-600/20 p-3">
                <Clock className="h-5 w-5 text-orange-400" />
              </div>
              <div>
                <p className="text-sm text-gray-400">Duration</p>
                <p className="text-xl font-semibold text-white">
                  {formatDuration(metrics.duration_ms / 1000)}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex items-center gap-4">
              <div className="rounded-lg bg-blue-600/20 p-3">
                <Wrench className="h-5 w-5 text-blue-400" />
              </div>
              <div>
                <p className="text-sm text-gray-400">Tools Used</p>
                <p className="text-xl font-semibold text-white">
                  {formatNumber(metrics.tool_count)}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Efficiency and Token breakdown */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <EfficiencyGauge
            value={metrics.efficiency.oes_score}
            label="Efficiency Score"
            description={`Grade: ${metrics.efficiency.oes_grade}`}
          />

          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Token Breakdown</CardTitle>
              <CardDescription>Distribution of tokens in this session</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                <div className="rounded-lg bg-[var(--color-background)] p-4">
                  <p className="text-sm text-gray-400">Input</p>
                  <p className="mt-1 text-xl font-semibold text-white">
                    {formatCompactNumber(metrics.tokens.input)}
                  </p>
                </div>
                <div className="rounded-lg bg-[var(--color-background)] p-4">
                  <p className="text-sm text-gray-400">Output</p>
                  <p className="mt-1 text-xl font-semibold text-white">
                    {formatCompactNumber(metrics.tokens.output)}
                  </p>
                </div>
                <div className="rounded-lg bg-[var(--color-background)] p-4">
                  <p className="text-sm text-gray-400">Cache Read</p>
                  <p className="mt-1 text-xl font-semibold text-white">
                    {formatCompactNumber(metrics.tokens.cache_read)}
                  </p>
                </div>
                <div className="rounded-lg bg-[var(--color-background)] p-4">
                  <p className="text-sm text-gray-400">Cache Write (5m)</p>
                  <p className="mt-1 text-xl font-semibold text-white">
                    {formatCompactNumber(metrics.tokens.cache_write_5m)}
                  </p>
                </div>
                <div className="rounded-lg bg-[var(--color-background)] p-4">
                  <p className="text-sm text-gray-400">Cache Write (1h)</p>
                  <p className="mt-1 text-xl font-semibold text-white">
                    {formatCompactNumber(metrics.tokens.cache_write_1h)}
                  </p>
                </div>
                <div className="rounded-lg bg-[var(--color-background)] p-4">
                  <p className="text-sm text-gray-400">Context Used</p>
                  <p className="mt-1 text-xl font-semibold text-white">
                    {metrics.tokens.context_used_pct.toFixed(1)}%
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Cost breakdown and Session info */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Cost Breakdown</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Input Cost</span>
                  <span className="text-white">{formatCurrency(metrics.cost.input_cost)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Output Cost</span>
                  <span className="text-white">{formatCurrency(metrics.cost.output_cost)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Cache Read Cost</span>
                  <span className="text-white">{formatCurrency(metrics.cost.cache_read_cost)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Cache Write Cost</span>
                  <span className="text-white">{formatCurrency(metrics.cost.cache_write_cost)}</span>
                </div>
                <div className="border-t border-gray-700 pt-3 flex justify-between items-center">
                  <span className="text-white font-medium">Total</span>
                  <span className="text-white font-semibold">{formatCurrency(metrics.cost.total_cost)}</span>
                </div>
                <div className="text-xs text-gray-500">
                  Avg: {formatCurrency(metrics.cost.avg_cost_per_turn)} per turn
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Session Info</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="space-y-3">
                <div className="flex justify-between">
                  <dt className="text-gray-400">Session ID</dt>
                  <dd className="font-mono text-sm text-white truncate max-w-[200px]">{session.id}</dd>
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
        </div>

        {/* Efficiency metrics */}
        <Card>
          <CardHeader>
            <CardTitle>Efficiency Metrics</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
              <div className="rounded-lg bg-[var(--color-background)] p-4">
                <p className="text-xs text-gray-400">Cache Efficiency</p>
                <p className="mt-1 text-lg font-semibold text-white">
                  {(metrics.efficiency.cer * 100).toFixed(1)}%
                </p>
              </div>
              <div className="rounded-lg bg-[var(--color-background)] p-4">
                <p className="text-xs text-gray-400">Context Growth</p>
                <p className="mt-1 text-lg font-semibold text-white">
                  {metrics.efficiency.cgr.toFixed(2)}x
                </p>
              </div>
              <div className="rounded-lg bg-[var(--color-background)] p-4">
                <p className="text-xs text-gray-400">Workflow Friction</p>
                <p className="mt-1 text-lg font-semibold text-white">
                  {metrics.efficiency.wfs.toFixed(2)}
                </p>
              </div>
              <div className="rounded-lg bg-[var(--color-background)] p-4">
                <p className="text-xs text-gray-400">Cost/Deliverable</p>
                <p className="mt-1 text-lg font-semibold text-white">
                  {formatCurrency(metrics.efficiency.cpdu)}
                </p>
              </div>
              <div className="rounded-lg bg-[var(--color-background)] p-4">
                <p className="text-xs text-gray-400">Cycles/Deliverable</p>
                <p className="mt-1 text-lg font-semibold text-white">
                  {metrics.efficiency.cpd.toFixed(1)}
                </p>
              </div>
              {metrics.efficiency.sei !== null && (
                <div className="rounded-lg bg-[var(--color-background)] p-4">
                  <p className="text-xs text-gray-400">Subagent Efficiency</p>
                  <p className="mt-1 text-lg font-semibold text-white">
                    {(metrics.efficiency.sei * 100).toFixed(1)}%
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Tools used */}
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

        {/* Turns list */}
        <Card>
          <CardHeader>
            <CardTitle>Turns ({turns?.length || 0})</CardTitle>
          </CardHeader>
          <CardContent>
            {turnsLoading ? (
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="h-20 animate-pulse rounded-lg bg-gray-700" />
                ))}
              </div>
            ) : turns && turns.length > 0 ? (
              <div className="space-y-3">
                {turns.map((turn) => (
                  <TurnCard key={turn.turn_number} turn={turn} />
                ))}
              </div>
            ) : (
              <p className="text-center text-gray-500 py-8">No turns recorded</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function TurnCard({ turn }: { turn: TurnSummary }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className="rounded-lg bg-[var(--color-background)] p-4 cursor-pointer"
      onClick={() => setExpanded(!expanded)}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-white">
              Turn {turn.turn_number}
            </span>
            {turn.model && (
              <Badge variant="info" className="text-xs">
                {turn.model.split('-').slice(-1)[0]}
              </Badge>
            )}
            {turn.is_subagent && (
              <Badge variant="warning" className="text-xs">
                <Bot className="mr-1 h-3 w-3" />
                Subagent
              </Badge>
            )}
            {turn.tool_count > 0 && (
              <Badge variant="default" className="text-xs">
                <Wrench className="mr-1 h-3 w-3" />
                {turn.tool_count} tool{turn.tool_count !== 1 ? 's' : ''}
              </Badge>
            )}
            {turn.stop_reason && turn.stop_reason !== 'end_turn' && (
              <Badge variant="error" className="text-xs">
                {turn.stop_reason}
              </Badge>
            )}
          </div>
          <p className="mt-1 text-xs text-gray-500">
            {formatDateTime(turn.started_at)}
            {turn.duration_ms && ` - ${formatDuration(turn.duration_ms / 1000)}`}
          </p>
        </div>

        <div className="flex items-center gap-6 text-sm">
          <div className="text-right">
            <p className="text-xs text-gray-500">Input</p>
            <p className="text-gray-300">{formatCompactNumber(turn.tokens.input)}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-500">Output</p>
            <p className="text-gray-300">{formatCompactNumber(turn.tokens.output)}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-500">Cache</p>
            <p className="text-gray-300">
              {formatCompactNumber(turn.tokens.cache_read)} / {formatCompactNumber(turn.tokens.cache_write)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-500">Cost</p>
            <p className="font-medium text-white">{formatCurrency(turn.cost)}</p>
          </div>
          <button className="p-1 hover:bg-gray-700 rounded">
            {expanded ? (
              <ChevronUp className="h-4 w-4 text-gray-400" />
            ) : (
              <ChevronDown className="h-4 w-4 text-gray-400" />
            )}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="mt-4 space-y-4 border-t border-gray-700 pt-4">
          {/* Tools used in this turn */}
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

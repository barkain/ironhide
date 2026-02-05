import { useParams, Link } from 'react-router-dom';
import { Header } from '../components/layout/Header';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { useSession } from '../hooks/useSessions';
import {
  formatCurrency,
  formatNumber,
  formatDateTime,
  formatDuration,
  formatTokens,
  getProjectName,
} from '../lib/utils';
import {
  ArrowLeft,
  Clock,
  MessageSquare,
  DollarSign,
  Zap,
  Wrench,
} from 'lucide-react';

export function SessionDetail() {
  const { id } = useParams<{ id: string }>();
  const { data: session, isLoading } = useSession(id || null);

  if (isLoading) {
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

  return (
    <div className="flex flex-col">
      <Header
        title={getProjectName(session.project_path)}
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
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardContent className="flex items-center gap-4">
              <div className="rounded-lg bg-[var(--color-primary-600)]/20 p-3">
                <DollarSign className="h-5 w-5 text-[var(--color-primary-400)]" />
              </div>
              <div>
                <p className="text-sm text-gray-400">Total Cost</p>
                <p className="text-xl font-semibold text-white">
                  {formatCurrency(session.total_cost)}
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
                  {formatNumber(session.total_turns)}
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
                  {formatTokens(session.total_input_tokens + session.total_output_tokens)}
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
                  {formatDuration(session.duration_seconds)}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Session info */}
        <Card>
          <CardHeader>
            <CardTitle>Session Info</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-4">
              <div>
                <dt className="text-sm text-gray-400">Session ID</dt>
                <dd className="mt-1 font-mono text-sm text-white">{session.id}</dd>
              </div>
              <div>
                <dt className="text-sm text-gray-400">Model</dt>
                <dd className="mt-1">
                  <Badge variant="info">{session.model}</Badge>
                </dd>
              </div>
              <div>
                <dt className="text-sm text-gray-400">Started At</dt>
                <dd className="mt-1 text-sm text-white">{formatDateTime(session.started_at)}</dd>
              </div>
              <div>
                <dt className="text-sm text-gray-400">Input / Output Tokens</dt>
                <dd className="mt-1 text-sm text-white">
                  {formatTokens(session.total_input_tokens)} / {formatTokens(session.total_output_tokens)}
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        {/* Turns list */}
        <Card>
          <CardHeader>
            <CardTitle>Turns ({session.turns?.length || 0})</CardTitle>
          </CardHeader>
          <CardContent>
            {session.turns && session.turns.length > 0 ? (
              <div className="space-y-3">
                {session.turns.map((turn) => (
                  <div
                    key={turn.id}
                    className="flex items-start justify-between rounded-lg bg-[var(--color-background)] p-4"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-medium text-white">
                          Turn {turn.turn_number}
                        </span>
                        {turn.tool_name && (
                          <Badge variant="default">
                            <Wrench className="mr-1 h-3 w-3" />
                            {turn.tool_name}
                          </Badge>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-gray-500">
                        {formatDateTime(turn.timestamp)}
                      </p>
                    </div>

                    <div className="flex items-center gap-6 text-sm">
                      <div className="text-right">
                        <p className="text-xs text-gray-500">Input</p>
                        <p className="text-gray-300">{formatTokens(turn.input_tokens)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-gray-500">Output</p>
                        <p className="text-gray-300">{formatTokens(turn.output_tokens)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-gray-500">Cache</p>
                        <p className="text-gray-300">
                          {formatTokens(turn.cache_read_tokens)} / {formatTokens(turn.cache_write_tokens)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-gray-500">Cost</p>
                        <p className="font-medium text-white">{formatCurrency(turn.cost)}</p>
                      </div>
                    </div>
                  </div>
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

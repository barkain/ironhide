import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Header } from '../components/layout/Header';
import { Card, CardContent } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { useSessions, useSessionUpdates } from '../hooks/useSessions';
import {
  formatCurrency,
  formatNumber,
  formatRelativeTime,
  formatDuration,
  formatCompactNumber,
} from '../lib/utils';
import {
  ChevronRight,
  Clock,
  MessageSquare,
  DollarSign,
  Search,
  SortAsc,
  SortDesc,
  Zap,
} from 'lucide-react';
import type { SessionSummary } from '../types';

type SortField = 'date' | 'cost' | 'tokens' | 'turns';
type SortDirection = 'asc' | 'desc';

export function Sessions() {
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  // Subscribe to real-time updates
  useSessionUpdates();

  const { data: sessions, isLoading } = useSessions(100, 0);

  // Filter and sort sessions
  const filteredSessions = useMemo(() => {
    if (!sessions) return [];

    // Filter by search query
    let filtered = sessions.filter((session) =>
      session.project_path.toLowerCase().includes(searchQuery.toLowerCase()) ||
      session.project_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (session.model && session.model.toLowerCase().includes(searchQuery.toLowerCase()))
    );

    // Sort
    filtered.sort((a, b) => {
      let comparison = 0;

      switch (sortField) {
        case 'date':
          comparison = a.started_at.localeCompare(b.started_at);
          break;
        case 'cost':
          comparison = a.total_cost - b.total_cost;
          break;
        case 'tokens':
          comparison = a.total_tokens - b.total_tokens;
          break;
        case 'turns':
          comparison = a.total_turns - b.total_turns;
          break;
      }

      return sortDirection === 'asc' ? comparison : -comparison;
    });

    return filtered;
  }, [sessions, searchQuery, sortField, sortDirection]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const SortButton = ({ field, label }: { field: SortField; label: string }) => (
    <button
      onClick={() => handleSort(field)}
      className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-sm transition-colors ${
        sortField === field
          ? 'bg-[var(--color-primary-600)]/20 text-[var(--color-primary-400)]'
          : 'text-gray-400 hover:text-white hover:bg-gray-800'
      }`}
    >
      {label}
      {sortField === field && (
        sortDirection === 'asc' ? <SortAsc className="h-3 w-3" /> : <SortDesc className="h-3 w-3" />
      )}
    </button>
  );

  return (
    <div className="flex flex-col">
      <Header
        title="Sessions"
        subtitle="Browse and analyze your Claude Code sessions"
      />

      <div className="flex-1 p-6">
        {/* Search and Sort bar */}
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search sessions by project or model..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] py-2 pl-10 pr-4 text-sm text-white placeholder-gray-500 focus:border-[var(--color-primary-500)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary-500)]"
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-400">Sort by:</span>
            <SortButton field="date" label="Date" />
            <SortButton field="cost" label="Cost" />
            <SortButton field="tokens" label="Tokens" />
            <SortButton field="turns" label="Turns" />
          </div>
        </div>

        {/* Session count */}
        {!isLoading && filteredSessions.length > 0 && (
          <p className="mb-4 text-sm text-gray-500">
            Showing {filteredSessions.length} session{filteredSessions.length !== 1 ? 's' : ''}
            {searchQuery && ` matching "${searchQuery}"`}
          </p>
        )}

        {/* Sessions list */}
        {isLoading ? (
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <Card key={i}>
                <CardContent className="animate-pulse">
                  <div className="h-6 w-48 rounded bg-gray-700" />
                  <div className="mt-2 h-4 w-32 rounded bg-gray-700" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : filteredSessions.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <MessageSquare className="h-12 w-12 text-gray-600" />
              <p className="mt-4 text-lg font-medium text-gray-400">No sessions found</p>
              <p className="mt-1 text-sm text-gray-500">
                {searchQuery ? 'Try a different search term' : 'Sessions will appear here once you use Claude Code'}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {filteredSessions.map((session) => (
              <SessionCard key={session.id} session={session} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SessionCard({ session }: { session: SessionSummary }) {
  return (
    <Link to={`/sessions/${session.id}`}>
      <Card className="transition-colors hover:bg-gray-800/50">
        <CardContent className="flex items-center justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3">
              <h3 className="font-medium text-white truncate">
                {session.project_name}
              </h3>
              {session.model && (
                <Badge variant="info">{session.model}</Badge>
              )}
              {session.is_subagent && (
                <Badge variant="warning">Subagent</Badge>
              )}
            </div>
            <p className="mt-1 text-sm text-gray-500 truncate max-w-md">
              {session.project_path}
            </p>
          </div>

          <div className="flex items-center gap-6 text-sm ml-4">
            <div className="flex items-center gap-2 text-gray-400">
              <MessageSquare className="h-4 w-4" />
              <span>{formatNumber(session.total_turns)} turns</span>
            </div>
            <div className="flex items-center gap-2 text-gray-400">
              <Zap className="h-4 w-4" />
              <span>{formatCompactNumber(session.total_tokens)}</span>
            </div>
            <div className="flex items-center gap-2 text-gray-400">
              <DollarSign className="h-4 w-4" />
              <span>{formatCurrency(session.total_cost)}</span>
            </div>
            <div className="flex items-center gap-2 text-gray-400">
              <Clock className="h-4 w-4" />
              <span>{formatDuration(session.duration_ms / 1000)}</span>
            </div>
            <div className="text-gray-500 min-w-[80px] text-right">
              {formatRelativeTime(session.started_at)}
            </div>
            <ChevronRight className="h-5 w-5 text-gray-600" />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

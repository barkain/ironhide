import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Header } from '../components/layout/Header';
import { Card, CardContent } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { useSessions } from '../hooks/useSessions';
import {
  formatCurrency,
  formatNumber,
  formatRelativeTime,
  formatDuration,
  getProjectName,
} from '../lib/utils';
import {
  ChevronRight,
  Clock,
  MessageSquare,
  DollarSign,
  Search,
} from 'lucide-react';

export function Sessions() {
  const [searchQuery, setSearchQuery] = useState('');
  const { data: sessions, isLoading } = useSessions(100, 0);

  const filteredSessions = sessions?.filter((session) =>
    session.project_path.toLowerCase().includes(searchQuery.toLowerCase()) ||
    session.model.toLowerCase().includes(searchQuery.toLowerCase())
  ) || [];

  return (
    <div className="flex flex-col">
      <Header
        title="Sessions"
        subtitle="Browse and analyze your Claude Code sessions"
      />

      <div className="flex-1 p-6">
        {/* Search bar */}
        <div className="mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search sessions by project or model..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] py-2 pl-10 pr-4 text-sm text-white placeholder-gray-500 focus:border-[var(--color-primary-500)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary-500)]"
            />
          </div>
        </div>

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
              <Link key={session.id} to={`/sessions/${session.id}`}>
                <Card className="transition-colors hover:bg-gray-800/50">
                  <CardContent className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <h3 className="font-medium text-white">
                          {getProjectName(session.project_path)}
                        </h3>
                        <Badge variant="info">{session.model}</Badge>
                      </div>
                      <p className="mt-1 text-sm text-gray-500 truncate max-w-md">
                        {session.project_path}
                      </p>
                    </div>

                    <div className="flex items-center gap-8 text-sm">
                      <div className="flex items-center gap-2 text-gray-400">
                        <MessageSquare className="h-4 w-4" />
                        <span>{formatNumber(session.total_turns)} turns</span>
                      </div>
                      <div className="flex items-center gap-2 text-gray-400">
                        <DollarSign className="h-4 w-4" />
                        <span>{formatCurrency(session.total_cost)}</span>
                      </div>
                      <div className="flex items-center gap-2 text-gray-400">
                        <Clock className="h-4 w-4" />
                        <span>{formatDuration(session.duration_seconds)}</span>
                      </div>
                      <div className="text-gray-500">
                        {formatRelativeTime(session.started_at)}
                      </div>
                      <ChevronRight className="h-5 w-5 text-gray-600" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

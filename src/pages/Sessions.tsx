import { useState, useMemo } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Header } from '../components/layout/Header';
import { Card, CardContent } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { ExportButton } from '../components/export';
import { useSessionsByProject, useSessionUpdates } from '../hooks/useSessions';
import { useProjectMetrics } from '../hooks/useMetrics';
import { useAppStore } from '../lib/store';
import {
  formatCurrency,
  formatNumber,
  formatRelativeTime,
  formatDuration,
  formatCompactNumber,
  getProjectDisplayName,
  cn,
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
  GitCompare,
  Check,
  X,
  ArrowLeft,
  FolderOpen,
} from 'lucide-react';
import type { SessionSummary } from '../types';

type SortField = 'date' | 'cost' | 'tokens' | 'turns';
type SortDirection = 'asc' | 'desc';

function Sessions() {
  const { projectPath: encodedProjectPath } = useParams<{ projectPath: string }>();
  const projectPath = encodedProjectPath ? decodeURIComponent(encodedProjectPath) : null;

  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const navigate = useNavigate();

  // Subscribe to real-time updates
  useSessionUpdates();

  const { data: sessions, isLoading } = useSessionsByProject(projectPath);
  const { data: projectMetrics } = useProjectMetrics();
  const { selectedForComparison, toggleSessionComparison, clearComparison } = useAppStore();

  const canCompare = selectedForComparison.length >= 2;
  const maxSelected = selectedForComparison.length >= 3;

  // Find the current project's metrics
  const currentProject = useMemo(() => {
    if (!projectMetrics || !projectPath) return null;
    return projectMetrics.find((p) => p.project_path === projectPath) ?? null;
  }, [projectMetrics, projectPath]);

  // Derive disambiguated project name from path or metrics
  const projectName = projectPath
    ? getProjectDisplayName(projectPath)
    : currentProject?.project_name ?? 'Unknown';

  // Filter and sort sessions
  const filteredSessions = useMemo(() => {
    if (!sessions) return [];

    // Filter by search query
    let filtered = sessions.filter(
      (session) =>
        session.project_path.toLowerCase().includes(searchQuery.toLowerCase()) ||
        session.project_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (session.model && session.model.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (session.summary && session.summary.toLowerCase().includes(searchQuery.toLowerCase()))
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
      {sortField === field &&
        (sortDirection === 'asc' ? (
          <SortAsc className="h-3 w-3" />
        ) : (
          <SortDesc className="h-3 w-3" />
        ))}
    </button>
  );

  return (
    <div className="flex flex-col">
      <Header title={projectName} subtitle={projectPath ?? 'Project sessions'} />

      <div className="flex-1 p-6">
        {/* Back to projects + project header */}
        <div className="mb-6">
          <Link
            to="/sessions"
            className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-white transition-colors mb-4"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Projects
          </Link>

          {/* Project aggregate metrics */}
          {currentProject && (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 mb-6">
              <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
                <div className="flex items-center gap-2 text-gray-400 mb-1">
                  <FolderOpen className="h-4 w-4" />
                  <span className="text-sm">Sessions</span>
                </div>
                <p className="text-xl font-semibold text-white">
                  {formatNumber(currentProject.session_count)}
                </p>
              </div>
              <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
                <div className="flex items-center gap-2 text-gray-400 mb-1">
                  <DollarSign className="h-4 w-4" />
                  <span className="text-sm">Total Cost</span>
                </div>
                <p className="text-xl font-semibold text-white">
                  {formatCurrency(currentProject.total_cost)}
                </p>
              </div>
              <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
                <div className="flex items-center gap-2 text-gray-400 mb-1">
                  <Zap className="h-4 w-4" />
                  <span className="text-sm">Total Tokens</span>
                </div>
                <p className="text-xl font-semibold text-white">
                  {formatCompactNumber(currentProject.total_tokens)}
                </p>
              </div>
              <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
                <div className="flex items-center gap-2 text-gray-400 mb-1">
                  <MessageSquare className="h-4 w-4" />
                  <span className="text-sm">Total Turns</span>
                </div>
                <p className="text-xl font-semibold text-white">
                  {formatNumber(currentProject.total_turns)}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Comparison selection banner */}
        {selectedForComparison.length > 0 && (
          <div className="mb-4 flex items-center justify-between rounded-lg border border-[var(--color-primary-500)]/30 bg-[var(--color-primary-600)]/10 px-4 py-3">
            <div className="flex items-center gap-3">
              <GitCompare className="h-5 w-5 text-[var(--color-primary-400)]" />
              <span className="text-sm text-white">
                <span className="font-semibold">{selectedForComparison.length}</span>
                {' session'}
                {selectedForComparison.length !== 1 ? 's' : ''} selected for comparison
                {maxSelected && <span className="ml-2 text-amber-400">(max 3)</span>}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={clearComparison}>
                <X className="h-4 w-4 mr-1" />
                Clear
              </Button>
              <Button
                variant="primary"
                size="sm"
                disabled={!canCompare}
                onClick={() => navigate(`/compare/${selectedForComparison.join(',')}`)}
              >
                <GitCompare className="h-4 w-4 mr-1" />
                Compare Selected
              </Button>
            </div>
          </div>
        )}

        {/* Search and Sort bar */}
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search sessions by model..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] py-2 pl-10 pr-4 text-sm text-white placeholder-gray-500 focus:border-[var(--color-primary-500)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary-500)]"
            />
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-400">Sort by:</span>
              <SortButton field="date" label="Date" />
              <SortButton field="cost" label="Cost" />
              <SortButton field="tokens" label="Tokens" />
              <SortButton field="turns" label="Turns" />
            </div>
            <ExportButton
              sessionIds={
                selectedForComparison.length > 0 ? selectedForComparison : undefined
              }
              mode="sessions"
            />
          </div>
        </div>

        {/* Session count */}
        {!isLoading && filteredSessions.length > 0 && (
          <p className="mb-4 text-sm text-gray-500">
            Showing {filteredSessions.length} session
            {filteredSessions.length !== 1 ? 's' : ''}
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
                {searchQuery
                  ? 'Try a different search term'
                  : 'Sessions will appear here once you use Claude Code in this project'}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {filteredSessions.map((session) => (
              <SessionCard
                key={session.id}
                session={session}
                isSelected={selectedForComparison.includes(session.id)}
                onToggleSelect={() => toggleSessionComparison(session.id)}
                canSelect={!maxSelected}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface SessionCardProps {
  session: SessionSummary;
  isSelected: boolean;
  onToggleSelect: () => void;
  canSelect: boolean;
}

function SessionCard({ session, isSelected, onToggleSelect, canSelect }: SessionCardProps) {
  const handleCheckboxClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (canSelect || isSelected) {
      onToggleSelect();
    }
  };

  return (
    <div className="relative group">
      <Link to={`/sessions/${session.id}`}>
        <Card
          className={cn(
            'transition-colors hover:bg-gray-800/50',
            isSelected &&
              'ring-2 ring-[var(--color-primary-500)] bg-[var(--color-primary-600)]/5'
          )}
        >
          <CardContent className="flex items-center justify-between">
            {/* Comparison checkbox */}
            <button
              onClick={handleCheckboxClick}
              className={cn(
                'flex h-5 w-5 shrink-0 items-center justify-center rounded border mr-4 transition-all',
                isSelected
                  ? 'border-[var(--color-primary-500)] bg-[var(--color-primary-500)] text-white'
                  : canSelect
                    ? 'border-gray-600 hover:border-[var(--color-primary-400)] hover:bg-gray-800'
                    : 'border-gray-700 text-gray-700 cursor-not-allowed opacity-50'
              )}
              title={
                isSelected
                  ? 'Remove from comparison'
                  : canSelect
                    ? 'Add to comparison'
                    : 'Maximum 3 sessions for comparison'
              }
            >
              {isSelected && <Check className="h-3 w-3" />}
            </button>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3">
                <h3 className="font-medium text-white truncate" title={session.project_path}>
                  {getProjectDisplayName(session.project_path)}
                </h3>
                {session.model && <Badge variant="info">{session.model}</Badge>}
                {session.is_subagent && <Badge variant="warning">Subagent</Badge>}
              </div>
              <p className="mt-1 text-sm text-gray-500 truncate max-w-md">
                {session.project_path}
              </p>
              {session.summary && (
                <p className="mt-1 text-sm text-[var(--color-text-tertiary)] truncate">
                  {session.summary}
                </p>
              )}
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
    </div>
  );
}

export default Sessions;

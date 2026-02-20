import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Header } from '../components/layout/Header';
import { Card, CardContent } from '../components/ui/Card';
import { useProjectMetrics } from '../hooks/useMetrics';
import { useSessionUpdates } from '../hooks/useSessions';
import {
  formatCurrency,
  formatNumber,
  formatCompactNumber,
  formatRelativeTime,
  getProjectDisplayName,
} from '../lib/utils';
import {
  Search,
  SortAsc,
  SortDesc,
  FolderOpen,
  DollarSign,
  MessageSquare,
  Zap,
  Clock,
  ChevronRight,
} from 'lucide-react';
import type { ProjectMetrics } from '../types';

type SortField = 'cost' | 'sessions' | 'activity';
type SortDirection = 'asc' | 'desc';

/**
 * Generate a consistent HSL color from a project name string.
 * Uses a simple hash to map the name to a hue value.
 */
function getProjectColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 65%, 55%)`;
}

function Projects() {
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<SortField>('cost');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  // Subscribe to real-time updates
  useSessionUpdates();

  const { data: projects, isLoading } = useProjectMetrics();

  // Filter and sort projects
  const filteredProjects = useMemo(() => {
    if (!projects) return [];

    let filtered = projects
      // Safety net: exclude non-user projects (temp/artifact paths)
      .filter(
        (project) =>
          project.project_path.includes('/Users/') || project.project_path.includes('-Users-')
      )
      .filter(
        (project) =>
          project.project_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          project.project_path.toLowerCase().includes(searchQuery.toLowerCase())
      );

    filtered.sort((a, b) => {
      let comparison = 0;

      switch (sortField) {
        case 'cost':
          comparison = a.total_cost - b.total_cost;
          break;
        case 'sessions':
          comparison = a.session_count - b.session_count;
          break;
        case 'activity':
          comparison = a.last_activity.localeCompare(b.last_activity);
          break;
      }

      return sortDirection === 'asc' ? comparison : -comparison;
    });

    return filtered;
  }, [projects, searchQuery, sortField, sortDirection]);

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
      <Header
        title="Projects"
        subtitle="Browse your Claude Code projects and their usage"
      />

      <div className="flex-1 p-6">
        {/* Search and Sort bar */}
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search projects by name or path..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] py-2 pl-10 pr-4 text-sm text-white placeholder-gray-500 focus:border-[var(--color-primary-500)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary-500)]"
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-400">Sort by:</span>
            <SortButton field="cost" label="Cost" />
            <SortButton field="sessions" label="Sessions" />
            <SortButton field="activity" label="Last Activity" />
          </div>
        </div>

        {/* Project count */}
        {!isLoading && filteredProjects.length > 0 && (
          <p className="mb-4 text-sm text-gray-500">
            {filteredProjects.length} project{filteredProjects.length !== 1 ? 's' : ''}
            {searchQuery && ` matching "${searchQuery}"`}
          </p>
        )}

        {/* Projects grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {[...Array(6)].map((_, i) => (
              <Card key={i}>
                <CardContent className="animate-pulse">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-gray-700" />
                    <div>
                      <div className="h-5 w-32 rounded bg-gray-700" />
                      <div className="mt-1 h-3 w-48 rounded bg-gray-700" />
                    </div>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <div className="h-4 w-20 rounded bg-gray-700" />
                    <div className="h-4 w-20 rounded bg-gray-700" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : filteredProjects.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <FolderOpen className="h-12 w-12 text-gray-600" />
              <p className="mt-4 text-lg font-medium text-gray-400">No projects found</p>
              <p className="mt-1 text-sm text-gray-500">
                {searchQuery
                  ? 'Try a different search term'
                  : 'Projects will appear here once you use Claude Code'}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filteredProjects.map((project) => (
              <ProjectCard key={project.project_path} project={project} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface ProjectCardProps {
  project: ProjectMetrics;
}

function ProjectCard({ project }: ProjectCardProps) {
  const displayName = getProjectDisplayName(project.project_path);
  const color = getProjectColor(displayName);

  return (
    <Link to={`/sessions/project/${encodeURIComponent(project.project_path)}`}>
      <Card className="transition-colors hover:bg-gray-800/50 h-full">
        <CardContent>
          {/* Project header */}
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <div
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
                style={{ backgroundColor: `${color}20`, color }}
              >
                <FolderOpen className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <h3 className="font-medium text-white truncate" title={project.project_path}>{displayName}</h3>
                <p className="text-xs text-gray-500 truncate">{project.project_path}</p>
              </div>
            </div>
            <ChevronRight className="h-5 w-5 shrink-0 text-gray-600 mt-1" />
          </div>

          {/* Metrics grid */}
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <MessageSquare className="h-3.5 w-3.5" />
              <span>
                {formatNumber(project.session_count)} session
                {project.session_count !== 1 ? 's' : ''}
              </span>
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <DollarSign className="h-3.5 w-3.5" />
              <span>{formatCurrency(project.total_cost)}</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <Zap className="h-3.5 w-3.5" />
              <span>{formatCompactNumber(project.total_tokens)} tokens</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <Clock className="h-3.5 w-3.5" />
              <span>{formatRelativeTime(project.last_activity)}</span>
            </div>
          </div>

          {/* Cost per session indicator */}
          <div className="mt-3 pt-3 border-t border-[var(--color-border)]">
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-500">Avg cost/session</span>
              <span className="text-gray-400 font-medium">
                {formatCurrency(project.avg_cost_per_session)}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

export default Projects;

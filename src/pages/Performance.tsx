import { useState, useEffect } from 'react';
import { Header } from '../components/layout/Header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/Card';
import { DeveloperRadarChart } from '../components/charts/DeveloperRadarChart';
import { useDeveloperMetrics } from '../hooks/useMetrics';
import { getSettings, detectGitHubConfig, type AppSettings, type GitHubConfig } from '../lib/tauri';
import {
  Zap,
  Target,
  TrendingUp,
  TrendingDown,
  GitPullRequest,
  GitBranch,
  DollarSign,
  AlertCircle,
  Settings,
} from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';

const ARCHETYPE_STYLES: Record<string, { color: string; bg: string; description: string; coaching: string }> = {
  'AI-Native Power User': {
    color: 'text-green-400',
    bg: 'bg-green-500/20',
    description: 'Consistently strong across all three dimensions',
    coaching: 'Role model — pair program with others, document prompting workflows, mentor',
  },
  'Volume Spammer': {
    color: 'text-orange-400',
    bg: 'bg-orange-500/20',
    description: 'Ships many PRs but spends heavily and works sequentially',
    coaching: 'Coach on PR sizing, ticket coverage, and prompting efficiency',
  },
  'Deep Single-Threader': {
    color: 'text-blue-400',
    bg: 'bg-blue-500/20',
    description: 'Efficient with AI spend but operates one thread at a time',
    coaching: 'Introduce parallel branch workflow. Show how Claude Code handles context switching',
  },
  'Expensive Explorer': {
    color: 'text-red-400',
    bg: 'bg-red-500/20',
    description: 'Opens many concurrent branches but few merge',
    coaching: 'Focus on closing loops. Define a WIP limit. Triage open branches weekly',
  },
  'Early Adopter': {
    color: 'text-gray-400',
    bg: 'bg-gray-500/20',
    description: 'Just beginning to integrate AI into the workflow',
    coaching: '1:1 on daily usage habits, prompting basics, and a first parallel branch exercise',
  },
};

const METRICS_LIST = [
  {
    key: 'throughput_velocity_score' as const,
    rawKey: 'throughput_velocity' as const,
    label: 'Throughput Velocity',
    unit: 'PRs/sprint',
    icon: GitPullRequest,
    tooltip: 'PRs merged per sprint. If AI tooling is helping, you ship more in the same time window.',
  },
  {
    key: 'parallelism_ratio_score' as const,
    rawKey: 'parallelism_ratio' as const,
    label: 'Parallelism Ratio',
    unit: 'ratio',
    icon: GitBranch,
    tooltip: 'Concurrent commit-days per sprint. Growing parallelism = genuine workflow change from AI.',
  },
  {
    key: 'ai_roi_score' as const,
    rawKey: 'ai_roi' as const,
    label: 'AI ROI',
    unit: 'PRs/$100',
    icon: DollarSign,
    tooltip: 'PRs merged per $100 of Claude Code spend. Connects cost directly to delivery output.',
  },
];

function MetricRow({ label, value, rawValue, unit, baseline, tooltip, icon: Icon }: {
  label: string;
  value: number;
  rawValue: number;
  unit: string;
  baseline: number | null;
  tooltip: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  const delta = baseline !== null ? value - baseline : null;
  const pct = (value / 10) * 100;
  const dotColor = value >= 8 ? 'bg-green-400' : value >= 5 ? 'bg-blue-400' : value >= 3 ? 'bg-yellow-400' : 'bg-red-400';

  return (
    <div className="group relative p-3 rounded-lg hover:bg-[var(--color-surface-hover)] transition-colors">
      <div className="flex items-center gap-3 mb-2">
        <Icon className={`h-4 w-4 ${value >= 5 ? 'text-blue-400' : 'text-gray-500'}`} />
        <span className="text-sm font-medium text-[var(--color-text-primary)]">{label}</span>
        <span className="ml-auto text-xs text-[var(--color-text-muted)]">
          {rawValue.toFixed(unit === 'ratio' ? 2 : 1)} {unit}
        </span>
      </div>
      <div className="flex items-center gap-3">
        <div className={`h-2.5 w-2.5 rounded-full ${dotColor} shrink-0`} />
        <div className="flex-1 h-1.5 rounded-full bg-[var(--color-background)] overflow-hidden">
          <div
            className={`h-full rounded-full ${dotColor} transition-all duration-700`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="text-sm font-semibold text-[var(--color-text-primary)] w-10 text-right tabular-nums">
          {value.toFixed(1)}
        </span>
        {delta !== null && (
          <span className={`text-xs w-12 text-right ${delta >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {delta >= 0 ? '+' : ''}{delta.toFixed(1)}
          </span>
        )}
      </div>
      {/* Hover tooltip */}
      <div className="absolute bottom-full left-8 mb-2 w-64 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] p-3 text-xs text-fuchsia-300 leading-relaxed shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 pointer-events-none">
        {tooltip}
      </div>
    </div>
  );
}

function Performance() {
  const location = useLocation();
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [detectedConfig, setDetectedConfig] = useState<GitHubConfig | null>(null);

  // Re-read settings from localStorage every time this page is navigated to,
  // so changes made in Settings (e.g. sprintDays) are picked up immediately.
  useEffect(() => {
    getSettings().then(setSettings);
  }, [location.key]);

  useEffect(() => {
    detectGitHubConfig().then(setDetectedConfig).catch(console.error);
  }, []);

  const effectiveUsername = settings?.githubUsername || detectedConfig?.username || '';
  const hasConfig = Boolean(effectiveUsername);

  const { data: metrics, isLoading, error } = useDeveloperMetrics({
    githubUsername: effectiveUsername,
    sprintDays: settings?.sprintDays,
    numSprints: settings?.numSprints,
  });

  if (!settings) {
    return (
      <div className="flex flex-col">
        <Header title="AI Adoption Metrics" />
        <div className="flex-1 p-6 flex items-center justify-center">
          <div className="animate-pulse text-gray-500">Loading settings...</div>
        </div>
      </div>
    );
  }

  if (!hasConfig) {
    return (
      <div className="flex flex-col">
        <Header
          title="AI Adoption Metrics"
          subtitle="Three developer-level signals for engineering teams"
        />
        <div className="flex-1 p-6">
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16 gap-4">
              <AlertCircle className="h-12 w-12 text-yellow-400" />
              <h3 className="text-lg font-semibold text-[var(--color-text-primary)]">
                GitHub Integration Required
              </h3>
              <p className="text-sm text-[var(--color-text-secondary)] text-center max-w-md">
                AI Adoption Metrics require GitHub data to measure throughput velocity, parallelism ratio, and AI ROI.
                Authenticate with <code className="px-1 py-0.5 rounded bg-[var(--color-surface-alt)]">gh auth login</code> or set <code className="px-1 py-0.5 rounded bg-[var(--color-surface-alt)]">GITHUB_TOKEN</code> environment variable, then configure your GitHub username in Settings.
              </p>
              <Link
                to="/settings"
                className="mt-2 flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--color-primary-600)] text-white text-sm font-medium hover:bg-[var(--color-primary-700)] transition-colors"
              >
                <Settings className="h-4 w-4" />
                Go to Settings
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
        title="AI Adoption Metrics"
        subtitle="Three developer-level signals for engineering teams"
      />

      <div className="flex-1 space-y-6 p-6">
        {/* Sprint Config */}
        <Card>
          <CardContent className="flex items-center gap-4 py-3">
            <GitPullRequest className="h-5 w-5 text-gray-400" />
            <span className="text-sm text-[var(--color-text-secondary)]">
              Sprint: {settings.sprintDays} days
            </span>
            <span className="text-sm text-[var(--color-text-muted)]">·</span>
            <span className="text-sm text-[var(--color-text-secondary)]">
              @{effectiveUsername}
            </span>
            {metrics && !isLoading && (
              <div className="ml-auto text-sm text-gray-400">
                {metrics.sprint_count} sprints · {metrics.prs_merged} PRs · ${metrics.total_cc_spend.toFixed(2)} CC spend
              </div>
            )}
          </CardContent>
        </Card>

        {/* Archetype Badge + Overall Score */}
        {metrics && !isLoading && (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <ArchetypeBadge archetype={metrics.archetype} />
            <OverallScoreCard score={metrics.overall_score} baseline={metrics.baseline?.overall_score ?? null} />
          </div>
        )}

        {/* Integrated Performance Panel */}
        {isLoading ? (
          <Card>
            <CardHeader>
              <CardTitle>Performance Profile</CardTitle>
              <CardDescription>3-axis AI adoption metrics</CardDescription>
            </CardHeader>
            <CardContent className="flex h-80 items-center justify-center">
              <div className="animate-pulse text-gray-500">Fetching data from GitHub...</div>
            </CardContent>
          </Card>
        ) : error ? (
          <Card>
            <CardHeader>
              <CardTitle>Performance Profile</CardTitle>
            </CardHeader>
            <CardContent className="flex h-40 items-center justify-center">
              <div className="text-red-400 text-sm text-center">
                <AlertCircle className="h-8 w-8 mx-auto mb-2" />
                Failed to fetch metrics. Check your GitHub token and settings.
                <br />
                <span className="text-xs text-gray-500 mt-1 block">{String(error)}</span>
              </div>
            </CardContent>
          </Card>
        ) : metrics ? (
          <Card>
            <CardHeader>
              <CardTitle>Performance Profile</CardTitle>
              <CardDescription>
                Throughput · Parallelism · AI ROI ({metrics.sprint_count} sprints analyzed)
              </CardDescription>
            </CardHeader>
            <CardContent>
              {/* Bubble Chart - full width */}
              <div className="h-[450px]">
                <DeveloperRadarChart metrics={metrics} />
              </div>

              {/* Metric rows - horizontal below chart */}
              <div className="grid grid-cols-3 gap-4 mt-4 pt-4 border-t border-[var(--color-border)]">
                {METRICS_LIST.map((m) => (
                  <MetricRow
                    key={m.key}
                    label={m.label}
                    value={metrics[m.key]}
                    rawValue={metrics[m.rawKey]}
                    unit={m.unit}
                    baseline={metrics.baseline?.[m.key] ?? null}
                    tooltip={m.tooltip}
                    icon={m.icon}
                  />
                ))}
              </div>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}

function ArchetypeBadge({ archetype }: { archetype: string }) {
  const style = ARCHETYPE_STYLES[archetype] ?? ARCHETYPE_STYLES['Early Adopter'];

  return (
    <Card>
      <CardContent className="flex items-center gap-4">
        <div className={`rounded-xl ${style.bg} p-4`}>
          <Zap className={`h-8 w-8 ${style.color}`} />
        </div>
        <div className="flex-1">
          <p className="text-sm font-medium text-gray-400">Developer Archetype</p>
          <p className={`text-2xl font-bold ${style.color}`}>{archetype}</p>
          <p className="text-sm text-gray-500 mt-1">{style.description}</p>
          <p className="text-xs text-fuchsia-300 mt-1">{style.coaching}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function OverallScoreCard({ score, baseline }: { score: number; baseline: number | null }) {
  const delta = baseline !== null ? score - baseline : null;

  return (
    <Card>
      <CardContent className="flex items-center gap-4">
        <div className="rounded-xl bg-blue-500/20 p-4">
          <Target className="h-8 w-8 text-blue-400" />
        </div>
        <div>
          <p className="text-sm font-medium text-gray-400">Overall Score</p>
          <div className="flex items-baseline gap-2">
            <p className="text-2xl font-bold text-white">{score.toFixed(1)}</p>
            <p className="text-sm text-gray-500">/ 10</p>
          </div>
          {delta !== null && (
            <div className={`flex items-center text-xs mt-1 ${delta >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {delta >= 0 ? <TrendingUp className="mr-1 h-3 w-3" /> : <TrendingDown className="mr-1 h-3 w-3" />}
              {delta >= 0 ? '+' : ''}{delta.toFixed(1)} vs baseline (prior 4 sprints)
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default Performance;

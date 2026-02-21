import { useState, useEffect, useMemo } from 'react';
import { cn } from '../../lib/utils';
import { Card, CardHeader, CardTitle } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { AntiPatternAlert } from './AntiPatternAlert';
import { RecommendationCard } from './RecommendationCard';
import { detectAntipatterns, getRecommendations } from '../../lib/tauri';
import type { DetectedPattern, Recommendation } from '../../lib/tauri';

type TabType = 'issues' | 'recommendations';
type SeverityFilter = 'all' | 'critical' | 'warning' | 'info';
type TypeFilter = 'all' | string;

interface InsightsPanelProps {
  sessionId?: string;
  className?: string;
}

export function InsightsPanel({ sessionId, className }: InsightsPanelProps) {
  const [activeTab, setActiveTab] = useState<TabType>('issues');
  const [patterns, setPatterns] = useState<DetectedPattern[]>([]);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>('all');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');

  // Dismissed items (stored in state - could be persisted to localStorage)
  const [dismissedPatterns, setDismissedPatterns] = useState<Set<string>>(new Set());
  const [dismissedRecommendations, setDismissedRecommendations] = useState<Set<string>>(new Set());
  const [snoozedRecommendations, setSnoozedRecommendations] = useState<Map<string, Date>>(new Map());

  useEffect(() => {
    loadData();
  }, [sessionId]);

  const loadData = async () => {
    setLoading(true);
    setError(null);

    try {
      const [patternsData, recsData] = await Promise.all([
        detectAntipatterns(sessionId),
        getRecommendations(sessionId, 20),
      ]);

      setPatterns(patternsData);
      setRecommendations(recsData.recommendations);
    } catch (err) {
      console.error('Failed to load insights:', err);
      setError('Failed to load insights data');
    } finally {
      setLoading(false);
    }
  };

  // Get unique types for filter
  const patternTypes = useMemo(() => {
    const types = new Set(patterns.map(p => p.pattern_type));
    return Array.from(types);
  }, [patterns]);

  const recommendationTypes = useMemo(() => {
    const types = new Set(recommendations.map(r => r.rec_type));
    return Array.from(types);
  }, [recommendations]);

  // Filter patterns
  const filteredPatterns = useMemo(() => {
    return patterns.filter(pattern => {
      // Check if dismissed
      const patternKey = `${pattern.session_id}-${pattern.pattern_type}-${pattern.turn_number}`;
      if (dismissedPatterns.has(patternKey)) return false;

      // Apply severity filter
      if (severityFilter !== 'all' && pattern.severity !== severityFilter) return false;

      // Apply type filter
      if (typeFilter !== 'all' && pattern.pattern_type !== typeFilter) return false;

      return true;
    });
  }, [patterns, dismissedPatterns, severityFilter, typeFilter]);

  // Filter recommendations
  const filteredRecommendations = useMemo(() => {
    const now = new Date();

    return recommendations.filter(rec => {
      const recKey = `${rec.rec_type}-${rec.title}`;

      // Check if dismissed
      if (dismissedRecommendations.has(recKey)) return false;

      // Check if snoozed
      const snoozedUntil = snoozedRecommendations.get(recKey);
      if (snoozedUntil && snoozedUntil > now) return false;

      // Apply type filter
      if (typeFilter !== 'all' && rec.rec_type !== typeFilter) return false;

      return true;
    });
  }, [recommendations, dismissedRecommendations, snoozedRecommendations, typeFilter]);

  // Count issues by severity
  const issueCounts = useMemo(() => {
    return {
      critical: patterns.filter(p => p.severity === 'critical').length,
      warning: patterns.filter(p => p.severity === 'warning').length,
      info: patterns.filter(p => p.severity === 'info').length,
      total: patterns.length,
    };
  }, [patterns]);

  const handleDismissPattern = (pattern: DetectedPattern) => {
    const patternKey = `${pattern.session_id}-${pattern.pattern_type}-${pattern.turn_number}`;
    setDismissedPatterns(prev => new Set(prev).add(patternKey));
  };

  const handleDismissRecommendation = (recommendation: Recommendation) => {
    const recKey = `${recommendation.rec_type}-${recommendation.title}`;
    setDismissedRecommendations(prev => new Set(prev).add(recKey));
  };

  const handleSnoozeRecommendation = (recommendation: Recommendation, duration: 'day' | 'week') => {
    const recKey = `${recommendation.rec_type}-${recommendation.title}`;
    const snoozedUntil = new Date();
    snoozedUntil.setDate(snoozedUntil.getDate() + (duration === 'day' ? 1 : 7));
    setSnoozedRecommendations(prev => new Map(prev).set(recKey, snoozedUntil));
  };

  const formatTypeLabel = (type: string): string => {
    return type
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  return (
    <Card className={cn('h-full flex flex-col', className)}>
      <CardHeader className="flex-shrink-0">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <svg className="h-5 w-5 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
            Insights
          </CardTitle>

          <Button
            variant="ghost"
            size="sm"
            onClick={loadData}
            disabled={loading}
          >
            <svg className={cn('h-4 w-4', loading && 'animate-spin')} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </Button>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 mt-4 p-1 bg-gray-800/50 rounded-lg">
          <button
            className={cn(
              'flex-1 px-3 py-2 text-sm font-medium rounded-md transition-colors',
              activeTab === 'issues'
                ? 'bg-gray-700 text-white'
                : 'text-gray-400 hover:text-white'
            )}
            onClick={() => setActiveTab('issues')}
          >
            <span className="flex items-center justify-center gap-2">
              Issues
              {issueCounts.total > 0 && (
                <Badge variant={issueCounts.critical > 0 ? 'error' : 'warning'}>
                  {issueCounts.total}
                </Badge>
              )}
            </span>
          </button>
          <button
            className={cn(
              'flex-1 px-3 py-2 text-sm font-medium rounded-md transition-colors',
              activeTab === 'recommendations'
                ? 'bg-gray-700 text-white'
                : 'text-gray-400 hover:text-white'
            )}
            onClick={() => setActiveTab('recommendations')}
          >
            <span className="flex items-center justify-center gap-2">
              Recommendations
              {recommendations.length > 0 && (
                <Badge variant="info">{recommendations.length}</Badge>
              )}
            </span>
          </button>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2 mt-3 flex-wrap">
          {activeTab === 'issues' && (
            <select
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value as SeverityFilter)}
              className="px-2 py-1 text-sm bg-gray-800 border border-gray-700 rounded-md text-gray-300 focus:outline-none focus:ring-1 focus:ring-purple-500"
            >
              <option value="all">All Severities</option>
              <option value="critical">Critical</option>
              <option value="warning">Warning</option>
              <option value="info">Info</option>
            </select>
          )}

          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="px-2 py-1 text-sm bg-gray-800 border border-gray-700 rounded-md text-gray-300 focus:outline-none focus:ring-1 focus:ring-purple-500"
          >
            <option value="all">All Types</option>
            {(activeTab === 'issues' ? patternTypes : recommendationTypes).map(type => (
              <option key={type} value={type}>
                {formatTypeLabel(type)}
              </option>
            ))}
          </select>
        </div>
      </CardHeader>

      <div className="flex-1 overflow-y-auto p-4 pt-0">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500" />
          </div>
        ) : error ? (
          <div className="text-center py-8">
            <svg className="h-12 w-12 text-red-400 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <p className="text-gray-400">{error}</p>
            <Button variant="secondary" size="sm" className="mt-3" onClick={loadData}>
              Try Again
            </Button>
          </div>
        ) : activeTab === 'issues' ? (
          filteredPatterns.length === 0 ? (
            <div className="text-center py-8">
              <svg className="h-12 w-12 text-green-400 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-gray-400">No anti-patterns detected</p>
              <p className="text-sm text-gray-500 mt-1">Your sessions are following best practices</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredPatterns.map((pattern, index) => (
                <AntiPatternAlert
                  key={`${pattern.session_id}-${pattern.pattern_type}-${pattern.turn_number}-${index}`}
                  pattern={pattern}
                  onDismiss={handleDismissPattern}
                />
              ))}
            </div>
          )
        ) : (
          filteredRecommendations.length === 0 ? (
            <div className="text-center py-8">
              <svg className="h-12 w-12 text-gray-500 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
              <p className="text-gray-400">No recommendations available</p>
              <p className="text-sm text-gray-500 mt-1">Check back after more sessions</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredRecommendations.map((recommendation, index) => (
                <RecommendationCard
                  key={`${recommendation.rec_type}-${recommendation.title}-${index}`}
                  recommendation={recommendation}
                  onDismiss={handleDismissRecommendation}
                  onSnooze={handleSnoozeRecommendation}
                />
              ))}
            </div>
          )
        )}
      </div>

      {/* Summary Footer */}
      {!loading && !error && (
        <div className="flex-shrink-0 px-4 py-3 border-t border-gray-700 bg-gray-800/30">
          {activeTab === 'issues' ? (
            <div className="flex items-center justify-between text-xs text-gray-500">
              <span>{filteredPatterns.length} issue{filteredPatterns.length !== 1 ? 's' : ''} shown</span>
              {issueCounts.critical > 0 && (
                <span className="text-red-400">
                  {issueCounts.critical} critical
                </span>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-between text-xs text-gray-500">
              <span>{filteredRecommendations.length} recommendation{filteredRecommendations.length !== 1 ? 's' : ''}</span>
              <span className="text-green-400">
                ${filteredRecommendations.reduce((sum, r) => sum + r.potential_savings, 0).toFixed(4)} potential savings
              </span>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

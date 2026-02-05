import { useState } from 'react';
import { cn } from '../../lib/utils';
import { Card, CardContent } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import type { Recommendation } from '../../lib/tauri';

interface RecommendationCardProps {
  recommendation: Recommendation;
  className?: string;
  onDismiss?: (recommendation: Recommendation) => void;
  onSnooze?: (recommendation: Recommendation, duration: 'day' | 'week') => void;
}

export function RecommendationCard({
  recommendation,
  className,
  onDismiss,
  onSnooze,
}: RecommendationCardProps) {
  const [showActions, setShowActions] = useState(false);

  const getConfidenceColor = (confidence: number): string => {
    if (confidence >= 0.8) return 'text-green-400';
    if (confidence >= 0.6) return 'text-yellow-400';
    return 'text-orange-400';
  };

  const getConfidenceLabel = (confidence: number): string => {
    if (confidence >= 0.8) return 'High';
    if (confidence >= 0.6) return 'Medium';
    return 'Low';
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'cost_reduction':
        return (
          <svg className="h-5 w-5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
      case 'efficiency':
        return (
          <svg className="h-5 w-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        );
      case 'best_practice':
        return (
          <svg className="h-5 w-5 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
          </svg>
        );
      default:
        return (
          <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
        );
    }
  };

  const formatRecType = (type: string): string => {
    return type
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  return (
    <Card className={cn('hover:border-[var(--color-border-hover)] transition-colors', className)}>
      <CardContent>
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 mt-1">
            {getTypeIcon(recommendation.rec_type)}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <h4 className="text-sm font-medium text-white">
                {recommendation.title}
              </h4>
              <Badge variant="info">
                {formatRecType(recommendation.rec_type)}
              </Badge>
            </div>

            <p className="text-sm text-gray-400 mb-3">
              {recommendation.description}
            </p>

            {/* Confidence Meter */}
            <div className="flex items-center gap-3 mb-3">
              <div className="flex-1 max-w-[150px]">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-gray-500">Confidence</span>
                  <span className={cn('text-xs font-medium', getConfidenceColor(recommendation.confidence))}>
                    {getConfidenceLabel(recommendation.confidence)}
                  </span>
                </div>
                <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className={cn(
                      'h-full rounded-full transition-all',
                      recommendation.confidence >= 0.8 ? 'bg-green-500' :
                      recommendation.confidence >= 0.6 ? 'bg-yellow-500' : 'bg-orange-500'
                    )}
                    style={{ width: `${recommendation.confidence * 100}%` }}
                  />
                </div>
              </div>

              {recommendation.potential_savings > 0 && (
                <div className="text-right">
                  <span className="text-xs text-gray-500">Potential Savings</span>
                  <div className="text-sm font-medium text-green-400">
                    ${recommendation.potential_savings.toFixed(4)}
                  </div>
                </div>
              )}
            </div>

            {/* Action Items */}
            {recommendation.action_items.length > 0 && (
              <div className="space-y-1">
                <h5 className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Action Items
                </h5>
                <ul className="space-y-1">
                  {recommendation.action_items.map((item, index) => (
                    <li key={index} className="flex items-start gap-2 text-sm text-gray-300">
                      <svg className="h-4 w-4 text-gray-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Actions Menu */}
          <div className="flex-shrink-0 relative">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowActions(!showActions)}
              className="text-gray-400 hover:text-white"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
              </svg>
            </Button>

            {showActions && (
              <div className="absolute right-0 top-full mt-1 w-40 rounded-md bg-gray-800 border border-gray-700 shadow-lg z-10">
                {onSnooze && (
                  <>
                    <button
                      className="w-full px-3 py-2 text-sm text-left text-gray-300 hover:bg-gray-700 transition-colors"
                      onClick={() => {
                        onSnooze(recommendation, 'day');
                        setShowActions(false);
                      }}
                    >
                      Snooze for 1 day
                    </button>
                    <button
                      className="w-full px-3 py-2 text-sm text-left text-gray-300 hover:bg-gray-700 transition-colors"
                      onClick={() => {
                        onSnooze(recommendation, 'week');
                        setShowActions(false);
                      }}
                    >
                      Snooze for 1 week
                    </button>
                  </>
                )}
                {onDismiss && (
                  <button
                    className="w-full px-3 py-2 text-sm text-left text-red-400 hover:bg-gray-700 transition-colors border-t border-gray-700"
                    onClick={() => {
                      onDismiss(recommendation);
                      setShowActions(false);
                    }}
                  >
                    Dismiss
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

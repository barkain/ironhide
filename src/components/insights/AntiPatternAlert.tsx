import { useState } from 'react';
import { cn } from '../../lib/utils';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import type { DetectedPattern } from '../../lib/tauri';

interface AntiPatternAlertProps {
  pattern: DetectedPattern;
  className?: string;
  onDismiss?: (pattern: DetectedPattern) => void;
}

export function AntiPatternAlert({ pattern, className, onDismiss }: AntiPatternAlertProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const severityConfig = {
    critical: {
      variant: 'error' as const,
      bgClass: 'bg-red-950/30 border-red-900/50',
      iconColor: 'text-red-400',
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      ),
    },
    warning: {
      variant: 'warning' as const,
      bgClass: 'bg-yellow-950/30 border-yellow-900/50',
      iconColor: 'text-yellow-400',
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
    info: {
      variant: 'info' as const,
      bgClass: 'bg-blue-950/30 border-blue-900/50',
      iconColor: 'text-blue-400',
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
  };

  const config = severityConfig[pattern.severity as keyof typeof severityConfig] || severityConfig.warning;

  const formatPatternType = (type: string): string => {
    return type
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  return (
    <div
      className={cn(
        'rounded-lg border p-4',
        config.bgClass,
        className
      )}
    >
      <div className="flex items-start gap-3">
        <div className={cn('flex-shrink-0 mt-0.5', config.iconColor)}>
          {config.icon}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="text-sm font-medium text-white">
              {formatPatternType(pattern.pattern_type)}
            </h4>
            <Badge variant={config.variant}>
              {pattern.severity.toUpperCase()}
            </Badge>
            {pattern.impact_cost > 0 && (
              <span className="text-xs text-gray-400">
                Impact: ${pattern.impact_cost.toFixed(4)}
              </span>
            )}
          </div>

          <p className="mt-1 text-sm text-gray-300">
            {pattern.description}
          </p>

          {isExpanded && (
            <div className="mt-3 space-y-2">
              <div className="rounded-md bg-black/30 p-3">
                <h5 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">
                  Suggested Action
                </h5>
                <p className="text-sm text-gray-200">{pattern.suggestion}</p>
              </div>

              {pattern.session_id && (
                <div className="flex items-center gap-4 text-xs text-gray-400">
                  <span>Session: {pattern.session_id.slice(0, 8)}...</span>
                  {pattern.turn_number !== undefined && (
                    <span>Turn: {pattern.turn_number}</span>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-gray-400 hover:text-white"
          >
            {isExpanded ? (
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
              </svg>
            ) : (
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            )}
          </Button>

          {onDismiss && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onDismiss(pattern)}
              className="text-gray-400 hover:text-white"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

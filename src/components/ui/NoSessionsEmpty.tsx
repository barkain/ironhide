import { MessageSquare, Terminal } from 'lucide-react';
import { EmptyState } from './EmptyState';

interface NoSessionsEmptyProps {
  onRefresh?: () => void;
}

export function NoSessionsEmpty({ onRefresh }: NoSessionsEmptyProps) {
  return (
    <EmptyState
      icon={MessageSquare}
      title="No sessions found"
      description="Sessions will appear here once you start using Claude Code. Start a new session to begin tracking your usage."
      action={
        onRefresh
          ? {
              label: 'Refresh',
              onClick: onRefresh,
              icon: Terminal,
            }
          : undefined
      }
    >
      <div className="mt-4 p-4 rounded-lg bg-gray-800/50 border border-gray-700 max-w-sm">
        <p className="text-xs text-gray-400 text-center">
          Tip: Run <code className="px-1.5 py-0.5 rounded bg-gray-900 text-[var(--color-primary-400)]">claude</code> in your terminal to create a new session
        </p>
      </div>
    </EmptyState>
  );
}

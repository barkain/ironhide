import { Loader2 } from 'lucide-react';

/**
 * Full-page loading spinner for route transitions
 * Used as a fallback for React.lazy loaded components
 */
export function PageLoadingSpinner() {
  return (
    <div className="flex h-screen w-full items-center justify-center bg-[var(--color-background)]">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="h-10 w-10 animate-spin text-[var(--color-primary-500)]" />
        <p className="text-sm text-gray-400">Loading...</p>
      </div>
    </div>
  );
}

/**
 * Component-level loading spinner for lazy-loaded charts and components
 */
export function ComponentLoadingSpinner({ height = 300 }: { height?: number }) {
  return (
    <div
      className="flex items-center justify-center bg-[var(--color-surface)] rounded-lg border border-[var(--color-border)]"
      style={{ height }}
    >
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-[var(--color-primary-400)]" />
        <p className="text-sm text-gray-500">Loading chart...</p>
      </div>
    </div>
  );
}

/**
 * Skeleton loader for cards
 */
export function CardSkeleton() {
  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <div className="animate-pulse space-y-3">
        <div className="h-4 w-32 rounded bg-gray-700" />
        <div className="h-6 w-48 rounded bg-gray-700" />
      </div>
    </div>
  );
}

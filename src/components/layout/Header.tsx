import { useMemo } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '../ui/Button';
import { DateRangePicker } from '../ui/DateRangePicker';
import { TimeRangeFilter } from '../ui/TimeRangeFilter';
import { useRefreshData, useLastSyncTime, useDailyMetrics } from '../../hooks/useMetrics';
import { useAppStore } from '../../lib/store';
import { formatRelativeTime } from '../../lib/utils';

interface HeaderProps {
  title: string;
  subtitle?: string;
  showDateFilter?: boolean;
  showQuickFilter?: boolean;
}

export function Header({ title, subtitle, showDateFilter = true, showQuickFilter = false }: HeaderProps) {
  const { mutate: refresh, isPending } = useRefreshData();
  const { data: lastSyncTime } = useLastSyncTime();
  const { dateRange, setDateRange, presetRange, setPresetRange } = useAppStore();
  const { data: dailyMetrics } = useDailyMetrics();

  // Compute the earliest date from daily metrics for "All" range display
  const earliestDate = useMemo(() => {
    if (!dailyMetrics || dailyMetrics.length === 0) return undefined;
    // Daily metrics are date-sorted; the first entry has the earliest date
    return dailyMetrics[0].date;
  }, [dailyMetrics]);

  return (
    <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-surface)] px-6">
      <div>
        <h1 className="text-xl font-semibold text-white">{title}</h1>
        {subtitle && <p className="text-sm text-gray-400">{subtitle}</p>}
      </div>

      <div className="flex items-center gap-4">
        {/* Quick time range filter (button group) */}
        {showQuickFilter && (
          <TimeRangeFilter
            value={dateRange}
            onChange={setDateRange}
            presetRange={presetRange}
            onPresetChange={setPresetRange}
            earliestDate={earliestDate}
          />
        )}

        {/* Date range picker (calendar dropdown) */}
        {showDateFilter && !showQuickFilter && (
          <DateRangePicker
            value={dateRange}
            onChange={(range) => {
              setDateRange(range);
              setPresetRange(range ? 'custom' : 'all');
            }}
          />
        )}

        {/* Last sync time */}
        {lastSyncTime && (
          <span className="text-xs text-gray-500">
            Last synced: {formatRelativeTime(lastSyncTime)}
          </span>
        )}

        {/* Refresh button */}
        <Button
          variant="secondary"
          size="sm"
          onClick={() => refresh()}
          isLoading={isPending}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${isPending ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>
    </header>
  );
}

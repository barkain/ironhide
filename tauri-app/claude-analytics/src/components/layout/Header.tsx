import { RefreshCw, Calendar } from 'lucide-react';
import { Button } from '../ui/Button';
import { useRefreshData, useLastSyncTime } from '../../hooks/useMetrics';
import { useAppStore } from '../../lib/store';
import { formatRelativeTime, getDateRangePresets } from '../../lib/utils';

interface HeaderProps {
  title: string;
  subtitle?: string;
}

export function Header({ title, subtitle }: HeaderProps) {
  const { mutate: refresh, isPending } = useRefreshData();
  const { data: lastSyncTime } = useLastSyncTime();
  const { dateRange, setDateRange } = useAppStore();
  const presets = getDateRangePresets();

  return (
    <header className="flex h-16 items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-surface)] px-6">
      <div>
        <h1 className="text-xl font-semibold text-white">{title}</h1>
        {subtitle && <p className="text-sm text-gray-400">{subtitle}</p>}
      </div>

      <div className="flex items-center gap-4">
        {/* Date range selector */}
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-gray-400" />
          <select
            value={dateRange ? `${dateRange.start}|${dateRange.end}` : ''}
            onChange={(e) => {
              if (e.target.value === '') {
                setDateRange(null);
              } else {
                const [start, end] = e.target.value.split('|');
                setDateRange({ start, end });
              }
            }}
            className="rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-1.5 text-sm text-gray-200 focus:border-[var(--color-primary-500)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary-500)]"
          >
            <option value="">All time</option>
            {presets.map((preset) => (
              <option
                key={preset.label}
                value={`${preset.range.start}|${preset.range.end}`}
              >
                {preset.label}
              </option>
            ))}
          </select>
        </div>

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

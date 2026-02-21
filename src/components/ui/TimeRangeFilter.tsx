import { format, subDays, subMonths, startOfDay, endOfDay } from 'date-fns';
import { cn } from '../../lib/utils';

export type PresetRange = '7d' | '30d' | '90d' | 'all' | 'custom';

export interface DateRangeValue {
  start: string;
  end: string;
}

interface TimeRangeFilterProps {
  value: DateRangeValue | null;
  onChange: (value: DateRangeValue | null) => void;
  presetRange: PresetRange;
  onPresetChange: (preset: PresetRange) => void;
  earliestDate?: string;
  className?: string;
}

function dateToISODateString(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

const presetButtons: { key: PresetRange; label: string }[] = [
  { key: '7d', label: '7d' },
  { key: '30d', label: '30d' },
  { key: '90d', label: '90d' },
  { key: 'all', label: 'All' },
];

function getPresetRange(preset: PresetRange): DateRangeValue | null {
  const now = new Date();
  const today = dateToISODateString(endOfDay(now));

  switch (preset) {
    case '7d':
      return { start: dateToISODateString(startOfDay(subDays(now, 6))), end: today };
    case '30d':
      return { start: dateToISODateString(startOfDay(subDays(now, 29))), end: today };
    case '90d':
      return { start: dateToISODateString(startOfDay(subMonths(now, 3))), end: today };
    case 'all':
    case 'custom':
    default:
      return null;
  }
}

export function TimeRangeFilter({
  value,
  onChange,
  presetRange,
  onPresetChange,
  earliestDate,
  className,
}: TimeRangeFilterProps) {
  const handlePresetClick = (preset: PresetRange) => {
    onPresetChange(preset);
    const range = getPresetRange(preset);
    onChange(range);
  };

  const now = new Date();

  const displayText = value
    ? `${format(new Date(value.start), 'MMM d')} - ${format(new Date(value.end), 'MMM d, yyyy')}`
    : earliestDate
      ? `${format(new Date(earliestDate), 'MMM d')} - ${format(now, 'MMM d, yyyy')}`
      : null;

  return (
    <div className={cn('flex items-center gap-2', className)}>
      {/* Quick filter buttons */}
      <div className="flex rounded-md border border-[var(--color-border)] bg-[var(--color-background)] p-0.5">
        {presetButtons.map((button) => (
          <button
            key={button.key}
            onClick={() => handlePresetClick(button.key)}
            className={cn(
              'px-3 py-1 text-sm font-medium rounded transition-colors',
              presetRange === button.key
                ? 'bg-[var(--color-primary-600)] text-white'
                : 'text-gray-400 hover:text-white hover:bg-gray-800'
            )}
          >
            {button.label}
          </button>
        ))}
      </div>

      {/* Selected range text */}
      {displayText && (
        <span className="text-xs text-gray-500 hidden sm:inline">
          {displayText}
        </span>
      )}
    </div>
  );
}

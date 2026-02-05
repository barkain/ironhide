import { useState, useRef, useEffect } from 'react';
import { DayPicker, type DateRange as DayPickerDateRange } from 'react-day-picker';
import { format, subDays, subMonths, startOfDay, endOfDay } from 'date-fns';
import { Calendar, ChevronDown, X } from 'lucide-react';
import { Button } from './Button';
import { cn } from '../../lib/utils';
import 'react-day-picker/style.css';

export interface DateRangeValue {
  start: string;
  end: string;
}

interface DateRangePickerProps {
  value: DateRangeValue | null;
  onChange: (value: DateRangeValue | null) => void;
  className?: string;
}

type PresetKey = 'today' | '7d' | '30d' | '90d' | 'custom';

interface Preset {
  key: PresetKey;
  label: string;
  getRange: () => DayPickerDateRange;
}

const presets: Preset[] = [
  {
    key: 'today',
    label: 'Today',
    getRange: () => ({
      from: startOfDay(new Date()),
      to: endOfDay(new Date()),
    }),
  },
  {
    key: '7d',
    label: 'Last 7 days',
    getRange: () => ({
      from: startOfDay(subDays(new Date(), 6)),
      to: endOfDay(new Date()),
    }),
  },
  {
    key: '30d',
    label: 'Last 30 days',
    getRange: () => ({
      from: startOfDay(subDays(new Date(), 29)),
      to: endOfDay(new Date()),
    }),
  },
  {
    key: '90d',
    label: 'Last 90 days',
    getRange: () => ({
      from: startOfDay(subMonths(new Date(), 3)),
      to: endOfDay(new Date()),
    }),
  },
];

function dateToISODateString(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

function isoStringToDate(isoString: string): Date {
  return new Date(isoString);
}

export function DateRangePicker({ value, onChange, className }: DateRangePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedRange, setSelectedRange] = useState<DayPickerDateRange | undefined>(
    value
      ? { from: isoStringToDate(value.start), to: isoStringToDate(value.end) }
      : undefined
  );
  const [activePreset, setActivePreset] = useState<PresetKey | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  // Sync local state with props
  useEffect(() => {
    if (value) {
      setSelectedRange({ from: isoStringToDate(value.start), to: isoStringToDate(value.end) });
    } else {
      setSelectedRange(undefined);
      setActivePreset(null);
    }
  }, [value]);

  const handlePresetClick = (preset: Preset) => {
    const range = preset.getRange();
    setSelectedRange(range);
    setActivePreset(preset.key);
  };

  const handleApply = () => {
    if (selectedRange?.from && selectedRange?.to) {
      onChange({
        start: dateToISODateString(selectedRange.from),
        end: dateToISODateString(selectedRange.to),
      });
    }
    setIsOpen(false);
  };

  const handleClear = () => {
    setSelectedRange(undefined);
    setActivePreset(null);
    onChange(null);
    setIsOpen(false);
  };

  const handleRangeSelect = (range: DayPickerDateRange | undefined) => {
    setSelectedRange(range);
    setActivePreset('custom');
  };

  const displayText = value
    ? `${format(isoStringToDate(value.start), 'MMM d, yyyy')} - ${format(isoStringToDate(value.end), 'MMM d, yyyy')}`
    : 'All time';

  return (
    <div className={cn('relative', className)} ref={dropdownRef}>
      {/* Trigger button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'flex items-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-1.5 text-sm transition-colors',
          'hover:border-[var(--color-primary-500)] focus:border-[var(--color-primary-500)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary-500)]',
          value ? 'text-white' : 'text-gray-400'
        )}
      >
        <Calendar className="h-4 w-4" />
        <span className="min-w-[180px] text-left">{displayText}</span>
        <ChevronDown className={cn('h-4 w-4 transition-transform', isOpen && 'rotate-180')} />
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute right-0 top-full z-50 mt-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-xl">
          <div className="flex gap-4">
            {/* Presets */}
            <div className="flex flex-col gap-1 border-r border-[var(--color-border)] pr-4">
              <span className="mb-2 text-xs font-medium uppercase text-gray-500">Presets</span>
              {presets.map((preset) => (
                <button
                  key={preset.key}
                  onClick={() => handlePresetClick(preset)}
                  className={cn(
                    'rounded-md px-3 py-1.5 text-sm text-left transition-colors',
                    activePreset === preset.key
                      ? 'bg-[var(--color-primary-600)] text-white'
                      : 'text-gray-300 hover:bg-gray-800'
                  )}
                >
                  {preset.label}
                </button>
              ))}
              <button
                onClick={() => setActivePreset('custom')}
                className={cn(
                  'rounded-md px-3 py-1.5 text-sm text-left transition-colors',
                  activePreset === 'custom'
                    ? 'bg-[var(--color-primary-600)] text-white'
                    : 'text-gray-300 hover:bg-gray-800'
                )}
              >
                Custom range
              </button>
            </div>

            {/* Calendar */}
            <div className="date-picker-dark">
              <DayPicker
                mode="range"
                selected={selectedRange}
                onSelect={handleRangeSelect}
                numberOfMonths={2}
                disabled={{ after: new Date() }}
                defaultMonth={selectedRange?.from || subMonths(new Date(), 1)}
                classNames={{
                  root: 'text-white',
                  months: 'flex gap-4',
                  month: 'space-y-2',
                  month_caption: 'text-sm font-medium text-gray-300 pb-2',
                  nav: 'flex items-center justify-between mb-2',
                  button_previous: 'p-1 rounded hover:bg-gray-800 text-gray-400 hover:text-white',
                  button_next: 'p-1 rounded hover:bg-gray-800 text-gray-400 hover:text-white',
                  weekdays: 'flex',
                  weekday: 'text-gray-500 text-xs font-medium w-8 text-center',
                  week: 'flex',
                  day: 'w-8 h-8 text-sm flex items-center justify-center rounded hover:bg-gray-800 text-gray-300',
                  day_button: 'w-full h-full',
                  selected: 'bg-[var(--color-primary-600)] text-white hover:bg-[var(--color-primary-500)]',
                  range_start: 'bg-[var(--color-primary-600)] text-white rounded-l-md',
                  range_end: 'bg-[var(--color-primary-600)] text-white rounded-r-md',
                  range_middle: 'bg-[var(--color-primary-600)]/30 text-white',
                  today: 'font-bold text-[var(--color-primary-400)]',
                  outside: 'text-gray-600',
                  disabled: 'text-gray-700 cursor-not-allowed hover:bg-transparent',
                }}
              />
            </div>
          </div>

          {/* Actions */}
          <div className="mt-4 flex items-center justify-between border-t border-[var(--color-border)] pt-4">
            <div className="text-sm text-gray-400">
              {selectedRange?.from && selectedRange?.to ? (
                <>
                  {format(selectedRange.from, 'MMM d, yyyy')} - {format(selectedRange.to, 'MMM d, yyyy')}
                </>
              ) : (
                'Select a date range'
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={handleClear}>
                <X className="h-4 w-4 mr-1" />
                Clear
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleApply}
                disabled={!selectedRange?.from || !selectedRange?.to}
              >
                Apply
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

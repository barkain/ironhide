'use client';

import { Button } from '@/components/ui/button';
import { SessionList } from '@/components/session/SessionList';
import { useSettingsStore, type TimeRange } from '@/stores/settingsStore';
import { cn } from '@/lib/utils';
import type { SessionListItem } from '@/lib/api';
import { ChevronLeft, Clock } from 'lucide-react';

interface SidebarProps {
  sessions: SessionListItem[];
  selectedSessionId: string | null;
  isLoading?: boolean;
}

const TIME_RANGE_OPTIONS: { value: TimeRange; label: string }[] = [
  { value: '1h', label: '1 Hour' },
  { value: '6h', label: '6 Hours' },
  { value: '24h', label: '24 Hours' },
  { value: '7d', label: '7 Days' },
  { value: '30d', label: '30 Days' },
  { value: 'all', label: 'All Time' },
];

export function Sidebar({ sessions, selectedSessionId, isLoading }: SidebarProps) {
  const { sidebarCollapsed, setSidebarCollapsed, selectedTimeRange, setTimeRange } =
    useSettingsStore();

  return (
    <aside
      className={cn(
        'fixed left-0 top-14 z-40 h-[calc(100vh-3.5rem)] border-r bg-background transition-all duration-300',
        sidebarCollapsed ? 'w-0 overflow-hidden' : 'w-80'
      )}
    >
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="font-semibold">Sessions</h2>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSidebarCollapsed(true)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
        </div>

        <div className="p-4 border-b">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Time Range</span>
          </div>
          <div className="flex flex-wrap gap-1">
            {TIME_RANGE_OPTIONS.map((option) => (
              <Button
                key={option.value}
                variant={selectedTimeRange === option.value ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setTimeRange(option.value)}
                className="text-xs"
              >
                {option.label}
              </Button>
            ))}
          </div>
        </div>

        <SessionList
          sessions={sessions}
          selectedSessionId={selectedSessionId}
          isLoading={isLoading}
        />
      </div>
    </aside>
  );
}

interface SidebarToggleProps {
  isCollapsed: boolean;
  onToggle: () => void;
}

export function SidebarToggle({ isCollapsed, onToggle }: SidebarToggleProps) {
  if (!isCollapsed) return null;

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={onToggle}
      className="fixed left-4 top-20 z-40"
    >
      <ChevronLeft className="h-4 w-4 rotate-180" />
    </Button>
  );
}

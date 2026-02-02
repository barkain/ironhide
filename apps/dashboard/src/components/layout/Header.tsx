'use client';

import { Button } from '@/components/ui/button';
import { ConnectionStatus } from '@/components/realtime/ConnectionStatus';
import { useSettingsStore } from '@/stores/settingsStore';
import type { SSEConnectionStatus } from '@analytics/shared';
import { Activity, Moon, Sun, Settings, Menu } from 'lucide-react';
import Link from 'next/link';

interface HeaderProps {
  connectionStatus?: SSEConnectionStatus;
  onReconnect?: () => void;
  onToggleSidebar?: () => void;
}

export function Header({ connectionStatus, onReconnect, onToggleSidebar }: HeaderProps) {
  const { theme, setTheme } = useSettingsStore();

  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-14 items-center">
        <div className="flex items-center gap-4">
          {onToggleSidebar && (
            <Button variant="ghost" size="icon" onClick={onToggleSidebar} className="md:hidden">
              <Menu className="h-5 w-5" />
            </Button>
          )}
          <Link href="/" className="flex items-center gap-2">
            <Activity className="h-6 w-6 text-primary" />
            <span className="font-bold hidden sm:inline">Claude Code Analytics</span>
          </Link>
        </div>

        <div className="flex-1" />

        <div className="flex items-center gap-4">
          {connectionStatus && (
            <ConnectionStatus status={connectionStatus} onReconnect={onReconnect} />
          )}
          <Button variant="ghost" size="icon" onClick={toggleTheme}>
            {theme === 'dark' ? (
              <Sun className="h-5 w-5" />
            ) : (
              <Moon className="h-5 w-5" />
            )}
          </Button>
          <Link href="/settings">
            <Button variant="ghost" size="icon">
              <Settings className="h-5 w-5" />
            </Button>
          </Link>
        </div>
      </div>
    </header>
  );
}

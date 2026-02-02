'use client';

import { Suspense, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { Header } from '@/components/layout/Header';
import { Sidebar, SidebarToggle } from '@/components/layout/Sidebar';
import { DashboardView } from '@/components/views/DashboardView';
import { SessionDetailView } from '@/components/views/SessionDetailView';
import { Skeleton } from '@/components/ui/skeleton';
import { useSessions } from '@/hooks/useSessionData';
import { useSSESubscription } from '@/hooks/useSSESubscription';
import { useSettingsStore } from '@/stores/settingsStore';
import { cn } from '@/lib/utils';

// Loading fallback for Suspense
function DashboardLoading() {
  return (
    <div className="min-h-screen bg-background">
      <div className="h-14 border-b bg-background" />
      <div className="flex">
        <div className="w-80 h-screen border-r bg-background" />
        <main className="flex-1 p-6">
          <Skeleton className="h-8 w-64 mb-4" />
          <Skeleton className="h-4 w-48 mb-8" />
          <div className="grid grid-cols-4 gap-4">
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
          </div>
        </main>
      </div>
    </div>
  );
}

// Separate component that uses useSearchParams
function DashboardContent() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get('session');

  const { sidebarCollapsed, setSidebarCollapsed, theme } = useSettingsStore();
  const { data: sessionsData, isLoading: isLoadingSessions } = useSessions({ limit: 20 });
  const { status, connect } = useSSESubscription(sessionId ?? undefined);

  // Apply theme on mount
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else if (theme === 'light') {
      root.classList.remove('dark');
    } else {
      // System preference
      if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
        root.classList.add('dark');
      } else {
        root.classList.remove('dark');
      }
    }
  }, [theme]);

  return (
    <div className="min-h-screen bg-background">
      <Header
        connectionStatus={status}
        onReconnect={connect}
        onToggleSidebar={() => setSidebarCollapsed(!sidebarCollapsed)}
      />

      <Sidebar
        sessions={sessionsData?.sessions ?? []}
        selectedSessionId={sessionId}
        isLoading={isLoadingSessions}
      />

      <SidebarToggle
        isCollapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(false)}
      />

      <main
        className={cn(
          'transition-all duration-300 pt-6 pb-8',
          sidebarCollapsed ? 'ml-0' : 'ml-80'
        )}
      >
        <div className="container">
          {sessionId ? (
            <SessionDetailView
              sessionId={sessionId}
              sessions={sessionsData?.sessions ?? []}
              isLoadingSessions={isLoadingSessions}
            />
          ) : (
            <DashboardView
              sessions={sessionsData?.sessions ?? []}
              total={sessionsData?.total ?? 0}
              isLoading={isLoadingSessions}
            />
          )}
        </div>
      </main>
    </div>
  );
}

// Main page component with Suspense boundary
export default function DashboardPage() {
  return (
    <Suspense fallback={<DashboardLoading />}>
      <DashboardContent />
    </Suspense>
  );
}

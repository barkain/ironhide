import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { DateRange } from '../types';

interface AppState {
  // UI State
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleSidebar: () => void;

  // Date range filter
  dateRange: DateRange | null;
  setDateRange: (range: DateRange | null) => void;

  // Selected project filter
  selectedProject: string | null;
  setSelectedProject: (project: string | null) => void;

  // Theme
  theme: 'light' | 'dark' | 'system';
  setTheme: (theme: 'light' | 'dark' | 'system') => void;

  // Last sync time
  lastSyncTime: string | null;
  setLastSyncTime: (time: string | null) => void;

  // Loading states
  isRefreshing: boolean;
  setIsRefreshing: (refreshing: boolean) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      // UI State
      sidebarCollapsed: false,
      setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
      toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),

      // Date range filter
      dateRange: null,
      setDateRange: (range) => set({ dateRange: range }),

      // Selected project filter
      selectedProject: null,
      setSelectedProject: (project) => set({ selectedProject: project }),

      // Theme
      theme: 'dark',
      setTheme: (theme) => set({ theme }),

      // Last sync time
      lastSyncTime: null,
      setLastSyncTime: (time) => set({ lastSyncTime: time }),

      // Loading states
      isRefreshing: false,
      setIsRefreshing: (refreshing) => set({ isRefreshing: refreshing }),
    }),
    {
      name: 'claude-analytics-storage',
      partialize: (state) => ({
        sidebarCollapsed: state.sidebarCollapsed,
        dateRange: state.dateRange,
        selectedProject: state.selectedProject,
        theme: state.theme,
      }),
    }
  )
);

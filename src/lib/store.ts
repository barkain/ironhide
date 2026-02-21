import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { DateRange } from '../types';

const MAX_COMPARISON_SESSIONS = 3;

export type PresetRange = '7d' | '30d' | '90d' | 'all' | 'custom';

interface AppState {
  // UI State
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleSidebar: () => void;

  // Date range filter
  dateRange: DateRange | null;
  setDateRange: (range: DateRange | null) => void;
  presetRange: PresetRange;
  setPresetRange: (preset: PresetRange) => void;

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

  // Session comparison selection
  selectedForComparison: string[];
  toggleSessionComparison: (sessionId: string) => void;
  clearComparison: () => void;
  setSelectedForComparison: (sessionIds: string[]) => void;
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
      presetRange: 'all',
      setPresetRange: (preset) => set({ presetRange: preset }),

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

      // Session comparison selection
      selectedForComparison: [],
      toggleSessionComparison: (sessionId) =>
        set((state) => {
          const isSelected = state.selectedForComparison.includes(sessionId);
          if (isSelected) {
            return {
              selectedForComparison: state.selectedForComparison.filter(
                (id) => id !== sessionId
              ),
            };
          }
          // Only add if under max limit
          if (state.selectedForComparison.length >= MAX_COMPARISON_SESSIONS) {
            return state;
          }
          return {
            selectedForComparison: [...state.selectedForComparison, sessionId],
          };
        }),
      clearComparison: () => set({ selectedForComparison: [] }),
      setSelectedForComparison: (sessionIds) =>
        set({ selectedForComparison: sessionIds.slice(0, MAX_COMPARISON_SESSIONS) }),
    }),
    {
      name: 'ironhide-storage',
      partialize: (state) => ({
        sidebarCollapsed: state.sidebarCollapsed,
        dateRange: state.dateRange,
        presetRange: state.presetRange,
        selectedProject: state.selectedProject,
        theme: state.theme,
        selectedForComparison: state.selectedForComparison,
      }),
    }
  )
);

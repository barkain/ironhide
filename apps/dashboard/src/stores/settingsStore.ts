import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Time range options for filtering
 */
export type TimeRange = '1h' | '6h' | '24h' | '7d' | '30d' | 'all';

/**
 * Settings state interface
 */
interface SettingsState {
  // Display settings
  theme: 'light' | 'dark' | 'system';
  sidebarCollapsed: boolean;
  selectedTimeRange: TimeRange;

  // Real-time settings
  realTimeEnabled: boolean;
  autoRefreshInterval: number; // in seconds, 0 = disabled

  // Chart settings
  showTokenBreakdown: boolean;
  showCostBreakdown: boolean;

  // Actions
  setTheme: (theme: 'light' | 'dark' | 'system') => void;
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setTimeRange: (range: TimeRange) => void;
  setRealTimeEnabled: (enabled: boolean) => void;
  setAutoRefreshInterval: (interval: number) => void;
  setShowTokenBreakdown: (show: boolean) => void;
  setShowCostBreakdown: (show: boolean) => void;
  reset: () => void;
}

const initialState = {
  theme: 'system' as const,
  sidebarCollapsed: false,
  selectedTimeRange: 'all' as TimeRange,
  realTimeEnabled: true,
  autoRefreshInterval: 30,
  showTokenBreakdown: true,
  showCostBreakdown: true,
};

/**
 * Zustand store for settings with persistence
 */
export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      ...initialState,

      setTheme: (theme) => set({ theme }),

      toggleSidebar: () =>
        set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),

      setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),

      setTimeRange: (range) => set({ selectedTimeRange: range }),

      setRealTimeEnabled: (enabled) => set({ realTimeEnabled: enabled }),

      setAutoRefreshInterval: (interval) => set({ autoRefreshInterval: interval }),

      setShowTokenBreakdown: (show) => set({ showTokenBreakdown: show }),

      setShowCostBreakdown: (show) => set({ showCostBreakdown: show }),

      reset: () => set(initialState),
    }),
    {
      name: 'analytics-settings',
      partialize: (state) => ({
        theme: state.theme,
        sidebarCollapsed: state.sidebarCollapsed,
        selectedTimeRange: state.selectedTimeRange,
        realTimeEnabled: state.realTimeEnabled,
        autoRefreshInterval: state.autoRefreshInterval,
        showTokenBreakdown: state.showTokenBreakdown,
        showCostBreakdown: state.showCostBreakdown,
      }),
    }
  )
);

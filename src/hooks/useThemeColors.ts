import { useMemo } from 'react';
import { useAppStore } from '../lib/store';

/**
 * Returns resolved theme colour values that can be passed to Recharts and other
 * libraries needing raw colour strings (not CSS var() references).
 *
 * The hook re-computes when the Zustand `theme` value changes, ensuring charts
 * re-render with the correct palette after a theme toggle.
 */
export function useThemeColors() {
  const theme = useAppStore((s) => s.theme);

  return useMemo(() => {
    const isDark = theme === 'dark';
    return {
      background: isDark ? '#0f0f10' : '#f8f9fb',
      surface: isDark ? '#1a1a1c' : '#ffffff',
      border: isDark ? '#2a2a2e' : '#e2e4e9',
      textPrimary: isDark ? '#f3f4f6' : '#111827',
      textSecondary: isDark ? '#9ca3af' : '#4b5563',
      textTertiary: isDark ? '#6b7280' : '#6b7280',
      textMuted: isDark ? '#4b5563' : '#9ca3af',
      gridStroke: isDark ? '#2a2a2e' : '#e2e4e9',
      axisStroke: isDark ? '#6b7280' : '#9ca3af',
      tooltipBg: isDark ? '#1a1a1c' : '#ffffff',
      tooltipBorder: isDark ? '#2a2a2e' : '#e2e4e9',
      tooltipText: isDark ? '#ffffff' : '#111827',
    };
  }, [theme]);
}

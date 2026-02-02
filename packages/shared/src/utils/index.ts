/**
 * Utility exports for @analytics/shared
 */

// Date utilities
export {
  parseISODate,
  toDate,
  formatDate,
  toISOString,
  formatTime,
  formatDateOnly,
  formatDuration,
  formatRelativeTime,
  formatRelativeDate,
  calculateDuration,
  isWithinWindow,
  isSessionActive,
  TimeRanges,
  isDateBefore,
  isDateAfter,
  minDate,
  maxDate,
  groupByDate,
  groupByHour,
} from './dates.js';

export type { TimeRangeName } from './dates.js';

// Formatting utilities
export {
  formatNumber,
  formatDecimal,
  formatCompact,
  formatPercent,
  formatFractionAsPercent,
  formatTokens,
  formatTokensFull,
  formatCurrency,
  formatMicroCurrency,
  formatBytes,
  formatLinesChanged,
  formatNetLines,
  truncate,
  truncateMiddle,
  formatPath,
  getFilename,
  getExtension,
  formatList,
} from './formatting.js';

// LRU Cache
export { LRUCache } from './LRUCache.js';

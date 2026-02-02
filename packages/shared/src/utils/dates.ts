/**
 * Date utilities using date-fns
 */

import {
  format,
  formatDistance,
  formatRelative,
  differenceInMilliseconds,
  differenceInSeconds,
  differenceInMinutes,
  differenceInHours,
  differenceInDays,
  parseISO,
  isValid,
  isBefore,
  isAfter,
  subMinutes,
  subHours,
  subDays,
  addMilliseconds,
} from 'date-fns';

// ============================================================================
// Parsing
// ============================================================================

/**
 * Parse an ISO date string to a Date object
 *
 * @param dateString - ISO-8601 formatted date string
 * @returns Date object or null if invalid
 */
export function parseISODate(dateString: string): Date | null {
  try {
    const date = parseISO(dateString);
    return isValid(date) ? date : null;
  } catch {
    return null;
  }
}

/**
 * Safely parse a date from various formats
 *
 * @param value - Date, string, or number (timestamp)
 * @returns Date object or null if invalid
 */
export function toDate(value: Date | string | number): Date | null {
  if (value instanceof Date) {
    return isValid(value) ? value : null;
  }
  if (typeof value === 'string') {
    return parseISODate(value);
  }
  if (typeof value === 'number') {
    const date = new Date(value);
    return isValid(date) ? date : null;
  }
  return null;
}

// ============================================================================
// Formatting
// ============================================================================

/**
 * Format a date for display
 *
 * @param date - Date to format
 * @param pattern - Format pattern (default: 'MMM d, yyyy HH:mm:ss')
 * @returns Formatted date string
 */
export function formatDate(
  date: Date,
  pattern: string = 'MMM d, yyyy HH:mm:ss'
): string {
  return format(date, pattern);
}

/**
 * Format a date as ISO string
 *
 * @param date - Date to format
 * @returns ISO-8601 formatted string
 */
export function toISOString(date: Date): string {
  return date.toISOString();
}

/**
 * Format a date as time only
 *
 * @param date - Date to format
 * @returns Time string (HH:mm:ss)
 */
export function formatTime(date: Date): string {
  return format(date, 'HH:mm:ss');
}

/**
 * Format a date as date only
 *
 * @param date - Date to format
 * @returns Date string (yyyy-MM-dd)
 */
export function formatDateOnly(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

/**
 * Format a duration in human-readable form
 *
 * @param durationMs - Duration in milliseconds
 * @returns Human-readable duration string
 */
export function formatDuration(durationMs: number): string {
  if (durationMs < 1000) {
    return `${Math.round(durationMs)}ms`;
  }
  if (durationMs < 60000) {
    return `${(durationMs / 1000).toFixed(1)}s`;
  }
  if (durationMs < 3600000) {
    const minutes = Math.floor(durationMs / 60000);
    const seconds = Math.round((durationMs % 60000) / 1000);
    return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
  }

  const hours = Math.floor(durationMs / 3600000);
  const minutes = Math.round((durationMs % 3600000) / 60000);
  return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
}

/**
 * Format a relative time (e.g., "5 minutes ago")
 *
 * @param date - Date to format
 * @param baseDate - Base date for comparison (default: now)
 * @returns Relative time string
 */
export function formatRelativeTime(
  date: Date,
  baseDate: Date = new Date()
): string {
  return formatDistance(date, baseDate, { addSuffix: true });
}

/**
 * Format a relative date with context (e.g., "yesterday at 2:00 PM")
 *
 * @param date - Date to format
 * @param baseDate - Base date for comparison (default: now)
 * @returns Relative date string
 */
export function formatRelativeDate(
  date: Date,
  baseDate: Date = new Date()
): string {
  return formatRelative(date, baseDate);
}

// ============================================================================
// Calculations
// ============================================================================

/**
 * Calculate duration between two dates
 *
 * @param start - Start date
 * @param end - End date
 * @returns Duration in milliseconds
 */
export function calculateDuration(start: Date, end: Date): number {
  return differenceInMilliseconds(end, start);
}

/**
 * Check if a date is within a time window
 *
 * @param date - Date to check
 * @param windowMs - Time window in milliseconds
 * @param baseDate - Base date (default: now)
 * @returns True if date is within window
 */
export function isWithinWindow(
  date: Date,
  windowMs: number,
  baseDate: Date = new Date()
): boolean {
  const threshold = addMilliseconds(baseDate, -windowMs);
  return isAfter(date, threshold) || date.getTime() === threshold.getTime();
}

/**
 * Check if a session is considered active (activity within last N minutes)
 *
 * @param lastActivityAt - Last activity timestamp
 * @param activeThresholdMinutes - Threshold in minutes (default: 5)
 * @returns True if session is active
 */
export function isSessionActive(
  lastActivityAt: Date,
  activeThresholdMinutes: number = 5
): boolean {
  const threshold = subMinutes(new Date(), activeThresholdMinutes);
  return isAfter(lastActivityAt, threshold);
}

/**
 * Get time ranges for filtering
 */
export const TimeRanges = {
  last5Minutes: () => subMinutes(new Date(), 5),
  last15Minutes: () => subMinutes(new Date(), 15),
  last30Minutes: () => subMinutes(new Date(), 30),
  lastHour: () => subHours(new Date(), 1),
  last4Hours: () => subHours(new Date(), 4),
  last24Hours: () => subHours(new Date(), 24),
  lastWeek: () => subDays(new Date(), 7),
  lastMonth: () => subDays(new Date(), 30),
} as const;

/**
 * Get time range name
 */
export type TimeRangeName = keyof typeof TimeRanges;

// ============================================================================
// Comparisons
// ============================================================================

/**
 * Check if date A is before date B
 */
export function isDateBefore(dateA: Date, dateB: Date): boolean {
  return isBefore(dateA, dateB);
}

/**
 * Check if date A is after date B
 */
export function isDateAfter(dateA: Date, dateB: Date): boolean {
  return isAfter(dateA, dateB);
}

/**
 * Get the earlier of two dates
 */
export function minDate(dateA: Date, dateB: Date): Date {
  return isBefore(dateA, dateB) ? dateA : dateB;
}

/**
 * Get the later of two dates
 */
export function maxDate(dateA: Date, dateB: Date): Date {
  return isAfter(dateA, dateB) ? dateA : dateB;
}

// ============================================================================
// Grouping
// ============================================================================

/**
 * Group items by date (day)
 *
 * @param items - Items with date property
 * @param getDate - Function to extract date from item
 * @returns Map of date string to items
 */
export function groupByDate<T>(
  items: T[],
  getDate: (item: T) => Date
): Map<string, T[]> {
  const groups = new Map<string, T[]>();

  for (const item of items) {
    const dateKey = formatDateOnly(getDate(item));
    const existing = groups.get(dateKey) ?? [];
    existing.push(item);
    groups.set(dateKey, existing);
  }

  return groups;
}

/**
 * Group items by hour
 *
 * @param items - Items with date property
 * @param getDate - Function to extract date from item
 * @returns Map of hour string to items
 */
export function groupByHour<T>(
  items: T[],
  getDate: (item: T) => Date
): Map<string, T[]> {
  const groups = new Map<string, T[]>();

  for (const item of items) {
    const hourKey = format(getDate(item), 'yyyy-MM-dd HH:00');
    const existing = groups.get(hourKey) ?? [];
    existing.push(item);
    groups.set(hourKey, existing);
  }

  return groups;
}

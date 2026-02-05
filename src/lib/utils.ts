import { clsx, type ClassValue } from 'clsx';
import { format, parseISO } from 'date-fns';

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

/**
 * Strip XML tags and clean up message content for display
 * Handles Claude Code notification tags like <task-notification>, etc.
 */
export function cleanMessageContent(message: string | null | undefined): string {
  if (!message) return '';

  // Remove XML tags completely
  let cleaned = message.replace(/<[^>]+>/g, '');

  // Remove common notification content patterns
  cleaned = cleaned.replace(/^\s*(summary|details|status|Agent\s+"[^"]+"\s+completed)\s*:?\s*/gmi, '');

  // Collapse multiple whitespace/newlines into single space
  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  return cleaned;
}

/**
 * Get a short preview of a message, cleaned and truncated
 */
export function getMessagePreview(message: string | null | undefined, maxLength: number = 100): string {
  const cleaned = cleanMessageContent(message);
  if (cleaned.length <= maxLength) return cleaned;
  return cleaned.slice(0, maxLength).trim() + '...';
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(value);
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US').format(value);
}

export function formatCompactNumber(value: number): string {
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    compactDisplay: 'short',
  }).format(value);
}

export function formatDate(dateString: string): string {
  // Handle YYYYMMDD format (e.g., "20251101")
  if (/^\d{8}$/.test(dateString)) {
    const year = dateString.slice(0, 4);
    const month = dateString.slice(4, 6);
    const day = dateString.slice(6, 8);
    const date = new Date(`${year}-${month}-${day}`);
    return format(date, 'MMM d, yyyy');
  }

  // Handle ISO format
  try {
    const date = parseISO(dateString);
    return format(date, 'MMM d, yyyy');
  } catch {
    // Fallback to Intl
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(date);
  }
}

export function formatDateTime(dateString: string): string {
  // Handle YYYYMMDD format (e.g., "20251101")
  if (/^\d{8}$/.test(dateString)) {
    const year = dateString.slice(0, 4);
    const month = dateString.slice(4, 6);
    const day = dateString.slice(6, 8);
    const date = new Date(`${year}-${month}-${day}`);
    return format(date, 'MMM d, yyyy');
  }

  // Handle ISO format
  try {
    const date = parseISO(dateString);
    return format(date, 'MMM d, yyyy, h:mm a');
  } catch {
    // Fallback to Intl
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(date);
  }
}

export function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffDays > 7) {
    return formatDate(dateString);
  } else if (diffDays > 0) {
    return `${diffDays}d ago`;
  } else if (diffHours > 0) {
    return `${diffHours}h ago`;
  } else if (diffMinutes > 0) {
    return `${diffMinutes}m ago`;
  } else {
    return 'just now';
  }
}

export function formatDuration(seconds: number | null): string {
  if (seconds === null) return '-';

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  } else {
    return `${secs}s`;
  }
}

export function formatTokens(tokens: number): string {
  return formatCompactNumber(tokens);
}

export function getProjectName(projectPath: string): string {
  const parts = projectPath.split('/');
  return parts[parts.length - 1] || projectPath;
}

export function calculateCacheHitRate(cacheRead: number, _cacheWrite: number, totalInput: number): number {
  if (totalInput === 0) return 0;
  return (cacheRead / totalInput) * 100;
}

// Date helpers
export function getDateRangePresets(): { label: string; range: { start: string; end: string } }[] {
  const now = new Date();
  const today = now.toISOString().split('T')[0];

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);

  const weekAgo = new Date(now);
  weekAgo.setDate(weekAgo.getDate() - 7);

  const monthAgo = new Date(now);
  monthAgo.setMonth(monthAgo.getMonth() - 1);

  return [
    { label: 'Today', range: { start: today, end: today } },
    { label: 'Last 7 days', range: { start: weekAgo.toISOString().split('T')[0], end: today } },
    { label: 'Last 30 days', range: { start: monthAgo.toISOString().split('T')[0], end: today } },
  ];
}

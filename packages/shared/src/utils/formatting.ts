/**
 * Number and currency formatting utilities
 */

// ============================================================================
// Number Formatting
// ============================================================================

/**
 * Format a number with thousands separators
 *
 * @param value - Number to format
 * @param locale - Locale for formatting (default: 'en-US')
 * @returns Formatted number string
 */
export function formatNumber(value: number, locale: string = 'en-US'): string {
  return new Intl.NumberFormat(locale).format(value);
}

/**
 * Format a number with specified decimal places
 *
 * @param value - Number to format
 * @param decimals - Number of decimal places
 * @param locale - Locale for formatting (default: 'en-US')
 * @returns Formatted number string
 */
export function formatDecimal(
  value: number,
  decimals: number = 2,
  locale: string = 'en-US'
): string {
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

/**
 * Format a large number in compact form (e.g., 1.2K, 3.4M)
 *
 * @param value - Number to format
 * @param locale - Locale for formatting (default: 'en-US')
 * @returns Compact formatted string
 */
export function formatCompact(value: number, locale: string = 'en-US'): string {
  return new Intl.NumberFormat(locale, {
    notation: 'compact',
    compactDisplay: 'short',
  }).format(value);
}

/**
 * Format a number as a percentage
 *
 * @param value - Number to format (0-100 scale)
 * @param decimals - Number of decimal places (default: 1)
 * @returns Formatted percentage string
 */
export function formatPercent(value: number, decimals: number = 1): string {
  return `${value.toFixed(decimals)}%`;
}

/**
 * Format a number as a fraction percentage
 *
 * @param value - Decimal value (0-1 scale)
 * @param decimals - Number of decimal places (default: 1)
 * @returns Formatted percentage string
 */
export function formatFractionAsPercent(
  value: number,
  decimals: number = 1
): string {
  return formatPercent(value * 100, decimals);
}

// ============================================================================
// Token Formatting
// ============================================================================

/**
 * Format token count for display
 *
 * @param tokens - Number of tokens
 * @returns Formatted token string
 */
export function formatTokens(tokens: number): string {
  if (tokens < 1000) {
    return tokens.toString();
  }
  if (tokens < 1_000_000) {
    return `${(tokens / 1000).toFixed(1)}K`;
  }
  return `${(tokens / 1_000_000).toFixed(2)}M`;
}

/**
 * Format token count with full number
 *
 * @param tokens - Number of tokens
 * @returns Formatted token string with full number
 */
export function formatTokensFull(tokens: number): string {
  return `${formatNumber(tokens)} tokens`;
}

// ============================================================================
// Currency Formatting
// ============================================================================

/**
 * Format currency value
 *
 * @param value - Currency amount
 * @param currency - Currency code (default: 'USD')
 * @param locale - Locale for formatting (default: 'en-US')
 * @returns Formatted currency string
 */
export function formatCurrency(
  value: number,
  currency: string = 'USD',
  locale: string = 'en-US'
): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

/**
 * Format a small currency value (for token costs)
 *
 * @param value - Currency amount
 * @param currency - Currency code (default: 'USD')
 * @param locale - Locale for formatting (default: 'en-US')
 * @returns Formatted currency string with more decimal places
 */
export function formatMicroCurrency(
  value: number,
  currency: string = 'USD',
  locale: string = 'en-US'
): string {
  // Determine appropriate decimal places based on value
  let minDecimals = 2;
  let maxDecimals = 2;

  if (value > 0 && value < 0.01) {
    minDecimals = 4;
    maxDecimals = 6;
  } else if (value > 0 && value < 1) {
    minDecimals = 4;
    maxDecimals = 4;
  }

  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: minDecimals,
    maximumFractionDigits: maxDecimals,
  }).format(value);
}

// ============================================================================
// File Size Formatting
// ============================================================================

/**
 * Format bytes as human-readable file size
 *
 * @param bytes - Number of bytes
 * @param decimals - Number of decimal places (default: 2)
 * @returns Formatted file size string
 */
export function formatBytes(bytes: number, decimals: number = 2): string {
  if (bytes === 0) return '0 B';

  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(decimals))} ${sizes[i]}`;
}

// ============================================================================
// Lines of Code Formatting
// ============================================================================

/**
 * Format lines changed with +/- notation
 *
 * @param added - Lines added
 * @param removed - Lines removed
 * @returns Formatted lines changed string
 */
export function formatLinesChanged(added: number, removed: number): string {
  const parts: string[] = [];

  if (added > 0) {
    parts.push(`+${formatNumber(added)}`);
  }
  if (removed > 0) {
    parts.push(`-${formatNumber(removed)}`);
  }

  return parts.length > 0 ? parts.join(' / ') : '0';
}

/**
 * Format net lines changed
 *
 * @param net - Net lines changed (positive or negative)
 * @returns Formatted net lines string
 */
export function formatNetLines(net: number): string {
  if (net === 0) return '0';
  return net > 0 ? `+${formatNumber(net)}` : formatNumber(net);
}

// ============================================================================
// Truncation
// ============================================================================

/**
 * Truncate a string to a maximum length
 *
 * @param str - String to truncate
 * @param maxLength - Maximum length
 * @param suffix - Suffix to append when truncated (default: '...')
 * @returns Truncated string
 */
export function truncate(
  str: string,
  maxLength: number,
  suffix: string = '...'
): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - suffix.length) + suffix;
}

/**
 * Truncate a string in the middle
 *
 * @param str - String to truncate
 * @param maxLength - Maximum length
 * @param separator - Separator to use (default: '...')
 * @returns Truncated string with middle portion removed
 */
export function truncateMiddle(
  str: string,
  maxLength: number,
  separator: string = '...'
): string {
  if (str.length <= maxLength) return str;

  const charsToShow = maxLength - separator.length;
  const frontChars = Math.ceil(charsToShow / 2);
  const backChars = Math.floor(charsToShow / 2);

  return str.slice(0, frontChars) + separator + str.slice(-backChars);
}

// ============================================================================
// Path Formatting
// ============================================================================

/**
 * Format a file path for display (shorten home directory)
 *
 * @param path - Full file path
 * @param homeDir - Home directory path to replace
 * @returns Formatted path with ~ for home directory
 */
export function formatPath(path: string, homeDir?: string): string {
  if (homeDir && path.startsWith(homeDir)) {
    return '~' + path.slice(homeDir.length);
  }
  return path;
}

/**
 * Extract filename from path
 *
 * @param path - File path
 * @returns Filename
 */
export function getFilename(path: string): string {
  const parts = path.split(/[/\\]/);
  return parts[parts.length - 1] ?? path;
}

/**
 * Extract file extension from path
 *
 * @param path - File path
 * @returns File extension (without dot) or empty string
 */
export function getExtension(path: string): string {
  const filename = getFilename(path);
  const dotIndex = filename.lastIndexOf('.');
  return dotIndex > 0 ? filename.slice(dotIndex + 1) : '';
}

// ============================================================================
// List Formatting
// ============================================================================

/**
 * Format a list of items as a readable string
 *
 * @param items - List of items
 * @param maxItems - Maximum items to show before truncating
 * @param conjunction - Conjunction to use (default: 'and')
 * @returns Formatted list string
 */
export function formatList(
  items: string[],
  maxItems: number = 3,
  conjunction: string = 'and'
): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0]!;
  if (items.length === 2) return `${items[0]} ${conjunction} ${items[1]}`;

  if (items.length <= maxItems) {
    const allButLast = items.slice(0, -1).join(', ');
    return `${allButLast}, ${conjunction} ${items[items.length - 1]}`;
  }

  const shown = items.slice(0, maxItems);
  const remaining = items.length - maxItems;
  return `${shown.join(', ')}, ${conjunction} ${remaining} more`;
}

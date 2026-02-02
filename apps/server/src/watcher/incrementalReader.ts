/**
 * Byte-offset tracking for incremental JSONL file reads
 */

import { createReadStream, stat } from 'node:fs';
import { promisify } from 'node:util';
import { createInterface } from 'node:readline';

const statAsync = promisify(stat);

/**
 * Tracks read offsets for files
 */
interface FileOffset {
  /** Last read byte position */
  offset: number;
  /** Last modification time */
  mtime: number;
}

/**
 * Incremental file reader with byte offset tracking
 */
class IncrementalReader {
  private offsets: Map<string, FileOffset> = new Map();

  /**
   * Get current offset for a file
   */
  getOffset(filePath: string): number {
    return this.offsets.get(filePath)?.offset ?? 0;
  }

  /**
   * Set offset for a file
   */
  setOffset(filePath: string, offset: number, mtime: number): void {
    this.offsets.set(filePath, { offset, mtime });
  }

  /**
   * Check if file has been modified since last read
   */
  async hasChanged(filePath: string): Promise<boolean> {
    try {
      const stats = await statAsync(filePath);
      const current = this.offsets.get(filePath);

      if (!current) return true;

      return (
        stats.mtimeMs !== current.mtime || stats.size > current.offset
      );
    } catch {
      return false;
    }
  }

  /**
   * Read new lines from a file starting from last offset
   * Returns the new lines and updates the offset
   */
  async readNewLines(filePath: string): Promise<string[]> {
    const lines: string[] = [];

    try {
      const stats = await statAsync(filePath);
      const currentOffset = this.getOffset(filePath);

      // No new data
      if (stats.size <= currentOffset) {
        return lines;
      }

      // File was truncated/replaced - read from beginning
      const startOffset = stats.size < currentOffset ? 0 : currentOffset;

      // Create read stream starting from offset
      const stream = createReadStream(filePath, {
        start: startOffset,
        encoding: 'utf8',
      });

      const rl = createInterface({
        input: stream,
        crlfDelay: Infinity,
      });

      for await (const line of rl) {
        if (line.trim()) {
          lines.push(line);
        }
      }

      // Update offset to end of file
      this.setOffset(filePath, stats.size, stats.mtimeMs);
    } catch (error) {
      // File might have been deleted or is inaccessible
      console.error(`Error reading file ${filePath}:`, error);
    }

    return lines;
  }

  /**
   * Read entire file from beginning
   */
  async readAllLines(filePath: string): Promise<string[]> {
    const lines: string[] = [];

    try {
      const stats = await statAsync(filePath);
      const stream = createReadStream(filePath, { encoding: 'utf8' });

      const rl = createInterface({
        input: stream,
        crlfDelay: Infinity,
      });

      for await (const line of rl) {
        if (line.trim()) {
          lines.push(line);
        }
      }

      // Update offset to end of file
      this.setOffset(filePath, stats.size, stats.mtimeMs);
    } catch (error) {
      console.error(`Error reading file ${filePath}:`, error);
    }

    return lines;
  }

  /**
   * Reset offset for a file (for full re-read)
   */
  resetOffset(filePath: string): void {
    this.offsets.delete(filePath);
  }

  /**
   * Remove tracking for a file
   */
  removeFile(filePath: string): void {
    this.offsets.delete(filePath);
  }

  /**
   * Get all tracked files
   */
  getTrackedFiles(): string[] {
    return Array.from(this.offsets.keys());
  }

  /**
   * Clear all offsets
   */
  clear(): void {
    this.offsets.clear();
  }
}

/**
 * Singleton reader instance
 */
export const incrementalReader = new IncrementalReader();

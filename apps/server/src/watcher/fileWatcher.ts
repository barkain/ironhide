/**
 * Chokidar wrapper that watches Claude session JSONL files
 */

import chokidar from 'chokidar';
import type { FSWatcher } from 'chokidar';
import { storeEventEmitter } from '../store/eventEmitter.js';
import { incrementalReader } from './incrementalReader.js';
import {
  CLAUDE_SESSIONS_PATH,
  isValidSessionPath,
  extractSessionId,
} from '../config/paths.js';
import { SERVER_CONFIG } from '../config/index.js';
import { processFile } from '../parser/index.js';

/**
 * Debounce helper for file change events
 */
function debounce<T extends (...args: unknown[]) => void>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: NodeJS.Timeout | null = null;

  return (...args: Parameters<T>) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      fn(...args);
      timeoutId = null;
    }, delay);
  };
}

/**
 * File watcher for Claude Code session files
 */
class FileWatcher {
  private watcher: FSWatcher | null = null;
  private isWatching = false;
  private pendingFiles: Set<string> = new Set();
  private processingDebounced: Map<string, () => void> = new Map();

  /**
   * Start watching for JSONL file changes
   * Note: Chokidar v4 has issues with glob patterns, so we watch the directory
   * and filter by extension in the event handlers instead.
   */
  async start(): Promise<void> {
    if (this.isWatching) {
      console.log('File watcher already running');
      return;
    }

    // Watch the directory instead of using glob (chokidar v4 glob issues)
    const watchPath = CLAUDE_SESSIONS_PATH;
    console.log(`Starting file watcher on directory: ${watchPath}`);

    let filesFound = 0;

    this.watcher = chokidar.watch(watchPath, {
      persistent: true,
      ignoreInitial: true, // Only watch for new changes, load existing data lazily on demand
      awaitWriteFinish: {
        stabilityThreshold: SERVER_CONFIG.watcherDebounceMs,
        pollInterval: 50,
      },
      usePolling: false,
      depth: 10, // Support nested directories
    });

    this.watcher
      .on('add', (filePath) => {
        // Filter for .jsonl files only
        if (!filePath.endsWith('.jsonl')) return;
        filesFound++;
        this.handleFileAdd(filePath);
      })
      .on('change', (filePath) => {
        if (!filePath.endsWith('.jsonl')) return;
        this.handleFileChange(filePath);
      })
      .on('unlink', (filePath) => {
        if (!filePath.endsWith('.jsonl')) return;
        this.handleFileUnlink(filePath);
      })
      .on('error', (error) => this.handleError(error))
      .on('ready', () => {
        console.log(`File watcher ready. Found ${filesFound} JSONL files on initial scan.`);
        this.isWatching = true;
      });
  }

  /**
   * Stop watching
   */
  async stop(): Promise<void> {
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
      this.isWatching = false;
      this.pendingFiles.clear();
      this.processingDebounced.clear();
      console.log('File watcher stopped');
    }
  }

  /**
   * Handle new file added
   */
  private handleFileAdd(filePath: string): void {
    if (!this.isValidFile(filePath)) return;

    const sessionId = extractSessionId(filePath);
    if (!sessionId) return;

    console.log(`File added: ${filePath} (session: ${sessionId})`);
    storeEventEmitter.emit('file:added', { filePath, sessionId });

    this.scheduleProcessing(filePath);
  }

  /**
   * Handle file changed
   */
  private handleFileChange(filePath: string): void {
    if (!this.isValidFile(filePath)) return;

    const sessionId = extractSessionId(filePath);
    if (!sessionId) return;

    console.log(`File changed: ${filePath} (session: ${sessionId})`);
    storeEventEmitter.emit('file:changed', { filePath, sessionId });

    this.scheduleProcessing(filePath);
  }

  /**
   * Handle file removed
   */
  private handleFileUnlink(filePath: string): void {
    const sessionId = extractSessionId(filePath);
    if (!sessionId) return;

    console.log(`File removed: ${filePath} (session: ${sessionId})`);

    // Clean up debounce state to prevent memory leak
    this.processingDebounced.delete(filePath);
    this.pendingFiles.delete(filePath);

    incrementalReader.removeFile(filePath);
    storeEventEmitter.emit('file:removed', { filePath, sessionId });
  }

  /**
   * Handle watcher errors
   */
  private handleError(error: Error): void {
    console.error('File watcher error:', error);
  }

  /**
   * Validate file path
   */
  private isValidFile(filePath: string): boolean {
    if (!filePath.endsWith('.jsonl')) return false;
    if (!isValidSessionPath(filePath)) {
      console.warn(`Invalid file path (outside sessions directory): ${filePath}`);
      return false;
    }
    return true;
  }

  /**
   * Schedule file processing with debounce
   */
  private scheduleProcessing(filePath: string): void {
    this.pendingFiles.add(filePath);

    let debouncedFn = this.processingDebounced.get(filePath);
    if (!debouncedFn) {
      debouncedFn = debounce(() => {
        this.processFile(filePath);
      }, SERVER_CONFIG.watcherDebounceMs);
      this.processingDebounced.set(filePath, debouncedFn);
    }

    debouncedFn();
  }

  /**
   * Process a file
   */
  private async processFile(filePath: string): Promise<void> {
    this.pendingFiles.delete(filePath);

    try {
      await processFile(filePath);
    } catch (error) {
      console.error(`Error processing file ${filePath}:`, error);
    }
  }

  /**
   * Check if watcher is running
   */
  get isRunning(): boolean {
    return this.isWatching;
  }

  /**
   * Get watched files
   */
  getWatchedFiles(): string[] {
    if (!this.watcher) return [];
    const watched = this.watcher.getWatched();
    const files: string[] = [];
    for (const [dir, items] of Object.entries(watched)) {
      for (const item of items) {
        if (item.endsWith('.jsonl')) {
          files.push(`${dir}/${item}`);
        }
      }
    }
    return files;
  }
}

/**
 * Singleton watcher instance
 */
export const fileWatcher = new FileWatcher();

/**
 * LRU (Least Recently Used) Cache implementation
 *
 * Uses JavaScript's Map which maintains insertion order.
 * Most recently used items are moved to the end of the Map.
 * When capacity is reached, the first item (least recently used) is evicted.
 */

/**
 * A generic LRU cache with configurable maximum size.
 *
 * @typeParam K - The type of keys in the cache
 * @typeParam V - The type of values in the cache
 *
 * @example
 * ```typescript
 * const cache = new LRUCache<string, number>(3);
 * cache.set('a', 1);
 * cache.set('b', 2);
 * cache.set('c', 3);
 * cache.get('a'); // Returns 1, marks 'a' as most recently used
 * cache.set('d', 4); // Evicts 'b' (least recently used)
 * ```
 */
export class LRUCache<K, V> {
  private readonly cache: Map<K, V>;
  private readonly maxSize: number;

  /**
   * Creates a new LRU cache with the specified maximum size.
   *
   * @param maxSize - Maximum number of entries the cache can hold.
   *                  Must be a positive integer.
   * @throws {Error} If maxSize is not a positive integer.
   */
  constructor(maxSize: number) {
    if (!Number.isInteger(maxSize) || maxSize <= 0) {
      throw new Error('maxSize must be a positive integer');
    }
    this.maxSize = maxSize;
    this.cache = new Map<K, V>();
  }

  /**
   * Gets a value from the cache and marks it as recently used.
   *
   * @param key - The key to look up
   * @returns The value if found, undefined otherwise
   */
  get(key: K): V | undefined {
    if (!this.cache.has(key)) {
      return undefined;
    }

    // Move to end (most recently used)
    const value = this.cache.get(key)!;
    this.cache.delete(key);
    this.cache.set(key, value);

    return value;
  }

  /**
   * Adds or updates an entry in the cache.
   * If the cache is at capacity, the least recently used entry is evicted.
   *
   * @param key - The key to set
   * @param value - The value to associate with the key
   */
  set(key: K, value: V): void {
    // If key exists, delete it first (to update position)
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      // Evict the least recently used (first item in Map)
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }

    this.cache.set(key, value);
  }

  /**
   * Checks if a key exists in the cache without affecting LRU order.
   *
   * @param key - The key to check
   * @returns true if the key exists, false otherwise
   */
  has(key: K): boolean {
    return this.cache.has(key);
  }

  /**
   * Removes an entry from the cache.
   *
   * @param key - The key to remove
   * @returns true if the entry was removed, false if it didn't exist
   */
  delete(key: K): boolean {
    return this.cache.delete(key);
  }

  /**
   * Removes all entries from the cache.
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Returns the current number of entries in the cache.
   */
  get size(): number {
    return this.cache.size;
  }

  /**
   * Returns an iterator over the keys in the cache,
   * from most recently used to least recently used.
   */
  *keys(): IterableIterator<K> {
    // Map iterates in insertion order (oldest first)
    // We want most recent first, so we need to reverse
    const keysArray = Array.from(this.cache.keys());
    for (let i = keysArray.length - 1; i >= 0; i--) {
      yield keysArray[i];
    }
  }

  /**
   * Returns an iterator over the values in the cache,
   * from most recently used to least recently used.
   */
  *values(): IterableIterator<V> {
    const valuesArray = Array.from(this.cache.values());
    for (let i = valuesArray.length - 1; i >= 0; i--) {
      yield valuesArray[i];
    }
  }

  /**
   * Returns an iterator over the entries in the cache,
   * from most recently used to least recently used.
   */
  *entries(): IterableIterator<[K, V]> {
    const entriesArray = Array.from(this.cache.entries());
    for (let i = entriesArray.length - 1; i >= 0; i--) {
      yield entriesArray[i];
    }
  }
}

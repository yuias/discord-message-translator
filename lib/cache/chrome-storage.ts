import { ITranslationStorage } from './types';
import { TranslationCacheEntry } from '@/types/cache';

const CACHE_PREFIX = 'cache_';
const MAX_STORAGE_BYTES = 10 * 1024 * 1024; // 10MB
const CLEANUP_THRESHOLD = 0.8; // Automatic cleanup at 80%
const CLEANUP_TARGET = 0.6; // Reduce to 60%

export class ChromeStorageCache implements ITranslationStorage {
  private async getTTLDays(): Promise<number> {
    const settings = await chrome.storage.sync.get<{ cacheTTLDays?: number }>(['cacheTTLDays']);
    return settings.cacheTTLDays || 7;
  }

  async get(messageId: string): Promise<TranslationCacheEntry | null> {
    const result = await chrome.storage.local.get<Partial<Record<string, TranslationCacheEntry>>>(
      [`${CACHE_PREFIX}${messageId}`],
    );
    const entry = result[`${CACHE_PREFIX}${messageId}`];

    if (!entry) return null;

    // TTL check
    const ttlMs = (await this.getTTLDays()) * 24 * 60 * 60 * 1000;
    if (Date.now() - entry.timestamp > ttlMs) {
      await this.delete(messageId);
      return null;
    }

    return entry;
  }

  async set(messageId: string, entry: TranslationCacheEntry): Promise<void> {
    // Check storage capacity and cleanup if necessary
    await this.ensureStorageSpace();

    await chrome.storage.local.set({ [`${CACHE_PREFIX}${messageId}`]: entry });
  }

  async delete(messageId: string): Promise<void> {
    await chrome.storage.local.remove([`${CACHE_PREFIX}${messageId}`]);
  }

  async clear(): Promise<void> {
    const allData = await chrome.storage.local.get(null);
    const cacheKeys = Object.keys(allData).filter(key => key.startsWith(CACHE_PREFIX));
    await chrome.storage.local.remove(cacheKeys);
  }

  async getAllEntries(): Promise<Map<string, TranslationCacheEntry>> {
    const allData = await chrome.storage.local.get(null);
    const entries = new Map<string, TranslationCacheEntry>();

    for (const [key, value] of Object.entries(allData)) {
      if (key.startsWith(CACHE_PREFIX)) {
        const messageId = key.slice(CACHE_PREFIX.length);
        entries.set(messageId, value as TranslationCacheEntry);
      }
    }

    return entries;
  }

  async cleanupExpired(): Promise<void> {
    const ttlMs = (await this.getTTLDays()) * 24 * 60 * 60 * 1000;
    const cutoffTime = Date.now() - ttlMs;

    const entries = await this.getAllEntries();
    const expiredKeys: string[] = [];

    for (const [messageId, entry] of entries) {
      if (entry.timestamp < cutoffTime) {
        expiredKeys.push(`${CACHE_PREFIX}${messageId}`);
      }
    }

    if (expiredKeys.length > 0) {
      await chrome.storage.local.remove(expiredKeys);
    }
  }

  /**
   * Check storage capacity and delete old entries if necessary
   */
  private async ensureStorageSpace(): Promise<void> {
    const bytesInUse = await chrome.storage.local.getBytesInUse(null);

    // If exceeds 80%, delete old entries to reduce to 60%
    if (bytesInUse > MAX_STORAGE_BYTES * CLEANUP_THRESHOLD) {
      await this.cleanupOldEntries(MAX_STORAGE_BYTES * CLEANUP_TARGET);
    }
  }

  /**
   * Delete entries in order of oldest timestamp to reduce to target size
   */
  private async cleanupOldEntries(targetBytes: number): Promise<void> {
    const entries = await this.getAllEntries();

    // Sort by oldest timestamp
    const sortedEntries = Array.from(entries.entries()).sort(
      ([, a], [, b]) => a.timestamp - b.timestamp
    );

    const toDelete: string[] = [];
    let currentBytes = await chrome.storage.local.getBytesInUse(null);

    for (const [messageId] of sortedEntries) {
      if (currentBytes <= targetBytes) break;

      const key = `${CACHE_PREFIX}${messageId}`;
      toDelete.push(key);

      // Estimate size of key to be deleted (approximate)
      const entrySize = await chrome.storage.local.getBytesInUse([key]);
      currentBytes -= entrySize;
    }

    if (toDelete.length > 0) {
      await chrome.storage.local.remove(toDelete);
      console.log(`[Cache] Cleaned up ${toDelete.length} old entries`);
    }
  }

  /**
   * Get cache statistics including usage and expired entry count
   */
  async getStats(): Promise<import('./types').CacheStats> {
    const entries = await this.getAllEntries();
    const bytesInUse = await chrome.storage.local.getBytesInUse(null);
    const usagePercent = Math.round((bytesInUse / MAX_STORAGE_BYTES) * 100);

    // Count expired entries
    const ttlMs = (await this.getTTLDays()) * 24 * 60 * 60 * 1000;
    const cutoffTime = Date.now() - ttlMs;
    let expiredCount = 0;

    for (const [, entry] of entries) {
      if (entry.timestamp < cutoffTime) {
        expiredCount++;
      }
    }

    return {
      entryCount: entries.size,
      bytesInUse,
      maxBytes: MAX_STORAGE_BYTES,
      usagePercent,
      expiredCount,
    };
  }
}

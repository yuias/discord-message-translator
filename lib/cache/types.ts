import { TranslationCacheEntry } from '@/types/cache';

/**
 * Cache statistics information
 */
export interface CacheStats {
  /** Number of cached entries */
  entryCount: number;
  /** Storage space used in bytes */
  bytesInUse: number;
  /** Maximum storage capacity in bytes */
  maxBytes: number;
  /** Storage usage percentage (0-100) */
  usagePercent: number;
  /** Number of expired entries */
  expiredCount: number;
}

export interface ITranslationStorage {
  get(messageId: string): Promise<TranslationCacheEntry | null>;
  set(messageId: string, entry: TranslationCacheEntry): Promise<void>;
  delete(messageId: string): Promise<void>;
  clear(): Promise<void>;
  cleanupExpired(): Promise<void>;
  getAllEntries(): Promise<Map<string, TranslationCacheEntry>>;
  getStats(): Promise<CacheStats>;
}

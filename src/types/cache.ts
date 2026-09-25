export interface TranslationCacheEntry {
  translations: {
    [targetLanguage: string]: string; // e.g., { "ja": "こんにちは", "de": "Guten Tag" }
  };
  timestamp: number; // Unix timestamp (milliseconds)
}

export interface CacheSettings {
  ttlDays: number; // Default: 7 days
}

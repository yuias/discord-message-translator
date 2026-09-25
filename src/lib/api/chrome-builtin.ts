/// <reference types="@types/dom-chromium-ai" />

import { ChromeLanguageDetector } from './chrome-language-detector';
import { isSameLanguage } from '@/lib/utils/language';

export type AvailabilityStatus = 'unavailable' | 'downloadable' | 'downloading' | 'available';

/**
 * Chrome Built-in Translator API client
 * Requires Chrome 138+ with Translator API enabled
 * https://developer.chrome.com/docs/ai/translator-api
 */
export class ChromeBuiltinTranslator {
  // Stores the create() promise (not the resolved Translator) so concurrent
  // callers for the same pair share one Translator.create() call.
  private translatorCache: Map<string, Promise<Translator>> = new Map();
  private availabilityCache: Map<string, AvailabilityStatus> = new Map();
  // Memoized so concurrent detectSource() calls share one init attempt and a
  // failure is only logged once, instead of once per text in the batch.
  private detectorPromise: Promise<ChromeLanguageDetector | null> | null = null;
  // Set once a detect() call fails after a successful init, so later texts
  // skip the detector instead of hitting the same failure again.
  private detectorBroken = false;
  // Pairs we already warned about, so a run of many messages logs once.
  private warnedPairs: Set<string> = new Set();

  /**
   * Check if the Chrome Translator API is available in the current browser
   */
  static isAvailable(): boolean {
    return 'Translator' in globalThis;
  }

  /**
   * Check the availability status for a specific language pair
   * @returns Availability status: 'unavailable' | 'downloadable' | 'downloading' | 'available'
   */
  static async checkLanguagePair(
    sourceLanguage: string,
    targetLanguage: string
  ): Promise<AvailabilityStatus> {
    if (!ChromeBuiltinTranslator.isAvailable()) {
      return 'unavailable';
    }

    try {
      const status = await Translator.availability({
        sourceLanguage: ChromeBuiltinTranslator.normalizeLanguageCode(sourceLanguage),
        targetLanguage: ChromeBuiltinTranslator.normalizeLanguageCode(targetLanguage),
      });
      return status as AvailabilityStatus;
    } catch (error) {
      console.error('[ChromeBuiltinTranslator] Error checking language pair:', error);
      return 'unavailable';
    }
  }

  /**
   * Normalize language codes for Chrome Translator API
   * Chrome uses BCP 47 language tags
   */
  private static normalizeLanguageCode(code: string): string {
    const mapping: Record<string, string> = {
      'zh-CN': 'zh',
      'zh-TW': 'zh-Hant',
    };
    return mapping[code] ?? code.split('-')[0] ?? code;
  }

  /**
   * Lazily create the language detector shared by this translator instance,
   * gated on availability so we never attempt LanguageDetector.create() when
   * it is known to be unusable. Memoized (including the null/failure result)
   * so this only runs once per instance.
   */
  private getDetector(): Promise<ChromeLanguageDetector | null> {
    if (this.detectorBroken) {
      return Promise.resolve(null);
    }
    if (!this.detectorPromise) {
      this.detectorPromise = this.initDetector();
    }
    return this.detectorPromise;
  }

  private async initDetector(): Promise<ChromeLanguageDetector | null> {
    if (!ChromeLanguageDetector.isAvailable()) {
      return null;
    }

    try {
      const status = await ChromeLanguageDetector.checkAvailability();
      if (status !== 'available') {
        return null;
      }
      return new ChromeLanguageDetector();
    } catch (error) {
      console.error('[ChromeBuiltinTranslator] Failed to initialize language detector:', error);
      return null;
    }
  }

  /**
   * Detect the source language for one text. Falls back to 'en' (the old
   * fixed-source behavior) when detection is unavailable, throws, or is
   * inconclusive, since Discord's ambiguous short texts are mostly English.
   */
  private async detectSource(text: string): Promise<string> {
    const detector = await this.getDetector();
    if (!detector) {
      return 'en';
    }

    try {
      const detected = await detector.detectSourceLanguage(text);
      return detected ?? 'en';
    } catch (error) {
      if (!this.detectorBroken) {
        this.detectorBroken = true;
        console.error('[ChromeBuiltinTranslator] Language detection failed, disabling detection for the rest of this batch:', error);
      }
      return 'en';
    }
  }

  /**
   * Get or create a translator instance for the given normalized pair.
   * The cache holds the create() promise so concurrent requests for the
   * same pair await a single Translator.create() call.
   */
  private getTranslatorForPair(normalizedSource: string, normalizedTarget: string): Promise<Translator> {
    const cacheKey = `${normalizedSource}-${normalizedTarget}`;
    const cached = this.translatorCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const created = Translator.create({
      sourceLanguage: normalizedSource,
      targetLanguage: normalizedTarget,
    });
    // Drop the failed attempt so a later call can retry instead of reusing a rejected promise.
    // Only delete if this is still the entry we created: a concurrent retry may
    // already have replaced it by the time this rejection is observed.
    created.catch(() => {
      if (this.translatorCache.get(cacheKey) === created) {
        this.translatorCache.delete(cacheKey);
      }
    });
    this.translatorCache.set(cacheKey, created);
    return created;
  }

  /**
   * Check (and cache) availability for a normalized language pair, for the
   * lifetime of this instance.
   */
  private async getAvailability(normalizedSource: string, normalizedTarget: string): Promise<AvailabilityStatus> {
    const pairKey = `${normalizedSource}-${normalizedTarget}`;
    const cached = this.availabilityCache.get(pairKey);
    if (cached) {
      return cached;
    }

    try {
      const status = (await Translator.availability({
        sourceLanguage: normalizedSource,
        targetLanguage: normalizedTarget,
      })) as AvailabilityStatus;
      this.availabilityCache.set(pairKey, status);
      return status;
    } catch (error) {
      console.error('[ChromeBuiltinTranslator] Error checking availability:', error);
      // Don't cache a transient error as 'unavailable' forever; let a later call retry.
      return 'unavailable';
    }
  }

  /**
   * Translate one group of texts sharing a normalized source/target pair.
   * Writes results back into `results` at the original indices, falling
   * back to the original text on any per-pair or per-text failure.
   */
  private async translateGroup(
    groupTexts: string[],
    indices: number[],
    normalizedSource: string,
    normalizedTarget: string,
    results: string[]
  ): Promise<void> {
    const pairKey = `${normalizedSource}-${normalizedTarget}`;
    const fallbackToOriginals = () => {
      for (let j = 0; j < indices.length; j++) {
        const index = indices[j];
        const text = groupTexts[j];
        if (index === undefined || text === undefined) continue;
        results[index] = text;
      }
    };

    const availability = await this.getAvailability(normalizedSource, normalizedTarget);
    if (availability === 'unavailable') {
      fallbackToOriginals();
      return;
    }

    let translator: Translator;
    try {
      translator = await this.getTranslatorForPair(normalizedSource, normalizedTarget);
    } catch (error) {
      if (!this.warnedPairs.has(pairKey)) {
        this.warnedPairs.add(pairKey);
        console.warn(`[ChromeBuiltinTranslator] Failed to create translator for ${pairKey}:`, error);
      }
      fallbackToOriginals();
      return;
    }

    for (let j = 0; j < indices.length; j++) {
      const index = indices[j];
      const text = groupTexts[j];
      if (index === undefined || text === undefined) continue;

      try {
        results[index] = await translator.translate(text);
      } catch (error) {
        console.error(`[ChromeBuiltinTranslator] Translation failed for pair ${pairKey}:`, error);
        results[index] = text;
      }
    }
  }

  /**
   * Translate a single text
   */
  async translate(
    text: string,
    targetLanguage: string,
    sourceLanguage?: string
  ): Promise<string> {
    const [result] = await this.translateBatch([text], targetLanguage, sourceLanguage);
    return result ?? text;
  }

  /**
   * Translate multiple texts.
   *
   * When `sourceLanguage` is omitted, the source is detected per text so a
   * mixed batch (e.g. English and Japanese messages sharing a batch) is
   * routed correctly instead of assuming a single fixed source.
   */
  async translateBatch(
    texts: string[],
    targetLanguage: string,
    sourceLanguage?: string
  ): Promise<string[]> {
    if (texts.length === 0) {
      return [];
    }

    if (!ChromeBuiltinTranslator.isAvailable()) {
      throw new Error('Chrome Translator API is not available');
    }

    const normalizedTarget = ChromeBuiltinTranslator.normalizeLanguageCode(targetLanguage);
    // Pre-fill with the originals so any unwritten index (should not happen, but
    // defends against a future grouping bug) degrades to "return original" rather than ''.
    const results: string[] = [...texts];

    if (sourceLanguage) {
      const normalizedSource = ChromeBuiltinTranslator.normalizeLanguageCode(sourceLanguage);
      const indices = texts.map((_, i) => i);
      await this.translateGroup(texts, indices, normalizedSource, normalizedTarget, results);
      return results;
    }

    const detectedSources = await Promise.all(texts.map((text) => this.detectSource(text)));

    // Group remaining indices by normalized detected source, resolving
    // same-language texts immediately without touching the Translator API.
    const groups = new Map<string, { texts: string[]; indices: number[] }>();
    for (let i = 0; i < texts.length; i++) {
      const text = texts[i];
      const detected = detectedSources[i];
      if (text === undefined || detected === undefined) continue;

      if (isSameLanguage(detected, targetLanguage)) {
        results[i] = text;
        continue;
      }

      const normalizedSource = ChromeBuiltinTranslator.normalizeLanguageCode(detected);
      const group = groups.get(normalizedSource) ?? { texts: [], indices: [] };
      group.texts.push(text);
      group.indices.push(i);
      groups.set(normalizedSource, group);
    }

    for (const [normalizedSource, group] of groups) {
      await this.translateGroup(group.texts, group.indices, normalizedSource, normalizedTarget, results);
    }

    return results;
  }

  /**
   * Clear the translator cache
   */
  clearCache(): void {
    this.translatorCache.clear();
    this.availabilityCache.clear();
    this.warnedPairs.clear();
  }
}

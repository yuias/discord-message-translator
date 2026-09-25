/// <reference types="@types/dom-chromium-ai" />

type AvailabilityStatus = 'unavailable' | 'downloadable' | 'downloading' | 'available';

/**
 * Chrome Built-in Translator API client
 * Requires Chrome 138+ with Translator API enabled
 * https://developer.chrome.com/docs/ai/translator-api
 */
export class ChromeBuiltinTranslator {
  private translatorCache: Map<string, Translator> = new Map();

  /**
   * Check if the Chrome Translator API is available in the current browser
   */
  static isAvailable(): boolean {
    return 'Translator' in self;
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
    return mapping[code] || code.split('-')[0];
  }

  /**
   * Get or create a translator instance for the given language pair
   */
  private async getTranslator(
    targetLanguage: string,
    sourceLanguage?: string
  ): Promise<Translator> {
    const normalizedTarget = ChromeBuiltinTranslator.normalizeLanguageCode(targetLanguage);
    const normalizedSource = sourceLanguage
      ? ChromeBuiltinTranslator.normalizeLanguageCode(sourceLanguage)
      : 'en';

    const cacheKey = `${normalizedSource}-${normalizedTarget}`;

    if (this.translatorCache.has(cacheKey)) {
      return this.translatorCache.get(cacheKey)!;
    }

    const translator = await Translator.create({
      sourceLanguage: normalizedSource,
      targetLanguage: normalizedTarget,
    });

    this.translatorCache.set(cacheKey, translator);
    return translator;
  }

  /**
   * Translate a single text
   */
  async translate(
    text: string,
    targetLanguage: string,
    sourceLanguage?: string
  ): Promise<string> {
    if (!ChromeBuiltinTranslator.isAvailable()) {
      throw new Error('Chrome Translator API is not available');
    }

    const translator = await this.getTranslator(targetLanguage, sourceLanguage);
    return translator.translate(text);
  }

  /**
   * Translate multiple texts
   * Note: Chrome Translator API processes sequentially, not in parallel
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

    const translator = await this.getTranslator(targetLanguage, sourceLanguage);
    const results: string[] = [];

    for (const text of texts) {
      const translated = await translator.translate(text);
      results.push(translated);
    }

    return results;
  }

  /**
   * Clear the translator cache
   */
  clearCache(): void {
    this.translatorCache.clear();
  }
}

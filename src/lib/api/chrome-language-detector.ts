/// <reference types="@types/dom-chromium-ai" />

import { isSameLanguage } from '@/lib/utils/language';

/**
 * Language detection result
 */
export interface LanguageDetectionResult {
  detectedLanguage: string;
  confidence: number;
}

/**
 * Chrome Built-in Language Detector API client
 * Requires Chrome 138+ with Language Detection API enabled
 * https://developer.chrome.com/docs/ai/language-detection
 */
export class ChromeLanguageDetector {
  private detector: LanguageDetector | null = null;
  private initPromise: Promise<void> | null = null;

  /**
   * Check if the Chrome Language Detector API is available in the current browser
   */
  static isAvailable(): boolean {
    return 'LanguageDetector' in globalThis;
  }

  /**
   * Check the availability status of the Language Detector
   * @returns 'unavailable' | 'downloadable' | 'downloading' | 'available'
   */
  static async checkAvailability(): Promise<string> {
    if (!ChromeLanguageDetector.isAvailable()) {
      return 'unavailable';
    }

    try {
      const status = await LanguageDetector.availability();
      return status;
    } catch (error) {
      console.error('[ChromeLanguageDetector] Error checking availability:', error);
      return 'unavailable';
    }
  }

  /**
   * Initialize the detector (lazy initialization)
   */
  private async ensureInitialized(): Promise<void> {
    if (this.detector) {
      return;
    }

    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = (async () => {
      if (!ChromeLanguageDetector.isAvailable()) {
        throw new Error('Chrome Language Detector API is not available');
      }

      try {
        this.detector = await LanguageDetector.create();
      } catch (error) {
        console.error('[ChromeLanguageDetector] Failed to create detector:', error);
        throw error;
      }
    })();

    return this.initPromise;
  }

  /**
   * Detect the language of the given text
   * @param text Text to detect language for
   * @returns Array of detection results sorted by confidence (highest first)
   */
  async detect(text: string): Promise<LanguageDetectionResult[]> {
    await this.ensureInitialized();

    if (!this.detector) {
      throw new Error('Language detector not initialized');
    }

    try {
      const results = await this.detector.detect(text);
      return results
        .filter((result): result is LanguageDetectionResult & { detectedLanguage: string; confidence: number } =>
          typeof result.detectedLanguage === 'string' && typeof result.confidence === 'number'
        )
        .map((result) => ({
          detectedLanguage: result.detectedLanguage,
          confidence: result.confidence,
        }));
    } catch (error) {
      console.error('[ChromeLanguageDetector] Detection failed:', error);
      throw error;
    }
  }

  /**
   * Detect the source language to use for translation.
   * @param text Text to detect language for
   * @param minConfidence Minimum confidence threshold (default: 0.5)
   * @returns The top candidate, or null if it is 'und' or below minConfidence
   */
  async detectSourceLanguage(
    text: string,
    minConfidence = 0.5
  ): Promise<string | null> {
    const results = await this.detect(text);

    const primary = results[0];
    if (!primary) return null;
    if (primary.detectedLanguage === 'und') return null;
    if (primary.confidence < minConfidence) return null;

    return primary.detectedLanguage;
  }

  /**
   * Check if the text is in the specified language
   * @param text Text to check
   * @param languageCode Expected language code
   * @param minConfidence Minimum confidence threshold (default: 0.7)
   */
  async isLanguage(
    text: string,
    languageCode: string,
    minConfidence = 0.7
  ): Promise<boolean> {
    const results = await this.detect(text);

    if (results.length === 0) {
      return false;
    }

    const primary = results[0];
    if (!primary) return false;

    return isSameLanguage(primary.detectedLanguage, languageCode) && primary.confidence >= minConfidence;
  }
}

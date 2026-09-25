import { describe, it, expect, afterEach, vi } from 'vitest';
import { ChromeLanguageDetector } from './chrome-language-detector';

function stubDetector(results: Array<{ detectedLanguage: string; confidence: number }>) {
  const detect = vi.fn().mockResolvedValue(results);
  const create = vi.fn().mockResolvedValue({ detect });
  vi.stubGlobal('LanguageDetector', { create, availability: vi.fn() });
  return { detect, create };
}

describe('ChromeLanguageDetector', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('isAvailable', () => {
    it('is false when LanguageDetector is not on globalThis', () => {
      expect(ChromeLanguageDetector.isAvailable()).toBe(false);
    });

    it('is true when LanguageDetector is stubbed on globalThis', () => {
      vi.stubGlobal('LanguageDetector', {});
      expect(ChromeLanguageDetector.isAvailable()).toBe(true);
    });
  });

  describe('detectSourceLanguage', () => {
    it('returns null when the top candidate is "und"', async () => {
      stubDetector([{ detectedLanguage: 'und', confidence: 0.9 }]);
      const detector = new ChromeLanguageDetector();

      expect(await detector.detectSourceLanguage('???')).toBeNull();
    });

    it('returns null when confidence is below minConfidence', async () => {
      stubDetector([{ detectedLanguage: 'fr', confidence: 0.3 }]);
      const detector = new ChromeLanguageDetector();

      expect(await detector.detectSourceLanguage('bonjour', 0.5)).toBeNull();
    });

    it('returns the top candidate when confident and not "und"', async () => {
      stubDetector([{ detectedLanguage: 'fr', confidence: 0.9 }]);
      const detector = new ChromeLanguageDetector();

      expect(await detector.detectSourceLanguage('bonjour', 0.5)).toBe('fr');
    });
  });

  describe('isLanguage', () => {
    it('matches a region-qualified detection against a bare code', async () => {
      stubDetector([{ detectedLanguage: 'en-US', confidence: 0.9 }]);
      const detector = new ChromeLanguageDetector();

      expect(await detector.isLanguage('hello', 'en', 0.7)).toBe(true);
    });
  });
});

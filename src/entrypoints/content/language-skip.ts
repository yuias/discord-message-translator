import type { ChromeLanguageDetector } from '@/lib/api/chrome-language-detector';

/**
 * Stateless per-text check for whether a text is already in the target
 * language and can be skipped. Unlike the old latch-based approach, this
 * never remembers past results, so a run of target-language messages
 * cannot suppress detection for later, non-target-language messages.
 */
export async function shouldSkipText(
  detector: Pick<ChromeLanguageDetector, 'isLanguage'>,
  text: string,
  targetLanguage: string,
  minConfidence: number
): Promise<boolean> {
  try {
    return await detector.isLanguage(text, targetLanguage, minConfidence);
  } catch (error) {
    console.error('[language-skip] Language detection failed:', error);
    return false;
  }
}

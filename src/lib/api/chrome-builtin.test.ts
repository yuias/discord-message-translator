import { describe, it, expect, afterEach, vi } from 'vitest';
import { ChromeBuiltinTranslator } from './chrome-builtin';

interface DetectionResult {
  detectedLanguage: string;
  confidence: number;
}

interface LanguagePair {
  sourceLanguage: string;
  targetLanguage: string;
}

function stubLanguageDetector(
  languageOf: (text: string) => DetectionResult,
  options?: {
    availabilityStatus?: string;
    createImpl?: () => Promise<{ detect: (text: string) => Promise<DetectionResult[]> }>;
  }
) {
  const detect = vi.fn(async (text: string) => [languageOf(text)]);
  const create = options?.createImpl ? vi.fn(options.createImpl) : vi.fn().mockResolvedValue({ detect });
  const availability = vi.fn().mockResolvedValue(options?.availabilityStatus ?? 'available');
  vi.stubGlobal('LanguageDetector', { create, availability });
  return { detect, create, availability };
}

function stubTranslator(options?: {
  availabilityOf?: (pair: LanguagePair) => string;
  createImpl?: (pair: LanguagePair) => Promise<{ translate: (text: string) => Promise<string> }>;
}) {
  const availability = vi.fn(async (pair: LanguagePair) =>
    options?.availabilityOf ? options.availabilityOf(pair) : 'available'
  );
  const create = vi.fn(async (pair: LanguagePair) => {
    if (options?.createImpl) {
      return options.createImpl(pair);
    }
    return {
      translate: vi.fn(async (text: string) => `[${pair.sourceLanguage}->${pair.targetLanguage}]${text}`),
    };
  });
  vi.stubGlobal('Translator', { create, availability });
  return { create, availability };
}

describe('ChromeBuiltinTranslator.translateBatch', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('detects the source per text, skips same-language text, and preserves order', async () => {
    stubLanguageDetector((text) => {
      if (text === 'hello') return { detectedLanguage: 'en', confidence: 0.9 };
      if (text === 'bonjour') return { detectedLanguage: 'fr', confidence: 0.9 };
      return { detectedLanguage: 'ja', confidence: 0.9 };
    });
    const { create } = stubTranslator();

    const client = new ChromeBuiltinTranslator();
    const result = await client.translateBatch(['hello', 'bonjour', 'こんにちは'], 'ja');

    expect(result).toEqual(['[en->ja]hello', '[fr->ja]bonjour', 'こんにちは']);
    // The Japanese text is same-language as the target, so no group (and no
    // Translator.create call) should ever be formed for a ja->ja pair.
    for (const call of create.mock.calls) {
      expect(call[0].sourceLanguage).not.toBe('ja');
    }
  });

  it('returns originals for a group whose pair is unavailable while other groups still translate', async () => {
    stubLanguageDetector((text) =>
      text === 'hello' ? { detectedLanguage: 'en', confidence: 0.9 } : { detectedLanguage: 'fr', confidence: 0.9 }
    );
    stubTranslator({
      availabilityOf: (pair) => (pair.sourceLanguage === 'en' ? 'unavailable' : 'available'),
    });

    const client = new ChromeBuiltinTranslator();
    const result = await client.translateBatch(['hello', 'bonjour'], 'ja');

    expect(result).toEqual(['hello', '[fr->ja]bonjour']);
  });

  it('returns originals without throwing when Translator.create rejects, and retries on the next call', async () => {
    stubLanguageDetector(() => ({ detectedLanguage: 'en', confidence: 0.9 }));
    const { create } = stubTranslator({
      createImpl: async () => {
        throw new Error('downloadable without user activation');
      },
    });

    const client = new ChromeBuiltinTranslator();
    const result = await client.translateBatch(['hello'], 'ja');
    expect(result).toEqual(['hello']);

    // The failed entry was evicted from the translator cache, so a later
    // call retries Translator.create() instead of reusing the rejection.
    const result2 = await client.translateBatch(['hello'], 'ja');
    expect(result2).toEqual(['hello']);
    expect(create).toHaveBeenCalledTimes(2);
  });

  it('falls back to "en" when detection is "und"', async () => {
    stubLanguageDetector(() => ({ detectedLanguage: 'und', confidence: 0.9 }));
    const { create } = stubTranslator();

    const client = new ChromeBuiltinTranslator();
    const result = await client.translateBatch(['???'], 'ja');

    expect(result).toEqual(['[en->ja]???']);
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ sourceLanguage: 'en', targetLanguage: 'ja' }));
  });

  it('falls back to "en" when detection confidence is below the threshold', async () => {
    stubLanguageDetector(() => ({ detectedLanguage: 'fr', confidence: 0.3 }));
    const { create } = stubTranslator();

    const client = new ChromeBuiltinTranslator();
    const result = await client.translateBatch(['bonjour'], 'ja');

    expect(result).toEqual(['[en->ja]bonjour']);
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ sourceLanguage: 'en', targetLanguage: 'ja' }));
  });

  it('skips detection entirely when an explicit sourceLanguage is given', async () => {
    const { detect, create: detectorCreate } = stubLanguageDetector(() => ({
      detectedLanguage: 'ja',
      confidence: 0.9,
    }));
    stubTranslator();

    const client = new ChromeBuiltinTranslator();
    const result = await client.translateBatch(['hi'], 'fr', 'en');

    expect(detectorCreate).not.toHaveBeenCalled();
    expect(detect).not.toHaveBeenCalled();
    expect(result).toEqual(['[en->fr]hi']);
  });

  it('shares a single Translator.create() call across concurrent batches for the same pair', async () => {
    const { create } = stubTranslator();
    const client = new ChromeBuiltinTranslator();

    const [a, b] = await Promise.all([
      client.translateBatch(['a'], 'fr', 'en'),
      client.translateBatch(['b'], 'fr', 'en'),
    ]);

    expect(a).toEqual(['[en->fr]a']);
    expect(b).toEqual(['[en->fr]b']);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('logs the detector failure once and falls back to "en" for every text when LanguageDetector.create() rejects', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    stubLanguageDetector(() => ({ detectedLanguage: 'fr', confidence: 0.9 }), {
      createImpl: async () => {
        throw new Error('detector init failed');
      },
    });
    const { create } = stubTranslator();

    const client = new ChromeBuiltinTranslator();
    const result = await client.translateBatch(['a', 'b', 'c'], 'ja');

    expect(result).toEqual(['[en->ja]a', '[en->ja]b', '[en->ja]c']);
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ sourceLanguage: 'en', targetLanguage: 'ja' }));

    const detectionFailureLogs = consoleError.mock.calls.filter((call) =>
      String(call[0]).includes('Language detection failed')
    );
    expect(detectionFailureLogs).toHaveLength(1);

    consoleError.mockRestore();
  });
});

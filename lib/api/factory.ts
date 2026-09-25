import type { Settings } from '@/types/settings';
import { GoogleTranslateClient } from './google-translate';
import { DeepLClient } from './deepl';
import { OpenAICompatibleClient } from './openai-compatible';
import { ChromeBuiltinTranslator } from './chrome-builtin';

export interface TranslationClient {
  translate(text: string, targetLang: string): Promise<string>;
  translateBatch(texts: string[], targetLang: string): Promise<string[]>;
}

// Singleton instance for Chrome Built-in Translator (to reuse translator cache)
let chromeBuiltinInstance: ChromeBuiltinTranslator | null = null;

function getChromeBuiltinTranslator(): ChromeBuiltinTranslator {
  if (!chromeBuiltinInstance) {
    chromeBuiltinInstance = new ChromeBuiltinTranslator();
  }
  return chromeBuiltinInstance;
}

export function createTranslationClient(settings: Settings): TranslationClient {
  switch (settings.translationProvider) {
    case 'google':
      if (!settings.apiKeys.google) {
        throw new Error('Google Translate API key is not configured');
      }
      return new GoogleTranslateClient(settings.apiKeys.google);

    case 'deepl':
      if (!settings.apiKeys.deepl) {
        throw new Error('DeepL API key is not configured');
      }
      return new DeepLClient(settings.apiKeys.deepl, true);

    case 'openai':
      if (!settings.apiKeys.openai || !settings.openaiConfig) {
        throw new Error('OpenAI API is not configured');
      }
      return new OpenAICompatibleClient({
        apiKey: settings.apiKeys.openai,
        baseUrl: settings.openaiConfig.baseUrl,
        model: settings.openaiConfig.model,
      });

    case 'chrome-builtin':
      if (!ChromeBuiltinTranslator.isAvailable()) {
        throw new Error('Chrome Built-in Translator API is not available. Please use Chrome 138+ or select a different provider.');
      }
      return getChromeBuiltinTranslator();

    default:
      throw new Error(`Unsupported translation provider: ${settings.translationProvider}`);
  }
}

export interface Settings {
  // Translation API settings
  translationProvider: 'google' | 'deepl' | 'openai' | 'chrome-builtin';
  apiKeys: {
    google?: string;
    deepl?: string;
    openai?: string; // OpenAI-compatible API key
  };
  openaiConfig?: {
    baseUrl: string; // e.g., https://api.openai.com/v1
    model: string;   // e.g., gpt-4, claude-3-5-sonnet-20241022
  };

  // Translation settings
  targetLanguage: string; // e.g., "ja", "en", "de"
  translationMode: 'replace' | 'append'; // Replace original or append translation
  autoTranslate: boolean; // Auto-translate on/off

  // Cache settings
  cacheTTLDays: number; // Default: 7

  // UI settings
  showOriginalOnHover: boolean; // Show original on hover

  // Language detection settings
  skipTargetLanguage: boolean; // Skip translation if message is already in target language
}

export const DEFAULT_SETTINGS: Settings = {
  translationProvider: 'google',
  apiKeys: {},
  targetLanguage: 'ja',
  translationMode: 'replace',
  autoTranslate: true,
  cacheTTLDays: 7,
  showOriginalOnHover: false,
  skipTargetLanguage: false,
};

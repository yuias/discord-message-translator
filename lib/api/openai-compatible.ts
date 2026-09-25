interface OpenAIConfig {
  baseUrl: string;
  model: string;
  apiKey: string;
}

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
}

interface ChatCompletionResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
}

export class OpenAICompatibleClient {
  private config: OpenAIConfig;

  constructor(config: OpenAIConfig) {
    // Users often paste the full endpoint URL; strip it so we don't request .../chat/completions/chat/completions
    const baseUrl = config.baseUrl
      .trim()
      .replace(/\/+$/, '')
      .replace(/\/chat\/completions$/, '');
    this.config = { ...config, baseUrl };
  }

  /**
   * Translate text using OpenAI-compatible API with automatic language detection
   * The LLM will automatically detect the source language
   */
  async translate(text: string, targetLang: string, _sourceLang?: string): Promise<string> {
    // Note: sourceLang is ignored as LLM can auto-detect the language
    const targetLanguageName = this.getLanguageName(targetLang);

    const systemPrompt = `You are a professional translator. Your task is to translate the given text to ${targetLanguageName}.
Rules:
- Automatically detect the source language
- Provide ONLY the translated text without any explanations or additional content
- Preserve the original formatting and tone
- Do not add quotation marks or any other characters around the translation`;

    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: systemPrompt,
      },
      {
        role: 'user',
        content: text,
      },
    ];

    const requestBody: ChatCompletionRequest = {
      model: this.config.model,
      messages,
      temperature: 0.3, // Lower temperature for more consistent translations
      max_tokens: 1000,
    };

    const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      let errorMessage = response.statusText || 'Unknown error';
      try {
        const errorJson = JSON.parse(errorBody);
        errorMessage = errorJson.error?.message || errorJson.message || errorMessage;
      } catch {
        if (errorBody) errorMessage = errorBody;
      }
      throw new Error(`OpenAI API Error: ${errorMessage}`);
    }

    const data: ChatCompletionResponse = await response.json();
    const translatedText = data.choices[0]?.message?.content?.trim();

    if (!translatedText) {
      throw new Error('OpenAI API returned empty translation');
    }

    return translatedText;
  }

  /**
   * Translate multiple texts in a single API request
   * More efficient for batch processing
   */
  async translateBatch(texts: string[], targetLang: string, _sourceLang?: string): Promise<string[]> {
    if (texts.length === 0) {
      return [];
    }

    // Limit batch size to prevent LLM from losing track
    const MAX_BATCH_SIZE = 5;
    if (texts.length > MAX_BATCH_SIZE) {
      console.log(`[OpenAI] Splitting ${texts.length} texts into batches of ${MAX_BATCH_SIZE}`);
      const results: string[] = [];
      for (let i = 0; i < texts.length; i += MAX_BATCH_SIZE) {
        const batch = texts.slice(i, i + MAX_BATCH_SIZE);
        const batchResults = await this.translateBatch(batch, targetLang);
        results.push(...batchResults);
      }
      return results;
    }

    const targetLanguageName = this.getLanguageName(targetLang);

    // Use delimiter-based format instead of JSON for more reliable parsing
    const DELIMITER = '===TRANSLATION_SEPARATOR===';
    const numberedTexts = texts.map((text, i) => `[${i + 1}] ${text}`).join('\n\n');

    const systemPrompt = `You are a professional translator. Translate each numbered text to ${targetLanguageName}.

Output format:
- Output ONLY the translations, one per line
- Separate each translation with exactly: ${DELIMITER}
- Do not include numbers, explanations, or any other content
- Preserve the original formatting within each translation

Example output for 3 texts:
First translation here
${DELIMITER}
Second translation here
${DELIMITER}
Third translation here`;

    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: systemPrompt,
      },
      {
        role: 'user',
        content: numberedTexts,
      },
    ];

    const requestBody: ChatCompletionRequest = {
      model: this.config.model,
      messages,
      temperature: 0.3,
      max_tokens: 4000,
    };

    const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      let errorMessage = response.statusText || 'Unknown error';
      try {
        const errorJson = JSON.parse(errorBody);
        errorMessage = errorJson.error?.message || errorJson.message || errorMessage;
      } catch {
        if (errorBody) errorMessage = errorBody;
      }
      throw new Error(`OpenAI API Error: ${errorMessage}`);
    }

    const data: ChatCompletionResponse = await response.json();
    const content = data.choices[0]?.message?.content?.trim();

    if (!content) {
      throw new Error('OpenAI API returned empty translation');
    }

    // Parse delimiter-separated response
    const translations = content.split(DELIMITER).map(t => t.trim());

    if (translations.length !== texts.length) {
      console.error('[OpenAI] Translation count mismatch:', JSON.stringify({
        expected: texts.length,
        received: translations.length,
        content,
      }));
      // Fallback: translate individually if batch parsing fails
      console.log('[OpenAI] Falling back to individual translations');
      return this.translateIndividually(texts, targetLang);
    }

    return translations;
  }

  /**
   * Fallback: translate texts one by one when batch fails
   */
  private async translateIndividually(texts: string[], targetLang: string): Promise<string[]> {
    const results: string[] = [];
    for (const text of texts) {
      const translation = await this.translate(text, targetLang);
      results.push(translation);
    }
    return results;
  }

  /**
   * Convert language code to full language name for better LLM understanding
   */
  private getLanguageName(langCode: string): string {
    const languageMap: Record<string, string> = {
      'en': 'English',
      'ja': 'Japanese',
      'ko': 'Korean',
      'zh': 'Chinese',
      'zh-cn': 'Simplified Chinese',
      'zh-tw': 'Traditional Chinese',
      'es': 'Spanish',
      'fr': 'French',
      'de': 'German',
      'pt': 'Portuguese',
      'ru': 'Russian',
      'it': 'Italian',
      'nl': 'Dutch',
      'pl': 'Polish',
      'ar': 'Arabic',
      'hi': 'Hindi',
      'th': 'Thai',
      'vi': 'Vietnamese',
      'id': 'Indonesian',
      'tr': 'Turkish',
      'sv': 'Swedish',
      'da': 'Danish',
      'fi': 'Finnish',
      'no': 'Norwegian',
    };

    return languageMap[langCode.toLowerCase()] || langCode.toUpperCase();
  }
}

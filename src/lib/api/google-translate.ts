export class GoogleTranslateClient {
  private apiKey: string;
  private baseUrl = 'https://translation.googleapis.com/language/translate/v2';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async translate(text: string, targetLang: string, sourceLang?: string): Promise<string> {
    const body: Record<string, string | string[]> = {
      q: text,
      target: targetLang,
      format: 'text',
    };

    if (sourceLang) {
      body.source = sourceLang;
    }

    const response = await fetch(`${this.baseUrl}?key=${this.apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Google Translate API Error: ${error.error?.message || response.statusText}`);
    }

    const data = await response.json();
    return data.data.translations[0].translatedText;
  }

  /**
   * Translate multiple texts in a single API request
   * More efficient than multiple individual requests
   */
  async translateBatch(texts: string[], targetLang: string, sourceLang?: string): Promise<string[]> {
    if (texts.length === 0) {
      return [];
    }

    const body: Record<string, string | string[]> = {
      q: texts,
      target: targetLang,
      format: 'text',
    };

    if (sourceLang) {
      body.source = sourceLang;
    }

    const response = await fetch(`${this.baseUrl}?key=${this.apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Google Translate API Error: ${error.error?.message || response.statusText}`);
    }

    const data = await response.json();
    return data.data.translations.map((t: { translatedText: string }) => t.translatedText);
  }
}

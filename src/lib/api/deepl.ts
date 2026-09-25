export class DeepLClient {
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey: string, isFreeAccount: boolean = true) {
    this.apiKey = apiKey;
    // DeepL has different endpoints for free and paid accounts
    this.baseUrl = isFreeAccount
      ? 'https://api-free.deepl.com/v2'
      : 'https://api.deepl.com/v2';
  }

  async translate(text: string, targetLang: string, sourceLang?: string): Promise<string> {
    const body: Record<string, string> = {
      text,
      target_lang: this.normalizeLanguageCode(targetLang),
    };

    if (sourceLang) {
      body.source_lang = this.normalizeLanguageCode(sourceLang);
    }

    const response = await fetch(`${this.baseUrl}/translate`, {
      method: 'POST',
      headers: {
        'Authorization': `DeepL-Auth-Key ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: response.statusText }));
      throw new Error(`DeepL API Error: ${error.message || response.statusText}`);
    }

    const data = await response.json();
    return data.translations[0].text;
  }

  /**
   * Translate multiple texts in a single API request
   * More efficient than multiple individual requests
   */
  async translateBatch(texts: string[], targetLang: string, sourceLang?: string): Promise<string[]> {
    if (texts.length === 0) {
      return [];
    }

    const body: Record<string, any> = {
      text: texts, // DeepL accepts an array of strings
      target_lang: this.normalizeLanguageCode(targetLang),
    };

    if (sourceLang) {
      body.source_lang = this.normalizeLanguageCode(sourceLang);
    }

    const response = await fetch(`${this.baseUrl}/translate`, {
      method: 'POST',
      headers: {
        'Authorization': `DeepL-Auth-Key ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: response.statusText }));
      throw new Error(`DeepL API Error: ${error.message || response.statusText}`);
    }

    const data = await response.json();
    return data.translations.map((t: any) => t.text);
  }

  /**
   * Normalize language codes to DeepL format
   * DeepL uses uppercase codes like "EN", "DE", "JA"
   * For English, variants exist: "EN-US", "EN-GB"
   * For Portuguese: "PT-BR", "PT-PT"
   */
  private normalizeLanguageCode(lang: string): string {
    const langUpper = lang.toUpperCase();

    // Handle special cases
    const mapping: Record<string, string> = {
      'EN': 'EN-US', // Default to US English
      'PT': 'PT-BR', // Default to Brazilian Portuguese
      'ZH': 'ZH',    // Chinese (simplified)
    };

    return mapping[langUpper] || langUpper;
  }
}

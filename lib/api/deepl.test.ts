import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DeepLClient } from './deepl';

// Mock fetch
global.fetch = vi.fn();

describe('DeepLClient', () => {
  let client: DeepLClient;
  // Use API key from environment variable or fallback to mock key for unit tests
  const apiKey = process.env.DEEPL_API_KEY || 'test-deepl-key';

  beforeEach(() => {
    vi.clearAllMocks();
    client = new DeepLClient(apiKey, true); // true = free account
  });

  describe('translate', () => {
    it('should translate text successfully', async () => {
      const mockResponse = {
        translations: [
          {
            text: 'Bonjour',
            detected_source_language: 'EN',
          },
        ],
      };

      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const result = await client.translate('Hello', 'fr');

      expect(result).toBe('Bonjour');
      expect(fetch).toHaveBeenCalledWith(
        'https://api-free.deepl.com/v2/translate',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': `DeepL-Auth-Key ${apiKey}`,
            'Content-Type': 'application/json',
          }),
        })
      );
    });

    it('should use paid endpoint when isFreeAccount is false', async () => {
      const paidClient = new DeepLClient(apiKey, false);
      const mockResponse = {
        translations: [{ text: 'こんにちは' }],
      };

      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      await paidClient.translate('Hello', 'ja');

      expect(fetch).toHaveBeenCalledWith(
        'https://api.deepl.com/v2/translate',
        expect.any(Object)
      );
    });

    it('should include source language if provided', async () => {
      const mockResponse = {
        translations: [{ text: 'こんにちは' }],
      };

      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      await client.translate('Hello', 'ja', 'en');

      const callArgs = vi.mocked(fetch).mock.calls[0];
      const body = JSON.parse(callArgs[1]?.body as string);
      expect(body.source_lang).toBe('EN-US');
    });

    it('should normalize language codes to uppercase', async () => {
      const mockResponse = {
        translations: [{ text: 'Hallo' }],
      };

      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      await client.translate('Hello', 'de');

      const callArgs = vi.mocked(fetch).mock.calls[0];
      const body = JSON.parse(callArgs[1]?.body as string);
      expect(body.target_lang).toBe('DE');
    });

    it('should throw error on API failure', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: false,
        statusText: 'Unauthorized',
        json: async () => ({
          message: 'Invalid API key',
        }),
      } as Response);

      await expect(client.translate('Hello', 'fr')).rejects.toThrow(
        'DeepL API Error'
      );
    });

    it('should handle EN language code with US variant', async () => {
      const mockResponse = {
        translations: [{ text: 'Hello' }],
      };

      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      await client.translate('Bonjour', 'en');

      const callArgs = vi.mocked(fetch).mock.calls[0];
      const body = JSON.parse(callArgs[1]?.body as string);
      expect(body.target_lang).toBe('EN-US');
    });

    it('should handle PT language code with BR variant', async () => {
      const mockResponse = {
        translations: [{ text: 'Olá' }],
      };

      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      await client.translate('Hello', 'pt');

      const callArgs = vi.mocked(fetch).mock.calls[0];
      const body = JSON.parse(callArgs[1]?.body as string);
      expect(body.target_lang).toBe('PT-BR');
    });
  });

  describe('translateBatch', () => {
    it('should translate multiple texts in a single request', async () => {
      const mockResponse = {
        translations: [
          { text: 'Bonjour' },
          { text: 'Au revoir' },
          { text: 'Merci' },
        ],
      };

      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const result = await client.translateBatch(['Hello', 'Goodbye', 'Thanks'], 'fr');

      expect(result).toEqual(['Bonjour', 'Au revoir', 'Merci']);
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('should return empty array for empty input', async () => {
      const result = await client.translateBatch([], 'fr');
      expect(result).toEqual([]);
      expect(fetch).not.toHaveBeenCalled();
    });

    it('should send array of texts in request body', async () => {
      const mockResponse = {
        translations: [
          { text: 'Hola' },
          { text: 'Adiós' },
        ],
      };

      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      await client.translateBatch(['Hello', 'Goodbye'], 'es');

      const callArgs = vi.mocked(fetch).mock.calls[0];
      const body = JSON.parse(callArgs[1]?.body as string);
      expect(body.text).toEqual(['Hello', 'Goodbye']);
    });
  });
});

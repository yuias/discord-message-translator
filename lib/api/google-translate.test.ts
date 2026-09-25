import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GoogleTranslateClient } from './google-translate';

// Mock fetch
global.fetch = vi.fn();

describe('GoogleTranslateClient', () => {
  let client: GoogleTranslateClient;
  // Use API key from environment variable or fallback to mock key for unit tests
  const apiKey = process.env.GOOGLE_CLOUD_TRANSLATION_API_KEY || 'test-api-key';

  beforeEach(() => {
    vi.clearAllMocks();
    client = new GoogleTranslateClient(apiKey);
  });

  describe('translate', () => {
    it('should translate text successfully', async () => {
      const mockResponse = {
        data: {
          translations: [
            {
              translatedText: 'Bonjour',
            },
          ],
        },
      };

      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const result = await client.translate('Hello', 'fr');

      expect(result).toBe('Bonjour');
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('https://translation.googleapis.com'),
        expect.objectContaining({
          method: 'POST',
        })
      );
    });

    it('should include source language if provided', async () => {
      const mockResponse = {
        data: {
          translations: [
            {
              translatedText: 'こんにちは',
            },
          ],
        },
      };

      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      await client.translate('Hello', 'ja', 'en');

      const callArgs = vi.mocked(fetch).mock.calls[0];
      const body = JSON.parse(callArgs[1]?.body as string);
      expect(body.source).toBe('en');
    });

    it('should throw error on API failure', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: false,
        statusText: 'Unauthorized',
        json: async () => ({
          error: {
            message: 'Invalid API key',
          },
        }),
      } as Response);

      await expect(client.translate('Hello', 'fr')).rejects.toThrow(
        'Google Translate API Error'
      );
    });

    it('should include API key in request', async () => {
      const mockResponse = {
        data: {
          translations: [
            {
              translatedText: 'Hola',
            },
          ],
        },
      };

      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      await client.translate('Hello', 'es');

      const callArgs = vi.mocked(fetch).mock.calls[0];
      expect(callArgs[0]).toContain(`key=${apiKey}`);
    });
  });

  describe('translateBatch', () => {
    it('should translate multiple texts in a single request', async () => {
      const mockResponse = {
        data: {
          translations: [
            { translatedText: 'Bonjour' },
            { translatedText: 'Au revoir' },
            { translatedText: 'Merci' },
          ],
        },
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

    it('should include all texts in request body', async () => {
      const mockResponse = {
        data: {
          translations: [
            { translatedText: 'Hola' },
            { translatedText: 'Adiós' },
          ],
        },
      };

      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      await client.translateBatch(['Hello', 'Goodbye'], 'es');

      const callArgs = vi.mocked(fetch).mock.calls[0];
      const body = JSON.parse(callArgs[1]?.body as string);
      expect(body.q).toEqual(['Hello', 'Goodbye']);
    });
  });
});

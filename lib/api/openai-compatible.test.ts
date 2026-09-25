import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OpenAICompatibleClient } from './openai-compatible';

// Mock fetch
global.fetch = vi.fn();

// noUncheckedIndexedAccess makes mock.calls[0] possibly undefined; this narrows it.
function firstCall<T extends unknown[]>(calls: T[]): T {
  const c = calls[0];
  if (!c) throw new Error('expected a call');
  return c;
}

describe('OpenAICompatibleClient', () => {
  let client: OpenAICompatibleClient;
  const apiKey = process.env.OPENAI_API_KEY || 'test-openai-key';
  const baseUrl = 'https://api.openai.com/v1';
  const model = 'gpt-4';

  beforeEach(() => {
    vi.clearAllMocks();
    client = new OpenAICompatibleClient({
      apiKey,
      baseUrl,
      model,
    });
  });

  describe('translate', () => {
    it('should translate text successfully', async () => {
      const mockResponse = {
        choices: [
          {
            message: {
              content: 'Bonjour',
            },
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
        `${baseUrl}/chat/completions`,
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          }),
        })
      );
    });

    it('should include correct model in request', async () => {
      const mockResponse = {
        choices: [{ message: { content: 'こんにちは' } }],
      };

      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      await client.translate('Hello', 'ja');

      const callArgs = firstCall(vi.mocked(fetch).mock.calls);
      const body = JSON.parse(callArgs[1]?.body as string);
      expect(body.model).toBe(model);
    });

    it('should include system prompt with target language', async () => {
      const mockResponse = {
        choices: [{ message: { content: 'Hola' } }],
      };

      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      await client.translate('Hello', 'es');

      const callArgs = firstCall(vi.mocked(fetch).mock.calls);
      const body = JSON.parse(callArgs[1]?.body as string);

      expect(body.messages).toHaveLength(2);
      expect(body.messages[0].role).toBe('system');
      expect(body.messages[0].content).toContain('Spanish');
      expect(body.messages[1].role).toBe('user');
      expect(body.messages[1].content).toBe('Hello');
    });

    it('should use low temperature for consistent translations', async () => {
      const mockResponse = {
        choices: [{ message: { content: 'Guten Tag' } }],
      };

      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      await client.translate('Hello', 'de');

      const callArgs = firstCall(vi.mocked(fetch).mock.calls);
      const body = JSON.parse(callArgs[1]?.body as string);
      expect(body.temperature).toBe(0.3);
    });

    it('should throw error on API failure', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: false,
        statusText: 'Unauthorized',
        text: async () => JSON.stringify({
          error: {
            message: 'Invalid API key',
          },
        }),
      } as Response);

      await expect(client.translate('Hello', 'fr')).rejects.toThrow(
        'OpenAI API Error'
      );
    });

    it('should throw error when translation is empty', async () => {
      const mockResponse = {
        choices: [
          {
            message: {
              content: '',
            },
          },
        ],
      };

      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      await expect(client.translate('Hello', 'fr')).rejects.toThrow(
        'OpenAI API returned empty translation'
      );
    });

    it('should trim whitespace from translated text', async () => {
      const mockResponse = {
        choices: [
          {
            message: {
              content: '  Bonjour  \n',
            },
          },
        ],
      };

      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const result = await client.translate('Hello', 'fr');
      expect(result).toBe('Bonjour');
    });

    it('should handle Chinese language variants', async () => {
      const mockResponse = {
        choices: [{ message: { content: '你好' } }],
      };

      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      await client.translate('Hello', 'zh-CN');

      const callArgs = firstCall(vi.mocked(fetch).mock.calls);
      const body = JSON.parse(callArgs[1]?.body as string);
      expect(body.messages[0].content).toContain('Simplified Chinese');
    });

    it('should work with custom base URL', async () => {
      const customClient = new OpenAICompatibleClient({
        apiKey: 'custom-key',
        baseUrl: 'https://custom-api.example.com/v1',
        model: 'claude-3-5-sonnet-20241022',
      });

      const mockResponse = {
        choices: [{ message: { content: 'Translated' } }],
      };

      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      await customClient.translate('Test', 'ja');

      expect(fetch).toHaveBeenCalledWith(
        'https://custom-api.example.com/v1/chat/completions',
        expect.any(Object)
      );
    });

    it.each([
      'https://openrouter.ai/api/v1/chat/completions',
      'https://openrouter.ai/api/v1/chat/completions/',
      'https://openrouter.ai/api/v1/',
    ])('should normalize base URL %s', async (inputUrl) => {
      const customClient = new OpenAICompatibleClient({
        apiKey: 'custom-key',
        baseUrl: inputUrl,
        model: 'some-model',
      });

      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: async () => ({ choices: [{ message: { content: 'Translated' } }] }),
      } as Response);

      await customClient.translate('Test', 'ja');

      expect(fetch).toHaveBeenCalledWith(
        'https://openrouter.ai/api/v1/chat/completions',
        expect.any(Object)
      );
    });
  });

  describe('translateBatch', () => {
    const DELIMITER = '===TRANSLATION_SEPARATOR===';

    it('should translate multiple texts in a single request', async () => {
      const mockResponse = {
        choices: [{
          message: {
            content: `Bonjour\n${DELIMITER}\nAu revoir\n${DELIMITER}\nMerci`,
          },
        }],
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

    it('should include numbered texts in user message', async () => {
      const mockResponse = {
        choices: [{
          message: {
            content: `Hola\n${DELIMITER}\nAdiós`,
          },
        }],
      };

      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      await client.translateBatch(['Hello', 'Goodbye'], 'es');

      const callArgs = firstCall(vi.mocked(fetch).mock.calls);
      const body = JSON.parse(callArgs[1]?.body as string);
      expect(body.messages[1].content).toContain('[1] Hello');
      expect(body.messages[1].content).toContain('[2] Goodbye');
    });

    it('should fall back to individual translations on count mismatch', async () => {
      // First call returns mismatched count (batch), subsequent calls return individual translations
      const batchResponse = {
        choices: [{
          message: {
            content: 'Only one translation',
          },
        }],
      };
      const individualResponse1 = {
        choices: [{ message: { content: 'Bonjour' } }],
      };
      const individualResponse2 = {
        choices: [{ message: { content: 'Au revoir' } }],
      };

      vi.mocked(fetch)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => batchResponse,
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => individualResponse1,
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => individualResponse2,
        } as Response);

      const result = await client.translateBatch(['Hello', 'Goodbye'], 'fr');

      expect(result).toEqual(['Bonjour', 'Au revoir']);
      // 1 batch call + 2 individual fallback calls
      expect(fetch).toHaveBeenCalledTimes(3);
    });
  });
});

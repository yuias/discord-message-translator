import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { OpenAICompatibleClient, parseExtraBody, REQUEST_TIMEOUT_MS } from './openai-compatible';

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
        status: 401,
        statusText: 'Unauthorized',
        text: async () => JSON.stringify({
          error: {
            message: 'Invalid API key',
          },
        }),
      } as Response);

      const error = await client.translate('Hello', 'fr').catch((e: unknown) => e);
      expect(error).toBeInstanceOf(Error);
      const message = (error as Error).message;
      expect(message).toContain('OpenAI API Error');
      expect(message).toContain('401');
      expect(message).toContain('Invalid API key');
    });

    it('should include nested error details from the response body', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        text: async () => JSON.stringify({
          error: { message: 'Provider returned error', metadata: { raw: 'upstream detail' } },
        }),
      } as Response);

      await expect(client.translate('Hello', 'fr')).rejects.toThrow('upstream detail');
    });

    it('should trim a non-JSON error body', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: false,
        status: 502,
        statusText: 'Bad Gateway',
        text: async () => '  Bad gateway  ',
      } as Response);

      await expect(client.translate('Hello', 'fr')).rejects.toThrow('Bad gateway');
    });

    it.each([
      ['reasoning_content', { content: '', reasoning_content: 'thinking...' }, undefined],
      ['reasoning', { content: null, reasoning: 'x' }, undefined],
      ['finish_reason length', { content: '' }, 'length'],
    ])('should report exhausted output budget (%s)', async (_label, message, finishReason) => {
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: async () => ({ choices: [{ finish_reason: finishReason, message }] }),
      } as Response);

      await expect(client.translate('Hello', 'fr')).rejects.toThrow('returned no translation');
    });

    it.each([{ choices: [] }, {}])('should report empty translation for %j', async (payload) => {
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: async () => payload,
      } as Response);

      await expect(client.translate('Hello', 'fr')).rejects.toThrow(
        'OpenAI API returned empty translation'
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

  describe('parseExtraBody', () => {
    it.each([undefined, '', '  '])('treats %j as no extra body', (input) => {
      expect(parseExtraBody(input)).toEqual({ ok: true, value: null });
    });

    it('parses a JSON object', () => {
      expect(parseExtraBody('{"a":1}')).toEqual({ ok: true, value: { a: 1 } });
    });

    it.each(['{', '[1]', '1', '"x"', 'null'])('rejects %j', (input) => {
      expect(parseExtraBody(input).ok).toBe(false);
    });
  });

  describe('extra request body', () => {
    const DELIMITER = '===TRANSLATION_SEPARATOR===';

    function clientWithExtra(extraBody: string): OpenAICompatibleClient {
      return new OpenAICompatibleClient({ apiKey, baseUrl, model, extraBody });
    }

    function mockContent(content: string): void {
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: async () => ({ choices: [{ message: { content } }] }),
      } as Response);
    }

    function requestBody(): Record<string, unknown> {
      const callArgs = firstCall(vi.mocked(fetch).mock.calls);
      return JSON.parse(callArgs[1]?.body as string);
    }

    it('merges extra fields and lets them override temperature', async () => {
      mockContent('Bonjour');

      await clientWithExtra('{"reasoning_effort":"low","temperature":0.7}').translate('Hello', 'fr');

      const body = requestBody();
      expect(body.reasoning_effort).toBe('low');
      expect(body.temperature).toBe(0.7);
      expect(body.max_tokens).toBe(1000);
    });

    it('does not let extra fields override model or messages', async () => {
      mockContent('Bonjour');

      await clientWithExtra('{"model":"x","messages":[]}').translate('Hello', 'fr');

      const body = requestBody();
      expect(body.model).toBe(model);
      expect(body.messages).toHaveLength(2);
    });

    it('removes fields set to null', async () => {
      mockContent('Bonjour');

      await clientWithExtra('{"max_tokens":null,"temperature":null}').translate('Hello', 'fr');

      const body = requestBody();
      expect('max_tokens' in body).toBe(false);
      expect('temperature' in body).toBe(false);
      expect(body.model).toBe(model);
      expect(body.messages).toBeDefined();
    });

    it('applies the extra body to translateBatch via the shared path', async () => {
      mockContent(`Bonjour\n${DELIMITER}\nAu revoir`);

      const result = await clientWithExtra('{"max_tokens":null}').translateBatch(['Hello', 'Goodbye'], 'fr');

      expect(result).toEqual(['Bonjour', 'Au revoir']);
      expect('max_tokens' in requestBody()).toBe(false);
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('rejects before fetching when the stored text is invalid', async () => {
      await expect(clientWithExtra('{').translate('Hello', 'fr')).rejects.toThrow(
        'Invalid extra request body'
      );
      expect(fetch).not.toHaveBeenCalled();
    });
  });

  describe('request timeout', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    function signalOf(init: RequestInit | undefined): AbortSignal {
      if (!init?.signal) throw new Error('expected fetch to receive a signal');
      return init.signal;
    }

    const rejectOnAbort = (signal: AbortSignal) =>
      new Promise<never>((_, reject) =>
        signal.addEventListener('abort', () =>
          reject(new DOMException('Aborted', 'AbortError'))));

    it('aborts when headers never arrive', async () => {
      vi.mocked(fetch).mockImplementation((_url, init) => rejectOnAbort(signalOf(init)));

      const promise = client.translate('Hello', 'fr');
      const assertion = expect(promise).rejects.toThrow('LLM did not respond within 120 s');
      await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS);
      await assertion;
    });

    it('aborts when the body read stalls', async () => {
      vi.mocked(fetch).mockImplementation(async (_url, init) => {
        const signal = signalOf(init);
        const json = (): Promise<unknown> => rejectOnAbort(signal);
        return { ok: true, json } as Response;
      });

      const promise = client.translate('Hello', 'fr');
      const assertion = expect(promise).rejects.toThrow('LLM did not respond within 120 s');
      await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS);
      await assertion;
    });

    it('does not fall back to individual requests on timeout', async () => {
      vi.mocked(fetch).mockImplementation((_url, init) => rejectOnAbort(signalOf(init)));

      const promise = client.translateBatch(['Hello', 'Goodbye'], 'fr');
      const assertion = expect(promise).rejects.toThrow('LLM did not respond within 120 s');
      await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS);
      await assertion;
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('passes an abort signal and clears the timer after success', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: async () => ({ choices: [{ message: { content: 'Bonjour' } }] }),
      } as Response);

      await expect(client.translate('Hello', 'fr')).resolves.toBe('Bonjour');

      const callArgs = firstCall(vi.mocked(fetch).mock.calls);
      expect(callArgs[1]?.signal).toBeInstanceOf(AbortSignal);
      expect(vi.getTimerCount()).toBe(0);
    });
  });
});

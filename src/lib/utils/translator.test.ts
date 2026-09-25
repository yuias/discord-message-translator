import { describe, it, expect, beforeEach, vi } from 'vitest';
import { translateMessage } from './translator';

// Mock dependencies
vi.mock('@/lib/cache/factory', () => ({
  createStorage: vi.fn(() => ({
    get: vi.fn(),
    set: vi.fn(),
  })),
}));

vi.mock('./settings', () => ({
  getSettings: vi.fn(),
}));

vi.mock('@/lib/api/google-translate', () => ({
  GoogleTranslateClient: vi.fn().mockImplementation(function () {
    return { translate: vi.fn() };
  }),
}));

vi.mock('@/lib/api/deepl', () => ({
  DeepLClient: vi.fn().mockImplementation(function () {
    return { translate: vi.fn() };
  }),
}));

vi.mock('@/lib/api/openai-compatible', () => ({
  OpenAICompatibleClient: vi.fn().mockImplementation(function () {
    return { translate: vi.fn() };
  }),
}));

import { createStorage } from '@/lib/cache/factory';
import { getSettings } from './settings';
import { GoogleTranslateClient } from '@/lib/api/google-translate';
import { DeepLClient } from '@/lib/api/deepl';
import { OpenAICompatibleClient } from '@/lib/api/openai-compatible';

describe('Translator Utilities', () => {
  let mockStorage: any;
  let mockTranslate: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockStorage = {
      get: vi.fn(),
      set: vi.fn(),
    };

    mockTranslate = vi.fn();

    vi.mocked(createStorage).mockResolvedValue(mockStorage);
    vi.mocked(GoogleTranslateClient).mockImplementation(function () {
      return { translate: mockTranslate } as any;
    });
  });

  describe('translateMessage', () => {
    it('should return cached translation if available', async () => {
      const messageId = 'msg-123';
      const cachedEntry = {
        translations: {
          ja: 'こんにちは',
        },
        timestamp: Date.now(),
      };

      mockStorage.get.mockResolvedValue(cachedEntry);
      vi.mocked(getSettings).mockResolvedValue({
        translationProvider: 'google',
        apiKeys: { google: 'test-key' },
      } as any);

      const result = await translateMessage(messageId, 'Hello', 'ja');

      expect(result).toBe('こんにちは');
      expect(mockTranslate).not.toHaveBeenCalled();
    });

    it('should call Google API and cache result when no cache exists', async () => {
      const messageId = 'msg-456';
      const translation = 'Bonjour';

      mockStorage.get.mockResolvedValue(null);
      mockTranslate.mockResolvedValue(translation);
      vi.mocked(getSettings).mockResolvedValue({
        translationProvider: 'google',
        apiKeys: { google: 'test-key' },
      } as any);

      const result = await translateMessage(messageId, 'Hello', 'fr');

      expect(result).toBe(translation);
      expect(mockTranslate).toHaveBeenCalledWith('Hello', 'fr');
      expect(mockStorage.set).toHaveBeenCalledWith(
        messageId,
        expect.objectContaining({
          translations: {
            fr: translation,
          },
        })
      );
    });

    it('should call DeepL API when provider is deepl', async () => {
      const messageId = 'msg-deepl';
      const translation = 'Hallo';

      mockStorage.get.mockResolvedValue(null);
      const mockDeepLTranslate = vi.fn().mockResolvedValue(translation);
      vi.mocked(DeepLClient).mockImplementation(function () {
        return { translate: mockDeepLTranslate } as any;
      });

      vi.mocked(getSettings).mockResolvedValue({
        translationProvider: 'deepl',
        apiKeys: { deepl: 'test-deepl-key' },
      } as any);

      const result = await translateMessage(messageId, 'Hello', 'de');

      expect(result).toBe(translation);
      expect(mockDeepLTranslate).toHaveBeenCalledWith('Hello', 'de');
    });

    it('should call OpenAI API when provider is openai', async () => {
      const messageId = 'msg-openai';
      const translation = 'こんにちは';

      mockStorage.get.mockResolvedValue(null);
      const mockOpenAITranslate = vi.fn().mockResolvedValue(translation);
      vi.mocked(OpenAICompatibleClient).mockImplementation(function () {
        return { translate: mockOpenAITranslate } as any;
      });

      vi.mocked(getSettings).mockResolvedValue({
        translationProvider: 'openai',
        apiKeys: { openai: 'test-openai-key' },
        openaiConfig: {
          baseUrl: 'https://api.openai.com/v1',
          model: 'gpt-4',
        },
      } as any);

      const result = await translateMessage(messageId, 'Hello', 'ja');

      expect(result).toBe(translation);
      expect(mockOpenAITranslate).toHaveBeenCalledWith('Hello', 'ja');
    });

    it('should throw error if Google API key is not configured', async () => {
      mockStorage.get.mockResolvedValue(null);
      vi.mocked(getSettings).mockResolvedValue({
        translationProvider: 'google',
        apiKeys: {},
      } as any);

      await expect(translateMessage('msg-789', 'Hello', 'ja')).rejects.toThrow(
        'Google Translate API key is not configured'
      );
    });

    it('should throw error if DeepL API key is not configured', async () => {
      mockStorage.get.mockResolvedValue(null);
      vi.mocked(getSettings).mockResolvedValue({
        translationProvider: 'deepl',
        apiKeys: {},
      } as any);

      await expect(translateMessage('msg-deepl', 'Hello', 'ja')).rejects.toThrow(
        'DeepL API key is not configured'
      );
    });

    it('should throw error if OpenAI API is not configured', async () => {
      mockStorage.get.mockResolvedValue(null);
      vi.mocked(getSettings).mockResolvedValue({
        translationProvider: 'openai',
        apiKeys: {},
      } as any);

      await expect(translateMessage('msg-openai', 'Hello', 'ja')).rejects.toThrow(
        'OpenAI API is not configured'
      );
    });

    it('should merge new translation with existing cache', async () => {
      const messageId = 'msg-999';
      const existingCache = {
        translations: {
          ja: 'こんにちは',
        },
        timestamp: Date.now() - 1000,
      };

      mockStorage.get.mockResolvedValue(existingCache);
      mockTranslate.mockResolvedValue('Hola');
      vi.mocked(getSettings).mockResolvedValue({
        translationProvider: 'google',
        apiKeys: { google: 'test-key' },
      } as any);

      await translateMessage(messageId, 'Hello', 'es');

      expect(mockStorage.set).toHaveBeenCalledWith(
        messageId,
        expect.objectContaining({
          translations: {
            ja: 'こんにちは',
            es: 'Hola',
          },
        })
      );
    });
  });
});

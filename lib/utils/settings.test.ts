import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getSettings, updateSettings } from './settings';
import { DEFAULT_SETTINGS } from '@/types/settings';
import { mockedAsync } from '@/vitest.setup';

describe('Settings Utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getSettings', () => {
    it('should return default settings when no settings are stored', async () => {
      mockedAsync(chrome.storage.sync.get).mockResolvedValue({});

      const result = await getSettings();

      expect(result).toEqual(DEFAULT_SETTINGS);
    });

    it('should merge stored settings with defaults', async () => {
      const storedSettings = {
        targetLanguage: 'fr',
        autoTranslate: false,
      };

      mockedAsync(chrome.storage.sync.get).mockResolvedValue(storedSettings);

      const result = await getSettings();

      expect(result).toEqual({
        ...DEFAULT_SETTINGS,
        ...storedSettings,
      });
    });

    it('should return complete settings with API keys', async () => {
      const storedSettings = {
        translationProvider: 'google' as const,
        apiKeys: {
          google: 'test-key-123',
        },
        targetLanguage: 'ja',
      };

      mockedAsync(chrome.storage.sync.get).mockResolvedValue(storedSettings);

      const result = await getSettings();

      expect(result.apiKeys.google).toBe('test-key-123');
      expect(result.translationProvider).toBe('google');
    });
  });

  describe('updateSettings', () => {
    it('should update settings in storage', async () => {
      const updates = {
        targetLanguage: 'de',
        autoTranslate: false,
      };

      mockedAsync(chrome.storage.sync.set).mockResolvedValue(undefined);

      await updateSettings(updates);

      expect(chrome.storage.sync.set).toHaveBeenCalledWith(updates);
    });

    it('should allow partial updates', async () => {
      const updates = {
        cacheTTLDays: 14,
      };

      mockedAsync(chrome.storage.sync.set).mockResolvedValue(undefined);

      await updateSettings(updates);

      expect(chrome.storage.sync.set).toHaveBeenCalledWith(updates);
    });

    it('should update API keys', async () => {
      const updates = {
        apiKeys: {
          google: 'new-api-key',
        },
      };

      mockedAsync(chrome.storage.sync.set).mockResolvedValue(undefined);

      await updateSettings(updates);

      expect(chrome.storage.sync.set).toHaveBeenCalledWith(updates);
    });
  });
});

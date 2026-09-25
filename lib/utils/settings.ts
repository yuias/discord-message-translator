import { Settings, DEFAULT_SETTINGS } from '@/types/settings';

export async function getSettings(): Promise<Settings> {
  const result = await chrome.storage.sync.get(null);
  return {
    ...DEFAULT_SETTINGS,
    ...result,
  } as Settings;
}

export async function updateSettings(updates: Partial<Settings>): Promise<void> {
  // Deep merge for nested objects to prevent overwriting sibling keys
  // chrome.storage.sync.set() only does shallow merge at top level
  const current = await getSettings();

  const merged: Partial<Settings> = {
    ...updates,
  };

  // Deep merge apiKeys object
  if (updates.apiKeys) {
    merged.apiKeys = {
      ...current.apiKeys,
      ...updates.apiKeys,
    };
  }

  // Deep merge openaiConfig object
  if (updates.openaiConfig) {
    merged.openaiConfig = {
      ...current.openaiConfig,
      ...updates.openaiConfig,
    };
  }

  await chrome.storage.sync.set(merged);
}

import type { Settings } from '@/types/settings';
import { updateSettings } from '@/lib/utils/settings';

/**
 * Debounced settings writer. Pending updates are merged (apiKeys and
 * openaiConfig merged one level deep) instead of the last call replacing
 * earlier ones. The old popup dropped an update when two fields changed
 * within the delay.
 */
export function createAutoSaver(
  onError: (error: unknown) => void,
  delayMs = 500
): (updates: Partial<Settings>) => void {
  let pending: Partial<Settings> = {};
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  return (updates: Partial<Settings>): void => {
    const { apiKeys, openaiConfig, ...rest } = updates;
    pending = { ...pending, ...rest };

    if (apiKeys) {
      pending.apiKeys = { ...pending.apiKeys, ...apiKeys };
    }
    if (openaiConfig) {
      pending.openaiConfig = { ...pending.openaiConfig, ...openaiConfig };
    }

    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }

    timeoutId = setTimeout(() => {
      const toSave = pending;
      pending = {};
      timeoutId = null;
      updateSettings(toSave).catch(onError);
    }, delayMs);
  };
}

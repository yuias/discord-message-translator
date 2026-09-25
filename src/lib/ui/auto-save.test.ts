import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('@/lib/utils/settings', () => ({
  updateSettings: vi.fn(),
}));

import { updateSettings } from '@/lib/utils/settings';
import { createAutoSaver } from './auto-save';

describe('createAutoSaver', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('merges two calls within the delay into a single updateSettings call', async () => {
    vi.mocked(updateSettings).mockResolvedValue(undefined);
    const onError = vi.fn();
    const autoSave = createAutoSaver(onError);

    autoSave({ targetLanguage: 'ja' });
    autoSave({ translationMode: 'append' });

    await vi.advanceTimersByTimeAsync(500);

    expect(updateSettings).toHaveBeenCalledTimes(1);
    expect(updateSettings).toHaveBeenCalledWith({
      targetLanguage: 'ja',
      translationMode: 'append',
    });
  });

  it('merges apiKeys one level deep instead of overwriting', async () => {
    vi.mocked(updateSettings).mockResolvedValue(undefined);
    const onError = vi.fn();
    const autoSave = createAutoSaver(onError);

    autoSave({ apiKeys: { google: 'a' } });
    autoSave({ apiKeys: { deepl: 'b' } });

    await vi.advanceTimersByTimeAsync(500);

    expect(updateSettings).toHaveBeenCalledTimes(1);
    expect(updateSettings).toHaveBeenCalledWith({
      apiKeys: { google: 'a', deepl: 'b' },
    });
  });

  it('calls onError when updateSettings rejects', async () => {
    const error = new Error('save failed');
    vi.mocked(updateSettings).mockRejectedValue(error);
    const onError = vi.fn();
    const autoSave = createAutoSaver(onError);

    autoSave({ autoTranslate: false });

    await vi.advanceTimersByTimeAsync(500);
    // Let the rejected promise's .catch(onError) microtask settle.
    await Promise.resolve();
    await Promise.resolve();

    expect(onError).toHaveBeenCalledWith(error);
  });
});

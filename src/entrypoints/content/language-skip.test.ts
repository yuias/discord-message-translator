import { describe, it, expect, vi } from 'vitest';
import { shouldSkipText } from './language-skip';

describe('shouldSkipText', () => {
  it('is a stateless per-call check with no latch: a run of true results does not force later calls to true', async () => {
    const results = [true, true, true, false];
    const isLanguage = vi.fn().mockImplementation(() => Promise.resolve(results.shift()));
    const detector = { isLanguage };

    expect(await shouldSkipText(detector, 'a', 'ja', 0.7)).toBe(true);
    expect(await shouldSkipText(detector, 'b', 'ja', 0.7)).toBe(true);
    expect(await shouldSkipText(detector, 'c', 'ja', 0.7)).toBe(true);
    expect(await shouldSkipText(detector, 'd', 'ja', 0.7)).toBe(false);
  });

  it('returns false when the detector throws', async () => {
    const detector = { isLanguage: vi.fn().mockRejectedValue(new Error('detector failed')) };

    expect(await shouldSkipText(detector, 'hello', 'ja', 0.7)).toBe(false);
  });

  it('forwards minConfidence and targetLanguage to isLanguage', async () => {
    const isLanguage = vi.fn().mockResolvedValue(true);
    const detector = { isLanguage };

    await shouldSkipText(detector, 'hello', 'ja', 0.9);

    expect(isLanguage).toHaveBeenCalledWith('hello', 'ja', 0.9);
  });
});

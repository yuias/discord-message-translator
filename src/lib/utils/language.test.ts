import { describe, it, expect } from 'vitest';
import { baseLanguage, isSameLanguage } from './language';

describe('baseLanguage', () => {
  it('strips the region subtag', () => {
    expect(baseLanguage('zh-TW')).toBe('zh');
  });

  it('lowercases the code', () => {
    expect(baseLanguage('EN')).toBe('en');
    expect(baseLanguage('EN-US')).toBe('en');
  });

  it('returns the code unchanged when there is no region subtag', () => {
    expect(baseLanguage('ja')).toBe('ja');
  });
});

describe('isSameLanguage', () => {
  it('matches codes that share a base language', () => {
    expect(isSameLanguage('en-US', 'en')).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(isSameLanguage('EN-US', 'en')).toBe(true);
  });

  it('rejects different base languages', () => {
    expect(isSameLanguage('en', 'ja')).toBe(false);
  });
});

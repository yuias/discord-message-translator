/** Extracts and lowercases the primary subtag, e.g. 'zh-TW' -> 'zh', 'EN' -> 'en'. */
export function baseLanguage(code: string): string {
  return (code.split('-')[0] ?? code).toLowerCase();
}

/** Compares two language codes by their base language, ignoring region and case. */
export function isSameLanguage(a: string, b: string): boolean {
  return baseLanguage(a) === baseLanguage(b);
}

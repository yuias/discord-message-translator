export function applyI18n(root: Document | HTMLElement = document): void {
  root.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n');
    if (key) {
      const msg = chrome.i18n.getMessage(key);
      if (msg) el.textContent = msg;
    }
  });

  root.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    const key = el.getAttribute('data-i18n-placeholder');
    if (key) {
      const msg = chrome.i18n.getMessage(key);
      if (msg) (el as HTMLInputElement).placeholder = msg;
    }
  });
}

export function t(key: string, substitutions?: string | string[]): string {
  return chrome.i18n.getMessage(key, substitutions) || key;
}

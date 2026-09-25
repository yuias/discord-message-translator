import { MessageTranslationObserver } from './message-observer';

export default defineContentScript({
  matches: ['https://discord.com/*', 'https://*.discord.com/*'],
  runAt: 'document_end',
  main() {
    let observer: MessageTranslationObserver | null = null;

    // Start monitoring when extension launches
    function initializeObserver() {
      if (observer) {
        observer.stop();
      }

      observer = new MessageTranslationObserver();
      observer.start();
    }

    // Initialize after page load complete
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initializeObserver);
    } else {
      initializeObserver();
    }

    // Handle settings changes
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'sync' && changes.autoTranslate) {
        if (changes.autoTranslate.newValue) {
          initializeObserver();
        } else {
          observer?.stop();
        }
      }
    });

    console.log('[Discord Translator] Content script loaded');
  },
});

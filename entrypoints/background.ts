import { ChromeStorageCache } from '@/lib/cache/chrome-storage';
import { DEFAULT_SETTINGS } from '@/types/settings';

export default defineBackground(() => {
  // Initialize on extension install
  chrome.runtime.onInstalled.addListener(async () => {
    console.log('[Background] Extension installed/updated');

    // Save default settings
    const currentSettings = await chrome.storage.sync.get(null);
    if (Object.keys(currentSettings).length === 0) {
      await chrome.storage.sync.set(DEFAULT_SETTINGS);
      console.log('[Background] Default settings initialized');
    }

    // Set up cache cleanup alarm (every hour)
    chrome.alarms.create('cache-cleanup', { periodInMinutes: 60 });
    console.log('[Background] Cache cleanup alarm created');
  });

  // Alarm handler
  chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === 'cache-cleanup') {
      console.log('[Background] Running cache cleanup...');
      const cache = new ChromeStorageCache();
      await cache.cleanupExpired();
      console.log('[Background] Cache cleanup completed');
    }
  });

  console.log('[Background] Service worker started');
});

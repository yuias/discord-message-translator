import { ITranslationStorage } from './types';
import { ChromeStorageCache } from './chrome-storage';

export async function createStorage(): Promise<ITranslationStorage> {
  const settings = await chrome.storage.sync.get(['storageBackend']);
  const backend = settings.storageBackend || 'chrome-storage';

  if (backend === 'indexeddb') {
    // To be implemented in the future
    throw new Error('IndexedDB is not yet implemented');
  }

  return new ChromeStorageCache();
}

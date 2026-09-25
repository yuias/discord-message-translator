import { createStorage } from '@/lib/cache/factory';
import { createTranslationClient } from '@/lib/api/factory';
import { TranslationCacheEntry } from '@/types/cache';
import { getSettings } from './settings';

export async function translateMessage(
  messageId: string,
  text: string,
  targetLang: string
): Promise<string> {
  const storage = await createStorage();

  // Check cache
  const cached = await storage.get(messageId);
  if (cached?.translations[targetLang]) {
    console.log(`[Translator] Cache hit for message ${messageId}`);
    return cached.translations[targetLang];
  }

  // Get settings and create client
  const settings = await getSettings();
  const client = createTranslationClient(settings);

  // Call API
  const translation = await client.translate(text, targetLang);

  // Save to cache
  const entry: TranslationCacheEntry = {
    translations: {
      ...(cached?.translations || {}),
      [targetLang]: translation,
    },
    timestamp: Date.now(),
  };
  await storage.set(messageId, entry);

  console.log(`[Translator] Translated and cached message ${messageId}`);
  return translation;
}

/**
 * Translate multiple messages in a single batch request
 * More efficient than translating individually
 */
export async function translateMessageBatch(
  messages: Array<{ id: string; content: string }>,
  targetLang: string
): Promise<Map<string, string>> {
  const storage = await createStorage();
  const settings = await getSettings();
  const results = new Map<string, string>();

  // Separate cached and uncached messages
  const uncachedMessages: typeof messages = [];
  const uncachedTexts: string[] = [];

  for (const message of messages) {
    const cached = await storage.get(message.id);
    if (cached?.translations[targetLang]) {
      results.set(message.id, cached.translations[targetLang]);
      console.log(`[Translator] Cache hit for message ${message.id}`);
    } else {
      uncachedMessages.push(message);
      uncachedTexts.push(message.content);
    }
  }

  // If all messages are cached, return immediately
  if (uncachedMessages.length === 0) {
    return results;
  }

  // Call batch translation API
  const client = createTranslationClient(settings);
  let translations: string[];

  try {
    translations = await client.translateBatch(uncachedTexts, targetLang);
  } catch (error) {
    console.error('[Translator] Batch translation failed:', error);
    throw error;
  }

  // Save translations to cache and results
  for (let i = 0; i < uncachedMessages.length; i++) {
    const message = uncachedMessages[i];
    const translation = translations[i];

    results.set(message.id, translation);

    // Update cache
    const cached = await storage.get(message.id);
    const entry: TranslationCacheEntry = {
      translations: {
        ...(cached?.translations || {}),
        [targetLang]: translation,
      },
      timestamp: Date.now(),
    };
    await storage.set(message.id, entry);
  }

  console.log(`[Translator] Batch translated and cached ${uncachedMessages.length} messages`);
  return results;
}

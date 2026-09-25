import { getSettings } from '@/lib/utils/settings';
import { translateMessage, translateMessageBatch } from '@/lib/utils/translator';
import { isDiscordMessage, createDiscordMessage, findTranslatableElements, findAllTranslatableElements, TranslatableElement } from './message-utils';
import { RequestQueue, debounce } from '@/lib/utils/async-control';
import { ChromeLanguageDetector } from '@/lib/api/chrome-language-detector';
import { extractBlocks, assembleTranslation, StructuredBlock } from '@/lib/utils/structure-preserving';

/**
 * Generate a unique key for tracking translated elements
 * Uses element's position in DOM to distinguish reply context from main content
 */
function getElementKey(element: HTMLElement): string {
  const messageId = element.id?.match(/^message-content-(\d+)$/)?.[1] || '';
  const isReplyContext = element.closest('[id^="message-reply-context-"]') !== null;
  return `${messageId}-${isReplyContext ? 'reply' : 'main'}`;
}

/**
 * Generate a unique key for TranslatableElement
 */
function getTranslatableElementKey(item: TranslatableElement): string {
  if (item.type === 'message-content') {
    const isReplyContext = item.element.closest('[id^="message-reply-context-"]') !== null;
    return `${item.id}-${isReplyContext ? 'reply' : 'main'}`;
  }
  // For embed sections, use the unique ID directly
  return `embed-${item.id}`;
}

// Configuration constants
const MAX_CONCURRENT_REQUESTS = 3; // Limit concurrent translation API requests
const DEBOUNCE_DELAY = 100; // Debounce delay in milliseconds for batch processing
const BATCH_SIZE = 10; // Number of messages to translate in a single batch

// Language detection constants
const TARGET_LANGUAGE_SKIP_THRESHOLD = 3; // After N consecutive target language detections, skip further checks
const LANGUAGE_DETECTION_MIN_CONFIDENCE = 0.7; // Minimum confidence for language detection

export class MessageTranslationObserver {
  private intersectionObserver: IntersectionObserver;
  private mutationObserver: MutationObserver;
  private observedMessages = new Set<string>(); // Message IDs already being observed
  private translatedMessages = new Set<string>(); // Message IDs already translated (for main content)
  private translatedElements = new Set<string>(); // Element keys already translated (includes reply contexts)
  private translationQueue: RequestQueue; // Request queue for rate limiting
  private pendingMessages: Map<string, HTMLElement> = new Map(); // Messages waiting to be processed
  private processPendingDebounced: () => void;

  // Language detection state (not persisted - resets on page reload)
  private languageDetector: ChromeLanguageDetector | null = null;
  private targetLanguageCount = 0; // Consecutive target language detections
  private skipLanguageDetection = false; // Flag to skip detection after threshold reached

  constructor() {
    // Initialize request queue with concurrency limit
    this.translationQueue = new RequestQueue(MAX_CONCURRENT_REQUESTS);

    // Debounced batch processor
    this.processPendingDebounced = debounce(() => {
      this.processPendingMessages();
    }, DEBOUNCE_DELAY);

    // Intersection Observer: Translate messages that enter the visible area
    this.intersectionObserver = new IntersectionObserver(
      (entries) => {
        // Collect all intersecting messages
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const messageElement = entry.target as HTMLElement;
            const message = createDiscordMessage(messageElement);
            if (message && !this.translatedMessages.has(message.id)) {
              this.pendingMessages.set(message.id, messageElement);
            }
          }
        });

        // Process messages in batches using debounce
        this.processPendingDebounced();
      },
      {
        root: null, // Use viewport as root
        rootMargin: '100px', // Start loading 100px before viewport (prevent flickering during scroll)
        threshold: 0.1, // Trigger when 10% visible
      }
    );

    // Mutation Observer: Detect new messages and register with Intersection Observer
    this.mutationObserver = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const element = node as HTMLElement;

            // Check if the added element is a message container
            if (element.id?.startsWith('chat-messages-')) {
              this.observeMessage(element);
              return;
            }

            // Check if element contains message containers
            const messageContainers = element.querySelectorAll('[id^="chat-messages-"]');
            messageContainers.forEach((container) => {
              this.observeMessage(container as HTMLElement);
            });

            // Fallback: check with isDiscordMessage for legacy compatibility
            if (messageContainers.length === 0 && isDiscordMessage(element)) {
              this.observeMessage(element);
            }
          }
        });
      });
    });
  }

  start() {
    console.log('[MessageObserver] Starting...');

    // Add existing messages to observation list
    // Use multiple selectors for better compatibility
    const existingMessages = document.querySelectorAll(
      '[id^="chat-messages-"], [id^="message-content-"]'
    );
    const uniqueMessages = new Set<HTMLElement>();

    existingMessages.forEach((el) => {
      // If it's a message-content element, find its parent message container
      if (el.id?.startsWith('message-content-')) {
        const messageContainer = el.closest('[id^="chat-messages-"]') as HTMLElement;
        if (messageContainer) {
          uniqueMessages.add(messageContainer);
        } else {
          // No container found, observe the element itself
          uniqueMessages.add(el as HTMLElement);
        }
      } else {
        uniqueMessages.add(el as HTMLElement);
      }
    });

    uniqueMessages.forEach((msg) => this.observeMessage(msg));

    // Monitor new messages
    this.mutationObserver.observe(document.body, {
      childList: true,
      subtree: true,
    });

    console.log(`[MessageObserver] Observing ${uniqueMessages.size} existing messages`);
  }

  private observeMessage(element: HTMLElement) {
    const message = createDiscordMessage(element);
    if (message && !this.observedMessages.has(message.id)) {
      this.observedMessages.add(message.id);
      this.intersectionObserver.observe(element);
    }
  }

  /**
   * Initialize language detector if needed and available
   */
  private async initLanguageDetector(): Promise<boolean> {
    if (this.languageDetector) {
      return true;
    }

    if (!ChromeLanguageDetector.isAvailable()) {
      return false;
    }

    try {
      const status = await ChromeLanguageDetector.checkAvailability();
      if (status === 'unavailable') {
        return false;
      }

      this.languageDetector = new ChromeLanguageDetector();
      return true;
    } catch (error) {
      console.error('[MessageObserver] Failed to initialize language detector:', error);
      return false;
    }
  }

  /**
   * Check if text is in the target language
   * Updates internal counters for skip optimization
   * @returns true if text should be skipped (is in target language)
   */
  private async shouldSkipAsTargetLanguage(
    text: string,
    targetLanguage: string
  ): Promise<boolean> {
    // Skip if we've already detected target language enough times
    if (this.skipLanguageDetection) {
      return true;
    }

    if (!this.languageDetector) {
      return false;
    }

    try {
      const isTarget = await this.languageDetector.isLanguage(
        text,
        targetLanguage,
        LANGUAGE_DETECTION_MIN_CONFIDENCE
      );

      if (isTarget) {
        this.targetLanguageCount++;
        console.log(`[MessageObserver] Target language detected (${this.targetLanguageCount}/${TARGET_LANGUAGE_SKIP_THRESHOLD})`);

        if (this.targetLanguageCount >= TARGET_LANGUAGE_SKIP_THRESHOLD) {
          this.skipLanguageDetection = true;
          console.log('[MessageObserver] Threshold reached, skipping future language detection');
        }
        return true;
      } else {
        // Reset counter if non-target language is detected
        this.targetLanguageCount = 0;
        return false;
      }
    } catch (error) {
      console.error('[MessageObserver] Language detection failed:', error);
      return false;
    }
  }

  /**
   * Process pending messages in batch with rate limiting
   * Uses batch translation API when multiple messages are pending
   */
  private async processPendingMessages() {
    if (this.pendingMessages.size === 0) {
      return;
    }

    const settings = await getSettings();
    if (!settings.autoTranslate) {
      this.pendingMessages.clear();
      return;
    }

    // Initialize language detector if skipTargetLanguage is enabled
    if (settings.skipTargetLanguage) {
      await this.initLanguageDetector();
    }

    // Get all pending messages
    const messagesToProcess = Array.from(this.pendingMessages.entries());
    this.pendingMessages.clear();

    // Filter out already translated messages
    const filteredMessages = messagesToProcess.filter(
      ([messageId]) => !this.translatedMessages.has(messageId)
    );

    if (filteredMessages.length === 0) {
      return;
    }

    console.log(`[MessageObserver] Processing ${filteredMessages.length} messages (queue: ${this.translationQueue.getQueueSize()}, running: ${this.translationQueue.getRunningCount()})`);

    // Process messages in batches for efficiency
    if (filteredMessages.length >= BATCH_SIZE) {
      // Use batch translation for better performance
      this.translationQueue.add(async () => {
        await this.handleVisibleMessagesBatch(filteredMessages, settings);
      }).catch((error) => {
        console.error(`[MessageObserver] Batch translation failed:`, error);
      });
    } else {
      // For small numbers, use individual translation
      for (const [messageId, element] of filteredMessages) {
        this.translationQueue.add(async () => {
          await this.handleVisibleMessage(element, messageId, settings);
        }).catch((error) => {
          console.error(`[MessageObserver] Translation failed for message ${messageId}:`, error);
        });
      }
    }
  }

  /**
   * Handle batch translation for multiple visible messages
   * More efficient than translating individually
   * Translates all translatable elements including reply contexts and embeds
   */
  private async handleVisibleMessagesBatch(
    messagePairs: Array<[string, HTMLElement]>,
    settings: Awaited<ReturnType<typeof getSettings>>
  ) {
    // Check if we should skip all translations due to language detection
    if (settings.skipTargetLanguage && this.skipLanguageDetection) {
      console.log('[MessageObserver] Skipping batch - all messages assumed to be in target language');
      for (const [messageId] of messagePairs) {
        this.translatedMessages.add(messageId);
      }
      return;
    }

    // Collect all translatable elements from all message containers.
    // Each plan is either "simple" (single text blob, existing flow) or
    // "structured" (block-level expansion for main message-content).
    type SimplePlan = {
      kind: 'simple';
      contentId: string;
      content: string;
      element: HTMLElement;
      elementKey: string;
      parentMessageId: string;
      type: 'message-content' | 'embed-section';
    };
    type StructuredPlan = {
      kind: 'structured';
      element: HTMLElement;
      elementKey: string;
      parentMessageId: string;
      blocks: StructuredBlock[];
      blockIds: string[];
    };
    const plans: Array<SimplePlan | StructuredPlan> = [];

    for (const [messageId, container] of messagePairs) {
      if (this.translatedMessages.has(messageId)) {
        continue;
      }

      // Use findAllTranslatableElements to include embeds
      const translatableElements = findAllTranslatableElements(container);

      for (const item of translatableElements) {
        const elementKey = getTranslatableElementKey(item);

        if (this.translatedElements.has(elementKey)) {
          continue;
        }

        const text = item.element.textContent?.trim() || '';

        if (!text) {
          continue;
        }

        // Language detection: check if text is in target language
        if (settings.skipTargetLanguage && this.languageDetector) {
          const shouldSkip = await this.shouldSkipAsTargetLanguage(text, settings.targetLanguage);
          if (shouldSkip) {
            // Mark as translated (skipped) to avoid reprocessing
            this.translatedElements.add(elementKey);
            continue;
          }
        }

        const plan = this.buildTranslationPlan(item, elementKey, messageId, text);
        if (plan) {
          plans.push(plan);
        }
      }
    }

    if (plans.length === 0) {
      // Mark parent messages as processed even if all elements were skipped
      for (const [messageId] of messagePairs) {
        this.translatedMessages.add(messageId);
      }
      return;
    }

    try {
      // Flatten all plans into a unique set of batch entries.
      const uniqueContents = new Map<string, string>();
      const pushUnique = (id: string, content: string) => {
        if (!uniqueContents.has(id)) {
          uniqueContents.set(id, content);
        }
      };
      for (const plan of plans) {
        if (plan.kind === 'simple') {
          pushUnique(plan.contentId, plan.content);
        } else {
          plan.blocks.forEach((b, i) => pushUnique(plan.blockIds[i], b.text));
        }
      }

      const translations = await translateMessageBatch(
        Array.from(uniqueContents.entries()).map(([id, content]) => ({ id, content })),
        settings.targetLanguage
      );

      // Inject translations into all elements
      const translatedParentIds = new Set<string>();

      for (const plan of plans) {
        if (plan.kind === 'simple') {
          const translation = translations.get(plan.contentId);
          if (!translation) continue;
          if (plan.type === 'embed-section') {
            this.injectTranslationToEmbedSection(plan.element, translation, settings.translationMode);
          } else {
            this.injectTranslationToElement(plan.element, translation, settings.translationMode);
          }
          this.translatedElements.add(plan.elementKey);
          translatedParentIds.add(plan.parentMessageId);
        } else {
          const translatedBlocks = plan.blocks.map((b, i) => ({
            block: b,
            translation: translations.get(plan.blockIds[i]) ?? b.text,
          }));
          this.injectStructuredTranslationToElement(
            plan.element,
            translatedBlocks,
            settings.translationMode
          );
          this.translatedElements.add(plan.elementKey);
          translatedParentIds.add(plan.parentMessageId);
        }
      }

      // Mark parent messages as translated
      for (const parentId of translatedParentIds) {
        this.translatedMessages.add(parentId);
      }

      console.log(`[MessageObserver] Batch translated ${plans.length} elements from ${translatedParentIds.size} messages`);
    } catch (error) {
      console.error('[MessageObserver] Batch translation failed:', error);
      throw error;
    }
  }

  /**
   * Decide whether an element should use the simple (text) or structured
   * (block-level) translation flow.
   *
   * Structured flow is used for main message-content elements that contain
   * block-level markup (headings / lists) or multiple paragraphs. Reply
   * contexts and embed sections always use the simple flow.
   */
  private buildTranslationPlan(
    item: TranslatableElement,
    elementKey: string,
    parentMessageId: string,
    fallbackText: string
  ):
    | { kind: 'simple'; contentId: string; content: string; element: HTMLElement; elementKey: string; parentMessageId: string; type: 'message-content' | 'embed-section' }
    | { kind: 'structured'; element: HTMLElement; elementKey: string; parentMessageId: string; blocks: StructuredBlock[]; blockIds: string[] }
    | null {
    const isReplyContext = item.element.closest('[id^="message-reply-context-"]') !== null;

    if (item.type === 'message-content' && !isReplyContext) {
      const blocks = extractBlocks(item.element);
      const hasStructure =
        blocks.length > 1 || blocks.some((b) => b.tagName !== 'p');
      if (hasStructure && blocks.length > 0) {
        const blockIds = blocks.map((_, i) => `${item.id}-b${i}`);
        return {
          kind: 'structured',
          element: item.element,
          elementKey,
          parentMessageId,
          blocks,
          blockIds,
        };
      }
    }

    return {
      kind: 'simple',
      contentId: item.id,
      content: fallbackText,
      element: item.element,
      elementKey,
      parentMessageId,
      type: item.type,
    };
  }

  /**
   * Handle translation for a single visible message
   * Translates all translatable elements including reply context and embeds
   */
  private async handleVisibleMessage(
    element: HTMLElement,
    messageId: string,
    settings: Awaited<ReturnType<typeof getSettings>>
  ) {
    // Check if we should skip all translations due to language detection
    if (settings.skipTargetLanguage && this.skipLanguageDetection) {
      console.log(`[MessageObserver] Skipping message ${messageId} - assumed to be in target language`);
      this.translatedMessages.add(messageId);
      return;
    }

    // Find all translatable elements (main content + reply context + embeds)
    const translatableElements = findAllTranslatableElements(element);

    if (translatableElements.length === 0) {
      return;
    }

    // Process each translatable element
    let translatedAny = false;

    for (const item of translatableElements) {
      const elementKey = getTranslatableElementKey(item);

      // Skip if this specific element is already translated
      if (this.translatedElements.has(elementKey)) {
        continue;
      }

      const text = item.element.textContent?.trim() || '';

      if (!text) {
        continue;
      }

      // Language detection: check if text is in target language
      if (settings.skipTargetLanguage && this.languageDetector) {
        const shouldSkip = await this.shouldSkipAsTargetLanguage(text, settings.targetLanguage);
        if (shouldSkip) {
          // Mark as translated (skipped) to avoid reprocessing
          this.translatedElements.add(elementKey);
          continue;
        }
      }

      const plan = this.buildTranslationPlan(item, elementKey, messageId, text);
      if (!plan) {
        continue;
      }

      try {
        if (plan.kind === 'simple') {
          const translation = await translateMessage(
            plan.contentId,
            plan.content,
            settings.targetLanguage
          );
          if (plan.type === 'embed-section') {
            this.injectTranslationToEmbedSection(plan.element, translation, settings.translationMode);
          } else {
            this.injectTranslationToElement(plan.element, translation, settings.translationMode);
          }
        } else {
          const blockTranslations = await translateMessageBatch(
            plan.blocks.map((b, i) => ({ id: plan.blockIds[i], content: b.text })),
            settings.targetLanguage
          );
          const translatedBlocks = plan.blocks.map((b, i) => ({
            block: b,
            translation: blockTranslations.get(plan.blockIds[i]) ?? b.text,
          }));
          this.injectStructuredTranslationToElement(
            plan.element,
            translatedBlocks,
            settings.translationMode
          );
        }
        this.translatedElements.add(elementKey);
        translatedAny = true;
      } catch (error) {
        console.error(`[MessageObserver] Translation failed for element ${elementKey}:`, error);
        throw error;
      }
    }

    // Mark main message as translated
    this.translatedMessages.add(messageId);
  }

  /**
   * Inject a structure-preserving translation into the content element.
   * Builds a sibling container whose block hierarchy (h1/h2/h3, ul/ol/li, p)
   * mirrors the original, with mentions and channel refs reinserted as live
   * DOM clones.
   */
  private injectStructuredTranslationToElement(
    contentElement: HTMLElement,
    translatedBlocks: Array<{ block: StructuredBlock; translation: string }>,
    mode: 'replace' | 'append'
  ) {
    if (contentElement.querySelector('.discord-translator-translation')) {
      return;
    }

    let originalWrapper = contentElement.querySelector('.discord-translator-original') as HTMLElement | null;
    if (!originalWrapper) {
      originalWrapper = document.createElement('span');
      originalWrapper.className = 'discord-translator-original';
      while (contentElement.firstChild) {
        originalWrapper.appendChild(contentElement.firstChild);
      }
      contentElement.appendChild(originalWrapper);
    }

    const translationContainer = assembleTranslation(translatedBlocks);

    if (mode === 'replace') {
      originalWrapper.style.display = 'none';
      translationContainer.style.marginTop = '0';
    }

    contentElement.appendChild(translationContainer);
  }

  /**
   * Inject translation directly into a specific content element
   * Handles complex message structures (headings, lists, mentions, etc.)
   */
  private injectTranslationToElement(
    contentElement: HTMLElement,
    translation: string,
    mode: 'replace' | 'append'
  ) {
    // Check if already translated (avoid duplicate injections)
    if (contentElement.querySelector('.discord-translator-translation')) {
      return;
    }

    // Check if parent has message-reply-context-* (reply preview context)
    const isReplyContext = contentElement.closest('[id^="message-reply-context-"]') !== null;

    // Create a wrapper for original content if it doesn't exist
    let originalWrapper = contentElement.querySelector('.discord-translator-original') as HTMLElement;
    if (!originalWrapper) {
      // Wrap all existing children in a span for easier manipulation
      originalWrapper = document.createElement('span');
      originalWrapper.className = 'discord-translator-original';
      // Move all children into the wrapper
      while (contentElement.firstChild) {
        originalWrapper.appendChild(contentElement.firstChild);
      }
      contentElement.appendChild(originalWrapper);
    }

    // Create translation element
    const translationSpan = document.createElement('span');
    translationSpan.className = 'discord-translator-translation';
    translationSpan.style.cssText = 'color: #b9bbbe; font-size: 0.95em;';
    translationSpan.textContent = translation;

    if (mode === 'replace') {
      // Replace mode - hide original content and show translation
      originalWrapper.style.display = 'none';
      contentElement.appendChild(translationSpan);
    } else {
      // Append mode - show both original and translation
      if (isReplyContext) {
        // Reply context: inline without line break (space separated)
        contentElement.append(document.createTextNode(' '), translationSpan);
      } else {
        // Normal message: add line break between original and translation
        const br = document.createElement('br');
        contentElement.append(br, translationSpan);
      }
    }
  }

  /**
   * Inject translation into an embed section element
   * Preserves paragraph structure by using separate div for translation
   */
  private injectTranslationToEmbedSection(
    sectionElement: HTMLElement,
    translation: string,
    mode: 'replace' | 'append'
  ) {
    // Check if already translated (avoid duplicate injections)
    if (sectionElement.querySelector('.discord-translator-translation')) {
      return;
    }

    // Create a wrapper for original content if it doesn't exist
    let originalWrapper = sectionElement.querySelector('.discord-translator-original') as HTMLElement;
    if (!originalWrapper) {
      originalWrapper = document.createElement('div');
      originalWrapper.className = 'discord-translator-original';
      // Move all children into the wrapper
      while (sectionElement.firstChild) {
        originalWrapper.appendChild(sectionElement.firstChild);
      }
      sectionElement.appendChild(originalWrapper);
    }

    // Create translation element (use div to preserve block structure)
    const translationDiv = document.createElement('div');
    translationDiv.className = 'discord-translator-translation';
    translationDiv.style.cssText = 'color: #b9bbbe; font-size: 0.95em; margin-top: 4px;';
    translationDiv.textContent = translation;

    if (mode === 'replace') {
      // Replace mode - hide original content and show translation
      originalWrapper.style.display = 'none';
      translationDiv.style.marginTop = '0';
      sectionElement.appendChild(translationDiv);
    } else {
      // Append mode - show both original and translation
      sectionElement.appendChild(translationDiv);
    }
  }

  stop() {
    console.log('[MessageObserver] Stopping...');
    this.intersectionObserver.disconnect();
    this.mutationObserver.disconnect();
    this.observedMessages.clear();
    this.translatedMessages.clear();
    this.translatedElements.clear();
    this.pendingMessages.clear();
    this.translationQueue.clear();

    // Reset language detection state
    this.languageDetector = null;
    this.targetLanguageCount = 0;
    this.skipLanguageDetection = false;
  }
}

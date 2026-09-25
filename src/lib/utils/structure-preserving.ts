/**
 * Block-level structure extraction and reassembly for Discord messages.
 *
 * The translator receives plain text and returns plain text, so we split the
 * message content into block-level units (headings, list items, paragraphs)
 * and translate each one independently. After translation, we rebuild a DOM
 * tree that mirrors the original block structure.
 *
 * Mentions and channel references are replaced with opaque placeholder tokens
 * before translation and reinjected as live DOM clones afterwards, so they
 * remain clickable in the translated output.
 */

// Discord mention selectors. Class suffixes are obfuscated, so we match by
// substring. Channel mentions must be checked first because the generic
// "Mention" pattern would also match channelMention.
const CHANNEL_MENTION_SELECTOR = '[class*="channelMention"]';
const MENTION_SELECTOR = '[class*="roleMention"], [class*="userMention"]';
const HIDDEN_SELECTOR = '[class*="hiddenVisually"]';

// Placeholder tokens wrap an index in section signs so most translation
// engines preserve them verbatim. Keep the format stable; assembleTranslation
// depends on it to match tokens back to DOM clones.
const MENTION_TOKEN = (i: number) => `§M${i}§`;
const CHANNEL_TOKEN = (i: number) => `§C${i}§`;

export type BlockTag = 'h1' | 'h2' | 'h3' | 'p' | 'li';

export interface Placeholder {
  token: string;
  node: Node;
}

export interface StructuredBlock {
  tagName: BlockTag;
  listContext?: 'ul' | 'ol';
  text: string;
  placeholders: Placeholder[];
}

interface ExtractionState {
  mentionCount: number;
  channelCount: number;
  placeholders: Placeholder[];
}

function createSubState(parent: ExtractionState): ExtractionState {
  return {
    mentionCount: parent.mentionCount,
    channelCount: parent.channelCount,
    placeholders: [],
  };
}

function mergeSubState(parent: ExtractionState, sub: ExtractionState) {
  parent.mentionCount = sub.mentionCount;
  parent.channelCount = sub.channelCount;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractTextWithPlaceholders(source: Node, state: ExtractionState): string {
  if (source.nodeType === Node.TEXT_NODE) {
    return source.textContent ?? '';
  }
  if (source.nodeType !== Node.ELEMENT_NODE) {
    return '';
  }

  const el = source as HTMLElement;

  if (el.matches(HIDDEN_SELECTOR)) {
    return '';
  }

  if (el.matches(CHANNEL_MENTION_SELECTOR)) {
    const token = CHANNEL_TOKEN(state.channelCount++);
    state.placeholders.push({ token, node: el.cloneNode(true) });
    return token;
  }

  if (el.matches(MENTION_SELECTOR)) {
    const token = MENTION_TOKEN(state.mentionCount++);
    state.placeholders.push({ token, node: el.cloneNode(true) });
    return token;
  }

  let out = '';
  el.childNodes.forEach((child) => {
    out += extractTextWithPlaceholders(child, state);
  });
  return out;
}

function flushParagraphSegments(
  paragraphText: string,
  paragraphPlaceholders: Placeholder[],
  blocks: StructuredBlock[]
) {
  // Blank-line boundaries within a run of inline nodes become paragraph breaks.
  const segments = paragraphText.split(/\n{2,}/);
  for (const rawSegment of segments) {
    const segment = rawSegment.replace(/\s+/g, ' ').trim();
    if (!segment) continue;
    const usedPlaceholders = paragraphPlaceholders.filter((p) =>
      segment.includes(p.token)
    );
    blocks.push({
      tagName: 'p',
      text: segment,
      placeholders: usedPlaceholders,
    });
  }
}

/**
 * Walk the message-content subtree and return a flat list of structured
 * blocks. Each block carries the text (with placeholder tokens for mentions
 * and channel refs) and the cloned DOM nodes needed to reassemble the output.
 *
 * If the element has already been wrapped by a previous translation run, the
 * wrapper is transparently unwrapped.
 */
export function extractBlocks(contentElement: HTMLElement): StructuredBlock[] {
  const blocks: StructuredBlock[] = [];
  const state: ExtractionState = {
    mentionCount: 0,
    channelCount: 0,
    placeholders: [],
  };

  const root =
    (contentElement.querySelector('.discord-translator-original') as HTMLElement | null) ??
    contentElement;

  let paragraphText = '';
  let paragraphPlaceholders: Placeholder[] = [];

  const flush = () => {
    if (paragraphText.trim()) {
      flushParagraphSegments(paragraphText, paragraphPlaceholders, blocks);
    }
    paragraphText = '';
    paragraphPlaceholders = [];
  };

  const collectHeading = (el: HTMLElement, tag: BlockTag) => {
    const sub = createSubState(state);
    const text = extractTextWithPlaceholders(el, sub).trim();
    mergeSubState(state, sub);
    if (text) {
      blocks.push({ tagName: tag, text, placeholders: sub.placeholders });
    }
  };

  const collectList = (list: HTMLElement, listContext: 'ul' | 'ol') => {
    list.querySelectorAll(':scope > li').forEach((li) => {
      const sub = createSubState(state);
      const text = extractTextWithPlaceholders(li, sub).trim();
      mergeSubState(state, sub);
      if (text) {
        blocks.push({ tagName: 'li', listContext, text, placeholders: sub.placeholders });
      }
    });
  };

  root.childNodes.forEach((child) => {
    if (child.nodeType === Node.TEXT_NODE) {
      paragraphText += child.textContent ?? '';
      return;
    }
    if (child.nodeType !== Node.ELEMENT_NODE) {
      return;
    }
    const el = child as HTMLElement;
    switch (el.tagName) {
      case 'H1':
      case 'H2':
      case 'H3':
        flush();
        collectHeading(el, el.tagName.toLowerCase() as BlockTag);
        return;
      case 'UL':
        flush();
        collectList(el, 'ul');
        return;
      case 'OL':
        flush();
        collectList(el, 'ol');
        return;
      case 'BLOCKQUOTE':
        flush();
        collectHeading(el, 'p');
        return;
      case 'BR':
        paragraphText += '\n';
        return;
      default: {
        // Inline element (span, strong, mention, etc.) — accumulate into the
        // current paragraph buffer.
        const sub = createSubState(state);
        paragraphText += extractTextWithPlaceholders(el, sub);
        mergeSubState(state, sub);
        paragraphPlaceholders.push(...sub.placeholders);
      }
    }
  });

  flush();

  return blocks;
}

function buildInlineFromTranslation(
  translation: string,
  placeholders: Placeholder[]
): DocumentFragment {
  const frag = document.createDocumentFragment();

  if (placeholders.length === 0) {
    frag.appendChild(document.createTextNode(translation));
    return frag;
  }

  const tokensPattern = placeholders.map((p) => escapeRegExp(p.token)).join('|');
  const regex = new RegExp(`(${tokensPattern})`, 'g');
  const parts = translation.split(regex);
  const tokenMap = new Map(placeholders.map((p) => [p.token, p.node]));

  for (const part of parts) {
    if (!part) continue;
    const node = tokenMap.get(part);
    if (node) {
      frag.appendChild(node.cloneNode(true));
    } else {
      frag.appendChild(document.createTextNode(part));
    }
  }
  return frag;
}

/**
 * Build a DOM container that mirrors the original block structure and
 * contains the translated text, with placeholder tokens replaced by cloned
 * mention / channel-reference nodes.
 *
 * Consecutive `li` blocks are grouped into a single `<ul>` or `<ol>`.
 */
export function assembleTranslation(
  translatedBlocks: Array<{ block: StructuredBlock; translation: string }>
): HTMLElement {
  const container = document.createElement('div');
  container.className = 'discord-translator-translation';
  container.style.cssText = 'color: #b9bbbe; font-size: 0.95em; margin-top: 4px;';

  let currentList: HTMLElement | null = null;
  let currentListContext: 'ul' | 'ol' | null = null;

  for (const { block, translation } of translatedBlocks) {
    if (block.tagName === 'li') {
      const listTag = block.listContext ?? 'ul';
      if (!currentList || currentListContext !== listTag) {
        currentList = document.createElement(listTag);
        currentListContext = listTag;
        container.appendChild(currentList);
      }
      const li = document.createElement('li');
      li.appendChild(buildInlineFromTranslation(translation, block.placeholders));
      currentList.appendChild(li);
      continue;
    }

    currentList = null;
    currentListContext = null;
    const el = document.createElement(block.tagName);
    el.appendChild(buildInlineFromTranslation(translation, block.placeholders));
    container.appendChild(el);
  }

  return container;
}

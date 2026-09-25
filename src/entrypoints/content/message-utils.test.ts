import { describe, it, expect } from 'vitest';
import { createDiscordMessage, findAllTranslatableElements } from './message-utils';

function makeMessageContainer(innerHTML: string, messageId = '1026002556297691136'): HTMLElement {
  const li = document.createElement('li');
  li.id = `chat-messages-1010004091340062760-${messageId}`;
  li.innerHTML = innerHTML;
  return li;
}

describe('createDiscordMessage', () => {
  it('returns a message for a typical text message', () => {
    const el = makeMessageContainer(
      '<div id="message-content-1026002556297691136">hello</div>'
    );
    const msg = createDiscordMessage(el);
    expect(msg).not.toBeNull();
    expect(msg?.id).toBe('1026002556297691136');
    expect(msg?.content).toBe('hello');
  });

  it('returns null for a fully empty message (no content, no embed)', () => {
    const el = makeMessageContainer(
      '<div id="message-content-1026002556297691136"></div>'
    );
    expect(createDiscordMessage(el)).toBeNull();
  });

  it('accepts a bot message with only embed payload', () => {
    const el = makeMessageContainer(`
      <div id="message-content-1026002556297691136"></div>
      <div id="message-accessories-1026002556297691136">
        <article class="embed__623de">
          <div class="embedTitle__623de"><span>General Rules</span></div>
          <div class="embedDescription__623de"><span>Read all rules</span></div>
        </article>
      </div>
    `);
    const msg = createDiscordMessage(el);
    expect(msg).not.toBeNull();
    expect(msg?.id).toBe('1026002556297691136');
    // Main content is empty, but the message is still observable.
    expect(msg?.content).toBe('');
  });

  it('rejects a message where accessories exist but all embeds are empty', () => {
    const el = makeMessageContainer(`
      <div id="message-content-1026002556297691136"></div>
      <div id="message-accessories-1026002556297691136">
        <article class="embed__623de">
          <div class="embedTitle__623de"></div>
        </article>
      </div>
    `);
    expect(createDiscordMessage(el)).toBeNull();
  });
});

describe('findAllTranslatableElements (embed discovery)', () => {
  it('finds all embed sections under accessories for a bot embed message', () => {
    const el = makeMessageContainer(`
      <div id="message-content-1026002556297691136"></div>
      <div id="message-accessories-1026002556297691136">
        <article class="embed__623de">
          <div class="embedTitle__623de"><span>General Rules</span></div>
          <div class="embedDescription__623de"><span>intro text</span></div>
          <div class="embedField__623de">
            <div class="embedFieldName__623de"><span>Rule 1</span></div>
            <div class="embedFieldValue__623de"><span>body 1</span></div>
          </div>
        </article>
      </div>
    `);
    const items = findAllTranslatableElements(el);
    const embedItems = items.filter((i) => i.type === 'embed-section');
    // title + description + field name + field value
    expect(embedItems.length).toBeGreaterThanOrEqual(4);
  });
});

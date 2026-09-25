import { describe, it, expect } from 'vitest';
import { extractBlocks, assembleTranslation } from './structure-preserving';

function makeMessageContent(innerHTML: string): HTMLElement {
  const el = document.createElement('div');
  el.id = 'message-content-1';
  el.className = 'markup messageContent';
  el.innerHTML = innerHTML;
  return el;
}

describe('extractBlocks', () => {
  it('extracts a single paragraph when there is no block markup', () => {
    const el = makeMessageContent('<span>Hello world</span>');
    const blocks = extractBlocks(el);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].tagName).toBe('p');
    expect(blocks[0].text).toBe('Hello world');
    expect(blocks[0].placeholders).toHaveLength(0);
  });

  it('splits paragraphs on blank lines', () => {
    const el = makeMessageContent('<span>First line\n\nSecond line</span>');
    const blocks = extractBlocks(el);
    expect(blocks).toHaveLength(2);
    expect(blocks[0].text).toBe('First line');
    expect(blocks[1].text).toBe('Second line');
  });

  it('extracts headings as their own blocks', () => {
    const el = makeMessageContent('<h1>Title</h1><span>Body</span>');
    const blocks = extractBlocks(el);
    expect(blocks).toEqual([
      expect.objectContaining({ tagName: 'h1', text: 'Title' }),
      expect.objectContaining({ tagName: 'p', text: 'Body' }),
    ]);
  });

  it('expands unordered lists into li blocks preserving listContext', () => {
    const el = makeMessageContent('<ul><li>one</li><li>two</li></ul>');
    const blocks = extractBlocks(el);
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toMatchObject({ tagName: 'li', listContext: 'ul', text: 'one' });
    expect(blocks[1]).toMatchObject({ tagName: 'li', listContext: 'ul', text: 'two' });
  });

  it('substitutes role mentions with placeholder tokens', () => {
    const el = makeMessageContent(
      '<span class="roleMention__abc"><span>@Agent</span></span><span> hello</span>'
    );
    const blocks = extractBlocks(el);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].text).toBe('§M0§ hello');
    expect(blocks[0].placeholders).toHaveLength(1);
    expect(blocks[0].placeholders[0].token).toBe('§M0§');
  });

  it('substitutes channel mentions with channel tokens', () => {
    const el = makeMessageContent(
      '<span>see </span><span class="channelMention"><span>#rules</span></span>'
    );
    const blocks = extractBlocks(el);
    expect(blocks[0].text).toBe('see §C0§');
    expect(blocks[0].placeholders[0].token).toBe('§C0§');
  });

  it('drops hiddenVisually nodes used for screen readers', () => {
    const el = makeMessageContent(
      '<h1><span>Title</span><span class="hiddenVisually_xyz">, </span></h1>'
    );
    const blocks = extractBlocks(el);
    expect(blocks[0].text).toBe('Title');
  });

  it('handles a mixed structure like the real Discord example', () => {
    const el = makeMessageContent(`
      <span class="roleMention__x"><span>@Agent</span></span>
      <span> Hi everyone!\n\n</span>
      <h1><span>IF YOU ARE NEW</span></h1>
      <ul>
        <li><span>Please read <span class="channelMention"><span>#rules</span></span> first</span></li>
      </ul>
    `.replace(/\n\s+/g, ''));

    const blocks = extractBlocks(el);
    const tags = blocks.map((b) => b.tagName);
    expect(tags).toEqual(['p', 'h1', 'li']);
    expect(blocks[0].placeholders[0].token).toBe('§M0§');
    expect(blocks[2].placeholders[0].token).toBe('§C0§');
  });

  it('transparently unwraps an existing .discord-translator-original wrapper', () => {
    const el = makeMessageContent(
      '<span class="discord-translator-original"><h1>Hi</h1></span>'
    );
    const blocks = extractBlocks(el);
    expect(blocks).toEqual([expect.objectContaining({ tagName: 'h1', text: 'Hi' })]);
  });
});

describe('assembleTranslation', () => {
  it('creates the translation container with the expected class and style', () => {
    const container = assembleTranslation([]);
    expect(container.className).toBe('discord-translator-translation');
    expect(container.style.color).toBeTruthy();
  });

  it('renders a p block with plain text', () => {
    const container = assembleTranslation([
      { block: { tagName: 'p', text: 'x', placeholders: [] }, translation: 'translated' },
    ]);
    const p = container.querySelector('p');
    expect(p?.textContent).toBe('translated');
  });

  it('groups consecutive li blocks under a single list element', () => {
    const container = assembleTranslation([
      { block: { tagName: 'li', listContext: 'ul', text: 'a', placeholders: [] }, translation: '一' },
      { block: { tagName: 'li', listContext: 'ul', text: 'b', placeholders: [] }, translation: '二' },
    ]);
    expect(container.querySelectorAll('ul')).toHaveLength(1);
    expect(container.querySelectorAll('li')).toHaveLength(2);
    expect(container.querySelectorAll('li')[0].textContent).toBe('一');
  });

  it('starts a new list when listContext changes', () => {
    const container = assembleTranslation([
      { block: { tagName: 'li', listContext: 'ul', text: 'a', placeholders: [] }, translation: 'a' },
      { block: { tagName: 'li', listContext: 'ol', text: 'b', placeholders: [] }, translation: 'b' },
    ]);
    expect(container.querySelectorAll('ul')).toHaveLength(1);
    expect(container.querySelectorAll('ol')).toHaveLength(1);
  });

  it('reinjects placeholder tokens as cloned DOM nodes', () => {
    const mentionNode = document.createElement('span');
    mentionNode.className = 'roleMention__x';
    mentionNode.textContent = '@Agent';

    const container = assembleTranslation([
      {
        block: {
          tagName: 'p',
          text: '§M0§ hi',
          placeholders: [{ token: '§M0§', node: mentionNode }],
        },
        translation: '§M0§ こんにちは',
      },
    ]);

    const p = container.querySelector('p')!;
    const mention = p.querySelector('.roleMention__x');
    expect(mention).not.toBeNull();
    expect(mention?.textContent).toBe('@Agent');
    expect(p.textContent).toBe('@Agent こんにちは');
  });

  it('falls back to text when a placeholder token is absent from translation', () => {
    const mentionNode = document.createElement('span');
    mentionNode.textContent = '@A';
    const container = assembleTranslation([
      {
        block: {
          tagName: 'p',
          text: '§M0§ hi',
          placeholders: [{ token: '§M0§', node: mentionNode }],
        },
        translation: 'translated with no token',
      },
    ]);
    expect(container.textContent).toBe('translated with no token');
  });

  it('renders heading tags from block metadata', () => {
    const container = assembleTranslation([
      { block: { tagName: 'h1', text: 'x', placeholders: [] }, translation: 'Title' },
      { block: { tagName: 'h2', text: 'y', placeholders: [] }, translation: 'Sub' },
    ]);
    expect(container.querySelector('h1')?.textContent).toBe('Title');
    expect(container.querySelector('h2')?.textContent).toBe('Sub');
  });
});

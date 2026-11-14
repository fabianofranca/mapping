import { cleanup, render } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Markdown } from '../../src/ui/markdown/Markdown';

afterEach(cleanup);

const DOC = [
  '# Title',
  '',
  'Text with **strong**, *italic* and `code`.',
  '',
  '- a',
  '  - b',
  '1. one',
  '',
  '| A | B |',
  '| :-- | --: |',
  '| 1 | 2 |',
  '',
  '```ts',
  'const x = 1;',
  '```',
  '',
  '[doc](mapping://material3/button) [web](http://evil.example) [js](javascript:alert(1)) [go](#title)',
  '',
  '<script>alert(1)</script> <img src=x onerror=alert(1)> ![alt](http://evil.example/a.png)',
].join('\n');

describe('Markdown', () => {
  it('renders the elements of the subset', () => {
    const { container } = render(<Markdown text={DOC} />);
    expect(container.querySelector('h1')?.textContent).toBe('Title');
    expect(container.querySelector('strong')?.textContent).toBe('strong');
    expect(container.querySelector('em')?.textContent).toBe('italic');
    expect(container.querySelector('ul ul')).toBeTruthy();
    expect(container.querySelector('ol')).toBeTruthy();
    expect(container.querySelectorAll('thead th')).toHaveLength(2);
    expect(container.querySelectorAll('tbody td')).toHaveLength(2);
    expect(container.querySelector('pre code')?.textContent).toBe('const x = 1;');
  });

  it('never creates script or img; only absolute http(s) becomes a link; HTML appears as text', () => {
    const { container } = render(<Markdown text={DOC} onLink={vi.fn()} />);
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
    for (const a of container.querySelectorAll('a')) {
      expect(a.getAttribute('href')).not.toMatch(/^(javascript|data):/i);
    }
    expect(container.textContent).toContain('<script>alert(1)</script>');
    expect(container.textContent).toContain('<img src=x onerror=alert(1)>');
    expect(container.textContent).toContain('alt');
    expect(container.textContent).toContain('web');
    expect(container.textContent).toContain('js');
  });

  it('onLink only for mapping://', async () => {
    const user = userEvent.setup();
    const onLink = vi.fn();
    const { container } = render(<Markdown text={DOC} onLink={onLink} />);
    const links = [...container.querySelectorAll('a')];
    expect(links).toHaveLength(3);
    await user.click(links.find((a) => a.textContent === 'doc') as HTMLElement);
    expect(onLink).toHaveBeenCalledExactlyOnceWith('mapping://material3/button');
    await user.click(links.find((a) => a.textContent === 'go') as HTMLElement);
    expect(onLink).toHaveBeenCalledTimes(1);
  });

  it('absolute http(s) link opens in another tab, with safe rel; relative ones and anchors stay text', async () => {
    const user = userEvent.setup();
    const onLink = vi.fn();
    const { container } = render(
      <Markdown
        text="[a](https://example.com/x) [b](http://example.com) [rel](other.md) [ftp](ftp://x.com/a)"
        onLink={onLink}
      />,
    );
    const links = [...container.querySelectorAll('a')];
    expect(links.map((a) => a.getAttribute('href'))).toEqual([
      'https://example.com/x',
      'http://example.com',
    ]);
    for (const a of links) {
      expect(a.getAttribute('target')).toBe('_blank');
      expect(a.getAttribute('rel')).toBe('noopener noreferrer');
    }
    expect(container.textContent).toContain('rel');
    expect(container.textContent).toContain('ftp');
    await user.click(links[0] as HTMLElement);
    expect(onLink).not.toHaveBeenCalled();
  });

  it('without onLink, the absolute link stays a link and mapping:// becomes text', () => {
    const { container } = render(
      <Markdown text="[doc](mapping://a/b) [w](https://x.io)" />,
    );
    expect(container.querySelectorAll('a')).toHaveLength(1);
    expect(container.textContent).toBe('doc w');
  });

  it('without onLink, the mapping:// link becomes text', () => {
    const { container } = render(<Markdown text="[doc](mapping://a/b)" />);
    expect(container.querySelector('a')).toBeNull();
    expect(container.textContent).toBe('doc');
  });

  it('anchor focuses the heading of its own document, without colliding between instances', async () => {
    const user = userEvent.setup();
    const text = '[go](#end)\n\n# End';
    const { container } = render(
      <div>
        <Markdown text={text} />
        <Markdown text={text} />
      </div>,
    );
    const ids = [...container.querySelectorAll('h1')].map((h) => h.id);
    expect(new Set(ids).size).toBe(2);
    const second = container.querySelectorAll('.markdown')[1] as HTMLElement;
    await user.click(second.querySelector('a') as HTMLElement);
    expect(document.activeElement).toBe(second.querySelector('h1'));
  });

  it('nonexistent anchor becomes text', () => {
    const { container } = render(<Markdown text="[go](#nothing)" />);
    expect(container.querySelector('a')).toBeNull();
  });

  it('renders the quote (> ) as a blockquote, without the stray sign and without raw HTML', () => {
    const { container } = render(
      <Markdown text={'> `onClick` binds to the logic.\n> Continues.'} />,
    );
    const quote = container.querySelector('blockquote');
    expect(quote?.querySelector('code')?.textContent).toBe('onClick');
    expect(quote?.textContent).not.toContain('>');
  });
});

describe('Markdown › lineBreaks', () => {
  it('without the option, a simple break becomes a space', () => {
    const { container } = render(<Markdown text={'line 1\nline 2'} />);
    expect(container.querySelectorAll('br').length).toBe(0);
    expect(container.querySelector('p')?.textContent).toBe('line 1 line 2');
  });

  it('with lineBreaks, a simple break becomes <br/>', () => {
    const { container } = render(<Markdown text={'line 1\nline 2'} lineBreaks />);
    expect(container.querySelectorAll('p br').length).toBe(1);
    expect(container.querySelector('p')?.textContent).toBe('line 1line 2');
  });
});

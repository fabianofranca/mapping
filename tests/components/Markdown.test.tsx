import { cleanup, render } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Markdown } from '../../src/ui/markdown/Markdown';

afterEach(cleanup);

const DOC = [
  '# Título',
  '',
  'Texto com **forte**, *itálico* e `código`.',
  '',
  '- a',
  '  - b',
  '1. um',
  '',
  '| A | B |',
  '| :-- | --: |',
  '| 1 | 2 |',
  '',
  '```ts',
  'const x = 1;',
  '```',
  '',
  '[doc](mapping://material3/button) [web](http://evil.example) [js](javascript:alert(1)) [ir](#titulo)',
  '',
  '<script>alert(1)</script> <img src=x onerror=alert(1)> ![alt](http://evil.example/a.png)',
].join('\n');

describe('Markdown', () => {
  it('renderiza os elementos do subconjunto', () => {
    const { container } = render(<Markdown text={DOC} />);
    expect(container.querySelector('h1')?.textContent).toBe('Título');
    expect(container.querySelector('strong')?.textContent).toBe('forte');
    expect(container.querySelector('em')?.textContent).toBe('itálico');
    expect(container.querySelector('ul ul')).toBeTruthy();
    expect(container.querySelector('ol')).toBeTruthy();
    expect(container.querySelectorAll('thead th')).toHaveLength(2);
    expect(container.querySelectorAll('tbody td')).toHaveLength(2);
    expect(container.querySelector('pre code')?.textContent).toBe('const x = 1;');
  });

  it('nunca cria script nem img; só http(s) absoluto vira link; HTML aparece como texto', () => {
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

  it('onLink só para mapping://', async () => {
    const user = userEvent.setup();
    const onLink = vi.fn();
    const { container } = render(<Markdown text={DOC} onLink={onLink} />);
    const links = [...container.querySelectorAll('a')];
    expect(links).toHaveLength(3);
    await user.click(links.find((a) => a.textContent === 'doc') as HTMLElement);
    expect(onLink).toHaveBeenCalledExactlyOnceWith('mapping://material3/button');
    await user.click(links.find((a) => a.textContent === 'ir') as HTMLElement);
    expect(onLink).toHaveBeenCalledTimes(1);
  });

  it('link absoluto http(s) abre em outra aba, com rel seguro; relativos e âncoras seguem texto', async () => {
    const user = userEvent.setup();
    const onLink = vi.fn();
    const { container } = render(
      <Markdown
        text="[a](https://exemplo.com/x) [b](http://exemplo.com) [rel](outro.md) [ftp](ftp://x.com/a)"
        onLink={onLink}
      />,
    );
    const links = [...container.querySelectorAll('a')];
    expect(links.map((a) => a.getAttribute('href'))).toEqual([
      'https://exemplo.com/x',
      'http://exemplo.com',
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

  it('sem onLink, o link absoluto continua link e o mapping:// vira texto', () => {
    const { container } = render(
      <Markdown text="[doc](mapping://a/b) [w](https://x.io)" />,
    );
    expect(container.querySelectorAll('a')).toHaveLength(1);
    expect(container.textContent).toBe('doc w');
  });

  it('sem onLink, o link mapping:// vira texto', () => {
    const { container } = render(<Markdown text="[doc](mapping://a/b)" />);
    expect(container.querySelector('a')).toBeNull();
    expect(container.textContent).toBe('doc');
  });

  it('âncora foca o título do próprio documento, sem colidir entre instâncias', async () => {
    const user = userEvent.setup();
    const text = '[ir](#fim)\n\n# Fim';
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

  it('âncora inexistente vira texto', () => {
    const { container } = render(<Markdown text="[ir](#nada)" />);
    expect(container.querySelector('a')).toBeNull();
  });

  it('renderiza a citação (> ) como blockquote, sem o sinal solto e sem HTML cru', () => {
    const { container } = render(
      <Markdown text={'> `onClick` liga à lógica.\n> Segue.'} />,
    );
    const quote = container.querySelector('blockquote');
    expect(quote?.querySelector('code')?.textContent).toBe('onClick');
    expect(quote?.textContent).not.toContain('>');
  });
});

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

  it('nunca cria script, img nem link externo; HTML aparece como texto', () => {
    const { container } = render(<Markdown text={DOC} onLink={vi.fn()} />);
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
    for (const a of container.querySelectorAll('a')) {
      expect(a.getAttribute('href')).not.toMatch(/^(https?|javascript|data):/i);
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
    expect(links).toHaveLength(2);
    await user.click(links.find((a) => a.textContent === 'doc') as HTMLElement);
    expect(onLink).toHaveBeenCalledExactlyOnceWith('mapping://material3/button');
    await user.click(links.find((a) => a.textContent === 'ir') as HTMLElement);
    expect(onLink).toHaveBeenCalledTimes(1);
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
});

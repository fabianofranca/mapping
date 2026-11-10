import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// DS6 (#1468): defeitos de CSS achados na sincronia do DS. O jsdom não mede layout; o teste
// confere as regras.

const read = (file: string) => readFileSync(file, 'utf8');
const rule = (css: string, selector: string): string => {
  const start = css.indexOf(`\n${selector} {`);
  expect(start, selector).toBeGreaterThanOrEqual(0);
  return css.slice(start, css.indexOf('}', start));
};

describe('Notice em linha', () => {
  const css = read('src/theme/review.css');

  it('só a âncora do texto estica; a do X (IconButton) não', () => {
    expect(css).not.toMatch(/\n\.notice-box-line \.tooltip-anchor \{/);
    const anchor = rule(
      css,
      '.notice-box-line > .tooltip-anchor:has(> .notice-box-text)',
    );
    expect(anchor).toMatch(/flex:\s*1/);
  });
});

describe('Notice em linha sem hint (DS7, achado 3)', () => {
  it('o texto estica sozinho, com ou sem a âncora da dica', () => {
    const text = rule(read('src/theme/review.css'), '.notice-box-line .notice-box-text');
    expect(text).toMatch(/flex:\s*1/);
    expect(text).toMatch(/min-width:\s*0/);
  });
});

describe('item da barra de status que abre janela', () => {
  it('herda a cor do item (muted) para o hover ter efeito', () => {
    expect(rule(read('src/theme/review.css'), '.status-item-button')).toMatch(
      /color:\s*inherit/,
    );
  });
});

describe('selo do IconButton', () => {
  it('fica no canto, fora do glifo central (⋯)', () => {
    const badge = rule(read('src/theme/controls.css'), '.icon-button-badge');
    expect(badge).toMatch(/transform:\s*translate\(/);
  });

  // DS7 (#1472, achado 2): a 50% o selo saía ~8px de um botão de 28px numa faixa de 40px.
  it('sai no máximo um quarto de si para fora da caixa do botão', () => {
    const badge = rule(read('src/theme/controls.css'), '.icon-button-badge');
    expect(badge).toMatch(/transform:\s*translate\(25%,\s*-25%\)/);
  });
});

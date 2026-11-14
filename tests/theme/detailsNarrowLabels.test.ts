import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// CL1 (1.3 e 1.4): nos Detalhes a 900 px o (i) dos rótulos longos (Ancorada a, Alinhamento,
// Deslocamento, Modo do desenho) caía sozinho numa linha, o Segmented (Lado, Alinhamento)
// quebrava deixando uma opção sozinha, e o Select cortava "Da direita para a esquerda" sem
// reticências. O jsdom não mede layout: o teste confere as regras do CSS.

const read = (file: string): string => readFileSync(`src/theme/${file}`, 'utf8');
const details = read('details.css');
const controls = read('controls.css');
const review = read('review.css');
const rule = (css: string, selector: string): string => {
  const start = css.indexOf(`\n${selector} {`);
  expect(start, selector).toBeGreaterThanOrEqual(0);
  return css.slice(start, css.indexOf('}', start));
};

describe('rótulo com ícone de ajuda (1.3)', () => {
  it('o rótulo e o (i) ficam na mesma linha: a célula não quebra, o rótulo encolhe', () => {
    const cell = rule(review, '.props-label-cell');
    expect(cell).not.toMatch(/flex-wrap:\s*wrap/);
    const label = rule(review, '.props-label-cell > .props-label');
    expect(label).toMatch(/flex:\s*0?\s*1\s+1?\s*auto|flex:\s*1 1 auto/);
    expect(label).toMatch(/min-width:\s*0/);
  });
});

describe('Segmented nos Detalhes (1.3)', () => {
  it('as opções quebram inteiras (e2e detailsSegmented) e cada linha reparte a largura toda', () => {
    const seg = rule(details, '.props-value > .segmented');
    expect(seg).toMatch(/flex-wrap:\s*wrap/);
    expect(seg).toMatch(/width:\s*100%/);
    const cell = rule(details, '.props-value > .segmented .segmented-cell');
    expect(cell).toMatch(/flex:\s*1\s+1\s+auto/);
  });

  it('o texto da opção não é cortado', () => {
    const text = rule(details, '.props-value > .segmented .segmented-text');
    expect(text).not.toMatch(/text-overflow/);
    expect(text).toMatch(/white-space:\s*nowrap/);
  });
});

describe('Select estreito (1.4)', () => {
  it('o valor longo é cortado com reticências, não em silêncio', () => {
    const control = rule(controls, '.select-control');
    expect(control).toMatch(/text-overflow:\s*ellipsis/);
    expect(control).toMatch(/overflow:\s*hidden/);
    expect(control).toMatch(/white-space:\s*nowrap/);
  });
});

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// CL1 (achado 5.1 da #1533): a 900×720 com Árvore, Propostas e Detalhes abertos a Árvore ficava com
// 156 px e o `.tree-label` de Formulário, Idade e Cadastrar tinha largura 0, sem reticências. O
// jsdom não mede layout; o teste confere a regra: o nome tem piso (e continua cortando com reticências).
const css = readFileSync('src/theme/panels.css', 'utf8');
const start = css.indexOf('\n.tree-label {');
const rule = css.slice(start, css.indexOf('}', start));

describe('nome na árvore estreita', () => {
  it('tem piso de largura pelo token da coluna, em vez de poder chegar a 0', () => {
    expect(start).toBeGreaterThanOrEqual(0);
    expect(rule).toMatch(/min-width:\s*calc\(var\(--size-grid-col-min\)\s*\*\s*0\.5\)/);
    expect(rule).not.toMatch(/min-width:\s*0\s*;/);
  });

  it('o que passa do piso continua cortado com reticências', () => {
    expect(rule).toMatch(/overflow:\s*hidden/);
    expect(rule).toMatch(/text-overflow:\s*ellipsis/);
  });
});

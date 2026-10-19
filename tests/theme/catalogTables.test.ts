import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// B5: as tabelas do Catálogo não quebram palavras no meio e rolam na horizontal dentro do
// próprio contêiner; o aviso de destino fica à vista no topo da área que rola.

const css = readFileSync('src/theme/catalog.css', 'utf8').replace(
  /\/\*[\s\S]*?\*\//g,
  '',
);

function rule(selector: string): string {
  const blocks = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)];
  const found = blocks.filter(([, sel]) =>
    (sel ?? '').split(',').some((part) => part.trim() === selector),
  );
  return found.map(([, , body]) => body).join('\n');
}

describe('tabelas do Catálogo', () => {
  it('não usam overflow-wrap: anywhere nem quebram palavra', () => {
    for (const selector of ['.catalog-table', '.catalog-page .markdown table']) {
      const body = rule(selector);
      expect(body, selector).toMatch(/overflow-wrap:\s*normal/);
      expect(body, selector).toMatch(/word-break:\s*normal/);
      expect(body, selector).not.toMatch(/anywhere|break-all|break-word/);
    }
  });

  it('cabeçalhos e colunas curtas não quebram; o contêiner rola na horizontal', () => {
    expect(rule('.catalog-table th')).toMatch(/white-space:\s*nowrap/);
    expect(rule('.catalog-table td:nth-child(-n + 4)')).toMatch(/white-space:\s*nowrap/);
    for (const selector of ['.catalog-table-wrap', '.catalog-page .markdown-table']) {
      expect(rule(selector), selector).toMatch(/overflow-x:\s*auto/);
    }
  });

  it('o aviso de destino é sticky no topo', () => {
    const body = rule('.catalog-notice');
    expect(body).toMatch(/position:\s*sticky/);
    expect(body).toMatch(/top:\s*0/);
  });
});

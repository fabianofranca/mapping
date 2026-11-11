import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// R24.15 (reteste d): a 900 px o botão do campo de referência fica estreito e a camada do alvo
// (`flex: none`) tomava o espaço do nome, que sumia ("P C…"). O jsdom não mede layout; o teste
// confere a regra: a camada cede primeiro (encolhe antes do nome) e não é rígida.

const css = readFileSync('src/theme/details.css', 'utf8');
const rule = (selector: string): string => {
  const start = css.indexOf(`\n${selector} {`);
  expect(start).toBeGreaterThanOrEqual(0);
  return css.slice(start, css.indexOf('}', start));
};

describe('campo de referência em largura estreita', () => {
  it('a camada do alvo encolhe antes do nome', () => {
    const layer = rule('.ref-control-layer');
    expect(layer).not.toMatch(/flex:\s*none/);
    expect(layer).toMatch(/flex:\s*0\s+\d{2,}\s+auto/);
    expect(layer).toMatch(/min-width:\s*0/);
  });

  // CL1 (achado 2 da #827): com fator 100 o nome ainda perdia ~0,3 px (shrink proporcional ao
  // tamanho) e saía "Plugin…". O fator da camada é tão maior que o do nome que ele não perde nada.
  it('a camada encolhe com fator muito maior que o do nome', () => {
    const shrink = Number(
      /flex:\s*0\s+(\d+)\s+auto/.exec(rule('.ref-control-layer'))?.[1],
    );
    expect(shrink).toBeGreaterThanOrEqual(100_000);
  });
});

// R24.14/R24.15 (achado 3.1 da #954): "(referência quebrada)" aparecia cortado ("(referência qu…")
// a 1280 e a 900 px. O texto da referência quebrada quebra de linha em vez de ser cortado.
describe('célula de referência quebrada', () => {
  it('o texto quebra de linha em vez de ser cortado com reticências', () => {
    const text = rule('.ref-control.is-broken .ref-control-text');
    expect(text).toMatch(/white-space:\s*normal/);
    expect(text).toMatch(/text-overflow:\s*clip/);
    // TE1: quebra entre palavras ("referência" inteira); `anywhere` a partia ao meio.
    expect(text).toMatch(/overflow-wrap:\s*break-word/);
    expect(text).not.toMatch(/overflow-wrap:\s*anywhere/);
  });
});

// CL1 (achado 1 da #827): na célula `ref` da tabela o ✕ de Limpar (que também vem numa âncora de
// Tooltip) ficava com metade da célula e cobria o rótulo; a referência quebrada quebrava em 4 linhas.
describe('célula ref da tabela', () => {
  it('só a âncora do controle estica; os ícones não (célula e campo dos Detalhes)', () => {
    expect(rule('.ref-field > .tooltip-anchor')).toMatch(/flex:\s*none/);
    expect(rule('.ref-field > .tooltip-anchor:first-child')).toMatch(/flex:\s*1/);
    expect(rule('.ref-field.ref-cell > .tooltip-anchor:first-child')).toMatch(
      /flex:\s*1 1 auto/,
    );
  });

  // CL2 (achado 1-R): o mínimo de 216px da coluna fazia a tabela rolar na horizontal.
  it('o controle encolhe dentro da célula, sem largura mínima própria, e o texto quebrado quebra entre palavras', () => {
    expect(rule('.ref-cell .ref-control')).toMatch(/min-width:\s*0/);
    expect(rule('.ref-cell .ref-control .ref-control-text')).toMatch(
      /white-space:\s*normal/,
    );
    const cellText = rule('.ref-cell .ref-control .ref-control-text');
    expect(cellText).toMatch(/overflow-wrap:\s*break-word/);
    expect(cellText).not.toMatch(/overflow-wrap:\s*anywhere/);
    // O `min-width: 0` tira a palavra do mínimo da coluna: a célula quebrada volta ao mínimo do conteúdo.
    expect(rule('.ref-cell .ref-control.is-broken')).toMatch(/min-width:\s*min-content/);
    const cell = rule('.data-grid .grid-cell-value .ref-cell');
    expect(cell).toMatch(/flex-wrap:\s*wrap/);
    expect(cell).toMatch(/min-width:\s*0/);
  });
});

// CD6 (achado 1.1 da #1372, R24.15): a 900 px a coluna `item` ficava com 40 px (o texto quebra em
// qualquer ponto, então o mínimo da coluna `1fr` era ~0) e o rótulo caía em 3 linhas ("Plu/gin/A").
// O piso sozinho (96 px) fazia a tabela rolar na horizontal; a célula com o campo de referência ganha
// 0,85 do token e os inputs de texto da tabela 0,75, o que cabe nos Detalhes de 900 px (e2e em refAnnotation).
describe('coluna de referência da tabela em largura estreita', () => {
  it('a célula com ref-cell tem piso de largura pelo token da coluna', () => {
    const cell = rule('.data-grid .grid-cell-value:has(> .ref-cell)');
    expect(cell).toMatch(/min-width:\s*calc\(var\(--size-grid-col-min\)\s*\*\s*0\.85\)/);
  });
});

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
    expect(text).toMatch(/overflow-wrap:\s*anywhere/);
  });
});

// CL1 (achado 1 da #827): na célula `ref` da tabela o ✕ de Limpar (que também vem numa âncora de
// Tooltip) ficava com metade da célula e cobria o rótulo; a referência quebrada quebrava em 4 linhas.
describe('célula ref da tabela', () => {
  it('só a âncora do controle estica; o ✕ não', () => {
    expect(rule('.ref-field.ref-cell > .tooltip-anchor:not(:first-child)')).toMatch(
      /flex:\s*none/,
    );
  });

  it('o controle encolhe dentro da célula e o texto quebrado fica numa linha', () => {
    expect(rule('.ref-cell .ref-control')).toMatch(/min-width:\s*0/);
    expect(rule('.ref-cell .ref-control.is-broken .ref-control-text')).toMatch(
      /white-space:\s*nowrap/,
    );
    expect(rule('.data-grid .grid-cell-value .ref-cell')).toMatch(/nowrap/);
  });
});

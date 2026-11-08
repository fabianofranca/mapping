import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// R24.15 (reteste d): a 900 px o botão do campo de referência fica estreito e a camada do alvo
// (`flex: none`) tomava o espaço do nome, que sumia ("P C…"). O jsdom não mede layout; o teste
// confere a regra: a camada cede primeiro (encolhe antes do nome) e não é rígida.

const css = readFileSync('src/theme/details.css', 'utf8');
const rule = (selector: string): string => {
  const start = css.indexOf(`${selector} {`);
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
});

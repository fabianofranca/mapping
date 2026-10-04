import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';

// R3: o canvas não tem cor, família de fonte nem opacidade fixas; tudo vem de
// `readCanvasTokens` (src/canvas/theme.ts). Medidas geométricas (espessura de linha,
// distâncias em px de tela) continuam em `renderers/metrics.ts` e nos renderers.

const DIR = 'src/canvas/renderers';
const files = readdirSync(DIR).filter((f) => f.endsWith('.ts'));

/** Código sem comentários (eles podem citar valores). */
function code(file: string): string {
  return readFileSync(`${DIR}/${file}`, 'utf8')
    .replaceAll(/\/\*[\s\S]*?\*\//g, '')
    .replaceAll(/^\s*\/\/.*$/gm, '');
}

describe('renderers do canvas sem valores de design fixos', () => {
  it.each(files)('%s: nenhuma cor literal', (file) => {
    expect(code(file)).not.toMatch(/#[0-9a-fA-F]{3,8}\b|\b(rgb|rgba|hsl|hsla)\(/);
  });

  it.each(files)('%s: família de fonte e opacidade vêm dos tokens', (file) => {
    const source = code(file);
    expect(source).not.toMatch(/fontFamily:\s*['"`]/);
    expect(source).not.toMatch(/\bopacity:\s*[0-9.]+\s*[,}]/);
    expect(source).not.toMatch(/\.opacity\(\s*[0-9.]+\s*\)/);
  });
});

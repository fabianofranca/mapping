import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';

// R3: the canvas has no fixed color, font family or opacity; everything comes from
// `readCanvasTokens` (src/canvas/theme.ts). Geometric measures (line thickness,
// distances in screen px) stay in `renderers/metrics.ts` and in the renderers.

const DIR = 'src/canvas/renderers';
const files = readdirSync(DIR).filter((f) => f.endsWith('.ts'));

/** Code without comments (they may cite values). */
function code(file: string): string {
  return readFileSync(`${DIR}/${file}`, 'utf8')
    .replaceAll(/\/\*[\s\S]*?\*\//g, '')
    .replaceAll(/^\s*\/\/.*$/gm, '');
}

describe('canvas renderers without fixed design values', () => {
  it.each(files)('%s: nenhuma cor literal', (file) => {
    expect(code(file)).not.toMatch(/#[0-9a-fA-F]{3,8}\b|\b(rgb|rgba|hsl|hsla)\(/);
  });

  it.each(files)('%s: font family and opacity come from the tokens', (file) => {
    const source = code(file);
    expect(source).not.toMatch(/fontFamily:\s*['"`]/);
    expect(source).not.toMatch(/\bopacity:\s*[0-9.]+\s*[,}]/);
    expect(source).not.toMatch(/\.opacity\(\s*[0-9.]+\s*\)/);
  });
});

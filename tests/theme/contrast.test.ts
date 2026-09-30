import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const tokens = readFileSync('src/theme/tokens.css', 'utf8');

type Palette = Record<string, string>;

/** Variáveis `--color-*` de um bloco do tokens.css (pelo seletor que o abre). */
function palette(selector: string): Palette {
  const start = tokens.indexOf(selector);
  const block = tokens.slice(tokens.indexOf('{', start) + 1, tokens.indexOf('}', start));
  return Object.fromEntries(
    [...block.matchAll(/--color-([\w-]+):\s*(#[0-9a-f]{6})/gi)].map((m) => [m[1], m[2]]),
  ) as Palette;
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

// [primeiro plano, fundo, mínimo WCAG]: 4.5 para texto, 3 para elementos gráficos.
const PAIRS: readonly [string, string, number][] = [
  ['text', 'bg', 4.5],
  ['text', 'surface', 4.5],
  ['text', 'canvas-bg', 4.5],
  ['text-muted', 'bg', 4.5],
  ['text-muted', 'surface', 4.5],
  ['text-muted', 'canvas-bg', 4.5],
  ['accent-text', 'accent', 4.5],
  ['danger', 'danger-bg', 4.5],
  ['danger', 'surface', 4.5],
  ['danger', 'bg', 4.5],
  ['warning', 'warning-bg', 4.5],
  ['text', 'warning-bg', 4.5],
  ['accent', 'surface', 3],
  ['accent', 'bg', 3],
  ['marking', 'canvas-bg', 3],
];

describe.each([
  ['claro', ':root {'],
  ['escuro', ":root[data-theme='dark']"],
])('contraste no tema %s', (_name, selector) => {
  const colors = palette(selector);

  it.each(PAIRS)('%s sobre %s ≥ %s', (fg, bg, min) => {
    expect(colors[fg], fg).toBeDefined();
    expect(colors[bg], bg).toBeDefined();
    expect(contrast(colors[fg]!, colors[bg]!)).toBeGreaterThanOrEqual(min);
  });
});

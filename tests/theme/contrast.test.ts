import { describe, expect, it } from 'vitest';
import { LAYER_COLORS, tokenValue } from '../../src/theme/tokens';

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
// Pares da seção Contraste do design system 2.0 (docs/redesign/HANDOFF.md).
const PAIRS: readonly [string, string, number][] = [
  ['text', 'bg', 4.5],
  ['text', 'surface', 4.5],
  ['text', 'canvas-bg', 4.5],
  ['text', 'selection', 4.5],
  ['text', 'warning-bg', 4.5],
  ['text-muted', 'bg', 4.5],
  ['text-muted', 'surface', 4.5],
  ['text-muted', 'canvas-bg', 4.5],
  ['text-muted', 'pressed', 4.5],
  ['text', 'selection-muted', 4.5],
  ['text-muted', 'selection-muted', 4.5],
  ['text', 'hover', 4.5],
  ['danger', 'hover', 4.5],
  ['text-muted', 'selection', 4.5],
  ['accent-text', 'accent', 4.5],
  ['accent-text', 'accent-hover', 4.5],
  ['accent-text', 'accent-pressed', 4.5],
  ['accent', 'surface', 4.5],
  ['accent', 'bg', 4.5],
  ['danger', 'danger-bg', 4.5],
  ['danger', 'surface', 4.5],
  ['danger', 'bg', 4.5],
  ['warning', 'warning-bg', 4.5],
  ['success', 'success-bg', 4.5],
  ['tooltip-text', 'tooltip', 4.5],
  // Limite de controle (campos, botões, selos): 3:1 sobre os fundos onde aparece.
  ['border-control', 'surface', 3],
  ['border-control', 'bg', 3],
  ['border-control', 'hover', 3],
  ['accent', 'surface', 3],
  ['accent', 'bg', 3],
];

describe('canvas (iguais nos dois temas)', () => {
  const cv = (name: string) => tokenValue(name, 'light');

  it('texto da etiqueta do nome sobre cv-name-tag ≥ 4,5', () => {
    expect(contrast(cv('cv-name-tag-text'), cv('cv-select'))).toBeGreaterThanOrEqual(4.5);
  });

  it('cv-name-tag segue cv-select', () => {
    expect(cv('cv-name-tag')).toBe('var(--cv-select)');
  });
});

describe.each(['light', 'dark'] as const)('contraste no tema %s', (theme) => {
  const color = (name: string) => tokenValue(`color-${name}`, theme);

  it.each(PAIRS)('%s sobre %s ≥ %s', (fg, bg, min) => {
    expect(contrast(color(fg), color(bg))).toBeGreaterThanOrEqual(min);
  });

  it.each(LAYER_COLORS.map((c, i) => [i + 1, c] as const))(
    'camada %i (%s) sobre surface ≥ 3',
    (_n, hex) => {
      expect(contrast(hex, color('surface'))).toBeGreaterThanOrEqual(3);
    },
  );
});

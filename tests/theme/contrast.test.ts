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

// [foreground, background, WCAG minimum]: 4.5 for text, 3 for graphic elements.
// Pairs of the Contrast section of the design system (docs/DESIGN-SYSTEM.md).
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
  ['thread-human', 'thread-human-bg', 4.5],
  ['thread-agent', 'thread-agent-bg', 4.5],
  ['thread-resolved', 'thread-resolved-bg', 4.5],
  ['tooltip-text', 'tooltip', 4.5],
  // Control boundary (fields, buttons, badges): 3:1 over the backgrounds where it appears.
  ['border-control', 'surface', 3],
  ['border-control', 'bg', 3],
  ['border-control', 'hover', 3],
  ['accent', 'surface', 3],
  ['accent', 'bg', 3],
];

describe.each(['light', 'dark'] as const)('canvas marking in the %s theme', (theme) => {
  const canvasBg = tokenValue('color-canvas-bg', theme);

  it.each(['cv-canvas-marking', 'cv-absorb', 'cv-select-secondary', 'cv-arrow'])(
    '%s over the canvas background ≥ 3',
    (name) => {
      expect(contrast(tokenValue(name, theme), canvasBg)).toBeGreaterThanOrEqual(3);
    },
  );
});

/** `cv-*` color ('#rrggbb' or 'rgba(r, g, b, a)') as [r, g, b, a]. */
function rgba(value: string): [number, number, number, number] {
  if (value.startsWith('#')) {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(value.slice(i, i + 2), 16));
    return [r!, g!, b!, 1];
  }
  const [r, g, b, a] = value.match(/[\d.]+/g)!.map(Number);
  return [r!, g!, b!, a ?? 1];
}

/** '#rrggbb' of `fg` (with alpha) painted over the opaque `bg`. */
function over(fg: string, bg: string): string {
  const [r, g, b, a] = rgba(fg);
  const base = rgba(bg);
  const mix = [r, g, b].map((v, i) => Math.round(v * a + base[i]! * (1 - a)));
  return `#${mix.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

// Selection rectangle (Shift+drag): `cv-select` border over a `cv-halo` halo. In the light theme the
// border alone does not reach 3:1 over the canvas (the blue is light); what separates the rectangle from the
// canvas is the halo, dark. In the dark one it is the border. The silhouette passes 3:1 in both themes.
describe.each(['light', 'dark'] as const)(
  'selection rectangle with halo in the %s theme',
  (theme) => {
    const canvasBg = tokenValue('color-canvas-bg', theme);
    const border = tokenValue('cv-select', theme);
    const halo = over(tokenValue('cv-halo', theme), canvasBg);

    it('the silhouette (the halo or the border) stands out from the empty canvas at ≥ 3', () => {
      const silhouette = Math.max(contrast(border, canvasBg), contrast(halo, canvasBg));
      expect(silhouette).toBeGreaterThanOrEqual(3);
    });

    it('without the halo, only the light theme would be below 3 (that is why the halo)', () => {
      const borderAlone = contrast(border, canvasBg) >= 3;
      expect(borderAlone).toBe(theme === 'dark');
    });
  },
);

describe('canvas (iguais nos dois temas)', () => {
  const cv = (name: string) => tokenValue(name, 'light');

  it('name tag text over cv-name-tag ≥ 4.5', () => {
    expect(contrast(cv('cv-name-tag-text'), cv('cv-select'))).toBeGreaterThanOrEqual(4.5);
  });

  it('cv-name-tag segue cv-select', () => {
    expect(cv('cv-name-tag')).toBe('var(--cv-select)');
  });
});

describe.each(['light', 'dark'] as const)('contrast in the %s theme', (theme) => {
  const color = (name: string) => tokenValue(`color-${name}`, theme);

  it.each(PAIRS)('%s over %s ≥ %s', (fg, bg, min) => {
    expect(contrast(color(fg), color(bg))).toBeGreaterThanOrEqual(min);
  });

  it.each(LAYER_COLORS.map((c, i) => [i + 1, c] as const))(
    'layer %i (%s) over surface ≥ 3',
    (_n, hex) => {
      expect(contrast(hex, color('surface'))).toBeGreaterThanOrEqual(3);
    },
  );
});

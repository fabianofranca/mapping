// Stage #1743 (RC1): the carousel label must be legible over the image placeholder.
// The Catalog never loads a remote image, so the item always appears as a placeholder: `CCC8CE` (light app),
// `48474C` (dark app), `C2BFC4` and `6A696C` (MCP PNG). The test reads the carousel scene in both modes and in the
// three styles, takes the veil alpha at the top of the text box of the label (`rótulo`), composes the `scrim` over each placeholder
// and checks contrast ≥ 4.5:1 (WCAG AA) against the label color (`secondary-fixed`).
import { describe, expect, it } from 'vitest';
import { buildCatalog, findEntry } from '../../src/model/catalog';
import { absoluteBoxes, walk } from '../../src/model/components/scene';
import type { SceneNode } from '../../src/model/components/scene';
import { drawIn, files, spec } from '../support/material3Library';

const catalog = buildCatalog(files);
const entry = findEntry(catalog, 'carousel')!;
type Values = Parameters<typeof drawIn>[2];
type Mode = 'light' | 'dark';
type Drawing = ReturnType<typeof drawIn>;

const STYLES = ['multi-browse', 'uncontained', 'centered-hero'] as const;
const MODES: Mode[] = ['light', 'dark'];
/** The image placeholders: the app's (`palette.ts`, over the token) and the MCP PNG's (`sceneRaster.ts`). */
const PLACEHOLDERS = ['#CCC8CE', '#48474C', '#C2BFC4', '#6A696C'] as const;
const MIN_CONTRAST = 4.5;

const tokens = spec.tokens!.values as Record<string, string | Record<Mode, string>>;
const tok = (name: string, mode: Mode): string => {
  const value = tokens[name]!;
  return typeof value === 'string' ? value : value[mode];
};

const rgb = (hex: string): [number, number, number] => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];
const luminance = (c: readonly number[]): number => {
  const [r, g, b] = c.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: readonly number[], b: readonly number[]): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
};
const over = (top: readonly number[], alpha: number, base: readonly number[]): number[] =>
  top.map((v, i) => v * alpha + base[i]! * (1 - alpha));

const items = (): Values =>
  ({
    items: Array.from({ length: 3 }, (_, i) => ({
      image: `https://example.com/${i}.jpg`,
      label: `Item ${i}`,
    })),
  }) as unknown as Values;

const named = (d: Drawing, name: string): SceneNode => {
  for (const node of walk(d.root)) if (node.name === name && node.visible) return node;
  throw new Error(`node missing: ${name}`);
};

/** The veil alpha (linear gradient) at a point `y` of its local space, by projection on the gradient axis. */
function veilAlphaAt(veil: SceneNode, y: number): number {
  const paint = veil.fills[0];
  if (paint?.type !== 'linear') throw new Error('the veil is not a gradient');
  const dy = paint.end.y - paint.start.y;
  const t = dy === 0 ? 0 : Math.min(1, Math.max(0, (y - paint.start.y) / dy));
  const stops = [...paint.stops].sort((a, b) => a.offset - b.offset);
  const alphaOf = (c: string): number =>
    c.length === 9 ? parseInt(c.slice(7), 16) / 255 : 1;
  const before = [...stops].reverse().find((s) => s.offset <= t) ?? stops[0]!;
  const after = stops.find((s) => s.offset >= t) ?? stops[stops.length - 1]!;
  if (after.offset === before.offset) return alphaOf(before.color);
  const k = (t - before.offset) / (after.offset - before.offset);
  return alphaOf(before.color) * (1 - k) + alphaOf(after.color) * k;
}

// pt-BR kept: 'véu' (veil) and 'rótulo' (label) are node names of the frozen material3 fixture package (tests/fixtures/material3)
describe('carousel — label legible over the placeholder (#1743)', () => {
  for (const style of STYLES) {
    for (const mode of MODES) {
      it(`${style}, ${mode}: label contrast ≥ 4.5:1 over the scrim over the four placeholders`, () => {
        const d = drawIn(catalog, entry, { ...items(), style }, mode);
        const veil = named(d, 'véu');
        const label = named(d, 'rótulo');
        const boxes = absoluteBoxes(d.root);
        const veilBox = boxes.get(veil.id)!;
        const labelBox = boxes.get(label.id)!;
        // The worst point of the text box is its top (where the veil is most transparent).
        const alpha = veilAlphaAt(veil, labelBox.y - veilBox.y);
        const scrim = rgb(tok('scrim', mode).slice(0, 7));
        const text = rgb(tok('secondary-fixed', mode).slice(0, 7));
        for (const placeholder of PLACEHOLDERS) {
          const ratio = contrast(text, over(scrim, alpha, rgb(placeholder)));
          expect(ratio, `${placeholder} with alpha ${alpha}`).toBeGreaterThanOrEqual(
            MIN_CONTRAST,
          );
        }
      });
    }
  }

  it('the veil is solid in the bottom 36 px and fades out at the top (0.55 up to 0.75 and 0 at 1)', () => {
    const d = drawIn(catalog, entry, { ...items(), style: 'multi-browse' }, 'light');
    const veil = named(d, 'véu');
    expect(veilAlphaAt(veil, 48)).toBeCloseTo(0.55, 2);
    expect(veilAlphaAt(veil, 12)).toBeCloseTo(0.55, 2);
    expect(veilAlphaAt(veil, 0)).toBeCloseTo(0, 2);
  });
});

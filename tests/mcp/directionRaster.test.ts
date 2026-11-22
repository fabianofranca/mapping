// R1 (#1096): the MCP raster draws the rtl mirror (matrix with negative scaleX) of the icon and of the
// path in the right box (fill, stroke, dashed and cap) and puts rtl text on the physical side of
// `align`. Stage #2448 (BD1): the glyphs of a mixed-direction line come out in visual order (UAX #9). Pixel parity
// with Konva is in tests/e2e/directionParity.spec.ts.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRaster, type Raster } from '../../mcp/image/raster';
import { paintScene } from '../../mcp/image/sceneRaster';
import { textBars } from '../../mcp/image/textBars';
import { createFontBook, measurerFor } from '../../mcp/image/textMeasurer';
import { COMPONENT_FORMAT } from '../../src/model/components/componentFormat';
import type { IconSet } from '../../src/model/components/icons';
import { approximateMeasurer, instantiate } from '../../src/model/components/instantiate';
import { baseNode, type Scene, type TextNode } from '../../src/model/components/scene';

type Json = Record<string, unknown>;

const book = createFontBook();
const measure = measurerFor(book);

const icons: IconSet = {
  viewBox: [24, 24],
  icons: {
    back: { mirror: true, paths: [{ d: 'M2 4L20 4L20 10L2 10Z', fill: true }] },
    line: {
      mirror: true,
      paths: [{ d: 'M2 12L20 12', stroke: true, width: 4, cap: 'butt' }],
    },
  },
} as never;

function sceneOf(child: Json, direction: 'rtl' | undefined): Scene {
  const file = {
    format: COMPONENT_FORMAT,
    formatVersion: 4,
    id: 'c',
    name: 'C',
    size: { width: 60, height: 40 },
    template: { type: 'frame', layout: { type: 'none' }, children: [child] },
  };
  return instantiate(
    file as never,
    {},
    { x: 0, y: 0, width: 60, height: 40 },
    { measure: approximateMeasurer, icons, ...(direction ? { direction } : {}) },
  );
}

/** The columns [left, right) with ink (any dark pixel). */
function ink(scene: Scene): { left: number; right: number } {
  const raster: Raster = createRaster(60, 40);
  raster.data.fill(255);
  paintScene(raster, [{ root: scene.root }], measure, {
    scaleX: 1,
    scaleY: 1,
    clip: { x: 0, y: 0, width: 60, height: 40 },
    fonts: book,
  });
  let left = Infinity;
  let right = -Infinity;
  for (let y = 0; y < 40; y++)
    for (let x = 0; x < 60; x++)
      if (raster.data[(y * 60 + x) * 4 + 1]! < 128) {
        left = Math.min(left, x);
        right = Math.max(right, x + 1);
      }
  return { left, right };
}

const icon = (name: string): Json => ({
  type: 'icon',
  name,
  width: 24,
  height: 24,
  color: '#000000',
});
const path = (extra: Json): Json => ({
  type: 'path',
  name: 'p',
  d: 'M2 0L20 0L20 10L2 10Z',
  viewBox: [24, 10],
  width: 48,
  height: 20,
  mirror: true,
  ...extra,
});

describe('raster: the mirror of the icon and of the path in the same box', () => {
  it('icon with fill: x from 2 to 20 in ltr; mirrored in the node box in rtl', () => {
    expect(ink(sceneOf(icon('back'), undefined))).toEqual({ left: 2, right: 20 });
    expect(ink(sceneOf(icon('back'), 'rtl'))).toEqual({ left: 40, right: 58 });
  });

  it('icon with stroke (butt cap): mirrors the stroke', () => {
    expect(ink(sceneOf(icon('line'), undefined))).toEqual({ left: 2, right: 20 });
    expect(ink(sceneOf(icon('line'), 'rtl'))).toEqual({ left: 40, right: 58 });
  });

  it('path with fill: box 4 to 40 in ltr, 20 to 56 in rtl', () => {
    const fill = path({ fill: '#000000' });
    expect(ink(sceneOf(fill, undefined))).toEqual({ left: 4, right: 40 });
    expect(ink(sceneOf(fill, 'rtl'))).toEqual({ left: 20, right: 56 });
  });

  it('dashed path: the dash starts at the mirrored end (butt and round)', () => {
    const line = (cap: string) =>
      path({
        d: 'M2 5L20 5',
        stroke: { color: '#000000', width: 4, cap, dash: [10, 10] },
      });
    // the path goes from x=4 to x=40 (viewBox 24 → 48); the first dash (10 of the viewBox = 20 px) starts at the beginning
    const butt = (d?: 'rtl') => ink(sceneOf(line('butt'), d));
    expect(butt()).toEqual({ left: 4, right: 24 });
    expect(butt('rtl')).toEqual({ left: 36, right: 56 });
    const round = (d?: 'rtl') => ink(sceneOf(line('round'), d));
    expect(round()).toEqual({ left: 2, right: 26 });
    expect(round('rtl')).toEqual({ left: 34, right: 58 });
  });
});

function textNode(align: TextNode['style']['align'], direction?: 'rtl'): TextNode {
  return {
    ...baseNode({
      id: 't',
      name: 't',
      width: 60,
      height: 20,
      fills: [{ type: 'solid', color: '#000000' }],
    }),
    type: 'text',
    text: 'abc',
    style: {
      fontFamily: 'sans-serif',
      fontSize: 10,
      fontWeight: 400,
      italic: false,
      lineHeight: 14,
      align,
      verticalAlign: 'top',
      ...(direction ? { direction } : {}),
    },
  };
}

describe('raster: rtl text on the physical side of align', () => {
  const six = (text: string) => ({ width: text.length * 6, height: 14 });

  it('align right: the bar touches the right edge; align left, the left one', () => {
    const [right] = textBars(textNode('right', 'rtl'), six);
    expect(right!.x + right!.width).toBe(60);
    const [left] = textBars(textNode('left', 'rtl'), six);
    expect(left!.x).toBe(0);
  });

  it('the painted glyph falls on the same side', () => {
    const raster = createRaster(60, 20);
    raster.data.fill(255);
    paintScene(raster, [{ root: textNode('right', 'rtl') }], measure, {
      scaleX: 1,
      scaleY: 1,
      clip: { x: 0, y: 0, width: 60, height: 20 },
      fonts: book,
    });
    let right = -1;
    for (let y = 0; y < 20; y++)
      for (let x = 0; x < 60; x++)
        if (raster.data[(y * 60 + x) * 4 + 1]! < 128) right = Math.max(right, x);
    expect(right).toBeGreaterThanOrEqual(55);
  });
});

// Stage #2448 (BD1, decisions 6 and 8): a line with several directions is drawn in visual order. The font is Mapping
// Sans with the Hebrew letters mapped to `A` to `J` (`gsub-font.mjs --rtl`), so the drawing of a Hebrew line must
// equal the drawing of the Latin line that reads the same on the screen.
describe('raster: mixed-direction text in visual order', () => {
  let dir: string;
  let rtlBook: ReturnType<typeof createFontBook>;
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'mapping-rtl-raster-'));
    execFileSync('node', [
      'scripts/testing/gsub-font.mjs',
      join(dir, 'rtl.ttf'),
      '--rtl',
    ]);
    const file = new Uint8Array(readFileSync(join(dir, 'rtl.ttf')));
    rtlBook = createFontBook([
      {
        family: 'Rtl',
        weight: '400',
        style: 'normal',
        path: 'fonts/Rtl.ttf',
        bytes: file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength),
      },
    ]);
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  function drawn(text: string, align: TextNode['style']['align'], direction?: 'rtl') {
    const node = textNode(align, direction);
    const wide: TextNode = {
      ...node,
      width: 200,
      height: 24,
      text,
      style: { ...node.style, fontFamily: 'Rtl', fontSize: 20, lineHeight: 24 },
    };
    const raster = createRaster(200, 24);
    raster.data.fill(255);
    paintScene(raster, [{ root: wide }], measurerFor(rtlBook), {
      scaleX: 1,
      scaleY: 1,
      clip: { x: 0, y: 0, width: 200, height: 24 },
      fonts: rtlBook,
    });
    return raster.data;
  }

  it('abc בגד def in ltr: the Hebrew run is reversed in place', () => {
    // (the letters stay off `A`: the font kerns a space and `A`, and the runs are shaped apart)
    expect(drawn('abc בגד def', 'left')).toEqual(drawn('abc DCB def', 'left'));
    expect(drawn('abc בגד def', 'left')).not.toEqual(drawn('abc BCD def', 'left'));
  });

  it('in rtl a number keeps its order and the runs come from the right', () => {
    expect(drawn('אבג 123 דה', 'right', 'rtl')).toEqual(drawn('ED 123 CBA', 'right'));
  });

  it('in rtl the period of a Latin sentence is on the left', () => {
    expect(drawn('Pay invoice.', 'right', 'rtl')).toEqual(drawn('.Pay invoice', 'right'));
  });

  it('a Latin line without Hebrew in ltr is drawn as before (the same bytes)', () => {
    const plain = drawn('Hamburgefonstiv 123', 'left');
    expect(plain).toEqual(drawn('Hamburgefonstiv 123', 'left', undefined));
    expect(plain.some((v) => v < 128)).toBe(true);
  });
});

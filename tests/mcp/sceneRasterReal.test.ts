import { describe, expect, it } from 'vitest';
import { createRaster, type Raster } from '../../mcp/image/raster';
import { paintScene } from '../../mcp/image/sceneRaster';
import { createFontBook, measurerFor } from '../../mcp/image/textMeasurer';
import {
  baseNode,
  type FrameNode,
  type SceneNode,
  type TextNode,
} from '../../src/model/components/scene';
import { layoutRuns } from '../../src/model/components/richText';

// CF9 (decision 31): the server's full rasterizer: real text (opentype.js), shadow,
// dashes, stroke `align`, `cap`/`join`, `sides` and runs. Text without `fonts` stays as bars.

const book = createFontBook();
const measure = measurerFor(book);

function canvas(width: number, height: number): Raster {
  const raster = createRaster(width, height);
  raster.data.fill(255);
  return raster;
}

const luma = (raster: Raster, x: number, y: number): number => {
  const i = (y * raster.width + x) * 4;
  return (raster.data[i]! + raster.data[i + 1]! + raster.data[i + 2]!) / 3;
};
const dark = (raster: Raster, x: number, y: number) => luma(raster, x, y) < 128;

function frame(
  children: SceneNode[],
  width: number,
  height: number,
  extra: Partial<FrameNode> = {},
): FrameNode {
  return {
    ...baseNode({ id: 'root', name: 'root', width, height }),
    type: 'frame',
    clip: false,
    cornerRadius: 0,
    children,
    ...extra,
  };
}

const solid = (color: string) => ({ type: 'solid' as const, color });

function paint(raster: Raster, root: SceneNode, scale = 1, withFonts = true) {
  paintScene(raster, [{ root }], measure, {
    scaleX: scale,
    scaleY: scale,
    clip: { x: 0, y: 0, width: raster.width, height: raster.height },
    ...(withFonts ? { fonts: book } : {}),
  });
}

function label(text: string, weight: number, extra: Partial<TextNode> = {}): TextNode {
  return {
    ...baseNode({
      id: 't',
      name: 't',
      width: 60,
      height: 20,
      transform: [1, 0, 0, 1, 10, 5],
      fills: [solid('#000000')],
    }),
    type: 'text',
    text,
    style: {
      fontFamily: 'sans-serif',
      fontSize: 14,
      fontWeight: weight,
      italic: false,
      lineHeight: 20,
      align: 'left',
      verticalAlign: 'middle',
    },
    ...extra,
  };
}

function ink(raster: Raster, x0: number, y0: number, x1: number, y1: number): number {
  let total = 0;
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) total += 255 - luma(raster, x, y);
  return total / 255;
}

describe('real text', () => {
  it('"Salvar" paints glyphs inside the label rectangle, not bars', () => {
    const raster = canvas(100, 40);
    paint(raster, frame([label('Salvar', 400)], 100, 40));
    // Everything outside the label rectangle (10,5 60×20) stays white.
    expect(ink(raster, 0, 0, 100, 5)).toBe(0);
    expect(ink(raster, 0, 25, 100, 40)).toBe(0);
    expect(ink(raster, 0, 0, 10, 40)).toBe(0);
    const inside = ink(raster, 10, 5, 70, 25);
    expect(inside).toBeGreaterThan(15);
    // A 6-character bar at 0.6·20 height would paint ~ 6·7.7·12 px; glyphs paint far less.
    expect(inside).toBeLessThan(150);
    // The text takes only the measured width ("Salvar" at 14 px ≈ 38 px), not the whole 60 px box.
    expect(ink(raster, 10 + 44, 0, 100, 40)).toBe(0);
    expect(ink(raster, 10, 5, 10 + 44, 25)).toBeGreaterThan(15);
  });

  it('the same text with weight 700 takes more pixels', () => {
    const regular = canvas(100, 40);
    paint(regular, frame([label('Salvar', 400)], 100, 40));
    const bold = canvas(100, 40);
    paint(bold, frame([label('Salvar', 700)], 100, 40));
    expect(ink(bold, 0, 0, 100, 40)).toBeGreaterThan(ink(regular, 0, 0, 100, 40) * 1.05);
  });

  it('wrap none + ellipsis stays within the box width', () => {
    const raster = canvas(120, 40);
    const node = label('Pagar fatura do cartão de crédito', 400, {
      style: {
        fontFamily: 'sans-serif',
        fontSize: 14,
        fontWeight: 400,
        italic: false,
        lineHeight: 20,
        align: 'left',
        verticalAlign: 'middle',
        wrap: 'none',
        ellipsis: true,
      },
    });
    paint(raster, frame([node], 120, 40));
    expect(ink(raster, 10 + 60 + 1, 0, 120, 40)).toBe(0);
    expect(ink(raster, 10, 5, 70, 25)).toBeGreaterThan(10);
  });

  it.each(['left', 'center', 'right'] as const)(
    'wrap none without ellipsis, align %s: the letter that overflows the box is cut in the middle (FX4)',
    (align) => {
      const raster = canvas(160, 40);
      const node = label('Pagar fatura do cartão de crédito', 400, {
        style: {
          fontFamily: 'sans-serif',
          fontSize: 14,
          fontWeight: 400,
          italic: false,
          lineHeight: 20,
          align,
          verticalAlign: 'middle',
          wrap: 'none',
        },
      });
      paint(raster, frame([node], 160, 40));
      // The box runs from x = 10 to 70: there is ink up to the edge and none after it.
      expect(ink(raster, 10 + 60 - 4, 5, 70, 25)).toBeGreaterThan(0);
      expect(ink(raster, 70, 0, 160, 40)).toBe(0);
      // A line wider than the box starts at the left edge (as in the app), with any align.
      expect(ink(raster, 10, 5, 16, 25)).toBeGreaterThan(0);
    },
  );

  it('runs: the chip paints the background and the text of each run', () => {
    const raster = canvas(160, 40);
    const runs = [
      {
        text: 'Ver ',
        fontFamily: 'sans-serif',
        fontSize: 14,
        fontWeight: 400,
        italic: false,
        color: '#000000',
      },
      {
        text: 'chip',
        fontFamily: 'sans-serif',
        fontSize: 14,
        fontWeight: 400,
        italic: false,
        color: '#000000',
        background: '#ff0000',
        radius: 4,
        padding: [2, 4] as [number, number],
      },
    ];
    const base = label('Ver chip', 400);
    const node: TextNode = {
      ...base,
      width: 140,
      runs,
      runLayout: layoutRuns(
        runs.map((r) => ({
          text: r.text,
          font: {
            family: r.fontFamily,
            size: r.fontSize,
            weight: r.fontWeight,
            italic: r.italic,
            lineHeight: 20,
            letterSpacing: 0,
          },
          ...(r.padding ? { chip: { padding: r.padding } } : {}),
        })),
        { size: 14, lineHeight: 20 },
        measure,
        140,
      ),
    };
    paint(raster, frame([node], 160, 40));
    let red = 0;
    for (let y = 0; y < 40; y++)
      for (let x = 0; x < 160; x++) {
        const i = (y * 160 + x) * 4;
        if (raster.data[i]! > 200 && raster.data[i + 1]! < 80) red++;
      }
    expect(red).toBeGreaterThan(40);
    expect(ink(raster, 10, 5, 40, 25)).toBeGreaterThan(5);
  });
});

describe('shadow, dashes, align, cap, join and sides', () => {
  const box = (extra: Partial<SceneNode> = {}): SceneNode =>
    ({
      ...baseNode({
        id: 'r',
        name: 'r',
        width: 40,
        height: 20,
        transform: [1, 0, 0, 1, 30, 20],
        fills: [solid('#ffffff')],
      }),
      type: 'rect',
      cornerRadius: 0,
      ...extra,
    }) as SceneNode;

  it('a shadow with blur 6 and offsetY 2 darkens below and vanishes far away', () => {
    const raster = canvas(100, 80);
    paint(
      raster,
      frame(
        [
          box({
            effects: [{ color: '#000000', offset: { x: 0, y: 2 }, blur: 6 }],
          }),
        ],
        100,
        80,
      ),
    );
    expect(luma(raster, 50, 43)).toBeLessThan(230); // right below the rectangle
    expect(luma(raster, 50, 43)).toBeGreaterThan(40); // blurred, not solid
    expect(luma(raster, 50, 55)).toBeGreaterThan(250); // far from the blur's reach
    expect(luma(raster, 50, 30)).toBe(255); // the white rectangle covers the shadow
    expect(luma(raster, 50, 43)).toBeLessThan(luma(raster, 50, 16)); // shifted downward
  });

  it('a dashed stroke [4, 2] alternates ink and gap', () => {
    const raster = canvas(80, 20);
    const line: SceneNode = {
      ...baseNode({ id: 'l', name: 'l', width: 60, height: 0 }),
      type: 'line',
      points: [
        { x: 0, y: 10 },
        { x: 60, y: 10 },
      ],
      closed: false,
      stroke: { paints: [solid('#000000')], width: 2, align: 'center', dash: [4, 2] },
    };
    paint(raster, frame([line], 80, 20));
    expect(dark(raster, 2, 10)).toBe(true);
    expect(dark(raster, 5, 10)).toBe(false);
    expect(dark(raster, 8, 10)).toBe(true);
    expect(dark(raster, 11, 10)).toBe(false);
  });

  it('align outside draws the ring outside the outline; inside, inside', () => {
    const outside = canvas(100, 80);
    paint(
      outside,
      frame(
        [
          box({
            fills: [],
            stroke: { paints: [solid('#000000')], width: 4, align: 'outside' },
          }),
        ],
        100,
        80,
      ),
    );
    expect(dark(outside, 28, 30)).toBe(true); // x 26..30, to the left of the box
    expect(dark(outside, 32, 30)).toBe(false); // inside the box
    const inside = canvas(100, 80);
    paint(
      inside,
      frame(
        [
          box({
            fills: [],
            stroke: { paints: [solid('#000000')], width: 4, align: 'inside' },
          }),
        ],
        100,
        80,
      ),
    );
    expect(dark(inside, 32, 30)).toBe(true); // x 30..34
    expect(dark(inside, 28, 30)).toBe(false);
  });

  it('cap round extends the tip; butt does not', () => {
    const make = (cap: 'butt' | 'round') => {
      const raster = canvas(60, 30);
      const line: SceneNode = {
        ...baseNode({ id: 'l', name: 'l', width: 30, height: 0 }),
        type: 'line',
        points: [
          { x: 15, y: 15 },
          { x: 45, y: 15 },
        ],
        closed: false,
        stroke: { paints: [solid('#000000')], width: 8, align: 'center', cap },
      };
      paint(raster, frame([line], 60, 30));
      return raster;
    };
    expect(dark(make('round'), 13, 15)).toBe(true);
    expect(dark(make('butt'), 13, 15)).toBe(false);
  });

  it('sides: [bottom] strokes only the bottom side', () => {
    const raster = canvas(100, 80);
    paint(
      raster,
      frame(
        [
          box({
            fills: [],
            stroke: {
              paints: [solid('#000000')],
              width: 2,
              align: 'inside',
              sides: ['bottom'],
            },
          }),
        ],
        100,
        80,
      ),
    );
    expect(dark(raster, 50, 39)).toBe(true);
    expect(dark(raster, 50, 21)).toBe(false);
    expect(dark(raster, 31, 30)).toBe(false);
  });
});

describe('rotation (EX3)', () => {
  /** Box (x, y, width, height) of all dark pixels. */
  function inkBox(raster: Raster) {
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -1;
    let y1 = -1;
    for (let y = 0; y < raster.height; y++) {
      for (let x = 0; x < raster.width; x++) {
        if (!dark(raster, x, y)) continue;
        x0 = Math.min(x0, x);
        y0 = Math.min(y0, y);
        x1 = Math.max(x1, x);
        y1 = Math.max(y1, y);
      }
    }
    return { x0, y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
  }

  it('the text of a node rotated 90° takes a column, around the box center', () => {
    const flat = canvas(100, 100);
    const turned = canvas(100, 100);
    const make = (extra: Partial<TextNode>) =>
      frame(
        [label('Girando', 700, { transform: [1, 0, 0, 1, 20, 40], ...extra })],
        100,
        100,
      );
    paint(flat, make({}));
    paint(turned, make({ rotation: 90 }));
    const a = inkBox(flat);
    const b = inkBox(turned);
    expect(a.width).toBeGreaterThan(a.height);
    expect(b.height).toBeGreaterThan(b.width);
    // the ink center stays near the box center (50, 50) in both
    expect(Math.abs(b.x0 + b.width / 2 - 50)).toBeLessThan(12);
    expect(Math.abs(b.y0 + b.height / 2 - 50)).toBeLessThan(12);
  });

  it('the text of a frame rotated 45° with clipping does not leak outside the diamond', () => {
    const raster = canvas(100, 100);
    const text = label('XXXXXXXXXXXXXXXX', 900, {
      transform: [1, 0, 0, 1, -50, 5],
      width: 200,
    });
    paint(
      raster,
      frame(
        [
          frame([text], 40, 30, {
            id: 'f',
            clip: true,
            rotation: 45,
            transform: [1, 0, 0, 1, 30, 35],
          }),
        ],
        100,
        100,
      ),
    );
    // the unrotated square's corner, (30, 35), is outside the rotated rectangle
    expect(dark(raster, 31, 36)).toBe(false);
    expect(inkBox(raster).width).toBeGreaterThan(5);
  });

  it('the clipped text (`wrap: none`) of a node rotated 90° is cut at the box width', () => {
    const raster = canvas(100, 100);
    const text = label('XXXXXXXXXXXXXXXX', 900, {
      width: 30,
      height: 20,
      transform: [1, 0, 0, 1, 35, 40],
      rotation: 90,
      style: {
        fontFamily: 'sans-serif',
        fontSize: 14,
        fontWeight: 900,
        italic: false,
        lineHeight: 20,
        align: 'left',
        verticalAlign: 'middle',
        wrap: 'none',
      },
    });
    paint(raster, frame([text], 100, 100));
    const ink = inkBox(raster);
    // the rotated 30 × 20 box takes 20 × 30 around (50, 50): the ink does not go beyond y 35..65
    expect(ink.height).toBeGreaterThan(10);
    expect(ink.y0).toBeGreaterThanOrEqual(34);
    expect(ink.y0 + ink.height).toBeLessThanOrEqual(66);
  });

  it('the clipped text of a node rotated 30° does not paint outside the rotated box (MC0, decision 32)', () => {
    const raster = canvas(100, 100);
    const text = label('XXXXXXXXXXXXXXXX', 900, {
      width: 30,
      height: 20,
      transform: [1, 0, 0, 1, 35, 40],
      rotation: 30,
      style: {
        fontFamily: 'sans-serif',
        fontSize: 14,
        fontWeight: 900,
        italic: false,
        lineHeight: 20,
        align: 'left',
        verticalAlign: 'middle',
        wrap: 'none',
      },
    });
    paint(raster, frame([text], 100, 100));
    // Each dark pixel, with the rotation undone around the center (50, 50), falls in the 30 × 20 box (with 1 px
    // of slack for the clip edge).
    const cos = Math.cos((-30 * Math.PI) / 180);
    const sin = Math.sin((-30 * Math.PI) / 180);
    let inside = 0;
    for (let y = 0; y < raster.height; y++) {
      for (let x = 0; x < raster.width; x++) {
        if (!dark(raster, x, y)) continue;
        const dx = x + 0.5 - 50;
        const dy = y + 0.5 - 50;
        const lx = dx * cos - dy * sin;
        const ly = dx * sin + dy * cos;
        expect(Math.abs(lx)).toBeLessThanOrEqual(15 + 1);
        expect(Math.abs(ly)).toBeLessThanOrEqual(10 + 1);
        inside += 1;
      }
    }
    expect(inside).toBeGreaterThan(20);
  });
});

describe('baselinePadding.top in the raster (MC1, decision 7)', () => {
  /** The foot of the `H` (the baseline), in node px from its top, read from the PNG's ink. */
  function footOfH(zoom: number, baselineTop: number, fontSize = 13): number {
    const raster = canvas(Math.ceil(100 * zoom), Math.ceil(100 * zoom));
    const node = label('H', 400, {
      width: 60,
      height: 60,
      transform: [1, 0, 0, 1, 10, 5],
      style: {
        fontFamily: 'sans-serif',
        fontSize,
        fontWeight: 400,
        italic: false,
        lineHeight: fontSize * 1.2,
        align: 'left',
        verticalAlign: 'top',
        baselineTop,
      },
    });
    paint(raster, frame([node], 100, 100), zoom);
    let last = -1;
    for (let y = 0; y < raster.height; y++)
      for (let x = 0; x < raster.width; x++) if (dark(raster, x, y)) last = y;
    // `last` is the last dark pixel row: the foot sits at its end.
    return (last + 1) / zoom - 5;
  }

  it.each([1, 4.2])(
    'the foot of the "H" is within ≤ 0.5 px of 30 from the node top at zoom %s',
    (zoom) => {
      expect(Math.abs(footOfH(zoom, 30) - 30)).toBeLessThanOrEqual(0.5);
    },
  );

  it('holds at any font size', () => {
    expect(Math.abs(footOfH(4.2, 30, 20) - 30)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(footOfH(1, 40, 11) - 40)).toBeLessThanOrEqual(0.5);
  });
});

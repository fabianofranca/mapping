import { describe, expect, it, vi } from 'vitest';
import { approximateMeasurer } from '../../src/model';
import { instantiate } from '../../src/model/components/instantiate';
import { parseComponent } from '../../src/model/components/parseComponent';
import { layoutRuns } from '../../src/model/components/richText';
import {
  baseNode,
  translate,
  type FrameNode,
  type SceneNode,
  type TextNode,
} from '../../src/model/components/scene';
import { createRaster, type Raster } from '../../mcp/image/raster';
import {
  bounds,
  flattenPath,
  paintScene,
  parseColor,
  textBars,
} from '../../mcp/image/sceneRaster';

// Simplified drawing of a scene in pixels (get_marking_image on a container): filled shapes,
// stroke, frame clip, text as bars and compositing with transparency.

const WHITE = [255, 255, 255, 255];

function canvas(width: number, height: number): Raster {
  const raster = createRaster(width, height);
  raster.data.fill(255);
  return raster;
}

function pixel(raster: Raster, x: number, y: number): number[] {
  const i = (y * raster.width + x) * 4;
  return [...raster.data.subarray(i, i + 4)];
}

function frame(
  children: SceneNode[],
  size: { width: number; height: number },
  extra: Partial<FrameNode> = {},
): FrameNode {
  return {
    ...baseNode({ id: 'root', name: 'root', ...size }),
    type: 'frame',
    clip: false,
    cornerRadius: 0,
    children,
    ...extra,
  };
}

const solid = (color: string, opacity?: number) => ({
  type: 'solid' as const,
  color,
  ...(opacity === undefined ? {} : { opacity }),
});

function paint(raster: Raster, root: SceneNode, scale = 1) {
  paintScene(raster, [{ root }], approximateMeasurer, {
    scaleX: scale,
    scaleY: scale,
    clip: { x: 0, y: 0, width: raster.width, height: raster.height },
  });
}

describe('cor', () => {
  it('reads #rgb, #rrggbb, #rrggbbaa and rgba()', () => {
    expect(parseColor('#f00')).toEqual({ rgb: [255, 0, 0], alpha: 1 });
    expect(parseColor('#336699')).toEqual({ rgb: [0x33, 0x66, 0x99], alpha: 1 });
    expect(parseColor('#00000080')?.alpha).toBeCloseTo(0.5, 2);
    expect(parseColor('rgba(10, 20, 30, 0.25)')).toEqual({
      rgb: [10, 20, 30],
      alpha: 0.25,
    });
    expect(parseColor('transparent')?.alpha).toBe(0);
    expect(parseColor('azul')).toBeNull();
  });
});

describe('caminho SVG', () => {
  it('arc flags without a separator are read as in SVG (CR finding 5)', () => {
    const spaced = flattenPath('M0 0 a5 5 0 1 1 10 0');
    expect(spaced[0]?.points.at(-1)).toEqual({ x: 10, y: 0 });
    expect(flattenPath('M0 0 a5 5 0 1110 0')).toEqual(spaced);
    expect(flattenPath('M0 0 A5,5,0,0110,0 L10 10')).toEqual(
      flattenPath('M0 0 A5 5 0 0 1 10 0 L10 10'),
    );
  });

  it('a stray number after Z ends the path instead of hanging', () => {
    const closed = flattenPath('M0 0 L10 0 L10 10 Z');
    expect(flattenPath('M0 0 L10 0 L10 10 Z 5')).toEqual(closed);
    expect(flattenPath('M0 0 L10 0 L10 10 z 5 6 L1 1')).toEqual(closed);
  }, 2000);

  it('flattens M L H V Z and curves into segments', () => {
    const [square] = flattenPath('M 0 0 H 10 V 10 L 0 10 Z');
    expect(square?.closed).toBe(true);
    expect(square?.points).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ]);
    const [curve] = flattenPath(
      'M0 0 C 0 10 10 10 10 0 S 20 -10 20 0 Q 25 5 30 0 T 40 0',
    );
    expect(curve?.points.length).toBeGreaterThan(40);
    expect(curve?.points.at(-1)).toEqual({ x: 40, y: 0 });
    const [relative] = flattenPath('m1 1 l2 0 2 2');
    expect(relative?.points).toEqual([
      { x: 1, y: 1 },
      { x: 3, y: 1 },
      { x: 5, y: 3 },
    ]);
  });
});

describe('SVG path arcs (finding 4 of the #838 report)', () => {
  it('the arc a5 5 0 0 1 10 0 is the radius-5 semicircle, not the straight line to the end point', () => {
    const [arc] = flattenPath('M0 0 a5 5 0 0 1 10 0');
    const points = arc!.points;
    expect(points.length).toBeGreaterThan(8);
    expect(points[0]).toEqual({ x: 0, y: 0 });
    expect(points.at(-1)!.x).toBeCloseTo(10, 6);
    expect(points.at(-1)!.y).toBeCloseTo(0, 6);
    for (const p of points) {
      expect(Math.hypot(p.x - 5, p.y)).toBeCloseTo(5, 1);
    }
    // sweep-flag 1 goes over the top (negative y) with the direction of increasing x
    expect(Math.min(...points.map((p) => p.y))).toBeCloseTo(-5, 1);
  });

  it('large-arc and sweep choose among the four possible arcs', () => {
    const ys = (d: string) => flattenPath(d)[0]!.points.map((p) => p.y);
    expect(Math.max(...ys('M0 0 a6 6 0 0 0 10 0'))).toBeCloseTo(2.68, 1);
    expect(Math.min(...ys('M0 0 a6 6 0 1 1 10 0'))).toBeLessThan(-8);
  });

  it('a radius that is too small is enlarged until it fits the two points', () => {
    const [arc] = flattenPath('M0 0 a1 1 0 0 1 10 0');
    expect(Math.min(...arc!.points.map((p) => p.y))).toBeCloseTo(-5, 1);
  });

  it('the magnifier of the Search icon comes out with the lens hollow', () => {
    const d =
      'M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z';
    const raster = canvas(24, 24);
    const node: SceneNode = {
      ...baseNode({
        id: 'p',
        name: 'p',
        width: 24,
        height: 24,
        fills: [solid('#000000')],
      }),
      type: 'path',
      d,
      fillRule: 'nonzero',
    };
    paint(raster, node);
    const at = (x: number, y: number) => raster.data[(y * 24 + x) * 4]!;
    expect(at(9, 9)).toBe(255); // inside the lens: white background
    expect(at(4, 9)).toBeLessThan(80); // lens rim
    expect(at(18, 18)).toBeLessThan(80); // cabo
  });
});

describe('scene painting', () => {
  it('solid rectangle at the position, with the scale', () => {
    const raster = canvas(40, 40);
    const rect: SceneNode = {
      ...baseNode({
        id: 'r',
        name: 'r',
        width: 10,
        height: 10,
        transform: translate(5, 5),
        fills: [solid('#FF0000')],
      }),
      type: 'rect',
      cornerRadius: 0,
    };
    paint(raster, frame([rect], { width: 40, height: 40 }), 2);
    expect(pixel(raster, 12, 12)).toEqual([255, 0, 0, 255]);
    expect(pixel(raster, 29, 29)).toEqual([255, 0, 0, 255]);
    expect(pixel(raster, 9, 9)).toEqual(WHITE);
    expect(pixel(raster, 31, 31)).toEqual(WHITE);
  });

  it('rectangle with a corner radius leaves the corner on the background', () => {
    const raster = canvas(30, 30);
    const rect: SceneNode = {
      ...baseNode({
        id: 'r',
        name: 'r',
        width: 30,
        height: 30,
        fills: [solid('#000000')],
      }),
      type: 'rect',
      cornerRadius: 15,
    };
    paint(raster, rect);
    expect(pixel(raster, 15, 15)).toEqual([0, 0, 0, 255]);
    expect(pixel(raster, 0, 0)).toEqual(WHITE);
    expect(pixel(raster, 15, 1)).toEqual([0, 0, 0, 255]);
  });

  it('elipse: centro cheio, canto vazio', () => {
    const raster = canvas(40, 20);
    const ellipse: SceneNode = {
      ...baseNode({
        id: 'e',
        name: 'e',
        width: 40,
        height: 20,
        fills: [solid('#0000FF')],
      }),
      type: 'ellipse',
    };
    paint(raster, ellipse);
    expect(pixel(raster, 20, 10)).toEqual([0, 0, 255, 255]);
    expect(pixel(raster, 1, 1)).toEqual(WHITE);
    expect(pixel(raster, 38, 18)).toEqual(WHITE);
  });

  it('path: filled triangle; even-odd leaves the hole, non-zero does not', () => {
    const triangle: SceneNode = {
      ...baseNode({
        id: 'p',
        name: 'p',
        width: 20,
        height: 20,
        fills: [solid('#00AA00')],
      }),
      type: 'path',
      d: 'M0 20 L10 0 L20 20 Z',
      fillRule: 'nonzero',
    };
    const raster = canvas(20, 20);
    paint(raster, triangle);
    expect(pixel(raster, 10, 15)).toEqual([0, 170, 0, 255]);
    expect(pixel(raster, 1, 2)).toEqual(WHITE);

    const ring = (fillRule: 'nonzero' | 'evenodd'): SceneNode => ({
      ...baseNode({
        id: 'o',
        name: 'o',
        width: 30,
        height: 30,
        fills: [solid('#000000')],
      }),
      type: 'path',
      // Two squares of the same direction: the inner one only disappears in even-odd.
      d: 'M0 0 H30 V30 H0 Z M10 10 H20 V20 H10 Z',
      fillRule,
    });
    const evenOdd = canvas(30, 30);
    paint(evenOdd, ring('evenodd'));
    expect(pixel(evenOdd, 15, 15)).toEqual(WHITE);
    expect(pixel(evenOdd, 3, 3)).toEqual([0, 0, 0, 255]);
    const nonZero = canvas(30, 30);
    paint(nonZero, ring('nonzero'));
    expect(pixel(nonZero, 15, 15)).toEqual([0, 0, 0, 255]);
  });

  it('an open line only has a stroke; the stroke has the requested width', () => {
    const line: SceneNode = {
      ...baseNode({ id: 'l', name: 'l', width: 40, height: 0 }),
      type: 'line',
      points: [
        { x: 0, y: 10 },
        { x: 40, y: 10 },
      ],
      closed: false,
      stroke: { paints: [solid('#FF00FF')], width: 4, align: 'center' },
    };
    const raster = canvas(40, 20);
    paint(raster, line);
    expect(pixel(raster, 20, 9)).toEqual([255, 0, 255, 255]);
    expect(pixel(raster, 20, 10)).toEqual([255, 0, 255, 255]);
    expect(pixel(raster, 20, 5)).toEqual(WHITE);
    expect(pixel(raster, 20, 15)).toEqual(WHITE);
  });

  it('gradient becomes the color of the first stop and image becomes a gray placeholder', () => {
    const gradient: SceneNode = {
      ...baseNode({
        id: 'g',
        name: 'g',
        width: 10,
        height: 10,
        fills: [
          {
            type: 'linear',
            start: { x: 0, y: 0 },
            end: { x: 10, y: 0 },
            stops: [
              { offset: 0, color: '#FF0000' },
              { offset: 1, color: '#0000FF' },
            ],
          },
        ],
      }),
      type: 'rect',
      cornerRadius: 0,
    };
    const image: SceneNode = {
      ...baseNode({
        id: 'i',
        name: 'i',
        width: 10,
        height: 10,
        transform: translate(10, 0),
        fills: [{ type: 'image' }],
      }),
      type: 'rect',
      cornerRadius: 0,
    };
    const raster = canvas(20, 10);
    paint(raster, frame([gradient, image], { width: 20, height: 10 }));
    expect(pixel(raster, 9, 5)).toEqual([255, 0, 0, 255]);
    const [r, g, b] = pixel(raster, 15, 5);
    expect(r).toBe(g);
    expect(g).toBe(b);
    expect(r).toBeLessThan(255);
    expect(r).toBeGreaterThan(150);
  });

  it('transparency: node and fill opacity compose over the background', () => {
    const rect = (opacity: number, paintOpacity?: number): SceneNode => ({
      ...baseNode({
        id: 'r',
        name: 'r',
        width: 10,
        height: 10,
        opacity,
        fills: [solid('#000000', paintOpacity)],
      }),
      type: 'rect',
      cornerRadius: 0,
    });
    const half = canvas(10, 10);
    paint(half, rect(0.5));
    const [v] = pixel(half, 5, 5);
    expect(v).toBeGreaterThanOrEqual(127);
    expect(v).toBeLessThanOrEqual(128);
    const quarter = canvas(10, 10);
    paint(quarter, rect(0.5, 0.5));
    expect(pixel(quarter, 5, 5)[0]).toBeGreaterThanOrEqual(191);
    expect(pixel(quarter, 5, 5)[0]).toBeLessThanOrEqual(192);
    // Transparent background: the color comes out and the opacity stays in the alpha channel.
    const clear = createRaster(10, 10);
    paint(clear, rect(0.5));
    expect(pixel(clear, 5, 5)).toEqual([0, 0, 0, 128]);
  });

  it('an invisible node is not painted and the frame with clip crops the children', () => {
    const hidden: SceneNode = {
      ...baseNode({
        id: 'h',
        name: 'h',
        width: 10,
        height: 10,
        visible: false,
        fills: [solid('#FF0000')],
      }),
      type: 'rect',
      cornerRadius: 0,
    };
    const big: SceneNode = {
      ...baseNode({
        id: 'b',
        name: 'b',
        width: 40,
        height: 40,
        fills: [solid('#FF0000')],
      }),
      type: 'rect',
      cornerRadius: 0,
    };
    const raster = canvas(40, 40);
    paint(raster, frame([hidden], { width: 40, height: 40 }));
    expect(pixel(raster, 5, 5)).toEqual(WHITE);
    const clipped = frame([big], { width: 10, height: 10 }, { clip: true });
    paint(raster, clipped);
    expect(pixel(raster, 5, 5)).toEqual([255, 0, 0, 255]);
    expect(pixel(raster, 20, 20)).toEqual(WHITE);
  });

  it('only paints inside the region (clip) and ignores the scene that does not cross it', () => {
    const rect: SceneNode = {
      ...baseNode({
        id: 'r',
        name: 'r',
        width: 40,
        height: 40,
        fills: [solid('#FF0000')],
      }),
      type: 'rect',
      cornerRadius: 0,
    };
    const raster = canvas(40, 40);
    paintScene(raster, [{ root: rect }], approximateMeasurer, {
      scaleX: 1,
      scaleY: 1,
      clip: { x: 10, y: 10, width: 10, height: 10 },
    });
    expect(pixel(raster, 15, 15)).toEqual([255, 0, 0, 255]);
    expect(pixel(raster, 5, 5)).toEqual(WHITE);
    expect(pixel(raster, 25, 25)).toEqual(WHITE);
    const away = canvas(40, 40);
    paintScene(
      away,
      [{ root: { ...rect, transform: translate(100, 100) } }],
      approximateMeasurer,
      {
        scaleX: 1,
        scaleY: 1,
        clip: { x: 0, y: 0, width: 40, height: 40 },
      },
    );
    expect(pixel(away, 20, 20)).toEqual(WHITE);
  });
});

describe('text as bars', () => {
  const text = (extra: Partial<TextNode> = {}, width = 100): TextNode => ({
    ...baseNode({
      id: 't',
      name: 't',
      width,
      height: 40,
      fills: [solid('#112233')],
    }),
    type: 'text',
    text: 'Submit today',
    style: {
      fontFamily: 'Roboto',
      fontSize: 10,
      fontWeight: 400,
      italic: false,
      lineHeight: 20,
      align: 'left',
      verticalAlign: 'top',
    },
    ...extra,
  });

  it('one bar per measured line, at 60% of the line height', () => {
    // 0.55 × 10 px per character: "Submit today" (12) is 66 px and fits in 100.
    const one = textBars(text(), approximateMeasurer);
    expect(one).toHaveLength(1);
    expect(one[0]).toMatchObject({ x: 0, width: 66, height: 12 });
    expect(one[0]!.y).toBeCloseTo(4, 5);
    // At 40 px it breaks by words: "Submit" (33) and "today" (27.5).
    const two = textBars(text({}, 40), approximateMeasurer);
    expect(two).toHaveLength(2);
    expect(two[1]!.y).toBeCloseTo(24, 5);
  });

  it('horizontal and vertical alignment', () => {
    const centered = textBars(
      text({
        style: {
          ...text().style,
          align: 'center',
          verticalAlign: 'middle',
        },
      }),
      approximateMeasurer,
    );
    expect(centered[0]!.x).toBeCloseTo(17, 5);
    expect(centered[0]!.y).toBeCloseTo(14, 5);
    const right = textBars(
      text({ style: { ...text().style, align: 'right' } }),
      approximateMeasurer,
    );
    expect(right[0]!.x).toBeCloseTo(34, 5);
  });

  it('paints the bar in the text color and leaves the rest of the background', () => {
    const raster = canvas(100, 40);
    paint(raster, text());
    expect(pixel(raster, 30, 10)).toEqual([0x11, 0x22, 0x33, 255]);
    expect(pixel(raster, 30, 18)).toEqual(WHITE);
    expect(pixel(raster, 80, 10)).toEqual(WHITE);
  });
});

describe('rich text as bars (runs)', () => {
  const rich = (verticalAlign: 'top' | 'middle' | 'bottom' = 'top'): TextNode => {
    const font = {
      family: 'Roboto',
      size: 10,
      weight: 400,
      italic: false,
      lineHeight: 12,
      letterSpacing: 0,
    };
    const runs = [
      { text: 'Expires: ', font },
      { text: 'ok', font, chip: { padding: [2, 4] as const } },
    ];
    const base = { size: 10, lineHeight: 12 };
    return {
      ...baseNode({
        id: 't',
        name: 't',
        width: 100,
        height: 40,
        fills: [solid('#000000')],
      }),
      type: 'text',
      text: 'Expires: ok',
      style: {
        fontFamily: 'Roboto',
        fontSize: 10,
        fontWeight: 400,
        italic: false,
        lineHeight: 12,
        align: 'left',
        verticalAlign,
      },
      runs: [
        {
          text: 'Expires: ',
          fontFamily: 'Roboto',
          fontSize: 10,
          fontWeight: 400,
          italic: false,
          color: '#112233',
        },
        {
          text: 'ok',
          fontFamily: 'Roboto',
          fontSize: 10,
          fontWeight: 400,
          italic: false,
          color: '#ff0000',
          background: '#00ff00',
          radius: 3,
          padding: [2, 4],
        },
      ],
      runLayout: layoutRuns(runs, base, approximateMeasurer, 100),
    };
  };

  it('one bar per piece of text in the run color and the chip background as a rectangle', () => {
    const bars = textBars(rich(), approximateMeasurer);
    expect(bars).toHaveLength(3);
    // "Expires: " (9 × 5.5) on a line of 16 (the chip's): centered, the bar is 60% of 12.
    expect(bars[0]).toMatchObject({ x: 0, width: 49.5, color: '#112233' });
    expect(bars[0]!.height).toBeCloseTo(7.2, 5);
    expect(bars[0]!.y).toBeCloseTo(2 + 2.4, 5);
    // The chip background is the whole box (11 + 2·4 wide, 12 + 2·2 tall).
    expect(bars[1]).toMatchObject({
      x: 49.5,
      y: 0,
      width: 19,
      height: 16,
      color: '#00ff00',
    });
    // The chip text sits 4 inward and 2 down, in the run's color.
    expect(bars[2]).toMatchObject({ x: 53.5, width: 11, color: '#ff0000' });
    expect(bars[2]!.height).toBeCloseTo(7.2, 5);
    expect(bars[2]!.y).toBeCloseTo(2 + 2.4, 5);
  });

  it('verticalAlign shifts all the bars by the slack of the box', () => {
    const top = textBars(rich(), approximateMeasurer);
    const middle = textBars(rich('middle'), approximateMeasurer);
    const bottom = textBars(rich('bottom'), approximateMeasurer);
    top.forEach((bar, i) => {
      expect(middle[i]!.y).toBeCloseTo(bar.y + (40 - 16) / 2, 5);
      expect(bottom[i]!.y).toBeCloseTo(bar.y + (40 - 16), 5);
    });
  });

  it('paints the chip background and the run bar, each in its own color', () => {
    const raster = canvas(100, 40);
    paint(raster, rich());
    expect(pixel(raster, 20, 5)).toEqual([0x11, 0x22, 0x33, 255]);
    // In the chip: the green background shows outside the text bar; the bar is red.
    expect(pixel(raster, 51, 1)).toEqual([0, 255, 0, 255]);
    expect(pixel(raster, 58, 5)).toEqual([255, 0, 0, 255]);
    expect(pixel(raster, 90, 5)).toEqual(WHITE);
  });

  it('without runLayout nothing changes: the single-style text', () => {
    const plain = { ...rich(), runs: undefined, runLayout: undefined } as TextNode;
    const bars = textBars(plain, approximateMeasurer);
    expect(bars).toHaveLength(1);
    expect(bars[0]!.color).toBeUndefined();
  });
});

describe('remote image of a component', () => {
  it('a component with the image node draws the placeholder color, without network', () => {
    const parsed = parseComponent({
      format: 'mapping-component',
      formatVersion: 3,
      id: 'photo',
      name: 'Photo',
      size: { width: 20, height: 10 },
      template: {
        type: 'frame',
        children: [{ type: 'image', src: { $field: 'photo' } }],
      },
    });
    if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
    const { root } = instantiate(
      parsed.component,
      { photo: 'https://cdn.example.com/a.png' },
      { x: 0, y: 0, width: 20, height: 10 },
      { measure: approximateMeasurer },
    );
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const raster = canvas(20, 10);
    paint(raster, root);
    const [r, g, b] = pixel(raster, 10, 5);
    expect(r).toBe(g);
    expect(g).toBe(b);
    expect(r).toBeLessThan(255);
    expect(r).toBeGreaterThan(150);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});

describe('stroke with cap, join and sides (format 4)', () => {
  const INK = '#FF00FF';

  function openLine(
    points: { x: number; y: number }[],
    extra: Partial<NonNullable<SceneNode['stroke']>> = {},
  ): SceneNode {
    return {
      ...baseNode({ id: 'l', name: 'l', width: 40, height: 40 }),
      type: 'line',
      points,
      closed: false,
      stroke: { paints: [solid(INK)], width: 4, align: 'center', ...extra },
    };
  }

  const isInk = (p: number[]): boolean => p[0] === 255 && p[1] === 0 && p[2] === 255;

  it('cap square paints 2 px more at each end; butt does not; round paints the round end', () => {
    const points = [
      { x: 10, y: 10 },
      { x: 30, y: 10 },
    ];
    const square = canvas(40, 20);
    paint(square, openLine(points, { cap: 'square' }));
    expect(isInk(pixel(square, 8, 10))).toBe(true);
    expect(isInk(pixel(square, 31, 10))).toBe(true);
    expect(pixel(square, 7, 10)).toEqual(WHITE);

    const butt = canvas(40, 20);
    paint(butt, openLine(points, { cap: 'butt' }));
    expect(pixel(butt, 8, 10)).toEqual(WHITE);
    expect(pixel(butt, 31, 10)).toEqual(WHITE);
    expect(isInk(pixel(butt, 10, 10))).toBe(true);

    const none = canvas(40, 20);
    paint(none, openLine(points));
    expect(pixel(none, 8, 10)).toEqual(WHITE);

    const round = canvas(40, 20);
    paint(round, openLine(points, { cap: 'round' }));
    expect(pixel(round, 8, 10)).not.toEqual(WHITE);
    expect(pixel(round, 8, 7)).toEqual(WHITE);
  });

  it('join miter paints the outer corner; bevel cuts it; round rounds it', () => {
    const corner = [
      { x: 5, y: 10 },
      { x: 20, y: 10 },
      { x: 20, y: 25 },
    ];
    const miter = canvas(40, 40);
    paint(miter, openLine(corner, { join: 'miter' }));
    expect(isInk(pixel(miter, 21, 8))).toBe(true);

    const bevel = canvas(40, 40);
    paint(bevel, openLine(corner, { join: 'bevel' }));
    expect(pixel(bevel, 21, 8)).toEqual(WHITE);
    expect(isInk(pixel(bevel, 20, 10))).toBe(true);

    const round = canvas(40, 40);
    paint(round, openLine(corner, { join: 'round' }));
    expect(isInk(pixel(round, 21, 8))).toBe(false);
    expect(pixel(round, 21, 9)).not.toEqual(WHITE);
  });

  it('sides ["bottom"] paints only the bottom edge of the rectangle', () => {
    const rect: SceneNode = {
      ...baseNode({ id: 'r', name: 'r', width: 30, height: 20 }),
      type: 'rect',
      cornerRadius: 0,
      stroke: { paints: [solid(INK)], width: 2, align: 'inside', sides: ['bottom'] },
    };
    const raster = canvas(30, 20);
    paint(raster, rect);
    expect(isInk(pixel(raster, 15, 19))).toBe(true);
    expect(pixel(raster, 15, 0)).toEqual(WHITE);
    expect(pixel(raster, 0, 10)).toEqual(WHITE);
    expect(pixel(raster, 29, 10)).toEqual(WHITE);
  });

  it('the enlarged clip (clipBox) lets the stroke that leaves the box show', () => {
    const child: SceneNode = {
      ...baseNode({ id: 'c', name: 'c', width: 20, height: 20 }),
      type: 'rect',
      cornerRadius: 0,
      stroke: { paints: [solid(INK)], width: 4, align: 'center' },
    };
    const make = (clipBox?: { x: number; y: number; width: number; height: number }) =>
      frame(
        [child],
        { width: 20, height: 20 },
        { clip: true, ...(clipBox ? { clipBox } : {}), transform: translate(6, 6) },
      );
    const widened = canvas(40, 40);
    paint(widened, make({ x: -4, y: -4, width: 28, height: 28 }));
    expect(isInk(pixel(widened, 5, 16))).toBe(true);
    const clipped = canvas(40, 40);
    paint(clipped, make());
    expect(pixel(clipped, 5, 16)).toEqual(WHITE);
  });
});

describe('findings 4, 6 and 7 of the MCP CR', () => {
  const INK = '#FF00FF';
  const isInk = (p: number[]): boolean => p[0] === 255 && p[1] === 0 && p[2] === 255;

  function polyline(
    points: { x: number; y: number }[],
    stroke: Partial<NonNullable<SceneNode['stroke']>>,
    closed: boolean,
  ): SceneNode {
    return {
      ...baseNode({ id: 'l', name: 'l', width: 40, height: 40 }),
      type: 'line',
      points,
      closed,
      stroke: { paints: [solid(INK)], width: 4, align: 'center', ...stroke },
    };
  }

  it('a closed path whose last point equals the first has the same start corner as the one without repetition', () => {
    const a = { x: 10, y: 10 };
    const b = { x: 30, y: 10 };
    const c = { x: 10, y: 30 };
    const plain = canvas(40, 40);
    paint(plain, polyline([a, b, c], { join: 'miter' }, true));
    const repeated = canvas(40, 40);
    paint(repeated, polyline([a, b, c, a], { join: 'miter' }, true));
    expect(isInk(pixel(plain, 8, 8))).toBe(true);
    expect(isInk(pixel(repeated, 8, 8))).toBe(true);
    expect(repeated.data).toEqual(plain.data);
  });

  it('stroke.scale === false keeps the width in output pixels, at any scale', () => {
    const line = [
      { x: 2, y: 10 },
      { x: 30, y: 10 },
    ];
    const countInk = (r: Raster): number => {
      let n = 0;
      for (let y = 0; y < r.height; y++) if (isInk(pixel(r, 20, y))) n++;
      return n;
    };
    const scaled = canvas(160, 80);
    paint(scaled, polyline(line, { width: 2 }, false), 4);
    const fixed = canvas(160, 80);
    paint(fixed, polyline(line, { width: 2, scale: false }, false), 4);
    expect(countInk(scaled)).toBe(8);
    expect(countInk(fixed)).toBe(2);
  });

  it('bounds with more than 200 thousand points do not overflow the stack', () => {
    const points = Array.from({ length: 300_000 }, (_, i) => ({ x: i % 1000, y: i % 7 }));
    expect(bounds(points)).toEqual({ x: 0, y: 0, width: 999, height: 6 });
  });
});

describe('rotation (EX3)', () => {
  const RED = [255, 0, 0, 255];

  /** Instantiates a 100×100 v4 component with the given children and paints the scene. */
  function drawn(children: unknown[], extra: Record<string, unknown> = {}): Raster {
    const parsed = parseComponent({
      format: 'mapping-component',
      formatVersion: 4,
      id: 'r',
      name: 'R',
      size: { width: 100, height: 100 },
      template: {
        type: 'frame',
        layout: { type: 'row', align: 'center', justify: 'center' },
        children,
        ...extra,
      },
    });
    if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
    const { root } = instantiate(
      parsed.component,
      {},
      { x: 0, y: 0, width: 100, height: 100 },
      { measure: approximateMeasurer },
    );
    const raster = canvas(100, 100);
    paint(raster, root);
    return raster;
  }

  const bar = (rotation?: number) => ({
    type: 'rect',
    width: 40,
    height: 10,
    fill: '#ff0000',
    ...(rotation === undefined ? {} : { rotation }),
  });

  it('90° draws the 10×40 vertical bar centered on the same point', () => {
    const raster = drawn([bar(90)]);
    // center at (50, 50): the bar spans x 45..55 and y 30..70
    expect(pixel(raster, 50, 31)).toEqual(RED);
    expect(pixel(raster, 50, 68)).toEqual(RED);
    expect(pixel(raster, 46, 50)).toEqual(RED);
    expect(pixel(raster, 53, 50)).toEqual(RED);
    expect(pixel(raster, 50, 28)).toEqual(WHITE);
    expect(pixel(raster, 50, 72)).toEqual(WHITE);
    expect(pixel(raster, 40, 50)).toEqual(WHITE);
    expect(pixel(raster, 60, 50)).toEqual(WHITE);
  });

  it('45°: points inside and outside the rotated shape, up to 1 px from the edge', () => {
    const raster = drawn([bar(45)]);
    const rad = Math.PI / 4;
    // distance from the pixel center to the axes of the rotated rectangle
    const along = (x: number, y: number) =>
      (x + 0.5 - 50) * Math.cos(rad) + (y + 0.5 - 50) * Math.sin(rad);
    const across = (x: number, y: number) =>
      -(x + 0.5 - 50) * Math.sin(rad) + (y + 0.5 - 50) * Math.cos(rad);
    let inside = 0;
    let outside = 0;
    for (let y = 0; y < 100; y++) {
      for (let x = 0; x < 100; x++) {
        const margin = Math.min(20 - Math.abs(along(x, y)), 5 - Math.abs(across(x, y)));
        if (Math.abs(margin) <= 1) continue;
        if (margin > 0) {
          inside++;
          expect(pixel(raster, x, y)).toEqual(RED);
        } else {
          outside++;
          expect(pixel(raster, x, y)).toEqual(WHITE);
        }
      }
    }
    expect(inside).toBeGreaterThan(150);
    expect(outside).toBeGreaterThan(9000);
  });

  it('the frame clip rotates with it; the content outside the rotated square disappears', () => {
    const raster = drawn([
      {
        type: 'frame',
        clip: true,
        width: 40,
        height: 40,
        rotation: 45,
        fill: '#ff0000',
        children: [{ type: 'rect', width: 200, height: 200, fill: '#0000ff' }],
      },
    ]);
    // the 40 square rotated 45° is a diamond of radius ~28 around (50, 50)
    expect(pixel(raster, 50, 50)).toEqual([0, 0, 255, 255]);
    expect(pixel(raster, 50, 25)).toEqual([0, 0, 255, 255]);
    // the corner of the unrotated square (30, 30) is outside the diamond
    expect(pixel(raster, 31, 31)).toEqual(WHITE);
    expect(pixel(raster, 50, 20)).toEqual(WHITE);
    expect(pixel(raster, 80, 50)).toEqual(WHITE);
  });

  it('without rotation, or with 0, the drawing is the same as before', () => {
    const plain = drawn([bar()]);
    expect([...drawn([bar(0)]).data]).toEqual([...plain.data]);
    expect(pixel(plain, 50, 50)).toEqual(RED);
  });
});

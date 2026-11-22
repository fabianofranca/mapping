// DX6 (#2048, decisions 21 to 25 of #1903): `columns`/`rows` as a track list (px, `"<n>fr"`, `"hug"`):
// the pure track functions and the engine (frame and `repeat`) with the `approximateMeasurer`.
import { describe, expect, it } from 'vitest';
import { COMPONENT_FORMAT } from '../../../src/model/components/componentFormat';
import {
  cellExtent,
  parseTrackList,
  trackOffsets,
  trackSizes,
  type Track,
} from '../../../src/model/components/gridLayout';
import { hugTrackSizes, listHugExtent } from '../../../src/model/components/gridPlan';
import {
  approximateMeasurer,
  instantiate,
} from '../../../src/model/components/instantiate';
import { absoluteBoxes, walk, type SceneNode } from '../../../src/model/components/scene';

const px = (value: number): Track => ({ kind: 'px', px: value });
const fr = (value: number): Track => ({ kind: 'fr', fr: value });
const HUG: Track = { kind: 'hug' };

describe('parseTrackList', () => {
  it('reads px, "<n>fr" and "hug"', () => {
    expect(parseTrackList([72, '1fr', '2.5fr', 'hug', 0])).toEqual([
      px(72),
      fr(1),
      fr(2.5),
      HUG,
      px(0),
    ]);
  });

  it('refuses an empty list, more than 24 tracks and anything that is not a list', () => {
    expect(parseTrackList([])).toBeUndefined();
    expect(parseTrackList(Array.from({ length: 25 }, () => 10))).toBeUndefined();
    expect(parseTrackList(Array.from({ length: 24 }, () => 10))).toHaveLength(24);
    expect(parseTrackList(3)).toBeUndefined();
    expect(parseTrackList('1fr')).toBeUndefined();
  });

  it('refuses "0fr", a negative px, "auto", NaN and other values in an item', () => {
    for (const bad of ['0fr', -1, 'auto', Number.NaN, '-2fr', 'fr', '1 fr', null, {}])
      expect(parseTrackList([10, bad])).toBeUndefined();
  });
});

describe('trackSizes', () => {
  it('[72, "1fr", "2fr"] in 372 px with gap 12: 72, 92 and 184', () => {
    expect(trackSizes([px(72), fr(1), fr(2)], 372, 12, [0, 0, 0])).toEqual([72, 92, 184]);
  });

  it('a hug track takes the measured size and the fr tracks split what is left', () => {
    // 310 − 40 (px) − 60 (hug) − 3 gaps of 10 = 180, in 1:2.
    expect(trackSizes([px(40), HUG, fr(1), fr(2)], 310, 10, [0, 60, 0, 0])).toEqual([
      40, 60, 60, 120,
    ]);
  });

  it('fr never goes below 0', () => {
    expect(trackSizes([px(80), fr(1), px(40)], 100, 10, [0, 0, 0])).toEqual([80, 0, 40]);
  });

  it('without fr the tracks keep their size and the rest stays empty', () => {
    expect(trackSizes([px(30), HUG], 500, 8, [0, 44])).toEqual([30, 44]);
  });
});

describe('trackOffsets and cellExtent', () => {
  it('the offsets add the sizes and the gaps', () => {
    expect(trackOffsets([72, 92, 184], 12)).toEqual([0, 84, 188]);
  });

  it('span 2 over uneven tracks occupies the sum of the tracks plus the gap', () => {
    expect(cellExtent([50, 115, 115], 0, 2, 10)).toBe(175);
    expect(cellExtent([50, 115, 115], 1, 2, 10)).toBe(240);
    expect(cellExtent([50, 115, 115], 2, 1, 10)).toBe(115);
  });
});

describe('hugTrackSizes and listHugExtent', () => {
  const cells = [
    { index: 0, line: 0, track: 0, span: 1 },
    { index: 1, line: 0, track: 1, span: 1 },
    { index: 2, line: 1, track: 0, span: 1 },
    { index: 3, line: 1, track: 1, span: 1 },
  ];

  it('a hug track takes the largest span 1 child placed in it', () => {
    expect(hugTrackSizes([HUG, fr(1)], cells, [30, 99, 50, 10])).toEqual([50, 0]);
  });

  it('a child with span > 1 does not size a hug track', () => {
    const spanning = [{ index: 0, line: 0, track: 0, span: 2 }];
    expect(hugTrackSizes([HUG, HUG], spanning, [400])).toEqual([0, 0]);
  });

  it('a grid hug without fr is px + hug tracks + gaps', () => {
    const tracks = [px(40), HUG];
    const sizes = [10, 70, 10, 30];
    const hugs = hugTrackSizes(tracks, cells, sizes);
    expect(hugs).toEqual([0, 70]);
    expect(listHugExtent(tracks, cells, sizes, hugs, 10)).toBe(40 + 10 + 70);
  });

  it('a grid hug with fr adds the largest (need ÷ n) × the fr total', () => {
    const tracks = [px(40), fr(1), fr(2)];
    const three = [
      { index: 0, line: 0, track: 0, span: 1 },
      { index: 1, line: 0, track: 1, span: 1 },
      { index: 2, line: 0, track: 2, span: 1 },
    ];
    const sizes = [30, 50, 120];
    const hugs = hugTrackSizes(tracks, three, sizes);
    // max(50 / 1, 120 / 2) = 60, × 3 = 180; + 40 + 2 gaps of 10.
    expect(listHugExtent(tracks, three, sizes, hugs, 10)).toBe(40 + 20 + 180);
  });

  it('a span over fr tracks asks (need − px − gaps) ÷ the n of the span', () => {
    const tracks = [px(40), fr(1), fr(1)];
    const wide = [{ index: 0, line: 0, track: 0, span: 3 }];
    // (300 − 40 − 2 × 10) ÷ 2 = 120 per fr; total 40 + 20 + 240.
    expect(listHugExtent(tracks, wide, [300], [0, 0, 0], 10)).toBe(300);
  });
});

// --- engine ----------------------------------------------------------------------------------

type Json = Record<string, unknown>;

function file(template: Json): Json {
  return {
    format: COMPONENT_FORMAT,
    formatVersion: 4,
    id: 'c',
    name: 'C',
    size: { width: 372, height: 200 },
    template,
  };
}

const rect = (name: string, w: unknown, h: unknown = 20, extra: Json = {}): Json => ({
  type: 'rect',
  name,
  width: w,
  height: h,
  ...extra,
});

/** `n` rectangles `k0…` with `fill` width (the cell decides it) and height 20. */
const fills = (n: number, extra: Json = {}): Json[] =>
  Array.from({ length: n }, (_, i) => rect(`k${i}`, 'fill', 20, extra));

const grid = (layout: Json, children: Json[], extra: Json = {}): Json => ({
  type: 'frame',
  name: 'g',
  width: 'fill',
  height: 'fill',
  layout: { type: 'grid', ...layout },
  children,
  ...extra,
});

const BOX = { x: 0, y: 0, width: 372, height: 200 };

function build(template: Json, box = BOX, values: Record<string, unknown> = {}) {
  const result = instantiate(file(template) as never, values as never, box, {
    measure: approximateMeasurer,
  });
  const boxes = absoluteBoxes(result.root);
  const nodes = [...walk(result.root)];
  const at = (name: string) => {
    const node = nodes.find((n) => n.name === name) as SceneNode | undefined;
    if (node === undefined) throw new Error(`no node ${name}`);
    const b = boxes.get(node.id) ?? { x: 0, y: 0 };
    return { x: b.x, y: b.y, width: node.width, height: node.height };
  };
  const all = (name: string) =>
    nodes
      .filter((n) => n.name === name)
      .map((n) => ({
        x: boxes.get(n.id)?.x ?? 0,
        y: boxes.get(n.id)?.y ?? 0,
        width: n.width,
        height: n.height,
      }));
  return { ...result, at, all };
}

/** The grid as the root of a `row` (the `hug` grid needs a parent to measure). */
const hosted = (gridFrame: Json, box = BOX, values: Record<string, unknown> = {}) =>
  build(
    {
      type: 'frame',
      name: 'host',
      width: 'fill',
      height: 'fill',
      layout: { type: 'row' },
      children: [gridFrame],
    },
    box,
    values,
  );

describe('engine: uneven columns', () => {
  it('[72, "1fr", "2fr"] in 372 px with gap 12: 72, 92 and 184', () => {
    const { at, warnings } = build(
      grid({ columns: [72, '1fr', '2fr'], gap: 12 }, fills(3)),
    );
    expect(at('k0')).toMatchObject({ x: 0, width: 72 });
    expect(at('k1')).toMatchObject({ x: 84, width: 92 });
    expect(at('k2')).toMatchObject({ x: 188, width: 184 });
    expect(warnings).toEqual([]);
  });

  it('children flow to the next line after the last track, with lineGap', () => {
    const { at } = build(grid({ columns: [72, '1fr'], gap: 8, lineGap: 4 }, fills(4)));
    expect(at('k2')).toMatchObject({ x: 0, y: 24, width: 72 });
    expect(at('k3')).toMatchObject({ x: 80, y: 24, width: 292 });
  });

  it('hug takes the largest span 1 child of its track', () => {
    const kids = [
      rect('a', 30),
      rect('b', 'fill'),
      rect('c', 50),
      rect('d', 'fill'),
      rect('e', 40),
      rect('f', 'fill'),
    ];
    const { at } = build(grid({ columns: ['hug', '1fr'], gap: 10 }, kids));
    expect(at('b')).toMatchObject({ x: 60, width: 372 - 60 });
    expect(at('d')).toMatchObject({ x: 60, y: 20 });
    expect(at('a')).toMatchObject({ x: 0, width: 30 });
  });

  it('fr never goes below 0: the fr track collapses and the next one still starts after the gap', () => {
    const { at } = build(
      grid({ columns: [200, '1fr', 200], gap: 10 }, [
        rect('a', 10),
        rect('b', 0),
        rect('c', 10),
      ]),
    );
    expect(at('b').width).toBe(0);
    expect(at('c').x).toBe(220);
  });

  it('span 2 over uneven tracks occupies the sum plus the gap', () => {
    const { at } = build(
      grid({ columns: [50, '1fr', '1fr'], gap: 10 }, [
        rect('a', 'fill', 20, { span: 2 }),
        rect('b', 'fill'),
        rect('c', 'fill', 20, { span: 2 }),
      ]),
      { x: 0, y: 0, width: 300, height: 200 },
    );
    // free = 300 − 50 − 20 = 230 → 115 each.
    expect(at('a')).toMatchObject({ x: 0, width: 50 + 10 + 115 });
    expect(at('b')).toMatchObject({ x: 175 + 10, width: 115 });
    expect(at('c')).toMatchObject({ x: 0, y: 20, width: 175 });
  });

  it('a span larger than the list is limited to it', () => {
    const { at } = build(
      grid({ columns: [50, '1fr'], gap: 10 }, [rect('a', 'fill', 20, { span: 9 })]),
      { x: 0, y: 0, width: 300, height: 200 },
    );
    expect(at('a').width).toBe(300);
  });

  it('reverse, justify in the cell and the content warning stay as with an integer', () => {
    const reversed = build(
      grid({ columns: [72, '1fr'], gap: 8, reverse: true }, [
        rect('a', 'fill'),
        rect('b', 'fill'),
      ]),
    );
    expect(reversed.at('b')).toMatchObject({ x: 0, width: 72 });
    expect(reversed.at('a')).toMatchObject({ x: 80, width: 292 });

    const centered = build(
      grid({ columns: [100, '1fr'], justify: 'center' }, [rect('a', 40)]),
    );
    expect(centered.at('a')).toMatchObject({ x: 30, width: 40 });

    const stretched = build(
      grid({ columns: [100, '1fr'], justify: 'stretch' }, [
        {
          type: 'frame',
          name: 'a',
          width: 'hug',
          height: 'hug',
          layout: { type: 'row' },
          children: [rect('r', 10)],
        },
      ]),
    );
    expect(stretched.at('a').width).toBe(100);

    const warned = build(grid({ columns: [50, '1fr'] }, [rect('a', 200)]));
    expect(warned.warnings).toEqual(['content larger than the box: g']);
  });

  it('padding shrinks the content the fr tracks split', () => {
    const { at } = build(grid({ columns: [40, '1fr'], gap: 12, padding: 10 }, fills(2)));
    expect(at('k0')).toMatchObject({ x: 10, width: 40 });
    expect(at('k1')).toMatchObject({ x: 62, width: 372 - 20 - 40 - 12 });
  });
});

describe('engine: the hug grid with a track list', () => {
  it('with fr: px + hug + gaps + the largest (need ÷ n) × the fr total', () => {
    const { at } = hosted(
      grid(
        { columns: [40, '1fr', '2fr'], gap: 10 },
        [rect('a', 30), rect('b', 50), rect('c', 120)],
        { width: 'hug', height: 'hug' },
      ),
    );
    // max(50 / 1, 120 / 2) = 60 → 180; 40 + 180 + 20.
    expect(at('g').width).toBe(240);
    // the px rect keeps its 50 in the 60 px track; the next track starts after it and the gap.
    expect(at('b')).toMatchObject({ x: 50, width: 50 });
    expect(at('c')).toMatchObject({ x: 120, width: 120 });
  });

  it('without fr: px + hug tracks + gaps + padding', () => {
    const { at } = hosted(
      grid(
        { columns: [40, 'hug'], gap: 10, padding: 5 },
        [rect('a', 10), rect('b', 70), rect('c', 10), rect('d', 55)],
        { width: 'hug', height: 'hug' },
      ),
    );
    expect(at('g').width).toBe(5 + 40 + 10 + 70 + 5);
    expect(at('d')).toMatchObject({ x: 5 + 40 + 10, y: 25 });
  });

  it('an integer hug grid is unchanged', () => {
    const { at } = hosted(
      grid({ columns: 2, gap: 10 }, [rect('a', 50), rect('b', 80)], {
        width: 'hug',
        height: 'hug',
      }),
    );
    expect(at('g').width).toBe(2 * 80 + 10);
  });
});

describe('engine: rows as a list in the horizontal grid', () => {
  it('rows: [20, "1fr", "hug"] splits the height and fills columns', () => {
    const { at } = build(
      grid({ rows: [20, '1fr', 'hug'], gap: 5, lineGap: 7 }, [
        rect('a', 30, 'fill'),
        rect('b', 30, 'fill'),
        rect('c', 30, 12),
        rect('d', 40, 'fill'),
      ]),
      { x: 0, y: 0, width: 372, height: 200 },
    );
    // free = 200 − 20 − 12 − 2 gaps of 5 = 158.
    expect(at('a')).toMatchObject({ x: 0, y: 0, height: 20 });
    expect(at('b')).toMatchObject({ x: 0, y: 25, height: 158 });
    expect(at('c')).toMatchObject({ x: 0, y: 188 });
    expect(at('d')).toMatchObject({ x: 30 + 7, y: 0, height: 20 });
  });

  it('the hug grid on the rows axis sums the tracks', () => {
    const { at } = hosted(
      grid({ rows: [20, 'hug'], gap: 5 }, [rect('a', 30, 10), rect('b', 30, 36)], {
        width: 'hug',
        height: 'hug',
      }),
    );
    expect(at('g').height).toBe(20 + 5 + 36);
  });
});

describe('engine: a list by expression and in the repeat', () => {
  it('a list from $switch applies; an invalid one warns and falls to one column', () => {
    const columns = {
      $switch: 'kind',
      cases: { a: [40, '1fr'], b: ['1fr', '1fr', '1fr'] },
      default: [10, 'auto'],
    };
    const a = build(grid({ columns }, fills(2)), BOX, { kind: 'a' });
    expect(a.at('k1')).toMatchObject({ x: 40, width: 332 });
    const b = build(grid({ columns }, fills(3)), BOX, { kind: 'b' });
    expect(b.at('k2')).toMatchObject({ x: 248, width: 124 });
    const bad = build(grid({ columns }, fills(2)), BOX, { kind: 'zzz' });
    expect(bad.warnings).toEqual(['invalid value in layout.columns: [10,"auto"]']);
    expect(bad.at('k1')).toMatchObject({ x: 0, y: 20, width: 372 });
  });

  it('repeat.layout accepts the list', () => {
    const { all, warnings } = build({
      type: 'frame',
      name: 'g',
      width: 'fill',
      height: 'fill',
      children: [
        {
          type: 'repeat',
          count: 3,
          width: 'fill',
          layout: { type: 'grid', columns: [60, '1fr'], gap: 12 },
          template: rect('cell', 'fill', 20),
        },
      ],
    });
    const cells = all('cell');
    expect(cells).toHaveLength(3);
    expect(cells[0]).toMatchObject({ x: 0, y: 0, width: 60 });
    expect(cells[1]).toMatchObject({ x: 72, y: 0, width: 300 });
    expect(cells[2]).toMatchObject({ x: 0, y: 20, width: 60 });
    expect(warnings).toEqual([]);
  });
});

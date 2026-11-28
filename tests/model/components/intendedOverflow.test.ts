// OV1 (decisions 3 and 5 of #2913): `overflow: "intended"` keeps the five "does not fit" checks of the
// engine quiet for the flagged children, and `reportIntended` turns what only they fail into a note.
import { describe, expect, it } from 'vitest';
import { COMPONENT_FORMAT } from '../../../src/model/components/componentFormat';
import {
  approximateMeasurer,
  instantiate,
  measureComponent,
} from '../../../src/model/components/instantiate';
import { absoluteBoxes, walk } from '../../../src/model/components/scene';

type Json = Record<string, unknown>;

const BOX = { x: 0, y: 0, width: 360, height: 44 };

function file(template: Json): Json {
  return {
    format: COMPONENT_FORMAT,
    formatVersion: 4,
    id: 'c',
    name: 'C',
    size: { width: BOX.width, height: BOX.height },
    template,
  };
}

const INTENDED = { overflow: 'intended' };

function rect(name: string, w: unknown, h: unknown, extra: Json = {}): Json {
  return { type: 'rect', name, width: w, height: h, ...extra };
}

function bar(layout: Json, children: Json[], extra: Json = {}): Json {
  return {
    type: 'frame',
    name: 'bar',
    width: 'fill',
    height: 'fill',
    layout: { type: 'row', ...layout },
    children,
    ...extra,
  };
}

function build(template: Json, box = BOX, reportIntended = false) {
  const result = instantiate(
    file(template) as never,
    {},
    box,
    reportIntended
      ? { measure: approximateMeasurer, reportIntended }
      : { measure: approximateMeasurer },
  );
  return { ...result, shortfalls: result.shortfalls ?? {} };
}

const TOO_BIG = 'content larger than the box: bar';
const NOTE = 'overflow intended: bar';

describe('cross axis of a row (resolveAxis)', () => {
  const two = (extra: Json): Json[] => [
    rect('a', 48, 48, extra),
    rect('b', 48, 48, extra),
  ];

  it('two 48 × 48 flagged children in a 360 × 44 row: no warning and no shortfall', () => {
    const { warnings, shortfalls } = build(bar({}, two(INTENDED)));
    expect(warnings).toEqual([]);
    expect(shortfalls).toEqual({});
  });

  it('the same children without the flag warn, with the shortfall', () => {
    const { warnings, shortfalls } = build(bar({}, two({})));
    expect(warnings).toEqual([TOO_BIG]);
    expect(shortfalls).toEqual({ [TOO_BIG]: 4 });
  });

  it('a flagged child next to an unflagged one that overflows: the shortfall is the unflagged one alone', () => {
    const { warnings, shortfalls } = build(
      bar({}, [rect('a', 48, 60, INTENDED), rect('b', 48, 50)]),
    );
    expect(warnings).toEqual([TOO_BIG]);
    expect(shortfalls).toEqual({ [TOO_BIG]: 6 });
  });

  it('a flagged child next to an unflagged one that fits: no warning', () => {
    const { warnings } = build(bar({}, [rect('a', 48, 60, INTENDED), rect('b', 48, 40)]));
    expect(warnings).toEqual([]);
  });
});

describe('main axis of a row (resolveMain)', () => {
  it('a flagged child that pushes the sum past the width: no warning', () => {
    const { warnings, shortfalls } = build(
      bar({ gap: 10 }, [rect('a', 200, 20), rect('b', 200, 20, INTENDED)]),
      { x: 0, y: 0, width: 300, height: 44 },
    );
    expect(warnings).toEqual([]);
    expect(shortfalls).toEqual({});
  });

  it('the same row without the flag warns, with the shortfall', () => {
    const { shortfalls } = build(
      bar({ gap: 10 }, [rect('a', 200, 20), rect('b', 200, 20)]),
      { x: 0, y: 0, width: 300, height: 44 },
    );
    expect(shortfalls).toEqual({ [TOO_BIG]: 110 });
  });

  it('the others still overflow: the shortfall counts their sizes and the gaps between them alone', () => {
    const { shortfalls } = build(
      bar({ gap: 10 }, [
        rect('a', 200, 20),
        rect('flag', 500, 20, INTENDED),
        rect('c', 200, 20),
      ]),
      { x: 0, y: 0, width: 300, height: 44 },
    );
    // 200 + 10 + 200 = 410 against 300: 110 short (the flagged 500 and its gap do not count).
    expect(shortfalls).toEqual({ [TOO_BIG]: 110 });
  });

  it('a column: the same holds on its main axis', () => {
    const column = { type: 'column' };
    const flagged = build(
      bar(column, [rect('a', 20, 30), rect('b', 20, 60, INTENDED)], {}),
      { x: 0, y: 0, width: 100, height: 50 },
    );
    expect(flagged.warnings).toEqual([]);
    const plain = build(bar(column, [rect('a', 20, 30), rect('b', 20, 60)], {}), {
      x: 0,
      y: 0,
      width: 100,
      height: 50,
    });
    expect(plain.shortfalls).toEqual({ [TOO_BIG]: 40 });
  });
});

describe('a none parent (noneExtent)', () => {
  const frame = (extra: Json): Json => ({
    type: 'frame',
    name: 'bar',
    width: 24,
    height: 24,
    layout: { type: 'none' },
    children: [
      rect('touch', 48, 48, { anchors: { centerX: true, centerY: true }, ...extra }),
    ],
  });
  const box = { x: 0, y: 0, width: 24, height: 24 };

  it('a 48 child centered in a 24 frame: no warning when flagged', () => {
    const { warnings, shortfalls } = build(frame(INTENDED), box);
    expect(warnings).toEqual([]);
    expect(shortfalls).toEqual({});
  });

  it('without the flag it warns', () => {
    expect(build(frame({}), box).shortfalls).toEqual({ [TOO_BIG]: 24 });
  });
});

describe('a grid (solveEqualTracks, solveTrackList and solveLines)', () => {
  const grid = (layout: Json, children: Json[]): Json => ({
    type: 'frame',
    name: 'bar',
    width: 'fill',
    height: 'fill',
    layout: { type: 'grid', ...layout },
    children,
  });

  it('equal tracks: a flagged child wider than its cell does not warn', () => {
    const flagged = build(grid({ columns: 2 }, [rect('a', 300, 20, INTENDED)]));
    expect(flagged.warnings).toEqual([]);
    expect(build(grid({ columns: 2 }, [rect('a', 300, 20)])).shortfalls).toEqual({
      [TOO_BIG]: 120,
    });
  });

  it('equal tracks: an unflagged child that overflows still warns, with its own shortfall', () => {
    const { shortfalls } = build(
      grid({ columns: 2 }, [rect('a', 300, 20, INTENDED), rect('b', 200, 20)]),
    );
    expect(shortfalls).toEqual({ [TOO_BIG]: 20 });
  });

  it('a track list: a flagged child wider than its cell does not warn', () => {
    const layout = { columns: [50, '1fr'] };
    expect(build(grid(layout, [rect('a', 200, 20, INTENDED)])).warnings).toEqual([]);
    expect(build(grid(layout, [rect('a', 200, 20)])).shortfalls).toEqual({
      [TOO_BIG]: 150,
    });
  });

  it('flow lines: a flagged child that makes the lines taller than the box does not warn', () => {
    const layout = { columns: 1, lineGap: 10 };
    const tall = (extra: Json): Json[] => [
      rect('a', 'fill', 20),
      rect('b', 'fill', 80, extra),
    ];
    expect(build(grid(layout, tall(INTENDED))).warnings).toEqual([]);
    // 20 + 10 + 80 = 110 against 44.
    expect(build(grid(layout, tall({}))).shortfalls).toEqual({ [TOO_BIG]: 66 });
  });

  it('flow lines: the unflagged lines alone are counted', () => {
    const layout = { columns: 1, lineGap: 10 };
    const { shortfalls } = build(
      grid(layout, [rect('a', 'fill', 30), rect('b', 'fill', 80, INTENDED)]),
    );
    // The flagged line adds nothing: only the 30 of the first line is checked (it fits in 44).
    expect(shortfalls).toEqual({});
  });
});

describe('a wrap line (resolveMain of each line)', () => {
  it('a flagged child wider than the line: no warning', () => {
    const wrap = (extra: Json): Json =>
      bar({ wrap: 'wrap', gap: 4 }, [rect('a', 100, 20), rect('b', 500, 20, extra)], {
        height: 'fill',
      });
    expect(
      build(wrap(INTENDED), { x: 0, y: 0, width: 320, height: 200 }).warnings,
    ).toEqual([]);
    expect(build(wrap({}), { x: 0, y: 0, width: 320, height: 200 }).shortfalls).toEqual({
      [TOO_BIG]: 180,
    });
  });
});

describe('the flag changes only the warning', () => {
  const layoutOf = (extra: Json) => {
    const result = build(
      bar({ gap: 4 }, [rect('a', 200, 48, extra), rect('b', 200, 48, extra)]),
    );
    const boxes = absoluteBoxes(result.root);
    return {
      root: JSON.stringify(result.root),
      boxes: [...walk(result.root)].map((n) => [
        n.name,
        n.width,
        n.height,
        boxes.get(n.id),
      ]),
    };
  };

  it('the scene and the boxes are identical with and without the flag', () => {
    expect(layoutOf(INTENDED)).toEqual(layoutOf({}));
  });

  it('the hug measure is identical', () => {
    const hug = (extra: Json): Json => ({
      type: 'frame',
      name: 'bar',
      width: 'hug',
      height: 'hug',
      layout: { type: 'row' },
      children: [rect('a', 48, 48, extra)],
    });
    const measure = (extra: Json) =>
      measureComponent(
        file(hug(extra)) as never,
        {},
        { width: null, height: null },
        { measure: approximateMeasurer },
      );
    expect(measure(INTENDED)).toEqual(measure({}));
  });
});

describe('reportIntended (decision 5)', () => {
  const flagged = bar({}, [rect('a', 48, 48, INTENDED), rect('b', 48, 48, INTENDED)]);

  it('with the option, the case gets the note and no shortfall', () => {
    const { warnings, messages, shortfalls } = build(flagged, BOX, true);
    expect(warnings).toEqual([NOTE]);
    expect(messages.map((m) => m.code)).toEqual(['engine.overflowIntended']);
    expect(shortfalls).toEqual({});
  });

  it('the note is not one of the overflow warnings', () => {
    const { overflowWarnings } = build(flagged, BOX, true);
    expect(overflowWarnings ?? []).toEqual([]);
  });

  it('without the option there is no message', () => {
    expect(build(flagged).warnings).toEqual([]);
  });

  it('a sibling that really overflows: the usual warning, with its shortfall, and the note is not added', () => {
    const { warnings, shortfalls } = build(
      bar({}, [rect('a', 48, 60, INTENDED), rect('b', 48, 50)]),
      BOX,
      true,
    );
    expect(warnings).toEqual([TOO_BIG]);
    expect(shortfalls).toEqual({ [TOO_BIG]: 6 });
  });

  it('a flagged child that fits adds no note', () => {
    expect(build(bar({}, [rect('a', 48, 40, INTENDED)]), BOX, true).warnings).toEqual([]);
  });
});

// OV2 (decision 6 of #2913): `position: "absolute"` takes a child of a `row`, `column` or `grid` out of
// the flow and places it like a child of a `none` frame of the parent's whole box.
import { describe, expect, it } from 'vitest';
import { COMPONENT_FORMAT } from '../../../src/model/components/componentFormat';
import {
  approximateMeasurer,
  instantiate,
  measureComponent,
} from '../../../src/model/components/instantiate';
import { absoluteBoxes, walk } from '../../../src/model/components/scene';

type Json = Record<string, unknown>;

const BOX = { x: 0, y: 0, width: 200, height: 120 };
const ABSOLUTE = { position: 'absolute' };

function file(template: Json, size = BOX): Json {
  return {
    format: COMPONENT_FORMAT,
    formatVersion: 4,
    id: 'c',
    name: 'C',
    size: { width: size.width, height: size.height },
    template,
  };
}

function rect(name: string, w: unknown, h: unknown, extra: Json = {}): Json {
  return { type: 'rect', name, width: w, height: h, ...extra };
}

function text(name: string, w: unknown, h: unknown, extra: Json = {}): Json {
  return { type: 'text', name, text: 'Hello', width: w, height: h, ...extra };
}

function parent(layout: Json, children: Json[], extra: Json = {}): Json {
  return {
    type: 'frame',
    name: 'parent',
    width: 'fill',
    height: 'fill',
    layout,
    children,
    ...extra,
  };
}

function build(template: Json, box = BOX) {
  return instantiate(file(template, box) as never, {}, box, {
    measure: approximateMeasurer,
  });
}

/** The boxes (relative to the root) of every node, by name. */
function boxesOf(template: Json, box = BOX): Record<string, number[]> {
  const result = build(template, box);
  const boxes = absoluteBoxes(result.root);
  const out: Record<string, number[]> = {};
  for (const node of walk(result.root)) {
    const b = boxes.get(node.id);
    if (b) out[node.name] = [b.x, b.y, b.width, b.height];
  }
  return out;
}

const hugHeight = (template: Json, width = 200): number =>
  measureComponent(
    file(template) as never,
    {},
    { width, height: null },
    { measure: approximateMeasurer },
  ).height;

const COLUMN = { type: 'column', padding: 16, gap: 8 };
const TEXTS = (): Json[] => [text('t1', 'fill', 20), text('t2', 'fill', 20)];
const OVERLAY = (extra: Json = {}): Json => ({
  type: 'rect',
  name: 'overlay',
  ...ABSOLUTE,
  anchors: { left: 0, right: 0, top: 0, bottom: 0 },
  ...extra,
});

describe('out of the flow: the siblings do not move', () => {
  it('the texts of a padded column sit where they sit without the absolute rect', () => {
    const without = boxesOf(parent(COLUMN, TEXTS()));
    const withRect = boxesOf(parent(COLUMN, [...TEXTS(), OVERLAY()]));
    expect(withRect.t1).toEqual(without.t1);
    expect(withRect.t2).toEqual(without.t2);
  });

  it('an absolute child between the texts changes nothing either (gap and main axis)', () => {
    const [t1, t2] = TEXTS() as [Json, Json];
    const without = boxesOf(parent(COLUMN, [t1, t2]));
    const between = boxesOf(parent(COLUMN, [t1, OVERLAY(), t2]));
    expect(between.t1).toEqual(without.t1);
    expect(between.t2).toEqual(without.t2);
  });

  it('the hug height of the column is the same: 16 + 20 + 8 + 20 + 16', () => {
    const hug = (children: Json[]): Json =>
      parent(COLUMN, children, { width: 'fill', height: 'hug' });
    expect(hugHeight(hug(TEXTS()))).toBe(80);
    expect(hugHeight(hug([...TEXTS(), OVERLAY()]))).toBe(80);
  });

  it('an absolute child alone does not give the parent a content size (hug is the padding)', () => {
    const only = parent(COLUMN, [rect('big', 300, 300, ABSOLUTE)], {
      width: 'fill',
      height: 'hug',
    });
    expect(hugHeight(only)).toBe(32);
  });

  it('the rect with anchors on all four sides covers the whole box, padding included', () => {
    const box = { x: 0, y: 0, width: 200, height: 80 };
    const boxes = boxesOf(parent(COLUMN, [...TEXTS(), OVERLAY()]), box);
    expect(boxes.overlay).toEqual([0, 0, 200, 80]);
    expect(boxes.t1).toEqual([16, 16, 168, 20]);
  });

  it('the scene keeps the template order for the drawing order', () => {
    const result = build(
      parent(COLUMN, [
        rect('first', 10, 10, ABSOLUTE),
        text('t1', 'fill', 20),
        OVERLAY(),
      ]),
    );
    const names = [...walk(result.root)].map((n) => n.name);
    expect(names.indexOf('first')).toBeLessThan(names.indexOf('t1'));
    expect(names.indexOf('t1')).toBeLessThan(names.indexOf('overlay'));
  });
});

describe('anchors against the parent whole box (like a none child)', () => {
  const kids = (extra: Json): Json[] => [
    rect('a', 'fill', 20),
    rect('badge', 24, 24, { ...ABSOLUTE, ...extra }),
  ];
  const none = (extra: Json): Json =>
    parent({ type: 'none' }, [rect('badge', 24, 24, extra)]);

  it('centerY with end: 8 places it like a none child of the same box', () => {
    const anchors = { centerY: true, end: 8 };
    const flow = boxesOf(parent({ type: 'row', padding: 12 }, kids({ anchors })));
    expect(flow.badge).toEqual(boxesOf(none({ anchors })).badge);
    expect(flow.badge).toEqual([200 - 8 - 24, (120 - 24) / 2, 24, 24]);
  });

  it('the mirror in rtl: end is the left edge', () => {
    const anchors = { centerY: true, end: 8 };
    const flow = boxesOf(
      parent({ type: 'row', padding: 12 }, kids({ anchors }), { direction: 'rtl' }),
    );
    const mirrored = boxesOf({ ...none({ anchors }), direction: 'rtl' });
    expect(flow.badge).toEqual(mirrored.badge);
    expect(flow.badge).toEqual([8, (120 - 24) / 2, 24, 24]);
  });

  it('without anchors it sits at the start corner of the box, ignoring align and justify', () => {
    const flow = boxesOf(
      parent({ type: 'row', padding: 12, align: 'end', justify: 'end' }, kids({})),
    );
    expect(flow.badge).toEqual([0, 0, 24, 24]);
  });

  it('without anchors in rtl it sits at the right edge', () => {
    const flow = boxesOf(
      parent({ type: 'row', padding: 12, align: 'end' }, kids({}), {
        direction: 'rtl',
      }),
    );
    expect(flow.badge).toEqual([200 - 24, 0, 24, 24]);
  });

  it('start/end anchors on both sides stretch it (logical, ltr)', () => {
    const flow = boxesOf(
      parent({ type: 'column', padding: 12 }, kids({ anchors: { start: 4, end: 6 } })),
    );
    expect(flow.badge?.[0]).toBe(4);
    expect(flow.badge?.[2]).toBe(200 - 4 - 6);
  });
});

describe('sizes against the whole box', () => {
  const sized = (w: unknown, h: unknown): number[] | undefined =>
    boxesOf(
      parent({ type: 'column', padding: 16 }, [
        rect('a', 'fill', 20),
        rect('abs', w, h, ABSOLUTE),
      ]),
    ).abs;

  it('fill takes the whole box', () => {
    expect(sized('fill', 'fill')).toEqual([0, 0, 200, 120]);
  });

  it('"50%" is a fraction of the whole box, not of the content area', () => {
    expect(sized('50%', '50%')).toEqual([0, 0, 100, 60]);
  });

  it('fill with anchors takes the whole box minus the anchors', () => {
    const box = boxesOf(
      parent({ type: 'column', padding: 16 }, [
        rect('a', 'fill', 20),
        rect('abs', 'fill', 'fill', { ...ABSOLUTE, anchors: { left: 10, top: 5 } }),
      ]),
    ).abs;
    expect(box).toEqual([10, 5, 190, 115]);
  });

  it('hug measures its own content', () => {
    const box = boxesOf(
      parent({ type: 'row' }, [
        rect('a', 'fill', 20),
        {
          type: 'frame',
          name: 'abs',
          width: 'hug',
          height: 'hug',
          ...ABSOLUTE,
          layout: { type: 'row' },
          children: [rect('r', 30, 12)],
        },
      ]),
    ).abs;
    expect(box).toEqual([0, 0, 30, 12]);
  });
});

describe('other parents ignore the absolute child', () => {
  it('a row with justify: space-between ignores it in the spacing', () => {
    const row = (extra: Json[]): Json =>
      parent({ type: 'row', justify: 'space-between' }, [
        rect('a', 20, 20),
        ...extra,
        rect('b', 20, 20),
      ]);
    const without = boxesOf(row([]));
    const withAbs = boxesOf(row([rect('abs', 50, 50, ABSOLUTE)]));
    expect(withAbs.a).toEqual(without.a);
    expect(withAbs.b).toEqual(without.b);
  });

  it('a row: no gap and no fill share for it', () => {
    const row = (extra: Json[]): Json =>
      parent({ type: 'row', gap: 10 }, [
        rect('a', 'fill', 20),
        ...extra,
        rect('b', 'fill', 20),
      ]);
    const without = boxesOf(row([]));
    const withAbs = boxesOf(row([rect('abs', 'fill', 20, ABSOLUTE)]));
    expect(withAbs.a).toEqual(without.a);
    expect(withAbs.b).toEqual(without.b);
  });

  it('weight and span on it have no effect', () => {
    const row = (extra: Json): Json =>
      parent({ type: 'row' }, [
        rect('a', 'fill', 20, { weight: 1 }),
        rect('abs', 'fill', 20, { ...ABSOLUTE, ...extra }),
        rect('b', 'fill', 20, { weight: 1 }),
      ]);
    const plain = boxesOf(row({}));
    const heavy = boxesOf(row({ weight: 5 }));
    expect(heavy.a).toEqual(plain.a);
    expect(heavy.b).toEqual(plain.b);
    expect(boxesOf(row({ span: 3 })).a).toEqual(plain.a);
  });

  it('a grid gives it no cell', () => {
    const grid = (extra: Json[]): Json =>
      parent({ type: 'grid', columns: 2, gap: 4 }, [
        rect('a', 'fill', 20),
        ...extra,
        rect('b', 'fill', 20),
        rect('c', 'fill', 20),
      ]);
    const without = boxesOf(grid([]));
    const withAbs = boxesOf(grid([rect('abs', 10, 10, ABSOLUTE)]));
    for (const name of ['a', 'b', 'c']) expect(withAbs[name]).toEqual(without[name]);
    expect(withAbs.abs).toEqual([0, 0, 10, 10]);
  });

  it('a wrap gives it no line, and it does not count for maxPerLine', () => {
    const wrap = (extra: Json[]): Json =>
      parent({ type: 'row', wrap: 'wrap', gap: 4, lineGap: 4, maxPerLine: 2 }, [
        rect('a', 60, 20),
        ...extra,
        rect('b', 60, 20),
        rect('c', 60, 20),
      ]);
    const without = boxesOf(wrap([]));
    const withAbs = boxesOf(wrap([rect('abs', 60, 20, ABSOLUTE)]));
    for (const name of ['a', 'b', 'c']) expect(withAbs[name]).toEqual(without[name]);
  });

  it('align: baseline ignores it (the row hugs the baselined children only)', () => {
    const row = (extra: Json[]): Json =>
      parent({ type: 'row', align: 'baseline' }, [text('t', 80, 20), ...extra], {
        height: 'hug',
      });
    expect(hugHeight(row([rect('abs', 40, 90, ABSOLUTE)]))).toBe(hugHeight(row([])));
  });

  it('min-content and max-content of the parent ignore it', () => {
    const intrinsic = (extra: Json[], mode: 'min-content' | 'max-content'): number =>
      measureComponent(
        file(
          parent({ type: 'row', gap: 4 }, [rect('a', 30, 10), ...extra], {
            width: 'hug',
          }),
        ) as never,
        {},
        { width: mode, height: null },
        { measure: approximateMeasurer },
      ).width;
    for (const mode of ['min-content', 'max-content'] as const)
      expect(intrinsic([rect('abs', 100, 10, ABSOLUTE)], mode)).toBe(intrinsic([], mode));
  });
});

describe('a none parent', () => {
  it('position: absolute changes nothing at all', () => {
    const none = (extra: Json): Json =>
      parent({ type: 'none' }, [
        rect('a', 40, 40, { anchors: { right: 4, bottom: 4 }, ...extra }),
        rect('b', 'fill', 'fill', extra),
      ]);
    const plain = build(none({}));
    const flagged = build(none(ABSOLUTE));
    expect(JSON.stringify(flagged.root)).toEqual(JSON.stringify(plain.root));
    expect(flagged.warnings).toEqual(plain.warnings);
  });
});

describe('the fit check (the none extent)', () => {
  const bar = (extra: Json): Json =>
    parent({ type: 'row' }, [
      rect('a', 'fill', 20),
      rect('touch', 48, 48, { ...ABSOLUTE, anchors: { centerY: true }, ...extra }),
    ]);
  const small = { x: 0, y: 0, width: 200, height: 24 };
  const TOO_BIG = 'content larger than the box: parent';

  it('a 48 absolute child centered in a 24 row warns content larger than the box', () => {
    const result = build(bar({}), small);
    expect(result.warnings).toContain(TOO_BIG);
    expect(result.shortfalls?.[TOO_BIG]).toBe(24);
  });

  it('with overflow: "intended" it does not', () => {
    const result = build(bar({ overflow: 'intended' }), small);
    expect(result.warnings).not.toContain(TOO_BIG);
  });

  it('a 48 absolute child that fits does not warn', () => {
    const result = build(bar({}), BOX);
    expect(result.warnings).not.toContain(TOO_BIG);
  });
});

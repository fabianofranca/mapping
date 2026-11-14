// EX6 of the "expressions that compute in format 4" stage (#897): the carousel of material3-compose
// draws by the width of the marking (`$size`), like the Compose strategy (Keylines.kt and
// Arrangement.kt of the pinned commit), without enumerated tables. The oracle below is a faithful port of the
// algorithm (`multiBrowseKeylineList`, `heroKeylineList`, `Arrangement.findLowestCostArrangement`
// and `fit`) and the regression uses the scenes from before (tests/fixtures/material3-ex6-v1.json).
import { describe, expect, it } from 'vitest';
import { findEntry } from '../../src/model/catalog';
import { absoluteBoxes, walk } from '../../src/model/components/scene';
import type { SceneNode } from '../../src/model/components/scene';
import { approximateMeasurer, instantiate } from '../../src/model/components/instantiate';
import { resolveTokens } from '../../src/model/components/tokens';
import { defaultValues } from '../../src/model/libraryDrawing';
import { text, typeOf } from '../support/material3Library';
import { catalog, draw, missingNodes, oldScenes } from '../support/material3Ex6Fixture';
import type { Drawing, Mode, Values } from '../support/material3Ex6Fixture';

// pt-BR kept: node names of libraries/material3-compose and of tests/fixtures/material3-ex6-v1.json are Portuguese data
const entry = findEntry(catalog, 'carousel')!;
const library = catalog.library!;
const HEIGHT = entry.component!.size.height;

/** Draws the carousel on a marking of width `width` (the drawing proof uses the `size`). */
function drawAt(width: number, values: Values, mode: Mode = 'light'): Drawing {
  return instantiate(
    entry.component!,
    { ...defaultValues(entry.type), ...values },
    { x: 0, y: 0, width, height: HEIGHT },
    {
      measure: approximateMeasurer,
      tokens: resolveTokens(library.tokens, {}, mode),
      ...(library.icons === undefined ? {} : { icons: library.icons }),
    },
  );
}

const rows = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    image: `https://example.com/${i}.jpg`,
    label: `Item ${i}`,
  }));

const visible = (d: Drawing): SceneNode[] => [...walk(d.root)].filter((n) => n.visible);
const itemBoxes = (d: Drawing): number[][] => {
  const boxes = absoluteBoxes(d.root);
  return visible(d)
    .filter((n) => n.name === 'item')
    .map((n) => {
      const b = boxes.get(n.id)!;
      return [b.x, b.y, b.width, b.height];
    });
};
const widths = (d: Drawing): number[] => itemBoxes(d).map((r) => r[2]!);
const near = (a: number, b: number, eps = 0.5) => Math.abs(a - b) <= eps;
/** The item boxes equal to the expected ones (the `fill` division leaves noise of 1e-13). */
function expectBoxes(actual: number[][], expected: number[][]) {
  expect(actual).toHaveLength(expected.length);
  actual.forEach((box, i) =>
    box.forEach((v, j) => expect(v, `item ${i} [${j}]`).toBeCloseTo(expected[i]![j]!, 6)),
  );
}

// ---------------------------------------------------------------------------------------------
// Oracle: the Compose algorithm (Keylines.kt, Arrangement.kt), in 64-bit floating point
// ---------------------------------------------------------------------------------------------

interface Arrangement {
  priority: number;
  small: number;
  smallCount: number;
  medium: number;
  mediumCount: number;
  large: number;
  largeCount: number;
}
const MIN_SMALL = 40;
const MAX_SMALL = 56;
const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);
const count = (a: Arrangement) => a.largeCount + a.mediumCount + a.smallCount;

function isValid(a: Arrangement): boolean {
  if (a.largeCount > 0 && a.smallCount > 0 && a.mediumCount > 0)
    return a.large > a.medium && a.medium > a.small;
  if (a.largeCount > 0 && a.smallCount > 0) return a.large > a.small;
  return true;
}
const cost = (a: Arrangement, target: number) =>
  isValid(a) ? Math.abs(target - a.large) * a.priority : Number.MAX_VALUE;

/** `Arrangement.fit` and `calculateLargeSize` (Arrangement.kt, lines 150 to 276), with the medium target. */
function fitFull(
  priority: number,
  space: number,
  spacing: number,
  smallCount: number,
  smallTarget: number,
  mediumCount: number,
  mediumTarget: number,
  largeCount: number,
  largeTarget: number,
): Arrangement {
  const total = largeCount + mediumCount + smallCount;
  const free = space - (total - 1) * spacing;
  let small = clamp(smallTarget, MIN_SMALL, MAX_SMALL);
  const taken =
    largeTarget * largeCount + mediumTarget * mediumCount + small * smallCount;
  const delta = free - taken;
  if (smallCount > 0 && delta > 0)
    small += Math.min(delta / smallCount, MAX_SMALL - small);
  else if (smallCount > 0 && delta < 0)
    small += Math.max(delta / smallCount, MIN_SMALL - small);
  if (smallCount === 0) small = 0;
  let large =
    (free - (smallCount + mediumCount / 2) * small) / (largeCount + mediumCount / 2);
  let medium = (large + small) / 2;
  if (mediumCount > 0 && large !== largeTarget) {
    const adjust = (largeTarget - large) * largeCount;
    const flex = medium * 0.1 * mediumCount;
    const distribute = Math.min(Math.abs(adjust), flex);
    if (adjust > 0) {
      medium -= distribute / mediumCount;
      large += distribute / largeCount;
    } else {
      medium += distribute / mediumCount;
      large -= distribute / largeCount;
    }
  }
  return {
    priority,
    small,
    smallCount,
    medium,
    mediumCount,
    large,
    largeCount,
  };
}

/** `Arrangement.findLowestCostArrangement` (Arrangement.kt, lines 89 to 130). */
function findLowest(
  space: number,
  spacing: number,
  smallTarget: number,
  smallCounts: number[],
  mediumTarget: number,
  mediumCounts: number[],
  largeTarget: number,
  largeCounts: number[],
): Arrangement | null {
  let best: Arrangement | null = null;
  let priority = 1;
  for (const lc of largeCounts)
    for (const mc of mediumCounts)
      for (const sc of smallCounts) {
        const a = fitFull(
          priority,
          space,
          spacing,
          sc,
          smallTarget,
          mc,
          mediumTarget,
          lc,
          largeTarget,
        );
        if (best === null || cost(a, largeTarget) < cost(best, largeTarget)) {
          best = a;
          if (cost(best, largeTarget) === 0) return best;
        }
        priority++;
      }
  return best;
}

/** `multiBrowseKeylineList` (Keylines.kt, lines 58 to 143): the arrangement at the start of the scroll. */
function multiBrowse(
  width: number,
  preferred: number,
  spacing: number,
  items: number,
): Arrangement | null {
  if (width === 0 || preferred === 0) return null;
  const target = Math.min(preferred, width);
  const smallTarget = clamp(target / 3, MIN_SMALL, MAX_SMALL);
  const mediumTarget = (target + smallTarget) / 2;
  const smallCounts = width < MIN_SMALL * 2 ? [0] : [1];
  const minAvailable = width - mediumTarget * 1 - MAX_SMALL * Math.max(...smallCounts);
  const minLarge = Math.max(1, Math.floor(minAvailable / target));
  const maxLarge = Math.ceil(width / target);
  const largeCounts = Array.from(
    { length: maxLarge - minLarge + 1 },
    (_, i) => maxLarge - i,
  );
  let a = findLowest(
    width,
    spacing,
    smallTarget,
    smallCounts,
    mediumTarget,
    [1, 0],
    target,
    largeCounts,
  );
  if (a !== null && count(a) > items) {
    let surplus = count(a) - items;
    let small = a.smallCount;
    let medium = a.mediumCount;
    while (surplus > 0) {
      if (small > 0) small -= 1;
      else if (medium > 1) medium -= 1;
      surplus -= 1;
    }
    a = findLowest(
      width,
      spacing,
      smallTarget,
      [small],
      mediumTarget,
      [medium],
      target,
      largeCounts,
    );
  }
  return a;
}

/** The sizes by item index at the start of the scroll; `undefined` where the strategy has no position. */
function multiBrowseWidths(
  width: number,
  preferred: number,
  spacing: number,
  n: number,
): (number | undefined)[] {
  const a = multiBrowse(width, preferred, spacing, n)!;
  return Array.from({ length: n }, (_, i) => {
    if (i < a.largeCount) return a.large;
    if (i < a.largeCount + a.mediumCount) return a.medium;
    if (i < count(a)) return a.small;
    return undefined;
  });
}

// ---------------------------------------------------------------------------------------------
// multi-browse
// ---------------------------------------------------------------------------------------------

const multi = (n: number, extra: Values = {}): Values => ({
  style: 'multi-browse',
  preferredItemWidth: 186,
  itemSpacing: 8,
  items: rows(n),
  ...extra,
});

describe('EX6 carousel — multi-browse by the width of the marking', () => {
  it('at 360, with 186 preferred and spacing 8: large 186, medium 118 and small 40, from the edge', () => {
    const d = drawAt(360, multi(3));
    expectBoxes(itemBoxes(d), [
      [0, 0, 186, HEIGHT],
      [194, 0, 118, HEIGHT],
      [320, 0, 40, HEIGHT],
    ]);
    // the first item matches the 186 from before (Arrangement.kt: the medium flexes 10% and returns the large to the target)
    expect(widths(d)[0]).toBeCloseTo(186, 6);
    expect(d.warnings).toEqual([]);
  });

  it('at 600, with 3 items, Compose drops the small one and redoes it: three larges of 167.31 (Keylines.kt 100 to 123)', () => {
    const d = drawAt(600, multi(3));
    const expected = multiBrowseWidths(600, 186, 8, 3);
    expect(expected.map((w) => Math.round(w! * 100) / 100)).toEqual([
      167.31, 167.31, 167.31,
    ]);
    expect(widths(d).map((w, i) => near(w, expected[i]!))).toEqual([true, true, true]);
    expect(itemBoxes(d)[1]![0]).toBeCloseTo(167.31 + 8, 1);
  });

  it('at 600, with spare items (8), shows 2 larges, the medium and the small, and does not draw what goes past the edge', () => {
    const d = drawAt(600, multi(8));
    const w = widths(d);
    expect(w).toHaveLength(4);
    expect(w[0]).toBeCloseTo(190.48, 2);
    expect(w[1]).toBeCloseTo(190.48, 2);
    expect(w[2]).toBeCloseTo(139.04, 2);
    expect(w[3]).toBe(56);
    const last = itemBoxes(d)[3]!;
    expect(last[0]! + last[2]!).toBeCloseTo(600, 6);
  });

  it('at 240: a large of 186 and a small of 46 (the 3rd item does not fit)', () => {
    const d = drawAt(240, multi(3));
    expectBoxes(itemBoxes(d), [
      [0, 0, 186, HEIGHT],
      [194, 0, 46, HEIGHT],
    ]);
  });

  it('preferredItemWidth larger than the marking: one large item and the small one of 40', () => {
    const d = drawAt(300, multi(3, { preferredItemWidth: 400 }));
    expect(widths(d)).toEqual([300 - 8 - 40, 40]);
    expect(widths(drawAt(300, multi(1, { preferredItemWidth: 400 })))).toEqual([300]);
  });

  it('the spacing between items and the preferred width change the arrangement (not only the 186 and 8 count)', () => {
    const wide = widths(
      drawAt(500, multi(8, { preferredItemWidth: 150, itemSpacing: 0 })),
    );
    const expected = multiBrowseWidths(500, 150, 0, 8).filter((w) => w !== undefined);
    expect(wide.map((w) => Math.round(w))).toEqual(expected.map((w) => Math.round(w!)));
    const spaced = itemBoxes(drawAt(420, multi(8, { itemSpacing: 24 })));
    const exp2 = multiBrowseWidths(420, 186, 24, 8).filter((w) => w !== undefined);
    expect(spaced.map((r) => Math.round(r[2]!))).toEqual(exp2.map((w) => Math.round(w!)));
    // the spacing between the items comes from itemSpacing
    expect(spaced[1]![0]).toBeCloseTo(spaced[0]![2]! + 24, 6);
  });

  it('the widths follow the marking: wider, more large items', () => {
    const counts = [360, 480, 600, 720, 900].map(
      (w) => widths(drawAt(w, multi(12))).filter((x) => x > 100).length,
    );
    expect(counts[counts.length - 1]!).toBeGreaterThan(counts[0]!);
  });

  /**
   * Against the oracle, over a grid of widths, preferred widths, spacings and item counts.
   * The neighborhood of ±3 px of an arrangement switch is left out (the switch threshold is approximate, see
   * docs/carousel.md, "What still differs"); the tight arrangement of the first period, in which
   * Compose picks `ceil(width / target)` shrunken larges, counts and is part of what gets wrong.
   */
  it('checks the grid from 200 to 900 against the Compose algorithm (≤ 0.5 px, ≥ 96% of the cases)', () => {
    let total = 0;
    let wrong = 0;
    const same = (
      a: (number | undefined)[],
      b: (number | undefined)[],
      eps: number,
    ): boolean =>
      a.length === b.length &&
      a.every(
        (v, i) =>
          (v === undefined) === (b[i] === undefined) &&
          (v === undefined || near(v, b[i]!, eps)),
      );
    for (const n of [1, 3, 12])
      for (const preferred of [150, 186, 240])
        for (const spacing of [0, 8, 16])
          for (let width = 200; width <= 900; width += 7) {
            if (preferred >= width) continue;
            const here = multiBrowseWidths(width, preferred, spacing, n);
            const edge = [-3, 3].some(
              (dx) =>
                !same(here, multiBrowseWidths(width + dx, preferred, spacing, n), 1.5),
            );
            if (edge) continue;
            total++;
            const drawn = widths(
              drawAt(
                width,
                multi(n, { preferredItemWidth: preferred, itemSpacing: spacing }),
              ),
            );
            if (
              !same(
                here.filter((w) => w !== undefined),
                drawn,
                0.5,
              )
            )
              wrong++;
          }
    expect(total).toBeGreaterThan(1000);
    expect(wrong, `${wrong} of ${total}`).toBeLessThanOrEqual(Math.floor(total * 0.04));
  }, 30_000);

  it('in the flat ranges (large on target) the computation is exact: 410 to 480 with 5 items has 2 larges of 186 and the small one between 40 and 56', () => {
    for (const width of [430, 436, 440]) {
      const w = widths(drawAt(width, multi(5)));
      expect(w).toHaveLength(3);
      expect(w[0]).toBeCloseTo(186, 6);
      expect(w[1]).toBeCloseTo(186, 6);
      expect(w[2]).toBeCloseTo(width - 2 * 186 - 2 * 8, 6);
    }
  });

  it('the sum of the drawn items plus the spacings fits in the marking', () => {
    for (const width of [250, 360, 420, 515, 600, 777, 900]) {
      const boxes = itemBoxes(drawAt(width, multi(6)));
      const last = boxes[boxes.length - 1]!;
      expect(last[0]! + last[2]!).toBeLessThanOrEqual(width + 0.001);
    }
  });
});

// ---------------------------------------------------------------------------------------------
// uncontained
// ---------------------------------------------------------------------------------------------

describe('EX6 carousel — uncontained', () => {
  it('items of size itemWidth from the edge, with the spacing between them (Keylines.kt 161 to 200)', () => {
    const d = drawAt(360, {
      style: 'uncontained',
      itemWidth: 140,
      itemSpacing: 12,
      items: rows(3),
    });
    expect(itemBoxes(d)).toEqual([
      [0, 0, 140, HEIGHT],
      [152, 0, 140, HEIGHT],
      // L2 (#1078): the item that crosses the right edge gets only the remaining width (360 − 304), instead of
      // going past the box and being cut off (warning `content larger than the box`)
      [304, 0, 56, HEIGHT],
    ]);
    const wide = itemBoxes(
      drawAt(600, {
        style: 'uncontained',
        itemWidth: 100,
        itemSpacing: 0,
        items: rows(4),
      }),
    );
    expect(wide.map((r) => r[0])).toEqual([0, 100, 200, 300]);
  });
});

// ---------------------------------------------------------------------------------------------
// centered-hero
// ---------------------------------------------------------------------------------------------

const heroValues = (n: number, spacing = 8): Values => ({
  style: 'centered-hero',
  itemSpacing: spacing,
  items: rows(n),
});

/**
 * The Compose hero without `maxItemWidth` (Keylines.kt, `heroKeylineList`, lines 215 to 289, and the same
 * `findLowestCostArrangement` as multi-browse): the large target is the whole width (line 235), the small
 * one is a third of it clamped between 40 and 56 (237), and `fit` (Arrangement.kt, 198 to 206) shrinks the
 * smalls down to the minimum of 40 because the large does not fit the target. `start` is where the first item
 * begins: after the small one and the spacing, when the arrangement is centered (3 items or more).
 */
function heroOracle(width: number, spacing: number, items: number) {
  const center = items >= 3;
  let smallCounts = center ? [2] : [1];
  const targetLarge = width;
  const targetSmall = clamp(targetLarge / 3, MIN_SMALL, MAX_SMALL);
  if (width < MIN_SMALL * Math.max(...smallCounts) + MIN_SMALL * 1.25) smallCounts = [0];
  const minLarge = Math.max(
    1,
    Math.floor((width - MIN_SMALL * Math.max(...smallCounts)) / targetLarge),
  );
  const maxLarge = Math.ceil(width / targetLarge);
  const largeCounts = Array.from(
    { length: maxLarge - minLarge + 1 },
    (_, i) => maxLarge - i,
  );
  const a = findLowest(
    width,
    spacing,
    targetSmall,
    smallCounts,
    0,
    [0],
    targetLarge,
    largeCounts,
  )!;
  const start =
    center && items >= count(a) ? (a.smallCount / 2) * (a.small + spacing) : 0;
  return { large: a.large, small: a.small, smallCount: a.smallCount, start };
}

/** The boxes the drawing must have, by the oracle: each item is cut at the edge and disappears when less than 32 of the box remains from its start. */
function heroBoxes(width: number, spacing: number, items: number): number[][] {
  const { large, start } = heroOracle(width, spacing, items);
  const boxes: number[][] = [];
  for (let i = 0; i < items; i++) {
    const x = start + i * (large + spacing);
    const w = Math.min(large, width - x);
    if (width - x >= 32) boxes.push([x, 0, w, HEIGHT]);
  }
  return boxes;
}

describe('EX6 carousel — centered-hero by the width of the marking', () => {
  it('at 360, with spacing 8: large 264, smalls of 40 and the first item after the missing small one (48), like Compose', () => {
    // Without maxItemWidth the large is the whole width and fit shrinks the smalls to 40 (Arrangement.kt, 198 to 206):
    // 360 − 2 × 40 − 2 × 8 = 264. The second item gets only the width left in the box (40) and the third,
    // which was outside it (x = 592), is not drawn.
    expect(heroOracle(360, 8, 3)).toMatchObject({ large: 264, small: 40, start: 48 });
    expectBoxes(itemBoxes(drawAt(360, heroValues(3))), [
      [48, 0, 264, HEIGHT],
      [320, 0, 40, HEIGHT],
    ]);
  });

  it('the large, the small and the inset follow the Compose computation for every width and every itemSpacing', () => {
    for (const width of [130, 140, 150, 200, 240, 360, 480, 600, 900]) {
      for (const spacing of [0, 4, 8, 12, 16]) {
        for (const items of [3, 4, 6]) {
          const expected = heroBoxes(width, spacing, items);
          const label = `${width}/${spacing}/${items}`;
          const actual = itemBoxes(drawAt(width, heroValues(items, spacing)));
          expect(actual, label).toHaveLength(expected.length);
          expectBoxes(actual, expected);
        }
      }
    }
    // 360 with spacing 16: small 40, large 360 − 80 − 32 = 248, inset 56
    expect(itemBoxes(drawAt(360, heroValues(3, 16)))[0]).toEqual([56, 0, 248, HEIGHT]);
    // 480 with spacing 8: large 480 − 80 − 16 = 384; the small one on the right starts at 480 − 40
    expect(itemBoxes(drawAt(480, heroValues(4)))[1]![0]).toBeCloseTo(480 - 40, 6);
  });

  it('with 1 or 2 items Compose aligns to the start (shouldCenter requires 3): a single small of 40, large of width − spacing − 40, no inset', () => {
    for (const n of [1, 2]) {
      const boxes = itemBoxes(drawAt(360, heroValues(n, 12)));
      expect(boxes[0]).toEqual([0, 0, 360 - 12 - 40, HEIGHT]);
      expect(boxes).toHaveLength(n);
      if (n === 2) expect(boxes[1]).toEqual([360 - 40, 0, 40, HEIGHT]);
    }
    expectBoxes(itemBoxes(drawAt(360, heroValues(2, 8))), heroBoxes(360, 8, 2));
  });

  it('the thresholds at which only the large fits come from the same computation: 130 with 3 items or more, 90 with fewer than 3', () => {
    // fullscreenThreshold = 40 × smalls + 50 (Keylines.kt, 241 to 244)
    for (const [width, items, only] of [
      [129, 3, true],
      [130, 3, false],
      [89, 2, true],
      [90, 2, false],
      [120, 3, true],
      [100, 2, false],
    ] as const) {
      const boxes = itemBoxes(drawAt(width, heroValues(items, 0)));
      expect(
        boxes.length === 1 && boxes[0]![2] === width && boxes[0]![0] === 0,
        `${width}/${items}`,
      ).toBe(only);
      expectBoxes(boxes, heroBoxes(width, 0, items));
    }
  });

  it('in a narrow marking (< 130 with 3 items) only the large fits, with no inset', () => {
    const d = drawAt(120, heroValues(3));
    expect(widths(d)[0]).toBe(120);
    expect(itemBoxes(d)[0]![0]).toBe(0);
  });
});

// ---------------------------------------------------------------------------------------------
// Regression: the scenes from before
// ---------------------------------------------------------------------------------------------

/** L2 (#1078): what went past the 360 box (the 4000 band, the cut item and what was outside) is no longer drawn as it was. */
const WENT_PAST_THE_BOX = { skip: (o: { r: number[] }) => o.r[0]! + o.r[2]! > 360.5 };

describe('EX6 carousel — regression against the scenes from before (≤ 0.5 px per node)', () => {
  it('uncontained at 360 (light and dark) matches node by node, except what went past the box', () => {
    for (const scene of oldScenes('carousel-ex1')) {
      const d = draw(scene.id, scene.values, scene.mode);
      expect(missingNodes(d, scene.nodes, WENT_PAST_THE_BOX), scene.key).toEqual([]);
    }
  });

  it('multi-browse at 360: the first item (width, image, scrim and label) is the one from before (186)', () => {
    for (const scene of oldScenes('carousel-ex0')) {
      const d = draw(scene.id, scene.values, scene.mode);
      // 0 root, 1 band; 3 to 6 = the first item with the image, the scrim and the label (2 is `itens`, which stayed the size of the marking)
      const first = [scene.nodes[0]!, scene.nodes[1]!, ...scene.nodes.slice(3, 7)];
      expect(missingNodes(d, first, WENT_PAST_THE_BOX), scene.key).toEqual([]);
    }
  });

  it('centered-hero at 360 (light and dark): only what does not depend on the item width matches the scenes from before (the hero became 264/40, like Compose)', () => {
    // #1504: the scenes from before (tests/fixtures/material3-ex6-v1.json, which do not change) have the hero at 232/56/64.
    // Without maxItemWidth Compose gives 264/40/48 (Keylines.kt 235 and Arrangement.kt 198 to 206), so the items leave
    // the equality: what stays is the band, the inset and what does not touch the width and x of the items (the image, the
    // scrim and the label follow the item, so they leave too).
    for (const scene of oldScenes('carousel-ex2')) {
      const d = draw(scene.id, scene.values, scene.mode);
      const rest = scene.nodes.filter(
        (o) =>
          !['recuo', 'item', 'imagem', 'véu', 'rótulo'].includes(o.n) && o.t !== 'text',
      );
      expect(
        missingNodes(d, rest, {
          skip: (o: { r: number[] }) => o.r[0]! + o.r[2]! > 360.5,
        }),
        scene.key,
      ).toEqual([]);
    }
  });

  it('the colors (placeholder image and scrim) are those of the tokens, in both modes, in all styles', () => {
    for (const mode of ['light', 'dark'] as const) {
      for (const values of [multi(3), heroValues(3)]) {
        const d = drawAt(360, values, mode);
        expect(d.warnings).toEqual([]);
        const first = visible(d).find((n) => n.name === 'imagem');
        expect(first).toBeDefined();
      }
    }
  });
});

// ---------------------------------------------------------------------------------------------
// Without tables
// ---------------------------------------------------------------------------------------------

/** Each `$switch` with more than 12 cases and each `$eq` over a `number` field of the type. */
function offenders(id: 'carousel') {
  const numberFields = new Set(
    typeOf(id)
      .fields.filter((f) => f.type === 'number')
      .map((f) => f.key),
  );
  const found: string[] = [];
  const visit = (value: unknown, path: string): void => {
    if (Array.isArray(value)) return value.forEach((v, i) => visit(v, `${path}[${i}]`));
    if (typeof value !== 'object' || value === null) return;
    const obj = value as Record<string, unknown>;
    const cases = obj['cases'];
    if ('$switch' in obj && typeof cases === 'object' && cases !== null) {
      const n = Object.keys(cases).length;
      if (n > 12) found.push(`${path}: $switch of ${n} cases`);
    }
    const eq = obj['$eq'];
    if (Array.isArray(eq) && typeof eq[0] === 'string' && numberFields.has(eq[0]))
      found.push(`${path}: $eq over the number field ${eq[0]}`);
    for (const [k, v] of Object.entries(obj)) visit(v, `${path}.${k}`);
  };
  visit(JSON.parse(text(`components/${id}.json`)), id);
  return found;
}

describe('EX6 carousel — without enumerated tables', () => {
  it('has no $switch with more than 12 cases nor $eq over a number field', () => {
    expect(offenders('carousel')).toEqual([]);
  });

  it('the item uses the width of the marking, the index and the number of items (no fixed 4000 or 232 in the widths)', () => {
    const source = text('components/carousel.json');
    expect(source).toContain('"$size"');
    expect(source).toContain('"$index"');
    expect(source).toContain('"$rows"');
    expect(source).not.toContain('232');
  });
});

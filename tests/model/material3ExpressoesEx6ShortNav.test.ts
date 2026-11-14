// EX6 of the "expressions that compute in format 4" stage (#897): the margin of the `Centered` arrangement of the
// short-navigation-bar comes from the width of the instance and the number of items (`$size` and `$rows`), like
// Compose's `calculateCenteredContentHorizontalPadding` (20%, 15%, 10% and 5% of the width with 3, 4, 5
// and 6 items), and no longer from the fixed 10% of before; and the item grows up to `width / items` when its
// content is wider than the slice, with the margin shrinking by half of what grew
// (`CenteredContentMeasurePolicy`). The rest of the drawing stays like the scenes from before the stage
// (tests/fixtures/material3-ex6-v1.json) within ≤ 0.5 px per node.
import { describe, expect, it } from 'vitest';
import { findEntry } from '../../src/model/catalog';
import { absoluteBoxes, walk } from '../../src/model/components/scene';
import type { SceneNode } from '../../src/model/components/scene';
import { drawIn, text, typeOf } from '../support/material3Library';
import {
  catalog,
  draw,
  missingNodes,
  oldScenes,
  type Drawing,
  type OldNode,
  type Values,
} from '../support/material3Ex6Fixture';

// pt-BR kept: node names of libraries/material3-compose and of tests/fixtures/material3-ex6-v1.json are Portuguese data
const entry = findEntry(catalog, 'short-navigation-bar')!;
const ICONS = [
  'Home',
  'Search',
  'Person',
  'Menu',
  'Settings',
  'Favorite',
  'Info',
  'Delete',
];

/** Short labels (fit in any slice with the icon above): no item grows. */
function items(n: number, label = (i: number) => `T${i + 1}`) {
  return Array.from({ length: n }, (_, i) => ({
    label: label(i),
    icon: ICONS[i % ICONS.length]!,
    selected: i === 0 ? 'true' : 'false',
  }));
}

/** Draws the bar with the given items, at width `width` (the instance's). */
function drawBar(
  list: ReturnType<typeof items>,
  width: number,
  extra: Values = {},
  mode: 'light' | 'dark' = 'light',
): Drawing {
  const sized = {
    ...entry,
    component: { ...entry.component!, size: { width, height: 64 } },
  };
  return drawIn(catalog, sized, { items: list, ...extra }, mode);
}

const visible = (d: Drawing): SceneNode[] => [...walk(d.root)].filter((n) => n.visible);
const named = (d: Drawing, name: string) => visible(d).filter((n) => n.name === name);
const rectOf = (d: Drawing, n: SceneNode) => {
  const b = absoluteBoxes(d.root).get(n.id)!;
  return [b.x, b.y, b.width, b.height] as [number, number, number, number];
};

/** The margin of each side that Compose uses, as a fraction of the width (`ShortNavigationBar.kt` 436 to 511). */
const composePadding = (n: number) => (n > 6 ? 0 : (100 - 10 * (n + 3)) / 2 / 100);

describe('EX6 short-navigation-bar — the Centered margin by the number of items', () => {
  it('the margin is 20%, 15%, 10% and 5% of the width with 3, 4, 5 and 6 items', () => {
    const expected: [number, number][] = [
      [3, 0.2],
      [4, 0.15],
      [5, 0.1],
      [6, 0.05],
    ];
    for (const [n, fraction] of expected) {
      const d = drawBar(items(n), 412, { arrangement: 'Centered' });
      const margins = named(d, 'margem');
      expect(margins, `${n} items`).toHaveLength(2);
      for (const m of margins) expect(rectOf(d, m)[2]).toBeCloseTo(412 * fraction, 6);
      expect(composePadding(n)).toBeCloseTo(fraction, 10);
    }
  });

  it('the margins are symmetric and the destinations fill the middle, in equal slices', () => {
    for (const n of [3, 4, 5, 6]) {
      const d = drawBar(items(n), 412, { arrangement: 'Centered' });
      const [left, right] = named(d, 'margem');
      const pad = 412 * composePadding(n);
      expect(rectOf(d, left!)[0]).toBeCloseTo(0, 6);
      expect(rectOf(d, right!)[0]).toBeCloseTo(412 - pad, 6);
      const slots = named(d, 'destino');
      expect(slots, `${n} items`).toHaveLength(n);
      const slice = (412 - 2 * pad) / n;
      slots.forEach((s, i) => {
        const [x, , w, h] = rectOf(d, s);
        expect(x).toBeCloseTo(pad + i * slice, 6);
        expect(w).toBeCloseTo(slice, 6);
        expect(h).toBe(64);
      });
    }
  });

  it('the margin follows the width of the instance ($size), not the 412 of the initial size', () => {
    for (const width of [320, 600, 840]) {
      const d = drawBar(items(4), width, { arrangement: 'Centered' });
      for (const m of named(d, 'margem'))
        expect(rectOf(d, m)[2]).toBeCloseTo(width * 0.15, 6);
      const slots = named(d, 'destino');
      expect(rectOf(d, slots[0]!)[0]).toBeCloseTo(width * 0.15, 6);
      const last = rectOf(d, slots[3]!);
      expect(last[0] + last[2]).toBeCloseTo(width * 0.85, 6);
    }
  });

  it('with 7 items or more the margin is 0, as in Compose (itemsCount > 6), and never goes negative', () => {
    for (const n of [7, 8]) {
      const d = drawBar(items(n), 412, { arrangement: 'Centered' });
      for (const m of named(d, 'margem')) expect(rectOf(d, m)[2]).toBeCloseTo(0, 6);
      expect(rectOf(d, named(d, 'destino')[0]!)[0]).toBeCloseTo(0, 6);
    }
  });

  it('with no items the bar stays empty, without warnings', () => {
    const d = drawBar([], 412, { arrangement: 'Centered' });
    expect(d.warnings).toEqual([]);
    expect(named(d, 'destino')).toEqual([]);
  });

  it('in EqualWeight there is no margin and the destinations split the whole width', () => {
    for (const n of [3, 4, 5, 6]) {
      const d = drawBar(items(n), 412, { arrangement: 'EqualWeight' });
      expect(named(d, 'margem')).toEqual([]);
      const slots = named(d, 'destino');
      expect(slots).toHaveLength(n);
      slots.forEach((s, i) => {
        const [x, , w] = rectOf(d, s);
        expect(x).toBeCloseTo((412 / n) * i, 6);
        expect(w).toBeCloseTo(412 / n, 6);
      });
    }
  });
});

describe('EX6 short-navigation-bar — the item grows up to width / items (CenteredContentMeasurePolicy)', () => {
  const NAMES = ['Home', 'Search', 'Profile'];
  const named3 = items(3, (i) => NAMES[i]!);

  it('icon beside, 3 items: the pill (60 + label) is wider than the 82.4 slice and the item grows up to it, without warnings', () => {
    const d = drawBar(named3, 412, { arrangement: 'Centered', iconPosition: 'Start' });
    expect(d.warnings).toEqual([]);
    const slice = (412 * 0.6) / 3;
    const pills = visible(d).filter(
      (n) => n.name === 'indicador' && n.type === 'frame' && rectOf(d, n)[3] === 40,
    );
    const slots = named(d, 'destino').map((s) => rectOf(d, s));
    expect(pills).toHaveLength(3);
    pills.forEach((pill, i) => {
      const width = rectOf(d, pill)[2];
      expect(width, `pill ${i}`).toBeGreaterThan(slice);
      expect(slots[i]![2], `item ${i}`).toBeCloseTo(width, 6);
    });
    // the margin shrinks by half of what the items grew, on both sides
    const grown = slots.reduce((sum, s) => sum + (s[2] - slice), 0);
    const [left, right] = named(d, 'margem').map((m) => rectOf(d, m)[2]);
    expect(left).toBeCloseTo(412 * 0.2 - grown / 2, 6);
    expect(right).toBeCloseTo(left!, 6);
    // the group stays centered
    const last = slots[2]!;
    expect(slots[0]![0]).toBeCloseTo(412 - (last[0] + last[2]), 6);
  });

  it('the growth stops at width / items (82.4 → at most 137.3 with 3 items)', () => {
    const long = items(3, () => 'Advanced application settings');
    const d = drawBar(long, 412, { arrangement: 'Centered', iconPosition: 'Start' });
    for (const s of named(d, 'destino')) expect(rectOf(d, s)[2]).toBeCloseTo(412 / 3, 6);
    for (const m of named(d, 'margem')) expect(rectOf(d, m)[2]).toBeCloseTo(0, 6);
  });

  it('in EqualWeight the item never goes past the slice, whatever the label', () => {
    const long = items(3, () => 'Advanced application settings');
    const d = drawBar(long, 412, { arrangement: 'EqualWeight', iconPosition: 'Start' });
    for (const s of named(d, 'destino')) expect(rectOf(d, s)[2]).toBeCloseTo(412 / 3, 6);
  });
});

// ---------------------------------------------------------------------------------------------
// Regression: the scenes from before, within ≤ 0.5 px per node
// ---------------------------------------------------------------------------------------------

/** `Centered` with n ≠ 5: the margin changed on purpose (10% → Compose's). */
const centeredChanged = (values: Values): boolean =>
  values['arrangement'] === 'Centered' && (values['items'] as unknown[]).length !== 5;

/**
 * `Centered` with 5 items and the icon beside: the pill (up to 110) is wider than the 65.9 slice, and
 * before the item stayed in the slice, with the pill sticking out of it; now it grows up to `width / items`
 * (82.4), as in Compose. It is the only difference outside the margins.
 */
const centeredGrows = (values: Values): boolean =>
  values['arrangement'] === 'Centered' &&
  values['iconPosition'] === 'Start' &&
  (values['items'] as unknown[]).length === 5;

describe('EX6 short-navigation-bar — regression against the scenes from before', () => {
  it('the 6 examples (light and dark): all equal, except the Centered with 3 items', () => {
    const scenes = oldScenes('short-navigation-bar-');
    expect(scenes).toHaveLength(12);
    let compared = 0;
    for (const s of scenes) {
      if (centeredChanged(s.values)) continue;
      expect(missingNodes(draw(s.id, s.values, s.mode), s.nodes), s.key).toEqual([]);
      compared++;
    }
    // ex1 and ex2 (Centered, 3 items) leave, in both modes
    expect(compared).toBe(8);
  });

  it('3 to 6 items, EqualWeight and Centered with 5 items: all equal (except the icon beside with growth)', () => {
    const scenes = oldScenes('snb-');
    expect(scenes).toHaveLength(32);
    let compared = 0;
    for (const s of scenes) {
      if (centeredChanged(s.values) || centeredGrows(s.values)) continue;
      expect(missingNodes(draw(s.id, s.values, s.mode), s.nodes), s.key).toEqual([]);
      compared++;
    }
    // 32 scenes minus the Centered with 3, 4 and 6 items (12) and the Centered with 5 and the icon beside (2)
    expect(compared).toBe(18);
  });

  it('in the scenes that changed (Centered with 3, 4 and 6 items with the icon above), the one from before shifted to the new margin', () => {
    // with the icon above no item grows: all that changes is the margin and the slice
    const changed = oldScenes('snb-').filter(
      (o) => centeredChanged(o.values) && o.values['iconPosition'] === 'Top',
    );
    expect(changed).toHaveLength(6);
    const width = 412;
    for (const s of changed) {
      const n = (s.values['items'] as unknown[]).length;
      const oldPad = width * 0.1;
      const newPad = width * composePadding(n);
      const oldSlice = (width - 2 * oldPad) / n;
      const newSlice = (width - 2 * newPad) / n;
      const remapped = s.nodes.map((o): OldNode => {
        const [x, y, w, h] = o.r as [number, number, number, number];
        if (o.n === 'short navigation bar') return o;
        if (o.n === 'margem')
          return { ...o, r: [x === 0 ? 0 : width - newPad, y, newPad, h] };
        if (o.n === 'destinos') return { ...o, r: [newPad, y, width - 2 * newPad, h] };
        // the rest is inside a slice, centered in it: the center follows the new slice
        const slot = Math.min(n - 1, Math.floor((x + w / 2 - oldPad) / oldSlice));
        if (o.n === 'destino')
          return { ...o, r: [newPad + slot * newSlice, y, newSlice, h] };
        const shift =
          newPad +
          slot * newSlice +
          newSlice / 2 -
          (oldPad + slot * oldSlice + oldSlice / 2);
        return { ...o, r: [x + shift, y, w, h] };
      });
      expect(missingNodes(draw(s.id, s.values, s.mode), remapped), s.key).toEqual([]);
    }
  });
});

// ---------------------------------------------------------------------------------------------
// Without tables
// ---------------------------------------------------------------------------------------------

/**
 * Each `$switch` with more than 12 cases (except the icon name one, the 164-case one that translates the Compose
 * name to the set id: it is not a computation) and each `$eq` over a `number` field of the type.
 */
function offenders(id: 'short-navigation-bar') {
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
      const count = Object.keys(cases).length;
      if (count > 12 && obj['$switch'] !== 'icon')
        found.push(`${path}: $switch of ${count} cases`);
    }
    const eq = obj['$eq'];
    if (Array.isArray(eq) && typeof eq[0] === 'string' && numberFields.has(eq[0]))
      found.push(`${path}: $eq over the number field ${eq[0]}`);
    for (const [k, v] of Object.entries(obj)) visit(v, `${path}.${k}`);
  };
  visit(JSON.parse(text(`components/${id}.json`)), id);
  return found;
}

describe('EX6 short-navigation-bar — without enumerated tables', () => {
  it('there is no $switch with more than 12 cases (except the icon name one) nor $eq over a number field', () => {
    expect(offenders('short-navigation-bar')).toEqual([]);
  });

  it('the destination slice is a computation from $size and $rows, with no list of cases', () => {
    const component = JSON.parse(text('components/short-navigation-bar.json')) as {
      template: { children: { name: string; template?: Record<string, unknown> }[] };
    };
    const slot = component.template.children.find(
      (c) => c.name === 'destinos',
    )!.template!;
    for (const key of ['minWidth', 'maxWidth']) {
      const json = JSON.stringify(slot[key]);
      expect(json, key).toContain('"$size":"width"');
      expect(json, key).toContain('"$rows":"items"');
      expect(json, key).not.toContain('$switch');
    }
    expect(JSON.stringify(slot['minWidth'])).toContain('0.05');
  });
});

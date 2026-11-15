// Named slots (#1080, SL2): what the drawing cache says about the slots of a component (`slots`,
// `slotOf`, `inactiveFields`), the per-slot overflow key, the cache invalidation and the rounded clip
// (`clipShape`, decision 23).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  SLOT_OVERFLOW,
  addComponentMarking,
  addContainer,
  applySpecialization,
  approximateMeasurer,
  createDrawingCache,
  loadSpecComponents,
  moveMarking,
  parseSpec,
  setFieldValue,
  setMarkingRect,
  slotOverflowKey,
  type ComponentCatalog,
  type NewComponentArgs,
  type Project,
  type TextMeasurer,
} from '../../src/model';
import { emptyProject } from './fixtures';

const DIR = 'tests/fixtures/slots';
const SPEC_FILE = 'specs/slots/slots.spec.json';
const SPEC_ID = 'slots';
const read = (path: string): string => readFileSync(join(DIR, path), 'utf8');

function catalogOf(overrides: Record<string, string> = {}): ComponentCatalog {
  const parsed = parseSpec(JSON.parse(read('slots.spec.json')));
  if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
  const texts = new Map(
    ['bar', 'pin', 'rounded-bar'].map((id) => [
      `specs/slots/components/${id}.json`,
      overrides[id] ?? read(`components/${id}.json`),
    ]),
  );
  const loaded = loadSpecComponents(parsed.spec, SPEC_FILE, 1, (path) => texts.get(path));
  if (loaded.problems.length > 0) throw new Error(loaded.problems.join('\n'));
  return new Map([[SPEC_ID, loaded]]);
}

const catalog = catalogOf();

function baseProject(): Project {
  const parsed = parseSpec(JSON.parse(read('slots.spec.json')));
  if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
  let n = 0;
  const p = applySpecialization(emptyProject(), parsed.spec, {
    newId: () => `LS${++n}`,
    packageSpecName: 'slots.spec.json',
  });
  return addContainer(p, {
    id: 'I1',
    file: 'images/screen.png',
    width: 1000,
    height: 800,
  });
}

function add(
  p: Project,
  cat: ComponentCatalog,
  id: string,
  typeId: string,
  extra: Partial<NewComponentArgs> = {},
): Project {
  return addComponentMarking(
    p,
    cat,
    {
      markingId: id,
      annotationId: `A_${id}`,
      containerId: 'I1',
      parentId: null,
      specId: SPEC_ID,
      typeId,
      ...extra,
    },
    approximateMeasurer,
  );
}

const draw = (p: Project, cat: ComponentCatalog = catalog) =>
  createDrawingCache()(p, cat, approximateMeasurer, 0);

/** A bar `B` (360×56 at 100,100) with a pin `NAV` in `navigationIcon` and a pin `ACT` in `actions`. */
function barWithTwoChildren(): Project {
  let p = add(baseProject(), catalog, 'B', 'bar', {
    rect: { x: 100, y: 100, width: 360, height: 56 },
  });
  p = add(p, catalog, 'NAV', 'pin', { parentId: 'B', slot: 'navigationIcon' });
  p = add(p, catalog, 'ACT', 'pin', { parentId: 'B', slot: 'actions' });
  return p;
}

describe('ComponentDrawing: slots, slotOf and inactiveFields', () => {
  it('the bar lists its two slots, each with the child the geometry put in it', () => {
    const bar = draw(barWithTwoChildren()).get('B')!;
    expect(bar.slots.map((s) => [s.id, s.children, s.fallback])).toEqual([
      ['navigationIcon', ['NAV'], false],
      ['actions', ['ACT'], false],
    ]);
    expect([...bar.slotOf]).toEqual([
      ['NAV', 'navigationIcon'],
      ['ACT', 'actions'],
    ]);
    // Both slots hold a child: the fields of both default contents mean nothing.
    expect([...bar.inactiveFields].sort()).toEqual([
      ['actionLabel', 'actions'],
      ['navLabel', 'navigationIcon'],
    ]);
    expect(bar.slotIssues).toEqual([]);
  });

  it('an empty slot keeps its fallback and its fields stay active', () => {
    let p = add(baseProject(), catalog, 'B', 'bar', {
      rect: { x: 100, y: 100, width: 360, height: 56 },
    });
    p = add(p, catalog, 'NAV', 'pin', { parentId: 'B', slot: 'navigationIcon' });
    const bar = draw(p).get('B')!;
    expect(bar.slots.map((s) => [s.id, s.fallback])).toEqual([
      ['navigationIcon', false],
      ['actions', true],
    ]);
    expect([...bar.inactiveFields]).toEqual([['navLabel', 'navigationIcon']]);
  });

  it('the box of each slot is in image pixels and the child sits inside its own', () => {
    const drawings = draw(barWithTwoChildren());
    const bar = drawings.get('B')!;
    const [nav, actions] = bar.slots;
    expect(nav!.box.width).toBe(40);
    expect(actions!.box.x).toBeGreaterThan(nav!.box.x + nav!.box.width);
    // The child was placed by the slot's box (the hug slot shrinks around it): it is right of the
    // fixed slot and the bar says it is in `actions`.
    expect(drawings.get('ACT')!.root.transform[4]).toBeGreaterThan(
      nav!.box.x + nav!.box.width,
    );
    expect(bar.slotOf.get('ACT')).toBe('actions');
  });

  it('a component with `screen` has no probe and no assignment', () => {
    const screenBar = JSON.stringify({
      ...JSON.parse(read('components/rounded-bar.json')),
      screen: { anchor: 'center' },
    });
    const cat = catalogOf({ 'rounded-bar': screenBar });
    const p = add(baseProject(), cat, 'R', 'rounded-bar', {
      rect: { x: 100, y: 100, width: 200, height: 80 },
    });
    const drawing = draw(p, cat).get('R')!;
    expect(drawing.slots).toEqual([]);
    expect(drawing.slotOf.size).toBe(0);
    expect(drawing.clipShape).toBeUndefined();
  });

  it('a component without a child still describes its slots', () => {
    const bar = draw(
      add(baseProject(), catalog, 'B', 'bar', {
        rect: { x: 100, y: 100, width: 360, height: 56 },
      }),
    ).get('B')!;
    expect(bar.slots.map((s) => s.id)).toEqual(['navigationIcon', 'actions']);
    expect(bar.slotOf.size).toBe(0);
    expect(bar.inactiveFields.size).toBe(0);
  });
});

describe('ComponentDrawing: content larger than the box, by slot', () => {
  it('the key carries the slot id (and stays the plain text for a slot without id)', () => {
    expect(slotOverflowKey('')).toBe(SLOT_OVERFLOW);
    expect(slotOverflowKey('actions')).toBe(`${SLOT_OVERFLOW} actions`);
  });

  it('children that do not fit the fixed slot cite that slot, and only it', () => {
    let p = add(baseProject(), catalog, 'B', 'bar', {
      rect: { x: 100, y: 100, width: 360, height: 56 },
    });
    p = add(p, catalog, 'NAV', 'pin', { parentId: 'B', slot: 'navigationIcon' });
    p = add(p, catalog, 'NAV2', 'pin', { parentId: 'B', slot: 'navigationIcon' });
    p = add(p, catalog, 'NAV3', 'pin', { parentId: 'B', slot: 'navigationIcon' });
    const bar = draw(p).get('B')!;
    const keys = Object.keys(bar.shortfalls).filter((k) => k.startsWith(SLOT_OVERFLOW));
    for (const key of keys) expect(key).not.toContain('actions');
  });
});

describe('createDrawingCache: slots', () => {
  it('moving a child from one slot to the other re-instantiates only the bar and that child', () => {
    const cache = createDrawingCache();
    const p = barWithTwoChildren();
    const before = cache(p, catalog, approximateMeasurer, 0);
    const actions = before.get('B')!.slots[1]!.box;
    const nav = before.get('NAV')!;
    const moved = moveMarking(
      p,
      'NAV',
      Math.round(actions.x + 2 - nav.root.transform[4]),
      0,
    );
    const after = cache(moved, catalog, approximateMeasurer, 0);
    expect(after.get('B')).not.toBe(before.get('B'));
    expect(after.get('NAV')).not.toBe(before.get('NAV'));
    expect(after.get('ACT')).toBe(before.get('ACT'));
    expect(after.get('B')!.slotOf.get('NAV')).toBe('actions');
  });

  it('touching another marking of the screen re-instantiates nothing', () => {
    const cache = createDrawingCache();
    let p = barWithTwoChildren();
    p = add(p, catalog, 'R', 'rounded-bar', {
      rect: { x: 500, y: 300, width: 200, height: 80 },
    });
    const measure = vi.fn<TextMeasurer>(approximateMeasurer);
    const before = cache(p, catalog, measure, 0);
    const calls = measure.mock.calls.length;
    const after = cache(moveMarking(p, 'R', 5, 5), catalog, measure, 0);
    for (const id of ['B', 'NAV', 'ACT']) expect(after.get(id)).toBe(before.get(id));
    expect(after.get('R')).not.toBe(before.get('R'));
    // The rounded bar has no text: moving it measures nothing at all.
    expect(measure.mock.calls.length).toBe(calls);
  });

  it('20 frames of pan and zoom with a two-slot bar: no instantiation', () => {
    const cache = createDrawingCache();
    const p = barWithTwoChildren();
    const measure = vi.fn<TextMeasurer>(approximateMeasurer);
    const first = cache(p, catalog, measure, 0);
    const calls = measure.mock.calls.length;
    expect(calls).toBeGreaterThan(0);
    for (let frame = 0; frame < 20; frame += 1)
      expect(cache(p, catalog, measure, 0)).toBe(first);
    expect(measure.mock.calls.length).toBe(calls);
  });

  it('changing the field of the default content of an empty slot redraws the bar only', () => {
    const cache = createDrawingCache();
    let p = barWithTwoChildren();
    p = add(p, catalog, 'R', 'rounded-bar', {
      rect: { x: 500, y: 300, width: 200, height: 80 },
    });
    const before = cache(p, catalog, approximateMeasurer, 0);
    const after = cache(
      setFieldValue(p, 'A_B', 'title', 'Another'),
      catalog,
      approximateMeasurer,
      0,
    );
    expect(after.get('B')).not.toBe(before.get('B'));
    expect(after.get('R')).toBe(before.get('R'));
  });
});

describe('createDrawingCache: rounded clip (clipShape)', () => {
  const roundedWithChild = (extra: Partial<NewComponentArgs> = {}): Project => {
    let p = add(baseProject(), catalog, 'R', 'rounded-bar', {
      rect: { x: 100, y: 100, width: 200, height: 80 },
    });
    p = add(p, catalog, 'C', 'pin', { parentId: 'R', ...extra });
    return setMarkingRect(p, 'C', { x: 100, y: 100, width: 200, height: 80 });
  };

  it('the child of a clipping slot in a rounded frame gets the shape of the frame', () => {
    const child = draw(roundedWithChild()).get('C')!;
    expect(child.clip).toBeDefined();
    expect(child.clipShape).toHaveLength(1);
    expect(child.clipShape![0]!.radius).toEqual(16);
  });

  it('a frame without radius gives no shape (the clip is the whole story)', () => {
    const p = setFieldValue(roundedWithChild(), 'A_R', 'radius', 0);
    const child = draw(p).get('C')!;
    expect(child.clip).toBeDefined();
    expect(child.clipShape).toBeUndefined();
  });

  it('the radius comes from a field: changing it redraws the child with the new shape', () => {
    const cache = createDrawingCache();
    const p = roundedWithChild();
    const before = cache(p, catalog, approximateMeasurer, 0);
    const after = cache(
      setFieldValue(p, 'A_R', 'radius', 8),
      catalog,
      approximateMeasurer,
      0,
    );
    expect(after.get('C')).not.toBe(before.get('C'));
    expect(after.get('C')!.clipShape![0]!.radius).toEqual(8);
  });

  it('a slot without `clip` leaves the child whole (no clip, no shape)', () => {
    const open = JSON.parse(read('components/rounded-bar.json'));
    open.template.children[0].clip = false;
    const cat = catalogOf({ 'rounded-bar': JSON.stringify(open) });
    let p = add(baseProject(), cat, 'R', 'rounded-bar', {
      rect: { x: 100, y: 100, width: 200, height: 80 },
    });
    p = add(p, cat, 'C', 'pin', { parentId: 'R' });
    const child = draw(p, cat).get('C')!;
    expect(child.clip).toBeUndefined();
    expect(child.clipShape).toBeUndefined();
  });

  it('an ancestor frame with `clip: false` does not round the child', () => {
    const open = JSON.parse(read('components/rounded-bar.json'));
    open.template.clip = false;
    const cat = catalogOf({ 'rounded-bar': JSON.stringify(open) });
    let p = add(baseProject(), cat, 'R', 'rounded-bar', {
      rect: { x: 100, y: 100, width: 200, height: 80 },
    });
    p = add(p, cat, 'C', 'pin', { parentId: 'R' });
    expect(draw(p, cat).get('C')!.clipShape).toBeUndefined();
  });

  it('the child of the child inherits the shapes and adds its own', () => {
    // A rounded bar holds another rounded bar in its slot, which in turn holds a pin.
    let p = add(baseProject(), catalog, 'OUT', 'rounded-bar', {
      rect: { x: 100, y: 100, width: 400, height: 200 },
    });
    p = add(p, catalog, 'IN', 'rounded-bar', { parentId: 'OUT' });
    p = setMarkingRect(p, 'IN', { x: 110, y: 110, width: 300, height: 150 });
    p = add(p, catalog, 'PIN', 'pin', { parentId: 'IN' });
    p = setMarkingRect(p, 'PIN', { x: 120, y: 120, width: 100, height: 50 });
    const drawings = draw(p);
    expect(drawings.get('IN')!.clipShape).toHaveLength(1);
    expect(drawings.get('PIN')!.clipShape).toHaveLength(2);
  });
});

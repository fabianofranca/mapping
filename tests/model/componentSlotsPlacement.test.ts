// Named slots (#1080, SL2): placement of a new instance in a slot of a component with several, and
// Arrange per slot. The decision-5 default (the first visible slot) uses the geometry only.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  addComponentMarking,
  addContainer,
  applySpecialization,
  approximateMeasurer,
  arrangeMarking,
  canArrange,
  componentPlacement,
  createDrawingCache,
  loadSpecComponents,
  parseSpec,
  type ComponentCatalog,
  type NewComponentArgs,
  type Project,
  type Rect,
} from '../../src/model';
import { emptyProject } from './fixtures';

const DIR = 'tests/fixtures/slots';
const SPEC_ID = 'slots';
const read = (path: string): string => readFileSync(join(DIR, path), 'utf8');

const spec = (() => {
  const parsed = parseSpec(JSON.parse(read('slots.spec.json')));
  if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
  return parsed.spec;
})();

const catalog: ComponentCatalog = (() => {
  const texts = new Map(
    ['bar', 'pin', 'rounded-bar'].map((id) => [
      `specs/slots/components/${id}.json`,
      read(`components/${id}.json`),
    ]),
  );
  const loaded = loadSpecComponents(spec, 'specs/slots/slots.spec.json', 1, (path) =>
    texts.get(path),
  );
  if (loaded.problems.length > 0) throw new Error(loaded.problems.join('\n'));
  return new Map([[SPEC_ID, loaded]]);
})();

function baseProject(): Project {
  let n = 0;
  const p = applySpecialization(emptyProject(), spec, {
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
  id: string,
  typeId: string,
  extra: Partial<NewComponentArgs> = {},
): Project {
  return addComponentMarking(
    p,
    catalog,
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

const bar = (): Project =>
  add(baseProject(), 'B', 'bar', { rect: { x: 100, y: 100, width: 360, height: 56 } });

const rectOf = (p: Project, id: string): Rect =>
  p.markings.find((m) => m.id === id)!.rect;

const place = (p: Project, slot: string | undefined, withDrawings = false): Rect =>
  componentPlacement(
    p,
    catalog,
    {
      containerId: 'I1',
      parentId: 'B',
      slot,
      specId: SPEC_ID,
      typeId: 'pin',
      ...(withDrawings
        ? { drawings: createDrawingCache()(p, catalog, approximateMeasurer, 0) }
        : {}),
    },
    approximateMeasurer,
  );

const centerX = (r: Rect): number => r.x + r.width / 2;

describe('componentPlacement: slot of the target', () => {
  it('each slot gets the instance inside its own box', () => {
    const p = bar();
    const nav = place(p, 'navigationIcon');
    const actions = place(p, 'actions');
    // The fixed slot is on the left of the bar and the hug one on the right.
    expect(centerX(nav)).toBeLessThan(centerX(actions));
    expect(centerX(nav)).toBeLessThan(100 + 60);
    expect(centerX(actions)).toBeGreaterThan(100 + 180);
  });

  it('without a slot, the first visible one (decision 5)', () => {
    const p = bar();
    expect(place(p, undefined)).toEqual(place(p, 'navigationIcon'));
  });

  it('the same rectangle with and without the app drawings', () => {
    let p = bar();
    p = add(p, 'NAV', 'pin', { parentId: 'B', slot: 'navigationIcon' });
    for (const slot of ['navigationIcon', 'actions', undefined])
      expect(place(p, slot, true)).toEqual(place(p, slot, false));
  });

  it('a new child goes after the last one of the same slot, and the other slot is not affected', () => {
    // A bar whose `actions` slot is 120 wide (a `hug` one is flush right and cannot grow past the bar).
    const wide = JSON.parse(read('components/bar.json'));
    wide.template.children[2].width = 120;
    const texts = new Map(
      ['bar', 'pin', 'rounded-bar'].map((id) => [
        `specs/slots/components/${id}.json`,
        id === 'bar' ? JSON.stringify(wide) : read(`components/${id}.json`),
      ]),
    );
    const loaded = loadSpecComponents(spec, 'specs/slots/slots.spec.json', 1, (path) =>
      texts.get(path),
    );
    const cat: ComponentCatalog = new Map([[SPEC_ID, loaded]]);
    const args = (slot: string) => ({
      containerId: 'I1',
      parentId: 'B',
      slot,
      specId: SPEC_ID,
      typeId: 'pin',
    });
    let p = addComponentMarking(
      baseProject(),
      cat,
      {
        markingId: 'B',
        annotationId: 'A_B',
        containerId: 'I1',
        parentId: null,
        specId: SPEC_ID,
        typeId: 'bar',
        rect: { x: 100, y: 100, width: 360, height: 56 },
      },
      approximateMeasurer,
    );
    const first = componentPlacement(p, cat, args('actions'), approximateMeasurer);
    p = addComponentMarking(
      p,
      cat,
      {
        markingId: 'A1',
        annotationId: 'A_A1',
        containerId: 'I1',
        parentId: 'B',
        slot: 'actions',
        specId: SPEC_ID,
        typeId: 'pin',
        rect: first,
      },
      approximateMeasurer,
    );
    const second = componentPlacement(p, cat, args('actions'), approximateMeasurer);
    expect(second.x).toBeGreaterThanOrEqual(first.x + first.width);
    expect(second.y).toBe(first.y);
    // The fixed slot is still empty: its placement is what it would be in a bar without children.
    const empty = addComponentMarking(
      baseProject(),
      cat,
      {
        markingId: 'B',
        annotationId: 'A_B',
        containerId: 'I1',
        parentId: null,
        specId: SPEC_ID,
        typeId: 'bar',
        rect: { x: 100, y: 100, width: 360, height: 56 },
      },
      approximateMeasurer,
    );
    expect(
      componentPlacement(p, cat, args('navigationIcon'), approximateMeasurer),
    ).toEqual(
      componentPlacement(empty, cat, args('navigationIcon'), approximateMeasurer),
    );
  });

  it('a slot the component does not have fails with invalid-parent', () => {
    expect(() => place(bar(), 'nope')).toThrow(/invalid-parent|nope/);
  });
});

describe('arrangeMarking: per slot', () => {
  it('arranges the children of each slot with the layout of that slot only', () => {
    let p = bar();
    p = add(p, 'A1', 'pin', { parentId: 'B', slot: 'actions' });
    p = add(p, 'A2', 'pin', { parentId: 'B', slot: 'actions' });
    p = add(p, 'NAV', 'pin', { parentId: 'B', slot: 'navigationIcon' });
    expect(canArrange(p, catalog, 'B')).toBe(true);
    const { project } = arrangeMarking(p, catalog, 'B', approximateMeasurer);
    const a1 = rectOf(project, 'A1');
    const a2 = rectOf(project, 'A2');
    // The `actions` slot is a row with gap 4: side by side, the same top and a gap of 4.
    expect(a2.x - (a1.x + a1.width)).toBe(4);
    expect(a2.y).toBe(a1.y);
    // The child of the other slot stays on the left, inside the fixed slot.
    expect(rectOf(project, 'NAV').x).toBeLessThan(a1.x);
    // The bar keeps its size: the fixed slot and the title do not move because of `actions`.
    expect(rectOf(project, 'B').width).toBe(360);
  });

  it('is not arrangeable when no slot has children', () => {
    expect(canArrange(bar(), catalog, 'B')).toBe(false);
  });
});

describe('componentPlacement: a component with `screen`', () => {
  it('finds the same slot with and without the app drawings', () => {
    const screenBar = JSON.parse(read('components/rounded-bar.json'));
    screenBar.screen = { anchor: 'center' };
    const texts = new Map(
      ['bar', 'pin', 'rounded-bar'].map((id) => [
        `specs/slots/components/${id}.json`,
        id === 'rounded-bar' ? JSON.stringify(screenBar) : read(`components/${id}.json`),
      ]),
    );
    const loaded = loadSpecComponents(spec, 'specs/slots/slots.spec.json', 1, (path) =>
      texts.get(path),
    );
    const cat: ComponentCatalog = new Map([[SPEC_ID, loaded]]);
    const p = addComponentMarking(
      baseProject(),
      cat,
      {
        markingId: 'R',
        annotationId: 'A_R',
        containerId: 'I1',
        parentId: null,
        specId: SPEC_ID,
        typeId: 'rounded-bar',
        rect: { x: 100, y: 100, width: 200, height: 80 },
      },
      approximateMeasurer,
    );
    const args = {
      containerId: 'I1',
      parentId: 'R',
      specId: SPEC_ID,
      typeId: 'pin',
    };
    const without = componentPlacement(p, cat, args, approximateMeasurer);
    const drawings = createDrawingCache()(p, cat, approximateMeasurer, 0);
    expect(
      componentPlacement(p, cat, { ...args, drawings }, approximateMeasurer),
    ).toEqual(without);
  });

  it('a slot smaller than the component: the app and MCP agree on where a new child goes (CL5, finding 5)', () => {
    const screenBar = JSON.parse(read('components/rounded-bar.json'));
    screenBar.screen = { anchor: 'center' };
    screenBar.template.layout = { type: 'column', padding: 20 };
    const texts = new Map(
      ['bar', 'pin', 'rounded-bar'].map((id) => [
        `specs/slots/components/${id}.json`,
        id === 'rounded-bar' ? JSON.stringify(screenBar) : read(`components/${id}.json`),
      ]),
    );
    const loaded = loadSpecComponents(spec, 'specs/slots/slots.spec.json', 1, (path) =>
      texts.get(path),
    );
    const cat: ComponentCatalog = new Map([[SPEC_ID, loaded]]);
    const p = addComponentMarking(
      baseProject(),
      cat,
      {
        markingId: 'R',
        annotationId: 'A_R',
        containerId: 'I1',
        parentId: null,
        specId: SPEC_ID,
        typeId: 'rounded-bar',
        rect: { x: 100, y: 100, width: 200, height: 80 },
      },
      approximateMeasurer,
    );
    const args = { containerId: 'I1', parentId: 'R', specId: SPEC_ID, typeId: 'pin' };
    const drawings = createDrawingCache()(p, cat, approximateMeasurer, 0);
    expect(
      componentPlacement(p, cat, { ...args, drawings }, approximateMeasurer),
    ).toEqual(componentPlacement(p, cat, args, approximateMeasurer));
  });
});

describe('Arrange and the drawing agree on `accepts` (CL5, finding 2)', () => {
  it('an X child closer to the open slot A goes to B, the only slot that accepts X, in both', () => {
    // `navigationIcon` (slot A) takes only a `rounded-bar`; `actions` (slot B) takes a `pin`.
    const edited = JSON.parse(read('slots.spec.json'));
    edited.layers[0].annotationTypes[0].slots[0].accepts = ['rounded-bar'];
    const parsed = parseSpec(edited);
    if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
    const loaded = loadSpecComponents(
      parsed.spec,
      'specs/slots/slots.spec.json',
      1,
      (path) =>
        path.endsWith('/bar.json') || path.endsWith('/pin.json')
          ? read(`components/${path.split('/').pop()}`)
          : read('components/rounded-bar.json'),
    );
    const cat: ComponentCatalog = new Map([[SPEC_ID, loaded]]);
    let n = 0;
    let p = addContainer(
      applySpecialization(emptyProject(), parsed.spec, {
        newId: () => `AC${++n}`,
        packageSpecName: 'slots.spec.json',
      }),
      { id: 'I1', file: 'images/screen.png', width: 1000, height: 800 },
    );
    const args = (id: string, typeId: string, extra: Partial<NewComponentArgs>) => ({
      markingId: id,
      annotationId: `A_${id}`,
      containerId: 'I1',
      parentId: null,
      specId: SPEC_ID,
      typeId,
      ...extra,
    });
    p = addComponentMarking(
      p,
      cat,
      args('B', 'bar', { rect: { x: 100, y: 100, width: 360, height: 56 } }),
      approximateMeasurer,
    );
    // The pin sits over the left (slot A's box), far from the right one.
    p = addComponentMarking(
      p,
      cat,
      args('PIN', 'pin', {
        parentId: 'B',
        rect: { x: 110, y: 108, width: 24, height: 24 },
      }),
      approximateMeasurer,
    );
    const drawing = createDrawingCache()(p, cat, approximateMeasurer, 0).get('B')!;
    const drawnIn = drawing.slots.find((s) => s.children.includes('PIN'))?.id;
    expect(drawnIn).toBe('actions');
    // Arrange lays the child out in the same slot the drawing put it in (`actions`, a row).
    expect(canArrange(p, cat, 'B')).toBe(true);
    const arranged = arrangeMarking(p, cat, 'B', approximateMeasurer).project;
    const kid = arranged.markings.find((m) => m.id === 'PIN')!;
    expect(kid.rect.x + kid.rect.width / 2).toBeGreaterThan(100 + 180);
  });
});

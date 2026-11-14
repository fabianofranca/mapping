import { describe, expect, it } from 'vitest';
import {
  EMPTY_CATALOG,
  applySpecialization,
  addComponentMarking,
  addContainer,
  componentPlacement,
  componentSize,
  moveContainer,
  componentTypes,
  placementFitsSlot,
  setContainerDrawingMode,
  setFieldValue,
  settleHierarchy,
  approximateMeasurer,
  type ComponentCatalog,
  type NewComponentArgs,
  type Project,
  type Rect,
} from '../../src/model';
import {
  COMPONENTS,
  SPEC_ID,
  componentProject,
  reversedContainer,
  testCatalog,
  tokenSlotCatalog,
  wrappedContainer,
} from './componentFixtures';
import { FIT_SPEC_ID, LONG_LABEL, fitCatalog, fitProject } from './fitFixtures';
import { expectValid, emptyProject, marking } from './fixtures';
import { catalog as m3Catalog, spec as m3Spec } from '../support/material3Adoption';
import { NOTES_SPEC_ID, notesCatalog, notesProject } from './notesFixtures';

const catalog = testCatalog();

function add(
  p: Project,
  id: string,
  typeId: string,
  extra: Partial<NewComponentArgs> = {},
  cat: ComponentCatalog = catalog,
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

const rectOf = (p: Project, id: string): Rect => marking(p, id).rect;

describe('componentTypes', () => {
  it('lists the types with a component in specialization order', () => {
    const types = componentTypes(componentProject(), catalog);
    expect(types.map((t) => t.typeId)).toEqual(Object.keys(COMPONENTS));
    const text = types[0];
    expect(text).toMatchObject({
      specId: SPEC_ID,
      typeId: 'text',
      name: 'Type text',
      layerId: 'components',
      container: false,
    });
    expect(text?.component.id).toBe('text');
    expect(types.find((t) => t.typeId === 'row')?.container).toBe(true);
    expect(types.find((t) => t.typeId === 'box')?.container).toBe(true);
    expect(types.find((t) => t.typeId === 'wide')?.container).toBe(false);
  });

  it('a type without a component is left out; an empty catalog or one of another version gives an empty list', () => {
    const p = componentProject();
    expect(componentTypes(p, catalog).some((t) => t.typeId === 'plain')).toBe(false);
    expect(componentTypes(p, EMPTY_CATALOG)).toEqual([]);
    const stale: ComponentCatalog = new Map([
      [SPEC_ID, { ...catalog.get(SPEC_ID)!, version: 9 }],
    ]);
    expect(componentTypes(p, stale)).toEqual([]);
  });
});

describe('componentPlacement: without a container', () => {
  const place = (center?: { x: number; y: number }, typeId = 'text') =>
    componentPlacement(
      componentProject(),
      catalog,
      {
        containerId: 'I1',
        parentId: null,
        specId: SPEC_ID,
        typeId,
        ...(center ? { center } : {}),
      },
      approximateMeasurer,
    );

  it('without a center: at the image center, at the initial size', () => {
    expect(place()).toEqual({ x: 450, y: 380, width: 100, height: 40 });
  });

  it('centered on the requested point, with integer coordinates', () => {
    expect(place({ x: 200, y: 300 })).toEqual({ x: 150, y: 280, width: 100, height: 40 });
    expect(place({ x: 200.5, y: 300.4 })).toEqual({
      x: 151,
      y: 280,
      width: 100,
      height: 40,
    });
  });

  it('clamped inside the image', () => {
    expect(place({ x: 0, y: 0 })).toEqual({ x: 0, y: 0, width: 100, height: 40 });
    expect(place({ x: 5000, y: 5000 })).toEqual({
      x: 900,
      y: 760,
      width: 100,
      height: 40,
    });
    expect(place({ x: -10, y: 790 })).toEqual({ x: 0, y: 760, width: 100, height: 40 });
  });

  it('an image smaller than the initial size: shrinks down to the minimum', () => {
    let p = componentProject();
    p = addContainer(p, { id: 'I2', file: 'images/small.png', width: 80, height: 30 });
    const rect = componentPlacement(
      p,
      catalog,
      { containerId: 'I2', parentId: null, specId: SPEC_ID, typeId: 'text' },
      approximateMeasurer,
    );
    // 100×40 clamped to 80×30; the minimum (60×24) fits.
    expect(rect).toEqual({ x: 0, y: 0, width: 80, height: 30 });
  });

  it('not even the minimum fits in the image: rect-out-of-image', () => {
    let p = componentProject();
    p = addContainer(p, {
      id: 'I2',
      file: 'images/tiny.png',
      width: 50,
      height: 50,
    });
    expect(() =>
      componentPlacement(
        p,
        catalog,
        { containerId: 'I2', parentId: null, specId: SPEC_ID, typeId: 'text' },
        approximateMeasurer,
      ),
    ).toThrow('rect-out-of-image');
  });

  it('unknown type, without a component or nonexistent image', () => {
    const p = componentProject();
    const args = { containerId: 'I1', parentId: null, specId: SPEC_ID };
    expect(() =>
      componentPlacement(p, catalog, { ...args, typeId: 'plain' }, approximateMeasurer),
    ).toThrow('unknown-type');
    expect(() =>
      componentPlacement(p, catalog, { ...args, typeId: 'nothing' }, approximateMeasurer),
    ).toThrow('unknown-type');
    expect(() =>
      componentPlacement(
        p,
        catalog,
        { ...args, typeId: 'text', containerId: 'X' },
        approximateMeasurer,
      ),
    ).toThrow('not-found');
  });
});

describe('componentPlacement: inside a container', () => {
  function withRow(): Project {
    return add(componentProject(), 'C', 'row', {
      rect: { x: 100, y: 100, width: 300, height: 100 },
    });
  }

  it('first child at the start of the slot; the following ones to the right, with the gap', () => {
    let p = withRow();
    p = add(p, 'T1', 'text', { parentId: 'C' });
    expect(rectOf(p, 'T1')).toEqual({ x: 100, y: 100, width: 100, height: 40 });
    p = add(p, 'T2', 'text', { parentId: 'C' });
    expect(rectOf(p, 'T2')).toEqual({ x: 208, y: 100, width: 100, height: 40 });
    expect(marking(p, 'T2').parentId).toBe('C');
    expectValid(p);
  });

  it('went past the slot: in the nearest free place, inside the container', () => {
    let p = withRow();
    p = add(p, 'T1', 'text', { parentId: 'C' });
    p = add(p, 'T2', 'text', { parentId: 'C' });
    p = add(p, 'T3', 'text', { parentId: 'C' });
    // Next position: 316 + 100 > 400. It used to be clamped at x = 300, on top of T2 (overlapping);
    // now it goes to the nearest free place, below it (148 = 100 + 40 + 8), still inside the container.
    expect(rectOf(p, 'T3')).toEqual({ x: 300, y: 148, width: 100, height: 40 });
    expect(marking(p, 'T3').parentId).toBe('C');
    expectValid(p);
  });

  it('went past the slot and the container is full: clamped inside it, without an error', () => {
    let p = add(componentProject(), 'C', 'row', {
      rect: { x: 100, y: 100, width: 300, height: 40 },
    });
    p = add(p, 'T1', 'text', { parentId: 'C' });
    p = add(p, 'T2', 'text', { parentId: 'C' });
    p = add(p, 'T3', 'text', { parentId: 'C' });
    expect(rectOf(p, 'T3')).toEqual({ x: 300, y: 100, width: 100, height: 40 });
    expectValid(p);
  });

  it('the slot padding shifts the start', () => {
    let p = withRow();
    p = setFieldValue(p, 'A_C', 'padding', 4);
    p = add(p, 'T1', 'text', { parentId: 'C' });
    expect(rectOf(p, 'T1')).toEqual({ x: 104, y: 104, width: 100, height: 40 });
    p = add(p, 'T2', 'text', { parentId: 'C' });
    expect(rectOf(p, 'T2')).toEqual({ x: 212, y: 104, width: 100, height: 40 });
  });

  it('column: below the last child, with the gap', () => {
    let p = add(componentProject(), 'C', 'column', {
      rect: { x: 50, y: 50, width: 300, height: 300 },
    });
    p = add(p, 'T1', 'text', { parentId: 'C' });
    p = add(p, 'T2', 'text', { parentId: 'C' });
    expect(rectOf(p, 'T1')).toEqual({ x: 50, y: 50, width: 100, height: 40 });
    expect(rectOf(p, 'T2')).toEqual({ x: 50, y: 98, width: 100, height: 40 });
    expectValid(p);
  });

  it('layout.reverse in a row: the first child at the end of the slot, the following ones to the left of the last (FX3)', () => {
    const reverse = testCatalog({
      ...COMPONENTS,
      row: reversedContainer('row', 'row', { width: 300, height: 100 }),
    });
    let p = add(
      componentProject(),
      'C',
      'row',
      { rect: { x: 100, y: 100, width: 300, height: 100 } },
      reverse,
    );
    p = add(p, 'T1', 'text', { parentId: 'C' }, reverse);
    p = add(p, 'T2', 'text', { parentId: 'C' }, reverse);
    expect(rectOf(p, 'T1')).toEqual({ x: 300, y: 100, width: 100, height: 40 });
    expect(rectOf(p, 'T2')).toEqual({ x: 192, y: 100, width: 100, height: 40 });
    p = setFieldValue(p, 'A_C', 'padding', 4);
    p = add(p, 'T3', 'text', { parentId: 'C' }, reverse);
    expect(rectOf(p, 'T3').x).toBeGreaterThanOrEqual(100);
    expectValid(p);
  });

  it('layout.reverse in a column: the first child at the end of the slot, the following ones above the last (FX3)', () => {
    const reverse = testCatalog({
      ...COMPONENTS,
      column: reversedContainer('column', 'column', { width: 300, height: 300 }),
    });
    let p = add(
      componentProject(),
      'C',
      'column',
      { rect: { x: 50, y: 50, width: 300, height: 300 } },
      reverse,
    );
    p = setFieldValue(p, 'A_C', 'padding', 4);
    p = add(p, 'T1', 'text', { parentId: 'C' }, reverse);
    p = add(p, 'T2', 'text', { parentId: 'C' }, reverse);
    // The slot ends at y = 350; with the padding of 4 the first child ends at 346.
    expect(rectOf(p, 'T1')).toEqual({ x: 54, y: 306, width: 100, height: 40 });
    expect(rectOf(p, 'T2')).toEqual({ x: 54, y: 258, width: 100, height: 40 });
    expectValid(p);
  });

  it('slot gap and padding in $token use those of the drawing mode table (#948)', () => {
    const tokens = tokenSlotCatalog();
    let p = add(
      componentProject(),
      'C',
      'column',
      { rect: { x: 50, y: 50, width: 300, height: 300 } },
      tokens,
    );
    p = add(p, 'T1', 'text', { parentId: 'C' }, tokens);
    p = add(p, 'T2', 'text', { parentId: 'C' }, tokens);
    // First mode: padding 10, gap 4.
    expect(rectOf(p, 'T1')).toEqual({ x: 60, y: 60, width: 100, height: 40 });
    expect(rectOf(p, 'T2')).toEqual({ x: 60, y: 104, width: 100, height: 40 });
    // The container in `dark` mode: padding 20, gap 12.
    let dark = setContainerDrawingMode(
      add(
        componentProject(),
        'C',
        'column',
        { rect: { x: 50, y: 50, width: 300, height: 300 } },
        tokens,
      ),
      'I1',
      'dark',
    );
    dark = add(dark, 'T1', 'text', { parentId: 'C' }, tokens);
    dark = add(dark, 'T2', 'text', { parentId: 'C' }, tokens);
    expect(rectOf(dark, 'T1')).toEqual({ x: 70, y: 70, width: 100, height: 40 });
    expect(rectOf(dark, 'T2')).toEqual({ x: 70, y: 122, width: 100, height: 40 });
  });

  it('layout none: the first at the start of the slot; the second, beside it, without coinciding', () => {
    let p = add(componentProject(), 'C', 'box', {
      rect: { x: 50, y: 50, width: 300, height: 200 },
    });
    p = add(p, 'T1', 'text', { parentId: 'C' });
    p = add(p, 'T2', 'text', { parentId: 'C' });
    expect(rectOf(p, 'T1')).toEqual({ x: 50, y: 50, width: 100, height: 40 });
    // The start of the slot is already taken by T1: the nearest free place is right below (50 + 40 + 8).
    expect(rectOf(p, 'T2')).toEqual({ x: 50, y: 98, width: 100, height: 40 });
    expect(marking(p, 'T2').parentId).toBe('C');
  });

  it('a container smaller than the initial size: shrinks, respecting the minimum', () => {
    let p = add(componentProject(), 'C', 'row', {
      rect: { x: 100, y: 100, width: 80, height: 30 },
    });
    p = add(p, 'T1', 'text', { parentId: 'C' });
    expect(rectOf(p, 'T1')).toEqual({ x: 100, y: 100, width: 80, height: 30 });
    expectValid(p);
  });

  it('not even the minimum fits in the container: rect-outside-parent', () => {
    const p = add(componentProject(), 'C', 'row', {
      rect: { x: 100, y: 100, width: 50, height: 30 },
    });
    expect(() => add(p, 'T1', 'text', { parentId: 'C' })).toThrow('rect-outside-parent');
  });

  it('the parent must be in the same image', () => {
    let p = withRow();
    p = addContainer(p, { id: 'I2', file: 'images/other.png', width: 500, height: 500 });
    expect(() => add(p, 'T1', 'text', { parentId: 'C', containerId: 'I2' })).toThrow(
      'invalid-parent',
    );
  });
});

describe('addComponentMarking', () => {
  it('creates the marking and the typed annotation in the type layer, with the preview', () => {
    const p = add(componentProject(), 'M1', 'text', { name: 'Title' });
    const m = marking(p, 'M1');
    expect(m).toMatchObject({
      parentId: null,
      name: 'Title',
      containerId: 'I1',
      needsReview: false,
      locked: false,
    });
    expect(m.rect).toEqual({ x: 450, y: 380, width: 100, height: 40 });
    const annotation = p.annotations.find((a) => a.id === 'A_M1')!;
    expect(annotation.markingId).toBe('M1');
    expect(annotation.type).toEqual({ specId: SPEC_ID, typeId: 'text' });
    expect(annotation.layerId).toBe('LS1');
    // preview {label, count, kind}; the rest stays at the field default.
    expect(annotation.values).toEqual({
      label: 'Preview',
      count: 3,
      kind: 'b',
      when: null,
      target: null,
      items: [],
    });
    expectValid(p);
  });

  it('without a preview the fields stay at their defaults', () => {
    const p = add(componentProject(), 'C', 'row');
    expect(p.annotations.find((a) => a.id === 'A_C')?.values).toEqual({
      spacing: 8,
      padding: 0,
    });
  });

  it('partial values: the absent fields start with the preview, the given ones win', () => {
    const p = add(componentProject(), 'M1', 'text', {
      values: { label: 'Given', count: 5 },
    });
    const values = p.annotations.find((a) => a.id === 'A_M1')?.values;
    // preview {label: 'Preview', count: 3, kind: 'b'}: the absent `kind` comes from the preview, not from the default 'a'.
    expect(values).toMatchObject({ label: 'Given', count: 5, kind: 'b' });
  });

  it('partial values: table and ref stay at the default', () => {
    const p = add(componentProject(), 'M1', 'text', { values: { count: 5 } });
    expect(p.annotations.find((a) => a.id === 'A_M1')?.values).toMatchObject({
      label: 'Preview',
      count: 5,
      target: null,
      items: [],
    });
  });

  it('invalid values are refused with the field error', () => {
    const p = componentProject();
    expect(() => add(p, 'M1', 'text', { values: { nothing: 1 } })).toThrow(
      'unknown-field',
    );
    expect(() => add(p, 'M1', 'text', { values: { kind: 'z' } })).toThrow(
      'unknown-option',
    );
    expect(() => add(p, 'M1', 'text', { values: { count: 'x' } })).toThrow(
      'invalid-value',
    );
  });

  it('a preview the field does not accept stays at the default, without failing', () => {
    const bad = {
      ...COMPONENTS,
      text: { ...COMPONENTS.text, preview: { label: 'Ok', kind: 'zzz', count: 'x' } },
    };
    const p = add(componentProject(), 'M1', 'text', {}, testCatalog(bad));
    expect(p.annotations.find((a) => a.id === 'A_M1')?.values).toMatchObject({
      label: 'Ok',
      kind: 'a',
      count: null,
    });
  });

  it('an explicit rectangle applies instead of the placement', () => {
    const rect = { x: 10, y: 20, width: 70, height: 30 };
    const p = add(componentProject(), 'M1', 'text', { rect });
    expect(rectOf(p, 'M1')).toEqual(rect);
  });

  it('explicit rectangle: respects minSize, the image and the parent', () => {
    let p = add(componentProject(), 'C', 'row', {
      rect: { x: 100, y: 100, width: 300, height: 100 },
    });
    expect(() =>
      add(p, 'M1', 'text', { rect: { x: 10, y: 20, width: 50, height: 30 } }),
    ).toThrow('rect-too-small');
    expect(() =>
      add(p, 'M1', 'text', { rect: { x: 950, y: 20, width: 100, height: 40 } }),
    ).toThrow('rect-out-of-image');
    expect(() =>
      add(p, 'M1', 'text', {
        parentId: 'C',
        rect: { x: 350, y: 120, width: 100, height: 40 },
      }),
    ).toThrow('rect-outside-parent');
    p = add(p, 'M2', 'text', {
      parentId: 'C',
      rect: { x: 120, y: 120, width: 100, height: 40 },
    });
    expect(marking(p, 'M2').parentId).toBe('C');
  });

  it('the stored parent is the one the geometry gives, never the requested one', () => {
    let p = add(componentProject(), 'C', 'box', {
      rect: { x: 400, y: 300, width: 300, height: 200 },
    });
    // No parent requested, but the image center falls inside C: C is the parent.
    p = add(p, 'M1', 'text');
    expect(marking(p, 'M1').parentId).toBe('C');
    // C requested as the placement target; the instance falls inside D (inside C): D is the parent.
    p = add(p, 'D', 'box', { rect: { x: 420, y: 320, width: 100, height: 100 } });
    expect(marking(p, 'D').parentId).toBe('C');
    p = add(p, 'M2', 'text', {
      parentId: 'C',
      rect: { x: 430, y: 330, width: 60, height: 30 },
    });
    expect(marking(p, 'M2').parentId).toBe('D');
    expectValid(p);
  });

  it('it is a pure operation: the input project does not change', () => {
    const p = componentProject();
    add(p, 'M1', 'text');
    expect(p.markings).toHaveLength(0);
    expect(p.annotations).toHaveLength(0);
  });

  it('refusals: type without a component, catalog of another version, missing layer, repeated id', () => {
    const p = componentProject();
    expect(() => add(p, 'M1', 'plain')).toThrow('unknown-type');
    expect(() => add(p, 'M1', 'text', {}, EMPTY_CATALOG)).toThrow('unknown-type');
    const stale: ComponentCatalog = new Map([
      [SPEC_ID, { ...catalog.get(SPEC_ID)!, version: 9 }],
    ]);
    expect(() => add(p, 'M1', 'text', {}, stale)).toThrow('unknown-type');
    const noLayer: Project = {
      ...p,
      layers: p.layers.map((l) => (l.spec ? { ...l, spec: null } : l)),
    };
    expect(() => add(noLayer, 'M1', 'text')).toThrow('type-not-in-layer');
    const once = add(p, 'M1', 'text');
    expect(() => add(once, 'M1', 'text')).toThrow('duplicate-id');
    expect(() => add(p, 'M2', 'text', { annotationId: 'A_M2', parentId: 'ZZ' })).toThrow(
      'not-found',
    );
  });
});

describe('on the canvas (null containerId)', () => {
  const place = (args: Partial<Parameters<typeof componentPlacement>[2]> = {}) =>
    componentPlacement(
      componentProject(),
      catalog,
      { containerId: null, parentId: null, specId: SPEC_ID, typeId: 'text', ...args },
      approximateMeasurer,
    );

  it('without a center: the component size in canvas units, centered at (0, 0)', () => {
    // The I1 container sits at (0, 0) on the canvas: the requested center is covered, so the piece goes to
    // the nearest free place, right above it (-8 − 40 = -48).
    expect(place()).toEqual({ x: -50, y: -48, width: 100, height: 40 });
    const away = moveContainer(componentProject(), 'I1', 5000, 5000);
    expect(
      componentPlacement(
        away,
        catalog,
        { containerId: null, parentId: null, specId: SPEC_ID, typeId: 'text' },
        approximateMeasurer,
      ),
    ).toEqual({ x: -50, y: -20, width: 100, height: 40 });
  });

  it('centered on the requested point, with integer coordinates and no limit at all', () => {
    expect(place({ center: { x: 5000.5, y: -3000.4 } })).toEqual({
      x: 4951,
      y: -3020,
      width: 100,
      height: 40,
    });
    expect(place({ center: { x: -90000, y: 90000 } })).toEqual({
      x: -90050,
      y: 89980,
      width: 100,
      height: 40,
    });
  });

  it('a type without a component is still refused on the canvas', () => {
    expect(() => place({ typeId: 'plain' })).toThrow('unknown-type');
  });

  it('creates the canvas marking with the typed annotation, without container or parent', () => {
    const p = add(componentProject(), 'M1', 'text', {
      containerId: null,
      center: { x: -3000, y: 500 },
      name: 'Loose',
    });
    expect(marking(p, 'M1')).toMatchObject({
      containerId: null,
      parentId: null,
      floating: false,
      name: 'Loose',
      rect: { x: -3050, y: 480, width: 100, height: 40 },
    });
    const annotation = p.annotations.find((a) => a.id === 'A_M1')!;
    expect(annotation.type).toEqual({ specId: SPEC_ID, typeId: 'text' });
    expectValid(p);
  });

  it('the initial size applies even where a container would not hold it', () => {
    const p = addContainer(componentProject(), {
      id: 'I2',
      file: 'images/tiny.png',
      width: 50,
      height: 50,
    });
    expect(() =>
      componentPlacement(
        p,
        catalog,
        { containerId: 'I2', parentId: null, specId: SPEC_ID, typeId: 'text' },
        approximateMeasurer,
      ),
    ).toThrow('rect-out-of-image');
    const q = add(p, 'M1', 'text', { containerId: null, center: { x: 0, y: -500 } });
    expect(rectOf(q, 'M1')).toEqual({ x: -50, y: -520, width: 100, height: 40 });
    expectValid(q);
  });

  it('fell entirely inside a container: settling makes it a marking of that container, converted', () => {
    // With an explicit `rect` (without `rect`, the placement avoids the container, which is an obstacle on the canvas).
    const p = add(componentProject(), 'M1', 'text', {
      containerId: null,
      rect: { x: 150, y: 280, width: 100, height: 40 },
    });
    // Container I1 at (0,0) at scale 1: the canvas rectangle becomes the same one in its pixels.
    expect(marking(p, 'M1')).toMatchObject({
      containerId: 'I1',
      rect: { x: 150, y: 280, width: 100, height: 40 },
    });
    expectValid(p);
  });

  it('inside a component with a canvas slot: places in the slot and stores the settled parent', () => {
    let p = add(componentProject(), 'C', 'row', {
      containerId: null,
      rect: { x: -2000, y: 100, width: 300, height: 100 },
    });
    expect(marking(p, 'C').containerId).toBeNull();
    p = add(p, 'T1', 'text', { containerId: null, parentId: 'C' });
    p = add(p, 'T2', 'text', { containerId: null, parentId: 'C' });
    expect(rectOf(p, 'T1')).toEqual({ x: -2000, y: 100, width: 100, height: 40 });
    expect(rectOf(p, 'T2')).toEqual({ x: -1892, y: 100, width: 100, height: 40 });
    expect(marking(p, 'T2')).toMatchObject({ containerId: null, parentId: 'C' });
    expectValid(p);
  });

  it('the target parent must be in the same space', () => {
    const p = add(componentProject(), 'C', 'row', {
      rect: { x: 100, y: 100, width: 300, height: 100 },
    });
    expect(() => add(p, 'T1', 'text', { containerId: null, parentId: 'C' })).toThrow(
      'invalid-parent',
    );
  });
});

describe('floating type (notes library)', () => {
  const notes = notesCatalog();
  const addNote = (
    p: Project,
    id: string,
    extra: Partial<NewComponentArgs> = {},
  ): Project =>
    addComponentMarking(
      p,
      notes,
      {
        markingId: id,
        annotationId: `A_${id}`,
        containerId: null,
        parentId: null,
        specId: NOTES_SPEC_ID,
        typeId: 'nota',
        ...extra,
      },
      approximateMeasurer,
    );

  it('componentTypes exposes floating', () => {
    const types = componentTypes(notesProject(), notes);
    expect(types.map((t) => [t.typeId, t.floating])).toEqual([
      ['nota', true],
      ['tabela', true],
    ]);
    expect(componentTypes(componentProject(), catalog).every((t) => !t.floating)).toBe(
      true,
    );
  });

  it('creates the floating marking on the canvas, centered on center, with the preview', () => {
    const p = addNote(notesProject(), 'N1', { center: { x: 3000, y: 500 } });
    const m = marking(p, 'N1');
    expect(m).toMatchObject({ floating: true, containerId: null, parentId: null });
    // Size of the note component: 240 x 120, centered at (3000, 500).
    expect(m.rect).toEqual({ x: 2880, y: 440, width: 240, height: 120 });
    const annotation = p.annotations.find((a) => a.id === 'A_N1')!;
    expect(annotation.type).toEqual({ specId: NOTES_SPEC_ID, typeId: 'nota' });
    expect(annotation.layerId).toBe(p.layers.find((l) => l.spec !== null)?.id);
    // pt-BR kept: the preview values come from the notes library of mappings-workspace (Portuguese data).
    expect(annotation.values).toMatchObject({
      titulo: 'Título',
      texto: 'Escreva aqui o comentário.',
    });
    expectValid(p);
  });

  it('with containerId or parentId fails with invalid-space', () => {
    const base = notesProject();
    expect(() => addNote(base, 'N1', { containerId: 'I1' })).toThrow('invalid-space');
    const withNote = addNote(base, 'N1');
    expect(() => addNote(withNote, 'N2', { parentId: 'N1' })).toThrow('invalid-space');
  });

  it('created over a container, it does not become a child and settleHierarchy leaves it alone', () => {
    const base = addContainer(notesProject(), {
      id: 'I2',
      file: 'images/other.png',
      width: 500,
      height: 500,
    });
    const container = base.containers.find((c) => c.id === 'I1')!;
    const center = {
      x: container.placement.x + 200,
      y: container.placement.y + 200,
    };
    const p = addNote(base, 'N1', { center });
    expect(marking(p, 'N1')).toMatchObject({
      floating: true,
      containerId: null,
      parentId: null,
    });
    expect(settleHierarchy(p)).toBe(p);
  });
});

describe('componentPlacement: optional size (size)', () => {
  const column = (): Project =>
    add(componentProject(), 'C', 'column', {
      rect: { x: 50, y: 50, width: 300, height: 300 },
    });
  const place = (p: Project, size?: { width: number; height: number }): Rect =>
    componentPlacement(
      p,
      catalog,
      {
        containerId: 'I1',
        parentId: 'C',
        specId: SPEC_ID,
        typeId: 'text',
        ...(size === undefined ? {} : { size }),
      },
      approximateMeasurer,
    );

  it('replaces the component size and the position still comes from the slot', () => {
    let p = column();
    expect(place(p, { width: 200, height: 60 })).toEqual({
      x: 50,
      y: 50,
      width: 200,
      height: 60,
    });
    p = add(p, 'T1', 'text', { parentId: 'C' });
    // After the last child (50 + 40) and the gap of 8.
    expect(place(p, { width: 200, height: 60 })).toEqual({
      x: 50,
      y: 98,
      width: 200,
      height: 60,
    });
  });

  it('without size, equal to the component size', () => {
    const p = column();
    expect(place(p)).toEqual({ x: 50, y: 50, width: 100, height: 40 });
  });

  it('clamped to the slot area', () => {
    expect(place(column(), { width: 900, height: 900 })).toEqual({
      x: 50,
      y: 50,
      width: 300,
      height: 300,
    });
  });

  it('never below the component minSize', () => {
    const rect = place(column(), { width: 1, height: 1 });
    const min = catalog.get(SPEC_ID)!.byType.get('text')!.minSize;
    expect(rect.width).toBeGreaterThanOrEqual(min?.width ?? 1);
    expect(rect.height).toBeGreaterThanOrEqual(min?.height ?? 1);
  });

  it('not even the minimum fits in the slot: rect-outside-parent', () => {
    const p = add(componentProject(), 'C', 'row', {
      rect: { x: 100, y: 100, width: 50, height: 30 },
    });
    expect(() =>
      componentPlacement(
        p,
        catalog,
        {
          containerId: 'I1',
          parentId: 'C',
          specId: SPEC_ID,
          typeId: 'text',
          size: { width: 10, height: 10 },
        },
        approximateMeasurer,
      ),
    ).toThrow('rect-outside-parent');
  });
});

describe('placementFitsSlot', () => {
  const fits = (p: Project, rect: Rect): boolean =>
    placementFitsSlot(p, catalog, 'C', rect, approximateMeasurer);

  it('free slot: the computed rectangle fits', () => {
    const p = add(componentProject(), 'C', 'column', {
      rect: { x: 50, y: 50, width: 300, height: 300 },
    });
    const rect = componentPlacement(
      p,
      catalog,
      { containerId: 'I1', parentId: 'C', specId: SPEC_ID, typeId: 'text' },
      approximateMeasurer,
    );
    expect(fits(p, rect)).toBe(true);
  });

  it('full slot: the child clamped to the component does not fit in the slot area', () => {
    // The `inset` slot sits 20 px inside the component: x from 120 to 380, y from 120 to 160.
    let p = add(componentProject(), 'C', 'inset', {
      rect: { x: 100, y: 100, width: 300, height: 80 },
    });
    p = add(p, 'T1', 'text', { parentId: 'C' });
    p = add(p, 'T2', 'text', { parentId: 'C' });
    const rect = componentPlacement(
      p,
      catalog,
      { containerId: 'I1', parentId: 'C', specId: SPEC_ID, typeId: 'text' },
      approximateMeasurer,
    );
    // 120 + 100 + 8 + 100 + 8 = 336; 336 + 100 goes past 380: clamped to the component (x = 300).
    expect(rect).toEqual({ x: 300, y: 120, width: 100, height: 40 });
    expect(fits(p, rect)).toBe(false);
  });

  it('slot full at the component size: clamped inside it, but on top of the last child', () => {
    let p = add(componentProject(), 'C', 'row', {
      rect: { x: 100, y: 100, width: 300, height: 40 },
    });
    p = add(p, 'T1', 'text', { parentId: 'C' });
    p = add(p, 'T2', 'text', { parentId: 'C' });
    const rect = componentPlacement(
      p,
      catalog,
      { containerId: 'I1', parentId: 'C', specId: SPEC_ID, typeId: 'text' },
      approximateMeasurer,
    );
    expect(rect).toEqual({ x: 300, y: 100, width: 100, height: 40 });
    expect(fits(p, rect)).toBe(false);
  });

  it('target without a slot: does not fit', () => {
    const p = add(componentProject(), 'C', 'text', {
      rect: { x: 100, y: 100, width: 300, height: 100 },
    });
    expect(fits(p, { x: 100, y: 100, width: 10, height: 10 })).toBe(false);
  });
});

describe('the new instance is born at the measured size (MC3, decision 16 of #898)', () => {
  const fcat = fitCatalog();
  const args = (
    typeId: string,
    extra: Partial<NewComponentArgs> = {},
  ): NewComponentArgs => ({
    markingId: 'B',
    annotationId: 'A_B',
    containerId: 'I1',
    parentId: null,
    specId: FIT_SPEC_ID,
    typeId,
    ...extra,
  });
  const create = (typeId: string, extra: Partial<NewComponentArgs> = {}) =>
    addComponentMarking(fitProject(), fcat, args(typeId, extra), approximateMeasurer);

  it('without rect, the hug axis takes the height of the given label; the width and the center stay', () => {
    const rect = marking(
      create('fit-button', { values: { label: LONG_LABEL } }),
      'B',
    ).rect;
    expect(rect.width).toBe(120);
    expect(rect.height).toBeGreaterThanOrEqual(76);
    expect((rect.height - 16) % 20).toBe(0);
    // Centered on the 1000 × 800 image with the measured size.
    expect(rect.x).toBe(500 - 60);
    expect(rect.y).toBe(Math.round(400 - rect.height / 2));
  });

  it('a label that fits gives the usual size (the minSize applies)', () => {
    const rect = marking(create('fit-button', { values: { label: 'Ok' } }), 'B').rect;
    expect(rect).toMatchObject({ width: 120, height: 40 });
  });

  it('without values it measures the field default; a component without a fittable axis does not change', () => {
    expect(marking(create('fit-button'), 'B').rect).toMatchObject({
      width: 120,
      height: 40,
    });
    expect(marking(create('fit-plain'), 'B').rect).toMatchObject({
      width: 120,
      height: 40,
    });
  });

  it('the given rect rules, without measuring', () => {
    const given = { x: 10, y: 20, width: 120, height: 40 };
    const p = create('fit-button', { values: { label: LONG_LABEL }, rect: given });
    expect(marking(p, 'B').rect).toEqual(given);
  });

  it('expression sizing too: the field that switches on the px applies on creation', () => {
    const rect = marking(create('fit-px', { values: { tall: 'yes' } }), 'B').rect;
    expect(rect.height).toBe(80);
  });

  it('componentPlacement and componentSize measure with the given values', () => {
    const base = {
      containerId: 'I1',
      parentId: null,
      specId: FIT_SPEC_ID,
      typeId: 'fit-button',
    };
    const values = { label: LONG_LABEL };
    const size = componentSize(
      fitProject(),
      fcat,
      { ...base, values },
      approximateMeasurer,
    );
    expect(size.height).toBeGreaterThanOrEqual(76);
    const rect = componentPlacement(
      fitProject(),
      fcat,
      { ...base, values },
      approximateMeasurer,
    );
    expect({ width: rect.width, height: rect.height }).toEqual(size);
    // Without values, the component size (the label is the default, short).
    expect(componentSize(fitProject(), fcat, base, approximateMeasurer)).toEqual({
      width: 120,
      height: 40,
    });
  });

  it('with values containing a value the field refuses, it measures without it (the creation fails as before)', () => {
    const base = {
      containerId: 'I1',
      parentId: null,
      specId: FIT_SPEC_ID,
      typeId: 'fit-button',
    };
    const size = componentSize(
      fitProject(),
      fcat,
      { ...base, values: { label: 5 as never, nonexistent: 'x' } },
      approximateMeasurer,
    );
    expect(size).toEqual({ width: 120, height: 40 });
  });
});

describe('componentPlacement: new child in a slot with wrap (MC4, decision 12)', () => {
  const wrapped = (wrap: Record<string, unknown>) =>
    testCatalog({
      ...COMPONENTS,
      row: wrappedContainer('row', 'row', { width: 320, height: 100 }, wrap),
    });

  it('goes after the last one on the same line while it fits and on the next line when it does not', () => {
    const cat = wrapped({ wrap: 'wrap', lineGap: 12 });
    let p = add(
      componentProject(),
      'C',
      'row',
      { rect: { x: 100, y: 100, width: 320, height: 100 } },
      cat,
    );
    for (const id of ['T1', 'T2', 'T3', 'T4'])
      p = add(p, id, 'text', { parentId: 'C' }, cat);
    expect(rectOf(p, 'T1')).toEqual({ x: 100, y: 100, width: 100, height: 40 });
    expect(rectOf(p, 'T2')).toEqual({ x: 208, y: 100, width: 100, height: 40 });
    expect(rectOf(p, 'T3')).toEqual({ x: 316, y: 100, width: 100, height: 40 });
    // 316 + 100 + 8 + 100 > 420: the fourth goes to the start of the next line.
    expect(rectOf(p, 'T4')).toEqual({ x: 100, y: 152, width: 100, height: 40 });
    expectValid(p);
  });

  it('maxPerLine breaks the line before the space runs out', () => {
    const cat = wrapped({ wrap: 'wrap', maxPerLine: 2 });
    let p = add(
      componentProject(),
      'C',
      'row',
      { rect: { x: 100, y: 100, width: 320, height: 100 } },
      cat,
    );
    for (const id of ['T1', 'T2', 'T3']) p = add(p, id, 'text', { parentId: 'C' }, cat);
    expect(rectOf(p, 'T3')).toEqual({ x: 100, y: 140, width: 100, height: 40 });
  });

  it('maxLines: a child that would open a line beyond the limit does not open the next line', () => {
    const cat = wrapped({ wrap: 'wrap', maxLines: 1 });
    let p = add(
      componentProject(),
      'C',
      'row',
      { rect: { x: 100, y: 100, width: 320, height: 100 } },
      cat,
    );
    for (const id of ['T1', 'T2', 'T3', 'T4'])
      p = add(p, id, 'text', { parentId: 'C' }, cat);
    // Without the new line (y 140), the child falls into the single-line flow and the free place takes it further.
    expect(rectOf(p, 'T4').y).not.toBe(140);
  });

  it("without wrap, the child follows to the right of the last one (today's behavior)", () => {
    let p = add(componentProject(), 'C', 'row', {
      rect: { x: 100, y: 100, width: 320, height: 100 },
    });
    for (const id of ['T1', 'T2']) p = add(p, id, 'text', { parentId: 'C' });
    expect(rectOf(p, 'T2').x).toBe(208);
  });
});

describe('the Material 3 top-app-bar is born with the style height (TB1, decision 1 of #1335)', () => {
  const m3 = (): Project => {
    let n = 0;
    const p = applySpecialization(emptyProject(), m3Spec, {
      newId: () => `TB${++n}`,
      packageSpecName: 'material3-compose.spec.json',
    });
    return addContainer(p, { id: 'I1', file: null, width: 360, height: 800 } as never);
  };
  const create = (values?: NewComponentArgs['values']): Project =>
    addComponentMarking(
      m3(),
      m3Catalog,
      {
        markingId: 'B',
        annotationId: 'A_B',
        containerId: 'I1',
        parentId: null,
        specId: m3Spec.id,
        typeId: 'top-app-bar',
        ...(values ? { values } : {}),
      },
      approximateMeasurer,
    );

  it.each([
    ['small', 64],
    ['medium', 112],
    ['large', 152],
  ])(
    'without rect, the %s style is born with height %i and the width clamped to the 360 of the container',
    (style, height) => {
      const rect = rectOf(create({ style }), 'B');
      expect(rect.height).toBe(height);
      expect(rect.width).toBe(360);
    },
  );

  it('without values, the default style (small) gives 64', () => {
    expect(rectOf(create(), 'B').height).toBe(64);
  });

  it('componentSize and componentPlacement give the same style height', () => {
    const base = {
      containerId: 'I1',
      parentId: null,
      specId: m3Spec.id,
      typeId: 'top-app-bar',
      values: { style: 'medium' },
    };
    const size = componentSize(m3(), m3Catalog, base, approximateMeasurer);
    const rect = componentPlacement(m3(), m3Catalog, base, approximateMeasurer);
    expect(size.height).toBe(112);
    expect({ width: rect.width, height: rect.height }).toEqual(size);
  });

  it('with an explicit rect, the rect rules', () => {
    const given = { x: 0, y: 0, width: 360, height: 90 };
    const p = addComponentMarking(
      m3(),
      m3Catalog,
      {
        markingId: 'B',
        annotationId: 'A_B',
        containerId: 'I1',
        parentId: null,
        specId: m3Spec.id,
        typeId: 'top-app-bar',
        rect: given,
      },
      approximateMeasurer,
    );
    expect(rectOf(p, 'B')).toEqual(given);
  });
});

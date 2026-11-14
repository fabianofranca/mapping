import { describe, expect, it } from 'vitest';
import {
  MIN_MARKING_SIZE,
  ModelError,
  addTypedAnnotation,
  adjustMarkingRect,
  checkRectSize,
  componentMinSize,
  createMarking,
  fromCanvasRect,
  deserialize,
  serialize,
  setMarkingRect,
  type Project,
} from '../../src/model';
import { componentProject, SPEC_ID, testCatalog } from './componentFixtures';

// Decision 24: a marking with a type annotation WITH a component has a minimum of 1 px (the component's
// `minSize`, if any, still rules); the others keep `MIN_MARKING_SIZE` (8) in gestures.

const rect = (x: number, y: number, width: number, height: number) => ({
  x,
  y,
  width,
  height,
});

function errorOf(run: () => unknown): ModelError {
  try {
    run();
  } catch (e) {
    if (e instanceof ModelError) return e;
    throw e;
  }
  throw new Error('did not fail');
}

/** M1 (200×100) with an annotation of type `box` (component without minSize) or `row` (minSize 50×30). */
function withTyped(typeId: 'box' | 'row' | null): Project {
  let p = createMarking(componentProject(), {
    id: 'M1',
    containerId: 'I1',
    rect: rect(10, 10, 200, 100),
  });
  if (typeId !== null) {
    p = addTypedAnnotation(p, {
      id: 'A1',
      markingId: 'M1',
      layerId: 'LS1',
      type: { specId: SPEC_ID, typeId },
    });
  }
  return p;
}

const optionsFor = (p: Project) => {
  const minSize = componentMinSize(p, testCatalog(), 'M1');
  return minSize ? { minSize } : undefined;
};

describe('checkRectSize: base 1 with a component, 8 without', () => {
  it('without a component the minimum is 8', () => {
    expect(MIN_MARKING_SIZE).toBe(8);
    expect(() => checkRectSize({ width: 3, height: 3 })).toThrow('rect-too-small');
    expect(() => checkRectSize({ width: 8, height: 8 })).not.toThrow();
  });

  it('with a 1×1 component, 3×3 passes and below 1 px fails with source "component"', () => {
    const min = { width: 1, height: 1 };
    expect(() => checkRectSize({ width: 3, height: 3 }, min)).not.toThrow();
    expect(() => checkRectSize({ width: 1, height: 1 }, min)).not.toThrow();
    const error = errorOf(() => checkRectSize({ width: 0, height: 5 }, min));
    expect(error.code).toBe('rect-too-small');
    expect(error.data).toEqual({
      received: { width: 0, height: 5 },
      min: { width: 1, height: 1 },
      source: 'component',
    });
  });

  it('the larger component minSize still rules', () => {
    expect(() =>
      checkRectSize({ width: 15, height: 30 }, { width: 20, height: 10 }),
    ).toThrow('rect-too-small');
    expect(() =>
      checkRectSize({ width: 20, height: 10 }, { width: 20, height: 10 }),
    ).not.toThrow();
  });
});

describe('fromCanvasRect: base by presence of the minimum', () => {
  const place = { x: 0, y: 0, scale: 1 };
  it('without a minimum it grows to 8; with a 1×1 minimum it keeps 3×3', () => {
    expect(fromCanvasRect(place, rect(10, 10, 3, 3), null)).toMatchObject({
      width: 8,
      height: 8,
    });
    expect(
      fromCanvasRect(place, rect(10, 10, 3, 3), null, { width: 1, height: 1 }),
    ).toEqual(rect(10, 10, 3, 3));
  });
});

describe('componentMinSize', () => {
  it('a plain marking (without an annotation or without a component) is null', () => {
    expect(componentMinSize(withTyped(null), testCatalog(), 'M1')).toBeNull();
  });
  it('a component without minSize is 1×1; with minSize, its own', () => {
    expect(componentMinSize(withTyped('box'), testCatalog(), 'M1')).toEqual({
      width: 1,
      height: 1,
    });
    expect(componentMinSize(withTyped('row'), testCatalog(), 'M1')).toEqual({
      width: 50,
      height: 30,
    });
  });
});

describe('model gestures with the 1 px minimum', () => {
  it('setMarkingRect 3×3 passes with a component and fails without', () => {
    const typed = withTyped('box');
    const q = setMarkingRect(typed, 'M1', rect(10, 10, 3, 3), optionsFor(typed));
    expect(q.markings.find((m) => m.id === 'M1')?.rect).toEqual(rect(10, 10, 3, 3));
    const plain = withTyped(null);
    const error = errorOf(() =>
      setMarkingRect(plain, 'M1', rect(10, 10, 3, 3), optionsFor(plain)),
    );
    expect(error.code).toBe('rect-too-small');
    expect(error.data).toMatchObject({ min: { width: 8, height: 8 }, source: 'marking' });
  });

  it('createMarking 3×3 with minSize 1×1 passes; without the option it fails', () => {
    const base = componentProject();
    const args = { id: 'X', containerId: 'I1', rect: rect(0, 0, 3, 3) };
    expect(
      createMarking(base, args, { minSize: { width: 1, height: 1 } }).markings,
    ).toHaveLength(1);
    expect(() => createMarking(base, args)).toThrow('rect-too-small');
  });

  it('adjustMarkingRect: the lower limit of the panel is 1 with a component, 8 without', () => {
    const typed = withTyped('box');
    const a = adjustMarkingRect(typed, 'M1', 'width', 2, optionsFor(typed));
    expect(a.markings.find((m) => m.id === 'M1')?.rect.width).toBe(1 + 1);
    const b = adjustMarkingRect(typed, 'M1', 'width', 0, optionsFor(typed));
    expect(b.markings.find((m) => m.id === 'M1')?.rect.width).toBe(1);
    const plain = withTyped(null);
    const c = adjustMarkingRect(plain, 'M1', 'width', 2, optionsFor(plain));
    expect(c.markings.find((m) => m.id === 'M1')?.rect.width).toBe(8);
  });

  it('the component minSize [50,30] still rules', () => {
    const row = withTyped('row');
    const error = errorOf(() =>
      setMarkingRect(row, 'M1', rect(10, 10, 3, 3), optionsFor(row)),
    );
    expect(error.data).toMatchObject({
      min: { width: 50, height: 30 },
      source: 'component',
    });
  });
});

describe('reading mapping.json', () => {
  it('accepts a 3×3 px marking (any type) and 1×1; the writer saves it', () => {
    let p = withTyped(null);
    p = {
      ...p,
      markings: p.markings.map((m) => ({ ...m, rect: rect(10, 10, 3, 3) })),
    };
    const parsed = deserialize(serialize(p));
    expect(parsed.ok).toBe(true);
  });
  it('0 px is still refused', () => {
    const p = withTyped(null);
    const bad = {
      ...p,
      markings: p.markings.map((m) => ({ ...m, rect: rect(10, 10, 0, 3) })),
    };
    expect(deserialize(serialize(bad)).ok).toBe(false);
  });
});

import { describe, expect, it, vi } from 'vitest';
import {
  addComponentMarking,
  approximateMeasurer,
  createDrawingCache,
  setContainerClass,
  setContainerDensity,
  type NewComponentArgs,
  type Project,
  type TextMeasurer,
} from '../../src/model';
import { walk } from '../../src/model/components/scene';
import { CX_SPEC_ID, cxCatalog, cxProject } from './containerContextFixtures';

// CX4 (#2039, decision 18 of #1901): the drawing cache compares the container context only for the markings
// whose component reads `$container.*`. A class chosen, a size or a density changed redraws those and nothing
// else; a marking of another container keeps its drawing.

const catalog = cxCatalog();

function add(
  p: Project,
  id: string,
  typeId: string,
  containerId: string,
  extra: Partial<NewComponentArgs> = {},
): Project {
  return addComponentMarking(
    p,
    catalog,
    {
      markingId: id,
      annotationId: `A_${id}`,
      containerId,
      parentId: null,
      specId: CX_SPEC_ID,
      typeId,
      rect: { x: 30, y: 30, width: 300, height: 120 },
      ...extra,
    },
    approximateMeasurer,
  );
}

/** `R1`/`P1` in container I1, `R2` in I2 (all of `pad`, which reads), `P1`/`P2` of `plain`, which does not. */
function scene(): Project {
  let p = cxProject();
  p = add(p, 'R1', 'pad', 'I1');
  p = add(p, 'P1', 'plain', 'I1', { rect: { x: 400, y: 30, width: 300, height: 120 } });
  p = add(p, 'H1', 'holder', 'I1', { rect: { x: 30, y: 300, width: 300, height: 120 } });
  p = add(p, 'R2', 'pad', 'I2');
  return p;
}

/** The container with another size in pixels (the image it shows is not touched). */
const updateContainerSize = (
  p: Project,
  id: string,
  size: { width: number; height: number },
): Project => ({
  ...p,
  containers: p.containers.map((c) => (c.id === id ? { ...c, ...size } : c)),
});

const run = (cache: ReturnType<typeof createDrawingCache>, p: Project) =>
  cache(p, catalog, approximateMeasurer, 0);
const changed = (
  before: ReturnType<typeof run>,
  after: ReturnType<typeof run>,
): string[] => [...after.keys()].filter((id) => after.get(id) !== before.get(id)).sort();

describe('drawing cache with the container context', () => {
  it('chosen class: redraws the markings of that container that read the platform and nothing else', () => {
    let p = scene();
    p = add(p, 'C1', 'chosen', 'I1', {
      rect: { x: 400, y: 300, width: 300, height: 120 },
    });
    const cache = createDrawingCache();
    const before = run(cache, p);
    const after = run(cache, setContainerClass(p, 'I1', 'platform', 'web'));
    expect(changed(before, after)).toEqual(['C1']);
  });

  it('resizing the container across a class threshold redraws the markings that read it, in that container only', () => {
    const p = scene();
    const cache = createDrawingCache();
    const before = run(cache, p);
    // 1080 → 2520 px at density 3: 360 → 840 units, compact → expanded.
    const after = run(cache, updateContainerSize(p, 'I1', { width: 2520, height: 1600 }));
    expect(changed(before, after)).toEqual(['H1', 'R1']);
    expect(after.get('P1')).toBe(before.get('P1'));
    expect(after.get('R2')).toBe(before.get('R2'));
  });

  it('changing the density of a container redraws only those that read it', () => {
    const p = scene();
    const cache = createDrawingCache();
    const before = run(cache, p);
    // The rectangles are in pixels: density 2 changes the box in units of every marking of I1; the width
    // in units also changes what `$container.width` is. `P1` is redrawn by the density as before; the
    // marking of I2 is not touched.
    const after = run(cache, setContainerDensity(p, 'I1', 2));
    expect(after.get('R2')).toBe(before.get('R2'));
    expect(after.get('R1')).not.toBe(before.get('R1'));
  });

  it('a sibling whose component does not read the container keeps the same drawing object when the class changes', () => {
    const p = scene();
    const cache = createDrawingCache();
    const before = run(cache, p);
    const after = run(cache, updateContainerSize(p, 'I1', { width: 2520, height: 1600 }));
    expect(after.get('P1')).toBe(before.get('P1'));
  });

  it('a change of the container that does not touch what the component reads keeps its drawing object', () => {
    // `pad` reads the `window` class only: another height in the same class is not a reason to redraw it.
    const p = scene();
    const cache = createDrawingCache();
    const before = run(cache, p);
    const after = run(cache, updateContainerSize(p, 'I1', { width: 1080, height: 1800 }));
    expect(after.get('R1')).toBe(before.get('R1'));
    expect(after.get('P1')).toBe(before.get('P1'));
  });

  it('a marking in another container is not redrawn', () => {
    const p = scene();
    const cache = createDrawingCache();
    const before = run(cache, p);
    const after = run(cache, setContainerClass(p, 'I1', 'platform', 'web'));
    expect(after.get('R2')).toBe(before.get('R2'));
    const resized = run(
      cache,
      updateContainerSize(p, 'I1', { width: 2520, height: 1600 }),
    );
    expect(resized.get('R2')).toBe(before.get('R2'));
  });

  it('the redrawn reader draws with the new class', () => {
    const p = scene();
    const cache = createDrawingCache();
    const narrow = run(cache, p).get('R1');
    const wide = run(
      cache,
      updateContainerSize(p, 'I1', { width: 2520, height: 1600 }),
    ).get('R1');
    const widthOf = (drawing: typeof narrow) =>
      [...walk(drawing!.root)].find((n) => n.name === 'bar')?.width;
    expect(widthOf(narrow)).toBe(16);
    expect(widthOf(wide)).toBe(24);
  });

  it('pan and zoom (the same project) neither instantiate nor measure anything', () => {
    const p = scene();
    const measure = vi.fn<TextMeasurer>(approximateMeasurer);
    const cache = createDrawingCache();
    const first = cache(p, catalog, measure, 0);
    const calls = measure.mock.calls.length;
    for (let i = 0; i < 50; i++) expect(cache(p, catalog, measure, 0)).toBe(first);
    expect(measure.mock.calls.length).toBe(calls);
  });

  it('a new project object with the same container context reuses every drawing', () => {
    const p = scene();
    const cache = createDrawingCache();
    const before = run(cache, p);
    const after = run(cache, { ...p, containers: [...p.containers] });
    for (const id of ['R1', 'P1', 'H1', 'R2']) expect(after.get(id)).toBe(before.get(id));
  });
});

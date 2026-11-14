import { describe, expect, it, vi } from 'vitest';
import {
  addComponentMarking,
  approximateMeasurer,
  createDrawingCache,
  createMarking,
  moveMarking,
  setMarkingAnchor,
  setMarkingRect,
  type NewComponentArgs,
  type Project,
  type TextMeasurer,
} from '../../src/model';
import { SPEC_ID, componentProject, testCatalog } from './componentFixtures';

// Anchor (R3, decision 15): the cache entry stores the rectangle of the marking's anchor (`anchorRect`)
// and compares it, like the direction and the mode. Only the anchored ones depend on it.

const catalog = testCatalog();

function add(p: Project, id: string, x: number, extra: Partial<NewComponentArgs> = {}) {
  return addComponentMarking(
    p,
    catalog,
    {
      markingId: id,
      annotationId: `A_${id}`,
      containerId: 'I1',
      parentId: null,
      specId: SPEC_ID,
      typeId: 'text',
      rect: { x, y: 500, width: 60, height: 24 },
      ...extra,
    },
    approximateMeasurer,
  );
}

/** T (without a component) with 3 anchored ones (B1 to B3) and a loose X, all drawn by a component (except T). */
function scene(): Project {
  let p = componentProject();
  p = createMarking(p, {
    id: 'T',
    containerId: 'I1',
    rect: { x: 100, y: 100, width: 200, height: 100 },
  });
  p = add(p, 'B1', 100, { anchor: { to: 'T', side: 'top', align: 'start' } });
  p = add(p, 'B2', 200, { anchor: { to: 'T', side: 'bottom' } });
  p = add(p, 'B3', 300, { anchor: { to: 'T', side: 'end' } });
  p = add(p, 'X', 700);
  return p;
}

const run = (cache: ReturnType<typeof createDrawingCache>, p: Project) =>
  cache(p, catalog, approximateMeasurer, 0);
const changed = (
  before: ReturnType<typeof run>,
  after: ReturnType<typeof run>,
): string[] => [...after.keys()].filter((id) => after.get(id) !== before.get(id)).sort();

describe('cache with an anchor', () => {
  it('resizing the anchor re-instantiates the 3 anchored ones and nothing else', () => {
    const p = scene();
    const cache = createDrawingCache();
    const before = run(cache, p);
    const after = run(
      cache,
      setMarkingRect(p, 'T', { x: 100, y: 100, width: 260, height: 100 }),
    );
    expect(changed(before, after)).toEqual(['B1', 'B2', 'B3']);
  });

  it('moving the anchor re-instantiates the 3 (which move along); X stays', () => {
    const p = scene();
    const cache = createDrawingCache();
    const before = run(cache, p);
    const after = run(cache, moveMarking(p, 'T', 10, 10));
    expect(changed(before, after)).toEqual(['B1', 'B2', 'B3']);
    expect(after.get('X')).toBe(before.get('X'));
  });

  it('moving another marking re-instantiates 0', () => {
    const p = scene();
    const cache = createDrawingCache();
    const before = run(cache, p);
    const after = run(cache, moveMarking(p, 'X', 5, 5));
    expect(changed(before, after)).toEqual(['X']);
    for (const id of ['B1', 'B2', 'B3']) expect(after.get(id)).toBe(before.get(id));
  });

  it('pan and zoom (same project) neither instantiate nor measure anything', () => {
    const p = scene();
    const measure = vi.fn<TextMeasurer>(approximateMeasurer);
    const cache = createDrawingCache();
    const first = cache(p, catalog, measure, 0);
    const calls = measure.mock.calls.length;
    for (let i = 0; i < 50; i++) expect(cache(p, catalog, measure, 0)).toBe(first);
    expect(measure.mock.calls.length).toBe(calls);
  });

  it('a new project with the same anchors reuses all the drawings', () => {
    const p = scene();
    const cache = createDrawingCache();
    const before = run(cache, p);
    expect(changed(before, run(cache, { ...p }))).toEqual([]);
  });

  it('removing the anchor re-instantiates the anchored one (its rectangle stops being an input)', () => {
    const p = scene();
    const cache = createDrawingCache();
    const before = run(cache, p);
    const after = run(cache, setMarkingAnchor(p, 'B2', null));
    expect(changed(before, after)).toEqual(['B2']);
  });

  it('the drawing carries the side and the rectangle of the anchor (R3 part 2 hands them to the engine)', () => {
    const drawings = run(createDrawingCache(), scene());
    expect(drawings.get('B1')?.anchor).toEqual({
      side: 'top',
      rect: { x: 100, y: 100, width: 200, height: 100 },
    });
    expect(drawings.get('X')?.anchor).toBeUndefined();
  });
});

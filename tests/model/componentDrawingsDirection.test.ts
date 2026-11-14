import { describe, expect, it, vi } from 'vitest';
import {
  addComponentMarking,
  addContainer,
  approximateMeasurer,
  createDrawingCache,
  setContainerDirection,
  setProjectDirection,
  type NewComponentArgs,
  type Project,
  type TextMeasurer,
} from '../../src/model';
import { SPEC_ID, componentProject, testCatalog } from './componentFixtures';

// Direction (schema v20, decision 8): the cache compares the effective direction per entry, like the mode and the
// density. Changing a container's re-instantiates only its markings; changing the project's,
// the ones that follow it; pan and zoom (same project) re-instantiate nothing.

const catalog = testCatalog();

function add(
  p: Project,
  id: string,
  containerId: string | null,
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
      specId: SPEC_ID,
      typeId: 'text',
      rect: { x: 10, y: 10, width: 60, height: 24 },
      ...extra,
    },
    approximateMeasurer,
  );
}

/** Two containers (I1 and I2), one marking in each and one on the canvas. */
function twoContainers(): Project {
  let p = componentProject();
  p = addContainer(p, { id: 'I2', file: 'images/other.png', width: 500, height: 400 });
  p = add(p, 'A', 'I1');
  p = add(p, 'B', 'I2');
  // Far from the images: it stays on the canvas (null containerId).
  p = add(p, 'C', null, { rect: { x: 4000, y: 4000, width: 60, height: 24 } });
  return p;
}

const run = (cache: ReturnType<typeof createDrawingCache>, p: Project) =>
  cache(p, catalog, approximateMeasurer, 0);

describe('cache with direction', () => {
  it('changing the direction of a container re-instantiates only its markings', () => {
    const p = twoContainers();
    const cache = createDrawingCache();
    const before = run(cache, p);
    const after = run(cache, setContainerDirection(p, 'I1', 'rtl'));
    expect(after.get('A')).not.toBe(before.get('A'));
    expect(after.get('B')).toBe(before.get('B'));
    expect(after.get('C')).toBe(before.get('C'));
  });

  it('changing the project direction re-instantiates those of the spaces that follow it', () => {
    const p = setContainerDirection(twoContainers(), 'I2', 'ltr');
    const cache = createDrawingCache();
    const before = run(cache, p);
    const after = run(cache, setProjectDirection(p, 'rtl'));
    expect(after.get('A')).not.toBe(before.get('A'));
    // The canvas (null containerId) follows the project; I2 pins ltr and stays.
    expect(after.get('C')).not.toBe(before.get('C'));
    expect(after.get('B')).toBe(before.get('B'));
  });

  it('pinning on the container the direction it already followed re-instantiates nothing', () => {
    const p = setProjectDirection(twoContainers(), 'rtl');
    const cache = createDrawingCache();
    const before = run(cache, p);
    const after = run(cache, setContainerDirection(p, 'I1', 'rtl'));
    expect(after.get('A')).toBe(before.get('A'));
    expect(after).toBe(before);
  });

  it('pan and zoom (same project in rtl) neither instantiate nor measure anything', () => {
    const p = setProjectDirection(twoContainers(), 'rtl');
    const measure = vi.fn<TextMeasurer>(approximateMeasurer);
    const cache = createDrawingCache();
    const first = cache(p, catalog, measure, 0);
    const calls = measure.mock.calls.length;
    for (let i = 0; i < 50; i++) expect(cache(p, catalog, measure, 0)).toBe(first);
    expect(measure.mock.calls.length).toBe(calls);
  });

  it('a new project with the same direction reuses all the drawings', () => {
    const p = setProjectDirection(twoContainers(), 'rtl');
    const cache = createDrawingCache();
    const before = run(cache, p);
    const after = run(cache, { ...p });
    for (const id of ['A', 'B', 'C']) expect(after.get(id)).toBe(before.get(id));
  });
});

// Anchor candidates (R4, decision 13): the markings of the project in view grouped by space, so that
// the Anchor section lists only those of the same container (or the canvas) without scanning the project on every render.
import { signal } from '@preact/signals';
import { describe, expect, it } from 'vitest';
import { addContainer, createMarking, type ComponentCatalog } from '../../src/model';
import { createEditorDerived } from '../../src/store/derived';
import { createProjectStore } from '../../src/store/history';
import { createEditorUi } from '../../src/store/ui';
import { emptyProject } from '../model/fixtures';

function setup() {
  let p = emptyProject();
  p = addContainer(p, { id: 'I1', file: 'a.png', width: 1000, height: 800 });
  p = addContainer(p, { id: 'I2', file: 'b.png', width: 1000, height: 800 });
  const at = (id: string, containerId: string | null, x: number, y = 10) =>
    createMarking(p, { id, containerId, rect: { x, y, width: 50, height: 50 } });
  p = at('A', 'I1', 10);
  p = at('B', 'I1', 100);
  p = at('D', 'I2', 10);
  p = at('F', null, -3000, -3000);
  const store = createProjectStore({ now: () => '2026-11-13T00:00:00.000Z' });
  store.load(p);
  const sources = { catalog: signal<ComponentCatalog>(new Map()), fontsEpoch: signal(0) };
  return {
    store,
    derived: createEditorDerived(store, createEditorUi(), undefined, sources),
  };
}

const ids = (list: readonly { id: string }[] | undefined) => list?.map((m) => m.id);

describe('derived: markings by space (anchor candidates)', () => {
  it('groups by container, and the canvas stays under `null`, in project order', () => {
    const { derived } = setup();
    const spaces = derived.markingsBySpace.value;
    expect(ids(spaces.get('I1'))).toEqual(['A', 'B']);
    expect(ids(spaces.get('I2'))).toEqual(['D']);
    expect(ids(spaces.get(null))).toEqual(['F']);
  });

  it('follows the project and keeps the same object while it does not change', () => {
    const { store, derived } = setup();
    const first = derived.markingsBySpace.value;
    expect(derived.markingsBySpace.value).toBe(first);
    store.apply((p) =>
      createMarking(p, {
        id: 'G',
        containerId: 'I2',
        rect: { x: 200, y: 200, width: 50, height: 50 },
      }),
    );
    expect(ids(derived.markingsBySpace.value.get('I2'))).toEqual(['D', 'G']);
  });
});

// Phase CL1 (#2397, finding F1): the palette add of a Button inside a just-added Box, through the real
// store actions (one undo entry each), leaves the Button with the Box as `parentId` right after the add.
import { describe, expect, it } from 'vitest';
import {
  addContainer,
  applySpecialization,
  approximateMeasurer,
  type Project,
} from '../../src/model';
import { createProjectStore } from '../../src/store/history';
import { createProjectActions } from '../../src/store/project';
import { emptyProject } from '../model/fixtures';
import { catalog, spec } from '../support/material3Adoption';

function setup(w = 360, h = 640) {
  let n = 0;
  let p = applySpecialization(emptyProject(), spec, {
    newId: () => `S${++n}`,
    packageSpecName: 'material3-compose.spec.json',
  });
  for (const id of ['A', 'B', 'C']) {
    p = addContainer(p, { id, file: null, width: w, height: h } as never);
  }
  const store = createProjectStore({ now: () => '2026-10-01T00:00:00.000Z' });
  let ids = 0;
  const actions = createProjectActions(store, {
    newId: () => `N${++ids}`,
    components: () => catalog,
    measure: () => approximateMeasurer,
  });
  store.load(p);
  return { store, actions };
}
const current = (s: ReturnType<typeof setup>['store']) => s.project.value as Project;

describe.each([
  [360, 640],
  [1000, 800],
  [300, 200],
])('F1 through the store, container %i × %i', (w, h) => {
  it('Box then Button inside it: parentId = the Box right after the add, and undo restores', () => {
    const { store, actions } = setup(w, h);
    const base = { containerId: 'A', specId: spec.id } as const;
    const box = actions.addComponent({ ...base, parentId: null, typeId: 'box' });
    expect(box.ok).toBe(true);
    if (!box.ok) return;
    const before = current(store);
    const btn = actions.addComponent({
      ...base,
      parentId: box.value.markingId,
      typeId: 'button',
    });
    expect(btn.ok).toBe(true);
    if (!btn.ok) return;
    const added = current(store).markings.find((m) => m.id === btn.value.markingId)!;
    expect(added.parentId).toBe(box.value.markingId);
    store.undo();
    expect(current(store)).toEqual(before);
  });
});

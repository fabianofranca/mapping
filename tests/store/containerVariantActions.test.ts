import { describe, expect, it } from 'vitest';
import { variantsOf, type Project } from '../../src/model';
import { createProjectStore, type ProjectStore } from '../../src/store/history';
import { createProjectActions } from '../../src/store/project';
import { NOW } from '../model/fixtures';
import { pagesProject } from './pageHarness';

// Store actions `linkVariant` and `unlinkVariant` (stage #2034 VR1, decision 4): one undo entry each.
// The pages world has I1 and I2 on PG1 and I3 on PG2.

function setup() {
  const store: ProjectStore = createProjectStore({ now: () => NOW });
  const actions = createProjectActions(store, {
    newId: (() => {
      let n = 0;
      return () => `N${++n}`;
    })(),
  });
  store.load(pagesProject());
  const project = () => store.committed.peek() as Project;
  const ids = (id: string) => variantsOf(project(), id).map((c) => c.id);
  return { store, actions, project, ids };
}

describe('variant actions', () => {
  it('linkVariant links two containers (also across pages) in ONE undo entry', () => {
    const s = setup();
    expect(s.actions.linkVariant('I1', 'I3').ok).toBe(true);
    expect(s.ids('I1')).toEqual(['I3']);
    expect(s.ids('I3')).toEqual(['I1']);
    s.store.undo();
    expect(s.ids('I1')).toEqual([]);
    expect(s.project().containers.some((c) => c.variantGroup !== undefined)).toBe(false);
    expect(s.store.canUndo.value).toBe(false);
  });

  it('linkVariant merges groups in one entry and redo repeats it', () => {
    const s = setup();
    s.actions.linkVariant('I1', 'I2');
    expect(s.actions.linkVariant('I3', 'I1').ok).toBe(true);
    expect(s.ids('I1').sort()).toEqual(['I2', 'I3']);
    s.store.undo();
    expect(s.ids('I1')).toEqual(['I2']);
    s.store.redo();
    expect(s.ids('I1').sort()).toEqual(['I2', 'I3']);
  });

  it('linkVariant refuses itself and a container of the same group, writing no entry', () => {
    const s = setup();
    expect(s.actions.linkVariant('I1', 'I1')).toEqual({
      ok: false,
      error: 'variant-self',
    });
    s.actions.linkVariant('I1', 'I2');
    s.store.undo();
    s.actions.linkVariant('I1', 'I2');
    expect(s.actions.linkVariant('I2', 'I1')).toEqual({
      ok: false,
      error: 'variant-already-linked',
    });
  });

  it('unlinkVariant leaves the others and is one undo entry', () => {
    const s = setup();
    s.actions.linkVariant('I1', 'I2');
    s.actions.linkVariant('I3', 'I1');
    expect(s.actions.unlinkVariant('I3').ok).toBe(true);
    expect(s.ids('I1')).toEqual(['I2']);
    expect(s.ids('I3')).toEqual([]);
    s.store.undo();
    expect(s.ids('I1').sort()).toEqual(['I2', 'I3']);
  });

  it('unlinkVariant of one of two removes both keys', () => {
    const s = setup();
    s.actions.linkVariant('I1', 'I2');
    s.actions.unlinkVariant('I1');
    expect(s.project().containers.some((c) => c.variantGroup !== undefined)).toBe(false);
  });
});

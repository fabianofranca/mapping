import { describe, expect, it } from 'vitest';
import type { Project } from '../../src/model';
import { createEditorDerived } from '../../src/store/derived';
import { createProjectStore } from '../../src/store/history';
import { createProjectActions } from '../../src/store/project';
import { createEditorUi } from '../../src/store/ui';
import { codeProject, idGen } from '../model/specFixtures';

function setup() {
  const store = createProjectStore();
  const actions = createProjectActions(store, { newId: idGen('id') });
  store.load(codeProject());
  const derived = createEditorDerived(store, createEditorUi());
  return { store, actions, derived };
}

const current = (store: ReturnType<typeof createProjectStore>): Project => {
  const p = store.project.value;
  if (!p) throw new Error('no project');
  return p;
};

describe('store: local clone per platform', () => {
  it('model errors come back as ActionResult, without touching the history', () => {
    const { store, actions } = setup();
    expect(actions.setPlatformRepo('android', { localPath: '/abs' })).toEqual({
      ok: false,
      error: 'invalid-local-path',
    });
    expect(actions.setPlatformRepo('web', { localPath: '.' })).toEqual({
      ok: false,
      error: 'unknown-platform',
    });
    expect(actions.removePlatformRepo('ios')).toEqual({ ok: false, error: 'not-found' });
    // The code field removed in stage 9 no longer exists on the Screen type.
    expect(actions.setFieldValue('AS', 'implementacao', [])).toEqual({
      ok: false,
      error: 'unknown-field',
    });
    expect(store.canUndo.value).toBe(false);
  });

  it('setting and removing go into the undo; the missing repository warning is gone', () => {
    const { store, actions, derived } = setup();
    expect('platformRepoWarnings' in derived).toBe(false);
    expect(actions.setPlatformRepo('ios', { localPath: '../ios' }).ok).toBe(true);
    expect(actions.removePlatformRepo('android').ok).toBe(true);
    expect(store.revision.value).toBe(2);

    // Repeating the current value does not create an entry.
    expect(actions.setPlatformRepo('ios', { localPath: '../ios' }).ok).toBe(true);
    expect(store.revision.value).toBe(2);

    expect(store.undo()).toBe(true);
    expect(Object.keys(current(store).platformRepos)).toEqual(['android', 'ios']);
    expect(store.undo()).toBe(true);
    expect(Object.keys(current(store).platformRepos)).toEqual(['android']);
    expect(current(store).platformRepos.android).toEqual({ localPath: '../../..' });
  });
});

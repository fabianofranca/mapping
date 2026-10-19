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
  if (!p) throw new Error('sem projeto');
  return p;
};

describe('store: clone local por plataforma', () => {
  it('erros do modelo voltam como ActionResult, sem mexer no histórico', () => {
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
    // O campo de código removido na etapa 9 não existe mais no tipo do Screen.
    expect(actions.setFieldValue('AS', 'implementacao', [])).toEqual({
      ok: false,
      error: 'unknown-field',
    });
    expect(store.canUndo.value).toBe(false);
  });

  it('informar e remover entram no desfazer; o aviso de repositório ausente saiu', () => {
    const { store, actions, derived } = setup();
    expect('platformRepoWarnings' in derived).toBe(false);
    expect(actions.setPlatformRepo('ios', { localPath: '../ios' }).ok).toBe(true);
    expect(actions.removePlatformRepo('android').ok).toBe(true);
    expect(store.revision.value).toBe(2);

    // Repetir o valor atual não cria entrada.
    expect(actions.setPlatformRepo('ios', { localPath: '../ios' }).ok).toBe(true);
    expect(store.revision.value).toBe(2);

    expect(store.undo()).toBe(true);
    expect(Object.keys(current(store).platformRepos)).toEqual(['android', 'ios']);
    expect(store.undo()).toBe(true);
    expect(Object.keys(current(store).platformRepos)).toEqual(['android']);
    expect(current(store).platformRepos.android).toEqual({ localPath: '../../..' });
  });
});

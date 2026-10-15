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

describe('store: repositórios por plataforma', () => {
  it('erros do modelo voltam como ActionResult, sem mexer no histórico', () => {
    const { store, actions } = setup();
    expect(actions.setPlatformRepo('android', { urlTemplate: 'https://x/' })).toEqual({
      ok: false,
      error: 'invalid-url-template',
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

  it('configurar e remover entram no desfazer e atualizam o aviso derivado (pelo path do code)', () => {
    const { store, actions, derived } = setup();
    // Só o Button tem `path` no iOS; no Android, Button e Input.
    expect(derived.platformRepoWarnings.value).toEqual([
      { code: 'missing-repo', platform: 'ios', types: 1 },
    ]);
    expect(
      actions.setPlatformRepo('ios', {
        urlTemplate: 'https://github.com/org/app-ios/blob/main/{path}',
      }).ok,
    ).toBe(true);
    expect(derived.platformRepoWarnings.value).toEqual([]);
    expect(actions.removePlatformRepo('android').ok).toBe(true);
    expect(derived.platformRepoWarnings.value).toEqual([
      { code: 'missing-repo', platform: 'android', types: 2 },
    ]);
    expect(store.revision.value).toBe(2);

    // Repetir a configuração atual não cria entrada.
    expect(
      actions.setPlatformRepo('ios', {
        urlTemplate: 'https://github.com/org/app-ios/blob/main/{path}',
      }).ok,
    ).toBe(true);
    expect(store.revision.value).toBe(2);

    expect(store.undo()).toBe(true);
    expect(Object.keys(current(store).platformRepos)).toEqual(['android', 'ios']);
    expect(store.undo()).toBe(true);
    expect(Object.keys(current(store).platformRepos)).toEqual(['android']);
    expect(derived.platformRepoWarnings.value).toEqual([
      { code: 'missing-repo', platform: 'ios', types: 1 },
    ]);
  });

  it('o aviso acompanha as especializações aplicadas: sem o SDUI, nenhum', () => {
    const { actions, derived } = setup();
    expect(actions.removeSpecialization('sdui', 'convert').ok).toBe(true);
    expect(derived.platformRepoWarnings.value).toEqual([]);
  });
});

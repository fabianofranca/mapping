import { describe, expect, it } from 'vitest';
import { codeRefEntries, type Project } from '../../src/model';
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

const entryIds = (p: Project) =>
  codeRefEntries(p.annotations.find((a) => a.id === 'AS')?.values?.implementacao).map(
    (e) => e._id,
  );

describe('store: referências de código', () => {
  it('cada operação de entrada é uma entrada no desfazer', () => {
    const { store, actions } = setup();
    const added = actions.addCodeRefEntry('AS', 'implementacao', {
      platform: 'bff',
      path: 'contratos/cadastro.json',
    });
    expect(added).toEqual({ ok: true, value: 'id1' });
    expect(actions.updateCodeRefEntry('AS', 'implementacao', 'id1', { line: 3 }).ok).toBe(
      true,
    );
    expect(actions.moveCodeRefEntry('AS', 'implementacao', 'id1', 0).ok).toBe(true);
    expect(actions.removeCodeRefEntry('AS', 'implementacao', 'C3').ok).toBe(true);
    expect(store.revision.value).toBe(4);
    expect(entryIds(current(store))).toEqual(['id1', 'C1', 'C2']);

    expect(store.undo()).toBe(true);
    expect(entryIds(current(store))).toEqual(['id1', 'C1', 'C2', 'C3']);
    expect(store.undo()).toBe(true);
    expect(entryIds(current(store))).toEqual(['C1', 'C2', 'C3', 'id1']);
    expect(store.undo()).toBe(true);
    expect(store.undo()).toBe(true);
    expect(entryIds(current(store))).toEqual(['C1', 'C2', 'C3']);
    expect(store.canUndo.value).toBe(false);
  });

  it('setFieldValue com a lista usa o gerador de ids do store', () => {
    const { store, actions } = setup();
    const result = actions.setFieldValue('AS', 'implementacao', [
      { _id: 'C1' },
      { platform: 'ios', path: 'App/Outra.swift' },
    ]);
    expect(result.ok).toBe(true);
    expect(entryIds(current(store))).toEqual(['C1', 'id1']);
    expect(store.revision.value).toBe(1);
  });

  it('erros do modelo voltam como ActionResult, sem mexer no histórico', () => {
    const { store, actions } = setup();
    expect(actions.addCodeRefEntry('AS', 'implementacao', { platform: 'web' })).toEqual({
      ok: false,
      error: 'platform-not-allowed',
    });
    expect(
      actions.updateCodeRefEntry('AS', 'implementacao', 'C1', { path: '/abs/a.kt' }),
    ).toEqual({ ok: false, error: 'invalid-path' });
    expect(actions.setPlatformRepo('android', { urlTemplate: 'https://x/' })).toEqual({
      ok: false,
      error: 'invalid-url-template',
    });
    expect(actions.removePlatformRepo('ios')).toEqual({ ok: false, error: 'not-found' });
    expect(store.canUndo.value).toBe(false);
  });

  it('repositórios: configurar e remover entram no desfazer e atualizam o aviso derivado', () => {
    const { store, actions, derived } = setup();
    expect(derived.platformRepoWarnings.value).toEqual([
      { code: 'missing-repo', platform: 'ios', entries: 1 },
    ]);
    expect(
      actions.setPlatformRepo('ios', {
        urlTemplate: 'https://github.com/org/app-ios/blob/main/{path}#L{line}',
      }).ok,
    ).toBe(true);
    expect(derived.platformRepoWarnings.value).toEqual([]);
    expect(actions.removePlatformRepo('android').ok).toBe(true);
    expect(derived.platformRepoWarnings.value).toEqual([
      { code: 'missing-repo', platform: 'android', entries: 2 },
    ]);
    expect(store.revision.value).toBe(2);

    // Repetir a configuração atual não cria entrada.
    expect(
      actions.setPlatformRepo('ios', {
        urlTemplate: 'https://github.com/org/app-ios/blob/main/{path}#L{line}',
      }).ok,
    ).toBe(true);
    expect(store.revision.value).toBe(2);

    expect(store.undo()).toBe(true);
    expect(Object.keys(current(store).platformRepos)).toEqual(['android', 'ios']);
    expect(store.undo()).toBe(true);
    expect(Object.keys(current(store).platformRepos)).toEqual(['android']);
    expect(derived.platformRepoWarnings.value).toEqual([
      { code: 'missing-repo', platform: 'ios', entries: 1 },
    ]);
  });

  it('as pendências novas aparecem no estado derivado', () => {
    const { actions, derived } = setup();
    expect(derived.issues.value.has('AS')).toBe(false);
    expect(
      actions.addCodeRefEntry('AS', 'implementacao', { platform: 'android' }).ok,
    ).toBe(true);
    expect(derived.issues.value.get('AS')).toEqual([
      { code: 'missing-path', key: 'implementacao', rowId: 'id1', column: 'path' },
    ]);
    expect(derived.incompleteCount.value).toBe(2); // o Text do Título já era incompleto
  });
});

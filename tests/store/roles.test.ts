// Ações do store sobre o papel do vínculo e o `docRepos` (etapa #559, PD2, decisão 15): cada
// gesto é uma entrada de desfazer.
import { describe, expect, it } from 'vitest';
import type { Project } from '../../src/model';
import { createProjectStore } from '../../src/store/history';
import { createProjectActions } from '../../src/store/project';
import { idGen, layerOf } from '../model/specFixtures';
import { roleProject, withDocRepo, withRoles } from '../model/roleFixtures';

function setup(edit = withRoles) {
  const store = createProjectStore();
  const actions = createProjectActions(store, { newId: idGen('id') });
  store.load(roleProject((s) => edit(s)));
  return { store, actions };
}

const current = (store: ReturnType<typeof createProjectStore>): Project => {
  const p = store.project.value;
  if (!p) throw new Error('sem projeto');
  return p;
};
const annotation = (store: ReturnType<typeof createProjectStore>, id: string) =>
  current(store).annotations.find((a) => a.id === id);

describe('store: criar vinculada com papel', () => {
  it('uma entrada de desfazer com o dono e o papel', () => {
    const { store, actions } = setup();
    const layerId = layerOf(current(store), 's', 'eventos');
    const result = actions.addTypedAnnotation(
      'M1',
      layerId,
      { specId: 's', typeId: 'onClick' },
      'A1',
      'click',
    );
    expect(result.ok).toBe(true);
    expect(store.revision.value).toBe(1);
    const created = current(store).annotations.at(-1);
    expect(created).toMatchObject({ parentAnnotationId: 'A1', parentRole: 'click' });
    expect(store.undo()).toBe(true);
    expect(current(store).annotations.some((a) => a.id === created?.id)).toBe(false);
  });

  it('papel que o dono não oferece volta como erro, sem entrada no histórico', () => {
    const { store, actions } = setup();
    const layerId = layerOf(current(store), 's', 'eventos');
    expect(
      actions.addTypedAnnotation(
        'M1',
        layerId,
        { specId: 's', typeId: 'onClick' },
        'A1',
        'nao',
      ),
    ).toEqual({ ok: false, error: 'unknown-role' });
    expect(store.canUndo.value).toBe(false);
  });
});

describe('store: trocar papel e dono', () => {
  function withChild() {
    const ctx = setup();
    const layerId = layerOf(current(ctx.store), 's', 'eventos');
    ctx.actions.addTypedAnnotation(
      'M1',
      layerId,
      { specId: 's', typeId: 'onClick' },
      'A1',
      'click',
    );
    const id = current(ctx.store).annotations.at(-1)!.id;
    return { ...ctx, id };
  }

  it('trocar o papel é uma entrada; desfazer volta o anterior', () => {
    const { store, actions, id } = withChild();
    const before = store.revision.value;
    expect(actions.setAnnotationRole(id, 'hold').ok).toBe(true);
    expect(store.revision.value).toBe(before + 1);
    expect(annotation(store, id)?.parentRole).toBe('hold');
    store.undo();
    expect(annotation(store, id)?.parentRole).toBe('click');
    expect(actions.setAnnotationRole(id, 'nao')).toEqual({
      ok: false,
      error: 'unknown-role',
    });
  });

  it('trocar o dono para um que oferece o papel o mantém, numa entrada', () => {
    const { store, actions, id } = withChild();
    const before = store.revision.value;
    expect(actions.setAnnotationParent(id, 'A2').ok).toBe(true);
    expect(store.revision.value).toBe(before + 1);
    expect(annotation(store, id)).toMatchObject({
      parentAnnotationId: 'A2',
      parentRole: 'click',
    });
  });

  it('tirar o dono limpa o papel na mesma entrada, e desfazer devolve os dois', () => {
    const { store, actions, id } = withChild();
    const before = store.revision.value;
    expect(actions.setAnnotationParent(id, null).ok).toBe(true);
    expect(store.revision.value).toBe(before + 1);
    expect(annotation(store, id)).toMatchObject({
      parentAnnotationId: null,
      parentRole: null,
    });
    store.undo();
    expect(annotation(store, id)).toMatchObject({
      parentAnnotationId: 'A1',
      parentRole: 'click',
    });
  });
});

describe('store: localPath do docRepos', () => {
  it('gravar e remover entram no desfazer; repetir o valor não cria entrada', () => {
    const { store, actions } = setup(withDocRepo);
    expect(actions.setDocRepo('design-docs', '../docs').ok).toBe(true);
    expect(current(store).docRepos).toEqual({ 'design-docs': { localPath: '../docs' } });
    expect(actions.setDocRepo('design-docs', '../docs').ok).toBe(true);
    expect(store.revision.value).toBe(1);
    expect(actions.removeDocRepo('design-docs').ok).toBe(true);
    expect(current(store).docRepos).toEqual({});
    store.undo();
    expect(current(store).docRepos).toEqual({ 'design-docs': { localPath: '../docs' } });
    store.undo();
    expect(current(store).docRepos).toEqual({});
  });

  it('erros do modelo voltam como ActionResult', () => {
    const { store, actions } = setup(withDocRepo);
    expect(actions.setDocRepo('outro', '../x')).toEqual({
      ok: false,
      error: 'unknown-doc-repo',
    });
    expect(actions.setDocRepo('design-docs', '/abs')).toEqual({
      ok: false,
      error: 'invalid-local-path',
    });
    expect(actions.removeDocRepo('design-docs')).toEqual({
      ok: false,
      error: 'not-found',
    });
    expect(store.canUndo.value).toBe(false);
  });
});

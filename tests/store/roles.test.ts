// Store actions on the link role and on `docRepos` (stage #559, PD2, decision 15): each
// gesture is one undo entry.
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
  if (!p) throw new Error('no project');
  return p;
};
const annotation = (store: ReturnType<typeof createProjectStore>, id: string) =>
  current(store).annotations.find((a) => a.id === id);

describe('store: create linked with a role', () => {
  it('one undo entry with the owner and the role', () => {
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

  it('a role that the owner does not offer comes back as an error, with no history entry', () => {
    const { store, actions } = setup();
    const layerId = layerOf(current(store), 's', 'eventos');
    expect(
      actions.addTypedAnnotation(
        'M1',
        layerId,
        { specId: 's', typeId: 'onClick' },
        'A1',
        'no',
      ),
    ).toEqual({ ok: false, error: 'unknown-role' });
    expect(store.canUndo.value).toBe(false);
  });
});

describe('store: change role and owner', () => {
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

  it('changing the role is one entry; undo restores the previous one', () => {
    const { store, actions, id } = withChild();
    const before = store.revision.value;
    expect(actions.setAnnotationRole(id, 'hold').ok).toBe(true);
    expect(store.revision.value).toBe(before + 1);
    expect(annotation(store, id)?.parentRole).toBe('hold');
    store.undo();
    expect(annotation(store, id)?.parentRole).toBe('click');
    expect(actions.setAnnotationRole(id, 'no')).toEqual({
      ok: false,
      error: 'unknown-role',
    });
  });

  it('changing the owner to one that offers the role keeps it, in one entry', () => {
    const { store, actions, id } = withChild();
    const before = store.revision.value;
    expect(actions.setAnnotationParent(id, 'A2').ok).toBe(true);
    expect(store.revision.value).toBe(before + 1);
    expect(annotation(store, id)).toMatchObject({
      parentAnnotationId: 'A2',
      parentRole: 'click',
    });
  });

  it('removing the owner clears the role in the same entry, and undo restores both', () => {
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

describe('store: localPath of docRepos', () => {
  it('saving and removing enter undo; repeating the value creates no entry', () => {
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

  it('model errors come back as ActionResult', () => {
    const { store, actions } = setup(withDocRepo);
    expect(actions.setDocRepo('other', '../x')).toEqual({
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

import { describe, expect, it } from 'vitest';
import { effectiveDirection } from '../../src/model';
import { createProjectStore } from '../../src/store/history';
import { createProjectActions } from '../../src/store/project';
import { NOW, sampleProject } from '../model/fixtures';

// Direção de leitura (schema v20): passa por actions do store, uma entrada de desfazer cada.

function setup() {
  const store = createProjectStore({ now: () => NOW });
  const actions = createProjectActions(store, { newId: () => 'id' });
  store.load(sampleProject());
  const project = () => {
    if (!store.project.value) throw new Error('sem projeto');
    return store.project.value;
  };
  return { store, actions, project };
}

describe('actions da direção de leitura', () => {
  it('setProjectDirection grava, desfaz com uma entrada e remove com null', () => {
    const { store, actions, project } = setup();
    expect(project().direction).toBeUndefined();
    expect(actions.setProjectDirection('rtl').ok).toBe(true);
    expect(project().direction).toBe('rtl');
    expect(actions.setProjectDirection('ltr').ok).toBe(true);
    expect(store.undo()).toBe(true);
    expect(project().direction).toBe('rtl');
    expect(store.undo()).toBe(true);
    expect(project().direction).toBeUndefined();
    expect(store.canUndo.value).toBe(false);
    actions.setProjectDirection('rtl');
    actions.setProjectDirection(null);
    expect(project().direction).toBeUndefined();
  });

  it('setContainerDirection fixa, volta a seguir o projeto com null e desfaz', () => {
    const { store, actions, project } = setup();
    const id = project().containers[0]?.id ?? '';
    expect(actions.setContainerDirection(id, 'rtl').ok).toBe(true);
    expect(project().containers[0]?.direction).toBe('rtl');
    expect(effectiveDirection(project(), id)).toBe('rtl');
    expect(actions.setContainerDirection(id, null).ok).toBe(true);
    expect(project().containers[0]?.direction).toBeNull();
    expect(store.undo()).toBe(true);
    expect(project().containers[0]?.direction).toBe('rtl');
    expect(store.undo()).toBe(true);
    expect(project().containers[0]?.direction).toBeUndefined();
  });

  it('o que não muda nada não abre entrada de desfazer', () => {
    const { store, actions, project } = setup();
    const id = project().containers[0]?.id ?? '';
    actions.setProjectDirection(null);
    actions.setContainerDirection(id, null);
    expect(store.canUndo.value).toBe(false);
  });

  it('container inexistente devolve erro, sem mudar o projeto', () => {
    const { actions, project } = setup();
    const before = project();
    expect(actions.setContainerDirection('nada', 'rtl').ok).toBe(false);
    expect(project()).toBe(before);
  });
});

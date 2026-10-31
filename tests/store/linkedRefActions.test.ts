// Ações em lote do `linkedRef` (SG2): o texto e o `ref` entram numa única entrada do desfazer.
import { describe, expect, it } from 'vitest';
import { createProjectStore } from '../../src/store/history';
import { createProjectActions } from '../../src/store/project';
import { build, cell, R1 } from '../model/refColumnFixtures';

function setup() {
  const store = createProjectStore({ now: () => '2026-10-01T00:00:00.000Z' });
  const actions = createProjectActions(store, { newId: () => 'x' });
  store.load(build());
  return { store, actions };
}

const values = (store: ReturnType<typeof setup>['store']) =>
  store.project.value?.annotations.find((a) => a.id === 'AL')?.values;

describe('store: setFieldValues / setTableCells', () => {
  it('setFieldValues grava texto e ref numa entrada; um undo volta os dois', () => {
    const { store, actions } = setup();
    expect(actions.setFieldValues('AL', { titulo: 'Cliente', principal: R1 }).ok).toBe(
      true,
    );
    expect(values(store)).toMatchObject({ titulo: 'Cliente', principal: R1 });
    expect(store.undo()).toBe(true);
    expect(values(store)?.titulo ?? null).toBeNull();
    expect(values(store)?.principal ?? null).toBeNull();
  });

  it('setTableCells grava texto e ref da linha numa entrada', () => {
    const { store, actions } = setup();
    expect(actions.setTableCells('AL', 'alvos', 'L1', { nota: 'cpf', alvo: R1 }).ok).toBe(
      true,
    );
    const p = store.project.value!;
    expect(cell(p)).toEqual(R1);
    expect(store.undo()).toBe(true);
    expect(cell(store.project.value!) ?? null).toBeNull();
    expect(store.canUndo.value).toBe(false); // era a única entrada
  });

  it('falha atômica: nada muda e não abre entrada de desfazer', () => {
    const { store, actions } = setup();
    const before = store.project.value;
    const result = actions.setFieldValues('AL', { titulo: 'x', nada: 'y' });
    expect(result.ok).toBe(false);
    expect(store.project.value).toBe(before);
  });
});

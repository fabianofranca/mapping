import { effect, signal } from '@preact/signals';
import { describe, expect, it } from 'vitest';
import {
  addBackgroundContainer,
  applySpecialization,
  type ComponentCatalog,
  type Project,
  type Spec,
} from '../../src/model';
import { createEditorDerived } from '../../src/store/derived';
import { createProjectStore } from '../../src/store/history';
import { createProjectActions } from '../../src/store/project';
import { createEditorUi } from '../../src/store/ui';
import { NOW, emptyProject, sampleProject } from '../model/fixtures';

// D2: a densidade passa por uma action do store (uma entrada de desfazer) e a sugestão sai do
// derivado, calculada só do projeto: pan e zoom (que moram no canvas) não a recalculam.

const SPEC: Spec = {
  format: 'mapping-spec',
  formatVersion: 6,
  id: 'ds',
  name: 'Design System',
  version: 1,
  containers: [{ id: 'phone', name: 'Celular', width: 360, height: 800 }],
  layers: [],
};

function setup(project: Project = sampleProject()) {
  const store = createProjectStore({ now: () => NOW });
  const actions = createProjectActions(store, { newId: () => 'id' });
  store.load(project);
  const current = () => {
    if (!store.project.value) throw new Error('sem projeto');
    return store.project.value;
  };
  return { store, actions, current };
}

describe('action setContainerDensity', () => {
  it('grava, desfaz numa entrada e volta a 1 com null (remove a chave)', () => {
    const { store, actions, current } = setup();
    const id = current().containers[0]?.id ?? '';
    expect(actions.setContainerDensity(id, 3).ok).toBe(true);
    expect(current().containers[0]?.density).toBe(3);
    expect(actions.setContainerDensity(id, 2.625).ok).toBe(true);
    expect(store.undo()).toBe(true);
    expect(current().containers[0]?.density).toBe(3);
    expect(store.undo()).toBe(true);
    expect('density' in (current().containers[0] ?? {})).toBe(false);
    expect(store.canUndo.value).toBe(false);
    actions.setContainerDensity(id, 3);
    actions.setContainerDensity(id, null);
    expect('density' in (current().containers[0] ?? {})).toBe(false);
  });

  it('fora de 0,5 a 8 e container inexistente devolvem erro, sem mudar o projeto', () => {
    const { actions, current } = setup();
    const before = current();
    const id = before.containers[0]?.id ?? '';
    for (const bad of [0.2, 9, Number.NaN]) {
      expect(actions.setContainerDensity(id, bad).ok, String(bad)).toBe(false);
    }
    expect(actions.setContainerDensity('nada', 2).ok).toBe(false);
    expect(current()).toBe(before);
  });

  it('addBackgroundContainer com density grava a densidade numa só entrada; 1 não grava a chave', () => {
    const { store, actions, current } = setup();
    const args = {
      name: 'Tela',
      width: 1080,
      height: 2400,
      background: '#FFFFFF',
    };
    const created = actions.addBackgroundContainer({ ...args, density: 3 });
    expect(created.ok).toBe(true);
    const id = created.ok ? created.value : '';
    expect(current().containers.find((c) => c.id === id)?.density).toBe(3);
    expect(store.undo()).toBe(true);
    expect(current().containers.some((c) => c.id === id)).toBe(false);

    const plain = actions.addBackgroundContainer({ ...args, density: 1 });
    const plainId = plain.ok ? plain.value : '';
    expect('density' in (current().containers.find((c) => c.id === plainId) ?? {})).toBe(
      false,
    );
    expect(actions.addBackgroundContainer({ ...args, density: 12 }).ok).toBe(false);
  });
});

describe('derivado densitySuggestions', () => {
  function derivedOf(project: Project) {
    const { store, actions, current } = setup(project);
    const sources = {
      catalog: signal<ComponentCatalog>(new Map()),
      fontsEpoch: signal(0),
    };
    const derived = createEditorDerived(store, createEditorUi(), undefined, sources);
    return { store, actions, current, derived };
  }
  const screen = (width: number, height: number, specs = true): Project => {
    const p = addBackgroundContainer(emptyProject(), {
      id: 'C1',
      width,
      height,
      background: '#FFFFFF',
    });
    return specs ? applySpecialization(p, SPEC) : p;
  };

  it('sugere por container pelos tamanhos prontos; sem especialização, nada', () => {
    const { derived } = derivedOf(screen(1080, 2400));
    expect(derived.densitySuggestions.value.get('C1')).toMatchObject({
      density: 3,
      preset: { name: 'Celular', width: 360, height: 800 },
    });
    expect(
      derivedOf(screen(1080, 2400, false)).derived.densitySuggestions.value.size,
    ).toBe(0);
    expect(derivedOf(screen(360, 800)).derived.densitySuggestions.value.size).toBe(0);
  });

  it('só se recalcula quando mudam os containers ou as especializações, não a cada edição', () => {
    const { derived, actions } = derivedOf(screen(1080, 2400));
    let runs = 0;
    const stop = effect(() => {
      void derived.densitySuggestions.value;
      runs += 1;
    });
    expect(runs).toBe(1);
    // Edições que não mexem no tamanho do container (e o pan e o zoom, que moram no canvas e
    // nem passam pelo store) não disparam quem lê a sugestão.
    actions.setContainerMarkingColor('C1', '#112233');
    actions.setContainerDensity('C1', 3);
    expect(runs).toBe(1);
    // Mudar a largura muda a sugestão.
    actions.setBackgroundContainer('C1', { width: 720 });
    expect(runs).toBe(2);
    expect(derived.densitySuggestions.value.get('C1')?.density).toBe(2);
    stop();
  });
});

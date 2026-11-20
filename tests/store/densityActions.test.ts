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

// D2: the density goes through a store action (one undo entry) and the suggestion comes from the
// derived, computed only from the project: pan and zoom (which live on the canvas) do not recompute it.

const SPEC: Spec = {
  format: 'mapping-spec',
  formatVersion: 6,
  id: 'ds',
  name: 'Design System',
  version: 1,
  containers: [{ id: 'phone', name: 'Phone', width: 360, height: 800 }],
  layers: [],
};

function setup(project: Project = sampleProject()) {
  const store = createProjectStore({ now: () => NOW });
  const actions = createProjectActions(store, { newId: () => 'id' });
  store.load(project);
  const current = () => {
    if (!store.project.value) throw new Error('no project');
    return store.project.value;
  };
  return { store, actions, current };
}

describe('action setContainerDensity', () => {
  it('saves, undoes in one entry and goes back to 1 with null (removes the key)', () => {
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

  it('outside 0.5 to 8 and a nonexistent container return an error, without changing the project', () => {
    const { actions, current } = setup();
    const before = current();
    const id = before.containers[0]?.id ?? '';
    for (const bad of [0.2, 9, Number.NaN]) {
      expect(actions.setContainerDensity(id, bad).ok, String(bad)).toBe(false);
    }
    expect(actions.setContainerDensity('missing', 2).ok).toBe(false);
    expect(current()).toBe(before);
  });

  it('addBackgroundContainer with density saves the density in a single entry; 1 does not save the key', () => {
    const { store, actions, current } = setup();
    const args = {
      name: 'Screen',
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

describe('action replaceContainer: the density follows the width (stage #1891)', () => {
  it('replacing the file with another resolution changes the density, and one Ctrl+Z restores file, markings and density', () => {
    const { store, actions, current } = setup();
    const id = 'I2';
    expect(actions.setContainerDensity(id, 3).ok).toBe(true);
    const before = current();
    const result = actions.replaceContainer(id, {
      file: 'images/frente-2x.jpg',
      width: 2000,
      height: 2000,
    });
    expect(result.ok).toBe(true);
    const after = current().containers.find((c) => c.id === id);
    expect(after?.density).toBe(6);
    expect(after?.file).toBe('images/frente-2x.jpg');
    expect(current().markings.find((m) => m.id === 'M4')?.rect.width).toBe(200);
    expect(store.undo()).toBe(true);
    expect(current()).toEqual(before);
    expect(current().containers.find((c) => c.id === id)?.density).toBe(3);
    expect(current().containers.find((c) => c.id === id)?.file).toBe('images/frente.jpg');
    expect(current().markings.find((m) => m.id === 'M4')?.rect.width).toBe(100);
  });

  it('a smaller resolution lowers the density and rescales a plain marking', () => {
    const { actions, current } = setup();
    expect(actions.setContainerDensity('I2', 4).ok).toBe(true);
    expect(
      actions.replaceContainer('I2', { file: 'images/f.jpg', width: 500, height: 500 })
        .ok,
    ).toBe(true);
    const container = current().containers.find((c) => c.id === 'I2');
    expect(container?.density).toBe(2);
    expect(current().markings.find((m) => m.id === 'M4')?.rect.width).toBe(50);
  });
});

describe('derived densitySuggestions', () => {
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

  it('suggests per container from the ready sizes; without a specialization, nothing', () => {
    const { derived } = derivedOf(screen(1080, 2400));
    expect(derived.densitySuggestions.value.get('C1')).toMatchObject({
      density: 3,
      preset: { name: 'Phone', width: 360, height: 800 },
    });
    expect(
      derivedOf(screen(1080, 2400, false)).derived.densitySuggestions.value.size,
    ).toBe(0);
    expect(derivedOf(screen(360, 800)).derived.densitySuggestions.value.size).toBe(0);
  });

  it('only recomputes when the containers or the specializations change, not on every edit', () => {
    const { derived, actions } = derivedOf(screen(1080, 2400));
    let runs = 0;
    const stop = effect(() => {
      void derived.densitySuggestions.value;
      runs += 1;
    });
    expect(runs).toBe(1);
    // Edits that do not touch the container size (and pan and zoom, which live on the canvas and
    // do not even go through the store) do not trigger whoever reads the suggestion.
    actions.setContainerMarkingColor('C1', '#112233');
    actions.setContainerDensity('C1', 3);
    expect(runs).toBe(1);
    // Changing the width changes the suggestion.
    actions.setBackgroundContainer('C1', { width: 720 });
    expect(runs).toBe(2);
    expect(derived.densitySuggestions.value.get('C1')?.density).toBe(2);
    stop();
  });

  it('the same table (identity) comes back while the suggestions do not change', () => {
    const { derived, actions } = derivedOf(screen(1080, 2400));
    const before = derived.densitySuggestions.value;
    actions.setContainerMarkingColor('C1', '#112233');
    expect(derived.densitySuggestions.value).toBe(before);
    actions.setContainerMarkingColor('C1', '#445566');
    expect(derived.densitySuggestions.value).toBe(before);
  });
});

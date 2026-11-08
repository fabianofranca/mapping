import { describe, expect, it } from 'vitest';
import { createProjectStore } from '../../src/store/history';
import { createProjectActions } from '../../src/store/project';
import { sampleProject } from '../model/fixtures';

// Gesto de mover um container sozinho na Principal: a posição vem do viewport (divisão pelo
// zoom) e pode trazer ruído de ponto flutuante, que não pode chegar ao `placement` gravado.
const NOISY = 275.00000000000006;

describe('store: gesto de container sem ruído no placement', () => {
  it('a prévia e o fim do gesto gravam o inteiro', () => {
    const store = createProjectStore();
    const actions = createProjectActions(store);
    store.load(sampleProject());
    const placementOf = () =>
      store.project.value!.containers.find((c) => c.id === 'I2')!.placement;
    expect(actions.beginGesture().ok).toBe(true);
    expect(
      actions.previewImagePlacement('I2', { x: NOISY, y: 3000.0000000000005, scale: 1 })
        .ok,
    ).toBe(true);
    expect(placementOf()).toEqual({ x: 275, y: 3000, scale: 1 });
    expect(actions.finishImagePlacement('I2').ok).toBe(true);
    actions.commitGesture();
    expect(placementOf()).toEqual({ x: 275, y: 3000, scale: 1 });
  });

  it('a ação setContainerPlacement também grava o inteiro', () => {
    const store = createProjectStore();
    const actions = createProjectActions(store);
    store.load(sampleProject());
    expect(actions.setContainerPlacement('I2', { x: NOISY, y: 3000, scale: 1 }).ok).toBe(
      true,
    );
    expect(store.project.value!.containers.find((c) => c.id === 'I2')!.placement.x).toBe(
      275,
    );
  });
});

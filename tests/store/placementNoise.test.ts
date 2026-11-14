import { describe, expect, it } from 'vitest';
import { createProjectStore } from '../../src/store/history';
import { createProjectActions } from '../../src/store/project';
import { sampleProject } from '../model/fixtures';

// Gesture of moving a container alone on the Main one: the position comes from the viewport (division by the
// zoom) and may carry floating-point noise, which must not reach the saved `placement`.
const NOISY = 275.00000000000006;

describe('store: container gesture without noise in the placement', () => {
  it('the preview and the end of the gesture write the integer', () => {
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

  it('the setContainerPlacement action also writes the integer', () => {
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

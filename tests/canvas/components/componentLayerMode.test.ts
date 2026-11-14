// CF6: changing the drawing mode through the store redoes the layer drawing, without reloading the project.
import Konva from 'konva';
import { beforeAll, describe, expect, it } from 'vitest';
import { ComponentLayerRenderer } from '../../../src/canvas/components/componentLayer';
import type { Placement } from '../../../src/model';
import { componentEditor, installFakeCanvas } from '../harness';

beforeAll(() => installFakeCanvas());

const PLACEMENTS: ReadonlyMap<string, Placement> = new Map([
  ['B1', { x: 0, y: 0, scale: 1 }],
]);
const all = () => true;

describe('component layer: drawing mode', () => {
  it('changing the project mode redoes the drawing; the container one redoes only its own', () => {
    const { store, actions, derived } = componentEditor();
    const loaded = store.project.value;
    const parent = new Konva.Group();
    const layer = new ComponentLayerRenderer(parent);
    const nodeOf = (id: string) =>
      parent.find((n: Konva.Node) => n.getAttr('markingId') === id)[0];

    const first = derived.componentScenes.value;
    expect(layer.render(first, all, PLACEMENTS)).toBe(true);
    const t1 = nodeOf('T1');
    expect(t1).toBeDefined();
    expect(layer.render(first, all, PLACEMENTS)).toBe(false);

    expect(actions.setProjectDrawingMode('dark').ok).toBe(true);
    const dark = derived.componentScenes.value;
    expect(dark.get('T1')).not.toBe(first.get('T1'));
    expect(layer.render(dark, all, PLACEMENTS)).toBe(true);
    expect(nodeOf('T1')).not.toBe(t1);
    // The project was not reloaded: it stays the same, only with the new mode.
    expect(store.project.value?.containers).toBe(loaded?.containers);

    expect(actions.setContainerDrawingMode('B1', 'light').ok).toBe(true);
    const fixed = derived.componentScenes.value;
    expect(fixed.get('T1')).not.toBe(dark.get('T1'));
    expect(fixed.get('TP')).toBe(dark.get('TP'));
    expect(layer.render(fixed, all, PLACEMENTS)).toBe(true);
  });
});

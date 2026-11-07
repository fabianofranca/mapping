// CF6: trocar o modo do desenho pelo store refaz o desenho da camada, sem recarregar o projeto.
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

describe('camada de componentes: modo do desenho', () => {
  it('trocar o modo do projeto refaz o desenho; o do container refaz só o dele', () => {
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
    // O projeto não foi recarregado: segue o mesmo, só com o modo novo.
    expect(store.project.value?.containers).toBe(loaded?.containers);

    expect(actions.setContainerDrawingMode('B1', 'light').ok).toBe(true);
    const fixed = derived.componentScenes.value;
    expect(fixed.get('T1')).not.toBe(dark.get('T1'));
    expect(fixed.get('TP')).toBe(dark.get('TP'));
    expect(layer.render(fixed, all, PLACEMENTS)).toBe(true);
  });
});

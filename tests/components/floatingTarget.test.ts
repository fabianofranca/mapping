import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { locale } from '../../src/store/settings';
import { componentDropTarget, componentTarget } from '../../src/ui/componentTarget';
import { notesHarness } from './notesHarness';

// ME3: o alvo do Adicionar e do soltar para um tipo flutuante é sempre o canvas.

beforeEach(() => {
  locale.value = 'pt-BR';
});
afterEach(() => {
  locale.value = 'pt-BR';
});

function typeOf(harness: Awaited<ReturnType<typeof notesHarness>>, typeId: string) {
  const type = harness.context.derived.componentTypes.value.find(
    (c) => c.typeId === typeId,
  );
  if (!type) throw new Error(`tipo ${typeId} não existe`);
  return type;
}

describe('componentTarget: tipo flutuante', () => {
  it('expõe o tipo nota como flutuante e o botão como comum', async () => {
    const h = await notesHarness();
    expect(typeOf(h, 'nota').floating).toBe(true);
    expect(typeOf(h, 'm3-button').floating).toBe(false);
  });

  it('sem seleção, com o centro da vista sobre um container: canvas, no centro da vista', async () => {
    const h = await notesHarness();
    h.ui.selection.value = null;
    const point = h.canvas.viewportCenter() as { x: number; y: number };
    const target = componentTarget(h.context, { floating: true });
    expect(target).toMatchObject({
      containerId: null,
      parentId: null,
      destination: { kind: 'canvas' },
      center: { x: Math.round(point.x), y: Math.round(point.y) },
    });
  });

  it('seleção num container: continua o canvas', async () => {
    const h = await notesHarness();
    h.ui.selection.value = { kind: 'image', id: 'I2' };
    const target = componentTarget(h.context, { floating: true });
    expect(target?.containerId).toBeNull();
    expect(target?.destination.kind).toBe('canvas');
    // O tipo comum, com a mesma seleção, vai para o container (regressão).
    const common = componentTarget(h.context);
    expect(common?.containerId).toBe('I2');
    expect(common?.destination.kind).toBe('container');
  });

  it('seleção numa marcação de container e numa marcação com slot: canvas; o tipo comum entra no slot', async () => {
    const h = await notesHarness();
    // Uma coluna (Material 3) tem slot.
    const column = h.actions.addComponent({
      containerId: 'I1',
      parentId: null,
      specId: 'material3',
      typeId: 'm3-column',
    });
    if (!column.ok) throw new Error('addComponent');
    h.ui.selection.value = { kind: 'marking', id: column.value };

    const floating = componentTarget(h.context, { floating: true });
    expect(floating).toMatchObject({
      containerId: null,
      parentId: null,
      destination: { kind: 'canvas' },
    });
    const common = componentTarget(h.context);
    expect(common).toMatchObject({
      parentId: column.value,
      destination: { kind: 'slot' },
    });

    // Marcação comum de container (sem componente): ainda o canvas para o flutuante.
    const plain = h.actions.createMarking('I1', {
      x: 10,
      y: 10,
      width: 100,
      height: 100,
    });
    if (!plain.ok) throw new Error('createMarking');
    h.ui.selection.value = { kind: 'marking', id: plain.value };
    expect(componentTarget(h.context, { floating: true })?.containerId).toBeNull();
    expect(componentTarget(h.context)?.containerId).toBe('I1');
  });
});

describe('componentDropTarget: tipo flutuante', () => {
  it('solto sobre um container cai no canvas, sem encaixe; o tipo comum entra no container', async () => {
    const h = await notesHarness();
    const project = h.project();
    const image = project.containers.find((c) => c.id === 'I1');
    if (!image) throw new Error('I1');
    const point = { x: image.placement.x + 200, y: image.placement.y + 150 };
    const input = {
      project,
      catalog: h.context.derived.catalog.value,
      visibility: h.context.derived.markingVisibility.value,
      point,
      zoom: 1,
    };

    const floating = componentDropTarget({ ...input, type: typeOf(h, 'nota') });
    expect(floating).toEqual({
      containerId: null,
      parentId: null,
      center: point,
      highlight: { containerId: null },
    });

    const common = componentDropTarget({ ...input, type: typeOf(h, 'm3-button') });
    expect(common.containerId).toBe('I1');
    expect(common.highlight).toEqual({ containerId: 'I1' });
  });
});

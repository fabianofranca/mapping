import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { locale } from '../../src/store/settings';
import { componentDropTarget, componentTarget } from '../../src/ui/componentTarget';
import { notesHarness } from './notesHarness';

// ME3: the target of Add and of drop for a floating type is always the canvas.
// pt-BR kept: bundled notes library type id 'nota' (shared fixture data asserted by tests/model, tests/ui)

beforeEach(() => {
  locale.value = 'en-US';
});
afterEach(() => {
  locale.value = 'en-US';
});

function typeOf(harness: Awaited<ReturnType<typeof notesHarness>>, typeId: string) {
  const type = harness.context.derived.componentTypes.value.find(
    (c) => c.typeId === typeId,
  );
  if (!type) throw new Error(`type ${typeId} does not exist`);
  return type;
}

describe('componentTarget: floating type', () => {
  it('exposes the note type as floating and the button as common', async () => {
    const h = await notesHarness();
    expect(typeOf(h, 'nota').floating).toBe(true);
    expect(typeOf(h, 'm3-button').floating).toBe(false);
  });

  it('no selection, with the view center over a container: canvas, at the view center', async () => {
    const h = await notesHarness();
    h.ui.selection.value = null;
    const image = h.project().containers[0];
    const point = {
      x: (image?.placement.x ?? 0) + 200,
      y: (image?.placement.y ?? 0) + 150,
    };
    const target = componentTarget(h.context, { floating: true });
    expect(target).toMatchObject({
      containerId: null,
      parentId: null,
      destination: { kind: 'canvas' },
      center: { x: Math.round(point.x), y: Math.round(point.y) },
    });
  });

  it('selection on a container: still the canvas', async () => {
    const h = await notesHarness();
    h.ui.selection.value = { kind: 'image', id: 'I2' };
    const target = componentTarget(h.context, { floating: true });
    expect(target?.containerId).toBeNull();
    expect(target?.destination.kind).toBe('canvas');
    // The common type, with the same selection, goes to the container (regression).
    const common = componentTarget(h.context);
    expect(common?.containerId).toBe('I2');
    expect(common?.destination.kind).toBe('container');
  });

  it('selection on a container marking and on a marking with a slot: canvas; the common type goes into the slot', async () => {
    const h = await notesHarness();
    // A column (Material 3) has a slot.
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

    // Plain container marking (no component): still the canvas for the floating one.
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

describe('componentDropTarget: floating type', () => {
  it('dropped over a container lands on the canvas, without snapping; the common type goes into the container', async () => {
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

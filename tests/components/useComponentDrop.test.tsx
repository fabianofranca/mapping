import { cleanup, render } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { COMPONENT_DRAG_MIME, setDraggedComponent } from '../../src/app/componentDrag';
import { useComponentDrop, type ComponentDrop } from '../../src/app/useComponentDrop';
import { locale } from '../../src/store/settings';
import { EditorContext } from '../../src/ui/EditorContext';
import { libraryHarness } from './libraryHarness';

// ME2: dropping on the canvas a type dragged from the palette.

beforeEach(() => {
  locale.value = 'en-US';
  setDraggedComponent({ specId: 'material3', typeId: 'm3-button' });
});
afterEach(() => {
  cleanup();
  setDraggedComponent(null);
});

function event(type: string, point = { x: 0, y: 0 }): DragEvent {
  const e = new Event(type, { cancelable: true }) as DragEvent;
  Object.defineProperty(e, 'dataTransfer', {
    value: { types: [COMPONENT_DRAG_MIME], dropEffect: 'none' },
  });
  Object.defineProperty(e, 'clientX', { value: point.x });
  Object.defineProperty(e, 'clientY', { value: point.y });
  return e;
}

async function setup(options: { readOnly?: boolean } = {}) {
  const harness = await libraryHarness(options);
  const setDropTarget = vi.fn();
  const canvasPointAt = vi.fn((x: number, y: number) => ({ x, y }));
  Object.assign(harness.canvas, { setDropTarget, canvasPointAt });
  let drop: ComponentDrop | undefined;
  const setMessage = vi.fn();
  const Probe = () => {
    drop = useComponentDrop({ setMessage });
    return null;
  };
  render(
    <EditorContext.Provider value={harness.context}>
      <Probe />
    </EditorContext.Provider>,
  );
  const handlers = () => {
    if (!drop) throw new Error('hook did not mount');
    return drop;
  };
  return { harness, setDropTarget, canvasPointAt, handlers, setMessage };
}

describe('dropping a palette type on the canvas', () => {
  it('over the container: creates in it, centered on the pointer, and selects', async () => {
    const s = await setup();
    const image = s.harness.project().containers[0];
    const point = {
      x: (image?.placement.x ?? 0) + 200,
      y: (image?.placement.y ?? 0) + 150,
    };
    const before = s.harness.project().markings.length;
    const over = event('dragover', point);
    s.handlers().onDragOver(over);
    expect(over.defaultPrevented).toBe(true);
    expect(s.setDropTarget).toHaveBeenLastCalledWith({ containerId: 'I1' });

    s.handlers().onDrop(event('drop', point));
    const project = s.harness.project();
    expect(project.markings).toHaveLength(before + 1);
    const created = project.markings.at(-1);
    expect(created?.containerId).toBe('I1');
    expect(s.setDropTarget).toHaveBeenLastCalledWith(null);
    expect(s.harness.ui.selection.value).toEqual({ kind: 'marking', id: created?.id });
  });

  it('in the empty space far from everything: canvas marking', async () => {
    const s = await setup();
    s.handlers().onDrop(event('drop', { x: -5000, y: -5000 }));
    const created = s.harness.project().markings.at(-1);
    expect(created?.containerId).toBeNull();
    expect(s.harness.ui.selection.value).toEqual({ kind: 'marking', id: created?.id });
  });

  it('over a component with a slot: goes into the slot and lights up the marking', async () => {
    const s = await setup();
    setDraggedComponent({ specId: 'material3', typeId: 'm3-column' });
    const image = s.harness.project().containers[0];
    const point = {
      x: (image?.placement.x ?? 0) + 200,
      y: (image?.placement.y ?? 0) + 150,
    };
    s.handlers().onDrop(event('drop', point));
    const column = s.harness.project().markings.at(-1);
    expect(column).toBeDefined();
    const rect = column?.rect;
    const scale = image?.placement.scale ?? 1;
    const inside = {
      x: (image?.placement.x ?? 0) + ((rect?.x ?? 0) + (rect?.width ?? 0) / 2) * scale,
      y: (image?.placement.y ?? 0) + ((rect?.y ?? 0) + (rect?.height ?? 0) / 2) * scale,
    };

    setDraggedComponent({ specId: 'material3', typeId: 'm3-button' });
    s.handlers().onDragOver(event('dragover', inside));
    expect(s.setDropTarget).toHaveBeenLastCalledWith({
      containerId: column?.containerId,
      markingId: column?.id,
    });
    s.handlers().onDrop(event('drop', inside));
    expect(s.harness.project().markings.at(-1)?.parentId).toBe(column?.id);
  });

  it('read-only: does not accept', async () => {
    const s = await setup({ readOnly: true });
    const before = s.harness.project().markings.length;
    const over = event('dragover');
    s.handlers().onDragOver(over);
    expect(over.defaultPrevented).toBe(false);
    s.handlers().onDrop(event('drop'));
    expect(s.harness.project().markings).toHaveLength(before);
  });

  it('drag without the component MIME is ignored', async () => {
    const s = await setup();
    const e = new Event('dragover', { cancelable: true }) as DragEvent;
    Object.defineProperty(e, 'dataTransfer', { value: { types: ['Files'] } });
    s.handlers().onDragOver(e);
    expect(e.defaultPrevented).toBe(false);
    expect(s.setDropTarget).not.toHaveBeenCalled();
  });
});

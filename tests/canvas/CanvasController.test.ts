import type Konva from 'konva';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { CanvasController } from '../../src/canvas/CanvasController';
import { createDisplayImages } from '../../src/store/displayImages';
import type { InteractionState } from '../../src/canvas/frame';
import type { OverlayRenderer } from '../../src/canvas/renderers/overlay';
import { selectItems, type SelectionItem } from '../../src/store/ui';
import { editorFor, installFakeCanvas, setOnlyScreens } from './harness';

describe('CanvasController', () => {
  const frames: FrameRequestCallback[] = [];
  const flush = () => {
    while (frames.length > 0) for (const frame of frames.splice(0)) frame(0);
  };

  beforeAll(() => {
    installFakeCanvas();
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      frames.push(cb);
      return frames.length;
    });
    vi.stubGlobal('cancelAnimationFrame', () => undefined);
  });
  afterAll(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function setup() {
    const editor = editorFor();
    const ensure = vi.fn();
    const retain = vi.fn();
    const display = {
      ...createDisplayImages<ImageBitmap>(() => new Promise(() => undefined)),
      ensure,
      retain,
    };
    const container = document.createElement('div');
    Object.defineProperty(container, 'clientWidth', { value: 380 });
    Object.defineProperty(container, 'clientHeight', { value: 700 });
    document.body.append(container);
    const controller = new CanvasController({ container, display, ...editor });
    return { ...editor, container, controller, ensure, retain };
  }

  it('mounts the stage with at most five layers (Konva warns in the console from six) and asks for the image bitmaps', () => {
    const { container, controller, ensure } = setup();
    flush();
    const canvases = container.querySelectorAll('canvas');
    expect(canvases.length).toBeLessThanOrEqual(5);
    expect(ensure.mock.calls.map(([file]) => file)).toEqual([
      'images/a.jpg',
      'images/b.jpg',
    ]);
    controller.destroy();
    expect(container.querySelectorAll('canvas')).toHaveLength(0);
  });

  it('a drag gesture calls neither ensure nor retain: the set of files did not change', () => {
    const { controller, ensure, retain, store } = setup();
    flush();
    expect(ensure).toHaveBeenCalled();
    ensure.mockClear();
    retain.mockClear();
    expect(store.beginGesture().ok).toBe(true);
    const image = store.project.peek()?.containers[0];
    expect(image).toBeDefined();
    for (let step = 1; step <= 3; step++) {
      store.updateGesture((p) => ({
        ...p,
        containers: p.containers.map((c) =>
          c.id === image!.id
            ? { ...c, placement: { ...c.placement, x: c.placement.x + 10 * step } }
            : c,
        ),
      }));
      flush();
    }
    store.cancelGesture();
    flush();
    expect(ensure).not.toHaveBeenCalled();
    expect(retain).not.toHaveBeenCalled();
    controller.destroy();
  });

  it('the drawing order stays the same: images, components, arrows, markings, floating, overlays', () => {
    const { controller } = setup();
    flush();
    const inner = controller as unknown as {
      stage: Konva.Stage;
      componentGroup: Konva.Layer;
      arrows: { node: Konva.Shape };
      markings: { nodes: Map<string, { group: Konva.Group }> };
      floatingDrawings: Konva.Group;
      overlay: OverlayRenderer;
    };
    // Order in which Konva paints the nodes: layer by layer, each child after the previous one.
    const painted: Konva.Node[] = [];
    const walk = (node: Konva.Node): void => {
      painted.push(node);
      if ('getChildren' in node) {
        for (const child of (node as Konva.Container).getChildren()) walk(child);
      }
    };
    walk(inner.stage);
    const at = (node: Konva.Node): number => {
      const index = painted.indexOf(node);
      expect(index, 'node outside the stage').toBeGreaterThanOrEqual(0);
      return index;
    };
    const marking = [...inner.markings.nodes.values()][0]?.group;
    expect(marking, 'the test project has markings').toBeDefined();
    const order = [
      inner.componentGroup,
      inner.arrows.node,
      marking!,
      inner.floatingDrawings,
      inner.overlay.selectionOutline,
    ].map(at);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(new Set(order).size).toBe(order.length);
  });

  it('the stage rebuilds the transform cache once per zoom and pan frame, and none on edit', () => {
    const { controller, container, ui, actions } = setup();
    flush();
    const { stage } = controller as unknown as { stage: Konva.Stage };
    let cascades = 0;
    stage.on('absoluteTransformChange', () => cascades++);
    /** Absolute transform events of the stage in the frame that `act` schedules. */
    const count = (act: () => void): number => {
      cascades = 0;
      act();
      flush();
      return cascades;
    };
    const zoom = count(() =>
      container.dispatchEvent(
        new WheelEvent('wheel', { deltaY: -40, clientX: 190, clientY: 350 }),
      ),
    );
    const pan = count(() => {
      ui.selection.value = { kind: 'image', id: 'I2' };
      controller.centerSelection();
    });
    const edit = count(() => {
      expect(actions.renameContainer('I1', 'Another name').ok).toBe(true);
    });
    // Position and scale in a single call: each separate attribute rebuilds the transform cache
    // of every node of the stage (docs/ARCHITECTURE.md, "Desempenho").
    expect({ zoom, pan, edit }).toEqual({ zoom: 1, pan: 1, edit: 0 });
    controller.destroy();
  });

  it('editor commands: fit, center, point and image under the finger', () => {
    const { controller, ui } = setup();
    controller.fitAll();
    const center = controller.viewportCenter();
    expect(center.x).toBeCloseTo(800);
    expect(center.y).toBeCloseTo(400);
    ui.selection.value = { kind: 'image', id: 'I2' };
    controller.centerSelection();
    expect(controller.viewportCenter().x).toBeCloseTo(1350);
    expect(controller.imageIdAt(190, 350)).toBe('I2');
    const p = controller.canvasPointAt(190, 350);
    expect(p.x).toBeCloseTo(1350);
    controller.destroy();
  });

  it('multiple selection: secondary outline on the non-primary ones, empty in view mode, and the pan does not rebuild the list', () => {
    const { controller, ui } = setup();
    const internals = controller as unknown as {
      overlay: OverlayRenderer;
      frame: { peek(): { items: readonly SelectionItem[] } };
    };
    const lit = () =>
      internals.overlay
        .secondaryHighlights()
        .filter((r) => r.visible())
        .map((r) => r.getAttrs());
    flush();
    expect(lit()).toHaveLength(0);

    selectItems(ui, [
      { kind: 'image', id: 'I2' },
      { kind: 'marking', id: 'M3' },
      { kind: 'marking', id: 'M2' },
    ]);
    flush();
    expect(lit()).toHaveLength(2);
    const items = internals.frame.peek().items;
    expect(items.map((i) => i.id)).toEqual(['I2', 'M3', 'M2']);

    // Pan and zoom redraw the frame, but the item list is the same object.
    controller.zoomBy(1.5);
    flush();
    expect(internals.frame.peek().items).toBe(items);

    // view mode hides the whole selection, as it hides the primary one.
    setOnlyScreens(ui, true);
    flush();
    expect(lit()).toHaveLength(0);
    setOnlyScreens(ui, false);
    flush();
    expect(lit()).toHaveLength(2);

    // A simple click goes back to a single item.
    ui.selection.value = { kind: 'marking', id: 'M1' };
    flush();
    expect(lit()).toHaveLength(0);
    controller.destroy();
  });

  it('drop target on the empty area marks the container in the next frame', () => {
    const { container, controller } = setup();
    flush();
    controller.setDropTarget({ containerId: null });
    expect(container.classList.contains('canvas-host--drop')).toBe(false);
    flush();
    expect(container.classList.contains('canvas-host--drop')).toBe(true);
    controller.setDropTarget(null);
    flush();
    expect(container.classList.contains('canvas-host--drop')).toBe(false);
    controller.destroy();
  });

  it('marks on the container the fits and ready images already drawn (e2e)', async () => {
    const editor = editorFor();
    const display = createDisplayImages<ImageBitmap>(
      async () => ({ width: 10, height: 10, close: () => undefined }) as ImageBitmap,
    );
    const container = document.createElement('div');
    Object.defineProperty(container, 'clientWidth', { value: 380 });
    Object.defineProperty(container, 'clientHeight', { value: 700 });
    document.body.append(container);
    const controller = new CanvasController({ container, display, ...editor });
    flush();
    // The first fit happens when the container is measured; the bitmaps are still loading.
    expect(container.dataset.fits).toBe('1');
    expect(container.dataset.images).toBe('0');
    await Promise.resolve();
    await Promise.resolve();
    flush();
    expect(container.dataset.images).toBe('2');
    // Only the frame after the fit publishes it.
    controller.fitAll();
    expect(container.dataset.fits).toBe('1');
    flush();
    expect(container.dataset.fits).toBe('2');
    controller.destroy();
  });

  // Achado 10: `InvalidStateError: drawImage … The image source is detached`. O `retain`
  // closed the bitmap right away, while the Konva node still referenced it and a pending
  // draw (the `batchDraw` of the previous frame) would still use it.
  it('the bitmap of an image that leaves the project only closes after the frame that stops drawing it', async () => {
    const editor = editorFor();
    const bitmaps = new Map<string, { closed: boolean }>();
    const display = createDisplayImages<ImageBitmap>(async (path) => {
      const bitmap = {
        width: 10,
        height: 10,
        closed: false,
        close() {
          this.closed = true;
        },
      };
      bitmaps.set(path, bitmap);
      return bitmap as unknown as ImageBitmap;
    });
    const container = document.createElement('div');
    Object.defineProperty(container, 'clientWidth', { value: 380 });
    Object.defineProperty(container, 'clientHeight', { value: 700 });
    document.body.append(container);
    const controller = new CanvasController({ container, display, ...editor });
    flush();
    await Promise.resolve();
    await Promise.resolve();
    flush();
    expect(container.dataset.images).toBe('2');
    const b = bitmaps.get('images/b.jpg');
    if (!b) throw new Error('bitmap of b.jpg');

    // The image leaves the project: the display map releases it at once, but the bitmap stays
    // open until the next frame (which removes the node reference) is drawn.
    editor.actions.removeContainer('I2');
    expect(display.images.value.has('images/b.jpg')).toBe(false);
    expect(b.closed).toBe(false);
    flush();
    expect(container.dataset.images).toBe('1');
    expect(b.closed).toBe(true);
    controller.destroy();
  });

  it('publishes zoom, image area and cursor in image pixels (B8, P3 and P4)', () => {
    const { container, controller, view } = setup();
    flush();
    // The viewport and the image area reach the interface (status bar, minimap).
    expect(view.size.value).toEqual({ width: 380, height: 700 });
    expect(view.bounds.value).toEqual({ x: 0, y: 0, width: 1600, height: 800 });

    controller.zoomTo(1);
    expect(view.viewport.value.scale).toBeCloseTo(1);
    controller.zoomBy(2);
    expect(view.viewport.value.scale).toBeCloseTo(2);
    controller.zoomTo(1);
    controller.centerOnPoint({ x: 500, y: 400 });
    expect(controller.viewportCenter().x).toBeCloseTo(500);
    expect(controller.viewportCenter().y).toBeCloseTo(400);

    // The cursor only changes in the next frame (one write per frame, HANDOFF section 6).
    container.dispatchEvent(
      new PointerEvent('pointermove', {
        pointerId: 1,
        pointerType: 'mouse',
        clientX: 10,
        clientY: 20,
      }),
    );
    expect(view.cursor.value).toBeNull();
    flush();
    const canvasPoint = controller.canvasPointAt(10, 20);
    expect(view.cursor.value).toEqual({
      containerId: 'I1',
      x: Math.floor(canvasPoint.x),
      y: Math.floor(canvasPoint.y),
    });

    container.dispatchEvent(new PointerEvent('pointerleave', { pointerId: 1 }));
    flush();
    expect(view.cursor.value).toBeNull();
    controller.destroy();
  });

  it('after being destroyed, it no longer listens to the pointer', () => {
    const { container, controller, ui } = setup();
    controller.destroy();
    container.dispatchEvent(
      new PointerEvent('pointerdown', { pointerId: 1, clientX: 10, clientY: 10 }),
    );
    container.dispatchEvent(
      new PointerEvent('pointerup', { pointerId: 1, clientX: 10, clientY: 10 }),
    );
    expect(ui.selection.value).toBeNull();
    expect(controller.cancelInteraction()).toBe(false);
  });

  it('lock under the mouse: only on locked items, written once per frame', () => {
    const { container, controller, actions } = setup();
    const hover = () =>
      (controller as unknown as { state: InteractionState }).state.hoverLock.value;
    const move = (x: number, y: number) => {
      container.dispatchEvent(
        new PointerEvent('pointermove', {
          pointerId: 1,
          pointerType: 'mouse',
          clientX: x,
          clientY: y,
        }),
      );
      flush();
    };
    flush();
    controller.zoomTo(1);
    controller.centerOnPoint({ x: 250, y: 250 }); // the center of M2 is at the center of the screen
    const [x, y] = [190, 350];

    move(x, y);
    expect(hover()).toBeNull(); // project without lock: it does not even compute

    actions.setMarkingLocked('M2', true);
    move(x, y);
    expect(hover()).toEqual({ kind: 'marking', id: 'M2' });

    // Over the free marking (the parent, outside the child): no lock.
    controller.centerOnPoint({ x: 150, y: 150 });
    move(x, y);
    expect(hover()).toBeNull();

    // Locked parent: the child inherits it and the lock shows on it.
    actions.setMarkingLocked('M1', true);
    controller.centerOnPoint({ x: 250, y: 250 });
    move(x, y);
    expect(hover()).toEqual({ kind: 'marking', id: 'M2' });

    // Locked image, outside the markings.
    actions.setMarkingLocked('M1', false);
    actions.setMarkingLocked('M2', false);
    actions.setImageLocked('I1', true);
    controller.centerOnPoint({ x: 900, y: 700 });
    move(x, y);
    expect(hover()).toEqual({ kind: 'image', id: 'I1' });

    container.dispatchEvent(new PointerEvent('pointerleave', { pointerId: 1 }));
    flush();
    expect(hover()).toBeNull();
    controller.destroy();
  });

  describe('canvas markings (ME1)', () => {
    /** A canvas marking around the two images and a floating one over the Porta. */
    function spatial() {
      const ctx = setup();
      const created = ctx.actions.createMarking(null, {
        x: -100,
        y: -100,
        width: 1800,
        height: 1000,
      });
      const id = created.ok ? created.value : '';
      return { ...ctx, id };
    }

    it('publishes on the container how many canvas markings there are (e2e)', () => {
      const { container, controller, actions } = setup();
      flush();
      expect(container.dataset.canvasMarkings).toBe('0');
      actions.createMarking(null, { x: 2000, y: 0, width: 100, height: 100 });
      flush();
      expect(container.dataset.canvasMarkings).toBe('1');
      // The container ones do not count, and the floating one counts (it lives on the canvas).
      actions.createMarking('I1', { x: 10, y: 10, width: 20, height: 20 });
      const note = actions.createMarking(null, { x: 2300, y: 0, width: 50, height: 50 });
      if (note.ok) actions.setMarkingFloating(note.value, true);
      flush();
      expect(container.dataset.canvasMarkings).toBe('2');
      controller.destroy();
    });

    it('Fit all and the minimap include the canvas markings', () => {
      const { controller, view, actions } = setup();
      flush();
      expect(view.bounds.value).toEqual({ x: 0, y: 0, width: 1600, height: 800 });
      actions.createMarking(null, { x: -500, y: -300, width: 200, height: 100 });
      flush();
      expect(view.bounds.value).toEqual({ x: -500, y: -300, width: 2100, height: 1100 });
      controller.fitAll();
      const center = controller.viewportCenter();
      expect(center.x).toBeCloseTo(550);
      expect(center.y).toBeCloseTo(250);
      controller.destroy();
    });

    it('centers on the selected canvas marking (identity space)', () => {
      const { controller, ui, id } = spatial();
      flush();
      ui.selection.value = { kind: 'marking', id };
      controller.centerSelection();
      const center = controller.viewportCenter();
      expect(center.x).toBeCloseTo(800);
      expect(center.y).toBeCloseTo(400);
      controller.destroy();
    });

    it('the container that would receive the dragged marking lights up as a drop target', () => {
      const { container, controller } = setup();
      const internals = controller as unknown as {
        state: InteractionState;
        overlay: { dropRect: { visible(): boolean; width(): number } };
      };
      flush();
      internals.state.moveTarget.value = 'I2';
      flush();
      expect(internals.overlay.dropRect.visible()).toBe(true);
      expect(internals.overlay.dropRect.width()).toBe(500);
      // The drop target of a file takes precedence while it exists.
      controller.setDropTarget({ containerId: 'I1' });
      flush();
      expect(internals.overlay.dropRect.width()).toBe(1000);
      controller.setDropTarget(null);
      internals.state.moveTarget.value = null;
      flush();
      expect(internals.overlay.dropRect.visible()).toBe(false);
      expect(container.classList.contains('canvas-host--drop')).toBe(false);
      controller.destroy();
    });

    it('the items to be absorbed light up on the overlay and go off when the gesture ends', () => {
      const { controller } = setup();
      const internals = controller as unknown as {
        state: InteractionState;
        overlay: { absorbHighlights(): readonly { visible(): boolean }[] };
      };
      flush();
      internals.state.absorb.value = [{ x: 10, y: 10, width: 50, height: 50 }];
      flush();
      expect(
        internals.overlay.absorbHighlights().filter((r) => r.visible()),
      ).toHaveLength(1);
      internals.state.absorb.value = [];
      flush();
      expect(
        internals.overlay.absorbHighlights().filter((r) => r.visible()),
      ).toHaveLength(0);
      controller.destroy();
    });

    it('lock under the mouse: the floating one takes precedence; the container inherits the lock of the canvas marking', () => {
      const { container, controller, actions, id } = spatial();
      const hover = () =>
        (controller as unknown as { state: InteractionState }).state.hoverLock.value;
      const move = (x: number, y: number) => {
        container.dispatchEvent(
          new PointerEvent('pointermove', {
            pointerId: 1,
            pointerType: 'mouse',
            clientX: x,
            clientY: y,
          }),
        );
        flush();
      };
      flush();
      controller.zoomTo(1);
      controller.centerOnPoint({ x: 900, y: 700 });
      const [x, y] = [190, 350]; // the canvas point (900, 700), inside I1 and without an I1 marking

      // The floating one is born before locking (becoming floating is geometry and the lock prevents it).
      const note = actions.createMarking(null, {
        x: 1000,
        y: 250,
        width: 100,
        height: 100,
      });
      if (note.ok) actions.setMarkingFloating(note.value, true);

      // Locked canvas marking: the container inside it inherits (and so does the area between the images).
      actions.setMarkingLocked(id, true);
      move(x, y);
      expect(hover()).toEqual({ kind: 'image', id: 'I1' });
      controller.centerOnPoint({ x: 1050, y: 100 }); // between the images, outside the floating one
      move(x, y);
      expect(hover()).toEqual({ kind: 'marking', id });

      // The free floating one over the locked area takes precedence and does not show the lock.
      controller.centerOnPoint({ x: 1050, y: 300 });
      move(x, y);
      expect(hover()).toBeNull();
      controller.destroy();
    });
  });
});

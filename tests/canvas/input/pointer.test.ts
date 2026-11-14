import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInteractionState } from '../../../src/canvas/frame';
import { PointerInput } from '../../../src/canvas/input/pointer';
import { ViewportController } from '../../../src/canvas/viewportController';
import {
  addContainer,
  arrowRoute,
  createMarking,
  projectIndex,
  type Rect,
  setArrowRoute,
  setArrowStyle,
  setContainerPlacement,
  setMarkingLocked,
  type Project,
} from '../../../src/model';
import { t } from '../../../src/i18n';
import { setShowArrows } from '../../../src/store/settings';
import {
  peekSelectedItems,
  selectItems,
  setViewMode,
  type Selection,
  type SelectionItem,
} from '../../../src/store/ui';
import { arrowProject, withArrow } from '../../model/arrowFixtures';
import { canvasProject, editorFor, setOnlyScreens } from '../harness';

// Viewport 1:1 at (0, 0) and container at (0, 0) on the page: screen = canvas.
function setup(
  readOnly = false,
  project: Project = canvasProject(),
  titles: ReadonlyMap<string, Rect> = new Map(),
) {
  const editor = editorFor(project, readOnly);
  const container = document.createElement('div');
  document.body.append(container);
  const viewport = new ViewportController(container, () => editor.store.project.peek());
  const state = createInteractionState();
  let spaceDown = false;
  let reviewing = false;
  const input = new PointerInput({
    container,
    ...editor,
    viewport,
    state,
    spaceDown: () => spaceDown,
    reviewing: () => reviewing,
    containerTitles: () => titles,
  });
  const unbind = input.bind();
  const fire = (
    type: 'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel',
    x: number,
    y: number,
    {
      id = 1,
      kind = 'mouse',
      button = 0,
      shift = false,
      ctrl = false,
      meta = false,
    } = {},
  ) =>
    container.dispatchEvent(
      new PointerEvent(type, {
        pointerId: id,
        pointerType: kind,
        button,
        clientX: x,
        clientY: y,
        shiftKey: shift,
        ctrlKey: ctrl,
        metaKey: meta,
        bubbles: true,
      }),
    );
  /** Tap without dragging. */
  const click = (
    x: number,
    y: number,
    options: { shift?: boolean; ctrl?: boolean; meta?: boolean; kind?: string } = {},
  ) => {
    fire('pointerdown', x, y, options);
    fire('pointerup', x, y, options);
  };
  /** Mouse double-click: two taps at the same point and the `dblclick` event. */
  const doubleClick = (x: number, y: number) => {
    click(x, y);
    click(x, y);
    container.dispatchEvent(
      new MouseEvent('dblclick', { clientX: x, clientY: y, bubbles: true }),
    );
  };
  /** Right button: the `pointerdown` of button 2 and the `contextmenu`. */
  const rightClick = (x: number, y: number) => {
    fire('pointerdown', x, y, { button: 2 });
    container.dispatchEvent(
      new MouseEvent('contextmenu', {
        clientX: x,
        clientY: y,
        bubbles: true,
        cancelable: true,
      }),
    );
    fire('pointerup', x, y, { button: 2 });
  };
  /** Drags from `from` to `to` in a few steps and releases. */
  const drag = (
    from: [number, number],
    to: [number, number],
    options: { id?: number; kind?: string } = {},
  ) => {
    fire('pointerdown', ...from, options);
    for (const t of [0.25, 0.5, 1]) {
      fire(
        'pointermove',
        from[0] + (to[0] - from[0]) * t,
        from[1] + (to[1] - from[1]) * t,
        options,
      );
    }
    fire('pointerup', ...to, options);
  };
  const markingRect = (id: string) => {
    const p = editor.store.project.peek();
    return p && projectIndex(p).markings.get(id)?.rect;
  };
  const markingOf = (id: string) => {
    const p = editor.store.project.peek();
    return p && projectIndex(p).markings.get(id);
  };
  const containerOf = (id: string) => {
    const p = editor.store.project.peek();
    return p && projectIndex(p).containers.get(id);
  };
  return {
    ...editor,
    container,
    viewport,
    state,
    input,
    fire,
    click,
    doubleClick,
    rightClick,
    drag,
    markingRect,
    markingOf,
    containerOf,
    setSpace: (down: boolean) => (spaceDown = down),
    setReviewing: (on: boolean) => (reviewing = on),
    cleanup: () => {
      unbind();
      input.destroy();
      container.remove();
    },
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('PointerInput', () => {
  it('a tap without dragging selects; again at the same point goes up to the parent', () => {
    const s = setup();
    s.fire('pointerdown', 250, 250);
    s.fire('pointerup', 250, 250);
    expect(s.ui.selection.value).toEqual({ kind: 'marking', id: 'M2' });
    s.fire('pointerdown', 252, 251);
    s.fire('pointerup', 252, 251);
    expect(s.ui.selection.value).toEqual({ kind: 'marking', id: 'M1' });
    s.fire('pointerdown', 1050, 50);
    s.fire('pointerup', 1050, 50);
    expect(s.ui.selection.value).toBeNull();
    s.cleanup();
  });

  it('mouse: dragging the selected marking moves it, with one undo entry', () => {
    const s = setup();
    s.ui.selection.value = { kind: 'marking', id: 'M1' };
    s.drag([400, 400], [500, 450]);
    expect(s.markingRect('M1')).toEqual({ x: 200, y: 150, width: 600, height: 500 });
    expect(s.store.undo()).toBe(true);
    expect(s.markingRect('M1')).toEqual({ x: 100, y: 100, width: 600, height: 500 });
    expect(s.store.canUndo.value).toBe(false);
    s.cleanup();
  });

  it('mouse: the handle resizes', () => {
    const s = setup();
    s.ui.selection.value = { kind: 'marking', id: 'M2' };
    s.drag([300, 300], [340, 360]);
    expect(s.markingRect('M2')).toEqual({ x: 200, y: 200, width: 140, height: 160 });
    s.cleanup();
  });

  it('mouse: moving the image over another one snaps against it and stays there on release', () => {
    const s = setup();
    s.ui.selection.value = { kind: 'image', id: 'I2' };
    s.fire('pointerdown', 1300, 300);
    s.fire('pointermove', 1100, 300);
    s.fire('pointermove', 800, 300);
    expect(s.state.preview.value).toMatchObject({ containerId: 'I2', valid: true });
    s.fire('pointerup', 800, 300);
    expect(s.state.preview.value).toBeNull();
    // Snapped to the right edge of I1 (1000), instead of staying where it was (1100).
    const p = s.store.project.peek();
    expect(p && projectIndex(p).containers.get('I2')?.placement.x).toBe(1000);
    s.cleanup();
  });

  it('mouse: dragging the container only vertically does not rewrite x (fractional zoom, bit for bit)', () => {
    const base = canvasProject();
    const x0 = 3300.0000513292603;
    const project: Project = {
      ...base,
      containers: base.containers.map((c) =>
        c.id === 'I1' ? { ...c, placement: { ...c.placement, x: x0 } } : c,
      ),
    };
    const s = setup(false, project);
    s.viewport.viewport.value = { x: 0, y: 78.9, scale: 0.557 };
    s.ui.selection.value = { kind: 'image', id: 'I1' };
    // Screen point inside I1 (canvas ~ 3300..4300 x 0..800), without touching a marking.
    // 1900 on screen becomes 3411.131… on the canvas: `(x0 + c) - c` ≠ `x0` (the old formula rewrote it).
    const sx = 1900;
    const sy = 700 * 0.557 + 78.9;
    s.fire('pointerdown', sx, sy);
    s.fire('pointermove', sx, sy + 40);
    expect(s.state.preview.value?.placement.x).toBe(x0);
    s.fire('pointermove', sx, sy + 90);
    expect(s.state.preview.value?.placement.x).toBe(x0);
    s.fire('pointerup', sx, sy + 90);
    // Stored: the same x as always (the write only trims the tail, as in any write).
    expect(s.containerOf('I1')?.placement.x).toBe(Number(x0.toFixed(6)));
    expect(s.containerOf('I1')?.placement.y).not.toBe(0);
    s.cleanup();
  });

  it('touch: dragging over the selected marking pans, without moving it', () => {
    const s = setup();
    s.ui.selection.value = { kind: 'marking', id: 'M1' };
    s.drag([400, 400], [450, 430], { kind: 'touch' });
    expect(s.markingRect('M1')).toEqual({ x: 100, y: 100, width: 600, height: 500 });
    expect(s.viewport.viewport.value).toMatchObject({ x: 50, y: 30, scale: 1 });
    s.cleanup();
  });

  it('Draw mode: dragging over the image creates and selects the marking', () => {
    const s = setup();
    s.ui.mode.value = 'draw';
    s.fire('pointerdown', 750, 650);
    s.fire('pointermove', 800, 700);
    expect(s.state.draft.value?.containerId).toBe('I1');
    s.fire('pointermove', 850, 720);
    s.fire('pointerup', 850, 720);
    expect(s.state.draft.value).toBeNull();
    const selection = s.ui.selection.value;
    expect(selection?.kind).toBe('marking');
    expect(selection && s.markingRect(selection.id)).toEqual({
      x: 750,
      y: 650,
      width: 100,
      height: 70,
    });
    s.cleanup();
  });

  it('cancel (Esc) undoes the gesture in progress and ignores the rest of the drag', () => {
    const s = setup();
    expect(s.input.cancelInteraction()).toBe(false);
    s.ui.selection.value = { kind: 'marking', id: 'M1' };
    s.fire('pointerdown', 400, 400);
    s.fire('pointermove', 450, 450);
    expect(s.markingRect('M1')?.x).toBe(150);
    expect(s.input.cancelInteraction()).toBe(true);
    expect(s.markingRect('M1')?.x).toBe(100);
    s.fire('pointermove', 500, 500);
    s.fire('pointerup', 500, 500);
    expect(s.markingRect('M1')?.x).toBe(100);
    expect(s.store.canUndo.value).toBe(false);
    s.cleanup();
  });

  it('two fingers: pinch changes the zoom and cancels the drag', () => {
    const s = setup();
    s.fire('pointerdown', 100, 100, { id: 1, kind: 'touch' });
    s.fire('pointerdown', 200, 100, { id: 2, kind: 'touch' });
    s.fire('pointermove', 300, 100, { id: 2, kind: 'touch' });
    expect(s.viewport.viewport.value.scale).toBeCloseTo(2);
    s.fire('pointerup', 100, 100, { id: 1, kind: 'touch' });
    s.fire('pointerup', 300, 100, { id: 2, kind: 'touch' });
    expect(s.ui.selection.value).toBeNull(); // Releasing the pinch is not a tap.
    s.cleanup();
  });

  it('mouse wheel zooms at the point', () => {
    const s = setup();
    const wheel = new WheelEvent('wheel', {
      deltaY: -100,
      clientX: 100,
      clientY: 100,
      cancelable: true,
    });
    s.container.dispatchEvent(wheel);
    expect(wheel.defaultPrevented).toBe(true);
    expect(s.viewport.viewport.value.scale).toBeGreaterThan(1);
    expect(s.viewport.toCanvas({ x: 100, y: 100 }).x).toBeCloseTo(100);
    s.cleanup();
  });

  it('cursor: move over the selected item, handle on the corners, "grab" with Space', () => {
    const s = setup();
    s.ui.selection.value = { kind: 'marking', id: 'M1' };
    s.fire('pointermove', 400, 400);
    expect(s.container.style.cursor).toBe('move');
    s.fire('pointermove', 700, 600);
    expect(s.container.style.cursor).toBe('nwse-resize');
    s.setSpace(true);
    s.input.updateCursor(null);
    expect(s.container.style.cursor).toBe('grab');
    s.cleanup();
  });

  it('read-only: dragging the selected item pans', () => {
    const s = setup(true);
    s.ui.selection.value = { kind: 'marking', id: 'M1' };
    s.drag([400, 400], [450, 430]);
    expect(s.markingRect('M1')).toEqual({ x: 100, y: 100, width: 600, height: 500 });
    expect(s.viewport.viewport.value).toMatchObject({ x: 50, y: 30 });
    s.cleanup();
  });
});

describe('PointerInput: lock (stage 2.5)', () => {
  const lockMarking = (s: ReturnType<typeof setup>, id: string) => {
    expect(s.actions.setMarkingLocked(id, true).ok).toBe(true);
  };

  it('mouse: dragging the locked item does nothing (not even pan), with no undo entry', () => {
    const s = setup();
    lockMarking(s, 'M1');
    const revision = s.store.revision.value;
    s.ui.selection.value = { kind: 'marking', id: 'M1' };
    s.fire('pointermove', 400, 400); // the mouse passes over before pressing
    expect(s.container.style.cursor).toBe('not-allowed');
    s.fire('pointerdown', 400, 400);
    s.fire('pointermove', 450, 430);
    expect(s.container.style.cursor).toBe('not-allowed');
    s.fire('pointermove', 500, 450);
    s.fire('pointerup', 500, 450);
    expect(s.markingRect('M1')).toEqual({ x: 100, y: 100, width: 600, height: 500 });
    expect(s.viewport.viewport.value).toMatchObject({ x: 0, y: 0 });
    expect(s.store.revision.value).toBe(revision);
    expect(s.store.gestureActive.value).toBe(false);
    s.cleanup();
  });

  it('mouse: the corners of the locked item do not resize', () => {
    const s = setup();
    lockMarking(s, 'M2');
    s.ui.selection.value = { kind: 'marking', id: 'M2' };
    s.drag([300, 300], [340, 360]);
    expect(s.markingRect('M2')).toEqual({ x: 200, y: 200, width: 100, height: 100 });
    s.cleanup();
  });

  it('mouse: the cursor over the selected and locked item is "not allowed"', () => {
    const s = setup();
    lockMarking(s, 'M1');
    s.ui.selection.value = { kind: 'marking', id: 'M1' };
    s.fire('pointermove', 400, 400);
    expect(s.container.style.cursor).toBe('not-allowed');
    s.fire('pointermove', 700, 600);
    expect(s.container.style.cursor).toBe('not-allowed');
    s.fire('pointermove', 900, 700);
    expect(s.container.style.cursor).toBe('');
    s.cleanup();
  });

  it('clicking the locked item selects it', () => {
    const s = setup();
    lockMarking(s, 'M2');
    s.fire('pointerdown', 250, 250);
    s.fire('pointerup', 250, 250);
    expect(s.ui.selection.value).toEqual({ kind: 'marking', id: 'M2' });
    s.cleanup();
  });

  it('mouse: the locked image does not move', () => {
    const s = setup();
    expect(s.actions.setImageLocked('I2', true).ok).toBe(true);
    s.ui.selection.value = { kind: 'image', id: 'I2' };
    s.drag([1300, 300], [1400, 300]);
    const p = s.store.project.peek();
    expect(p && projectIndex(p).containers.get('I2')?.placement.x).toBe(1100);
    s.cleanup();
  });

  it('touch: dragging over the locked item pans and tapping it selects it', () => {
    const s = setup();
    lockMarking(s, 'M1');
    s.ui.selection.value = { kind: 'marking', id: 'M1' };
    s.drag([400, 400], [450, 430], { kind: 'touch' });
    expect(s.viewport.viewport.value).toMatchObject({ x: 50, y: 30 });
    expect(s.markingRect('M1')).toEqual({ x: 100, y: 100, width: 600, height: 500 });
    s.fire('pointerdown', 250, 250, { kind: 'touch', id: 2 });
    s.fire('pointerup', 250, 250, { kind: 'touch', id: 2 });
    expect(s.ui.selection.value).toEqual({ kind: 'marking', id: 'M2' });
    s.cleanup();
  });
});

describe('PointerInput: container name label', () => {
  // M9 covers the whole container I1; the label of I1 sits right above it.
  const covered = () =>
    createMarking(canvasProject(), {
      id: 'M9',
      containerId: 'I1',
      rect: { x: 0, y: 0, width: 1000, height: 800 },
    });
  const titles = new Map([['I1', { x: 0, y: -20, width: 100, height: 16 }]]);

  it('clicking the name selects the container covered by a marking; dragging moves it', () => {
    const s = setup(false, covered(), titles);
    s.click(900, 700);
    expect(s.ui.selection.value).toEqual({ kind: 'marking', id: 'M9' });
    s.click(50, -12);
    expect(s.ui.selection.value).toEqual({ kind: 'image', id: 'I1' });
    s.drag([50, -12], [80, 18]);
    expect(s.containerOf('I1')?.placement).toMatchObject({ x: 30, y: 30 });
    s.cleanup();
  });

  it('label of an unselected container: dragging pans', () => {
    const s = setup(false, covered(), titles);
    s.drag([50, -12], [80, 18]);
    expect(s.containerOf('I1')?.placement).toMatchObject({ x: 0, y: 0 });
    expect(s.viewport.viewport.value).toMatchObject({ x: 30, y: 30 });
    s.cleanup();
  });
});

describe('PointerInput: middle button and Ctrl+click (CR canvas/store, items 16 and 17)', () => {
  it('a short middle-button click does not select, does not clear the selection', () => {
    const s = setup();
    s.ui.selection.value = { kind: 'marking', id: 'M1' };
    s.fire('pointerdown', 250, 250, { button: 1 });
    s.fire('pointerup', 250, 250, { button: 1 });
    expect(s.ui.selection.value).toEqual({ kind: 'marking', id: 'M1' });
    s.fire('pointerdown', 1050, 50, { button: 1 });
    s.fire('pointerup', 1050, 50, { button: 1 });
    expect(s.ui.selection.value).toEqual({ kind: 'marking', id: 'M1' });
    s.cleanup();
  });

  it('a short middle-button click does not consume the armed Comment nor place the pin', () => {
    const s = setup();
    s.ui.commentArm.value = { mode: 'navigate' };
    s.fire('pointerdown', 250, 250, { button: 1 });
    s.fire('pointerup', 250, 250, { button: 1 });
    expect(s.ui.commentArm.value).toEqual({ mode: 'navigate' });
    expect(s.ui.composing.value).toBeNull();
    s.cleanup();
  });

  it('Ctrl+click: the contextmenu with the pending gesture cancels it, opens the menu and the pointerup does not become a click', () => {
    const s = setup();
    s.fire('pointerdown', 250, 250, { ctrl: true });
    s.container.dispatchEvent(
      new MouseEvent('contextmenu', {
        clientX: 250,
        clientY: 250,
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      }),
    );
    expect(s.ui.canvasMenu.value?.target).toEqual({ kind: 'm', id: 'M2' });
    const before = s.ui.selection.value;
    s.fire('pointerup', 250, 250, { ctrl: true });
    // Without `tap`: the Ctrl selection does not toggle the item the menu selected.
    expect(s.ui.selection.value).toEqual(before);
    expect(s.input.isInteracting()).toBe(false);
    s.cleanup();
  });
});

describe('PointerInput: context menu (stage 3a.2)', () => {
  const contextMenu = (s: ReturnType<typeof setup>, x: number, y: number) => {
    const event = new MouseEvent('contextmenu', {
      clientX: x,
      clientY: y,
      bubbles: true,
      cancelable: true,
    });
    s.container.dispatchEvent(event);
    return event;
  };

  it('right button over a marking selects it and opens its menu', () => {
    const s = setup();
    s.fire('pointerdown', 250, 250, { button: 2 });
    const event = contextMenu(s, 250, 250);
    s.fire('pointerup', 250, 250, { button: 2 });
    expect(event.defaultPrevented).toBe(true);
    expect(s.ui.selection.value).toEqual({ kind: 'marking', id: 'M2' });
    expect(s.ui.canvasMenu.value).toEqual({
      x: 250,
      y: 250,
      target: { kind: 'm', id: 'M2' },
      comment: { kind: 'marking', id: 'M2' },
      here: null,
    });
  });

  it("over the image, outside the markings, the menu is the image's", () => {
    const s = setup();
    s.fire('pointerdown', 20, 20, { button: 2 });
    contextMenu(s, 20, 20);
    expect(s.ui.selection.value).toMatchObject({ kind: 'image' });
    expect(s.ui.canvasMenu.value?.target?.kind).toBe('i');
    // Inside the container, the image also accepts Comment here (CM4).
    expect(s.ui.canvasMenu.value?.comment).toEqual({ kind: 'container', id: 'I1' });
    expect(s.ui.canvasMenu.value?.here).toMatchObject({
      kind: 'point',
      containerId: 'I1',
    });
  });

  it('outside the images it only opens Comment here (point on the canvas), and the browser menu stays suppressed', () => {
    const s = setup();
    s.ui.selection.value = { kind: 'marking', id: 'M1' };
    s.fire('pointerdown', 1050, 50, { button: 2 });
    const event = contextMenu(s, 1050, 50);
    expect(event.defaultPrevented).toBe(true);
    expect(s.ui.canvasMenu.value?.target).toBeNull();
    expect(s.ui.canvasMenu.value?.here).toEqual({
      kind: 'point',
      containerId: null,
      x: 1050,
      y: 50,
    });
    expect(s.ui.selection.value).toEqual({ kind: 'marking', id: 'M1' });
  });

  it('the contextmenu of a long touch is the "hold and move": it does not open the menu', () => {
    const s = setup();
    s.fire('pointerdown', 250, 250, { kind: 'touch' });
    const event = contextMenu(s, 250, 250);
    expect(event.defaultPrevented).toBe(true);
    expect(s.ui.canvasMenu.value).toBeNull();
  });

  it('a new right button swaps the menu; with the middle tap, it closes the open one', () => {
    const s = setup();
    s.fire('pointerdown', 250, 250, { button: 2 });
    contextMenu(s, 250, 250);
    expect(s.ui.canvasMenu.value).not.toBeNull();
    s.fire('pointerdown', 250, 250, { kind: 'touch', id: 2 });
    contextMenu(s, 250, 250);
    expect(s.ui.canvasMenu.value).toBeNull();
  });
});

// Membership by geometry (Spatial markings stage, ME1): drawing on the empty canvas, the move
// that crosses spaces (with snapping), absorption and settling on release, always in one entry.
describe('PointerInput: canvas markings and membership', () => {
  /** `canvasProject` with a third container I3 (400×400) at (1800, 0) and a loose marking Ma in I1. */
  function withThird(): Project {
    let p = canvasProject();
    p = addContainer(p, { id: 'I3', file: 'images/c.jpg', width: 400, height: 400 });
    p = setContainerPlacement(p, 'I3', { x: 1800, y: 0, scale: 1 });
    return p;
  }

  it('Draw mode: dragging on the empty canvas around two containers creates a canvas marking', () => {
    const s = setup();
    s.ui.mode.value = 'draw';
    s.fire('pointerdown', -50, -50);
    s.fire('pointermove', 800, 500);
    expect(s.state.draft.value).toMatchObject({ containerId: null });
    s.fire('pointermove', 1700, 900);
    s.fire('pointerup', 1700, 900);
    expect(s.state.draft.value).toBeNull();
    const selection = s.ui.selection.value;
    expect(selection?.kind).toBe('marking');
    const created = selection && s.markingOf(selection.id);
    expect(created).toMatchObject({
      containerId: null,
      parentId: null,
      floating: false,
      rect: { x: -50, y: -50, width: 1750, height: 950 },
    });
    // Both containers become members of it (recorded, without the agent computing anything).
    expect(s.containerOf('I1')?.parentId).toBe(selection?.id);
    expect(s.containerOf('I2')?.parentId).toBe(selection?.id);
    // One Ctrl+Z undoes everything.
    expect(s.store.undo()).toBe(true);
    expect(s.store.canUndo.value).toBe(false);
    expect(s.containerOf('I1')?.parentId).toBeNull();
    s.cleanup();
  });

  it('Draw mode: drawing on the empty canvas absorbs the container that crosses within the tolerance', () => {
    const s = setup();
    s.ui.mode.value = 'draw';
    s.fire('pointerdown', -20, -20);
    s.fire('pointermove', 500, 400);
    // I1 goes up to x = 1000: 10 outside the drawing, within the 12 screen px.
    s.fire('pointermove', 990, 805);
    expect(s.state.absorb.value).toEqual([{ x: 0, y: 0, width: 1000, height: 800 }]);
    s.fire('pointerup', 990, 805);
    expect(s.state.absorb.value).toEqual([]);
    const id = s.ui.selection.value?.id ?? '';
    expect(s.markingRect(id)).toEqual({ x: -20, y: -20, width: 1020, height: 825 });
    expect(s.containerOf('I1')?.parentId).toBe(id);
    s.cleanup();
  });

  it('absorption depends on the zoom (screen px)', () => {
    const draw = (scale: number) => {
      const s = setup();
      s.viewport.viewport.value = { x: 0, y: 0, scale };
      s.ui.mode.value = 'draw';
      // From canvas (-20, -20) to (990, 805): I1 extends 10 units past the right of the drawing.
      s.fire('pointerdown', -20 * scale, -20 * scale);
      s.fire('pointermove', 400 * scale, 400 * scale);
      s.fire('pointermove', 990 * scale, 805 * scale);
      s.fire('pointerup', 990 * scale, 805 * scale);
      const id = s.ui.selection.value?.id ?? '';
      const result = { rect: s.markingRect(id), parentId: s.containerOf('I1')?.parentId };
      s.cleanup();
      return { ...result, id };
    };
    // Zoom 1: 12 screen px = 12 units, absorbs (grows up to 1000).
    const near = draw(1);
    expect(near.rect).toEqual({ x: -20, y: -20, width: 1020, height: 825 });
    expect(near.parentId).toBe(near.id);
    // Zoom 2: 12 screen px = 6 units; 10 exceeds the tolerance, does not absorb.
    const far = draw(2);
    expect(far.rect).toEqual({ x: -20, y: -20, width: 1010, height: 825 });
    expect(far.parentId).toBeNull();
  });

  describe('warning when releasing a drawing below the minimum', () => {
    const tooSmall = t('marking.error.rect-too-small', { min: 8 });
    const markingCount = (s: ReturnType<typeof setup>) =>
      Object.keys(
        Object.fromEntries(projectIndex(s.store.project.peek() as Project).markings),
      ).length;

    it('a real drag of 3×3 image px warns and creates no marking', () => {
      const s = setup();
      s.viewport.viewport.value = { x: 0, y: 0, scale: 4 };
      s.ui.mode.value = 'draw';
      const before = markingCount(s);
      s.drag([40, 40], [52, 52]); // 12 screen px = 3 image px
      expect(s.ui.toast.value).toBe(tooSmall);
      expect(markingCount(s)).toBe(before);
      s.cleanup();
    });

    it('a small drag on the canvas background (no container) also warns', () => {
      const s = setup();
      s.viewport.viewport.value = { x: -5900, y: 0, scale: 4 }; // screen 100 = canvas 1500
      s.ui.mode.value = 'draw';
      const before = markingCount(s);
      s.drag([100, 40], [112, 52]);
      expect(s.ui.toast.value).toBe(tooSmall);
      expect(markingCount(s)).toBe(before);
      s.cleanup();
    });

    it('a simple click does not warn', () => {
      const s = setup();
      s.viewport.viewport.value = { x: 0, y: 0, scale: 4 };
      s.ui.mode.value = 'draw';
      s.click(40, 40);
      expect(s.ui.toast.value).toBeNull();
      s.cleanup();
    });

    it('a cancelled drag does not warn', () => {
      const s = setup();
      s.viewport.viewport.value = { x: 0, y: 0, scale: 4 };
      s.ui.mode.value = 'draw';
      s.fire('pointerdown', 40, 40);
      s.fire('pointermove', 46, 46);
      s.fire('pointermove', 52, 52);
      s.fire('pointercancel', 52, 52);
      expect(s.ui.toast.value).toBeNull();
      s.cleanup();
    });

    it('an 8×8 drag creates the marking without a warning', () => {
      const s = setup();
      s.viewport.viewport.value = { x: 0, y: 0, scale: 4 };
      s.ui.mode.value = 'draw';
      const before = markingCount(s);
      s.drag([40, 40], [72, 72]); // 32 screen px = 8 image px
      expect(s.ui.toast.value).toBeNull();
      expect(markingCount(s)).toBe(before + 1);
      s.cleanup();
    });
  });

  it('Draw mode over an image stays bound to it; pan belongs to the space bar and the middle button', () => {
    const s = setup();
    s.ui.mode.value = 'draw';
    s.fire('pointerdown', 900, 700);
    s.fire('pointermove', 1050, 760);
    s.fire('pointermove', 1300, 900);
    expect(s.state.draft.value).toMatchObject({
      containerId: 'I1',
      rect: { x: 900, y: 700, width: 100, height: 100 },
    });
    s.fire('pointerup', 1300, 900);
    const id = s.ui.selection.value?.id ?? '';
    expect(s.markingOf(id)).toMatchObject({ containerId: 'I1', parentId: null });
    // Space pressed: dragging on the empty canvas is pan, not drawing.
    s.setSpace(true);
    s.drag([1700, 600], [1750, 650]);
    expect(s.viewport.viewport.value).toMatchObject({ x: 50, y: 50 });
    s.setSpace(false);
    // Middle button too.
    s.fire('pointerdown', 1700, 600, { button: 1 });
    s.fire('pointermove', 1720, 620, { button: 1 });
    s.fire('pointermove', 1740, 640, { button: 1 });
    s.fire('pointerup', 1740, 640, { button: 1 });
    expect(s.viewport.viewport.value).toMatchObject({ x: 90, y: 90 });
    s.cleanup();
  });

  it('moving a marking to the other image makes it belong to that image, with its children along and one entry', () => {
    const s = setup();
    s.ui.selection.value = { kind: 'marking', id: 'M1' }; // M1 has the child M2
    // I2 is at (1100, 0) at scale 1: M1 (600×500) does not fit in it (500×500), so only M2.
    s.ui.selection.value = { kind: 'marking', id: 'M2' };
    s.drag([250, 250], [1350, 350]);
    expect(s.markingOf('M2')).toMatchObject({
      containerId: 'I2',
      parentId: null,
      rect: { x: 200, y: 300, width: 100, height: 100 },
    });
    expect(s.store.undo()).toBe(true);
    expect(s.markingOf('M2')).toMatchObject({
      containerId: 'I1',
      parentId: 'M1',
      rect: { x: 200, y: 200, width: 100, height: 100 },
    });
    expect(s.store.canUndo.value).toBe(false);
    s.cleanup();
  });

  it('between screens of different resolutions, the marking keeps the size it had on screen', () => {
    let project = canvasProject();
    // I2 (500×500) at half scale: occupies 250×250 on the canvas, from (1100, 0) to (1350, 250).
    project = setContainerPlacement(project, 'I2', { x: 1100, y: 0, scale: 0.5 });
    const s = setup(false, project);
    s.ui.selection.value = { kind: 'marking', id: 'M2' }; // 100×100 in I1, at scale 1
    s.drag([250, 250], [1250, 150]); // goes from (200, 200) to (1200, 100) on the canvas
    // 100 canvas units = 200 I2 pixels; its position in pixels.
    expect(s.markingOf('M2')).toMatchObject({
      containerId: 'I2',
      rect: { x: 200, y: 200, width: 200, height: 200 },
    });
    expect(s.store.undo()).toBe(true);
    expect(s.markingOf('M2')?.containerId).toBe('I1');
    s.cleanup();
  });

  it('snapping between scales: the offset comes out in pixels of the source container and the marking stays inside', () => {
    let project = canvasProject();
    project = setContainerPlacement(project, 'I2', { x: 1100, y: 0, scale: 0.5 });
    const s = setup(false, project);
    s.ui.selection.value = { kind: 'marking', id: 'M3' }; // 200×200 px in I2 = 100×100 on the canvas
    // M3 occupies 1125..1225 on the canvas; moved 133 to the right it ends at 1358, 8 past the edge
    // of I2 (1350): the snap returns it 16 I2 pixels inward.
    s.drag([1175, 75], [1308, 75]);
    expect(s.markingOf('M3')).toMatchObject({
      containerId: 'I2',
      rect: { x: 300, y: 50, width: 200, height: 200 },
    });
    s.cleanup();
  });

  it('released on the empty canvas becomes a canvas marking; released back on an image, it belongs to it', () => {
    const s = setup();
    s.ui.selection.value = { kind: 'marking', id: 'M2' };
    s.drag([250, 250], [250, 1150]);
    expect(s.markingOf('M2')).toMatchObject({
      containerId: null,
      parentId: null,
      rect: { x: 200, y: 1100, width: 100, height: 100 },
    });
    // Now from the canvas: dragging back into I2 (entirely) returns it to a container.
    s.drag([250, 1150], [1350, 250]);
    expect(s.markingOf('M2')).toMatchObject({
      containerId: 'I2',
      rect: { x: 200, y: 200, width: 100, height: 100 },
    });
    // Two entries, one per gesture.
    expect(s.store.undo()).toBe(true);
    expect(s.markingOf('M2')?.containerId).toBeNull();
    expect(s.store.undo()).toBe(true);
    expect(s.markingOf('M2')?.containerId).toBe('I1');
    expect(s.store.canUndo.value).toBe(false);
    s.cleanup();
  });

  it('the target container lights up while the marking passes over it and goes off on release', () => {
    const s = setup();
    s.ui.selection.value = { kind: 'marking', id: 'M2' };
    s.fire('pointerdown', 250, 250);
    s.fire('pointermove', 400, 260);
    expect(s.state.moveTarget.value).toBeNull(); // still in I1 (the source one does not light up)
    s.fire('pointermove', 1350, 300);
    expect(s.state.moveTarget.value).toBe('I2');
    s.fire('pointermove', 1050, 300); // on the empty canvas between the images, far from the snap
    expect(s.state.moveTarget.value).toBeNull();
    s.fire('pointermove', 1350, 300);
    s.fire('pointerup', 1350, 300);
    expect(s.state.moveTarget.value).toBeNull();
    s.cleanup();
  });

  it('snap: released almost entirely on a container, the marking is carried inside it', () => {
    const s = setup();
    s.ui.selection.value = { kind: 'marking', id: 'M2' }; // 100×100 in I1
    // Without the snap it would stay at x = 1090 (10 to the left of I2, which starts at 1100).
    s.fire('pointerdown', 250, 250);
    s.fire('pointermove', 600, 250);
    s.fire('pointermove', 1140, 250);
    expect(s.state.moveTarget.value).toBe('I2');
    s.fire('pointerup', 1140, 250);
    expect(s.markingOf('M2')).toMatchObject({
      containerId: 'I2',
      rect: { x: 0, y: 200, width: 100, height: 100 },
    });
    s.cleanup();
  });

  it('snap within the same container (went slightly past the edge): goes back inside', () => {
    const s = setup();
    s.ui.selection.value = { kind: 'marking', id: 'M3' }; // 200×200 in I2, at (50, 50)
    s.drag([1300, 200], [1560, 200]); // x = 310 + 200 = 510: 10 past the right edge (500)
    expect(s.markingOf('M3')).toMatchObject({
      containerId: 'I2',
      rect: { x: 300, y: 50, width: 200, height: 200 },
    });
    s.cleanup();
  });

  it('far from the container (beyond the tolerance) does not snap', () => {
    const s = setup();
    s.ui.selection.value = { kind: 'marking', id: 'M2' };
    s.drag([250, 250], [1110, 250]); // x = 1060: 40 before I2, on the empty canvas
    expect(s.markingOf('M2')).toMatchObject({ containerId: null });
    s.cleanup();
  });

  it('the floating one moves on its own and never snaps or changes space', () => {
    const s = setup();
    const created = s.actions.createMarking(null, {
      x: 900,
      y: 900,
      width: 100,
      height: 100,
    });
    const id = created.ok ? created.value : '';
    expect(s.actions.setMarkingFloating(id, true).ok).toBe(true);
    s.ui.selection.value = { kind: 'marking', id };
    // To near I2 (x = 1090) and then over it, entirely.
    s.drag([950, 950], [1140, 950]);
    expect(s.markingOf(id)).toMatchObject({ containerId: null, floating: true });
    expect(s.markingRect(id)).toEqual({ x: 1090, y: 900, width: 100, height: 100 });
    s.drag([1140, 950], [1300, 300]);
    expect(s.markingOf(id)).toMatchObject({
      containerId: null,
      parentId: null,
      floating: true,
    });
    expect(s.markingRect(id)).toEqual({ x: 1250, y: 250, width: 100, height: 100 });
    s.cleanup();
  });

  it('moving a canvas marking moves only the rectangle; the containers inside do not go along', () => {
    const s = setup();
    const created = s.actions.createMarking(null, {
      x: -100,
      y: -100,
      width: 1800,
      height: 1000,
    });
    const id = created.ok ? created.value : '';
    expect(s.containerOf('I1')?.parentId).toBe(id);
    s.ui.selection.value = { kind: 'marking', id };
    s.drag([1050, 300], [1050, 1300]); // 1000 down, on the empty canvas between I1 and I2
    expect(s.markingRect(id)).toEqual({ x: -100, y: 900, width: 1800, height: 1000 });
    expect(s.containerOf('I1')?.placement).toEqual({ x: 0, y: 0, scale: 1 });
    expect(s.containerOf('I2')?.placement).toEqual({ x: 1100, y: 0, scale: 1 });
    // The containers no longer fit in it: they leave the membership on release.
    expect(s.containerOf('I1')?.parentId).toBeNull();
    expect(s.containerOf('I2')?.parentId).toBeNull();
    expect(s.store.undo()).toBe(true);
    expect(s.containerOf('I1')?.parentId).toBe(id);
    s.cleanup();
  });

  it('moving a container into a canvas marking makes it a member; moving it out removes it', () => {
    const s = setup(false, withThird());
    const created = s.actions.createMarking(null, {
      x: -100,
      y: -100,
      width: 1750,
      height: 1100,
    });
    const id = created.ok ? created.value : '';
    expect(s.containerOf('I3')?.parentId).toBeNull();
    s.ui.selection.value = { kind: 'image', id: 'I3' };
    // From (1800, 0) to (1100, 520): below I2 (which ends at y = 500) and inside the marking.
    s.drag([1900, 100], [1200, 620]);
    expect(s.containerOf('I3')?.placement).toMatchObject({ x: 1100, y: 520 });
    expect(s.containerOf('I3')?.parentId).toBe(id);
    expect(s.store.undo()).toBe(true);
    expect(s.containerOf('I3')?.parentId).toBeNull();
    expect(s.containerOf('I3')?.placement).toMatchObject({ x: 1800, y: 0 });
    // Redo and out again: one gesture each.
    expect(s.store.redo()).toBe(true);
    s.drag([1200, 620], [2000, 620]);
    expect(s.containerOf('I3')?.parentId).toBeNull();
    s.cleanup();
  });

  it('resizing a marking without a limit from its children: what no longer fits leaves the membership', () => {
    const s = setup();
    s.ui.selection.value = { kind: 'marking', id: 'M1' }; // (100, 100, 600×500), child M2
    expect(s.markingOf('M2')?.parentId).toBe('M1');
    s.drag([100, 100], [260, 260]); // NW handle
    expect(s.markingRect('M1')).toEqual({ x: 260, y: 260, width: 440, height: 340 });
    expect(s.markingOf('M2')?.parentId).toBeNull(); // M2 ended up half outside, with no tolerance
    expect(s.store.undo()).toBe(true);
    expect(s.markingOf('M2')?.parentId).toBe('M1');
    expect(s.markingRect('M1')).toEqual({ x: 100, y: 100, width: 600, height: 500 });
    s.cleanup();
  });

  it('resizing absorbs what crosses within the tolerance (and lights up during the gesture)', () => {
    const base = canvasProject();
    const project = createMarking(base, {
      id: 'Ma',
      containerId: 'I1',
      rect: { x: 715, y: 150, width: 20, height: 40 },
    });
    const s = setup(false, project);
    expect(s.markingOf('Ma')?.parentId).toBeNull();
    s.ui.selection.value = { kind: 'marking', id: 'M1' };
    s.fire('pointerdown', 700, 600); // SE handle of M1
    s.fire('pointermove', 715, 605);
    s.fire('pointermove', 730, 610);
    // Ma extends 5 past the new right limit: lights up.
    expect(s.state.absorb.value).toEqual([{ x: 715, y: 150, width: 20, height: 40 }]);
    s.fire('pointerup', 730, 610);
    expect(s.state.absorb.value).toEqual([]);
    expect(s.markingRect('M1')).toEqual({ x: 100, y: 100, width: 635, height: 510 });
    expect(s.markingOf('Ma')?.parentId).toBe('M1');
    expect(s.store.undo()).toBe(true);
    expect(s.markingRect('M1')).toEqual({ x: 100, y: 100, width: 600, height: 500 });
    expect(s.markingOf('Ma')?.parentId).toBeNull();
    expect(s.store.canUndo.value).toBe(false);
    s.cleanup();
  });

  it('a handle that returns to the starting point absorbs nothing (it is not a resize)', () => {
    const base = canvasProject();
    const project = createMarking(base, {
      id: 'Ma',
      containerId: 'I1',
      rect: { x: 695, y: 150, width: 15, height: 40 }, // extends 10 past the right edge of M1
    });
    const s = setup(false, project);
    s.ui.selection.value = { kind: 'marking', id: 'M1' };
    s.fire('pointerdown', 700, 600);
    s.fire('pointermove', 740, 640);
    s.fire('pointermove', 700, 600);
    s.fire('pointerup', 700, 600);
    expect(s.markingRect('M1')).toEqual({ x: 100, y: 100, width: 600, height: 500 });
    expect(s.store.canUndo.value).toBe(false);
    s.cleanup();
  });

  it('resizing the canvas marking absorbs a container that crosses the edge', () => {
    const s = setup();
    const created = s.actions.createMarking(null, {
      x: -100,
      y: -100,
      width: 1150,
      height: 1000,
    });
    const id = created.ok ? created.value : '';
    // I2 (1100..1600) stays outside; the SE corner (1050, 900) goes to x = 1110: I2 extends 490 past (does not absorb).
    s.ui.selection.value = { kind: 'marking', id };
    s.drag([1050, 900], [1110, 900]);
    expect(s.markingRect(id)).toEqual({ x: -100, y: -100, width: 1210, height: 1000 });
    expect(s.containerOf('I2')?.parentId).toBeNull();
    // Now the right limit goes to 1595: I2 extends only 5 past → the rectangle grows up to 1600.
    s.drag([1110, 900], [1595, 900]);
    expect(s.markingRect(id)).toEqual({ x: -100, y: -100, width: 1700, height: 1000 });
    expect(s.containerOf('I2')?.parentId).toBe(id);
    s.cleanup();
  });

  it('moving does not absorb (only drawing and resizing)', () => {
    const base = canvasProject();
    // Ma crosses the right edge of M1 (700) by 10: a resize would absorb it.
    const project = createMarking(base, {
      id: 'Ma',
      containerId: 'I1',
      rect: { x: 695, y: 150, width: 15, height: 40 },
    });
    const s = setup(false, project);
    expect(s.markingOf('Ma')?.parentId).toBeNull();
    s.ui.selection.value = { kind: 'marking', id: 'M1' };
    s.drag([400, 400], [400, 380]); // up 20
    expect(s.markingRect('M1')).toEqual({ x: 100, y: 80, width: 600, height: 500 });
    expect(s.markingOf('Ma')?.parentId).toBeNull();
    s.cleanup();
  });

  it('cancel (Esc) in the middle of the move clears the highlights and undoes the gesture', () => {
    const s = setup();
    s.ui.selection.value = { kind: 'marking', id: 'M2' };
    s.fire('pointerdown', 250, 250);
    s.fire('pointermove', 1350, 300);
    expect(s.state.moveTarget.value).toBe('I2');
    expect(s.input.cancelInteraction()).toBe(true);
    expect(s.state.moveTarget.value).toBeNull();
    s.fire('pointerup', 1350, 300);
    expect(s.markingOf('M2')).toMatchObject({ containerId: 'I1' });
    expect(s.store.canUndo.value).toBe(false);
    s.cleanup();
  });

  it('a container inside a locked canvas marking does not move (inherited lock)', () => {
    const s = setup();
    const created = s.actions.createMarking(null, {
      x: -100,
      y: -100,
      width: 1800,
      height: 1000,
    });
    const id = created.ok ? created.value : '';
    expect(s.actions.setMarkingLocked(id, true).ok).toBe(true);
    const revision = s.store.revision.value;
    s.ui.selection.value = { kind: 'image', id: 'I2' };
    s.fire('pointermove', 1300, 300);
    expect(s.container.style.cursor).toBe('not-allowed');
    s.drag([1300, 300], [1400, 700]);
    expect(s.containerOf('I2')?.placement).toMatchObject({ x: 1100, y: 0 });
    expect(s.store.revision.value).toBe(revision);
    s.cleanup();
  });

  it('a tap on the empty canvas selects the canvas marking; right button opens its menu', () => {
    const s = setup();
    const created = s.actions.createMarking(null, {
      x: -100,
      y: -100,
      width: 1800,
      height: 1000,
    });
    const id = created.ok ? created.value : '';
    s.fire('pointerdown', 1050, 300);
    s.fire('pointerup', 1050, 300);
    expect(s.ui.selection.value).toEqual({ kind: 'marking', id });
    s.ui.selection.value = null;
    s.fire('pointerdown', 1050, 300, { button: 2 });
    s.container.dispatchEvent(
      new MouseEvent('contextmenu', {
        clientX: 1050,
        clientY: 300,
        bubbles: true,
        cancelable: true,
      }),
    );
    expect(s.ui.canvasMenu.value?.target).toEqual({ kind: 'm', id });
    s.cleanup();
  });

  it('the floating one receives the tap first, over the marking and the container', () => {
    const s = setup();
    const created = s.actions.createMarking(null, {
      x: 150,
      y: 150,
      width: 200,
      height: 120,
    });
    const id = created.ok ? created.value : '';
    expect(s.actions.setMarkingFloating(id, true).ok).toBe(true);
    s.fire('pointerdown', 250, 250); // also over the Handle (M2)
    s.fire('pointerup', 250, 250);
    expect(s.ui.selection.value).toEqual({ kind: 'marking', id });
    s.fire('pointerdown', 251, 251);
    s.fire('pointerup', 251, 251);
    expect(s.ui.selection.value).toEqual({ kind: 'marking', id: 'M2' });
    s.cleanup();
  });
});

// Multiple selection (Spatial markings stage, ME2): joint drag, Shift+click, double-click
// with the content and right button over the selection.
describe('PointerInput: multiple selection', () => {
  const im = (id: string): SelectionItem => ({ kind: 'image', id });
  const mk = (id: string): SelectionItem => ({ kind: 'marking', id });
  const ids = (s: ReturnType<typeof setup>) =>
    peekSelectedItems(s.ui).map((i) => `${i.kind}:${i.id}`);

  /**
   * `canvasProject` with a third container I3 (400×400) at (1800, 0) and the canvas marking
   * `C` (-100, -100, 2400×1000) around the three: all three are members of it.
   */
  function withGroup(): Project {
    let p = canvasProject();
    p = addContainer(p, { id: 'I3', file: 'images/c.jpg', width: 400, height: 400 });
    p = setContainerPlacement(p, 'I3', { x: 1800, y: 0, scale: 1 });
    return createMarking(p, {
      id: 'C',
      containerId: null,
      rect: { x: -100, y: -100, width: 2400, height: 1000 },
      name: 'Group',
    });
  }

  function groupSetup() {
    const s = setup(false, withGroup());
    expect(s.containerOf('I1')?.parentId).toBe('C');
    expect(s.containerOf('I3')?.parentId).toBe('C');
    return s;
  }

  describe('joint drag', () => {
    it('dragging the three containers and the canvas marking moves everything together, in a single entry', () => {
      const s = groupSetup();
      selectItems(s.ui, [im('I1'), im('I2'), im('I3'), mk('C')]);
      s.drag([1300, 300], [1400, 350]); // inside I2, which is not the primary
      expect(s.containerOf('I1')?.placement).toEqual({ x: 100, y: 50, scale: 1 });
      expect(s.containerOf('I2')?.placement).toEqual({ x: 1200, y: 50, scale: 1 });
      expect(s.containerOf('I3')?.placement).toEqual({ x: 1900, y: 50, scale: 1 });
      expect(s.markingRect('C')).toEqual({ x: 0, y: -50, width: 2400, height: 1000 });
      // The containers' markings go with them (relative coordinates) and the membership stays.
      expect(s.markingRect('M1')).toEqual({ x: 100, y: 100, width: 600, height: 500 });
      expect(s.markingRect('M3')).toEqual({ x: 50, y: 50, width: 200, height: 200 });
      for (const id of ['I1', 'I2', 'I3']) expect(s.containerOf(id)?.parentId).toBe('C');
      // The selection stays whole, with the same primary as before.
      expect(ids(s)).toEqual(['image:I1', 'image:I2', 'image:I3', 'marking:C']);
      expect(s.ui.selection.value).toEqual(mk('C'));
      // One Ctrl+Z undoes everything.
      expect(s.store.undo()).toBe(true);
      expect(s.containerOf('I1')?.placement).toEqual({ x: 0, y: 0, scale: 1 });
      expect(s.containerOf('I2')?.placement).toEqual({ x: 1100, y: 0, scale: 1 });
      expect(s.containerOf('I3')?.placement).toEqual({ x: 1800, y: 0, scale: 1 });
      expect(s.markingRect('C')).toEqual({ x: -100, y: -100, width: 2400, height: 1000 });
      expect(s.store.canUndo.value).toBe(false);
      s.cleanup();
    });

    it('dragging inside the primary (the canvas marking) also moves the whole selection', () => {
      const s = groupSetup();
      selectItems(s.ui, [im('I1'), im('I2'), mk('C')]);
      s.drag([1050, 300], [1050, 350]); // on the empty canvas between the screens, inside C
      expect(s.containerOf('I1')?.placement).toEqual({ x: 0, y: 50, scale: 1 });
      expect(s.containerOf('I2')?.placement).toEqual({ x: 1100, y: 50, scale: 1 });
      expect(s.containerOf('I3')?.placement).toEqual({ x: 1800, y: 0, scale: 1 }); // outside the selection
      expect(s.markingRect('C')).toEqual({ x: -100, y: -50, width: 2400, height: 1000 });
      s.cleanup();
    });

    it('a move that would overlap a fixed container snaps against it, and releasing records that position', () => {
      const s = groupSetup();
      selectItems(s.ui, [im('I1'), im('I2')]); // I3 stays out
      s.fire('pointerdown', 1300, 300);
      s.fire('pointermove', 1400, 300);
      s.fire('pointermove', 1450, 300); // +150: I2 goes to 1250..1750, before I3 (1800)
      expect(s.containerOf('I2')?.placement.x).toBe(1250);
      expect(s.containerOf('I1')?.placement.x).toBe(150);
      s.fire('pointermove', 1700, 300); // +400: I2 would go over I3 and snaps against it (+200)
      expect(s.containerOf('I2')?.placement.x).toBe(1300);
      expect(s.containerOf('I1')?.placement.x).toBe(200);
      s.fire('pointermove', 1460, 300); // back: the preview follows the pointer
      expect(s.containerOf('I2')?.placement.x).toBe(1260);
      expect(s.containerOf('I1')?.placement.x).toBe(160);
      s.fire('pointermove', 1800, 300); // again past I3
      s.fire('pointerup', 1800, 300); // released past: records the snapped position
      expect(s.containerOf('I2')?.placement.x).toBe(1300);
      expect(s.containerOf('I1')?.placement.x).toBe(200);
      expect(s.containerOf('I3')?.placement.x).toBe(1800);
      expect(s.store.gestureActive.value).toBe(false);
      expect(s.store.undo()).toBe(true);
      expect(s.containerOf('I2')?.placement.x).toBe(1100);
      expect(s.containerOf('I1')?.placement.x).toBe(0);
      expect(s.store.canUndo.value).toBe(false);
      s.cleanup();
    });

    it('a container marking that would leave the container stays at the last valid position', () => {
      const s = groupSetup();
      selectItems(s.ui, [mk('M3'), mk('C')]);
      s.fire('pointerdown', 1050, 300); // inside C
      s.fire('pointermove', 1100, 300);
      s.fire('pointermove', 1150, 300); // +100: M3 (50..250) goes to 150..350 in I2 (500 wide)
      expect(s.markingRect('M3')).toEqual({ x: 150, y: 50, width: 200, height: 200 });
      s.fire('pointermove', 1450, 300); // +400: M3 would go past the edge of I2
      expect(s.markingRect('M3')?.x).toBe(150);
      expect(s.markingRect('C')?.x).toBe(0);
      s.fire('pointerup', 1450, 300);
      expect(s.markingRect('M3')).toEqual({ x: 150, y: 50, width: 200, height: 200 });
      expect(s.markingOf('M3')?.containerId).toBe('I2'); // did not change space
      expect(s.markingRect('C')).toEqual({ x: 0, y: -100, width: 2400, height: 1000 });
      expect(s.store.undo()).toBe(true);
      expect(s.markingRect('M3')?.x).toBe(50);
      expect(s.markingRect('C')?.x).toBe(-100);
      expect(s.store.canUndo.value).toBe(false);
      s.cleanup();
    });

    it('membership stays frozen during the drag and is settled on release', () => {
      const s = groupSetup();
      selectItems(s.ui, [im('I1'), im('I2')]);
      s.fire('pointerdown', 1300, 300);
      s.fire('pointermove', 1300, 800);
      s.fire('pointermove', 1300, 1300); // +1000 down: both screens leave C
      expect(s.containerOf('I1')?.placement.y).toBe(1000);
      expect(s.containerOf('I1')?.parentId).toBe('C');
      expect(s.containerOf('I2')?.parentId).toBe('C');
      s.fire('pointerup', 1300, 1300);
      expect(s.containerOf('I1')?.parentId).toBeNull();
      expect(s.containerOf('I2')?.parentId).toBeNull();
      expect(s.containerOf('I3')?.parentId).toBe('C');
      expect(s.store.undo()).toBe(true);
      expect(s.containerOf('I1')?.parentId).toBe('C');
      expect(s.containerOf('I1')?.placement.y).toBe(0);
      expect(s.store.canUndo.value).toBe(false);
      s.cleanup();
    });

    it('Esc cancels the joint drag: nothing changes and there is no undo entry', () => {
      const s = groupSetup();
      selectItems(s.ui, [im('I1'), im('I2'), mk('C')]);
      s.fire('pointerdown', 1300, 300);
      s.fire('pointermove', 1400, 350);
      expect(s.containerOf('I2')?.placement.x).toBe(1200);
      expect(s.input.cancelInteraction()).toBe(true);
      expect(s.containerOf('I2')?.placement).toEqual({ x: 1100, y: 0, scale: 1 });
      expect(s.markingRect('C')?.x).toBe(-100);
      s.fire('pointermove', 1500, 400); // the rest of the drag is ignored
      s.fire('pointerup', 1500, 400);
      expect(s.containerOf('I2')?.placement).toEqual({ x: 1100, y: 0, scale: 1 });
      expect(s.store.canUndo.value).toBe(false);
      expect(s.store.gestureActive.value).toBe(false);
      expect(ids(s)).toEqual(['image:I1', 'image:I2', 'marking:C']); // the selection stays
      s.cleanup();
    });

    it('pointercancel also cancels', () => {
      const s = groupSetup();
      selectItems(s.ui, [im('I1'), im('I2')]);
      s.fire('pointerdown', 1300, 300);
      s.fire('pointermove', 1400, 350);
      s.fire('pointercancel', 1400, 350);
      expect(s.containerOf('I2')?.placement).toEqual({ x: 1100, y: 0, scale: 1 });
      expect(s.store.canUndo.value).toBe(false);
      s.cleanup();
    });

    it('a second finger cancels the joint drag', () => {
      const s = groupSetup();
      selectItems(s.ui, [im('I1'), im('I2')]);
      s.fire('pointerdown', 1300, 300);
      s.fire('pointermove', 1400, 350);
      expect(s.containerOf('I2')?.placement.x).toBe(1200);
      s.fire('pointerdown', 100, 100, { id: 2, kind: 'touch' });
      expect(s.containerOf('I2')?.placement).toEqual({ x: 1100, y: 0, scale: 1 });
      expect(s.store.gestureActive.value).toBe(false);
      s.cleanup();
    });

    it('with a locked item the drag does not start: "not allowed" cursor, no pan or entry', () => {
      const s = groupSetup();
      expect(s.actions.setImageLocked('I3', true).ok).toBe(true);
      const revision = s.store.revision.value;
      selectItems(s.ui, [im('I1'), im('I2'), im('I3'), mk('C')]);
      s.fire('pointermove', 1300, 300);
      expect(s.container.style.cursor).toBe('not-allowed');
      s.drag([1300, 300], [1400, 350]);
      expect(s.containerOf('I2')?.placement).toEqual({ x: 1100, y: 0, scale: 1 });
      expect(s.containerOf('I1')?.placement).toEqual({ x: 0, y: 0, scale: 1 });
      expect(s.viewport.viewport.value).toMatchObject({ x: 0, y: 0 });
      expect(s.store.revision.value).toBe(revision);
      expect(s.store.gestureActive.value).toBe(false);
      s.cleanup();
    });

    it("the primary's handles still resize only the primary", () => {
      const s = groupSetup();
      selectItems(s.ui, [im('I2'), mk('M2')]);
      s.drag([300, 300], [340, 360]); // SE corner of M2
      expect(s.markingRect('M2')).toEqual({ x: 200, y: 200, width: 140, height: 160 });
      expect(s.containerOf('I2')?.placement).toEqual({ x: 1100, y: 0, scale: 1 });
      s.cleanup();
    });

    it('cursor: "move" over any selected item, nothing outside them', () => {
      const s = groupSetup();
      selectItems(s.ui, [im('I2'), mk('M2')]);
      s.fire('pointermove', 1300, 300); // inside I2
      expect(s.container.style.cursor).toBe('move');
      s.fire('pointermove', 250, 250); // inside M2
      expect(s.container.style.cursor).toBe('move');
      s.fire('pointermove', 900, 700); // I1, not selected
      expect(s.container.style.cursor).toBe('');
      s.cleanup();
    });

    it('touch: dragging over the multiple selection pans, without moving anything', () => {
      const s = groupSetup();
      selectItems(s.ui, [im('I1'), im('I2')]);
      s.drag([1300, 300], [1350, 330], { kind: 'touch' });
      expect(s.containerOf('I2')?.placement).toEqual({ x: 1100, y: 0, scale: 1 });
      expect(s.viewport.viewport.value).toMatchObject({ x: 50, y: 30, scale: 1 });
      s.cleanup();
    });

    it('a drag at a zoom other than 1 uses the offset on the canvas', () => {
      const s = groupSetup();
      s.viewport.viewport.value = { x: 0, y: 0, scale: 2 };
      selectItems(s.ui, [im('I1'), im('I2'), mk('C')]);
      s.drag([2600, 600], [2800, 700]); // (1300, 300) -> (1400, 350) on the canvas
      expect(s.containerOf('I2')?.placement).toEqual({ x: 1200, y: 50, scale: 1 });
      expect(s.markingRect('C')).toEqual({ x: 0, y: -50, width: 2400, height: 1000 });
      s.cleanup();
    });
  });

  describe('Ctrl/Cmd+click', () => {
    const platform = (value: string) =>
      vi.spyOn(globalThis.navigator, 'platform', 'get').mockReturnValue(value);
    afterEach(() => vi.restoreAllMocks());

    it('Ctrl+click (outside macOS) and Cmd+click add and remove like Shift+click', () => {
      platform('Win32');
      const s = setup();
      s.click(250, 250); // M2
      s.click(1300, 300, { ctrl: true }); // I2
      expect(ids(s)).toEqual(['marking:M2', 'image:I2']);
      s.click(1200, 100, { meta: true }); // M3
      expect(ids(s)).toEqual(['marking:M2', 'image:I2', 'marking:M3']);
      s.click(1300, 300, { ctrl: true }); // I2 leaves
      expect(ids(s)).toEqual(['marking:M2', 'marking:M3']);
      s.cleanup();
    });

    it('on macOS, Ctrl+click does not add (it is the right click); Cmd+click adds', () => {
      platform('MacIntel');
      const s = setup();
      s.click(250, 250); // M2
      s.click(1300, 300, { ctrl: true });
      expect(ids(s)).toEqual(['image:I2']);
      s.click(250, 250);
      s.click(1300, 300, { meta: true });
      expect(ids(s)).toEqual(['marking:M2', 'image:I2']);
      s.cleanup();
    });
  });

  describe('Shift+click', () => {
    it('adds the item to the selection and, clicking again, removes it', () => {
      const s = setup();
      s.click(250, 250); // M2
      expect(ids(s)).toEqual(['marking:M2']);
      s.click(1300, 300, { shift: true }); // I2 (outside M3)
      expect(ids(s)).toEqual(['marking:M2', 'image:I2']);
      expect(s.ui.selection.value).toEqual(im('I2')); // the last clicked is the primary
      s.click(1200, 100, { shift: true }); // M3, inside I2
      expect(ids(s)).toEqual(['marking:M2', 'image:I2', 'marking:M3']);
      expect(s.ui.selection.value).toEqual(mk('M3'));
      s.click(1300, 300, { shift: true }); // I2 leaves
      expect(ids(s)).toEqual(['marking:M2', 'marking:M3']);
      expect(s.ui.selection.value).toEqual(mk('M3'));
      s.click(1200, 100, { shift: true }); // the primary leaves: the last of those that remain replaces it
      expect(ids(s)).toEqual(['marking:M2']);
      expect(s.ui.selection.value).toEqual(mk('M2'));
      expect(s.ui.selectionGroup.value).toBeNull();
      s.cleanup();
    });

    it('it is the first item under the point, without the cycle of going up to the parent', () => {
      const s = setup();
      s.click(250, 250, { shift: true });
      s.click(252, 251, { shift: true }); // at the same point: does not go up to the Door (M1)
      // The first of the chain (M2) went in and out; the Door and the image were never chosen.
      expect(ids(s)).toEqual([]);
      s.click(250, 250, { shift: true });
      s.click(250, 250, { shift: true });
      s.click(250, 250, { shift: true });
      expect(ids(s)).toEqual(['marking:M2']);
      s.cleanup();
    });

    it('Shift on the empty canvas changes nothing', () => {
      const s = setup();
      selectItems(s.ui, [im('I2'), mk('M2')]);
      const before = s.ui.selection.value;
      s.click(1050, 900, { shift: true });
      expect(ids(s)).toEqual(['image:I2', 'marking:M2']);
      expect(s.ui.selection.value).toBe(before);
      s.cleanup();
    });

    it('without Shift, a tap selects a single item and undoes the group', () => {
      const s = setup();
      selectItems(s.ui, [im('I2'), mk('M2')]);
      s.click(1200, 100); // M3
      expect(ids(s)).toEqual(['marking:M3']);
      s.cleanup();
    });

    it('dragging with Shift held moves; only a tap without a drag toggles', () => {
      const s = setup();
      selectItems(s.ui, [mk('M1')]);
      s.fire('pointerdown', 400, 400, { shift: true });
      s.fire('pointermove', 450, 430, { shift: true });
      s.fire('pointermove', 500, 450, { shift: true });
      s.fire('pointerup', 500, 450, { shift: true });
      expect(s.markingRect('M1')).toEqual({ x: 200, y: 150, width: 600, height: 500 });
      expect(ids(s)).toEqual(['marking:M1']);
      s.cleanup();
    });

    it('in review, Shift+click is a simple click', () => {
      const s = setup();
      s.click(250, 250); // M2
      s.setReviewing(true);
      s.click(1200, 100, { shift: true });
      expect(ids(s)).toEqual(['marking:M3']);
      expect(s.ui.selectionGroup.value).toBeNull();
      s.cleanup();
    });

    it('a simple click after Shift+click does not continue the go-up cycle', () => {
      const s = setup();
      s.click(250, 250, { shift: true }); // M2 enters
      s.click(250, 250); // simple click at the same point: the first of the chain, not the parent
      expect(ids(s)).toEqual(['marking:M2']);
      s.cleanup();
    });
  });

  describe('double-click selects with the content', () => {
    it('on a canvas marking: it and the containers inside, with their markings; it is the primary', () => {
      const s = groupSetup();
      s.doubleClick(1050, 300); // empty canvas between the screens, inside C
      expect(ids(s)).toEqual([
        'image:I1',
        'marking:M1',
        'marking:M2',
        'image:I2',
        'marking:M3',
        'image:I3',
        'marking:C',
      ]);
      expect(s.ui.selection.value).toEqual(mk('C'));
      s.cleanup();
    });

    it('the next drag moves the set: the relative positions stay and it is one Ctrl+Z', () => {
      const s = groupSetup();
      s.doubleClick(1050, 300);
      s.drag([1300, 300], [1350, 340]);
      expect(s.containerOf('I1')?.placement).toEqual({ x: 50, y: 40, scale: 1 });
      expect(s.containerOf('I2')?.placement).toEqual({ x: 1150, y: 40, scale: 1 });
      expect(s.containerOf('I3')?.placement).toEqual({ x: 1850, y: 40, scale: 1 });
      expect(s.markingRect('C')).toEqual({ x: -50, y: -60, width: 2400, height: 1000 });
      expect(s.store.undo()).toBe(true);
      expect(s.store.canUndo.value).toBe(false);
      s.cleanup();
    });

    it('the target is what the first click selected (the innermost), not the next step', () => {
      const s = setup();
      s.doubleClick(400, 400); // inside the Door (M1, with the child M2), outside the Handle
      expect(ids(s)).toEqual(['marking:M2', 'marking:M1']);
      expect(s.ui.selection.value).toEqual(mk('M1'));
      s.cleanup();
    });

    it('on a marking without content it selects only it', () => {
      const s = setup();
      s.doubleClick(250, 250); // Handle, the innermost
      expect(ids(s)).toEqual(['marking:M2']);
      expect(s.ui.selectionGroup.value).toBeNull();
      s.cleanup();
    });

    it('on a container it only returns the selection to it', () => {
      const s = groupSetup();
      // Between the markings of I1: the chain is [I1, C]; the second tap would go up to C.
      s.doubleClick(900, 700);
      expect(ids(s)).toEqual(['image:I1']);
      expect(s.ui.selection.value).toEqual(im('I1'));
      s.cleanup();
    });

    it('resets the cycle: the next click at the same point starts again from the first of the chain', () => {
      const s = setup();
      s.doubleClick(400, 400);
      s.click(402, 401); // near the double-click
      expect(ids(s)).toEqual(['marking:M1']); // the first of the chain, not the next step
      s.cleanup();
    });

    it('on the empty canvas it does nothing', () => {
      const s = setup();
      s.doubleClick(1050, 900);
      expect(ids(s)).toEqual([]);
      s.cleanup();
    });

    it('only in Navigate mode', () => {
      const s = groupSetup();
      s.ui.mode.value = 'draw';
      s.doubleClick(1050, 300);
      expect(ids(s)).toEqual(['marking:C']);
      s.cleanup();
    });

    it('a finger touch (not a mouse) or review does not select the content', () => {
      const s = groupSetup();
      s.click(1050, 300, { kind: 'touch' });
      s.click(1050, 300, { kind: 'touch' });
      s.container.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      expect(ids(s)).toEqual(['marking:C']);
      const t = groupSetup();
      t.setReviewing(true);
      t.doubleClick(1050, 300);
      expect(ids(t)).toEqual(['marking:C']);
      s.cleanup();
      t.cleanup();
    });

    it('a drag in the middle of the double-click undoes it', () => {
      const s = groupSetup();
      s.click(1050, 300); // C
      s.drag([1050, 300], [1100, 300]); // the second "click" was a drag (pan, no selection)
      s.container.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      expect(ids(s)).toEqual(['marking:C']);
      s.cleanup();
    });
  });

  describe('right button', () => {
    it('over an item already in the multiple selection does not undo the selection', () => {
      const s = setup();
      selectItems(s.ui, [mk('M3'), mk('M2')]);
      const primary = s.ui.selection.value;
      s.rightClick(1200, 100); // M3, in the selection but not primary
      expect(ids(s)).toEqual(['marking:M3', 'marking:M2']);
      expect(s.ui.selection.value).toBe(primary);
      expect(s.ui.canvasMenu.value?.target).toEqual({ kind: 'm', id: 'M3' });
      s.rightClick(250, 250); // M2, the primary
      expect(ids(s)).toEqual(['marking:M3', 'marking:M2']);
      expect(s.ui.canvasMenu.value?.target).toEqual({ kind: 'm', id: 'M2' });
      s.cleanup();
    });

    it('over another item the behavior is the usual: selects only it', () => {
      const s = setup();
      selectItems(s.ui, [mk('M3'), mk('M2')]);
      s.rightClick(400, 400); // M1, outside the selection
      expect(ids(s)).toEqual(['marking:M1']);
      expect(s.ui.canvasMenu.value?.target).toEqual({ kind: 'm', id: 'M1' });
      s.cleanup();
    });
  });
});

// Arrows (ME4): select by the stroke, create by the link handle, waypoints, swap the
// end and the side. Arrow project: r1 from a1 (100,100,300,300) to a3 (600,600,200,200), in
// container A (scale 1, at 0,0); the curve leaves at (400,250) and arrives at (600,700). Each gesture is
// one undo entry.
describe('PointerInput: arrows (ME4)', () => {
  const arrowsOf = (s: ReturnType<typeof setup>) => s.store.project.peek()?.arrows ?? [];
  const r1 = (s: ReturnType<typeof setup>) => arrowsOf(s).find((a) => a.id === 'r1');
  const straightProject = () => setArrowStyle(arrowProject(), 'r1', 'straight');
  const select = (s: ReturnType<typeof setup>, selection: Selection) => {
    s.ui.selection.value = selection;
  };
  const undoAll = (s: ReturnType<typeof setup>) => {
    let n = 0;
    while (s.store.canUndo.value && s.store.undo()) n++;
    return n;
  };

  afterEach(() => setShowArrows(true));

  describe('selection by the stroke', () => {
    it('clicking near the stroke selects the arrow; far from it, the container; Shift toggles', () => {
      const s = setup(false, straightProject());
      s.click(500, 475);
      expect(s.ui.selection.value).toEqual({ kind: 'arrow', id: 'r1' });
      s.click(900, 100); // inside A, far from everything
      expect(s.ui.selection.value).toEqual({ kind: 'image', id: 'A' });
      // Shift+click adds the arrow to the selection and again removes it.
      s.click(500, 475, { shift: true });
      expect(peekSelectedItems(s.ui)).toEqual([
        { kind: 'image', id: 'A' },
        { kind: 'arrow', id: 'r1' },
      ]);
      s.click(500, 475, { shift: true });
      expect(peekSelectedItems(s.ui)).toEqual([{ kind: 'image', id: 'A' }]);
      s.cleanup();
    });

    it('"Show arrows" off or view mode: the stroke does not receive the tap', () => {
      const s = setup(false, straightProject());
      setShowArrows(false);
      s.click(500, 475);
      expect(s.ui.selection.value).toEqual({ kind: 'image', id: 'A' });
      setShowArrows(true);
      setOnlyScreens(s.ui, true);
      s.click(500, 475);
      expect(s.ui.selection.value).toEqual({ kind: 'image', id: 'A' });
      s.cleanup();
    });

    it('in view mode, even with the arrows in view, the stroke does not receive the tap and the mode does not become Draw', () => {
      const s = setup(false, straightProject());
      s.ui.mode.value = 'draw';
      setViewMode(s.ui, true);
      expect(s.ui.mode.value).toBe('navigate');
      s.click(500, 475);
      expect(s.ui.selection.value).toEqual({ kind: 'image', id: 'A' });
      s.cleanup();
    });

    it('an arrow whose end is hidden by the display mode does not receive the tap', () => {
      const s = setup(false, straightProject());
      s.derived.markingVisibility.peek(); // visibility map of the current mode
      const hidden = vi
        .spyOn(s.derived.markingVisibility, 'peek')
        .mockReturnValue(new Map([['a3', 'hidden' as const]]));
      s.click(500, 475);
      expect(s.ui.selection.value).toEqual({ kind: 'image', id: 'A' });
      hidden.mockRestore();
      s.cleanup();
    });

    it('right button on the stroke selects the arrow and opens its menu', () => {
      const s = setup(false, straightProject());
      s.rightClick(500, 475);
      expect(s.ui.selection.value).toEqual({ kind: 'arrow', id: 'r1' });
      expect(s.ui.canvasMenu.value?.target).toEqual({ kind: 'arrow', id: 'r1' });
      s.cleanup();
    });

    it('clicking on a handle does not change the selection (nor go up the chain)', () => {
      const s = setup(false, straightProject());
      select(s, { kind: 'arrow', id: 'r1' });
      s.click(400, 250);
      s.click(400, 250);
      expect(s.ui.selection.value).toEqual({ kind: 'arrow', id: 'r1' });
      select(s, { kind: 'marking', id: 'a1' });
      s.click(414, 250); // link handle
      expect(s.ui.selection.value).toEqual({ kind: 'marking', id: 'a1' });
      s.cleanup();
    });

    it('cursor: end handle aims, waypoint moves, locked stroke does not allow', () => {
      const s = setup(false, straightProject());
      select(s, { kind: 'arrow', id: 'r1' });
      s.input.updateCursor({ x: 400, y: 250 });
      expect(s.container.style.cursor).toBe('crosshair');
      s.input.updateCursor({ x: 500, y: 475 });
      expect(s.container.style.cursor).toBe('move');
      s.input.updateCursor({ x: 900, y: 100 });
      expect(s.container.style.cursor).toBe('');
      select(s, { kind: 'marking', id: 'a1' });
      s.input.updateCursor({ x: 414, y: 250 });
      expect(s.container.style.cursor).toBe('crosshair');
      s.cleanup();
    });
  });

  describe('create by the link handle', () => {
    it('pulling to another marking lights up the target, creates the arrow and selects it (one entry)', () => {
      const s = setup(false, arrowProject());
      select(s, { kind: 'marking', id: 'a1' });
      s.fire('pointerdown', 414, 250);
      s.fire('pointermove', 440, 300);
      s.fire('pointermove', 700, 700);
      expect(s.state.arrowDraft.value).toEqual({
        line: { from: { x: 400, y: 250 }, to: { x: 700, y: 700 } },
        target: 'a3',
      });
      // Nothing was created or entered in the history yet.
      expect(arrowsOf(s)).toHaveLength(1);
      s.fire('pointerup', 700, 700);
      const created = arrowsOf(s)[1];
      expect(created).toMatchObject({ from: 'a1', to: 'a3', style: 'curve', points: [] });
      expect(s.ui.selection.value).toEqual({ kind: 'arrow', id: created?.id });
      expect(s.state.arrowDraft.value).toBeNull();
      // The source marking did not change, and undo removes only the arrow.
      expect(s.markingRect('a1')).toEqual({ x: 100, y: 100, width: 300, height: 300 });
      expect(s.store.undo()).toBe(true);
      expect(arrowsOf(s)).toHaveLength(1);
      s.cleanup();
    });

    it('releasing outside a marking or over the source cancels, with no entry', () => {
      const s = setup(false, arrowProject());
      select(s, { kind: 'marking', id: 'a1' });
      const before = s.store.canUndo.value;
      s.drag([414, 250], [3000, 3000]);
      expect(arrowsOf(s)).toHaveLength(1);
      s.fire('pointerdown', 414, 250);
      s.fire('pointermove', 450, 280);
      s.fire('pointermove', 350, 350); // over the source itself: it is not a target
      expect(s.state.arrowDraft.value?.target).toBeNull();
      s.fire('pointerup', 350, 350);
      expect(arrowsOf(s)).toHaveLength(1);
      expect(s.store.canUndo.value).toBe(before);
      expect(s.ui.selection.value).toEqual({ kind: 'marking', id: 'a1' });
      s.cleanup();
    });

    it('Esc in the middle of the gesture cancels and deletes the provisional arrow', () => {
      const s = setup(false, arrowProject());
      select(s, { kind: 'marking', id: 'a1' });
      s.fire('pointerdown', 414, 250);
      s.fire('pointermove', 450, 280);
      s.fire('pointermove', 700, 700);
      expect(s.state.arrowDraft.value).not.toBeNull();
      expect(s.input.cancelInteraction()).toBe(true);
      expect(s.state.arrowDraft.value).toBeNull();
      s.fire('pointerup', 700, 700);
      expect(arrowsOf(s)).toHaveLength(1);
      s.cleanup();
    });

    it('works for the locked marking (the marking does not change) and not for read-only', () => {
      const locked = setMarkingLocked(arrowProject(), 'a1', true);
      const s = setup(false, locked);
      select(s, { kind: 'marking', id: 'a1' });
      s.drag([414, 250], [700, 700]);
      expect(arrowsOf(s)).toHaveLength(2);
      s.cleanup();
      const ro = setup(true, arrowProject());
      select(ro, { kind: 'marking', id: 'a1' });
      ro.drag([414, 250], [700, 700]);
      expect(arrowsOf(ro)).toHaveLength(1);
      ro.cleanup();
    });

    it('the target is the first marking under the pointer: the floating one, over the others', () => {
      const project = createMarking(arrowProject(), {
        id: 'F1',
        containerId: null,
        rect: { x: 650, y: 650, width: 100, height: 100 },
        floating: true,
      });
      const s = setup(false, project);
      select(s, { kind: 'marking', id: 'a1' });
      s.drag([414, 250], [700, 700]);
      expect(arrowsOf(s)[1]).toMatchObject({ from: 'a1', to: 'F1' });
      s.cleanup();
    });
  });

  describe('waypoints', () => {
    it('dragging the middle of a segment creates a point there (one entry)', () => {
      const s = setup(false, straightProject());
      select(s, { kind: 'arrow', id: 'r1' });
      s.drag([500, 475], [560, 420]);
      expect(r1(s)?.points).toEqual([{ x: 560, y: 420 }]);
      expect(r1(s)?.fromSide).toBeNull();
      expect(undoAll(s)).toBe(1);
      expect(r1(s)?.points).toEqual([]);
      s.cleanup();
    });

    it('moving a waypoint; the point lands on whole container pixels', () => {
      const project = setArrowRoute(straightProject(), 'r1', [{ x: 700, y: 300 }]);
      const s = setup(false, project);
      select(s, { kind: 'arrow', id: 'r1' });
      s.fire('pointerdown', 700, 300);
      s.fire('pointermove', 710, 310);
      s.fire('pointermove', 720.4, 330.6);
      // During the gesture the preview already shows the new point, but there is no history entry.
      expect(r1(s)?.points).toEqual([{ x: 720, y: 331 }]);
      expect(s.store.canUndo.value).toBe(false);
      s.fire('pointerup', 720.4, 330.6);
      expect(r1(s)?.points).toEqual([{ x: 720, y: 331 }]);
      expect(undoAll(s)).toBe(1);
      expect(r1(s)?.points).toEqual([{ x: 700, y: 300 }]);
      s.cleanup();
    });

    describe('elbow: dragging a segment', () => {
      // r1 in a corner: (400,250) → (500,250) → (500,700) → (600,700); the guide is x = 500.
      const elbowProject = (points: { x: number; y: number }[] = []) =>
        setArrowStyle(setArrowRoute(arrowProject(), 'r1', points), 'r1', 'elbow');
      const route = (s: ReturnType<typeof setup>) => {
        const project = s.store.project.peek();
        const arrow = r1(s);
        if (!project || !arrow) throw new Error('arrow');
        return arrowRoute(project, arrow)?.points;
      };

      it('moves the segment in parallel, keeps the right angles and records one entry', () => {
        const s = setup(false, elbowProject());
        select(s, { kind: 'arrow', id: 'r1' });
        s.fire('pointerdown', 500, 475);
        s.fire('pointermove', 520, 470);
        s.fire('pointermove', 560.4, 300);
        // The preview: only x follows the pointer; the point's y stays in the middle of the segment.
        expect(r1(s)?.points).toEqual([{ x: 560, y: 475 }]);
        expect(route(s)).toEqual([
          { x: 400, y: 250 },
          { x: 560, y: 250 },
          { x: 560, y: 700 },
          { x: 600, y: 700 },
        ]);
        expect(s.store.canUndo.value).toBe(false);
        s.fire('pointerup', 560.4, 300);
        expect(r1(s)?.points).toEqual([{ x: 560, y: 475 }]);
        expect(undoAll(s)).toBe(1);
        expect(r1(s)?.points).toEqual([]);
        s.cleanup();
      });

      it('the whole segment takes the drag, not only the middle handle', () => {
        const s = setup(false, elbowProject([{ x: 500, y: 475 }]));
        select(s, { kind: 'arrow', id: 'r1' });
        s.drag([498, 640], [450, 640]);
        expect(r1(s)?.points).toEqual([{ x: 450, y: 475 }]);
        s.cleanup();
      });

      it('a first segment (which is not the middle one) pans, without touching the route', () => {
        const s = setup(false, elbowProject());
        select(s, { kind: 'arrow', id: 'r1' });
        s.drag([450, 250], [470, 280]);
        expect(r1(s)?.points).toEqual([]);
        expect(s.store.canUndo.value).toBe(false);
        s.cleanup();
      });

      it('resize cursor on the drag axis', () => {
        const s = setup(false, elbowProject());
        select(s, { kind: 'arrow', id: 'r1' });
        s.input.updateCursor({ x: 500, y: 600 });
        expect(s.container.style.cursor).toBe('ew-resize');
        s.cleanup();
      });

      it('double-click on the segment returns to the default route (one entry)', () => {
        const s = setup(false, elbowProject([{ x: 560, y: 475 }]));
        select(s, { kind: 'arrow', id: 'r1' });
        s.doubleClick(560, 600);
        expect(r1(s)?.points).toEqual([]);
        expect(s.ui.selection.value).toEqual({ kind: 'arrow', id: 'r1' });
        expect(undoAll(s)).toBe(1);
        expect(r1(s)?.points).toEqual([{ x: 560, y: 475 }]);
        s.cleanup();
      });

      it('locked and read-only arrow: the segment does not move', () => {
        const ro = setup(true, elbowProject());
        select(ro, { kind: 'arrow', id: 'r1' });
        ro.drag([500, 600], [560, 600]);
        expect(r1(ro)?.points).toEqual([]);
        ro.cleanup();
        const locked = setup(false, {
          ...elbowProject(),
          arrows: elbowProject().arrows.map((a) => ({ ...a, locked: true })),
        });
        select(locked, { kind: 'arrow', id: 'r1' });
        locked.drag([500, 600], [560, 600]);
        expect(r1(locked)?.points).toEqual([]);
        expect(locked.store.canUndo.value).toBe(false);
        locked.cleanup();
      });

      it('cancel (Esc) restores the points', () => {
        const s = setup(false, elbowProject());
        select(s, { kind: 'arrow', id: 'r1' });
        s.fire('pointerdown', 500, 600);
        s.fire('pointermove', 520, 600);
        s.fire('pointermove', 580, 600);
        expect(r1(s)?.points).toHaveLength(1);
        expect(s.input.cancelInteraction()).toBe(true);
        expect(r1(s)?.points).toEqual([]);
        s.fire('pointerup', 580, 600);
        expect(s.store.canUndo.value).toBe(false);
        s.cleanup();
      });
    });

    it('the new point goes to the right position among the existing points', () => {
      const project = setArrowRoute(straightProject(), 'r1', [
        { x: 700, y: 300 },
        { x: 700, y: 500 },
      ]);
      const s = setup(false, project);
      select(s, { kind: 'arrow', id: 'r1' });
      // Middle of the second segment: between (700,300) and (700,500) = (700,400), position 1.
      s.drag([700, 400], [760, 400]);
      expect(r1(s)?.points).toEqual([
        { x: 700, y: 300 },
        { x: 760, y: 400 },
        { x: 700, y: 500 },
      ]);
      s.cleanup();
    });

    it('double-click on a waypoint removes it and keeps the arrow selected', () => {
      const project = setArrowRoute(straightProject(), 'r1', [
        { x: 700, y: 300 },
        { x: 700, y: 500 },
      ]);
      const s = setup(false, project);
      select(s, { kind: 'arrow', id: 'r1' });
      s.doubleClick(700, 300);
      expect(r1(s)?.points).toEqual([{ x: 700, y: 500 }]);
      expect(s.ui.selection.value).toEqual({ kind: 'arrow', id: 'r1' });
      expect(undoAll(s)).toBe(1);
      expect(r1(s)?.points).toHaveLength(2);
      s.cleanup();
    });

    it('double-click outside a waypoint removes nothing', () => {
      const project = setArrowRoute(straightProject(), 'r1', [{ x: 700, y: 300 }]);
      const s = setup(false, project);
      select(s, { kind: 'arrow', id: 'r1' });
      s.doubleClick(550, 276); // the middle of the segment, not a point
      expect(r1(s)?.points).toHaveLength(1);
      s.cleanup();
    });

    it('locked arrow: dragging the stroke does nothing (not even pan); read-only: pan', () => {
      const locked = withArrow(straightProject(), 'r2', 'a3', 'b2', {
        style: 'straight',
        locked: true,
      });
      const s = setup(false, locked);
      select(s, { kind: 'arrow', id: 'r2' });
      s.input.updateCursor({ x: 800, y: 700 });
      expect(s.container.style.cursor).toBe('not-allowed');
      s.fire('pointerdown', 800, 700);
      s.fire('pointermove', 830, 720);
      s.fire('pointermove', 900, 760);
      s.fire('pointerup', 900, 760);
      expect(arrowsOf(s).find((a) => a.id === 'r2')?.points).toEqual([]);
      expect(s.viewport.viewport.value).toMatchObject({ x: 0, y: 0 });
      expect(s.store.canUndo.value).toBe(false);
      s.doubleClick(800, 700);
      expect(s.store.canUndo.value).toBe(false);
      s.cleanup();
      const ro = setup(true, straightProject());
      select(ro, { kind: 'arrow', id: 'r1' });
      ro.drag([500, 475], [560, 420]);
      expect(r1(ro)?.points).toEqual([]);
      ro.cleanup();
    });

    it('cancel (Esc) the gesture restores the points', () => {
      const project = setArrowRoute(straightProject(), 'r1', [{ x: 700, y: 300 }]);
      const s = setup(false, project);
      select(s, { kind: 'arrow', id: 'r1' });
      s.fire('pointerdown', 700, 300);
      s.fire('pointermove', 720, 330);
      s.fire('pointermove', 740, 360);
      expect(r1(s)?.points).toEqual([{ x: 740, y: 360 }]);
      expect(s.input.cancelInteraction()).toBe(true);
      expect(r1(s)?.points).toEqual([{ x: 700, y: 300 }]);
      s.fire('pointerup', 740, 360);
      expect(s.store.canUndo.value).toBe(false);
      s.cleanup();
    });
  });

  describe('swapping the end and the side', () => {
    it('dragging the end to another marking changes the target (one entry) and lights up the target', () => {
      const s = setup(false, arrowProject());
      select(s, { kind: 'arrow', id: 'r1' });
      s.fire('pointerdown', 600, 700);
      s.fire('pointermove', 650, 720);
      s.fire('pointermove', 2700, 700); // over b2 (2600,600,200,200)
      expect(s.state.arrowDraft.value).toEqual({ line: null, target: 'b2' });
      expect(r1(s)?.to).toBe('b2');
      s.fire('pointerup', 2700, 700);
      expect(r1(s)).toMatchObject({ from: 'a1', to: 'b2', toSide: null });
      // The containers of the ends changed: the space of the points changed and the route went back to the default.
      expect(r1(s)?.points).toEqual([]);
      expect(s.state.arrowDraft.value).toBeNull();
      expect(undoAll(s)).toBe(1);
      expect(r1(s)).toMatchObject({ to: 'a3' });
      s.cleanup();
    });

    it('dragging the source swaps the `from`', () => {
      const s = setup(false, arrowProject());
      select(s, { kind: 'arrow', id: 'r1' });
      s.drag([400, 250], [2700, 700]);
      expect(r1(s)).toMatchObject({ from: 'b2', to: 'a3' });
      s.cleanup();
    });

    it('over the same marking, near another side, swaps the side', () => {
      const s = setup(false, arrowProject());
      select(s, { kind: 'arrow', id: 'r1' });
      // a3 (600,600,200,200): near the top side.
      s.drag([600, 700], [700, 610]);
      expect(r1(s)).toMatchObject({ to: 'a3', toSide: 'top', fromSide: null });
      expect(undoAll(s)).toBe(1);
      s.cleanup();
    });

    it('over the same marking, on the side where it already is: nothing changes (automatic stays automatic)', () => {
      const s = setup(false, arrowProject());
      select(s, { kind: 'arrow', id: 'r1' });
      s.drag([600, 700], [610, 700]);
      expect(r1(s)).toMatchObject({ to: 'a3', toSide: null });
      expect(s.store.canUndo.value).toBe(false);
      s.cleanup();
    });

    it('releasing on the empty canvas or over the other end cancels and shows the provisional line on the way', () => {
      const s = setup(false, arrowProject());
      select(s, { kind: 'arrow', id: 'r1' });
      s.fire('pointerdown', 600, 700);
      s.fire('pointermove', 650, 720);
      s.fire('pointermove', 3000, 3000);
      expect(s.state.arrowDraft.value).toEqual({
        line: { from: { x: 400, y: 250 }, to: { x: 3000, y: 3000 } },
        target: null,
      });
      expect(r1(s)?.to).toBe('a3');
      s.fire('pointerup', 3000, 3000);
      expect(r1(s)?.to).toBe('a3');
      expect(s.store.canUndo.value).toBe(false);
      expect(s.state.arrowDraft.value).toBeNull();
      // Over the marking of the other end (a1): also cancels (it would be an arrow linked to itself).
      s.drag([600, 700], [350, 350]);
      expect(r1(s)).toMatchObject({ from: 'a1', to: 'a3' });
      expect(s.store.canUndo.value).toBe(false);
      s.cleanup();
    });
  });

  describe('Clean view and review', () => {
    it('in review (read-only) the arrows cannot be edited, but the stroke still selects', () => {
      const s = setup(false, straightProject());
      s.setReviewing(true);
      s.click(500, 475);
      expect(s.ui.selection.value).toEqual({ kind: 'arrow', id: 'r1' });
      s.drag([500, 475], [560, 420]);
      expect(r1(s)?.points).toEqual([]);
      s.rightClick(500, 475);
      expect(s.ui.canvasMenu.value).toBeNull();
      s.cleanup();
    });
  });
});

// Rectangle selection (SM2): Shift+drag adds to the selection the items entirely inside.
describe('PointerInput: rectangle selection (SM2)', () => {
  type S = ReturnType<typeof setup>;
  const SHIFT = { shift: true };
  /** Shift+drag from `from` to `to` in a few steps, releasing at `to`. */
  const shiftDrag = (
    s: S,
    from: [number, number],
    to: [number, number],
    options: { kind?: string; button?: number; shift?: boolean } = SHIFT,
  ) => {
    s.fire('pointerdown', ...from, options);
    for (const f of [0.5, 1]) {
      s.fire(
        'pointermove',
        from[0] + (to[0] - from[0]) * f,
        from[1] + (to[1] - from[1]) * f,
        options,
      );
    }
    s.fire('pointerup', ...to, options);
  };
  const ids = (s: S) => peekSelectedItems(s.ui).map((i) => `${i.kind}:${i.id}`);
  // Around I1 (0..1000 × 0..800) and I2 (1100..1600 × 0..500).
  const AROUND_BOTH: [[number, number], [number, number]] = [
    [-50, -50],
    [1700, 900],
  ];

  it('adds the two containers and the current primary stays', () => {
    const s = setup();
    s.ui.selection.value = { kind: 'marking', id: 'M3' };
    shiftDrag(s, ...AROUND_BOTH);
    expect(new Set(ids(s))).toEqual(new Set(['marking:M3', 'image:I1', 'image:I2']));
    expect(s.ui.selection.value).toEqual({ kind: 'marking', id: 'M3' });
    s.cleanup();
  });

  it('with no prior selection, the primary is the first in Tree order', () => {
    const s = setup();
    shiftDrag(s, ...AROUND_BOTH);
    expect(new Set(ids(s))).toEqual(new Set(['image:I1', 'image:I2']));
    expect(s.ui.selection.value).toEqual({ kind: 'image', id: 'I1' });
    s.cleanup();
  });

  it('the rectangle appears in state.marquee during the drag and disappears on release', () => {
    const s = setup();
    s.fire('pointerdown', 10, 20, SHIFT);
    s.fire('pointermove', 60, 90, SHIFT);
    expect(s.state.marquee.value).toEqual({ x: 10, y: 20, width: 50, height: 70 });
    s.fire('pointermove', 5, 5, SHIFT);
    expect(s.state.marquee.value).toEqual({ x: 5, y: 5, width: 5, height: 15 });
    s.input.updateCursor(null);
    expect(s.container.style.cursor).toBe('crosshair');
    s.fire('pointerup', 5, 5, SHIFT);
    expect(s.state.marquee.value).toBeNull();
    s.cleanup();
  });

  it('with no item inside the selection does not change (same objects)', () => {
    const s = setup();
    s.ui.selection.value = { kind: 'marking', id: 'M1' };
    const { value: selection } = s.ui.selection;
    shiftDrag(s, [3000, 3000], [3100, 3100]);
    expect(s.ui.selection.value).toBe(selection);
    expect(s.ui.selectionGroup.value).toBeNull();
    s.cleanup();
  });

  it('never removes an already selected item', () => {
    const s = setup();
    s.ui.selection.value = { kind: 'image', id: 'I1' };
    shiftDrag(s, ...AROUND_BOTH);
    expect(new Set(ids(s))).toEqual(new Set(['image:I1', 'image:I2']));
    expect(s.ui.selection.value).toEqual({ kind: 'image', id: 'I1' });
    s.cleanup();
  });

  it('does not change the project nor gain an undo entry', () => {
    const s = setup();
    const before = s.store.project.peek();
    shiftDrag(s, ...AROUND_BOTH);
    expect(s.store.project.peek()).toBe(before);
    expect(s.store.canUndo.value).toBe(false);
    s.cleanup();
  });

  it('below the drag threshold the usual Shift+click applies', () => {
    const s = setup();
    s.fire('pointerdown', 250, 250, SHIFT);
    s.fire('pointermove', 252, 251, SHIFT);
    expect(s.state.marquee.value).toBeNull();
    s.fire('pointerup', 252, 251, SHIFT);
    expect(ids(s)).toEqual(['marking:M2']);
    s.cleanup();
  });

  it('Esc (cancelInteraction) cancels: selection intact, rectangle disappears and the rest of the drag is ignored', () => {
    const s = setup();
    s.ui.selection.value = { kind: 'marking', id: 'M3' };
    const { value: selection } = s.ui.selection;
    s.fire('pointerdown', ...AROUND_BOTH[0], SHIFT);
    s.fire('pointermove', ...AROUND_BOTH[1], SHIFT);
    expect(s.state.marquee.value).not.toBeNull();
    expect(s.input.cancelInteraction()).toBe(true);
    expect(s.state.marquee.value).toBeNull();
    s.fire('pointermove', 1600, 800, SHIFT);
    expect(s.state.marquee.value).toBeNull();
    s.fire('pointerup', 1600, 800, SHIFT);
    expect(s.ui.selection.value).toBe(selection);
    expect(s.ui.selectionGroup.value).toBeNull();
    expect(s.input.isInteracting()).toBe(false);
    s.cleanup();
  });

  it('pointercancel does not change the selection and the rectangle disappears', () => {
    const s = setup();
    s.fire('pointerdown', ...AROUND_BOTH[0], SHIFT);
    s.fire('pointermove', ...AROUND_BOTH[1], SHIFT);
    s.fire('pointercancel', ...AROUND_BOTH[1], SHIFT);
    expect(s.state.marquee.value).toBeNull();
    expect(s.ui.selection.value).toBeNull();
    s.cleanup();
  });

  it('Navigate: Shift+drag over the selected item still moves it', () => {
    const s = setup();
    s.ui.selection.value = { kind: 'marking', id: 'M1' };
    shiftDrag(s, [400, 400], [500, 450]);
    expect(s.markingRect('M1')).toEqual({ x: 200, y: 150, width: 600, height: 500 });
    expect(s.state.marquee.value).toBeNull();
    s.cleanup();
  });

  it('Navigate: Shift+drag on the handle still resizes', () => {
    const s = setup();
    s.ui.selection.value = { kind: 'marking', id: 'M2' };
    shiftDrag(s, [300, 300], [340, 360]);
    expect(s.markingRect('M2')).toEqual({ x: 200, y: 200, width: 140, height: 160 });
    s.cleanup();
  });

  it('Draw: Shift+drag does not create a marking, it only selects', () => {
    const s = setup();
    s.ui.mode.value = 'draw';
    const count = s.store.project.peek()?.markings.length;
    shiftDrag(s, [190, 190], [310, 310]);
    expect(s.store.project.peek()?.markings.length).toBe(count);
    expect(s.state.draft.value).toBeNull();
    expect(ids(s)).toEqual(['marking:M2']);
    s.cleanup();
  });

  it('Ctrl/Cmd+drag does not get the rectangle (pan)', () => {
    const s = setup();
    s.drag([700, 700], [750, 730]);
    expect(s.viewport.viewport.value).toMatchObject({ x: 50, y: 30 });
    const c = setup();
    c.fire('pointerdown', 700, 700, { ctrl: true });
    c.fire('pointermove', 750, 730, { ctrl: true });
    expect(c.state.marquee.value).toBeNull();
    c.fire('pointerup', 750, 730, { ctrl: true });
    s.cleanup();
    c.cleanup();
  });

  it('Space, middle button and touch pan, without a rectangle', () => {
    const space = setup();
    space.setSpace(true);
    shiftDrag(space, [700, 700], [750, 730]);
    expect(space.viewport.viewport.value).toMatchObject({ x: 50, y: 30 });
    expect(space.ui.selection.value).toBeNull();
    space.cleanup();

    const middle = setup();
    shiftDrag(middle, [700, 700], [750, 730], { shift: true, button: 1 });
    expect(middle.viewport.viewport.value).toMatchObject({ x: 50, y: 30 });
    middle.cleanup();

    const touch = setup();
    shiftDrag(touch, [700, 700], [750, 730], { shift: true, kind: 'touch' });
    expect(touch.viewport.viewport.value).toMatchObject({ x: 50, y: 30 });
    expect(touch.ui.selection.value).toBeNull();
    touch.cleanup();
  });

  it('proposal review: no rectangle (pan)', () => {
    const s = setup();
    s.setReviewing(true);
    shiftDrag(s, [700, 700], [750, 730]);
    expect(s.viewport.viewport.value).toMatchObject({ x: 50, y: 30 });
    expect(s.state.marquee.value).toBeNull();
    s.cleanup();
  });

  it('read-only: the rectangle applies', () => {
    const s = setup(true);
    shiftDrag(s, ...AROUND_BOTH);
    expect(new Set(ids(s))).toEqual(new Set(['image:I1', 'image:I2']));
    s.cleanup();
  });
});

describe('PointerInput: a gesture restarts the click cycle (CC1)', () => {
  const CHILD = { kind: 'marking', id: 'M2' };
  const SHIFT = { shift: true };
  const AROUND: [[number, number], [number, number]] = [
    [-50, -50],
    [1700, 900],
  ];

  it('Shift+drag cancelled by Esc in the middle: the next click at the same point stays on the child', () => {
    const s = setup();
    s.click(250, 250);
    expect(s.ui.selection.value).toEqual(CHILD);
    s.fire('pointerdown', ...AROUND[0], SHIFT);
    s.fire('pointermove', ...AROUND[1], SHIFT);
    expect(s.input.cancelInteraction()).toBe(true);
    s.fire('pointerup', ...AROUND[1], SHIFT);
    s.click(250, 250);
    expect(s.ui.selection.value).toEqual(CHILD);
    s.cleanup();
  });

  it('Shift+drag released: the next click swaps the selection for the child', () => {
    const s = setup();
    s.click(250, 250);
    s.fire('pointerdown', ...AROUND[0], SHIFT);
    s.fire('pointermove', ...AROUND[1], SHIFT);
    s.fire('pointerup', ...AROUND[1], SHIFT);
    s.click(250, 250);
    expect(s.ui.selection.value).toEqual(CHILD);
    s.cleanup();
  });

  it('background pan between two clicks: the second, at the same canvas point, stays on the child', () => {
    const s = setup();
    s.click(250, 250);
    s.drag([1050, 700], [1060, 710]);
    s.viewport.panBy(-10, -10);
    s.click(250, 250);
    expect(s.ui.selection.value).toEqual(CHILD);
    s.cleanup();
  });

  it('pointercancel of a pending touch resets the cycle', () => {
    const s = setup();
    s.click(250, 250);
    s.fire('pointerdown', 250, 250, { id: 7, kind: 'touch' });
    s.fire('pointercancel', 250, 250, { id: 7, kind: 'touch' });
    s.click(250, 250);
    expect(s.ui.selection.value).toEqual(CHILD);
    s.cleanup();
  });

  it('pinch between two clicks resets the cycle', () => {
    const s = setup();
    s.click(250, 250);
    s.fire('pointerdown', 100, 100, { id: 1, kind: 'touch' });
    s.fire('pointerdown', 200, 100, { id: 2, kind: 'touch' });
    s.fire('pointerup', 100, 100, { id: 1, kind: 'touch' });
    s.fire('pointerup', 200, 100, { id: 2, kind: 'touch' });
    s.viewport.viewport.value = { x: 0, y: 0, scale: 1 };
    s.click(250, 250);
    expect(s.ui.selection.value).toEqual(CHILD);
    s.cleanup();
  });

  it('regression: successive clicks go up to the parent and the third continues the cycle', () => {
    const s = setup();
    s.click(250, 250);
    expect(s.ui.selection.value).toEqual(CHILD);
    s.click(250, 250);
    expect(s.ui.selection.value).toEqual({ kind: 'marking', id: 'M1' });
    s.click(250, 250);
    expect(s.ui.selection.value).not.toEqual(CHILD);
    s.cleanup();
  });
});

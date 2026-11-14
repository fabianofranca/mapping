import { afterEach, describe, expect, it } from 'vitest';
import { createInteractionState } from '../../../src/canvas/frame';
import { PointerInput } from '../../../src/canvas/input/pointer';
import { ViewportController } from '../../../src/canvas/viewportController';
import {
  projectIndex,
  setArrowRoute,
  setArrowStyle,
  type Project,
} from '../../../src/model';
import { setShowArrows } from '../../../src/store/settings';
import { arrowProject } from '../../model/arrowFixtures';
import { canvasProject, editorFor } from '../harness';

// "Main only" restrictions of the canvas with a perspective open (stage #659, PE2, decision 5):
// no arrow route (waypoints), no drawing on the empty canvas and no snapping of the root into a
// container. Viewport 1:1 at (0, 0): screen = canvas.

function setup(project: Project, perspectiveOpen: boolean) {
  const editor = editorFor(project);
  const container = document.createElement('div');
  document.body.append(container);
  const viewport = new ViewportController(container, () => editor.store.project.peek());
  const state = createInteractionState();
  const input = new PointerInput({
    container,
    ...editor,
    viewport,
    state,
    spaceDown: () => false,
    perspectiveOpen: () => perspectiveOpen,
  });
  const unbind = input.bind();
  const fire = (type: string, x: number, y: number) =>
    container.dispatchEvent(
      new PointerEvent(type, {
        pointerId: 1,
        pointerType: 'mouse',
        button: 0,
        clientX: x,
        clientY: y,
        bubbles: true,
      }),
    );
  const drag = (from: [number, number], to: [number, number]) => {
    fire('pointerdown', ...from);
    for (const f of [0.25, 0.5, 1]) {
      fire(
        'pointermove',
        from[0] + (to[0] - from[0]) * f,
        from[1] + (to[1] - from[1]) * f,
      );
    }
    fire('pointerup', ...to);
  };
  const click = (x: number, y: number) => {
    fire('pointerdown', x, y);
    fire('pointerup', x, y);
  };
  const doubleClick = (x: number, y: number) => {
    click(x, y);
    click(x, y);
    container.dispatchEvent(
      new MouseEvent('dblclick', { clientX: x, clientY: y, bubbles: true }),
    );
  };
  const index = () => projectIndex(editor.store.project.peek() as Project);
  return {
    ...editor,
    viewport,
    state,
    fire,
    drag,
    doubleClick,
    index,
    cleanup: () => {
      unbind();
      input.destroy();
      container.remove();
    },
  };
}

afterEach(() => setShowArrows(true));

describe.each([
  { open: false, label: 'in Main' },
  { open: true, label: 'with a perspective open' },
])('arrow route $label', ({ open }) => {
  const project = () =>
    setArrowRoute(setArrowStyle(arrowProject(), 'r1', 'straight'), 'r1', [
      { x: 700, y: 300 },
      { x: 700, y: 500 },
    ]);
  const points = (s: ReturnType<typeof setup>) => s.index().arrows.get('r1')?.points;

  it('dragging the middle of a segment creates the waypoint only in Main', () => {
    const s = setup(
      setArrowRoute(setArrowStyle(arrowProject(), 'r1', 'straight'), 'r1', []),
      open,
    );
    s.ui.selection.value = { kind: 'arrow', id: 'r1' };
    s.drag([500, 475], [560, 420]);
    expect(points(s)).toEqual(open ? [] : [{ x: 560, y: 420 }]);
    expect(s.store.canUndo.value).toBe(!open);
    s.cleanup();
  });

  it('dragging a waypoint moves it only in Main', () => {
    const s = setup(project(), open);
    s.ui.selection.value = { kind: 'arrow', id: 'r1' };
    s.drag([700, 300], [760, 330]);
    expect(points(s)?.[0]).toEqual(open ? { x: 700, y: 300 } : { x: 760, y: 330 });
    s.cleanup();
  });

  it('double-clicking a waypoint removes it only in Main', () => {
    const s = setup(project(), open);
    s.ui.selection.value = { kind: 'arrow', id: 'r1' };
    s.doubleClick(700, 300);
    expect(points(s)).toHaveLength(open ? 2 : 1);
    s.cleanup();
  });
});

describe.each([
  { open: false, label: 'in Main' },
  { open: true, label: 'with a perspective open' },
])('drawing $label', ({ open }) => {
  it('on the empty canvas it only draws in Main; over the container it always draws', () => {
    const s = setup(canvasProject(), open);
    s.ui.mode.value = 'draw';
    const count = () => s.index().markings.size;
    const before = count();
    s.drag([300, 650], [450, 750]); // Inside I1 (free of other markings).
    expect(count()).toBe(before + 1);
    s.drag([-50, -50], [1700, 900]); // Around both containers: canvas marking.
    expect(count()).toBe(open ? before + 1 : before + 2);
    s.cleanup();
  });
});

describe.each([
  { open: false, label: 'in Main' },
  { open: true, label: 'with a perspective open' },
])('root snapping $label', ({ open }) => {
  it('a canvas marking dropped almost entirely on a container only snaps into it in Main', () => {
    const s = setup(canvasProject(), false);
    const created = s.actions.createMarking(null, {
      x: 1000,
      y: 300,
      width: 100,
      height: 100,
    });
    s.cleanup();
    const id = created.ok ? created.value : '';
    // The same project, in a new editor: the marking already exists on the canvas.
    const s2 = setup(s.store.project.peek() as Project, open);
    s2.ui.selection.value = { kind: 'marking', id };
    s2.drag([1050, 350], [1140, 350]); // 90 to the right: 90% inside I2.
    const marking = s2.index().markings.get(id);
    expect(marking?.containerId ?? null).toBe(open ? null : 'I2');
    s2.cleanup();
  });
});

describe.each([
  { open: false, label: 'in Main' },
  { open: true, label: 'with a perspective open' },
])('vertical-only container drag $label', ({ open }) => {
  it('does not rewrite x (fractional zoom, bit for bit)', () => {
    const base = canvasProject();
    const x0 = 3300.0000513292603;
    const project: Project = {
      ...base,
      containers: base.containers.map((c) =>
        c.id === 'I1' ? { ...c, placement: { ...c.placement, x: x0 } } : c,
      ),
    };
    const s = setup(project, open);
    s.viewport.viewport.value = { x: 0, y: 78.9, scale: 0.557 };
    s.ui.selection.value = { kind: 'image', id: 'I1' };
    // 1900 on screen becomes 3411.131… on the canvas: `(x0 + c) - c` ≠ `x0` (the old formula rewrote it).
    const sx = 1900;
    const sy = 700 * 0.557 + 78.9;
    s.fire('pointerdown', sx, sy);
    s.fire('pointermove', sx, sy + 40);
    expect(s.state.preview.value?.placement.x).toBe(x0);
    s.fire('pointerup', sx, sy + 40);
    expect(s.index().containers.get('I1')?.placement.x).toBe(Number(x0.toFixed(6)));
    s.cleanup();
  });
});

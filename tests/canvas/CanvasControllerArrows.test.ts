import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { CanvasController } from '../../src/canvas/CanvasController';
import { createCanvasViewState } from '../../src/canvas/viewState';
import type { ArrowRenderer } from '../../src/canvas/renderers/arrows';
import type { OverlayRenderer } from '../../src/canvas/renderers/overlay';
import { createArrow } from '../../src/model';
import { createEditorDerived } from '../../src/store/derived';
import { createDisplayImages } from '../../src/store/displayImages';
import { setMarkingDisplay, setShowArrows } from '../../src/store/settings';
import { createEditorUi, selectItems } from '../../src/store/ui';
import { changeOf, propose } from '../model/proposalFixtures';
import { arrowProject, withArrow } from '../model/arrowFixtures';
import { sampleProject } from '../model/fixtures';
import { openHarness } from '../store/proposalHarness';
import { editorFor, installFakeCanvas, setOnlyScreens } from './harness';

// Setas no CanvasController (ME4): a camada, a visibilidade ("Mostrar setas", Ver limpo e as
// ends), the `data-arrows`, the arrow fit and the Proposed view of the review.

describe('CanvasController: setas', () => {
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
  afterEach(() => {
    setShowArrows(true);
    setMarkingDisplay('dim');
  });

  function setup(project = arrowProject()) {
    const editor = editorFor(project);
    const container = document.createElement('div');
    Object.defineProperty(container, 'clientWidth', { value: 380 });
    Object.defineProperty(container, 'clientHeight', { value: 700 });
    document.body.append(container);
    const controller = new CanvasController({
      container,
      display: createDisplayImages<ImageBitmap>(() => new Promise(() => undefined)),
      ...editor,
    });
    const internals = controller as unknown as {
      arrows: ArrowRenderer;
      overlay: OverlayRenderer;
    };
    flush();
    return { ...editor, container, controller, internals };
  }

  it('desenha as setas e publica quantas em `data-arrows`', () => {
    const { container, controller, internals, actions } = setup();
    expect(container.dataset.arrows).toBe('1');
    expect(internals.arrows.size).toBe(1);
    const r2 = actions.addArrow('a3', 'b2');
    expect(r2.ok).toBe(true);
    flush();
    expect(container.dataset.arrows).toBe('2');
    controller.destroy();
  });

  it('"Show arrows" off and the Screens only mode hide them all', () => {
    const { container, controller, ui } = setup();
    setShowArrows(false);
    flush();
    expect(container.dataset.arrows).toBe('0');
    setShowArrows(true);
    flush();
    expect(container.dataset.arrows).toBe('1');
    setOnlyScreens(ui, true);
    flush();
    expect(container.dataset.arrows).toBe('0');
    setOnlyScreens(ui, false);
    flush();
    expect(container.dataset.arrows).toBe('1');
    controller.destroy();
  });

  it('the arrow disappears when one of the ends is hidden by the display mode', () => {
    // "Hide": with no annotation in any visible layer the marking disappears, and the arrow with it. The arrows
    // have annotations (ra1), but the ends a1 and a3 do not.
    const { container, controller, ui } = setup();
    setMarkingDisplay('hide');
    flush();
    expect(container.dataset.arrows).toBe('0');
    // Selecting an end shows it, but the other one stays hidden: the arrow remains hidden.
    ui.selection.value = { kind: 'marking', id: 'a1' };
    flush();
    expect(container.dataset.arrows).toBe('0');
    controller.destroy();
  });

  it('at minimum zoom the arrow between invisible markings is not painted; selecting an end brings it back', () => {
    const { container, controller, internals, ui } = setup();
    expect(container.dataset.arrows).toBe('1');
    controller.zoomTo(0.005); // a1 (300) and a3 (200) get 1.5 px and 1 px: invisible.
    flush();
    expect(container.dataset.arrows).toBe('0');
    expect(internals.arrows.size).toBe(0);
    ui.selection.value = { kind: 'marking', id: 'a1' };
    flush();
    expect(container.dataset.arrows).toBe('1');
    ui.selection.value = null;
    flush();
    expect(container.dataset.arrows).toBe('0');
    controller.destroy();
  });

  it('the arrow outside the visible area is not painted', () => {
    const { container, controller, internals } = setup();
    controller.zoomTo(1);
    controller.centerOnPoint({ x: 450, y: 450 });
    flush();
    expect(container.dataset.arrows).toBe('1');
    controller.centerOnPoint({ x: 50_000, y: 50_000 });
    flush();
    expect(container.dataset.arrows).toBe('0');
    expect(internals.arrows.size).toBe(0);
    controller.destroy();
  });

  it('pan and selection do not rebuild the arrows; zoom only changes the screen size', () => {
    const { controller, internals, ui, container } = setup();
    const shape = internals.arrows.drawn[0];
    ui.selection.value = { kind: 'arrow', id: 'r1' };
    flush();
    container.dispatchEvent(
      new WheelEvent('wheel', { deltaY: -40, clientX: 190, clientY: 350 }),
    );
    flush();
    // The shape is the same: zoom only changes the thickness and the tip, at paint time.
    expect(internals.arrows.drawn[0]).toBe(shape);
    controller.destroy();
  });

  it('editing a pinned marking rebuilds the arrow; editing something else does not', () => {
    const { controller, internals, actions } = setup();
    const shape = internals.arrows.drawn[0];
    expect(actions.renameMarking('a2', 'Handle').ok).toBe(true);
    flush();
    expect(internals.arrows.drawn[0]).toBe(shape);
    expect(actions.moveMarking('a3', 40, 0).ok).toBe(true);
    flush();
    expect(internals.arrows.drawn[0]).not.toBe(shape);
    expect(internals.arrows.drawn[0]?.route.points.at(-1)).toEqual({
      x: 640,
      y: 700,
    });
    controller.destroy();
  });

  it('the selected arrow has highlight and handles; in view mode, nothing', () => {
    const { controller, internals, ui } = setup();
    controller.zoomTo(1); // The middle of the stretch only gets a handle with room on the screen.
    ui.selection.value = { kind: 'arrow', id: 'r1' };
    flush();
    expect(
      internals.overlay.arrowHighlightNodes().filter((h) => h.line.visible()),
    ).toHaveLength(1);
    expect(
      internals.overlay.arrowHandleCircles().filter((c) => c.visible()),
    ).toHaveLength(3);
    setOnlyScreens(ui, true);
    flush();
    expect(
      internals.overlay.arrowHighlightNodes().filter((h) => h.line.visible()),
    ).toHaveLength(0);
    controller.destroy();
  });

  it('multiple selection with arrows: all get a highlight', () => {
    const { controller, internals, ui } = setup(
      withArrow(arrowProject(), 'r2', 'a3', 'b2'),
    );
    selectItems(ui, [
      { kind: 'arrow', id: 'r1' },
      { kind: 'arrow', id: 'r2' },
    ]);
    flush();
    expect(
      internals.overlay.arrowHighlightNodes().filter((h) => h.line.visible()),
    ).toHaveLength(2);
    controller.destroy();
  });

  it('centering the arrow frames the stroke (its box)', () => {
    const { controller, ui } = setup();
    ui.selection.value = { kind: 'arrow', id: 'r1' };
    controller.centerSelection();
    // r1 goes from (400,250) to (600,700): the center of the box is (500, 475).
    const center = controller.viewportCenter();
    expect(center.x).toBeCloseTo(500, 0);
    expect(center.y).toBeCloseTo(475, 0);
    controller.destroy();
  });

  it('revealing the arrow does the minimal pan to the stroke', () => {
    const { controller, ui } = setup();
    controller.zoomTo(1);
    controller.centerOnPoint({ x: 5000, y: 5000 });
    ui.selection.value = { kind: 'arrow', id: 'r1' };
    controller.revealSelection();
    const center = controller.viewportCenter();
    expect(center.x).toBeLessThan(5000);
    controller.destroy();
  });

  it('the drop target lights up with the destination marking of the arrow gesture', () => {
    const { controller, internals } = setup();
    const interaction = (
      controller as unknown as {
        state: { arrowDraft: { value: unknown } };
      }
    ).state;
    interaction.arrowDraft.value = { line: null, target: 'a3' };
    flush();
    expect(internals.overlay.dropRect.getAttrs()).toMatchObject({
      visible: true,
      x: 600,
      y: 600,
    });
    interaction.arrowDraft.value = null;
    flush();
    expect(internals.overlay.dropRect.visible()).toBe(false);
    controller.destroy();
  });
});

describe('CanvasController: arrows in proposal review', () => {
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

  it('the Proposed view draws the proposed arrow; the Current one does not', async () => {
    const base = sampleProject();
    const after = createArrow(base, { id: 'R1', from: 'M1', to: 'M4' });
    const proposal = propose(base, after);
    expect(changeOf(proposal, 'arrow', 'R1').kind).toBe('create');
    const { session, review } = await openHarness({
      project: base,
      proposals: [proposal],
    });
    expect(review.open('P1').ok).toBe(true);
    const ui = createEditorUi();
    const container = document.createElement('div');
    Object.defineProperty(container, 'clientWidth', { value: 380 });
    Object.defineProperty(container, 'clientHeight', { value: 700 });
    document.body.append(container);
    const controller = new CanvasController({
      container,
      store: session.store,
      actions: session.actions,
      display: createDisplayImages<ImageBitmap>(() => new Promise(() => undefined)),
      ui,
      derived: createEditorDerived(session.store, ui, review.derived.shownProject),
      view: createCanvasViewState(),
      review,
    });
    flush();
    review.setView('proposed');
    flush();
    expect(container.dataset.arrows).toBe('1');
    review.setView('current');
    flush();
    expect(container.dataset.arrows).toBe('0');
    controller.destroy();
  });
});

import { effect } from '@preact/signals';
import type Konva from 'konva/lib/Core';
import type { Rect as KonvaRect } from 'konva/lib/shapes/Rect';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { CanvasController } from '../../src/canvas/CanvasController';
import * as ghostModule from '../../src/canvas/quickGhost';
import {
  createMarking,
  renameMarking,
  setMarkingRect,
  type Project,
  type Proposal,
  type Rect,
} from '../../src/model';
import { createDisplayImages } from '../../src/store/displayImages';
import { sampleProject } from '../model/fixtures';
import { propose } from '../model/proposalFixtures';
import { editorFor, installFakeCanvas } from './harness';
import { fakeQuick } from './quickReviewFixture';

// The quick review on the canvas (stage #1932, QR2): the translucent ghost at the bottom of the
// overlays layer, the real look (peek), the box and the host attribute. Real Konva with a fake 2D
// context, like the other controller tests.

const NEW_RECT = { x: 2500, y: 1000, width: 300, height: 300 };

/** The base project, and a proposal that creates M9 and renames M2. */
function scenario(): { base: Project; proposal: Proposal } {
  const base = sampleProject();
  let after = createMarking(base, {
    id: 'M9',
    containerId: 'I1',
    rect: NEW_RECT,
    name: 'Button',
  });
  after = renameMarking(after, 'M2', 'Handle');
  return { base, proposal: propose(base, after) };
}

describe('CanvasController: quick review', () => {
  const frames: FrameRequestCallback[] = [];
  const flush = () => {
    while (frames.length > 0) for (const frame of frames.splice(0)) frame(0);
  };
  const controllers: CanvasController[] = [];
  const spies: { mockRestore(): void }[] = [];
  const track = <T extends { mockRestore(): void }>(s: T): T => {
    spies.push(s);
    return s;
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
    for (const c of controllers.splice(0)) c.destroy();
    for (const spy of spies.splice(0)) spy.mockRestore();
  });

  function setup(withQuick = true, custom?: { base: Project; proposal: Proposal }) {
    const { base, proposal } = custom ?? scenario();
    const editor = editorFor(base);
    const { quick, enabled } = fakeQuick(editor.store, proposal);
    const container = document.createElement('div');
    Object.defineProperty(container, 'clientWidth', { value: 380 });
    Object.defineProperty(container, 'clientHeight', { value: 700 });
    document.body.append(container);
    const controller = new CanvasController({
      container,
      display: createDisplayImages<ImageBitmap>(() => new Promise(() => undefined)),
      ...editor,
      ...(withQuick ? { quick } : {}),
    });
    controllers.push(controller);
    const internals = controller as unknown as {
      stage: Konva.Stage;
      drawnProject: { readonly value: Project | null };
    };
    const overlay = () => internals.stage.getLayers()[4] as Konva.Layer;
    const ghost = () => overlay().findOne('.quick-ghost') as Konva.Group;
    flush();
    // Zoomed in, the badges of the small markings show (below ~22 screen px they are left out).
    controller.zoomTo(1);
    flush();
    return {
      ...editor,
      quick,
      enabled,
      container,
      controller,
      internals,
      overlay,
      ghost,
    };
  }

  /** Cache calls of the ghost group, counted from now on. */
  function cacheSpy(group: Konva.Group) {
    return track(vi.spyOn(group, 'cache'));
  }

  const scaleOf = (controller: CanvasController): number =>
    (controller as unknown as { view: { scale: number } }).view.scale;

  const placementOf = (controller: CanvasController, id: string) => {
    const at = (
      controller as unknown as {
        placements: ReadonlyMap<string, { x: number; y: number; scale: number }>;
      }
    ).placements.get(id);
    if (!at) throw new Error('placement');
    return at;
  };

  const wheel = (container: HTMLElement, deltaY: number) =>
    container.dispatchEvent(
      new WheelEvent('wheel', { deltaY, clientX: 190, clientY: 350 }),
    );

  it('keeps the five layers and puts one non-listening ghost group at the bottom of the overlay layer', () => {
    const t = setup();
    expect(t.internals.stage.getLayers()).toHaveLength(5);
    const group = t.ghost();
    expect(group).toBeDefined();
    expect(group.listening()).toBe(false);
    expect(t.overlay().getChildren()[0]).toBe(group);
  });

  it('draws the created and the changed marking in the ghost, translucent', () => {
    const t = setup();
    const group = t.ghost();
    expect(group.find('Shape').length).toBeGreaterThan(0);
    expect(group.opacity()).toBe(
      (
        t.controller as unknown as { tokens: { peek(): { opacity: { ghost: number } } } }
      ).tokens.peek().opacity.ghost,
    );
    const badges = group.find('Path').length;
    expect(badges).toBeGreaterThanOrEqual(2); // created and changed badges
    expect(group.visible()).toBe(true);
  });

  it('a created marking with no drawing gets a dashed body outline in the ghost group', () => {
    const t = setup();
    const body = t.ghost().findOne('.ghost-body-M9') as KonvaRect | undefined;
    expect(body).toBeDefined();
    const tokens = (
      t.controller as unknown as {
        tokens: { peek(): { line: string } };
      }
    ).tokens.peek();
    const zoom = scaleOf(t.controller);
    expect(body?.stroke()).toBe(tokens.line);
    expect(body?.dash()).toEqual([6 / zoom, 4 / zoom]);
    expect(body?.strokeWidth()).toBeCloseTo(1 / zoom);
    const at = placementOf(t.controller, 'I1');
    expect(body?.getAttr('x')).toBeCloseTo(at.x + NEW_RECT.x * at.scale);
    expect(body?.getAttr('y')).toBeCloseTo(at.y + NEW_RECT.y * at.scale);
    expect(body?.width()).toBeCloseTo(NEW_RECT.width * at.scale);
    expect(t.ghost().findOne('.ghost-body-inner-M9')?.visible()).toBe(false);
  });

  it('a changed marking gets the double line (thick stroke and an inner thread)', () => {
    const t = setup();
    const body = t.ghost().findOne('.ghost-body-M2') as KonvaRect | undefined;
    const inner = t.ghost().findOne('.ghost-body-inner-M2') as KonvaRect | undefined;
    const zoom = scaleOf(t.controller);
    expect(body?.strokeWidth()).toBeCloseTo(3 / zoom);
    expect(body?.dash()).toEqual([]);
    expect(inner?.strokeWidth()).toBeCloseTo(1 / zoom);
  });

  it('a marking outside the ghost area is skipped, like the review marks', () => {
    const base = sampleProject();
    let after = createMarking(base, {
      id: 'M9',
      containerId: null,
      rect: { x: 5e7, y: 5e7, width: 100, height: 100 },
    });
    after = createMarking(after, {
      id: 'M8',
      containerId: null,
      rect: { x: -5000, y: -5000, width: 100, height: 100 },
    });
    const t = setup(true, { base, proposal: propose(base, after) });
    expect(t.ghost().findOne('.ghost-body-M8')).toBeDefined();
    expect(t.ghost().findOne('.ghost-body-M9')).toBeUndefined();
  });

  it('a moved marking has its body at the new position', () => {
    const base = sampleProject();
    const moved = { x: 1210, y: 1210, width: 400, height: 200 };
    const after = setMarkingRect(renameMarking(base, 'M2', 'Handle'), 'M2', moved);
    const proposal = propose(base, after);
    const t = setup(true, { base, proposal });
    const body = t.ghost().findOne('.ghost-body-M2') as KonvaRect | undefined;
    expect(body).toBeDefined();
    const at = placementOf(t.controller, 'I1');
    expect(body?.getAttr('x')).toBeCloseTo(at.x + 1210 * at.scale);
    expect(body?.getAttr('y')).toBeCloseTo(at.y + 1210 * at.scale);
  });

  it('the cache pixel ratio follows the screen density, before the size cap', () => {
    const ratios: number[] = [];
    for (const dpr of [1, 2]) {
      vi.stubGlobal('devicePixelRatio', dpr);
      const t = setup();
      const spy = cacheSpy(t.ghost());
      wheel(t.container, -40);
      flush();
      const arg = spy.mock.calls.at(-1)?.[0] as { pixelRatio: number } | undefined;
      ratios.push(arg?.pixelRatio ?? 0);
      for (const c of controllers.splice(0)) c.destroy();
    }
    vi.stubGlobal('devicePixelRatio', 1);
    expect(ratios[0]).toBeGreaterThan(0);
    expect(ratios[1]).toBeCloseTo(2 * (ratios[0] ?? 0));
  });

  it('caches the ghost on the zoom, not on pan, and not on an edit that does not touch it', () => {
    const t = setup();
    const spy = cacheSpy(t.ghost());
    for (let i = 0; i < 3; i++) {
      t.controller.centerOnPoint({ x: 600 + 50 * i, y: 500 });
      flush();
    }
    expect(spy).toHaveBeenCalledTimes(0);
    wheel(t.container, -40);
    flush();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(t.actions.renameMarking('M3', 'Another').ok).toBe(true);
    flush();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('peek draws the proposed result with no ghost; back to false restores the live project', () => {
    const t = setup();
    const ids = () => t.internals.drawnProject.value?.markings.map((m) => m.id) ?? [];
    expect(ids()).not.toContain('M9');
    t.ui.quickPeek.value = true;
    flush();
    expect(ids()).toContain('M9');
    const group = t.ghost();
    expect(group.visible()).toBe(false);
    expect(t.container.dataset.quickReview).toBe('P1:peek:2');
    t.ui.quickPeek.value = false;
    flush();
    expect(ids()).not.toContain('M9');
    expect(group.visible()).toBe(true);
    expect(t.container.dataset.quickReview).toBe('P1:ghost:2');
  });

  it('a click on an item that exists only in the proposal selects nothing during peek', () => {
    const t = setup();
    t.ui.quickPeek.value = true;
    flush();
    const box = t.view.quickReviewBox.value;
    expect(box).not.toBeNull();
    if (!box) return;
    const click = (x: number, y: number) => {
      t.container.dispatchEvent(
        new PointerEvent('pointerdown', { pointerId: 1, clientX: x, clientY: y }),
      );
      t.container.dispatchEvent(
        new PointerEvent('pointerup', { pointerId: 1, clientX: x, clientY: y }),
      );
      flush();
    };
    // The box spans M2 (x 1200) to M9 (x 2800) and from y 1000 to 1400, in image pixels.
    const perPx = box.width / 1600;
    const at = (x: number, y: number) =>
      click(box.x + (x - 1200) * perPx, box.y + (y - 1000) * perPx);
    expect(t.internals.drawnProject.value?.markings.map((m) => m.id)).toContain('M9');
    at(2650, 1150); // The center of M9: it exists only in the proposal.
    expect(t.ui.selection.value).not.toMatchObject({ kind: 'marking', id: 'M9' });
    at(1900, 1900); // A live marking (M1) is still picked during peek.
    expect(t.ui.selection.value).toMatchObject({ kind: 'marking', id: 'M1' });
  });

  it('publishes data-quick-review and clears it when the quick review ends', () => {
    const t = setup();
    expect(t.container.dataset.quickReview).toBe('P1:ghost:2');
    t.enabled.value = false;
    flush();
    expect(t.container.dataset.quickReview).toBeUndefined();
  });

  it('without a quick review: no ghost content, no box, no attribute', () => {
    const t = setup(false);
    expect(t.ghost().find('Shape')).toHaveLength(0);
    expect(t.view.quickReviewBox.value).toBeNull();
    expect(t.container.dataset.quickReview).toBeUndefined();
  });

  it('the box is in CSS px, follows pan and zoom, and is not rewritten when nothing changed', () => {
    const t = setup();
    const writes: unknown[] = [];
    const stop = effect(() => {
      writes.push(t.view.quickReviewBox.value);
    });
    const expected = () => {
      const view = t.quick.current.value;
      const committed = t.store.committed.value;
      if (!view || !committed) throw new Error('no quick review');
      const canvas = ghostModule.quickGhost(view, committed, new Map()).box;
      const vp = t.view.viewport.value;
      if (!canvas) throw new Error('no box');
      return {
        x: canvas.x * vp.scale + vp.x,
        y: canvas.y * vp.scale + vp.y,
        width: canvas.width * vp.scale,
        height: canvas.height * vp.scale,
      };
    };
    const near = (a: Rect | null, b: Rect) => {
      expect(a).not.toBeNull();
      for (const k of ['x', 'y', 'width', 'height'] as const) {
        expect(a?.[k]).toBeCloseTo(b[k], 5);
      }
    };
    near(t.view.quickReviewBox.value, expected());
    const before = t.view.quickReviewBox.value;
    t.controller.centerOnPoint({ x: 900, y: 500 });
    flush();
    const panned = t.view.quickReviewBox.value;
    expect(panned?.x).not.toBe(before?.x);
    near(panned, expected());
    wheel(t.container, -40);
    flush();
    near(t.view.quickReviewBox.value, expected());
    expect(t.view.quickReviewBox.value?.width).toBeGreaterThan(panned?.width ?? 0);
    const count = writes.length;
    expect(t.actions.renameMarking('M3', 'Another').ok).toBe(true);
    flush();
    expect(writes).toHaveLength(count);
    stop();
  });

  it('pan and zoom neither rebuild the ghost nor ask for the drawings of the preview', () => {
    const t = setup();
    const drawings = track(vi.spyOn(t.derived, 'drawingsOf'));
    const ghost = track(vi.spyOn(ghostModule, 'quickGhost'));
    t.actions.renameMarking('M3', 'Edited');
    flush();
    expect(ghost.mock.calls.length).toBeGreaterThan(0);
    ghost.mockClear();
    drawings.mockClear();
    for (let i = 0; i < 20; i++) {
      if (i % 2 === 0) t.controller.centerOnPoint({ x: 600 + 40 * i, y: 500 });
      else wheel(t.container, i % 4 === 1 ? -40 : 40);
      flush();
    }
    expect(drawings).toHaveBeenCalledTimes(0);
    expect(ghost).toHaveBeenCalledTimes(0);
  });

  it('a full review opening removes the ghost content, the box and the attribute', () => {
    const t = setup();
    expect(t.ghost().getChildren().length).toBeGreaterThan(0);
    t.enabled.value = false;
    flush();
    expect(t.ghost().find('Shape')).toHaveLength(0);
    expect(t.view.quickReviewBox.value).toBeNull();
    expect(t.container.dataset.quickReview).toBeUndefined();
  });
});

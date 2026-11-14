import { afterEach, describe, expect, it, vi } from 'vitest';
import type Konva from 'konva';
import { markingCanvasRectOf, type ItemRef, type Marking } from '../../src/model';
import type { ArrowRenderer } from '../../src/canvas/renderers/arrows';
import type { ImageRenderer } from '../../src/canvas/renderers/images';
import type { MarkingRenderer } from '../../src/canvas/renderers/markings';
import type { ComponentLayerRenderer } from '../../src/canvas/components/componentLayer';
import { createDisplayImages } from '../../src/store/displayImages';
import { CanvasController } from '../../src/canvas/CanvasController';
import { approximateMeasurer } from '../../src/model';
import { textMeasurer } from '../../src/store/textMeasure';
import { componentEditor, installFakeCanvas, layerDrawMeter, stageOf } from './harness';
import {
  openWholeProject,
  stubFrames,
  type WholeProjectScenario,
} from './wholeProjectScenario';

/** The renderers and the controller layers (private: the test reads them to prove where the nodes are). */
interface Internals {
  readonly markings: MarkingRenderer;
  readonly images: ImageRenderer;
  readonly arrows: ArrowRenderer;
  readonly componentLayer: ComponentLayerRenderer;
  readonly floatingLayer: ComponentLayerRenderer;
}
const internals = (s: { controller: unknown }): Internals => s.controller as Internals;

/** Names of the layers that the frame redrew (count > 0). */
function redrawn(counts: Record<string, number>): string[] {
  return Object.entries(counts)
    .filter(([, n]) => n > 0)
    .map(([name]) => name)
    .sort();
}

/** Name of the stage layer the node is in. */
const layerName = (node: Konva.Node): string | undefined => node.getLayer()?.name();

function markingById(s: WholeProjectScenario, id: string): Marking {
  const marking = s.store.project.peek()?.markings.find((m) => m.id === id);
  if (!marking) throw new Error(`marking ${id}`);
  return marking;
}

/** The parent marking and a child of it (the scenario recipe puts 4 children on each root). */
function parentAndChild(s: WholeProjectScenario): { parent: Marking; child: Marking } {
  const parent = s.project.markings.find((m) => m.parentId === null);
  const child = s.project.markings.find((m) => m.parentId === parent?.id);
  if (!parent || !child) throw new Error('fixture');
  return { parent, child };
}

/** Drawn position of the node border against the project geometry (with the gesture preview). */
function expectDrawnAt(s: WholeProjectScenario, id: string): void {
  const project = s.store.project.peek();
  if (!project) throw new Error('no project');
  const rect = markingCanvasRectOf(project, markingById(s, id));
  const node = internals(s).markings.node(id);
  expect(node, `node of ${id}`).toBeDefined();
  expect({ x: node?.border.x(), y: node?.border.y() }, `position of ${id}`).toEqual({
    x: rect.x,
    y: rect.y,
  });
}

/** Where each marking node is: layer, parent and position in the stack. */
function placeOf(node: Konva.Node): { parent: Konva.Container | null; index: number } {
  return { parent: node.getParent(), index: node.zIndex() };
}

let warn: ReturnType<typeof vi.spyOn> | null = null;
afterEach(() => {
  warn?.mockRestore();
  warn = null;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  textMeasurer.value = approximateMeasurer;
});

function spyOnWarnings(): void {
  warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
}

// Decisions 5 to 7 of the canvas-scale stage: during a gesture, what moves goes into a group at the bottom
// of the overlays layer and only it is redrawn on every `pointermove`; on release or cancel, the
// nodes go back to the layers and to the indices they had before.
describe('drag group: one marking (whole project in view, 2,000 markings)', () => {
  it('each pointermove redraws only the overlays and the drawing follows the pointer', () => {
    spyOnWarnings();
    const s = openWholeProject(2000);
    const { parent, child } = parentAndChild(s);
    const before = placeOf(internals(s).markings.node(parent.id)?.group as Konva.Group);
    const beforeChild = placeOf(
      internals(s).markings.node(child.id)?.group as Konva.Group,
    );

    expect(s.actions.beginGesture().ok).toBe(true);
    s.actions.previewMarkingMove(parent.id, 4, 4);
    s.flush(); // The frame that takes the nodes to the group (the layers involved redraw).
    s.drawnLayers();

    for (const d of [8, 12, 16]) {
      expect(s.actions.previewMarkingMove(parent.id, d, d).ok).toBe(true);
      s.flush();
      expect(redrawn(s.drawnLayers()), `pointermove ${d}`).toEqual(['overlay']);
      for (const id of [parent.id, child.id]) {
        expectDrawnAt(s, id);
        const group = internals(s).markings.node(id)?.group as Konva.Group;
        expect(layerName(group)).toBe('overlay');
      }
    }

    // A stationary marking stays in the markings layer.
    const other = s.project.markings.find(
      (m) => m.parentId === null && m.id !== parent.id,
    );
    const otherGroup = internals(s).markings.node(other?.id ?? '')?.group as Konva.Group;
    expect(layerName(otherGroup)).toBe('markings');

    // Release: the nodes go back, in the same parent and at the same index; the frame redraws the ones involved.
    s.actions.finishMarkingMove(parent.id, 16, 16);
    s.actions.commitGesture();
    s.flush();
    const layers = redrawn(s.drawnLayers());
    expect(layers).toContain('markings');
    expect(layers).toContain('overlay');
    const after = placeOf(internals(s).markings.node(parent.id)?.group as Konva.Group);
    const afterChild = placeOf(
      internals(s).markings.node(child.id)?.group as Konva.Group,
    );
    expect(after).toEqual(before);
    expect(afterChild).toEqual(beforeChild);
    expectDrawnAt(s, parent.id);
    expectDrawnAt(s, child.id);
    expect(warn).not.toHaveBeenCalled();
    s.destroy();
  }, 120_000);

  it('cancelling the gesture returns the nodes as releasing does', () => {
    spyOnWarnings();
    const s = openWholeProject(500);
    const { parent, child } = parentAndChild(s);
    const node = internals(s).markings.node(parent.id)?.group as Konva.Group;
    const before = placeOf(node);
    const x = internals(s).markings.node(parent.id)?.border.x();

    s.actions.beginGesture();
    s.actions.previewMarkingMove(parent.id, 6, 6);
    s.flush();
    s.actions.previewMarkingMove(parent.id, 12, 12);
    s.flush();
    expect(layerName(node)).toBe('overlay');
    expect(internals(s).markings.node(parent.id)?.border.x()).not.toBe(x);

    s.drawnLayers();
    s.actions.cancelGesture();
    s.flush();
    expect(layerName(node)).toBe('markings');
    expect(placeOf(node)).toEqual(before);
    expect(internals(s).markings.node(parent.id)?.border.x()).toBe(x);
    expectDrawnAt(s, parent.id);
    expectDrawnAt(s, child.id);
    expect(redrawn(s.drawnLayers())).toEqual(
      expect.arrayContaining(['markings', 'overlay']),
    );
    expect(warn).not.toHaveBeenCalled();
    s.destroy();
  }, 120_000);

  it('resizing: the same (only the overlays per pointermove; on release, the nodes go back)', () => {
    spyOnWarnings();
    const s = openWholeProject(500);
    const { parent } = parentAndChild(s);
    const node = internals(s).markings.node(parent.id)?.group as Konva.Group;
    const before = placeOf(node);

    s.actions.beginGesture();
    const grow = (w: number) =>
      s.actions.previewMarkingRect(parent.id, {
        ...parent.rect,
        width: parent.rect.width + w,
      });
    grow(10);
    s.flush();
    s.drawnLayers();
    for (const w of [20, 30]) {
      expect(grow(w).ok).toBe(true);
      s.flush();
      expect(redrawn(s.drawnLayers())).toEqual(['overlay']);
      expect(layerName(node)).toBe('overlay');
      expectDrawnAt(s, parent.id);
      const project = s.store.project.peek();
      const rect = project && markingCanvasRectOf(project, markingById(s, parent.id));
      expect(internals(s).markings.node(parent.id)?.border.width()).toBe(rect?.width);
      expect(markingById(s, parent.id).rect.width).toBe(parent.rect.width + w);
    }
    s.actions.cancelGesture();
    s.flush();
    expect(placeOf(node)).toEqual(before);
    expect(layerName(node)).toBe('markings');
    s.destroy();
  }, 120_000);
});

describe('drag group: container and multiple selection', () => {
  it('moving a container takes the image and everything in it to the group, and everything goes back on release', () => {
    spyOnWarnings();
    const s = openWholeProject(500);
    const image = s.project.containers[0];
    if (!image) throw new Error('fixture');
    const inside = s.project.markings.filter((m) => m.containerId === image.id);
    const outside = s.project.markings.find((m) => m.containerId !== image.id);
    const imageNode = internals(s).images.node(image.id)?.group as Konva.Group;
    const before = placeOf(imageNode);
    const beforeMarkings = inside.map((m) =>
      placeOf(internals(s).markings.node(m.id)?.group as Konva.Group),
    );

    s.actions.beginGesture();
    const move = (d: number) =>
      s.actions.previewImagePlacement(image.id, {
        ...image.placement,
        x: image.placement.x + d,
        y: image.placement.y + d,
      });
    expect(move(5).ok).toBe(true);
    s.flush();
    s.drawnLayers();
    for (const d of [10, 15]) {
      expect(move(d).ok).toBe(true);
      s.flush();
      expect(redrawn(s.drawnLayers()), `pointermove ${d}`).toEqual(['overlay']);
      expect(layerName(imageNode)).toBe('overlay');
      expect(imageNode.x()).toBe(image.placement.x + d);
      for (const m of inside) {
        const group = internals(s).markings.node(m.id)?.group as Konva.Group;
        expect(layerName(group), m.id).toBe('overlay');
        expectDrawnAt(s, m.id);
      }
    }
    const outsideGroup = internals(s).markings.node(outside?.id ?? '')
      ?.group as Konva.Group;
    expect(layerName(outsideGroup)).toBe('markings');

    s.actions.cancelGesture();
    s.flush();
    expect(layerName(imageNode)).toBe('images');
    expect(placeOf(imageNode)).toEqual(before);
    inside.forEach((m, i) => {
      const group = internals(s).markings.node(m.id)?.group as Konva.Group;
      expect(placeOf(group), m.id).toEqual(beforeMarkings[i]);
    });
    expect(warn).not.toHaveBeenCalled();
    s.destroy();
  }, 120_000);

  it('moving a multiple selection: the same', () => {
    spyOnWarnings();
    const s = openWholeProject(500);
    const [a, b] = s.project.markings.filter((m) => m.parentId === null);
    if (!a || !b) throw new Error('fixture');
    const items: ItemRef[] = [
      { kind: 'marking', id: a.id },
      { kind: 'marking', id: b.id },
    ];
    const nodes = [a, b].map(
      (m) => internals(s).markings.node(m.id)?.group as Konva.Group,
    );
    const before = nodes.map(placeOf);

    s.actions.beginGesture();
    s.actions.previewItemsMove(items, 3, 3);
    s.flush();
    s.drawnLayers();
    for (const d of [6, 9]) {
      expect(s.actions.previewItemsMove(items, d, d).ok).toBe(true);
      s.flush();
      expect(redrawn(s.drawnLayers())).toEqual(['overlay']);
      for (const m of [a, b]) {
        expectDrawnAt(s, m.id);
        expect(layerName(internals(s).markings.node(m.id)?.group as Konva.Group)).toBe(
          'overlay',
        );
      }
    }
    s.actions.cancelGesture();
    s.flush();
    expect(nodes.map(placeOf)).toEqual(before);
    nodes.forEach((n) => expect(layerName(n)).toBe('markings'));
    s.destroy();
  }, 120_000);
});

describe('drag group: arrows', () => {
  it('the arrow between the dragged marking and a stationary one is redone on every frame, inside the group', () => {
    spyOnWarnings();
    const s = openWholeProject(500);
    const arrow = s.project.arrows[0];
    if (!arrow) throw new Error('fixture');
    const mover = markingById(s, arrow.from);
    const startOf = () =>
      internals(s).arrows.liftedDrawn.find((shape) => shape.arrow.id === arrow.id)?.route
        .points[0];

    expect(internals(s).arrows.drawn.some((shape) => shape.arrow.id === arrow.id)).toBe(
      true,
    );
    s.actions.beginGesture();
    s.actions.previewMarkingMove(mover.id, 5, 5);
    s.flush();
    s.drawnLayers();
    // The arrow left the stationary arrows stack and is in the drag group.
    expect(internals(s).arrows.drawn.some((shape) => shape.arrow.id === arrow.id)).toBe(
      false,
    );
    const first = startOf();
    expect(first).toBeDefined();
    s.actions.previewMarkingMove(mover.id, 25, 25);
    s.flush();
    expect(redrawn(s.drawnLayers())).toEqual(['overlay']);
    expect(startOf()).not.toEqual(first);
    // The other arrows stay in the stationary arrows stack.
    expect(internals(s).arrows.size).toBeGreaterThan(s.project.arrows.length / 2);

    s.actions.cancelGesture();
    s.flush();
    expect(internals(s).arrows.drawn.some((shape) => shape.arrow.id === arrow.id)).toBe(
      true,
    );
    expect(internals(s).arrows.liftedDrawn).toHaveLength(0);
    s.destroy();
  }, 120_000);

  it('touching the route and the tip of an arrow: only the overlays per pointermove', () => {
    spyOnWarnings();
    const s = openWholeProject(500);
    const arrow = s.project.arrows[0];
    const target = s.project.markings.filter((m) => m.parentId === null)[7];
    if (!arrow || !target) throw new Error('fixture');

    s.actions.beginGesture();
    s.actions.previewArrowRoute(arrow.id, [{ x: 1000, y: 1000 }]);
    s.flush();
    s.drawnLayers();
    for (const y of [1100, 1200]) {
      expect(s.actions.previewArrowRoute(arrow.id, [{ x: 1000, y }]).ok).toBe(true);
      s.flush();
      expect(redrawn(s.drawnLayers())).toEqual(['overlay']);
      expect(internals(s).arrows.liftedDrawn.map((shape) => shape.arrow.id)).toEqual([
        arrow.id,
      ]);
    }
    s.actions.cancelGesture();
    s.flush();
    expect(internals(s).arrows.liftedDrawn).toHaveLength(0);

    s.actions.beginGesture();
    s.actions.previewArrowEndpoint(arrow.id, 'to', target.id, null);
    s.flush();
    s.drawnLayers();
    s.actions.previewArrowEndpoint(arrow.id, 'to', target.id, 'top');
    s.flush();
    expect(redrawn(s.drawnLayers())).toEqual(['overlay']);
    s.actions.cancelGesture();
    s.flush();
    expect(internals(s).arrows.liftedDrawn).toHaveLength(0);
    s.destroy();
  }, 120_000);
});

describe('drag group: component drawing and floating', () => {
  function setup() {
    installFakeCanvas();
    const flush = stubFrames();
    const editor = componentEditor();
    const container = document.createElement('div');
    Object.defineProperty(container, 'clientWidth', { value: 380 });
    Object.defineProperty(container, 'clientHeight', { value: 700 });
    document.body.append(container);
    const controller = new CanvasController({
      container,
      display: createDisplayImages<ImageBitmap>(() => new Promise(() => undefined)),
      ...editor,
    });
    flush();
    const meter = layerDrawMeter(stageOf(container));
    meter.take();
    return { ...editor, controller, container, flush, meter };
  }

  /** First child of the container group that carries the marking drawing. */
  const drawingNode = (
    layer: ComponentLayerRenderer,
    id: string,
  ): Konva.Node | undefined =>
    (layer as unknown as { mounted: Map<string, { node: Konva.Node }> }).mounted.get(id)
      ?.node;

  it('the component drawing follows the drag and goes back on release', () => {
    spyOnWarnings();
    const s = setup();
    const layer = () => internals(s).componentLayer;
    const first = drawingNode(layer(), 'T1');
    expect(first).toBeDefined();
    if (!first) return;
    const group = first.getParent();
    const before = placeOf(first);
    const x0 = first.getAbsolutePosition().x;

    s.actions.beginGesture();
    s.actions.previewMarkingMove('T1', 10, 10);
    s.flush();
    s.meter.take();
    // On every preview the marking drawing is instantiated again: the node is the one mounted now.
    const moving = () => drawingNode(layer(), 'T1') as Konva.Node;
    const x1 = moving().getAbsolutePosition().x;
    s.actions.previewMarkingMove('T1', 30, 30);
    s.flush();
    expect(redrawn(s.meter.take())).toEqual(['overlay']);
    // The drawing goes to the group (in the overlays layer) and follows the marking, with the
    // scale of the image it is in.
    expect(layerName(moving())).toBe('overlay');
    const scale = moving().getAbsoluteScale().x;
    expect(x1 - x0).toBeCloseTo(10 * scale, 5);
    expect(moving().getAbsolutePosition().x - x1).toBeCloseTo(20 * scale, 5);

    s.actions.cancelGesture();
    s.flush();
    const back = moving();
    expect(back.getParent()).toBe(group);
    expect(placeOf(back)).toEqual(before);
    expect(layerName(back)).toBe('components');
    expect(back.getAbsolutePosition().x).toBeCloseTo(x0, 5);
    s.controller.destroy();
  });

  it('the floating one: the drawing follows and, on release, goes back to the top layer', () => {
    spyOnWarnings();
    const s = setup();
    expect(s.actions.setMarkingFloating('T2', true).ok).toBe(true);
    s.flush();
    const layer = () => internals(s).floatingLayer;
    const moving = () => drawingNode(layer(), 'T2') as Konva.Node;
    expect(drawingNode(layer(), 'T2')).toBeDefined();
    expect(layerName(moving())).toBe('floating');
    const marking = internals(s).markings.node('T2')?.group as Konva.Group;
    expect(layerName(marking)).toBe('floating');

    s.actions.beginGesture();
    s.actions.previewMarkingMove('T2', 10, 10);
    s.flush();
    s.meter.take();
    s.actions.previewMarkingMove('T2', 20, 20);
    s.flush();
    expect(redrawn(s.meter.take())).toEqual(['overlay']);
    expect(layerName(moving())).toBe('overlay');
    expect(layerName(marking)).toBe('overlay');

    s.actions.finishMarkingMove('T2', 20, 20);
    s.actions.commitGesture();
    s.flush();
    expect(layerName(moving())).toBe('floating');
    expect(layerName(marking)).toBe('floating');
    s.controller.destroy();
  });
});

describe('drag group: the stage', () => {
  it('stays with 5 layers, and the overlays one carries the group at the bottom', () => {
    spyOnWarnings();
    const s = openWholeProject(500);
    const { parent } = parentAndChild(s);
    s.actions.beginGesture();
    s.actions.previewMarkingMove(parent.id, 4, 4);
    s.flush();
    const stage = stageOf(s.container);
    expect(stage.getLayers().map((l) => l.name())).toEqual([
      'images',
      'components',
      'markings',
      'floating',
      'overlay',
    ]);
    const overlay = stage.getLayers()[4] as Konva.Layer;
    const node = internals(s).markings.node(parent.id)?.group as Konva.Group;
    // The drag group is the first child of the layer, below everything else.
    expect(overlay.getChildren()[0]?.isAncestorOf(node)).toBe(true);
    s.actions.cancelGesture();
    s.flush();
    expect(warn).not.toHaveBeenCalled();
    s.destroy();
  }, 120_000);
});

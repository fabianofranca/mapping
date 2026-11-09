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

/** Os renderizadores e as camadas do controller (privados: o teste os lê para provar onde estão os nós). */
interface Internals {
  readonly markings: MarkingRenderer;
  readonly images: ImageRenderer;
  readonly arrows: ArrowRenderer;
  readonly componentLayer: ComponentLayerRenderer;
  readonly floatingLayer: ComponentLayerRenderer;
}
const internals = (s: { controller: unknown }): Internals => s.controller as Internals;

/** Nomes das camadas que o quadro redesenhou (contagem > 0). */
function redrawn(counts: Record<string, number>): string[] {
  return Object.entries(counts)
    .filter(([, n]) => n > 0)
    .map(([name]) => name)
    .sort();
}

/** Nome da camada do palco em que o nó está. */
const layerName = (node: Konva.Node): string | undefined => node.getLayer()?.name();

function markingById(s: WholeProjectScenario, id: string): Marking {
  const marking = s.store.project.peek()?.markings.find((m) => m.id === id);
  if (!marking) throw new Error(`marcação ${id}`);
  return marking;
}

/** A marcação-pai e uma filha dela (a receita do cenário põe 4 filhas em cada raiz). */
function parentAndChild(s: WholeProjectScenario): { parent: Marking; child: Marking } {
  const parent = s.project.markings.find((m) => m.parentId === null);
  const child = s.project.markings.find((m) => m.parentId === parent?.id);
  if (!parent || !child) throw new Error('fixture');
  return { parent, child };
}

/** Posição desenhada da borda do nó contra a geometria do projeto (com a prévia do gesto). */
function expectDrawnAt(s: WholeProjectScenario, id: string): void {
  const project = s.store.project.peek();
  if (!project) throw new Error('sem projeto');
  const rect = markingCanvasRectOf(project, markingById(s, id));
  const node = internals(s).markings.node(id);
  expect(node, `nó de ${id}`).toBeDefined();
  expect({ x: node?.border.x(), y: node?.border.y() }, `posição de ${id}`).toEqual({
    x: rect.x,
    y: rect.y,
  });
}

/** Onde cada nó das marcações está: camada, pai e posição na pilha. */
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

// Decisões 5 a 7 da etapa canvas-escala: durante um gesto, o que se move vai para um grupo no fundo
// da camada de sobreposições e só ela é redesenhada a cada `pointermove`; ao soltar ou cancelar, os
// nós voltam às camadas e aos índices de antes.
describe('grupo de arrasto: uma marcação (projeto inteiro à vista, 2.000 marcações)', () => {
  it('cada pointermove redesenha só as sobreposições e o desenho acompanha o ponteiro', () => {
    spyOnWarnings();
    const s = openWholeProject(2000);
    const { parent, child } = parentAndChild(s);
    const before = placeOf(internals(s).markings.node(parent.id)?.group as Konva.Group);
    const beforeChild = placeOf(
      internals(s).markings.node(child.id)?.group as Konva.Group,
    );

    expect(s.actions.beginGesture().ok).toBe(true);
    s.actions.previewMarkingMove(parent.id, 4, 4);
    s.flush(); // O quadro que leva os nós ao grupo (as camadas envolvidas se redesenham).
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

    // Uma marcação parada continua na camada das marcações.
    const other = s.project.markings.find(
      (m) => m.parentId === null && m.id !== parent.id,
    );
    const otherGroup = internals(s).markings.node(other?.id ?? '')?.group as Konva.Group;
    expect(layerName(otherGroup)).toBe('markings');

    // Soltar: os nós voltam, no mesmo pai e no mesmo índice; o quadro redesenha as envolvidas.
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

  it('cancelar o gesto devolve os nós como ao soltar', () => {
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

  it('redimensionar: o mesmo (só as sobreposições por pointermove; ao soltar, os nós voltam)', () => {
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

describe('grupo de arrasto: container e seleção múltipla', () => {
  it('mover um container leva a imagem e tudo dele ao grupo, e tudo volta ao soltar', () => {
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

  it('mover uma seleção múltipla: o mesmo', () => {
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

describe('grupo de arrasto: setas', () => {
  it('a seta entre a marcação arrastada e uma parada é refeita a cada quadro, dentro do grupo', () => {
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
    // A seta saiu da pilha das setas paradas e está no grupo de arrasto.
    expect(internals(s).arrows.drawn.some((shape) => shape.arrow.id === arrow.id)).toBe(
      false,
    );
    const first = startOf();
    expect(first).toBeDefined();
    s.actions.previewMarkingMove(mover.id, 25, 25);
    s.flush();
    expect(redrawn(s.drawnLayers())).toEqual(['overlay']);
    expect(startOf()).not.toEqual(first);
    // As demais setas continuam na pilha das setas paradas.
    expect(internals(s).arrows.size).toBeGreaterThan(s.project.arrows.length / 2);

    s.actions.cancelGesture();
    s.flush();
    expect(internals(s).arrows.drawn.some((shape) => shape.arrow.id === arrow.id)).toBe(
      true,
    );
    expect(internals(s).arrows.liftedDrawn).toHaveLength(0);
    s.destroy();
  }, 120_000);

  it('mexer na rota e na ponta de uma seta: só as sobreposições por pointermove', () => {
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

describe('grupo de arrasto: desenho de componente e flutuante', () => {
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

  /** Primeiro filho do grupo do container que traz o desenho da marcação. */
  const drawingNode = (
    layer: ComponentLayerRenderer,
    id: string,
  ): Konva.Node | undefined =>
    (layer as unknown as { mounted: Map<string, { node: Konva.Node }> }).mounted.get(id)
      ?.node;

  it('o desenho do componente acompanha o arrastar e volta ao soltar', () => {
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
    // A cada prévia o desenho da marcação é instanciado de novo: o nó é o que está montado agora.
    const moving = () => drawingNode(layer(), 'T1') as Konva.Node;
    const x1 = moving().getAbsolutePosition().x;
    s.actions.previewMarkingMove('T1', 30, 30);
    s.flush();
    expect(redrawn(s.meter.take())).toEqual(['overlay']);
    // O desenho vai para o grupo (na camada de sobreposições) e acompanha a marcação, com a
    // escala da imagem em que ela está.
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

  it('a flutuante: o desenho acompanha e, ao soltar, volta para a camada de cima', () => {
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

describe('grupo de arrasto: o palco', () => {
  it('continua com 5 camadas, e a de sobreposições leva o grupo no fundo', () => {
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
    // O grupo de arrasto é o primeiro filho da camada, por baixo de todo o resto.
    expect(overlay.getChildren()[0]?.isAncestorOf(node)).toBe(true);
    s.actions.cancelGesture();
    s.flush();
    expect(warn).not.toHaveBeenCalled();
    s.destroy();
  }, 120_000);
});

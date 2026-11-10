import { afterEach, describe, expect, it, vi } from 'vitest';
import Konva from 'konva';
import {
  canvasProject,
  editorFor,
  installFakeCanvas,
  layerDrawMeter,
  stageOf,
  visibleShapesByLayer,
} from './harness';
import { CanvasController } from '../../src/canvas/CanvasController';
import { createDisplayImages } from '../../src/store/displayImages';
import {
  openWholeProject,
  stubFrames,
  type ScenarioOptions,
  type ScenarioSize,
} from './wholeProjectScenario';

const LAYERS = ['images', 'components', 'markings', 'floating', 'overlay'];

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('medidores do harness (palco pequeno)', () => {
  function smallStage() {
    installFakeCanvas();
    const flush = stubFrames();
    const editor = editorFor(canvasProject());
    const container = document.createElement('div');
    Object.defineProperty(container, 'clientWidth', { value: 380 });
    Object.defineProperty(container, 'clientHeight', { value: 700 });
    document.body.append(container);
    const controller = new CanvasController({
      container,
      store: editor.store,
      actions: editor.actions,
      display: createDisplayImages<ImageBitmap>(() => new Promise(() => undefined)),
      ui: editor.ui,
      derived: editor.derived,
      view: editor.view,
    });
    flush();
    return { controller, container, flush, editor };
  }

  it('as 5 camadas do palco têm nome', () => {
    const { controller, container } = smallStage();
    expect(
      stageOf(container)
        .getLayers()
        .map((l) => l.name()),
    ).toEqual(['images', 'components', 'markings', 'floating', 'overlay']);
    controller.destroy();
  });

  it('o medidor conta as camadas redesenhadas: pan redesenha as 5 hoje', () => {
    const { controller, container, flush } = smallStage();
    const meter = layerDrawMeter(stageOf(container));
    meter.take();
    controller.zoomBy(1.1);
    flush();
    const counts = meter.take();
    expect(Object.keys(counts).sort()).toEqual([...LAYERS].sort());
    for (const name of LAYERS) expect(counts[name], name).toBeGreaterThanOrEqual(1);
    // Sem quadro agendado, nada é redesenhado.
    flush();
    expect(Object.values(meter.take()).every((n) => n === 0)).toBe(true);
    meter.restore();
    controller.destroy();
  });

  it('o medidor soma o tempo do drawScene de cada camada e zera a cada leitura', () => {
    const { controller, container, flush } = smallStage();
    const meter = layerDrawMeter(stageOf(container));
    meter.takeMs();
    controller.zoomBy(1.1);
    const total = flush();
    const times = meter.takeMs();
    expect(Object.keys(times).sort()).toEqual([...LAYERS].sort());
    for (const name of LAYERS) expect(times[name], name).toBeGreaterThanOrEqual(0);
    const sum = Object.values(times).reduce((a, b) => a + b, 0);
    expect(sum).toBeGreaterThan(0);
    // O desenho das camadas é parte do quadro, nunca mais que ele.
    expect(sum).toBeLessThanOrEqual(total);
    // Lida uma vez, a soma volta a zero até o próximo quadro.
    expect(Object.values(meter.takeMs()).every((ms) => ms === 0)).toBe(true);
    meter.restore();
    controller.destroy();
  });

  it('o medidor de formas visíveis ignora nós escondidos e os de ancestral escondido', () => {
    const { controller, container } = smallStage();
    const stage = stageOf(container);
    const layer = stage.findOne<Konva.Layer>('.markings');
    expect(layer).toBeDefined();
    const before = visibleShapesByLayer(stage).markings ?? 0;
    expect(before).toBeGreaterThan(0);
    const group = new Konva.Group({ visible: false });
    group.add(new Konva.Rect({ width: 1, height: 1 }));
    layer?.add(group);
    expect(visibleShapesByLayer(stage).markings).toBe(before);
    group.visible(true);
    expect(visibleShapesByLayer(stage).markings).toBe(before + 1);
    controller.destroy();
  });
});

// Linha de base: só registra as contagens e os tempos de hoje, sem afirmar meta (as metas e os
// orçamentos estão em renderPerformance.test.ts). 5.000 só com BASELINE_5000=1 (leva ~1 min);
// rode com `--silent=false` para ver as linhas impressas.
const SIZES: ScenarioSize[] = process.env.BASELINE_5000 ? [500, 2000, 5000] : [500, 2000];

interface Step {
  /** Quadro inteiro (ms): `CanvasController.render` mais o desenho das camadas. */
  readonly ms: number;
  /** Soma do `drawScene` das camadas (ms); o `render` é a diferença. */
  readonly draw: number;
  /** `render` sozinho (ms): o quadro menos o desenho das camadas. */
  readonly render: number;
  readonly layers: Record<string, number>;
  /** `drawScene` por camada (ms). */
  readonly layerMs: Record<string, number>;
}

const round = (x: number): number => Math.round(x * 10) / 10;

/** Roda `act`, o quadro agendado e devolve o tempo dele separado do `drawScene` por camada. */
function stepOf(
  s: ReturnType<typeof openWholeProject>,
  meter: ReturnType<typeof layerDrawMeter>,
  act: () => void,
): Step {
  meter.take();
  meter.takeMs();
  act();
  const ms = s.flush();
  const layers = meter.take();
  const layerMs = Object.fromEntries(
    Object.entries(meter.takeMs()).map(([name, value]) => [name, round(value)]),
  );
  const draw = Object.values(layerMs).reduce((sum, value) => sum + value, 0);
  return { ms: round(ms), draw: round(draw), render: round(ms - draw), layers, layerMs };
}

/** Pan, zoom, edição, seleção e um passo de arrasto, como o `perf:canvas` mede. */
function recordSteps(
  s: ReturnType<typeof openWholeProject>,
  firstId: string,
): Record<string, Step> {
  const meter = layerDrawMeter(stageOf(s.container));
  const steps: Record<string, Step> = {};
  steps.zoom = stepOf(s, meter, () => s.controller.zoomBy(1.1));
  steps.pan = stepOf(s, meter, () => s.controller.centerOnPoint({ x: 500, y: 500 }));
  steps.edit = stepOf(s, meter, () => s.actions.renameMarking(firstId, 'Renomeada'));
  steps.selection = stepOf(s, meter, () => {
    s.ui.selection.value = { kind: 'marking', id: firstId };
  });
  steps.drag = stepOf(s, meter, () => {
    s.store.beginGesture();
    s.actions.previewMarkingMove(firstId, 10, 10);
  });
  meter.restore();
  return steps;
}

describe.each<ScenarioSize>(SIZES)('projeto inteiro à vista, %i marcações', (size) => {
  it('registra camadas redesenhadas, formas visíveis e nós criados', () => {
    const s = openWholeProject(size);
    const stage = stageOf(s.container);
    const nodes = stage.find('Group, Shape').length;
    const first = s.project.markings.find((m) => m.parentId === null);
    if (!first) throw new Error('fixture');
    const first_ms = round(s.firstFrameMs);
    const steps = recordSteps(s, first.id);

    const visible = visibleShapesByLayer(stage);
    console.log(
      `[linha de base ${size}]`,
      JSON.stringify({ nodes, visible, first: first_ms, steps }),
    );
    expect(Object.keys(visible).sort()).toEqual([...LAYERS].sort());
    expect(nodes).toBeGreaterThan(size);
    s.destroy();
  }, 120_000);
});

// Peso das setas e dos componentes (CD1, decisão 1): 2.000 marcações com 0, 500 e 1.000 setas e com as 21
// instâncias da tela do Material 3 em cada container. Só registra, para a medida de partida.
describe('projeto inteiro à vista, 2.000 marcações: setas e componentes', () => {
  const cases: { label: string; options: ScenarioOptions }[] = [
    { label: '0 setas', options: { arrows: 0 } },
    { label: '500 setas', options: { arrows: 500 } },
    { label: '1.000 setas', options: { arrows: 1000 } },
    { label: 'com componentes', options: { components: true } },
  ];
  it.each(cases)(
    'registra o quadro com $label',
    ({ label, options }) => {
      const s = openWholeProject(2000, 'fit', options);
      const first = s.project.markings.find((m) => m.parentId === null);
      if (!first) throw new Error('fixture');
      const first_ms = round(s.firstFrameMs);
      const steps = recordSteps(s, first.id);
      console.log(
        `[setas e componentes 2000 ${label}]`,
        JSON.stringify({
          markings: s.project.markings.length,
          arrows: s.project.arrows.length,
          first: first_ms,
          steps,
        }),
      );
      if (options.arrows !== undefined) {
        expect(s.project.arrows.length).toBeLessThanOrEqual(options.arrows);
      }
      if (options.components) {
        expect(s.project.markings.length).toBeGreaterThan(2000 + 21 * 20 - 1);
        expect(s.container.dataset.components).toBeDefined();
      }
      s.destroy();
    },
    120_000,
  );
});

// Nível de detalhe (DA3, decisão 4): com o projeto inteiro à vista, a camada das marcações tem no
// máximo uma forma visível por marcação e nenhuma nas menores que 2 px.
describe('nível de detalhe com o projeto inteiro à vista (2.000 marcações)', () => {
  it('no máximo uma forma visível por marcação; as menores que 2 px não têm nenhuma', () => {
    const s = openWholeProject(2000);
    const stage = stageOf(s.container);
    const layer = stage.findOne<Konva.Layer>('.markings');
    if (!layer) throw new Error('camada das marcações');
    const scale = stage.scaleX();
    // A camada tem o grupo das marcações (um grupo por marcação) e o das setas.
    const stack = (layer.getChildren() as Konva.Group[]).find(
      (g) => g.getChildren().length === s.project.markings.length,
    );
    if (!stack) throw new Error('grupo das marcações');
    const groups = stack.getChildren() as Konva.Group[];
    expect(groups.length).toBe(s.project.markings.length);
    let hidden = 0;
    for (const group of groups) {
      if (!group.isVisible()) {
        hidden++;
        continue;
      }
      expect(visibleShapes(group)).toBeLessThanOrEqual(1);
      expect(biggestSide(group) * scale).toBeGreaterThanOrEqual(2);
    }
    expect(hidden).toBe(0);
    // Afastando até o mínimo do zoom, as marcações pequenas (e as que ficam menores que 2 px) somem.
    s.controller.zoomBy(0.0001);
    s.flush();
    const far = stage.scaleX();
    let still = 0;
    for (const group of groups) {
      if (!group.isVisible()) continue;
      still++;
      expect(biggestSide(group) * far).toBeGreaterThanOrEqual(2);
    }
    expect(still).toBeGreaterThan(0);
    expect(still).toBeLessThan(groups.length);
    expect(visibleShapes(stack)).toBeLessThanOrEqual(groups.length - hidden);
    s.destroy();
  }, 120_000);
});

function visibleShapes(node: Konva.Node): number {
  if (!node.isVisible()) return 0;
  if (node instanceof Konva.Shape) return 1;
  if (node instanceof Konva.Container) {
    return node.getChildren().reduce((sum, child) => sum + visibleShapes(child), 0);
  }
  return 0;
}

/** Maior lado (px do canvas) dos retângulos visíveis do grupo da marcação (borda, halo, ...). */
function biggestSide(group: Konva.Group): number {
  return Math.max(
    0,
    ...group
      .getChildren()
      .filter((c) => c.isVisible() && c instanceof Konva.Rect)
      .map((c) => Math.max(c.width(), c.height())),
  );
}

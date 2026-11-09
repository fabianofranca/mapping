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
import { openWholeProject, stubFrames, type ScenarioSize } from './wholeProjectScenario';

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

// Linha de base: só registra as contagens de hoje (as metas entram nas fases DA2 a DA5).
// 5.000 só com BASELINE_5000=1 (leva ~20 s); rode com `--silent=false` para ver a linha impressa.
const SIZES: ScenarioSize[] = process.env.BASELINE_5000 ? [500, 2000, 5000] : [500, 2000];

describe.each<ScenarioSize>(SIZES)('projeto inteiro à vista, %i marcações', (size) => {
  it('registra camadas redesenhadas, formas visíveis e nós criados', () => {
    const s = openWholeProject(size);
    const stage = stageOf(s.container);
    const nodes = stage.find('Group, Shape').length;
    const first = s.project.markings.find((m) => m.parentId === null);
    if (!first) throw new Error('fixture');
    const rows: Record<string, Record<string, number>> = {};
    const ms: Record<string, number> = { first: s.firstFrameMs };

    s.controller.zoomBy(1.1);
    ms.zoom = s.flush();
    rows.zoom = s.drawnLayers();
    s.controller.centerOnPoint({ x: 500, y: 500 });
    ms.pan = s.flush();
    rows.pan = s.drawnLayers();
    s.actions.renameMarking(first.id, 'Renomeada');
    ms.edit = s.flush();
    rows.edit = s.drawnLayers();
    s.ui.selection.value = { kind: 'marking', id: first.id };
    ms.selection = s.flush();
    rows.selection = s.drawnLayers();
    s.store.beginGesture();
    s.actions.previewMarkingMove(first.id, 10, 10);
    ms.drag1 = s.flush();
    rows.dragMove = s.drawnLayers();

    const visible = visibleShapesByLayer(stage);
    console.log(`[linha de base ${size}]`, JSON.stringify({ nodes, visible, rows, ms }));
    expect(Object.keys(visible).sort()).toEqual([...LAYERS].sort());
    expect(nodes).toBeGreaterThan(size);
    s.destroy();
  }, 120_000);
});

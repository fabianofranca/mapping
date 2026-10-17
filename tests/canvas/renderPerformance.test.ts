import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import Konva from 'konva';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { CanvasController } from '../../src/canvas/CanvasController';
import {
  ComponentLayerRenderer,
  type LayerDrawing,
} from '../../src/canvas/components/componentLayer';
import { renderScene } from '../../src/canvas/components/renderScene';
import { createCanvasViewState } from '../../src/canvas/viewState';
import { approximateMeasurer, instantiate } from '../../src/model/components/instantiate';
import {
  type Library,
  initialValues,
  loadLibrary,
} from '../../src/model/components/library';
import type { Instance } from '../../src/model/components/screen';
import { projectIndex, projectIssues } from '../../src/model';
import { createEditorDerived } from '../../src/store/derived';
import { createDisplayImages } from '../../src/store/displayImages';
import { createProjectStore } from '../../src/store/history';
import { createProjectActions } from '../../src/store/project';
import { createEditorUi } from '../../src/store/ui';
import { M3_SCREEN } from '../../lab/components/samplesMaterial3';
import { buildLargeTypedProject } from '../model/largeTypedProject';
import { installFakeCanvas } from './harness';

// Orçamento de uma renderização do canvas (docs/history/PLAN-etapa-2-1.md 14.3) com o projeto grande já
// indexado: Konva de verdade em jsdom, com um contexto 2D falso (nada é pintado;
// mede o trabalho do controller e do Konva para atualizar os nós).
const RENDER_BUDGET_MS = 16;
/** Desligado com `--coverage` (vite.config.ts): o código instrumentado é mais lento. */
const budgetIt = it.skipIf(process.env.PERF_BUDGETS === 'off');
/** Uma repetição separa ruído do runner de regressão (ver tests/model/performance.test.ts). */
const BUDGET_OPTIONS = { retry: 1 };

describe('renderização do canvas com o projeto grande', () => {
  const frames: FrameRequestCallback[] = [];
  /** Roda o quadro agendado e devolve quanto ele levou. */
  const flush = (): number => {
    const pending = frames.splice(0);
    const start = performance.now();
    for (const frame of pending) frame(start);
    return pending.length === 0 ? Number.NaN : performance.now() - start;
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
    const project = buildLargeTypedProject();
    const store = createProjectStore({ now: () => '2026-10-02T12:00:00.000Z' });
    store.load(project, { readOnly: false });
    const actions = createProjectActions(store);
    const ui = createEditorUi();
    const derived = createEditorDerived(store, ui);
    const display = createDisplayImages<ImageBitmap>(() => new Promise(() => undefined));
    const container = document.createElement('div');
    Object.defineProperty(container, 'clientWidth', { value: 380 });
    Object.defineProperty(container, 'clientHeight', { value: 700 });
    document.body.append(container);
    const controller = new CanvasController({
      container,
      store,
      actions,
      display,
      ui,
      derived,
      view: createCanvasViewState(),
    });
    // Já indexado: o orçamento é o do desenho, não o do índice (medido no modelo).
    projectIndex(project);
    projectIssues(project);
    return { project, store, actions, ui, controller, container };
  }

  budgetIt(
    `pan, zoom e edição desenham em menos de ${RENDER_BUDGET_MS} ms`,
    BUDGET_OPTIONS,
    () => {
      const { project, actions, ui, controller, container } = setup();
      flush(); // Primeiro quadro: cria os nós.

      // Aproxima numa marcação pai: cartões do zoom semântico na tela.
      const [first, second] = project.markings.filter((m) => m.parentId === null);
      if (!first || !second) throw new Error('fixture');
      ui.selection.value = { kind: 'marking', id: first.id };
      controller.centerSelection();
      flush();

      const pans: number[] = [];
      const zooms: number[] = [];
      const edits: number[] = [];
      for (let i = 0; i < 7; i++) {
        // Pan: centraliza alternando entre duas marcações vizinhas.
        ui.selection.value = { kind: 'marking', id: (i % 2 ? first : second).id };
        controller.centerSelection();
        pans.push(flush());
        container.dispatchEvent(
          new WheelEvent('wheel', {
            deltaY: i % 2 ? 40 : -40,
            clientX: 190,
            clientY: 350,
          }),
        );
        zooms.push(flush());
        expect(actions.renameMarking(first.id, `Renomeada ${i}`).ok).toBe(true);
        edits.push(flush());
      }
      const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[3] ?? Number.NaN;
      expect(median(pans)).toBeLessThan(RENDER_BUDGET_MS);
      expect(median(zooms)).toBeLessThan(RENDER_BUDGET_MS);
      expect(median(edits)).toBeLessThan(RENDER_BUDGET_MS);
      controller.destroy();
    },
  );

  it('várias mudanças no mesmo quadro geram uma renderização só', () => {
    const { ui, controller, project } = setup();
    // O `batchDraw` do Konva também usa o requestAnimationFrame: esvazia a fila.
    while (frames.length > 0) flush();
    const [a, b] = project.markings;
    if (!a || !b) throw new Error('fixture');
    ui.selection.value = { kind: 'marking', id: a.id };
    ui.selection.value = { kind: 'marking', id: b.id };
    ui.mode.value = 'draw';
    expect(frames).toHaveLength(1);
    controller.destroy();
  });
});

// Orçamento do desenho de componentes (B3): instanciar (motor puro, medidor aproximado) e
// desenhar (`renderScene`, Konva em jsdom com contexto falso) o Material 3 do pacote de exemplo.
// Medido (jsdom, máquina de desenvolvimento): uma instância 0,03 a 0,9 ms (média dos 15
// componentes ~0,25 ms); a tela de configurações (21 instâncias) 3,5 a 7 ms, com picos de
// ~15 ms do coletor de lixo no começo. O orçamento da instância é ~1 ms (folga de 4x sobre a
// média); o da tela é o do quadro, com a mediana de várias repetições.
const INSTANCE_BUDGET_MS = 1;
const MATERIAL3_DIR = join(__dirname, '../../examples/libraries/material3');

function loadMaterial3(): Library {
  const components = join(MATERIAL3_DIR, 'components');
  const files = [
    {
      path: 'material3.spec.json',
      text: readFileSync(join(MATERIAL3_DIR, 'material3.spec.json'), 'utf8'),
    },
    ...readdirSync(components)
      .filter((name) => name.endsWith('.json'))
      .map((name) => ({
        path: `components/${name}`,
        text: readFileSync(join(components, name), 'utf8'),
      })),
  ];
  return loadLibrary(files);
}

describe('desenho de componentes (Material 3)', () => {
  const library = loadMaterial3();
  const typeOf = new Map(library.types.map((type) => [type.id, type]));

  /** Instancia a tela de configurações inteira: um desenho por instância, na ordem do array. */
  function instantiateScreen(): Map<string, LayerDrawing> {
    const drawings = new Map<string, LayerDrawing>();
    for (const instance of M3_SCREEN.instances) {
      const component = typeOf.get(instance.typeId)?.component;
      if (!component) throw new Error(`fixture: sem componente ${instance.typeId}`);
      const { root } = instantiate(component, instance.values, instance.box, {
        measure: approximateMeasurer,
        idPrefix: instance.id,
      });
      drawings.set(instance.id, { markingId: instance.id, imageId: 'screen', root });
    }
    return drawings;
  }

  beforeAll(() => installFakeCanvas());
  afterAll(() => vi.restoreAllMocks());

  it('a biblioteca de exemplo carrega com os 15 componentes e a tela tem 21 instâncias', () => {
    expect(library.problems).toEqual([]);
    expect(library.types.filter((type) => type.component)).toHaveLength(15);
    expect(M3_SCREEN.instances).toHaveLength(21);
  });

  budgetIt(
    `instanciar e desenhar uma instância leva ~${INSTANCE_BUDGET_MS} ms em média`,
    BUDGET_OPTIONS,
    () => {
      const perComponent: number[] = [];
      for (const type of library.types) {
        const component = type.component;
        if (!component) continue;
        const values = initialValues(type);
        const box = { x: 0, y: 0, ...component.size };
        const once = () =>
          renderScene({
            root: instantiate(component, values, box, { measure: approximateMeasurer })
              .root,
            warnings: [],
          });
        for (let i = 0; i < 20; i++) once(); // Aquecimento (JIT e primeiro uso do Konva).
        const runs = 60;
        const start = performance.now();
        for (let i = 0; i < runs; i++) once();
        perComponent.push((performance.now() - start) / runs);
      }
      const mean = perComponent.reduce((sum, ms) => sum + ms, 0) / perComponent.length;
      expect(mean).toBeLessThan(INSTANCE_BUDGET_MS);
      // Nenhum componente sozinho passa de quatro vezes o orçamento (o maior mede ~0,9 ms).
      expect(Math.max(...perComponent)).toBeLessThan(INSTANCE_BUDGET_MS * 4);
    },
  );

  budgetIt(
    `uma tela de 21 instâncias (instanciar e desenhar) cabe em ${RENDER_BUDGET_MS} ms`,
    BUDGET_OPTIONS,
    () => {
      const placements = new Map([['screen', { x: 0, y: 0, scale: 1 }]]);
      const once = (): number => {
        const start = performance.now();
        const layer = new ComponentLayerRenderer(new Konva.Group());
        layer.render(instantiateScreen(), () => true, placements);
        const elapsed = performance.now() - start;
        layer.destroy();
        return elapsed;
      };
      for (let i = 0; i < 5; i++) once(); // Aquecimento.
      const times = Array.from({ length: 15 }, once);
      const median = [...times].sort((a, b) => a - b)[7] ?? Number.NaN;
      expect(median).toBeLessThan(RENDER_BUDGET_MS);
    },
  );

  budgetIt(
    'trocar o valor de uma instância refaz só o desenho dela, bem abaixo do quadro',
    BUDGET_OPTIONS,
    () => {
      const parent = new Konva.Group();
      const layer = new ComponentLayerRenderer(parent);
      const placements = new Map([['screen', { x: 0, y: 0, scale: 1 }]]);
      let drawings = instantiateScreen();
      layer.render(drawings, () => true, placements);

      const target: Instance | undefined = M3_SCREEN.instances[1];
      const component = target && typeOf.get(target.typeId)?.component;
      if (!target || !component) throw new Error('fixture');
      const times: number[] = [];
      for (let i = 0; i < 20; i++) {
        const next = new Map(drawings);
        const { root } = instantiate(
          component,
          { ...target.values, title: `Título ${i}` },
          target.box,
          { measure: approximateMeasurer, idPrefix: target.id },
        );
        next.set(target.id, { markingId: target.id, imageId: 'screen', root });
        const start = performance.now();
        expect(layer.render(next, () => true, placements)).toBe(true);
        times.push(performance.now() - start);
        drawings = next;
      }
      const median = [...times.slice(5)].sort((a, b) => a - b)[7] ?? Number.NaN;
      expect(median).toBeLessThan(RENDER_BUDGET_MS / 4);
      layer.destroy();
    },
  );
});

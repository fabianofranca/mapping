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
import { type FrameNode, baseNode } from '../../src/model/components/scene';
import { createCanvasViewState } from '../../src/canvas/viewState';
import { approximateMeasurer, instantiate } from '../../src/model/components/instantiate';
import {
  type Library,
  initialValues,
  loadLibrary,
} from '../../src/model/components/library';
import type { Instance } from '../../src/model/components/screen';
import {
  addBackgroundContainer,
  addComponentMarking,
  applySpecialization,
  createArrow,
  loadSpecComponents,
  parseSpec,
  projectIndex,
  projectIssues,
  type ComponentCatalog,
  type Project,
} from '../../src/model';
import { signal } from '@preact/signals';
import { specFiles } from '../../src/model';
import { createEditorDerived } from '../../src/store/derived';
import { createDisplayImages } from '../../src/store/displayImages';
import { createProjectStore } from '../../src/store/history';
import { createProjectActions } from '../../src/store/project';
import { textMeasurer } from '../../src/store/textMeasure';
import { createEditorUi, setViewMode } from '../../src/store/ui';
import { setViewShow } from '../../src/store/viewMode';
import { M3_SCREEN } from '../../viewer/samples/samplesMaterial3';
import { SPEC_ID, SPEC_JSON, testCatalog } from '../model/componentFixtures';
import { emptyProject } from '../model/fixtures';
import { propose } from '../model/proposalFixtures';
import { openHarness } from '../store/proposalHarness';
import { buildLargeTypedProject } from '../model/largeTypedProject';
import { material3Spec } from '../storage/packageFixture';
import { componentSources, installFakeCanvas } from './harness';
import { openWholeProject, wholeProject } from './wholeProjectScenario';

// Orçamento de uma renderização do canvas (docs/ARCHITECTURE.md, "Desempenho") com o projeto grande já
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

  /** Setas entre marcações vizinhas do projeto grande: cada uma é desenhada (ME4). */
  const ARROW_COUNT = 200;

  function setup() {
    const typed = buildLargeTypedProject();
    // 200 setas do projeto grande: da marcação `i` à `i + 3` (containers diferentes, canvas).
    const project = Array.from({ length: ARROW_COUNT }).reduce<Project>((acc, _, i) => {
      const from = acc.markings[i];
      const to = acc.markings[i + 3];
      if (!from || !to) throw new Error('fixture');
      return createArrow(acc, { id: `R${i}`, from: from.id, to: to.id });
    }, typed);
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

  it('desenha as 200 setas do projeto grande', () => {
    const { controller, container } = setup();
    flush();
    expect(container.dataset.arrows).toBe(String(ARROW_COUNT));
    controller.destroy();
  });

  budgetIt(
    `pan, zoom e edição do projeto grande (com ${ARROW_COUNT} setas) desenham em menos de ${RENDER_BUDGET_MS} ms`,
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

      // Uma rodada de cada métrica: pan, zoom (roda) e edição, alternando o sentido.
      const round = (i: number): { pan: number; zoom: number; edit: number } => {
        // Pan: centraliza alternando entre duas marcações vizinhas.
        ui.selection.value = { kind: 'marking', id: (i % 2 ? first : second).id };
        controller.centerSelection();
        const pan = flush();
        container.dispatchEvent(
          new WheelEvent('wheel', {
            deltaY: i % 2 ? 40 : -40,
            clientX: 190,
            clientY: 350,
          }),
        );
        const zoom = flush();
        expect(actions.renameMarking(first.id, `Renomeada ${i}`).ok).toBe(true);
        return { pan, zoom, edit: flush() };
      };
      // Aquece (JIT e coletor) como os orçamentos irmãos: as 3 primeiras rodadas não contam.
      for (let i = 0; i < 3; i++) round(i);
      const samples = Array.from({ length: 15 }, (_, i) => round(i));
      const median = (xs: number[]) =>
        [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? Number.NaN;
      // A métrica no `expect`: a falha diz qual estourou.
      expect(median(samples.map((r) => r.pan)), 'pan').toBeLessThan(RENDER_BUDGET_MS);
      expect(median(samples.map((r) => r.zoom)), 'zoom').toBeLessThan(RENDER_BUDGET_MS);
      expect(median(samples.map((r) => r.edit)), 'edição').toBeLessThan(RENDER_BUDGET_MS);
      controller.destroy();
    },
  );

  budgetIt(
    `modo visualização: trocar uma escolha do painel, pan e zoom desenham em menos de ${RENDER_BUDGET_MS} ms`,
    BUDGET_OPTIONS,
    () => {
      const { ui, controller, container } = setup();
      setViewMode(ui, true);
      flush();
      const round = (i: number): { choice: number; pan: number; zoom: number } => {
        // Uma escolha por rodada: contorno e nome alternam, as setas e os containers também.
        setViewShow(ui, { outline: i % 2 === 0, names: i % 3 !== 0 });
        const choice = flush();
        setViewShow(ui, { arrows: i % 2 === 0, containers: i % 4 !== 0 });
        const arrows = flush();
        controller.centerOnPoint({ x: 400 + 50 * (i % 5), y: 300 });
        const pan = flush();
        container.dispatchEvent(
          new WheelEvent('wheel', {
            deltaY: i % 2 ? 40 : -40,
            clientX: 190,
            clientY: 350,
          }),
        );
        return { choice: Math.max(choice, arrows), pan, zoom: flush() };
      };
      for (let i = 0; i < 3; i++) round(i);
      const samples = Array.from({ length: 15 }, (_, i) => round(i));
      const median = (xs: number[]) =>
        [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? Number.NaN;
      expect(median(samples.map((r) => r.choice)), 'escolha').toBeLessThan(
        RENDER_BUDGET_MS,
      );
      expect(median(samples.map((r) => r.pan)), 'pan').toBeLessThan(RENDER_BUDGET_MS);
      expect(median(samples.map((r) => r.zoom)), 'zoom').toBeLessThan(RENDER_BUDGET_MS);
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
const MATERIAL3_DIR = join(__dirname, '../../tests/fixtures/material3');

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
      drawings.set(instance.id, { markingId: instance.id, containerId: 'screen', root });
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
        next.set(target.id, { markingId: target.id, containerId: 'screen', root });
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

// Imagens remotas (RI3): quando uma imagem termina de carregar, só as marcações dela são refeitas
// (e o consentimento que muda refaz todas as que usam imagem); ambos cabem num quadro.
describe('refazer marcações com imagem remota', () => {
  const IMAGE_COUNT = 30;
  const drawings = new Map<string, LayerDrawing>();
  const image = { width: 64, height: 64 } as unknown as CanvasImageSource;
  const placements = new Map([['screen', { x: 0, y: 0, scale: 1 }]]);

  beforeAll(() => {
    installFakeCanvas();
    for (let i = 0; i < IMAGE_COUNT; i++) {
      const id = `m${i}`;
      const avatar = {
        ...baseNode({ id: `${id}-avatar`, name: 'avatar', width: 48, height: 48 }),
        type: 'rect' as const,
        cornerRadius: 24,
        fills: [
          {
            type: 'image' as const,
            url: `https://img.test/${i}.png`,
            fit: 'cover' as const,
          },
        ],
      };
      const root: FrameNode = {
        ...baseNode({ id, name: id, width: 200, height: 60 }),
        type: 'frame',
        clip: false,
        cornerRadius: 0,
        fills: [{ type: 'solid', color: '#eeeeee' }],
        children: [avatar],
      };
      drawings.set(id, { markingId: id, containerId: 'screen', root });
    }
  });

  budgetIt(
    `refazer 1 de ${IMAGE_COUNT} marcações com imagem cabe no quadro; refazer todas, em 1,5x`,
    BUDGET_OPTIONS,
    () => {
      const layer = new ComponentLayerRenderer(new Konva.Group(), {
        remoteImage: () => ({ state: 'loaded', image, width: 64, height: 64 }),
      });
      layer.render(drawings, () => true, placements);
      const median = (run: () => void): number => {
        for (let i = 0; i < 5; i++) run(); // Aquecimento.
        const times = Array.from({ length: 15 }, () => {
          const start = performance.now();
          run();
          return performance.now() - start;
        });
        return [...times].sort((a, b) => a - b)[7] ?? Number.NaN;
      };
      const one = median(() => layer.refreshImages(new Set(['https://img.test/3.png'])));
      const all = median(() => layer.refreshImages(null));
      expect(one).toBeLessThan(RENDER_BUDGET_MS / 4);
      expect(all).toBeLessThan(RENDER_BUDGET_MS * 1.5);
      layer.destroy();
    },
  );
});

// A tela de configurações do Material 3 (21 instâncias) num container, dentro do
// `CanvasController`: o quadro inteiro (todos os desenhos reinstanciados e refeitos), editar um
// campo (só uma marcação) e o zoom (a camada não se refaz). Medido (jsdom, máquina de
// desenvolvimento, medidor aproximado): quadro inteiro ~11 ms (10 a 13; até ~20 com a máquina
// ocupada), edição ~2 a 5 ms, zoom ~2 a 3 ms. A edição e o zoom têm o orçamento do quadro; o
// quadro inteiro (que acontece só ao carregar fontes ou trocar o medidor) tem 1,5x, porque
// reinstancia e refaz os 21 desenhos de uma vez. Sempre a mediana de várias repetições.
const FULL_FRAME_BUDGET_MS = RENDER_BUDGET_MS * 1.5;
describe('tela de componentes dentro do CanvasController (Material 3)', () => {
  const frames: FrameRequestCallback[] = [];
  const flush = (): void => {
    for (const frame of frames.splice(0)) frame(performance.now());
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
    textMeasurer.value = approximateMeasurer;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  /** Catálogo do pacote de exemplo, lido do disco como a sessão lê da pasta do projeto. */
  function m3Catalog(): ComponentCatalog {
    const loaded = loadSpecComponents(
      material3Spec(),
      'specs/material3/material3.spec.json',
      1,
      (path) => {
        try {
          return readFileSync(
            join(MATERIAL3_DIR, path.slice('specs/material3/'.length)),
            'utf8',
          );
        } catch {
          return undefined;
        }
      },
    );
    if (loaded.problems.length > 0) throw new Error(loaded.problems.join('\n'));
    return new Map([['material3', loaded]]);
  }

  function m3Project(catalog: ComponentCatalog): Project {
    let p = applySpecialization(emptyProject(), material3Spec(), {
      newId: (() => {
        let n = 0;
        return () => `S${++n}`;
      })(),
      packageSpecName: 'material3.spec.json',
    });
    p = addBackgroundContainer(p, {
      id: 'screen',
      width: M3_SCREEN.width,
      height: M3_SCREEN.height,
      background: M3_SCREEN.background,
    });
    for (const instance of M3_SCREEN.instances) {
      p = addComponentMarking(
        p,
        catalog,
        {
          markingId: instance.id,
          annotationId: `A_${instance.id}`,
          containerId: 'screen',
          parentId: instance.parentId ?? null,
          specId: 'material3',
          typeId: instance.typeId,
          rect: instance.box,
          values: Object.fromEntries(
            Object.entries(instance.values).flatMap(([key, value]) =>
              typeof value === 'string' || typeof value === 'number'
                ? [[key, value]]
                : [],
            ),
          ),
        },
        approximateMeasurer,
      );
    }
    return p;
  }

  function setup() {
    const catalog = m3Catalog();
    const project = m3Project(catalog);
    const store = createProjectStore({ now: () => '2026-10-02T12:00:00.000Z' });
    store.load(project, { readOnly: false });
    const sources = { catalog: signal(catalog), fontsEpoch: signal(0) };
    const actions = createProjectActions(store, {
      components: () => sources.catalog.peek(),
      measure: () => textMeasurer.peek(),
    });
    const ui = createEditorUi();
    const derived = createEditorDerived(store, ui, undefined, sources);
    const container = document.createElement('div');
    Object.defineProperty(container, 'clientWidth', { value: 412 });
    Object.defineProperty(container, 'clientHeight', { value: 917 });
    document.body.append(container);
    const controller = new CanvasController({
      container,
      store,
      actions,
      display: createDisplayImages<ImageBitmap>(() => new Promise(() => undefined)),
      ui,
      derived,
      view: createCanvasViewState(),
    });
    projectIndex(project);
    projectIssues(project);
    flush();
    return { actions, controller, container, derived, sources };
  }

  /** Mediana de `runs` medidas de `run`, que devolve o tempo gasto (ms). */
  const medianOf = (runs: number, run: () => number): number => {
    const times = Array.from({ length: runs }, run);
    return [...times].sort((a, b) => a - b)[Math.floor(runs / 2)] ?? Number.NaN;
  };

  it('desenha as 21 instâncias da tela de configurações', () => {
    const { controller, container, derived } = setup();
    expect(derived.drawnMarkings.value.size).toBe(21);
    expect(container.dataset.components).toBe('21');
    controller.destroy();
  });

  budgetIt(
    `o quadro inteiro (21 desenhos reinstanciados e refeitos) cabe em ${FULL_FRAME_BUDGET_MS} ms`,
    BUDGET_OPTIONS,
    () => {
      const { controller, sources } = setup();
      const whole = (): number => {
        const start = performance.now();
        sources.fontsEpoch.value++; // Reinstancia todos os desenhos.
        flush();
        return performance.now() - start;
      };
      for (let i = 0; i < 4; i++) whole(); // Aquecimento.
      expect(medianOf(15, whole)).toBeLessThan(FULL_FRAME_BUDGET_MS);
      controller.destroy();
    },
  );

  budgetIt(
    `editar um campo e redesenhar cabe em ${RENDER_BUDGET_MS} ms`,
    BUDGET_OPTIONS,
    () => {
      const { controller, actions, container } = setup();
      let n = 0;
      const edit = (): number => {
        const start = performance.now();
        const result = actions.setFieldValue('A_m-search', 'label', `Busca ${n++}`);
        flush();
        const elapsed = performance.now() - start;
        expect(result.ok).toBe(true);
        return elapsed;
      };
      for (let i = 0; i < 4; i++) edit();
      expect(medianOf(15, edit)).toBeLessThan(RENDER_BUDGET_MS);
      expect(container.dataset.components).toBe('21');
      controller.destroy();
    },
  );

  budgetIt(
    `o zoom da tela (sem refazer os desenhos) cabe em ${RENDER_BUDGET_MS} ms`,
    BUDGET_OPTIONS,
    () => {
      const { controller } = setup();
      const zoom = (): number => {
        const start = performance.now();
        controller.zoomBy(1.1);
        flush();
        return performance.now() - start;
      };
      for (let i = 0; i < 3; i++) zoom();
      expect(medianOf(15, zoom)).toBeLessThan(RENDER_BUDGET_MS);
      controller.destroy();
    },
  );
});

// Visão Proposto com 60 componentes novos (PC1): trocar para o Proposto instancia as 60 cenas
// novas de uma vez (como o quadro inteiro da tela de componentes: 1,5x o quadro); pan e zoom
// depois não reinstanciam nada e cabem no quadro. Texto de teste é mais leve que o Material 3,
// então o limite é o mesmo do quadro inteiro, com folga.
const PROPOSED_COUNT = 60;
describe('visão Proposto com 60 componentes novos', () => {
  const frames: FrameRequestCallback[] = [];
  const flush = (): void => {
    for (const frame of frames.splice(0)) frame(performance.now());
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
    textMeasurer.value = approximateMeasurer;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  async function setup() {
    const catalog = testCatalog();
    const parsed = parseSpec(SPEC_JSON);
    if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
    let n = 0;
    let base = applySpecialization(emptyProject(), parsed.spec, {
      newId: () => `LS${++n}`,
      packageSpecName: 'test.spec.json',
    });
    base = addBackgroundContainer(base, {
      id: 'B1',
      width: 2000,
      height: 2000,
      background: '#FFFFFF',
      center: { x: 1000, y: 1000 },
    });
    let after = base;
    for (let i = 0; i < PROPOSED_COUNT; i++) {
      after = addComponentMarking(
        after,
        catalog,
        {
          markingId: `N${i}`,
          annotationId: `A_N${i}`,
          containerId: 'B1',
          parentId: null,
          specId: SPEC_ID,
          typeId: 'text',
          rect: {
            x: 20 + (i % 10) * 150,
            y: 20 + Math.floor(i / 10) * 60,
            width: 100,
            height: 40,
          },
          values: { label: `Novo ${i}` },
        },
        approximateMeasurer,
      );
    }
    const { session, review } = await openHarness({
      project: base,
      proposals: [propose(base, after)],
      files: Object.fromEntries(specFiles(base)),
    });
    review.open('P1');
    review.setView('current');
    const sources = componentSources(catalog);
    const ui = createEditorUi();
    const derived = createEditorDerived(
      session.store,
      ui,
      review.derived.shownProject,
      sources,
    );
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
      derived,
      view: createCanvasViewState(),
      review,
    });
    flush();
    return { controller, container, review, derived };
  }

  const medianOf = (runs: number, run: () => number): number => {
    const times = Array.from({ length: runs }, run);
    return [...times].sort((a, b) => a - b)[Math.floor(runs / 2)] ?? Number.NaN;
  };

  it('a troca para o Proposto desenha as 60 cenas novas e a Atual, nenhuma', async () => {
    const { controller, container, review } = await setup();
    expect(container.dataset.components).toBe('0');
    review.setView('proposed');
    flush();
    expect(container.dataset.components).toBe(String(PROPOSED_COUNT));
    review.setView('current');
    flush();
    expect(container.dataset.components).toBe('0');
    controller.destroy();
  });

  budgetIt(
    `trocar para o Proposto (${PROPOSED_COUNT} cenas novas) cabe em ${FULL_FRAME_BUDGET_MS} ms`,
    BUDGET_OPTIONS,
    async () => {
      const { controller, review } = await setup();
      const toggle = (): number => {
        review.setView('current');
        flush();
        const start = performance.now();
        review.setView('proposed'); // Reinstancia as 60 cenas (a Atual descartou o cache delas).
        flush();
        return performance.now() - start;
      };
      for (let i = 0; i < 3; i++) toggle(); // Aquecimento.
      expect(medianOf(11, toggle)).toBeLessThan(FULL_FRAME_BUDGET_MS);
      controller.destroy();
    },
  );

  budgetIt(
    `pan e zoom no Proposto cabem em ${RENDER_BUDGET_MS} ms e não reinstanciam cenas`,
    BUDGET_OPTIONS,
    async () => {
      const { controller, review, derived } = await setup();
      review.setView('proposed');
      flush();
      const shown = (): ReturnType<typeof derived.drawingsOf> =>
        derived.drawingsOf(review.derived.shownProject.value);
      const before = new Map(shown());
      expect(before.size).toBe(PROPOSED_COUNT);
      const render = vi.spyOn(ComponentLayerRenderer.prototype, 'render');
      let step = 0;
      const frame = (): number => {
        const start = performance.now();
        controller.zoomBy(step++ % 2 === 0 ? 1.1 : 1 / 1.1);
        controller.centerOnPoint({ x: 500 + step * 3, y: 500 });
        flush();
        return performance.now() - start;
      };
      for (let i = 0; i < 3; i++) frame();
      expect(medianOf(15, frame)).toBeLessThan(RENDER_BUDGET_MS);
      expect(render).not.toHaveBeenCalled();
      for (const [id, scene] of before) expect(shown().get(id)).toBe(scene);
      render.mockRestore();
      controller.destroy();
    },
  );
});

// Decisões 3, 4 e 9 da etapa canvas-escala: o quadro de edição com o projeto inteiro à vista só
// redesenha as camadas que mudaram (marcações e sobreposições) e, de longe, cada marcação desenha
// só a borda e pendura no grupo só o que está visível (nível de detalhe). A meta da decisão 9 é
// `RENDER_BUDGET_MS` (16 ms), mas em jsdom o quadro de edição mede ~16 a 24 ms (mediana de 15; o
// `drawScene` das marcações caiu de ~21 para ~9 ms, de 18 mil para 4 mil nós, e sobram ~6 ms do
// `CanvasController.render` e as sobreposições): o teto abaixo guarda contra regressão. Conferência final
// (CD5 da etapa canvas-desempenho): com 16 ms o orçamento passou só 6 de 10 execuções seguidas, então o
// teto continua 35 ms; a meta de 16 ms está atingida no Chromium (edição 9,8 ms com 2.000).
const EDIT_FRAME_CEILING_MS = 35;

// Decisões 5 a 7 e 9 da etapa canvas-escala: depois do quadro que leva os nós ao grupo de arrasto, cada
// `pointermove` só redesenha a camada de sobreposições; o custo depende do que se arrasta, e não do
// projeto. Meta da decisão 9: 16 ms no cenário de 2.000 marcações (jsdom, mediana de 15).
describe('quadro de arrasto com o projeto inteiro à vista (2.000 marcações)', () => {
  budgetIt(
    `arrastar uma marcação cabe em ${RENDER_BUDGET_MS} ms por pointermove`,
    { ...BUDGET_OPTIONS, timeout: 120_000 },
    () => {
      const s = openWholeProject(2000);
      const target = s.project.markings.find((m) => m.parentId === null);
      if (!target) throw new Error('fixture');
      s.actions.beginGesture();
      let step = 0;
      const move = (): number => {
        step++;
        s.actions.previewMarkingMove(target.id, step, step);
        return s.flush();
      };
      move(); // O quadro que leva os nós ao grupo de arrasto não conta.
      for (let i = 0; i < 3; i++) move(); // Aquecimento.
      const times = Array.from({ length: 15 }, move);
      s.actions.cancelGesture();
      s.flush();
      const median = [...times].sort((a, b) => a - b)[7] ?? Number.NaN;
      expect(median).toBeLessThan(RENDER_BUDGET_MS);
      s.destroy();
    },
  );
});

// Decisão 5 da etapa canvas-desempenho: o `createNode` cria só o grupo e a borda; o primeiro quadro em
// Enquadrar tudo (2.000 marcações, jsdom) cabe na metade dos 223 ms da DA1.
describe('primeiro quadro em Enquadrar tudo (2.000 marcações)', () => {
  budgetIt(
    'abrir em Enquadrar tudo cabe em 111,5 ms',
    { ...BUDGET_OPTIONS, timeout: 120_000 },
    () => {
      const times: number[] = [];
      for (let i = 0; i < 5; i++) {
        const s = openWholeProject(2000, 'fit');
        times.push(s.firstFrameMs);
        s.destroy();
      }
      const median = [...times].sort((a, b) => a - b)[2] ?? Number.NaN;
      expect(median).toBeLessThan(111.5);
    },
  );
});

// Decisão 7 da etapa canvas-desempenho: de longe a seta curta é só o traço e não tem rótulo, e a fora da
// área visível não é pintada. Com as 1.000 setas nomeadas, pan e zoom em Enquadrar tudo e aproximados
// cabem na meta da decisão 10 (33 ms; jsdom, mediana de 15).
describe('pan e zoom com 2.000 marcações e 1.000 setas nomeadas', () => {
  budgetIt(
    'cabem em 33 ms, de longe e aproximados',
    { ...BUDGET_OPTIONS, timeout: 120_000 },
    () => {
      const base = wholeProject(2000);
      const project = {
        ...base,
        arrows: base.arrows.map((a, i) => ({ ...a, name: `Seta ${i}` })),
      };
      const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[7] ?? Number.NaN;
      for (const open of ['fit', 'close'] as const) {
        const s = openWholeProject(2000, open, { project });
        let step = 0;
        const round = (): { pan: number; zoom: number } => {
          step++;
          s.controller.centerOnPoint({ x: 500 + 20 * (step % 5), y: 500 });
          const pan = s.flush();
          s.controller.zoomBy(step % 2 ? 1.1 : 1 / 1.1);
          return { pan, zoom: s.flush() };
        };
        for (let i = 0; i < 3; i++) round();
        const samples = Array.from({ length: 15 }, round);
        expect(median(samples.map((r) => r.pan)), `pan (${open})`).toBeLessThan(33);
        expect(median(samples.map((r) => r.zoom)), `zoom (${open})`).toBeLessThan(33);
        s.destroy();
      }
    },
  );
});

describe('quadro de edição com o projeto inteiro à vista (2.000 marcações)', () => {
  budgetIt(
    `editar o nome de uma marcação cabe em ${EDIT_FRAME_CEILING_MS} ms (meta: ${RENDER_BUDGET_MS} ms)`,
    { ...BUDGET_OPTIONS, timeout: 120_000 },
    () => {
      const s = openWholeProject(2000);
      const target = s.project.markings.find((m) => m.parentId === null);
      if (!target) throw new Error('fixture');
      let step = 0;
      const edit = (): number => {
        s.actions.renameMarking(target.id, `Nome ${step++}`);
        return s.flush();
      };
      for (let i = 0; i < 3; i++) edit(); // Aquecimento.
      const times = Array.from({ length: 15 }, edit);
      const median = [...times].sort((a, b) => a - b)[7] ?? Number.NaN;
      expect(median).toBeLessThan(EDIT_FRAME_CEILING_MS);
      s.destroy();
    },
  );

  budgetIt(
    `pan e zoom com o projeto inteiro à vista cabem em 33 ms`,
    { ...BUDGET_OPTIONS, timeout: 120_000 },
    () => {
      const s = openWholeProject(2000);
      let step = 0;
      const round = (): { pan: number; zoom: number } => {
        step++;
        s.controller.centerOnPoint({ x: 500 + 20 * (step % 5), y: 500 });
        const pan = s.flush();
        s.controller.zoomBy(step % 2 ? 1.1 : 1 / 1.1);
        return { pan, zoom: s.flush() };
      };
      for (let i = 0; i < 3; i++) round();
      const samples = Array.from({ length: 15 }, round);
      const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[7] ?? Number.NaN;
      // Meta da decisão 9: 33 ms.
      expect(median(samples.map((r) => r.pan)), 'pan').toBeLessThan(33);
      expect(median(samples.map((r) => r.zoom)), 'zoom').toBeLessThan(33);
      s.destroy();
    },
  );
});

// Cenário "projeto inteiro à vista" (etapa canvas-escala): projeto grande com setas,
// store + derivados + CanvasController e o viewport de Enquadrar tudo. Reutilizado pelos
// testes de camadas redesenhadas, nível de detalhe, grupo de arrasto e nós sob demanda.
import { vi } from 'vitest';
import { CanvasController } from '../../src/canvas/CanvasController';
import { createCanvasViewState } from '../../src/canvas/viewState';
import { projectIndex, projectIssues, type Project } from '../../src/model';
import { textMeasurer } from '../../src/store/textMeasure';
import { createEditorDerived } from '../../src/store/derived';
import { createDisplayImages } from '../../src/store/displayImages';
import { createProjectStore } from '../../src/store/history';
import { createProjectActions } from '../../src/store/project';
import { createEditorUi } from '../../src/store/ui';
import { material3Catalog, scenarioProject } from '../model/scenarioProject';
import { componentSources, installFakeCanvas, layerDrawMeter, stageOf } from './harness';

// A fila é do módulo: o Konva guarda a fila dos seus quadros por janela (`animQueues`), então um
// quadro agendado num teste e perdido por outra fila deixaria as camadas sem desenhar no seguinte.
const frames: FrameRequestCallback[] = [];

/** Troca o `requestAnimationFrame` por uma fila manual e devolve o `flush` (tempo gasto em ms; `NaN` sem quadro). */
export function stubFrames(): () => number {
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    frames.push(cb);
    return frames.length;
  });
  vi.stubGlobal('cancelAnimationFrame', () => undefined);
  // O quadro do controller agenda o do Konva (`batchDraw`): esvazia a fila até acabar.
  return () => {
    const start = performance.now();
    let ran = 0;
    for (let guard = 0; frames.length > 0 && guard < 10; guard++) {
      for (const frame of frames.splice(0)) {
        frame(start);
        ran++;
      }
    }
    return ran === 0 ? Number.NaN : performance.now() - start;
  };
}

/** Tamanhos medidos: número de marcações (as setas são metade). */
export type ScenarioSize = 500 | 2000 | 5000;

/** Opções do cenário (etapa canvas-desempenho, CD1); sem nenhuma, é o cenário de sempre. */
export interface ScenarioOptions {
  /** Número de setas; padrão metade das marcações. */
  readonly arrows?: number;
  /** Acrescenta, em cada container, as 21 instâncias da tela `M3_SCREEN` (biblioteca Material 3). */
  readonly components?: boolean;
  /** Marcações por container; padrão 100 (maior que isso a receita gera marcações de largura 0). */
  readonly perImage?: number;
  /** Projeto já montado (o teste de crescimento monta uma vez e abre várias); ignora as outras opções. */
  readonly project?: Project;
}

/** Projeto grande com `size` marcações e, por padrão, `size / 2` setas entre marcações vizinhas. */
export function wholeProject(size: number, options: ScenarioOptions = {}): Project {
  return scenarioProject({ size, ...options });
}

export interface WholeProjectScenario {
  readonly project: Project;
  readonly store: ReturnType<typeof createProjectStore>;
  readonly actions: ReturnType<typeof createProjectActions>;
  readonly ui: ReturnType<typeof createEditorUi>;
  readonly derived: ReturnType<typeof createEditorDerived>;
  readonly controller: CanvasController;
  readonly container: HTMLElement;
  /** Tempo do primeiro quadro (cria os nós; ms). */
  readonly firstFrameMs: number;
  /** Roda os quadros agendados e devolve quanto levaram (ms); `NaN` se não havia quadro. */
  flush(): number;
  /** Camadas redesenhadas (por nome) desde a última chamada. */
  drawnLayers(): Record<string, number>;
  destroy(): void;
}

/**
 * Monta o cenário e desenha o primeiro quadro já enquadrado (Enquadrar tudo). Quem chama
 * precisa ter `installFakeCanvas()` e o stub de `requestAnimationFrame` (veja `openScenario`).
 */
export function openWholeProject(
  size: number,
  open: 'fit' | 'close' = 'fit',
  options: ScenarioOptions = {},
): WholeProjectScenario {
  installFakeCanvas();
  const flush = stubFrames();

  const project = options.project ?? wholeProject(size, options);
  const store = createProjectStore({ now: () => '2026-10-02T12:00:00.000Z' });
  store.load(project, { readOnly: false });
  // Com componentes, o catálogo do Material 3 vai nas fontes do estado derivado e nas ações, como a sessão faz.
  const sources = options.components ? componentSources(material3Catalog()) : undefined;
  const actions = createProjectActions(
    store,
    sources
      ? { components: () => sources.catalog.peek(), measure: () => textMeasurer.peek() }
      : undefined,
  );
  const ui = createEditorUi();
  const derived = createEditorDerived(store, ui, undefined, sources);
  const container = document.createElement('div');
  Object.defineProperty(container, 'clientWidth', { value: 1280 });
  Object.defineProperty(container, 'clientHeight', { value: 800 });
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
  if (open === 'fit') controller.fitAll();
  else {
    controller.zoomTo(1);
    controller.centerOnPoint({ x: 0, y: 0 });
  }
  const firstFrameMs = flush();
  const meter = layerDrawMeter(stageOf(container));
  meter.take();
  return {
    project,
    store,
    actions,
    ui,
    derived,
    controller,
    container,
    firstFrameMs,
    flush,
    drawnLayers: () => meter.take(),
    destroy() {
      meter.restore();
      controller.destroy();
      container.remove();
      vi.unstubAllGlobals();
    },
  };
}

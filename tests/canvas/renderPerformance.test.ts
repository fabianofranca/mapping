import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { CanvasController } from '../../src/canvas/CanvasController';
import { projectIndex, projectIssues } from '../../src/model';
import { createEditorDerived } from '../../src/store/derived';
import { createDisplayImages } from '../../src/store/displayImages';
import { createProjectStore } from '../../src/store/history';
import { createProjectActions } from '../../src/store/project';
import { createEditorUi } from '../../src/store/ui';
import { buildLargeTypedProject } from '../model/largeTypedProject';
import { installFakeCanvas } from './harness';

// Orçamento de uma renderização do canvas (PLAN.md 14.3) com o projeto grande já
// indexado: Konva de verdade em jsdom, com um contexto 2D falso (nada é pintado;
// mede o trabalho do controller e do Konva para atualizar os nós).
const RENDER_BUDGET_MS = 16;
/** Desligado com `--coverage` (vite.config.ts): o código instrumentado é mais lento. */
const budgetIt = it.skipIf(process.env.PERF_BUDGETS === 'off');

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
    });
    // Já indexado: o orçamento é o do desenho, não o do índice (medido no modelo).
    projectIndex(project);
    projectIssues(project);
    return { project, store, actions, ui, controller, container };
  }

  budgetIt(`pan, zoom e edição desenham em menos de ${RENDER_BUDGET_MS} ms`, () => {
    const { project, actions, ui, controller, container } = setup();
    flush(); // Primeiro quadro: cria os nós.

    // Aproxima numa marcação pai: cartões do zoom semântico na tela.
    const [first, second] = project.markings.filter((m) => m.parentId === null);
    if (!first || !second) throw new Error('fixture');
    ui.selection.value = { kind: 'marking', id: first.id };
    controller.focusSelection();
    flush();

    const pans: number[] = [];
    const zooms: number[] = [];
    const edits: number[] = [];
    for (let i = 0; i < 7; i++) {
      // Pan: centraliza alternando entre duas marcações vizinhas.
      ui.selection.value = { kind: 'marking', id: (i % 2 ? first : second).id };
      controller.focusSelection();
      pans.push(flush());
      container.dispatchEvent(
        new WheelEvent('wheel', { deltaY: i % 2 ? 40 : -40, clientX: 190, clientY: 350 }),
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
  });

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

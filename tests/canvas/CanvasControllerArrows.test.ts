import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { CanvasController } from '../../src/canvas/CanvasController';
import { createCanvasViewState } from '../../src/canvas/viewState';
import type { ArrowRenderer } from '../../src/canvas/renderers/arrows';
import type { OverlayRenderer } from '../../src/canvas/renderers/overlay';
import { createArrow } from '../../src/model';
import { createEditorDerived } from '../../src/store/derived';
import { createDisplayImages } from '../../src/store/displayImages';
import { setMarkingDisplay, setShowArrows } from '../../src/store/settings';
import { createEditorUi, selectItems, setCleanView } from '../../src/store/ui';
import { changeOf, propose } from '../model/proposalFixtures';
import { arrowProject, withArrow } from '../model/arrowFixtures';
import { sampleProject } from '../model/fixtures';
import { openHarness } from '../store/proposalHarness';
import { editorFor, installFakeCanvas } from './harness';

// Setas no CanvasController (ME4): a camada, a visibilidade ("Mostrar setas", Ver limpo e as
// pontas), o `data-arrows`, o enquadrar da seta e a visão Proposto da revisão.

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

  it('"Mostrar setas" desligado e Ver limpo escondem todas', () => {
    const { container, controller, ui } = setup();
    setShowArrows(false);
    flush();
    expect(container.dataset.arrows).toBe('0');
    setShowArrows(true);
    flush();
    expect(container.dataset.arrows).toBe('1');
    setCleanView(ui, true);
    flush();
    expect(container.dataset.arrows).toBe('0');
    setCleanView(ui, false);
    flush();
    expect(container.dataset.arrows).toBe('1');
    controller.destroy();
  });

  it('a seta some quando uma das pontas está oculta pelo modo de exibição', () => {
    // "Ocultar": sem anotação na camada ativa a marcação some, e a seta com ela. As setas
    // têm anotações (ra1), mas as pontas a1 e a3 não.
    const { container, controller, ui } = setup();
    setMarkingDisplay('hide');
    flush();
    expect(container.dataset.arrows).toBe('0');
    // Selecionar uma ponta a mostra, mas a outra segue oculta: a seta continua escondida.
    ui.selection.value = { kind: 'marking', id: 'a1' };
    flush();
    expect(container.dataset.arrows).toBe('0');
    controller.destroy();
  });

  it('pan e seleção não refazem as setas; zoom só muda o tamanho de tela', () => {
    const { controller, internals, ui, container } = setup();
    const shape = internals.arrows.drawn[0];
    ui.selection.value = { kind: 'arrow', id: 'r1' };
    flush();
    container.dispatchEvent(
      new WheelEvent('wheel', { deltaY: -40, clientX: 190, clientY: 350 }),
    );
    flush();
    // A forma é a mesma: o zoom só muda a espessura e a ponta, na hora de pintar.
    expect(internals.arrows.drawn[0]).toBe(shape);
    controller.destroy();
  });

  it('editar uma marcação presa refaz a seta; editar outra coisa, não', () => {
    const { controller, internals, actions } = setup();
    const shape = internals.arrows.drawn[0];
    expect(actions.renameMarking('a2', 'Maçaneta').ok).toBe(true);
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

  it('a seta selecionada tem realce e alças; no Ver limpo, nada', () => {
    const { controller, internals, ui } = setup();
    controller.zoomTo(1); // O meio do trecho só ganha alça com folga na tela.
    ui.selection.value = { kind: 'arrow', id: 'r1' };
    flush();
    expect(
      internals.overlay.arrowHighlightNodes().filter((h) => h.line.visible()),
    ).toHaveLength(1);
    expect(
      internals.overlay.arrowHandleCircles().filter((c) => c.visible()),
    ).toHaveLength(3);
    setCleanView(ui, true);
    flush();
    expect(
      internals.overlay.arrowHighlightNodes().filter((h) => h.line.visible()),
    ).toHaveLength(0);
    controller.destroy();
  });

  it('seleção múltipla com setas: todas ganham realce', () => {
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

  it('centralizar a seta enquadra o traço (a caixa dele)', () => {
    const { controller, ui } = setup();
    ui.selection.value = { kind: 'arrow', id: 'r1' };
    controller.centerSelection();
    // r1 vai de (400,250) a (600,700): o centro da caixa é (500, 475).
    const center = controller.viewportCenter();
    expect(center.x).toBeCloseTo(500, 0);
    expect(center.y).toBeCloseTo(475, 0);
    controller.destroy();
  });

  it('revelar a seta faz o pan mínimo até o traço', () => {
    const { controller, ui } = setup();
    controller.zoomTo(1);
    controller.centerOnPoint({ x: 5000, y: 5000 });
    ui.selection.value = { kind: 'arrow', id: 'r1' };
    controller.revealSelection();
    const center = controller.viewportCenter();
    expect(center.x).toBeLessThan(5000);
    controller.destroy();
  });

  it('o alvo de soltar acende com a marcação de destino do gesto de seta', () => {
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

describe('CanvasController: setas na revisão de propostas', () => {
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

  it('a visão Proposto desenha a seta proposta; a Atual, não', async () => {
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

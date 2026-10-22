import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInteractionState } from '../../../src/canvas/frame';
import { PointerInput } from '../../../src/canvas/input/pointer';
import { ViewportController } from '../../../src/canvas/viewportController';
import {
  addContainer,
  createMarking,
  projectIndex,
  setArrowRoute,
  setArrowStyle,
  setContainerPlacement,
  setMarkingLocked,
  type Project,
} from '../../../src/model';
import { setShowArrows } from '../../../src/store/settings';
import {
  peekSelectedItems,
  selectItems,
  type Selection,
  type SelectionItem,
} from '../../../src/store/ui';
import { arrowProject, withArrow } from '../../model/arrowFixtures';
import { canvasProject, editorFor } from '../harness';

// Viewport 1:1 em (0, 0) e container em (0, 0) na página: tela = canvas.
function setup(readOnly = false, project: Project = canvasProject()) {
  const editor = editorFor(project, readOnly);
  const container = document.createElement('div');
  document.body.append(container);
  const viewport = new ViewportController(container, () => editor.store.project.peek());
  const state = createInteractionState();
  let spaceDown = false;
  let reviewing = false;
  const input = new PointerInput({
    container,
    ...editor,
    viewport,
    state,
    spaceDown: () => spaceDown,
    reviewing: () => reviewing,
  });
  const unbind = input.bind();
  const fire = (
    type: 'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel',
    x: number,
    y: number,
    { id = 1, kind = 'mouse', button = 0, shift = false } = {},
  ) =>
    container.dispatchEvent(
      new PointerEvent(type, {
        pointerId: id,
        pointerType: kind,
        button,
        clientX: x,
        clientY: y,
        shiftKey: shift,
        bubbles: true,
      }),
    );
  /** Toque sem arrastar. */
  const click = (
    x: number,
    y: number,
    options: { shift?: boolean; kind?: string } = {},
  ) => {
    fire('pointerdown', x, y, options);
    fire('pointerup', x, y, options);
  };
  /** Duplo clique do mouse: dois toques no mesmo ponto e o evento `dblclick`. */
  const doubleClick = (x: number, y: number) => {
    click(x, y);
    click(x, y);
    container.dispatchEvent(
      new MouseEvent('dblclick', { clientX: x, clientY: y, bubbles: true }),
    );
  };
  /** Botão direito: o `pointerdown` do botão 2 e o `contextmenu`. */
  const rightClick = (x: number, y: number) => {
    fire('pointerdown', x, y, { button: 2 });
    container.dispatchEvent(
      new MouseEvent('contextmenu', {
        clientX: x,
        clientY: y,
        bubbles: true,
        cancelable: true,
      }),
    );
    fire('pointerup', x, y, { button: 2 });
  };
  /** Arrasta de `from` até `to` em alguns passos e solta. */
  const drag = (
    from: [number, number],
    to: [number, number],
    options: { id?: number; kind?: string } = {},
  ) => {
    fire('pointerdown', ...from, options);
    for (const t of [0.25, 0.5, 1]) {
      fire(
        'pointermove',
        from[0] + (to[0] - from[0]) * t,
        from[1] + (to[1] - from[1]) * t,
        options,
      );
    }
    fire('pointerup', ...to, options);
  };
  const markingRect = (id: string) => {
    const p = editor.store.project.peek();
    return p && projectIndex(p).markings.get(id)?.rect;
  };
  const markingOf = (id: string) => {
    const p = editor.store.project.peek();
    return p && projectIndex(p).markings.get(id);
  };
  const containerOf = (id: string) => {
    const p = editor.store.project.peek();
    return p && projectIndex(p).containers.get(id);
  };
  return {
    ...editor,
    container,
    viewport,
    state,
    input,
    fire,
    click,
    doubleClick,
    rightClick,
    drag,
    markingRect,
    markingOf,
    containerOf,
    setSpace: (down: boolean) => (spaceDown = down),
    setReviewing: (on: boolean) => (reviewing = on),
    cleanup: () => {
      unbind();
      input.destroy();
      container.remove();
    },
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('PointerInput', () => {
  it('toque sem arrastar seleciona; de novo no mesmo ponto sobe para o pai', () => {
    const s = setup();
    s.fire('pointerdown', 250, 250);
    s.fire('pointerup', 250, 250);
    expect(s.ui.selection.value).toEqual({ kind: 'marking', id: 'M2' });
    s.fire('pointerdown', 252, 251);
    s.fire('pointerup', 252, 251);
    expect(s.ui.selection.value).toEqual({ kind: 'marking', id: 'M1' });
    s.fire('pointerdown', 1050, 50);
    s.fire('pointerup', 1050, 50);
    expect(s.ui.selection.value).toBeNull();
    s.cleanup();
  });

  it('mouse: arrastar a marcação selecionada a move, com uma entrada no desfazer', () => {
    const s = setup();
    s.ui.selection.value = { kind: 'marking', id: 'M1' };
    s.drag([400, 400], [500, 450]);
    expect(s.markingRect('M1')).toEqual({ x: 200, y: 150, width: 600, height: 500 });
    expect(s.store.undo()).toBe(true);
    expect(s.markingRect('M1')).toEqual({ x: 100, y: 100, width: 600, height: 500 });
    expect(s.store.canUndo.value).toBe(false);
    s.cleanup();
  });

  it('mouse: a alça redimensiona', () => {
    const s = setup();
    s.ui.selection.value = { kind: 'marking', id: 'M2' };
    s.drag([300, 300], [340, 360]);
    expect(s.markingRect('M2')).toEqual({ x: 200, y: 200, width: 140, height: 160 });
    s.cleanup();
  });

  it('mouse: mover a imagem para cima de outra fica inválido e volta ao soltar', () => {
    const s = setup();
    s.ui.selection.value = { kind: 'image', id: 'I2' };
    s.fire('pointerdown', 1300, 300);
    s.fire('pointermove', 1100, 300);
    s.fire('pointermove', 800, 300);
    expect(s.state.preview.value).toMatchObject({ containerId: 'I2', valid: false });
    s.fire('pointerup', 800, 300);
    expect(s.state.preview.value).toBeNull();
    const p = s.store.project.peek();
    expect(p && projectIndex(p).containers.get('I2')?.placement.x).toBe(1100);
    s.cleanup();
  });

  it('toque: arrastar sobre a marcação selecionada faz pan, sem movê-la', () => {
    const s = setup();
    s.ui.selection.value = { kind: 'marking', id: 'M1' };
    s.drag([400, 400], [450, 430], { kind: 'touch' });
    expect(s.markingRect('M1')).toEqual({ x: 100, y: 100, width: 600, height: 500 });
    expect(s.viewport.viewport.value).toMatchObject({ x: 50, y: 30, scale: 1 });
    s.cleanup();
  });

  it('modo Desenhar: arrastar sobre a imagem cria e seleciona a marcação', () => {
    const s = setup();
    s.ui.mode.value = 'draw';
    s.fire('pointerdown', 750, 650);
    s.fire('pointermove', 800, 700);
    expect(s.state.draft.value?.containerId).toBe('I1');
    s.fire('pointermove', 850, 720);
    s.fire('pointerup', 850, 720);
    expect(s.state.draft.value).toBeNull();
    const selection = s.ui.selection.value;
    expect(selection?.kind).toBe('marking');
    expect(selection && s.markingRect(selection.id)).toEqual({
      x: 750,
      y: 650,
      width: 100,
      height: 70,
    });
    s.cleanup();
  });

  it('cancelar (Esc) desfaz o gesto em andamento e ignora o resto do arrasto', () => {
    const s = setup();
    expect(s.input.cancelInteraction()).toBe(false);
    s.ui.selection.value = { kind: 'marking', id: 'M1' };
    s.fire('pointerdown', 400, 400);
    s.fire('pointermove', 450, 450);
    expect(s.markingRect('M1')?.x).toBe(150);
    expect(s.input.cancelInteraction()).toBe(true);
    expect(s.markingRect('M1')?.x).toBe(100);
    s.fire('pointermove', 500, 500);
    s.fire('pointerup', 500, 500);
    expect(s.markingRect('M1')?.x).toBe(100);
    expect(s.store.canUndo.value).toBe(false);
    s.cleanup();
  });

  it('dois dedos: pinça muda o zoom e cancela o arrasto', () => {
    const s = setup();
    s.fire('pointerdown', 100, 100, { id: 1, kind: 'touch' });
    s.fire('pointerdown', 200, 100, { id: 2, kind: 'touch' });
    s.fire('pointermove', 300, 100, { id: 2, kind: 'touch' });
    expect(s.viewport.viewport.value.scale).toBeCloseTo(2);
    s.fire('pointerup', 100, 100, { id: 1, kind: 'touch' });
    s.fire('pointerup', 300, 100, { id: 2, kind: 'touch' });
    expect(s.ui.selection.value).toBeNull(); // Soltar a pinça não é um toque.
    s.cleanup();
  });

  it('roda do mouse dá zoom no ponto', () => {
    const s = setup();
    const wheel = new WheelEvent('wheel', {
      deltaY: -100,
      clientX: 100,
      clientY: 100,
      cancelable: true,
    });
    s.container.dispatchEvent(wheel);
    expect(wheel.defaultPrevented).toBe(true);
    expect(s.viewport.viewport.value.scale).toBeGreaterThan(1);
    expect(s.viewport.toCanvas({ x: 100, y: 100 }).x).toBeCloseTo(100);
    s.cleanup();
  });

  it('cursor: mover sobre o item selecionado, alça nos cantos, "grab" com Espaço', () => {
    const s = setup();
    s.ui.selection.value = { kind: 'marking', id: 'M1' };
    s.fire('pointermove', 400, 400);
    expect(s.container.style.cursor).toBe('move');
    s.fire('pointermove', 700, 600);
    expect(s.container.style.cursor).toBe('nwse-resize');
    s.setSpace(true);
    s.input.updateCursor(null);
    expect(s.container.style.cursor).toBe('grab');
    s.cleanup();
  });

  it('só leitura: arrastar o item selecionado faz pan', () => {
    const s = setup(true);
    s.ui.selection.value = { kind: 'marking', id: 'M1' };
    s.drag([400, 400], [450, 430]);
    expect(s.markingRect('M1')).toEqual({ x: 100, y: 100, width: 600, height: 500 });
    expect(s.viewport.viewport.value).toMatchObject({ x: 50, y: 30 });
    s.cleanup();
  });
});

describe('PointerInput: trava (etapa 2.5)', () => {
  const lockMarking = (s: ReturnType<typeof setup>, id: string) => {
    expect(s.actions.setMarkingLocked(id, true).ok).toBe(true);
  };

  it('mouse: arrastar o item trancado não faz nada (nem pan), sem entrada no desfazer', () => {
    const s = setup();
    lockMarking(s, 'M1');
    const revision = s.store.revision.value;
    s.ui.selection.value = { kind: 'marking', id: 'M1' };
    s.fire('pointermove', 400, 400); // o mouse passa por cima antes de apertar
    expect(s.container.style.cursor).toBe('not-allowed');
    s.fire('pointerdown', 400, 400);
    s.fire('pointermove', 450, 430);
    expect(s.container.style.cursor).toBe('not-allowed');
    s.fire('pointermove', 500, 450);
    s.fire('pointerup', 500, 450);
    expect(s.markingRect('M1')).toEqual({ x: 100, y: 100, width: 600, height: 500 });
    expect(s.viewport.viewport.value).toMatchObject({ x: 0, y: 0 });
    expect(s.store.revision.value).toBe(revision);
    expect(s.store.gestureActive.value).toBe(false);
    s.cleanup();
  });

  it('mouse: os cantos do item trancado não redimensionam', () => {
    const s = setup();
    lockMarking(s, 'M2');
    s.ui.selection.value = { kind: 'marking', id: 'M2' };
    s.drag([300, 300], [340, 360]);
    expect(s.markingRect('M2')).toEqual({ x: 200, y: 200, width: 100, height: 100 });
    s.cleanup();
  });

  it('mouse: o cursor sobre o item selecionado e trancado é "não permitido"', () => {
    const s = setup();
    lockMarking(s, 'M1');
    s.ui.selection.value = { kind: 'marking', id: 'M1' };
    s.fire('pointermove', 400, 400);
    expect(s.container.style.cursor).toBe('not-allowed');
    s.fire('pointermove', 700, 600);
    expect(s.container.style.cursor).toBe('not-allowed');
    s.fire('pointermove', 900, 700);
    expect(s.container.style.cursor).toBe('');
    s.cleanup();
  });

  it('clicar no item trancado o seleciona', () => {
    const s = setup();
    lockMarking(s, 'M2');
    s.fire('pointerdown', 250, 250);
    s.fire('pointerup', 250, 250);
    expect(s.ui.selection.value).toEqual({ kind: 'marking', id: 'M2' });
    s.cleanup();
  });

  it('mouse: a imagem trancada não se move', () => {
    const s = setup();
    expect(s.actions.setImageLocked('I2', true).ok).toBe(true);
    s.ui.selection.value = { kind: 'image', id: 'I2' };
    s.drag([1300, 300], [1400, 300]);
    const p = s.store.project.peek();
    expect(p && projectIndex(p).containers.get('I2')?.placement.x).toBe(1100);
    s.cleanup();
  });

  it('toque: arrastar sobre o item trancado faz pan e tocar o seleciona', () => {
    const s = setup();
    lockMarking(s, 'M1');
    s.ui.selection.value = { kind: 'marking', id: 'M1' };
    s.drag([400, 400], [450, 430], { kind: 'touch' });
    expect(s.viewport.viewport.value).toMatchObject({ x: 50, y: 30 });
    expect(s.markingRect('M1')).toEqual({ x: 100, y: 100, width: 600, height: 500 });
    s.fire('pointerdown', 250, 250, { kind: 'touch', id: 2 });
    s.fire('pointerup', 250, 250, { kind: 'touch', id: 2 });
    expect(s.ui.selection.value).toEqual({ kind: 'marking', id: 'M2' });
    s.cleanup();
  });
});

describe('PointerInput: menu de contexto (etapa 3a.2)', () => {
  const contextMenu = (s: ReturnType<typeof setup>, x: number, y: number) => {
    const event = new MouseEvent('contextmenu', {
      clientX: x,
      clientY: y,
      bubbles: true,
      cancelable: true,
    });
    s.container.dispatchEvent(event);
    return event;
  };

  it('botão direito sobre uma marcação a seleciona e abre o menu dela', () => {
    const s = setup();
    s.fire('pointerdown', 250, 250, { button: 2 });
    const event = contextMenu(s, 250, 250);
    s.fire('pointerup', 250, 250, { button: 2 });
    expect(event.defaultPrevented).toBe(true);
    expect(s.ui.selection.value).toEqual({ kind: 'marking', id: 'M2' });
    expect(s.ui.canvasMenu.value).toEqual({
      x: 250,
      y: 250,
      target: { kind: 'm', id: 'M2' },
    });
  });

  it('sobre a imagem, fora das marcações, o menu é da imagem', () => {
    const s = setup();
    s.fire('pointerdown', 20, 20, { button: 2 });
    contextMenu(s, 20, 20);
    expect(s.ui.selection.value).toMatchObject({ kind: 'image' });
    expect(s.ui.canvasMenu.value?.target.kind).toBe('i');
  });

  it('fora das imagens não abre nada, mas o menu do navegador continua suprimido', () => {
    const s = setup();
    s.ui.selection.value = { kind: 'marking', id: 'M1' };
    s.fire('pointerdown', 1050, 50, { button: 2 });
    const event = contextMenu(s, 1050, 50);
    expect(event.defaultPrevented).toBe(true);
    expect(s.ui.canvasMenu.value).toBeNull();
    expect(s.ui.selection.value).toEqual({ kind: 'marking', id: 'M1' });
  });

  it('o contextmenu de um toque longo é o "segurar e mover": não abre o menu', () => {
    const s = setup();
    s.fire('pointerdown', 250, 250, { kind: 'touch' });
    const event = contextMenu(s, 250, 250);
    expect(event.defaultPrevented).toBe(true);
    expect(s.ui.canvasMenu.value).toBeNull();
  });

  it('um novo botão direito troca o menu; com o toque no meio, fecha o aberto', () => {
    const s = setup();
    s.fire('pointerdown', 250, 250, { button: 2 });
    contextMenu(s, 250, 250);
    expect(s.ui.canvasMenu.value).not.toBeNull();
    s.fire('pointerdown', 250, 250, { kind: 'touch', id: 2 });
    contextMenu(s, 250, 250);
    expect(s.ui.canvasMenu.value).toBeNull();
  });
});

// Pertencimento por geometria (etapa Marcações espaciais, ME1): o desenho no vazio, o mover
// que atravessa espaços (com encaixe), a absorção e o assentar ao soltar, sempre numa entrada.
describe('PointerInput: marcações do canvas e pertencimento', () => {
  /** `canvasProject` com um terceiro container I3 (400×400) em (1800, 0) e uma marcação Ma solta em I1. */
  function withThird(): Project {
    let p = canvasProject();
    p = addContainer(p, { id: 'I3', file: 'images/c.jpg', width: 400, height: 400 });
    p = setContainerPlacement(p, 'I3', { x: 1800, y: 0, scale: 1 });
    return p;
  }

  it('modo Desenhar: arrastar no vazio em volta de dois containers cria uma marcação do canvas', () => {
    const s = setup();
    s.ui.mode.value = 'draw';
    s.fire('pointerdown', -50, -50);
    s.fire('pointermove', 800, 500);
    expect(s.state.draft.value).toMatchObject({ containerId: null });
    s.fire('pointermove', 1700, 900);
    s.fire('pointerup', 1700, 900);
    expect(s.state.draft.value).toBeNull();
    const selection = s.ui.selection.value;
    expect(selection?.kind).toBe('marking');
    const created = selection && s.markingOf(selection.id);
    expect(created).toMatchObject({
      containerId: null,
      parentId: null,
      floating: false,
      rect: { x: -50, y: -50, width: 1750, height: 950 },
    });
    // Os dois containers passam a ser membros dela (gravado, sem o agente calcular nada).
    expect(s.containerOf('I1')?.parentId).toBe(selection?.id);
    expect(s.containerOf('I2')?.parentId).toBe(selection?.id);
    // Um Ctrl+Z desfaz tudo.
    expect(s.store.undo()).toBe(true);
    expect(s.store.canUndo.value).toBe(false);
    expect(s.containerOf('I1')?.parentId).toBeNull();
    s.cleanup();
  });

  it('modo Desenhar: o desenho no vazio absorve o container que passa dentro da tolerância', () => {
    const s = setup();
    s.ui.mode.value = 'draw';
    s.fire('pointerdown', -20, -20);
    s.fire('pointermove', 500, 400);
    // I1 vai até x = 1000: 10 para fora do desenho, dentro dos 12 px de tela.
    s.fire('pointermove', 990, 805);
    expect(s.state.absorb.value).toEqual([{ x: 0, y: 0, width: 1000, height: 800 }]);
    s.fire('pointerup', 990, 805);
    expect(s.state.absorb.value).toEqual([]);
    const id = s.ui.selection.value?.id ?? '';
    expect(s.markingRect(id)).toEqual({ x: -20, y: -20, width: 1020, height: 825 });
    expect(s.containerOf('I1')?.parentId).toBe(id);
    s.cleanup();
  });

  it('a absorção depende do zoom (px de tela)', () => {
    const draw = (scale: number) => {
      const s = setup();
      s.viewport.viewport.value = { x: 0, y: 0, scale };
      s.ui.mode.value = 'draw';
      // Do canvas (-20, -20) a (990, 805): I1 passa 10 unidades à direita do desenho.
      s.fire('pointerdown', -20 * scale, -20 * scale);
      s.fire('pointermove', 400 * scale, 400 * scale);
      s.fire('pointermove', 990 * scale, 805 * scale);
      s.fire('pointerup', 990 * scale, 805 * scale);
      const id = s.ui.selection.value?.id ?? '';
      const result = { rect: s.markingRect(id), parentId: s.containerOf('I1')?.parentId };
      s.cleanup();
      return { ...result, id };
    };
    // Zoom 1: 12 px de tela = 12 unidades, absorve (cresce até 1000).
    const near = draw(1);
    expect(near.rect).toEqual({ x: -20, y: -20, width: 1020, height: 825 });
    expect(near.parentId).toBe(near.id);
    // Zoom 2: 12 px de tela = 6 unidades; 10 passa da tolerância, não absorve.
    const far = draw(2);
    expect(far.rect).toEqual({ x: -20, y: -20, width: 1010, height: 825 });
    expect(far.parentId).toBeNull();
  });

  it('modo Desenhar sobre uma imagem continua preso a ela; o pan é da barra de espaço e do botão do meio', () => {
    const s = setup();
    s.ui.mode.value = 'draw';
    s.fire('pointerdown', 900, 700);
    s.fire('pointermove', 1050, 760);
    s.fire('pointermove', 1300, 900);
    expect(s.state.draft.value).toMatchObject({
      containerId: 'I1',
      rect: { x: 900, y: 700, width: 100, height: 100 },
    });
    s.fire('pointerup', 1300, 900);
    const id = s.ui.selection.value?.id ?? '';
    expect(s.markingOf(id)).toMatchObject({ containerId: 'I1', parentId: null });
    // Espaço pressionado: arrastar no vazio é pan, não desenho.
    s.setSpace(true);
    s.drag([1700, 600], [1750, 650]);
    expect(s.viewport.viewport.value).toMatchObject({ x: 50, y: 50 });
    s.setSpace(false);
    // Botão do meio também.
    s.fire('pointerdown', 1700, 600, { button: 1 });
    s.fire('pointermove', 1720, 620, { button: 1 });
    s.fire('pointermove', 1740, 640, { button: 1 });
    s.fire('pointerup', 1740, 640, { button: 1 });
    expect(s.viewport.viewport.value).toMatchObject({ x: 90, y: 90 });
    s.cleanup();
  });

  it('mover uma marcação para a outra imagem a torna dela, com as filhas junto e uma entrada', () => {
    const s = setup();
    s.ui.selection.value = { kind: 'marking', id: 'M1' }; // M1 tem a filha M2
    // I2 está em (1100, 0) na escala 1: M1 (600×500) não cabe nela (500×500), então só a M2.
    s.ui.selection.value = { kind: 'marking', id: 'M2' };
    s.drag([250, 250], [1350, 350]);
    expect(s.markingOf('M2')).toMatchObject({
      containerId: 'I2',
      parentId: null,
      rect: { x: 200, y: 300, width: 100, height: 100 },
    });
    expect(s.store.undo()).toBe(true);
    expect(s.markingOf('M2')).toMatchObject({
      containerId: 'I1',
      parentId: 'M1',
      rect: { x: 200, y: 200, width: 100, height: 100 },
    });
    expect(s.store.canUndo.value).toBe(false);
    s.cleanup();
  });

  it('entre telas de resoluções diferentes, a marcação mantém o tamanho que tinha na tela', () => {
    let project = canvasProject();
    // I2 (500×500) na metade da escala: ocupa 250×250 no canvas, de (1100, 0) a (1350, 250).
    project = setContainerPlacement(project, 'I2', { x: 1100, y: 0, scale: 0.5 });
    const s = setup(false, project);
    s.ui.selection.value = { kind: 'marking', id: 'M2' }; // 100×100 em I1, na escala 1
    s.drag([250, 250], [1250, 150]); // vai de (200, 200) a (1200, 100) no canvas
    // 100 unidades do canvas = 200 pixels de I2; a posição em pixels dela.
    expect(s.markingOf('M2')).toMatchObject({
      containerId: 'I2',
      rect: { x: 200, y: 200, width: 200, height: 200 },
    });
    expect(s.store.undo()).toBe(true);
    expect(s.markingOf('M2')?.containerId).toBe('I1');
    s.cleanup();
  });

  it('encaixe entre escalas: o deslocamento sai em pixels do container de origem e a marcação fica dentro', () => {
    let project = canvasProject();
    project = setContainerPlacement(project, 'I2', { x: 1100, y: 0, scale: 0.5 });
    const s = setup(false, project);
    s.ui.selection.value = { kind: 'marking', id: 'M3' }; // 200×200 px em I2 = 100×100 no canvas
    // M3 ocupa 1125..1225 no canvas; levada 133 para a direita termina em 1358, 8 além da borda
    // de I2 (1350): o encaixe a devolve 16 pixels de I2 para dentro.
    s.drag([1175, 75], [1308, 75]);
    expect(s.markingOf('M3')).toMatchObject({
      containerId: 'I2',
      rect: { x: 300, y: 50, width: 200, height: 200 },
    });
    s.cleanup();
  });

  it('solta no vazio vira marcação do canvas; solta de volta numa imagem, dela', () => {
    const s = setup();
    s.ui.selection.value = { kind: 'marking', id: 'M2' };
    s.drag([250, 250], [250, 1150]);
    expect(s.markingOf('M2')).toMatchObject({
      containerId: null,
      parentId: null,
      rect: { x: 200, y: 1100, width: 100, height: 100 },
    });
    // Agora do canvas: arrastar de volta para dentro de I2 (inteira) a devolve a um container.
    s.drag([250, 1150], [1350, 250]);
    expect(s.markingOf('M2')).toMatchObject({
      containerId: 'I2',
      rect: { x: 200, y: 200, width: 100, height: 100 },
    });
    // Duas entradas, uma por gesto.
    expect(s.store.undo()).toBe(true);
    expect(s.markingOf('M2')?.containerId).toBeNull();
    expect(s.store.undo()).toBe(true);
    expect(s.markingOf('M2')?.containerId).toBe('I1');
    expect(s.store.canUndo.value).toBe(false);
    s.cleanup();
  });

  it('o container de destino acende enquanto a marcação passa por cima dele e apaga ao soltar', () => {
    const s = setup();
    s.ui.selection.value = { kind: 'marking', id: 'M2' };
    s.fire('pointerdown', 250, 250);
    s.fire('pointermove', 400, 260);
    expect(s.state.moveTarget.value).toBeNull(); // ainda em I1 (o de origem não acende)
    s.fire('pointermove', 1350, 300);
    expect(s.state.moveTarget.value).toBe('I2');
    s.fire('pointermove', 1050, 300); // no vazio entre as imagens, longe do encaixe
    expect(s.state.moveTarget.value).toBeNull();
    s.fire('pointermove', 1350, 300);
    s.fire('pointerup', 1350, 300);
    expect(s.state.moveTarget.value).toBeNull();
    s.cleanup();
  });

  it('encaixe: solta quase inteira num container, a marcação é levada para dentro dele', () => {
    const s = setup();
    s.ui.selection.value = { kind: 'marking', id: 'M2' }; // 100×100 em I1
    // Sem o encaixe ficaria em x = 1090 (10 à esquerda de I2, que começa em 1100).
    s.fire('pointerdown', 250, 250);
    s.fire('pointermove', 600, 250);
    s.fire('pointermove', 1140, 250);
    expect(s.state.moveTarget.value).toBe('I2');
    s.fire('pointerup', 1140, 250);
    expect(s.markingOf('M2')).toMatchObject({
      containerId: 'I2',
      rect: { x: 0, y: 200, width: 100, height: 100 },
    });
    s.cleanup();
  });

  it('encaixe dentro do mesmo container (saiu um pouco da borda): volta para dentro', () => {
    const s = setup();
    s.ui.selection.value = { kind: 'marking', id: 'M3' }; // 200×200 em I2, em (50, 50)
    s.drag([1300, 200], [1560, 200]); // x = 310 + 200 = 510: 10 além da borda direita (500)
    expect(s.markingOf('M3')).toMatchObject({
      containerId: 'I2',
      rect: { x: 300, y: 50, width: 200, height: 200 },
    });
    s.cleanup();
  });

  it('longe do container (além da tolerância) não encaixa', () => {
    const s = setup();
    s.ui.selection.value = { kind: 'marking', id: 'M2' };
    s.drag([250, 250], [1110, 250]); // x = 1060: 40 antes de I2, no vazio
    expect(s.markingOf('M2')).toMatchObject({ containerId: null });
    s.cleanup();
  });

  it('a flutuante se move sozinha e nunca encaixa nem muda de espaço', () => {
    const s = setup();
    const created = s.actions.createMarking(null, {
      x: 900,
      y: 900,
      width: 100,
      height: 100,
    });
    const id = created.ok ? created.value : '';
    expect(s.actions.setMarkingFloating(id, true).ok).toBe(true);
    s.ui.selection.value = { kind: 'marking', id };
    // Para perto de I2 (x = 1090) e depois por cima dela, inteira.
    s.drag([950, 950], [1140, 950]);
    expect(s.markingOf(id)).toMatchObject({ containerId: null, floating: true });
    expect(s.markingRect(id)).toEqual({ x: 1090, y: 900, width: 100, height: 100 });
    s.drag([1140, 950], [1300, 300]);
    expect(s.markingOf(id)).toMatchObject({
      containerId: null,
      parentId: null,
      floating: true,
    });
    expect(s.markingRect(id)).toEqual({ x: 1250, y: 250, width: 100, height: 100 });
    s.cleanup();
  });

  it('mover uma marcação do canvas move só o retângulo; os containers dentro não vão junto', () => {
    const s = setup();
    const created = s.actions.createMarking(null, {
      x: -100,
      y: -100,
      width: 1800,
      height: 1000,
    });
    const id = created.ok ? created.value : '';
    expect(s.containerOf('I1')?.parentId).toBe(id);
    s.ui.selection.value = { kind: 'marking', id };
    s.drag([1050, 300], [1050, 1300]); // 1000 para baixo, no vazio entre I1 e I2
    expect(s.markingRect(id)).toEqual({ x: -100, y: 900, width: 1800, height: 1000 });
    expect(s.containerOf('I1')?.placement).toEqual({ x: 0, y: 0, scale: 1 });
    expect(s.containerOf('I2')?.placement).toEqual({ x: 1100, y: 0, scale: 1 });
    // Os containers deixaram de caber nela: saem do pertencimento ao soltar.
    expect(s.containerOf('I1')?.parentId).toBeNull();
    expect(s.containerOf('I2')?.parentId).toBeNull();
    expect(s.store.undo()).toBe(true);
    expect(s.containerOf('I1')?.parentId).toBe(id);
    s.cleanup();
  });

  it('mover um container para dentro de uma marcação do canvas o torna membro; para fora, tira', () => {
    const s = setup(false, withThird());
    const created = s.actions.createMarking(null, {
      x: -100,
      y: -100,
      width: 1750,
      height: 1100,
    });
    const id = created.ok ? created.value : '';
    expect(s.containerOf('I3')?.parentId).toBeNull();
    s.ui.selection.value = { kind: 'image', id: 'I3' };
    // De (1800, 0) para (1100, 520): abaixo de I2 (que termina em y = 500) e dentro da marcação.
    s.drag([1900, 100], [1200, 620]);
    expect(s.containerOf('I3')?.placement).toMatchObject({ x: 1100, y: 520 });
    expect(s.containerOf('I3')?.parentId).toBe(id);
    expect(s.store.undo()).toBe(true);
    expect(s.containerOf('I3')?.parentId).toBeNull();
    expect(s.containerOf('I3')?.placement).toMatchObject({ x: 1800, y: 0 });
    // Redo e para fora de novo: um gesto cada.
    expect(s.store.redo()).toBe(true);
    s.drag([1200, 620], [2000, 620]);
    expect(s.containerOf('I3')?.parentId).toBeNull();
    s.cleanup();
  });

  it('redimensionar uma marcação sem limite das filhas: o que não cabe mais sai do pertencimento', () => {
    const s = setup();
    s.ui.selection.value = { kind: 'marking', id: 'M1' }; // (100, 100, 600×500), filha M2
    expect(s.markingOf('M2')?.parentId).toBe('M1');
    s.drag([100, 100], [260, 260]); // alça NW
    expect(s.markingRect('M1')).toEqual({ x: 260, y: 260, width: 440, height: 340 });
    expect(s.markingOf('M2')?.parentId).toBeNull(); // M2 ficou meio fora, sem tolerância
    expect(s.store.undo()).toBe(true);
    expect(s.markingOf('M2')?.parentId).toBe('M1');
    expect(s.markingRect('M1')).toEqual({ x: 100, y: 100, width: 600, height: 500 });
    s.cleanup();
  });

  it('redimensionar absorve o que cruza dentro da tolerância (e acende durante o gesto)', () => {
    const base = canvasProject();
    const project = createMarking(base, {
      id: 'Ma',
      containerId: 'I1',
      rect: { x: 715, y: 150, width: 20, height: 40 },
    });
    const s = setup(false, project);
    expect(s.markingOf('Ma')?.parentId).toBeNull();
    s.ui.selection.value = { kind: 'marking', id: 'M1' };
    s.fire('pointerdown', 700, 600); // alça SE de M1
    s.fire('pointermove', 715, 605);
    s.fire('pointermove', 730, 610);
    // Ma passa 5 do novo limite direito: acende.
    expect(s.state.absorb.value).toEqual([{ x: 715, y: 150, width: 20, height: 40 }]);
    s.fire('pointerup', 730, 610);
    expect(s.state.absorb.value).toEqual([]);
    expect(s.markingRect('M1')).toEqual({ x: 100, y: 100, width: 635, height: 510 });
    expect(s.markingOf('Ma')?.parentId).toBe('M1');
    expect(s.store.undo()).toBe(true);
    expect(s.markingRect('M1')).toEqual({ x: 100, y: 100, width: 600, height: 500 });
    expect(s.markingOf('Ma')?.parentId).toBeNull();
    expect(s.store.canUndo.value).toBe(false);
    s.cleanup();
  });

  it('uma alça que volta ao ponto de partida não absorve nada (não é redimensionar)', () => {
    const base = canvasProject();
    const project = createMarking(base, {
      id: 'Ma',
      containerId: 'I1',
      rect: { x: 695, y: 150, width: 15, height: 40 }, // passa 10 da borda direita de M1
    });
    const s = setup(false, project);
    s.ui.selection.value = { kind: 'marking', id: 'M1' };
    s.fire('pointerdown', 700, 600);
    s.fire('pointermove', 740, 640);
    s.fire('pointermove', 700, 600);
    s.fire('pointerup', 700, 600);
    expect(s.markingRect('M1')).toEqual({ x: 100, y: 100, width: 600, height: 500 });
    expect(s.store.canUndo.value).toBe(false);
    s.cleanup();
  });

  it('redimensionar a marcação do canvas absorve um container que cruza a borda', () => {
    const s = setup();
    const created = s.actions.createMarking(null, {
      x: -100,
      y: -100,
      width: 1150,
      height: 1000,
    });
    const id = created.ok ? created.value : '';
    // I2 (1100..1600) fica de fora; o canto SE (1050, 900) vai para x = 1110: I2 passa 490 (não absorve).
    s.ui.selection.value = { kind: 'marking', id };
    s.drag([1050, 900], [1110, 900]);
    expect(s.markingRect(id)).toEqual({ x: -100, y: -100, width: 1210, height: 1000 });
    expect(s.containerOf('I2')?.parentId).toBeNull();
    // Agora o limite direito vai a 1595: I2 passa só 5 → o retângulo cresce até 1600.
    s.drag([1110, 900], [1595, 900]);
    expect(s.markingRect(id)).toEqual({ x: -100, y: -100, width: 1700, height: 1000 });
    expect(s.containerOf('I2')?.parentId).toBe(id);
    s.cleanup();
  });

  it('mover não absorve (só desenhar e redimensionar)', () => {
    const base = canvasProject();
    // Ma cruza a borda direita de M1 (700) por 10: um redimensionamento a absorveria.
    const project = createMarking(base, {
      id: 'Ma',
      containerId: 'I1',
      rect: { x: 695, y: 150, width: 15, height: 40 },
    });
    const s = setup(false, project);
    expect(s.markingOf('Ma')?.parentId).toBeNull();
    s.ui.selection.value = { kind: 'marking', id: 'M1' };
    s.drag([400, 400], [400, 380]); // sobe 20
    expect(s.markingRect('M1')).toEqual({ x: 100, y: 80, width: 600, height: 500 });
    expect(s.markingOf('Ma')?.parentId).toBeNull();
    s.cleanup();
  });

  it('cancelar (Esc) no meio do mover apaga os destaques e desfaz o gesto', () => {
    const s = setup();
    s.ui.selection.value = { kind: 'marking', id: 'M2' };
    s.fire('pointerdown', 250, 250);
    s.fire('pointermove', 1350, 300);
    expect(s.state.moveTarget.value).toBe('I2');
    expect(s.input.cancelInteraction()).toBe(true);
    expect(s.state.moveTarget.value).toBeNull();
    s.fire('pointerup', 1350, 300);
    expect(s.markingOf('M2')).toMatchObject({ containerId: 'I1' });
    expect(s.store.canUndo.value).toBe(false);
    s.cleanup();
  });

  it('container dentro de uma marcação do canvas trancada não se move (trava herdada)', () => {
    const s = setup();
    const created = s.actions.createMarking(null, {
      x: -100,
      y: -100,
      width: 1800,
      height: 1000,
    });
    const id = created.ok ? created.value : '';
    expect(s.actions.setMarkingLocked(id, true).ok).toBe(true);
    const revision = s.store.revision.value;
    s.ui.selection.value = { kind: 'image', id: 'I2' };
    s.fire('pointermove', 1300, 300);
    expect(s.container.style.cursor).toBe('not-allowed');
    s.drag([1300, 300], [1400, 700]);
    expect(s.containerOf('I2')?.placement).toMatchObject({ x: 1100, y: 0 });
    expect(s.store.revision.value).toBe(revision);
    s.cleanup();
  });

  it('toque no vazio seleciona a marcação do canvas; botão direito abre o menu dela', () => {
    const s = setup();
    const created = s.actions.createMarking(null, {
      x: -100,
      y: -100,
      width: 1800,
      height: 1000,
    });
    const id = created.ok ? created.value : '';
    s.fire('pointerdown', 1050, 300);
    s.fire('pointerup', 1050, 300);
    expect(s.ui.selection.value).toEqual({ kind: 'marking', id });
    s.ui.selection.value = null;
    s.fire('pointerdown', 1050, 300, { button: 2 });
    s.container.dispatchEvent(
      new MouseEvent('contextmenu', {
        clientX: 1050,
        clientY: 300,
        bubbles: true,
        cancelable: true,
      }),
    );
    expect(s.ui.canvasMenu.value?.target).toEqual({ kind: 'm', id });
    s.cleanup();
  });

  it('a flutuante recebe o toque primeiro, sobre a marcação e o container', () => {
    const s = setup();
    const created = s.actions.createMarking(null, {
      x: 150,
      y: 150,
      width: 200,
      height: 120,
    });
    const id = created.ok ? created.value : '';
    expect(s.actions.setMarkingFloating(id, true).ok).toBe(true);
    s.fire('pointerdown', 250, 250); // também sobre a Maçaneta (M2)
    s.fire('pointerup', 250, 250);
    expect(s.ui.selection.value).toEqual({ kind: 'marking', id });
    s.fire('pointerdown', 251, 251);
    s.fire('pointerup', 251, 251);
    expect(s.ui.selection.value).toEqual({ kind: 'marking', id: 'M2' });
    s.cleanup();
  });
});

// Seleção múltipla (etapa Marcações espaciais, ME2): arrasto conjunto, Shift+clique, duplo clique
// com o conteúdo e o botão direito sobre a seleção.
describe('PointerInput: seleção múltipla', () => {
  const im = (id: string): SelectionItem => ({ kind: 'image', id });
  const mk = (id: string): SelectionItem => ({ kind: 'marking', id });
  const ids = (s: ReturnType<typeof setup>) =>
    peekSelectedItems(s.ui).map((i) => `${i.kind}:${i.id}`);

  /**
   * `canvasProject` com um terceiro container I3 (400×400) em (1800, 0) e a marcação do canvas
   * `C` (-100, -100, 2400×1000) em volta dos três: os três são membros dela.
   */
  function withGroup(): Project {
    let p = canvasProject();
    p = addContainer(p, { id: 'I3', file: 'images/c.jpg', width: 400, height: 400 });
    p = setContainerPlacement(p, 'I3', { x: 1800, y: 0, scale: 1 });
    return createMarking(p, {
      id: 'C',
      containerId: null,
      rect: { x: -100, y: -100, width: 2400, height: 1000 },
      name: 'Grupo',
    });
  }

  function groupSetup() {
    const s = setup(false, withGroup());
    expect(s.containerOf('I1')?.parentId).toBe('C');
    expect(s.containerOf('I3')?.parentId).toBe('C');
    return s;
  }

  describe('arrasto conjunto', () => {
    it('arrastar os três containers e a marcação do canvas move tudo junto, numa entrada só', () => {
      const s = groupSetup();
      selectItems(s.ui, [im('I1'), im('I2'), im('I3'), mk('C')]);
      s.drag([1300, 300], [1400, 350]); // dentro de I2, que não é o primário
      expect(s.containerOf('I1')?.placement).toEqual({ x: 100, y: 50, scale: 1 });
      expect(s.containerOf('I2')?.placement).toEqual({ x: 1200, y: 50, scale: 1 });
      expect(s.containerOf('I3')?.placement).toEqual({ x: 1900, y: 50, scale: 1 });
      expect(s.markingRect('C')).toEqual({ x: 0, y: -50, width: 2400, height: 1000 });
      // As marcações dos containers vão com eles (coordenadas relativas) e o pertencimento fica.
      expect(s.markingRect('M1')).toEqual({ x: 100, y: 100, width: 600, height: 500 });
      expect(s.markingRect('M3')).toEqual({ x: 50, y: 50, width: 200, height: 200 });
      for (const id of ['I1', 'I2', 'I3']) expect(s.containerOf(id)?.parentId).toBe('C');
      // A seleção continua inteira, com o primário de antes.
      expect(ids(s)).toEqual(['image:I1', 'image:I2', 'image:I3', 'marking:C']);
      expect(s.ui.selection.value).toEqual(mk('C'));
      // Um Ctrl+Z desfaz tudo.
      expect(s.store.undo()).toBe(true);
      expect(s.containerOf('I1')?.placement).toEqual({ x: 0, y: 0, scale: 1 });
      expect(s.containerOf('I2')?.placement).toEqual({ x: 1100, y: 0, scale: 1 });
      expect(s.containerOf('I3')?.placement).toEqual({ x: 1800, y: 0, scale: 1 });
      expect(s.markingRect('C')).toEqual({ x: -100, y: -100, width: 2400, height: 1000 });
      expect(s.store.canUndo.value).toBe(false);
      s.cleanup();
    });

    it('arrastar dentro do primário (a marcação do canvas) também move a seleção toda', () => {
      const s = groupSetup();
      selectItems(s.ui, [im('I1'), im('I2'), mk('C')]);
      s.drag([1050, 300], [1050, 350]); // no vazio entre as telas, dentro de C
      expect(s.containerOf('I1')?.placement).toEqual({ x: 0, y: 50, scale: 1 });
      expect(s.containerOf('I2')?.placement).toEqual({ x: 1100, y: 50, scale: 1 });
      expect(s.containerOf('I3')?.placement).toEqual({ x: 1800, y: 0, scale: 1 }); // fora da seleção
      expect(s.markingRect('C')).toEqual({ x: -100, y: -50, width: 2400, height: 1000 });
      s.cleanup();
    });

    it('um movimento inválido no meio mantém a prévia na última posição válida, e soltar grava essa posição', () => {
      const s = groupSetup();
      selectItems(s.ui, [im('I1'), im('I2')]); // I3 fica de fora
      s.fire('pointerdown', 1300, 300);
      s.fire('pointermove', 1400, 300);
      s.fire('pointermove', 1450, 300); // +150: I2 vai a 1250..1750, antes de I3 (1800)
      expect(s.containerOf('I2')?.placement.x).toBe(1250);
      expect(s.containerOf('I1')?.placement.x).toBe(150);
      s.fire('pointermove', 1700, 300); // +400: I2 passaria por cima de I3
      expect(s.containerOf('I2')?.placement.x).toBe(1250); // a prévia inteira não saiu do lugar
      expect(s.containerOf('I1')?.placement.x).toBe(150);
      s.fire('pointermove', 1460, 300); // volta a uma posição válida: a prévia a segue
      expect(s.containerOf('I2')?.placement.x).toBe(1260);
      expect(s.containerOf('I1')?.placement.x).toBe(160);
      s.fire('pointermove', 1800, 300); // inválida de novo
      s.fire('pointerup', 1800, 300); // solta numa posição inválida
      expect(s.containerOf('I2')?.placement.x).toBe(1260);
      expect(s.containerOf('I1')?.placement.x).toBe(160);
      expect(s.containerOf('I3')?.placement.x).toBe(1800);
      expect(s.store.gestureActive.value).toBe(false);
      expect(s.store.undo()).toBe(true);
      expect(s.containerOf('I2')?.placement.x).toBe(1100);
      expect(s.containerOf('I1')?.placement.x).toBe(0);
      expect(s.store.canUndo.value).toBe(false);
      s.cleanup();
    });

    it('uma marcação de container que sairia do container fica na última posição válida', () => {
      const s = groupSetup();
      selectItems(s.ui, [mk('M3'), mk('C')]);
      s.fire('pointerdown', 1050, 300); // dentro de C
      s.fire('pointermove', 1100, 300);
      s.fire('pointermove', 1150, 300); // +100: M3 (50..250) vai a 150..350 em I2 (500 de largura)
      expect(s.markingRect('M3')).toEqual({ x: 150, y: 50, width: 200, height: 200 });
      s.fire('pointermove', 1450, 300); // +400: M3 passaria da borda de I2
      expect(s.markingRect('M3')?.x).toBe(150);
      expect(s.markingRect('C')?.x).toBe(0);
      s.fire('pointerup', 1450, 300);
      expect(s.markingRect('M3')).toEqual({ x: 150, y: 50, width: 200, height: 200 });
      expect(s.markingOf('M3')?.containerId).toBe('I2'); // não trocou de espaço
      expect(s.markingRect('C')).toEqual({ x: 0, y: -100, width: 2400, height: 1000 });
      expect(s.store.undo()).toBe(true);
      expect(s.markingRect('M3')?.x).toBe(50);
      expect(s.markingRect('C')?.x).toBe(-100);
      expect(s.store.canUndo.value).toBe(false);
      s.cleanup();
    });

    it('o pertencimento fica congelado durante o arrasto e é assentado ao soltar', () => {
      const s = groupSetup();
      selectItems(s.ui, [im('I1'), im('I2')]);
      s.fire('pointerdown', 1300, 300);
      s.fire('pointermove', 1300, 800);
      s.fire('pointermove', 1300, 1300); // +1000 para baixo: as duas telas saem de C
      expect(s.containerOf('I1')?.placement.y).toBe(1000);
      expect(s.containerOf('I1')?.parentId).toBe('C');
      expect(s.containerOf('I2')?.parentId).toBe('C');
      s.fire('pointerup', 1300, 1300);
      expect(s.containerOf('I1')?.parentId).toBeNull();
      expect(s.containerOf('I2')?.parentId).toBeNull();
      expect(s.containerOf('I3')?.parentId).toBe('C');
      expect(s.store.undo()).toBe(true);
      expect(s.containerOf('I1')?.parentId).toBe('C');
      expect(s.containerOf('I1')?.placement.y).toBe(0);
      expect(s.store.canUndo.value).toBe(false);
      s.cleanup();
    });

    it('Esc cancela o arrasto conjunto: nada muda e não há entrada no desfazer', () => {
      const s = groupSetup();
      selectItems(s.ui, [im('I1'), im('I2'), mk('C')]);
      s.fire('pointerdown', 1300, 300);
      s.fire('pointermove', 1400, 350);
      expect(s.containerOf('I2')?.placement.x).toBe(1200);
      expect(s.input.cancelInteraction()).toBe(true);
      expect(s.containerOf('I2')?.placement).toEqual({ x: 1100, y: 0, scale: 1 });
      expect(s.markingRect('C')?.x).toBe(-100);
      s.fire('pointermove', 1500, 400); // o resto do arrasto é ignorado
      s.fire('pointerup', 1500, 400);
      expect(s.containerOf('I2')?.placement).toEqual({ x: 1100, y: 0, scale: 1 });
      expect(s.store.canUndo.value).toBe(false);
      expect(s.store.gestureActive.value).toBe(false);
      expect(ids(s)).toEqual(['image:I1', 'image:I2', 'marking:C']); // a seleção fica
      s.cleanup();
    });

    it('pointercancel também cancela', () => {
      const s = groupSetup();
      selectItems(s.ui, [im('I1'), im('I2')]);
      s.fire('pointerdown', 1300, 300);
      s.fire('pointermove', 1400, 350);
      s.fire('pointercancel', 1400, 350);
      expect(s.containerOf('I2')?.placement).toEqual({ x: 1100, y: 0, scale: 1 });
      expect(s.store.canUndo.value).toBe(false);
      s.cleanup();
    });

    it('um segundo dedo cancela o arrasto conjunto', () => {
      const s = groupSetup();
      selectItems(s.ui, [im('I1'), im('I2')]);
      s.fire('pointerdown', 1300, 300);
      s.fire('pointermove', 1400, 350);
      expect(s.containerOf('I2')?.placement.x).toBe(1200);
      s.fire('pointerdown', 100, 100, { id: 2, kind: 'touch' });
      expect(s.containerOf('I2')?.placement).toEqual({ x: 1100, y: 0, scale: 1 });
      expect(s.store.gestureActive.value).toBe(false);
      s.cleanup();
    });

    it('com um item travado o arrasto não começa: cursor "não permitido", sem pan nem entrada', () => {
      const s = groupSetup();
      expect(s.actions.setImageLocked('I3', true).ok).toBe(true);
      const revision = s.store.revision.value;
      selectItems(s.ui, [im('I1'), im('I2'), im('I3'), mk('C')]);
      s.fire('pointermove', 1300, 300);
      expect(s.container.style.cursor).toBe('not-allowed');
      s.drag([1300, 300], [1400, 350]);
      expect(s.containerOf('I2')?.placement).toEqual({ x: 1100, y: 0, scale: 1 });
      expect(s.containerOf('I1')?.placement).toEqual({ x: 0, y: 0, scale: 1 });
      expect(s.viewport.viewport.value).toMatchObject({ x: 0, y: 0 });
      expect(s.store.revision.value).toBe(revision);
      expect(s.store.gestureActive.value).toBe(false);
      s.cleanup();
    });

    it('as alças do primário continuam redimensionando só o primário', () => {
      const s = groupSetup();
      selectItems(s.ui, [im('I2'), mk('M2')]);
      s.drag([300, 300], [340, 360]); // canto SE de M2
      expect(s.markingRect('M2')).toEqual({ x: 200, y: 200, width: 140, height: 160 });
      expect(s.containerOf('I2')?.placement).toEqual({ x: 1100, y: 0, scale: 1 });
      s.cleanup();
    });

    it('cursor: "mover" sobre qualquer item selecionado, nada fora deles', () => {
      const s = groupSetup();
      selectItems(s.ui, [im('I2'), mk('M2')]);
      s.fire('pointermove', 1300, 300); // dentro de I2
      expect(s.container.style.cursor).toBe('move');
      s.fire('pointermove', 250, 250); // dentro de M2
      expect(s.container.style.cursor).toBe('move');
      s.fire('pointermove', 900, 700); // I1, não selecionado
      expect(s.container.style.cursor).toBe('');
      s.cleanup();
    });

    it('toque: arrastar sobre a seleção múltipla faz pan, sem mover nada', () => {
      const s = groupSetup();
      selectItems(s.ui, [im('I1'), im('I2')]);
      s.drag([1300, 300], [1350, 330], { kind: 'touch' });
      expect(s.containerOf('I2')?.placement).toEqual({ x: 1100, y: 0, scale: 1 });
      expect(s.viewport.viewport.value).toMatchObject({ x: 50, y: 30, scale: 1 });
      s.cleanup();
    });

    it('um arrasto de zoom diferente de 1 usa o deslocamento no canvas', () => {
      const s = groupSetup();
      s.viewport.viewport.value = { x: 0, y: 0, scale: 2 };
      selectItems(s.ui, [im('I1'), im('I2'), mk('C')]);
      s.drag([2600, 600], [2800, 700]); // (1300, 300) -> (1400, 350) no canvas
      expect(s.containerOf('I2')?.placement).toEqual({ x: 1200, y: 50, scale: 1 });
      expect(s.markingRect('C')).toEqual({ x: 0, y: -50, width: 2400, height: 1000 });
      s.cleanup();
    });
  });

  describe('Shift+clique', () => {
    it('acrescenta o item à seleção e, clicando de novo, tira', () => {
      const s = setup();
      s.click(250, 250); // M2
      expect(ids(s)).toEqual(['marking:M2']);
      s.click(1300, 300, { shift: true }); // I2 (fora de M3)
      expect(ids(s)).toEqual(['marking:M2', 'image:I2']);
      expect(s.ui.selection.value).toEqual(im('I2')); // o último clicado é o primário
      s.click(1200, 100, { shift: true }); // M3, dentro de I2
      expect(ids(s)).toEqual(['marking:M2', 'image:I2', 'marking:M3']);
      expect(s.ui.selection.value).toEqual(mk('M3'));
      s.click(1300, 300, { shift: true }); // I2 sai
      expect(ids(s)).toEqual(['marking:M2', 'marking:M3']);
      expect(s.ui.selection.value).toEqual(mk('M3'));
      s.click(1200, 100, { shift: true }); // o primário sai: o último dos que ficam o substitui
      expect(ids(s)).toEqual(['marking:M2']);
      expect(s.ui.selection.value).toEqual(mk('M2'));
      expect(s.ui.selectionGroup.value).toBeNull();
      s.cleanup();
    });

    it('é o primeiro item sob o ponto, sem o ciclo de subir para o pai', () => {
      const s = setup();
      s.click(250, 250, { shift: true });
      s.click(252, 251, { shift: true }); // no mesmo ponto: não sobe para a Porta (M1)
      // O primeiro da cadeia (M2) entrou e saiu; a Porta e a imagem nunca foram escolhidas.
      expect(ids(s)).toEqual([]);
      s.click(250, 250, { shift: true });
      s.click(250, 250, { shift: true });
      s.click(250, 250, { shift: true });
      expect(ids(s)).toEqual(['marking:M2']);
      s.cleanup();
    });

    it('Shift no vazio não muda nada', () => {
      const s = setup();
      selectItems(s.ui, [im('I2'), mk('M2')]);
      const before = s.ui.selection.value;
      s.click(1050, 900, { shift: true });
      expect(ids(s)).toEqual(['image:I2', 'marking:M2']);
      expect(s.ui.selection.value).toBe(before);
      s.cleanup();
    });

    it('sem Shift, o toque seleciona um item só e desfaz o grupo', () => {
      const s = setup();
      selectItems(s.ui, [im('I2'), mk('M2')]);
      s.click(1200, 100); // M3
      expect(ids(s)).toEqual(['marking:M3']);
      s.cleanup();
    });

    it('arrastar com Shift apertado move; só o toque sem arrasto alterna', () => {
      const s = setup();
      selectItems(s.ui, [mk('M1')]);
      s.fire('pointerdown', 400, 400, { shift: true });
      s.fire('pointermove', 450, 430, { shift: true });
      s.fire('pointermove', 500, 450, { shift: true });
      s.fire('pointerup', 500, 450, { shift: true });
      expect(s.markingRect('M1')).toEqual({ x: 200, y: 150, width: 600, height: 500 });
      expect(ids(s)).toEqual(['marking:M1']);
      s.cleanup();
    });

    it('na revisão, Shift+clique é um clique simples', () => {
      const s = setup();
      s.click(250, 250); // M2
      s.setReviewing(true);
      s.click(1200, 100, { shift: true });
      expect(ids(s)).toEqual(['marking:M3']);
      expect(s.ui.selectionGroup.value).toBeNull();
      s.cleanup();
    });

    it('um clique simples depois do Shift+clique não continua o ciclo de subir', () => {
      const s = setup();
      s.click(250, 250, { shift: true }); // M2 entra
      s.click(250, 250); // clique simples no mesmo ponto: o primeiro da cadeia, não o pai
      expect(ids(s)).toEqual(['marking:M2']);
      s.cleanup();
    });
  });

  describe('duplo clique seleciona com o conteúdo', () => {
    it('numa marcação do canvas: ela e os containers dentro, com as marcações deles; ela é a primária', () => {
      const s = groupSetup();
      s.doubleClick(1050, 300); // vazio entre as telas, dentro de C
      expect(ids(s)).toEqual([
        'image:I1',
        'marking:M1',
        'marking:M2',
        'image:I2',
        'marking:M3',
        'image:I3',
        'marking:C',
      ]);
      expect(s.ui.selection.value).toEqual(mk('C'));
      s.cleanup();
    });

    it('o arrasto seguinte move o conjunto: as posições relativas ficam e é um Ctrl+Z', () => {
      const s = groupSetup();
      s.doubleClick(1050, 300);
      s.drag([1300, 300], [1350, 340]);
      expect(s.containerOf('I1')?.placement).toEqual({ x: 50, y: 40, scale: 1 });
      expect(s.containerOf('I2')?.placement).toEqual({ x: 1150, y: 40, scale: 1 });
      expect(s.containerOf('I3')?.placement).toEqual({ x: 1850, y: 40, scale: 1 });
      expect(s.markingRect('C')).toEqual({ x: -50, y: -60, width: 2400, height: 1000 });
      expect(s.store.undo()).toBe(true);
      expect(s.store.canUndo.value).toBe(false);
      s.cleanup();
    });

    it('o alvo é o que o primeiro clique selecionou (a mais interna), não o degrau seguinte', () => {
      const s = setup();
      s.doubleClick(400, 400); // dentro da Porta (M1, com a filha M2), fora da Maçaneta
      expect(ids(s)).toEqual(['marking:M2', 'marking:M1']);
      expect(s.ui.selection.value).toEqual(mk('M1'));
      s.cleanup();
    });

    it('numa marcação sem conteúdo seleciona só ela', () => {
      const s = setup();
      s.doubleClick(250, 250); // Maçaneta, a mais interna
      expect(ids(s)).toEqual(['marking:M2']);
      expect(s.ui.selectionGroup.value).toBeNull();
      s.cleanup();
    });

    it('num container só devolve a seleção a ele', () => {
      const s = groupSetup();
      // Entre as marcações de I1: a cadeia é [I1, C]; o segundo toque subiria para C.
      s.doubleClick(900, 700);
      expect(ids(s)).toEqual(['image:I1']);
      expect(s.ui.selection.value).toEqual(im('I1'));
      s.cleanup();
    });

    it('zera o ciclo: o clique seguinte no mesmo ponto recomeça pelo primeiro da cadeia', () => {
      const s = setup();
      s.doubleClick(400, 400);
      s.click(402, 401); // perto do duplo clique
      expect(ids(s)).toEqual(['marking:M1']); // o primeiro da cadeia, não o degrau seguinte
      s.cleanup();
    });

    it('no vazio não faz nada', () => {
      const s = setup();
      s.doubleClick(1050, 900);
      expect(ids(s)).toEqual([]);
      s.cleanup();
    });

    it('só no modo Navegar', () => {
      const s = groupSetup();
      s.ui.mode.value = 'draw';
      s.doubleClick(1050, 300);
      expect(ids(s)).toEqual(['marking:C']);
      s.cleanup();
    });

    it('um toque de dedo (não é mouse) ou a revisão não selecionam o conteúdo', () => {
      const s = groupSetup();
      s.click(1050, 300, { kind: 'touch' });
      s.click(1050, 300, { kind: 'touch' });
      s.container.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      expect(ids(s)).toEqual(['marking:C']);
      const t = groupSetup();
      t.setReviewing(true);
      t.doubleClick(1050, 300);
      expect(ids(t)).toEqual(['marking:C']);
      s.cleanup();
      t.cleanup();
    });

    it('um arrasto no meio do duplo clique o desfaz', () => {
      const s = groupSetup();
      s.click(1050, 300); // C
      s.drag([1050, 300], [1100, 300]); // o segundo "clique" foi um arrasto (pan, sem seleção)
      s.container.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      expect(ids(s)).toEqual(['marking:C']);
      s.cleanup();
    });
  });

  describe('botão direito', () => {
    it('sobre um item que já está na seleção múltipla não desfaz a seleção', () => {
      const s = setup();
      selectItems(s.ui, [mk('M3'), mk('M2')]);
      const primary = s.ui.selection.value;
      s.rightClick(1200, 100); // M3, na seleção mas não primário
      expect(ids(s)).toEqual(['marking:M3', 'marking:M2']);
      expect(s.ui.selection.value).toBe(primary);
      expect(s.ui.canvasMenu.value?.target).toEqual({ kind: 'm', id: 'M3' });
      s.rightClick(250, 250); // M2, o primário
      expect(ids(s)).toEqual(['marking:M3', 'marking:M2']);
      expect(s.ui.canvasMenu.value?.target).toEqual({ kind: 'm', id: 'M2' });
      s.cleanup();
    });

    it('sobre outro item o comportamento é o de sempre: seleciona só ele', () => {
      const s = setup();
      selectItems(s.ui, [mk('M3'), mk('M2')]);
      s.rightClick(400, 400); // M1, fora da seleção
      expect(ids(s)).toEqual(['marking:M1']);
      expect(s.ui.canvasMenu.value?.target).toEqual({ kind: 'm', id: 'M1' });
      s.cleanup();
    });
  });
});

// Setas (ME4): selecionar pelo traço, criar pela alça de ligação, pontos de passagem, trocar a
// ponta e o lado. Projeto das setas: r1 de a1 (100,100,300,300) a a3 (600,600,200,200), no
// container A (escala 1, em 0,0); a curva sai por (400,250) e chega por (600,700). Cada gesto é
// uma entrada de desfazer.
describe('PointerInput: setas (ME4)', () => {
  const arrowsOf = (s: ReturnType<typeof setup>) => s.store.project.peek()?.arrows ?? [];
  const r1 = (s: ReturnType<typeof setup>) => arrowsOf(s).find((a) => a.id === 'r1');
  const straightProject = () => setArrowStyle(arrowProject(), 'r1', 'straight');
  const select = (s: ReturnType<typeof setup>, selection: Selection) => {
    s.ui.selection.value = selection;
  };
  const undoAll = (s: ReturnType<typeof setup>) => {
    let n = 0;
    while (s.store.canUndo.value && s.store.undo()) n++;
    return n;
  };

  afterEach(() => setShowArrows(true));

  describe('seleção pelo traço', () => {
    it('clicar perto do traço seleciona a seta; longe, o container; Shift alterna', () => {
      const s = setup(false, straightProject());
      s.click(500, 475);
      expect(s.ui.selection.value).toEqual({ kind: 'arrow', id: 'r1' });
      s.click(900, 100); // dentro de A, longe de tudo
      expect(s.ui.selection.value).toEqual({ kind: 'image', id: 'A' });
      // Shift+clique soma a seta à seleção e de novo a tira.
      s.click(500, 475, { shift: true });
      expect(peekSelectedItems(s.ui)).toEqual([
        { kind: 'image', id: 'A' },
        { kind: 'arrow', id: 'r1' },
      ]);
      s.click(500, 475, { shift: true });
      expect(peekSelectedItems(s.ui)).toEqual([{ kind: 'image', id: 'A' }]);
      s.cleanup();
    });

    it('"Mostrar setas" desligado ou Ver limpo: o traço não recebe o toque', () => {
      const s = setup(false, straightProject());
      setShowArrows(false);
      s.click(500, 475);
      expect(s.ui.selection.value).toEqual({ kind: 'image', id: 'A' });
      setShowArrows(true);
      s.ui.cleanView.value = true;
      s.click(500, 475);
      expect(s.ui.selection.value).toEqual({ kind: 'image', id: 'A' });
      s.cleanup();
    });

    it('a seta de ponta oculta pelo modo de exibição não recebe o toque', () => {
      const s = setup(false, straightProject());
      s.derived.markingVisibility.peek(); // mapa de visibilidade do modo atual
      const hidden = vi
        .spyOn(s.derived.markingVisibility, 'peek')
        .mockReturnValue(new Map([['a3', 'hidden' as const]]));
      s.click(500, 475);
      expect(s.ui.selection.value).toEqual({ kind: 'image', id: 'A' });
      hidden.mockRestore();
      s.cleanup();
    });

    it('botão direito no traço seleciona a seta e abre o menu dela', () => {
      const s = setup(false, straightProject());
      s.rightClick(500, 475);
      expect(s.ui.selection.value).toEqual({ kind: 'arrow', id: 'r1' });
      expect(s.ui.canvasMenu.value?.target).toEqual({ kind: 'arrow', id: 'r1' });
      s.cleanup();
    });

    it('clicar numa alça não troca a seleção (nem sobe pela cadeia)', () => {
      const s = setup(false, straightProject());
      select(s, { kind: 'arrow', id: 'r1' });
      s.click(400, 250);
      s.click(400, 250);
      expect(s.ui.selection.value).toEqual({ kind: 'arrow', id: 'r1' });
      select(s, { kind: 'marking', id: 'a1' });
      s.click(414, 250); // alça de ligação
      expect(s.ui.selection.value).toEqual({ kind: 'marking', id: 'a1' });
      s.cleanup();
    });

    it('cursor: alça da ponta mira, ponto de passagem move, traço trancado não permite', () => {
      const s = setup(false, straightProject());
      select(s, { kind: 'arrow', id: 'r1' });
      s.input.updateCursor({ x: 400, y: 250 });
      expect(s.container.style.cursor).toBe('crosshair');
      s.input.updateCursor({ x: 500, y: 475 });
      expect(s.container.style.cursor).toBe('move');
      s.input.updateCursor({ x: 900, y: 100 });
      expect(s.container.style.cursor).toBe('');
      select(s, { kind: 'marking', id: 'a1' });
      s.input.updateCursor({ x: 414, y: 250 });
      expect(s.container.style.cursor).toBe('crosshair');
      s.cleanup();
    });
  });

  describe('criar pela alça de ligação', () => {
    it('puxar até outra marcação acende o destino, cria a seta e a seleciona (uma entrada)', () => {
      const s = setup(false, arrowProject());
      select(s, { kind: 'marking', id: 'a1' });
      s.fire('pointerdown', 414, 250);
      s.fire('pointermove', 440, 300);
      s.fire('pointermove', 700, 700);
      expect(s.state.arrowDraft.value).toEqual({
        line: { from: { x: 400, y: 250 }, to: { x: 700, y: 700 } },
        target: 'a3',
      });
      // Nada foi criado nem entrou no histórico ainda.
      expect(arrowsOf(s)).toHaveLength(1);
      s.fire('pointerup', 700, 700);
      const created = arrowsOf(s)[1];
      expect(created).toMatchObject({ from: 'a1', to: 'a3', style: 'curve', points: [] });
      expect(s.ui.selection.value).toEqual({ kind: 'arrow', id: created?.id });
      expect(s.state.arrowDraft.value).toBeNull();
      // O marcação de origem não mudou, e desfazer tira só a seta.
      expect(s.markingRect('a1')).toEqual({ x: 100, y: 100, width: 300, height: 300 });
      expect(s.store.undo()).toBe(true);
      expect(arrowsOf(s)).toHaveLength(1);
      s.cleanup();
    });

    it('soltar fora de uma marcação ou sobre a origem cancela, sem entrada', () => {
      const s = setup(false, arrowProject());
      select(s, { kind: 'marking', id: 'a1' });
      const before = s.store.canUndo.value;
      s.drag([414, 250], [3000, 3000]);
      expect(arrowsOf(s)).toHaveLength(1);
      s.fire('pointerdown', 414, 250);
      s.fire('pointermove', 450, 280);
      s.fire('pointermove', 350, 350); // sobre a própria origem: não é destino
      expect(s.state.arrowDraft.value?.target).toBeNull();
      s.fire('pointerup', 350, 350);
      expect(arrowsOf(s)).toHaveLength(1);
      expect(s.store.canUndo.value).toBe(before);
      expect(s.ui.selection.value).toEqual({ kind: 'marking', id: 'a1' });
      s.cleanup();
    });

    it('Esc no meio do gesto cancela e apaga a seta provisória', () => {
      const s = setup(false, arrowProject());
      select(s, { kind: 'marking', id: 'a1' });
      s.fire('pointerdown', 414, 250);
      s.fire('pointermove', 450, 280);
      s.fire('pointermove', 700, 700);
      expect(s.state.arrowDraft.value).not.toBeNull();
      expect(s.input.cancelInteraction()).toBe(true);
      expect(s.state.arrowDraft.value).toBeNull();
      s.fire('pointerup', 700, 700);
      expect(arrowsOf(s)).toHaveLength(1);
      s.cleanup();
    });

    it('vale para a marcação trancada (a marcação não muda) e não para o somente leitura', () => {
      const locked = setMarkingLocked(arrowProject(), 'a1', true);
      const s = setup(false, locked);
      select(s, { kind: 'marking', id: 'a1' });
      s.drag([414, 250], [700, 700]);
      expect(arrowsOf(s)).toHaveLength(2);
      s.cleanup();
      const ro = setup(true, arrowProject());
      select(ro, { kind: 'marking', id: 'a1' });
      ro.drag([414, 250], [700, 700]);
      expect(arrowsOf(ro)).toHaveLength(1);
      ro.cleanup();
    });

    it('o destino é a primeira marcação sob o ponteiro: a flutuante, sobre as demais', () => {
      const project = createMarking(arrowProject(), {
        id: 'F1',
        containerId: null,
        rect: { x: 650, y: 650, width: 100, height: 100 },
        floating: true,
      });
      const s = setup(false, project);
      select(s, { kind: 'marking', id: 'a1' });
      s.drag([414, 250], [700, 700]);
      expect(arrowsOf(s)[1]).toMatchObject({ from: 'a1', to: 'F1' });
      s.cleanup();
    });
  });

  describe('pontos de passagem', () => {
    it('arrastar o meio de um trecho cria um ponto ali (uma entrada)', () => {
      const s = setup(false, straightProject());
      select(s, { kind: 'arrow', id: 'r1' });
      s.drag([500, 475], [560, 420]);
      expect(r1(s)?.points).toEqual([{ x: 560, y: 420 }]);
      expect(r1(s)?.fromSide).toBeNull();
      expect(undoAll(s)).toBe(1);
      expect(r1(s)?.points).toEqual([]);
      s.cleanup();
    });

    it('mover um ponto de passagem; o ponto cai nos pixels inteiros do container', () => {
      const project = setArrowRoute(straightProject(), 'r1', [{ x: 700, y: 300 }]);
      const s = setup(false, project);
      select(s, { kind: 'arrow', id: 'r1' });
      s.fire('pointerdown', 700, 300);
      s.fire('pointermove', 710, 310);
      s.fire('pointermove', 720.4, 330.6);
      // Durante o gesto a prévia já mostra o ponto novo, mas não há entrada no histórico.
      expect(r1(s)?.points).toEqual([{ x: 720, y: 331 }]);
      expect(s.store.canUndo.value).toBe(false);
      s.fire('pointerup', 720.4, 330.6);
      expect(r1(s)?.points).toEqual([{ x: 720, y: 331 }]);
      expect(undoAll(s)).toBe(1);
      expect(r1(s)?.points).toEqual([{ x: 700, y: 300 }]);
      s.cleanup();
    });

    it('o ponto novo vai para a posição certa entre os pontos que já existem', () => {
      const project = setArrowRoute(straightProject(), 'r1', [
        { x: 700, y: 300 },
        { x: 700, y: 500 },
      ]);
      const s = setup(false, project);
      select(s, { kind: 'arrow', id: 'r1' });
      // Meio do segundo trecho: entre (700,300) e (700,500) = (700,400), posição 1.
      s.drag([700, 400], [760, 400]);
      expect(r1(s)?.points).toEqual([
        { x: 700, y: 300 },
        { x: 760, y: 400 },
        { x: 700, y: 500 },
      ]);
      s.cleanup();
    });

    it('clique duplo num ponto de passagem o remove e mantém a seta selecionada', () => {
      const project = setArrowRoute(straightProject(), 'r1', [
        { x: 700, y: 300 },
        { x: 700, y: 500 },
      ]);
      const s = setup(false, project);
      select(s, { kind: 'arrow', id: 'r1' });
      s.doubleClick(700, 300);
      expect(r1(s)?.points).toEqual([{ x: 700, y: 500 }]);
      expect(s.ui.selection.value).toEqual({ kind: 'arrow', id: 'r1' });
      expect(undoAll(s)).toBe(1);
      expect(r1(s)?.points).toHaveLength(2);
      s.cleanup();
    });

    it('clique duplo fora de um ponto de passagem não remove nada', () => {
      const project = setArrowRoute(straightProject(), 'r1', [{ x: 700, y: 300 }]);
      const s = setup(false, project);
      select(s, { kind: 'arrow', id: 'r1' });
      s.doubleClick(550, 276); // o meio do trecho, não um ponto
      expect(r1(s)?.points).toHaveLength(1);
      s.cleanup();
    });

    it('seta trancada: arrastar o traço não faz nada (nem pan); só leitura: pan', () => {
      const locked = withArrow(straightProject(), 'r2', 'a3', 'b2', {
        style: 'straight',
        locked: true,
      });
      const s = setup(false, locked);
      select(s, { kind: 'arrow', id: 'r2' });
      s.input.updateCursor({ x: 800, y: 700 });
      expect(s.container.style.cursor).toBe('not-allowed');
      s.fire('pointerdown', 800, 700);
      s.fire('pointermove', 830, 720);
      s.fire('pointermove', 900, 760);
      s.fire('pointerup', 900, 760);
      expect(arrowsOf(s).find((a) => a.id === 'r2')?.points).toEqual([]);
      expect(s.viewport.viewport.value).toMatchObject({ x: 0, y: 0 });
      expect(s.store.canUndo.value).toBe(false);
      s.doubleClick(800, 700);
      expect(s.store.canUndo.value).toBe(false);
      s.cleanup();
      const ro = setup(true, straightProject());
      select(ro, { kind: 'arrow', id: 'r1' });
      ro.drag([500, 475], [560, 420]);
      expect(r1(ro)?.points).toEqual([]);
      ro.cleanup();
    });

    it('cancelar (Esc) o gesto volta os pontos', () => {
      const project = setArrowRoute(straightProject(), 'r1', [{ x: 700, y: 300 }]);
      const s = setup(false, project);
      select(s, { kind: 'arrow', id: 'r1' });
      s.fire('pointerdown', 700, 300);
      s.fire('pointermove', 720, 330);
      s.fire('pointermove', 740, 360);
      expect(r1(s)?.points).toEqual([{ x: 740, y: 360 }]);
      expect(s.input.cancelInteraction()).toBe(true);
      expect(r1(s)?.points).toEqual([{ x: 700, y: 300 }]);
      s.fire('pointerup', 740, 360);
      expect(s.store.canUndo.value).toBe(false);
      s.cleanup();
    });
  });

  describe('trocar a ponta e o lado', () => {
    it('arrastar a ponta até outra marcação troca o destino (uma entrada) e acende o alvo', () => {
      const s = setup(false, arrowProject());
      select(s, { kind: 'arrow', id: 'r1' });
      s.fire('pointerdown', 600, 700);
      s.fire('pointermove', 650, 720);
      s.fire('pointermove', 2700, 700); // sobre b2 (2600,600,200,200)
      expect(s.state.arrowDraft.value).toEqual({ line: null, target: 'b2' });
      expect(r1(s)?.to).toBe('b2');
      s.fire('pointerup', 2700, 700);
      expect(r1(s)).toMatchObject({ from: 'a1', to: 'b2', toSide: null });
      // Os containers das pontas mudaram: o espaço dos pontos mudou e a rota voltou ao padrão.
      expect(r1(s)?.points).toEqual([]);
      expect(s.state.arrowDraft.value).toBeNull();
      expect(undoAll(s)).toBe(1);
      expect(r1(s)).toMatchObject({ to: 'a3' });
      s.cleanup();
    });

    it('arrastar a origem troca o `from`', () => {
      const s = setup(false, arrowProject());
      select(s, { kind: 'arrow', id: 'r1' });
      s.drag([400, 250], [2700, 700]);
      expect(r1(s)).toMatchObject({ from: 'b2', to: 'a3' });
      s.cleanup();
    });

    it('sobre a mesma marcação, perto de outro lado, troca o lado', () => {
      const s = setup(false, arrowProject());
      select(s, { kind: 'arrow', id: 'r1' });
      // a3 (600,600,200,200): perto do lado de cima.
      s.drag([600, 700], [700, 610]);
      expect(r1(s)).toMatchObject({ to: 'a3', toSide: 'top', fromSide: null });
      expect(undoAll(s)).toBe(1);
      s.cleanup();
    });

    it('sobre a mesma marcação, no lado em que já está: nada muda (o automático segue automático)', () => {
      const s = setup(false, arrowProject());
      select(s, { kind: 'arrow', id: 'r1' });
      s.drag([600, 700], [610, 700]);
      expect(r1(s)).toMatchObject({ to: 'a3', toSide: null });
      expect(s.store.canUndo.value).toBe(false);
      s.cleanup();
    });

    it('soltar no vazio ou sobre a outra ponta cancela e mostra a linha provisória no caminho', () => {
      const s = setup(false, arrowProject());
      select(s, { kind: 'arrow', id: 'r1' });
      s.fire('pointerdown', 600, 700);
      s.fire('pointermove', 650, 720);
      s.fire('pointermove', 3000, 3000);
      expect(s.state.arrowDraft.value).toEqual({
        line: { from: { x: 400, y: 250 }, to: { x: 3000, y: 3000 } },
        target: null,
      });
      expect(r1(s)?.to).toBe('a3');
      s.fire('pointerup', 3000, 3000);
      expect(r1(s)?.to).toBe('a3');
      expect(s.store.canUndo.value).toBe(false);
      expect(s.state.arrowDraft.value).toBeNull();
      // Sobre a marcação da outra ponta (a1): também cancela (seria uma seta ligada a ela mesma).
      s.drag([600, 700], [350, 350]);
      expect(r1(s)).toMatchObject({ from: 'a1', to: 'a3' });
      expect(s.store.canUndo.value).toBe(false);
      s.cleanup();
    });
  });

  describe('Ver limpo e revisão', () => {
    it('na revisão (somente leitura) as setas não se editam, mas o traço ainda seleciona', () => {
      const s = setup(false, straightProject());
      s.setReviewing(true);
      s.click(500, 475);
      expect(s.ui.selection.value).toEqual({ kind: 'arrow', id: 'r1' });
      s.drag([500, 475], [560, 420]);
      expect(r1(s)?.points).toEqual([]);
      s.rightClick(500, 475);
      expect(s.ui.canvasMenu.value).toBeNull();
      s.cleanup();
    });
  });
});

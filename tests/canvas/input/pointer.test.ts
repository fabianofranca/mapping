import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInteractionState } from '../../../src/canvas/frame';
import { PointerInput } from '../../../src/canvas/input/pointer';
import { ViewportController } from '../../../src/canvas/viewportController';
import {
  addContainer,
  createMarking,
  projectIndex,
  setContainerPlacement,
  type Project,
} from '../../../src/model';
import { canvasProject, editorFor } from '../harness';

// Viewport 1:1 em (0, 0) e container em (0, 0) na página: tela = canvas.
function setup(readOnly = false, project: Project = canvasProject()) {
  const editor = editorFor(project, readOnly);
  const container = document.createElement('div');
  document.body.append(container);
  const viewport = new ViewportController(container, () => editor.store.project.peek());
  const state = createInteractionState();
  let spaceDown = false;
  const input = new PointerInput({
    container,
    ...editor,
    viewport,
    state,
    spaceDown: () => spaceDown,
  });
  const unbind = input.bind();
  const fire = (
    type: 'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel',
    x: number,
    y: number,
    { id = 1, kind = 'mouse', button = 0 } = {},
  ) =>
    container.dispatchEvent(
      new PointerEvent(type, {
        pointerId: id,
        pointerType: kind,
        button,
        clientX: x,
        clientY: y,
        bubbles: true,
      }),
    );
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
    drag,
    markingRect,
    markingOf,
    containerOf,
    setSpace: (down: boolean) => (spaceDown = down),
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

import { signal } from '@preact/signals';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Draft, Grabbed, ImagePreview } from '../../../src/canvas/frame';
import { HOLD_MS } from '../../../src/canvas/gestureMachine';
import { PointerInput } from '../../../src/canvas/input/pointer';
import { ViewportController } from '../../../src/canvas/viewportController';
import { projectIndex } from '../../../src/model';
import { canvasProject, editorFor } from '../harness';

// Viewport 1:1 em (0, 0) e container em (0, 0) na página: tela = canvas.
function setup(readOnly = false) {
  const editor = editorFor(canvasProject(), readOnly);
  const container = document.createElement('div');
  document.body.append(container);
  const viewport = new ViewportController(
    container,
    () => editor.store.project.peek()?.images ?? [],
  );
  const state = {
    preview: signal<ImagePreview | null>(null),
    draft: signal<Draft | null>(null),
    grabbed: signal<Grabbed | null>(null),
    hoverLock: signal<Grabbed | null>(null),
  };
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
  return {
    ...editor,
    container,
    viewport,
    state,
    input,
    fire,
    drag,
    markingRect,
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
    expect(s.state.preview.value).toMatchObject({ imageId: 'I2', valid: false });
    s.fire('pointerup', 800, 300);
    expect(s.state.preview.value).toBeNull();
    const p = s.store.project.peek();
    expect(p && projectIndex(p).images.get('I2')?.placement.x).toBe(1100);
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

  it('toque: segurar pega o item sob o dedo e arrastar o move', () => {
    vi.useFakeTimers();
    const s = setup();
    const vibrate = vi.fn();
    Object.defineProperty(navigator, 'vibrate', { value: vibrate, configurable: true });
    s.fire('pointerdown', 250, 250, { kind: 'touch' });
    vi.advanceTimersByTime(HOLD_MS);
    expect(s.ui.selection.value).toEqual({ kind: 'marking', id: 'M2' });
    expect(s.state.grabbed.value).toEqual({ kind: 'marking', id: 'M2' });
    expect(vibrate).toHaveBeenCalled();
    s.fire('pointermove', 260, 260, { kind: 'touch' });
    s.fire('pointermove', 280, 290, { kind: 'touch' });
    s.fire('pointerup', 280, 290, { kind: 'touch' });
    expect(s.markingRect('M2')).toEqual({ x: 230, y: 240, width: 100, height: 100 });
    expect(s.state.grabbed.value).toBeNull();
    s.cleanup();
  });

  it('modo Desenhar: arrastar sobre a imagem cria e seleciona a marcação', () => {
    const s = setup();
    s.ui.mode.value = 'draw';
    s.fire('pointerdown', 750, 650);
    s.fire('pointermove', 800, 700);
    expect(s.state.draft.value?.imageId).toBe('I1');
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
    expect(p && projectIndex(p).images.get('I2')?.placement.x).toBe(1100);
    s.cleanup();
  });

  it('toque: segurar sobre o item trancado não o pega (sem sinal visual nem vibração)', () => {
    vi.useFakeTimers();
    const s = setup();
    lockMarking(s, 'M2');
    const vibrate = vi.fn();
    Object.defineProperty(navigator, 'vibrate', { value: vibrate, configurable: true });
    s.fire('pointerdown', 250, 250, { kind: 'touch' });
    vi.advanceTimersByTime(HOLD_MS);
    expect(s.state.grabbed.value).toBeNull();
    expect(vibrate).not.toHaveBeenCalled();
    s.fire('pointermove', 260, 260, { kind: 'touch' });
    s.fire('pointermove', 280, 290, { kind: 'touch' });
    s.fire('pointerup', 280, 290, { kind: 'touch' });
    expect(s.markingRect('M2')).toEqual({ x: 200, y: 200, width: 100, height: 100 });
    expect(s.store.canUndo.value).toBe(true); // só a própria trava
    s.cleanup();
  });

  it('toque: segurar sobre o item trancado e selecionado também não o pega', () => {
    vi.useFakeTimers();
    const s = setup();
    lockMarking(s, 'M1');
    s.ui.selection.value = { kind: 'marking', id: 'M1' };
    s.fire('pointerdown', 400, 400, { kind: 'touch' });
    vi.advanceTimersByTime(HOLD_MS);
    expect(s.state.grabbed.value).toBeNull();
    s.fire('pointerup', 400, 400, { kind: 'touch' });
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

  it('toque: segurar numa marcação livre continua pegando', () => {
    vi.useFakeTimers();
    const s = setup();
    lockMarking(s, 'M2');
    s.fire('pointerdown', 1200, 100, { kind: 'touch' });
    vi.advanceTimersByTime(HOLD_MS);
    expect(s.state.grabbed.value).toEqual({ kind: 'marking', id: 'M3' });
    s.fire('pointerup', 1200, 100, { kind: 'touch' });
    s.cleanup();
  });

  it('segurar numa imagem trancada (fora das marcações) não a pega', () => {
    vi.useFakeTimers();
    const s = setup();
    expect(s.actions.setImageLocked('I1', true).ok).toBe(true);
    s.fire('pointerdown', 900, 700, { kind: 'touch' });
    vi.advanceTimersByTime(HOLD_MS);
    expect(s.state.grabbed.value).toBeNull();
    s.fire('pointerup', 900, 700, { kind: 'touch' });
    s.cleanup();
  });
});

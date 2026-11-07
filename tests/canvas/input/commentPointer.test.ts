import { signal } from '@preact/signals';
import { afterEach, describe, expect, it } from 'vitest';
import type { Thread } from '../../../src/model';
import { createInteractionState } from '../../../src/canvas/frame';
import { pinPlaces, type PinPlace } from '../../../src/canvas/commentPins';
import { PointerInput } from '../../../src/canvas/input/pointer';
import { ViewportController } from '../../../src/canvas/viewportController';
import { createEditorDerived } from '../../../src/store/derived';
import {
  armComment,
  composingAnchor,
  selectedThreadId,
} from '../../../src/store/threadUi';
import { AGENT, HUMAN, T0, T1, message, sampleThread } from '../../model/threadFixtures';
import { canvasProject, editorFor } from '../harness';

// O clique do botão Comentar e o clique no pino (CM4, decisões 24 e 25). Viewport 1:1 em (0, 0).

const thread = (id: string, anchor: Thread['anchor']): Thread =>
  sampleThread({
    id,
    anchor,
    messages: [
      message(`${id}1`, T0, HUMAN, `assunto ${id}`),
      message(`${id}2`, T1, AGENT, 'ok'),
    ],
  });

function setup(threads: readonly Thread[] = [], readOnly = false) {
  const base = editorFor(canvasProject(), readOnly);
  const derived = createEditorDerived(base.store, base.ui, undefined, undefined, {
    threads: signal(threads),
    copyId: null,
    identity: signal(null),
  });
  const editor = { ...base, derived };
  const container = document.createElement('div');
  document.body.append(container);
  const viewport = new ViewportController(container, () => editor.store.project.peek());
  let pins: readonly PinPlace[] = [];
  const input = new PointerInput({
    container,
    ...editor,
    viewport,
    state: createInteractionState(),
    spaceDown: () => false,
    pinAt: (c) =>
      pins.find(
        (p) =>
          c.x >= p.origin.x &&
          c.x <= p.origin.x + 40 &&
          c.y >= p.origin.y - 20 &&
          c.y <= p.origin.y,
      ) ?? null,
  });
  const unbind = input.bind();
  const fire = (type: 'pointerdown' | 'pointerup', x: number, y: number) =>
    container.dispatchEvent(
      new PointerEvent(type, {
        pointerId: 1,
        pointerType: 'mouse',
        button: 0,
        clientX: x,
        clientY: y,
        bubbles: true,
      }),
    );
  const click = (x: number, y: number) => {
    fire('pointerdown', x, y);
    fire('pointerup', x, y);
  };
  const place = () => {
    const project = editor.store.project.peek();
    if (!project) throw new Error('sem projeto');
    pins = pinPlaces(
      project,
      derived.threads.pins.peek(),
      derived.markingVisibility.peek(),
    );
    return pins;
  };
  return {
    ...editor,
    click,
    place,
    destroy: () => {
      unbind();
      container.remove();
    },
  };
}

let current: ReturnType<typeof setup> | null = null;
afterEach(() => current?.destroy());

describe('botão Comentar armado: o próximo clique abre o rascunho', () => {
  it('sobre uma marcação, ancora nela e volta à ferramenta de antes', () => {
    const s = (current = setup());
    s.ui.mode.value = 'draw';
    armComment(s.ui);
    s.click(250, 250);
    expect(composingAnchor(s.ui)).toEqual({ kind: 'marking', id: 'M2' });
    expect(s.ui.commentArm.value).toBeNull();
    expect(s.ui.mode.value).toBe('draw');
    expect(s.ui.commentPins.value).toBe(true);
  });

  it('num lugar vazio do container, abre o rascunho num ponto (pixels do container)', () => {
    const s = (current = setup());
    armComment(s.ui);
    s.click(900, 700);
    expect(composingAnchor(s.ui)).toEqual({
      kind: 'point',
      containerId: 'I1',
      x: 900,
      y: 700,
    });
  });

  it('num lugar vazio do canvas, o ponto fica nas unidades do canvas', () => {
    const s = (current = setup());
    armComment(s.ui);
    s.click(1050, 900);
    expect(composingAnchor(s.ui)).toEqual({
      kind: 'point',
      containerId: null,
      x: 1050,
      y: 900,
    });
  });

  it('no somente leitura o clique desarma e não abre rascunho', () => {
    const s = (current = setup([], true));
    armComment(s.ui);
    s.click(250, 250);
    expect(composingAnchor(s.ui)).toBeNull();
    expect(s.ui.commentArm.value).toBeNull();
  });

  it('o clique não muda a seleção do canvas por baixo do Comentar', () => {
    const s = (current = setup());
    armComment(s.ui);
    s.click(900, 700);
    expect(s.ui.selection.value).toBeNull();
  });
});

describe('clique no pino', () => {
  it('uma conversa: seleciona o item e a conversa, e ganha da marcação embaixo', () => {
    const s = (current = setup([thread('t1', { kind: 'marking', id: 'M1' })]));
    s.ui.commentPins.value = true;
    const [pin] = s.place();
    // O pino de M1 fica no canto (700,100) acima dele; o clique em (710, 90) não toca marcação, então
    // forçamos o caso do pino sobre outra marcação: pino de M1, clique dentro dele.
    expect(pin).toBeDefined();
    s.click(pin!.origin.x + 5, pin!.origin.y - 5);
    expect(s.ui.selection.value).toEqual({ kind: 'marking', id: 'M1' });
    expect(selectedThreadId(s.ui)).toBe('t1');
  });

  it('várias conversas no item: seleciona o item e abre a lista (nenhuma conversa escolhida)', () => {
    const s = (current = setup([
      thread('t1', { kind: 'marking', id: 'M1' }),
      thread('t2', { kind: 'field', annotationId: 'A1', key: 'tipo' }),
    ]));
    s.ui.commentPins.value = true;
    const [pin] = s.place();
    s.click(pin!.origin.x + 5, pin!.origin.y - 5);
    expect(s.ui.selection.value).toEqual({ kind: 'marking', id: 'M1' });
    expect(selectedThreadId(s.ui)).toBeNull();
  });

  it('no ponto solto: seleciona a conversa, sem item', () => {
    const s = (current = setup([
      thread('t1', { kind: 'point', containerId: null, x: 1050, y: 900 }),
    ]));
    s.ui.commentPins.value = true;
    s.place();
    s.click(1050 + 1, 900 - 1);
    expect(s.ui.selection.value).toBeNull();
    expect(selectedThreadId(s.ui)).toBe('t1');
  });

  it('o pino sobre outra marcação ganha dela: o clique vai para a conversa, não para a marcação', () => {
    // O pino do ponto (250, 250) cai sobre M2; o clique é do pino.
    const s = (current = setup([
      thread('t1', { kind: 'point', containerId: 'I1', x: 250, y: 250 }),
    ]));
    s.ui.commentPins.value = true;
    s.place();
    s.click(251, 249);
    expect(selectedThreadId(s.ui)).toBe('t1');
    expect(s.ui.selection.value).toBeNull();
  });
});

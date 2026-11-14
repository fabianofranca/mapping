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

// The click of the Comment button and the click on the pin (CM4, decisions 24 and 25). Viewport 1:1 at (0, 0).

const thread = (id: string, anchor: Thread['anchor']): Thread =>
  sampleThread({
    id,
    anchor,
    messages: [
      message(`${id}1`, T0, HUMAN, `subject ${id}`),
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
    if (!project) throw new Error('no project');
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

describe('Comment button armed: the next click opens the draft', () => {
  it('on a marking, anchors to it and goes back to the previous tool', () => {
    const s = (current = setup());
    s.ui.mode.value = 'draw';
    armComment(s.ui);
    s.click(250, 250);
    expect(composingAnchor(s.ui)).toEqual({ kind: 'marking', id: 'M2' });
    expect(s.ui.commentArm.value).toBeNull();
    expect(s.ui.mode.value).toBe('draw');
    expect(s.ui.commentPins.value).toBe(true);
  });

  it('on an empty spot of the container, opens the draft at a point (container pixels)', () => {
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

  it('on an empty spot of the canvas, the point is in canvas units', () => {
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

  it('in read-only the click disarms and opens no draft', () => {
    const s = (current = setup([], true));
    armComment(s.ui);
    s.click(250, 250);
    expect(composingAnchor(s.ui)).toBeNull();
    expect(s.ui.commentArm.value).toBeNull();
  });

  it('the click does not change the canvas selection underneath Comment', () => {
    const s = (current = setup());
    armComment(s.ui);
    s.click(900, 700);
    expect(s.ui.selection.value).toBeNull();
  });
});

describe('click on the pin', () => {
  it('one thread: selects the item and the thread, and wins over the marking underneath', () => {
    const s = (current = setup([thread('t1', { kind: 'marking', id: 'M1' })]));
    s.ui.commentPins.value = true;
    const [pin] = s.place();
    // The pin of M1 sits at the corner (700,100) above it; the click at (710, 90) touches no marking, so
    // we force the case of the pin over another marking: pin of M1, click inside it.
    expect(pin).toBeDefined();
    s.click(pin!.origin.x + 5, pin!.origin.y - 5);
    expect(s.ui.selection.value).toEqual({ kind: 'marking', id: 'M1' });
    expect(selectedThreadId(s.ui)).toBe('t1');
  });

  it('several threads on the item: selects the item and opens the list (no thread chosen)', () => {
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

  it('on a loose point: selects the thread, without an item', () => {
    const s = (current = setup([
      thread('t1', { kind: 'point', containerId: null, x: 1050, y: 900 }),
    ]));
    s.ui.commentPins.value = true;
    s.place();
    s.click(1050 + 1, 900 - 1);
    expect(s.ui.selection.value).toBeNull();
    expect(selectedThreadId(s.ui)).toBe('t1');
  });

  it('the pin over another marking wins over it: the click goes to the thread, not to the marking', () => {
    // The pin of the point (250, 250) falls over M2; the click is the pin one.
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

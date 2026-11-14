import { signal } from '@preact/signals';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { CanvasController } from '../../src/canvas/CanvasController';
import type { CommentPinRenderer } from '../../src/canvas/renderers/commentPins';
import { approximateMeasurer, type Thread } from '../../src/model';
import { createDisplayImages } from '../../src/store/displayImages';
import { createEditorDerived } from '../../src/store/derived';
import { THREAD_STATE_GLYPHS } from '../../src/utils/threadStateGlyph';
import { textMeasurer } from '../../src/store/textMeasure';
import { startComposing } from '../../src/store/threadUi';
import { setViewMode } from '../../src/store/ui';
import { AGENT, HUMAN, T0, T1, message, sampleThread } from '../model/threadFixtures';
import { canvasProject, editorFor, installFakeCanvas } from './harness';

// The conversation pins in CanvasController (CM4, decision 24): hidden by default, in the usual
// frame, recomputing nothing on pan and zoom.
describe('CanvasController: pinos das conversas', () => {
  const frames: FrameRequestCallback[] = [];
  let rafCalls = 0;
  const flush = () => {
    while (frames.length > 0) for (const frame of frames.splice(0)) frame(0);
  };

  beforeAll(() => {
    installFakeCanvas();
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      rafCalls++;
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
    textMeasurer.value = approximateMeasurer;
    localStorage.clear();
  });

  const OPEN: Thread = sampleThread({
    id: 't1',
    anchor: { kind: 'marking', id: 'M1' },
    messages: [message('a', T0, HUMAN, 'oi'), message('b', T1, AGENT, 'ok')],
  });

  function setup(threads: readonly Thread[] = [OPEN]) {
    const base = editorFor(canvasProject());
    const derived = createEditorDerived(base.store, base.ui, undefined, undefined, {
      threads: signal(threads),
      copyId: null,
      identity: signal(null),
    });
    const container = document.createElement('div');
    Object.defineProperty(container, 'clientWidth', { value: 1200 });
    Object.defineProperty(container, 'clientHeight', { value: 900 });
    document.body.append(container);
    const controller = new CanvasController({
      container,
      display: createDisplayImages<ImageBitmap>(() => new Promise(() => undefined)),
      ...base,
      derived,
    });
    flush();
    const internals = controller as unknown as {
      pinLayer: CommentPinRenderer;
      frame: { peek(): { pins: readonly unknown[]; draftPin: unknown } };
    };
    return { ...base, derived, controller, internals, container };
  }

  it('they start hidden and appear through the Conversations button', () => {
    const { controller, ui, internals } = setup();
    expect(internals.pinLayer.size).toBe(0);
    ui.commentPins.value = true;
    flush();
    expect(internals.pinLayer.size).toBe(1);
    ui.commentPins.value = false;
    flush();
    expect(internals.pinLayer.size).toBe(0);
    controller.destroy();
  });

  it('the pin sits at the top right corner of the marking, with the state label', () => {
    const { controller, ui, internals } = setup();
    ui.commentPins.value = true;
    flush();
    const node = internals.pinLayer.node('marking:M1');
    // M1 is at (100,100,600,500): the top right corner is (700, 100).
    expect(node?.group.x()).toBeCloseTo(700);
    expect(node?.label.text()).toBe('MA 2');
    // Awaiting human: the last message is from the agent.
    expect(node?.box.fill()).toBe('#ffb020');
    controller.destroy();
  });

  it('the selected conversation shows only its own pin, even with the pins turned off', () => {
    const other = sampleThread({ id: 't2', anchor: { kind: 'marking', id: 'M2' } });
    const { controller, ui, internals } = setup([OPEN, other]);
    ui.thread.value = { id: 't2', selection: ui.selection.peek() };
    flush();
    expect(internals.pinLayer.size).toBe(1);
    expect(internals.pinLayer.node('marking:M2')).toBeDefined();
    controller.destroy();
  });

  it('they disappear in view mode', () => {
    const { controller, ui, internals } = setup();
    ui.commentPins.value = true;
    flush();
    setViewMode(ui, true);
    flush();
    expect(internals.pinLayer.size).toBe(0);
    setViewMode(ui, false);
    flush();
    expect(internals.pinLayer.size).toBe(1);
    controller.destroy();
  });

  it('the draft at a point shows the dashed pin and nothing besides it', () => {
    const { controller, ui, store, internals } = setup([]);
    const project = store.project.peek()!;
    startComposing(ui, project, { kind: 'point', containerId: 'I1', x: 50, y: 60 });
    flush();
    const node = internals.pinLayer.node('draft');
    expect(node).toBeDefined();
    expect(node?.box.dash()).not.toEqual([]);
    controller.destroy();
  });

  it('pan and zoom do not recompute the groups and do not ask for a second frame', () => {
    const { controller, ui, derived, internals } = setup();
    ui.commentPins.value = true;
    flush();
    const groups = derived.threads.pins.value;
    const pins = internals.frame.peek().pins;
    rafCalls = 0;
    controller.zoomBy(2);
    expect(rafCalls).toBe(1);
    flush();
    expect(derived.threads.pins.value).toBe(groups);
    expect(internals.frame.peek().pins).toBe(pins);
    controller.destroy();
  });

  it('turning on the pins asks for a single frame', () => {
    const { controller, ui } = setup();
    rafCalls = 0;
    ui.commentPins.value = true;
    expect(rafCalls).toBe(1);
    flush();
    controller.destroy();
  });

  it('each pin has a glyph of the most urgent state, in cv-pin-text; the draft has none', () => {
    const { controller, ui, store, internals } = setup();
    ui.commentPins.value = true;
    flush();
    const node = internals.pinLayer.node('marking:M1');
    const glyphs = node?.glyph.getChildren() ?? [];
    // Awaiting human (the last message is from the agent): the person.
    const drawn = glyphs
      .filter((g) => g.visible())
      .map((g) => (g as unknown as { data(): string }).data());
    expect(drawn).toEqual([...THREAD_STATE_GLYPHS.awaitingHuman]);
    expect((glyphs[0] as unknown as { stroke(): string }).stroke()).toBe('#0b1220');
    startComposing(ui, store.project.peek()!, {
      kind: 'point',
      containerId: 'I1',
      x: 50,
      y: 60,
    });
    flush();
    expect(internals.pinLayer.node('draft')?.glyph.visible()).toBe(false);
    controller.destroy();
  });

  it('data-pin-states brings the states in drawing order, one per item of data-pins', () => {
    const agentLast: Thread = sampleThread({
      id: 't2',
      anchor: { kind: 'marking', id: 'M2' },
      messages: [message('c', T0, HUMAN, 'oi')],
    });
    const resolved: Thread = sampleThread({
      id: 't3',
      anchor: { kind: 'container', id: 'I1' },
      resolved: { by: { name: 'Marina Alves', email: 'marina@exemplo.com' }, at: T1 },
      messages: [message('d', T0, HUMAN, 'ok')],
    });
    const { controller, ui, internals, container } = setup([OPEN, agentLast, resolved]);
    expect(container.dataset.pinStates).toBe('');
    ui.commentPins.value = true;
    flush();
    const states = (container.dataset.pinStates ?? '').split(',');
    expect(states).toHaveLength(Number(container.dataset.pins));
    expect(states).toContain('awaitingHuman');
    expect(states).toContain('awaitingAgent');
    expect(internals.pinLayer.states).toEqual(states);
    controller.destroy();
  });
});

import { signal } from '@preact/signals';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { CanvasController } from '../../src/canvas/CanvasController';
import type { CommentPinRenderer } from '../../src/canvas/renderers/commentPins';
import { approximateMeasurer, type Thread } from '../../src/model';
import { createDisplayImages } from '../../src/store/displayImages';
import { createEditorDerived } from '../../src/store/derived';
import { textMeasurer } from '../../src/store/textMeasure';
import { startComposing } from '../../src/store/threadUi';
import { setViewMode } from '../../src/store/ui';
import { AGENT, HUMAN, T0, T1, message, sampleThread } from '../model/threadFixtures';
import { canvasProject, editorFor, installFakeCanvas } from './harness';

// Os pinos das conversas no CanvasController (CM4, decisão 24): escondidos por padrão, no quadro de
// sempre, sem recalcular nada com pan e zoom.
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
    return { ...base, derived, controller, internals };
  }

  it('nascem escondidos e aparecem pelo botão Conversas', () => {
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

  it('o pino fica no canto de cima à direita da marcação, com o rótulo do estado', () => {
    const { controller, ui, internals } = setup();
    ui.commentPins.value = true;
    flush();
    const node = internals.pinLayer.node('marking:M1');
    // M1 está em (100,100,600,500): o canto de cima à direita é (700, 100).
    expect(node?.group.x()).toBeCloseTo(700);
    expect(node?.label.text()).toBe('MA 2');
    // Aguardando humano: a última mensagem é do agente.
    expect(node?.box.fill()).toBe('#ffb020');
    controller.destroy();
  });

  it('a conversa selecionada mostra só o próprio pino, mesmo com os pinos desligados', () => {
    const other = sampleThread({ id: 't2', anchor: { kind: 'marking', id: 'M2' } });
    const { controller, ui, internals } = setup([OPEN, other]);
    ui.thread.value = { id: 't2', selection: ui.selection.peek() };
    flush();
    expect(internals.pinLayer.size).toBe(1);
    expect(internals.pinLayer.node('marking:M2')).toBeDefined();
    controller.destroy();
  });

  it('somem no modo visualização', () => {
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

  it('o rascunho num ponto mostra o pino tracejado e nada além dele', () => {
    const { controller, ui, store, internals } = setup([]);
    const project = store.project.peek()!;
    startComposing(ui, project, { kind: 'point', containerId: 'I1', x: 50, y: 60 });
    flush();
    const node = internals.pinLayer.node('draft');
    expect(node).toBeDefined();
    expect(node?.box.dash()).not.toEqual([]);
    controller.destroy();
  });

  it('pan e zoom não recalculam os grupos e não pedem um segundo quadro', () => {
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

  it('ligar os pinos pede um quadro só', () => {
    const { controller, ui } = setup();
    rafCalls = 0;
    ui.commentPins.value = true;
    expect(rafCalls).toBe(1);
    flush();
    controller.destroy();
  });
});

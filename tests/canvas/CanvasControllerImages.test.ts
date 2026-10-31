import { signal } from '@preact/signals';
import type Konva from 'konva/lib/Core';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { CanvasController } from '../../src/canvas/CanvasController';
import type {
  ComponentLayerRenderer,
  LayerDrawing,
} from '../../src/canvas/components/componentLayer';
import type { RemoteImageView } from '../../src/canvas/components/imageLoader';
import type { RemoteImageSource } from '../../src/canvas/components/remoteImages';
import { createDisplayImages } from '../../src/store/displayImages';
import { type FrameNode, baseNode } from '../../src/model/components/scene';
import { componentEditor, installFakeCanvas } from './harness';

// Imagens remotas dentro do `CanvasController` (RI3): a imagem que termina pede um quadro, várias
// no mesmo quadro desenham uma vez, e o consentimento que muda refaz as marcações com imagem.
describe('CanvasController: imagens remotas', () => {
  const frames: FrameRequestCallback[] = [];
  const flush = () => {
    while (frames.length > 0) for (const frame of frames.splice(0)) frame(0);
  };
  const A = 'https://cdn.exemplo.com/a.png';
  const B = 'https://cdn.exemplo.com/b.png';
  const C = 'https://cdn.exemplo.com/c.png';

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

  /** Desenho de uma marcação com a imagem remota `url` (o nó `image` do componente). */
  function imageDrawing(markingId: string, url: string): LayerDrawing {
    const avatar = {
      ...baseNode({ id: `${markingId}-img`, name: 'img', width: 40, height: 40 }),
      type: 'rect' as const,
      cornerRadius: 0,
      fills: [{ type: 'image' as const, url }],
    };
    const root: FrameNode = {
      ...baseNode({ id: markingId, name: markingId, width: 100, height: 40 }),
      type: 'frame',
      clip: false,
      cornerRadius: 0,
      fills: [],
      children: [avatar],
    };
    return { markingId, containerId: 'B1', root };
  }

  function setup() {
    const states = new Map<string, RemoteImageView>();
    let listener: ((url: string) => void) | null = null;
    const gate = signal<unknown>({});
    const resolve = vi.fn(
      (url: string): RemoteImageView => states.get(url) ?? { state: 'loading' },
    );
    const remoteImages: RemoteImageSource = {
      resolve,
      subscribe: (l) => {
        listener = l;
        return () => {
          listener = null;
        };
      },
      gate,
      epoch: signal(0),
    };
    const editor = componentEditor();
    const container = document.createElement('div');
    Object.defineProperty(container, 'clientWidth', { value: 380 });
    Object.defineProperty(container, 'clientHeight', { value: 700 });
    document.body.append(container);
    const display = createDisplayImages<ImageBitmap>(() => new Promise(() => undefined));
    const controller = new CanvasController({
      container,
      display,
      ...editor,
      remoteImages,
    });
    const internals = controller as unknown as {
      stage: Konva.Stage;
      componentLayer: ComponentLayerRenderer;
      placements: ReadonlyMap<string, { x: number; y: number; scale: number }>;
    };
    flush();
    // Monta direto na camada três marcações com imagem (o catálogo de teste não tem componente
    // com imagem); nenhum quadro as desmonta enquanto o projeto não muda.
    internals.componentLayer.render(
      new Map([
        ['m1', imageDrawing('m1', A)],
        ['m2', imageDrawing('m2', B)],
        ['m3', imageDrawing('m3', C)],
      ]),
      () => true,
      internals.placements as never,
    );
    const imagesOf = (id: string) =>
      (
        internals.stage.find((n: Konva.Node) => n.getAttr('markingId') === id)[0] as
          Konva.Group | undefined
      )?.findOne('Image');
    // A camada pediu cada imagem à fonte do controller ao montar as marcações.
    const initialCalls = resolve.mock.calls.map(([u]) => u);
    resolve.mockClear();
    flush();
    return {
      initialCalls,
      controller,
      internals,
      resolve,
      states,
      gate,
      imagesOf,
      emit: (url: string) => listener?.(url),
      hasListener: () => listener !== null,
    };
  }

  it('o canvas pede cada imagem à fonte ao desenhar a marcação, e o quadro seguinte não repete', () => {
    const { controller, resolve, initialCalls } = setup();
    expect(initialCalls).toEqual([A, B, C]);
    // O quadro não refaz marcações montadas sem motivo.
    expect(resolve).not.toHaveBeenCalled();
    controller.destroy();
  });

  it('imagem que carrega refaz só a marcação dela e pede um quadro', () => {
    const { controller, internals, resolve, states, emit, imagesOf } = setup();
    const draw = vi.spyOn(internals.stage, 'batchDraw');
    expect(imagesOf('m1')).toBeUndefined();
    states.set(A, {
      state: 'loaded',
      image: { width: 8, height: 8 } as never,
      width: 8,
      height: 8,
    });
    emit(A);
    // Nada é desenhado antes do quadro; o desenho vem no quadro seguinte.
    expect(draw).not.toHaveBeenCalled();
    expect(frames).toHaveLength(1);
    flush();
    expect(resolve.mock.calls.map(([u]) => u)).toEqual([A]);
    expect(imagesOf('m1')).toBeDefined();
    expect(imagesOf('m2')).toBeUndefined();
    expect(draw).toHaveBeenCalledTimes(1);
    controller.destroy();
  });

  it('várias imagens no mesmo quadro geram um desenho só', () => {
    const { controller, internals, resolve, states, emit, imagesOf } = setup();
    const draw = vi.spyOn(internals.stage, 'batchDraw');
    const refresh = vi.spyOn(internals.componentLayer, 'refreshImages');
    for (const url of [A, B, C]) {
      states.set(url, {
        state: 'loaded',
        image: { width: 8, height: 8 } as never,
        width: 8,
        height: 8,
      });
    }
    emit(A);
    emit(B);
    emit(C);
    emit(A);
    expect(frames).toHaveLength(1);
    flush();
    expect(draw).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(refresh.mock.calls[0]?.[0]).toEqual(new Set([A, B, C]));
    expect(resolve).toHaveBeenCalledTimes(3);
    for (const id of ['m1', 'm2', 'm3']) expect(imagesOf(id)).toBeDefined();
    controller.destroy();
  });

  it('o consentimento ou um interruptor que muda refaz todas as marcações com imagem', () => {
    const { controller, internals, resolve, gate } = setup();
    const refresh = vi.spyOn(internals.componentLayer, 'refreshImages');
    gate.value = {};
    flush();
    expect(refresh).toHaveBeenCalledWith(null);
    expect(resolve.mock.calls.map(([u]) => u).sort()).toEqual([A, B, C]);
    controller.destroy();
  });

  it('um quadro sem mudança de imagem não refaz nada', () => {
    const { controller, internals, resolve } = setup();
    const refresh = vi.spyOn(internals.componentLayer, 'refreshImages');
    internals.stage.batchDraw();
    (controller as unknown as { requestRender(): void }).requestRender();
    flush();
    expect(refresh).not.toHaveBeenCalled();
    expect(resolve).not.toHaveBeenCalled();
    controller.destroy();
  });

  it('destruir o canvas cancela a assinatura e ignora aviso tardio', () => {
    const { controller, hasListener, emit } = setup();
    expect(hasListener()).toBe(true);
    controller.destroy();
    expect(hasListener()).toBe(false);
    frames.length = 0;
    emit(A);
    expect(frames).toHaveLength(0);
  });
});

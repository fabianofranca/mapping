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

// Remote images inside `CanvasController` (RI3): the image that finishes asks for a frame, several
// in the same frame draw once, and the consent that changes redraws the markings with an image.
describe('CanvasController: remote images', () => {
  const frames: FrameRequestCallback[] = [];
  const flush = () => {
    while (frames.length > 0) for (const frame of frames.splice(0)) frame(0);
  };
  const A = 'https://cdn.example.com/a.png';
  const B = 'https://cdn.example.com/b.png';
  const C = 'https://cdn.example.com/c.png';

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

  /** Drawing of a marking with the remote image `url` (the `image` node of the component). */
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
    // Mounts directly on the layer three markings with an image (the test catalog has no component
    // with an image); no frame unmounts them while the project does not change.
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
    // The layer asked for each image from the controller source when mounting the markings.
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

  it('the canvas asks for each image from the source when drawing the marking, and the next frame does not repeat', () => {
    const { controller, resolve, initialCalls } = setup();
    expect(initialCalls).toEqual([A, B, C]);
    // The frame does not redo mounted markings for no reason.
    expect(resolve).not.toHaveBeenCalled();
    controller.destroy();
  });

  it('an image that loads redraws only its marking and asks for a frame', () => {
    const { controller, internals, resolve, states, emit, imagesOf } = setup();
    // The frame redraws only the dirty layers: the components one is what the remote images touch
    // (counts its draws, not the requests: Konva groups the requests into one draw per frame).
    const componentsLayer = internals.stage.getLayers()[1];
    if (!componentsLayer) throw new Error('components layer');
    const draw = vi.spyOn(componentsLayer, 'drawScene');
    expect(imagesOf('m1')).toBeUndefined();
    states.set(A, {
      state: 'loaded',
      image: { width: 8, height: 8 } as never,
      width: 8,
      height: 8,
    });
    emit(A);
    // Nothing is drawn before the frame; the drawing comes in the next frame.
    expect(draw).not.toHaveBeenCalled();
    expect(frames).toHaveLength(1);
    flush();
    expect(resolve.mock.calls.map(([u]) => u)).toEqual([A]);
    expect(imagesOf('m1')).toBeDefined();
    expect(imagesOf('m2')).toBeUndefined();
    expect(draw).toHaveBeenCalledTimes(1);
    controller.destroy();
  });

  it('several images in the same frame generate a single draw', () => {
    const { controller, internals, resolve, states, emit, imagesOf } = setup();
    // The frame redraws only the dirty layers: the components one is what the remote images touch
    // (counts its draws, not the requests: Konva groups the requests into one draw per frame).
    const componentsLayer = internals.stage.getLayers()[1];
    if (!componentsLayer) throw new Error('components layer');
    const draw = vi.spyOn(componentsLayer, 'drawScene');
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

  it('the consent or a switch that changes redraws all the markings with an image', () => {
    const { controller, internals, resolve, gate } = setup();
    const refresh = vi.spyOn(internals.componentLayer, 'refreshImages');
    gate.value = {};
    flush();
    expect(refresh).toHaveBeenCalledWith(null);
    expect(resolve.mock.calls.map(([u]) => u).sort()).toEqual([A, B, C]);
    controller.destroy();
  });

  it('a frame without an image change redoes nothing', () => {
    const { controller, internals, resolve } = setup();
    const refresh = vi.spyOn(internals.componentLayer, 'refreshImages');
    internals.stage.batchDraw();
    (controller as unknown as { requestRender(): void }).requestRender();
    flush();
    expect(refresh).not.toHaveBeenCalled();
    expect(resolve).not.toHaveBeenCalled();
    controller.destroy();
  });

  it('destroying the canvas cancels the subscription and ignores a late notice', () => {
    const { controller, hasListener, emit } = setup();
    expect(hasListener()).toBe(true);
    controller.destroy();
    expect(hasListener()).toBe(false);
    frames.length = 0;
    emit(A);
    expect(frames).toHaveLength(0);
  });
});

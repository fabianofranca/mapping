import { signal } from '@preact/signals';
import type Konva from 'konva/lib/Core';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { CanvasController } from '../../src/canvas/CanvasController';
import type {
  ComponentLayerRenderer,
  LayerDrawing,
} from '../../src/canvas/components/componentLayer';
import type { RemoteImageSource } from '../../src/canvas/components/remoteImages';
import { packageImageKey } from '../../src/model/components/imagePath';
import { createDisplayImages } from '../../src/store/displayImages';
import type { PackageImages, PackageImageView } from '../../src/storage/packageImages';
import { type FrameNode, baseNode } from '../../src/model/components/scene';
import { componentEditor, installFakeCanvas } from './harness';

// Package images inside `CanvasController` (DX5, decision 18): the image that finishes decoding asks
// for a frame, several in the same frame redraw once, and only the markings that cite the image are
// redone. The images come from the library the app hands over, never from the remote source.
describe('CanvasController: package images', () => {
  const frames: FrameRequestCallback[] = [];
  const flush = () => {
    while (frames.length > 0) for (const frame of frames.splice(0)) frame(0);
  };
  const LOGO = 'images/logo.png';
  const PHOTO = 'images/photo.jpg';

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

  function imageDrawing(markingId: string, asset: string): LayerDrawing {
    const logo = {
      ...baseNode({ id: `${markingId}-img`, name: 'img', width: 40, height: 40 }),
      type: 'rect' as const,
      cornerRadius: 0,
      fills: [{ type: 'image' as const, asset }],
    };
    const root: FrameNode = {
      ...baseNode({ id: markingId, name: markingId, width: 100, height: 40 }),
      type: 'frame',
      clip: false,
      cornerRadius: 0,
      fills: [],
      children: [logo],
    };
    return { markingId, containerId: 'B1', root, specId: 'lib' };
  }

  function setup() {
    const states = new Map<string, PackageImageView>();
    let listener: ((key: string) => void) | null = null;
    const resolve = vi.fn(
      (spec: string, asset: string): PackageImageView =>
        states.get(packageImageKey(spec, asset)) ?? { state: 'loading' },
    );
    const packageImages: PackageImages = {
      resolve,
      subscribe: (l) => {
        listener = l;
        return () => {
          listener = null;
        };
      },
      drop: () => undefined,
      clear: () => undefined,
      size: 0,
      bytes: 0,
    };
    // The remote source must stay untouched: a package image has no consent and is not listed
    // in Diagnostics › Remote images.
    const remoteResolve = vi.fn(() => ({ state: 'invalid' as const }));
    const remoteImages: RemoteImageSource = {
      resolve: remoteResolve,
      subscribe: () => () => undefined,
      gate: signal<unknown>({}),
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
      packageImages,
      remoteImages,
    });
    const internals = controller as unknown as {
      stage: Konva.Stage;
      componentLayer: ComponentLayerRenderer;
      placements: ReadonlyMap<string, { x: number; y: number; scale: number }>;
    };
    flush();
    internals.componentLayer.render(
      new Map([
        ['m1', imageDrawing('m1', LOGO)],
        ['m2', imageDrawing('m2', PHOTO)],
        ['m3', imageDrawing('m3', LOGO)],
      ]),
      () => true,
      internals.placements as never,
    );
    const imagesOf = (id: string) =>
      (
        internals.stage.find((n: Konva.Node) => n.getAttr('markingId') === id)[0] as
          Konva.Group | undefined
      )?.findOne('Image');
    const initialCalls = resolve.mock.calls.map(([spec, asset]) => `${spec}:${asset}`);
    resolve.mockClear();
    flush();
    const ready = (asset: string): void => {
      states.set(packageImageKey('lib', asset), {
        state: 'ready',
        image: { width: 8, height: 8 } as unknown as ImageBitmap,
        width: 8,
        height: 8,
      });
    };
    return {
      initialCalls,
      controller,
      internals,
      resolve,
      remoteResolve,
      ready,
      imagesOf,
      emit: (asset: string) => listener?.(packageImageKey('lib', asset)),
      hasListener: () => listener !== null,
    };
  }

  it('asks the library for each image (specId, asset) when drawing, and the next frame does not repeat', () => {
    const { controller, resolve, remoteResolve, initialCalls } = setup();
    expect(initialCalls).toEqual([
      'lib:images/logo.png',
      'lib:images/photo.jpg',
      'lib:images/logo.png',
    ]);
    expect(resolve).not.toHaveBeenCalled();
    expect(remoteResolve).not.toHaveBeenCalled();
    controller.destroy();
  });

  it('an image that finishes decoding redraws only the markings that cite it, in a single frame', () => {
    const { controller, internals, resolve, ready, emit, imagesOf } = setup();
    const componentsLayer = internals.stage.getLayers()[1];
    if (!componentsLayer) throw new Error('components layer');
    const draw = vi.spyOn(componentsLayer, 'drawScene');
    const refresh = vi.spyOn(internals.componentLayer, 'refreshPackageImages');
    expect(imagesOf('m1')).toBeUndefined();
    ready(LOGO);
    emit(LOGO);
    emit(LOGO);
    // Nothing is drawn before the frame, and the two notices ask for one frame.
    expect(draw).not.toHaveBeenCalled();
    expect(frames).toHaveLength(1);
    flush();
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(refresh.mock.calls[0]?.[0]).toEqual(new Set([packageImageKey('lib', LOGO)]));
    expect(resolve).toHaveBeenCalledTimes(2);
    expect(imagesOf('m1')).toBeDefined();
    expect(imagesOf('m3')).toBeDefined();
    expect(imagesOf('m2')).toBeUndefined();
    expect(draw).toHaveBeenCalledTimes(1);
    controller.destroy();
  });

  it('a frame without a package image change redoes nothing', () => {
    const { controller, internals, resolve } = setup();
    const refresh = vi.spyOn(internals.componentLayer, 'refreshPackageImages');
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
    emit(LOGO);
    expect(frames).toHaveLength(0);
  });
});

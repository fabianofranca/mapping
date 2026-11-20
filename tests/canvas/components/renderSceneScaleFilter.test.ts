// FG5: `scale` and `filter.grayscale` in the Konva drawing. The scale reaches the group (around the
// box center), scale 0 hides it, and a grayscale image gets a Konva filter plus a cache, only when
// the pixels can be read back.
import Konva from 'konva';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { installFakeCanvas } from '../harness';
import { renderScene } from '../../../src/canvas/components/renderScene';
import type { RemoteImageView } from '../../../src/canvas/components/imageLoader';
import {
  baseNode,
  translate,
  type Scene,
  type SceneNode,
} from '../../../src/model/components/scene';

beforeAll(() => installFakeCanvas());

const URL = 'https://cdn.example.com/a.png';

function scene(root: SceneNode): Scene {
  return { root, warnings: [] };
}

function rect(extra: Partial<SceneNode> = {}, fills: object[] = []): SceneNode {
  return {
    ...baseNode({
      id: 'box',
      name: 'box',
      width: 40,
      height: 40,
      transform: translate(30, 30),
    }),
    type: 'rect',
    cornerRadius: 0,
    fills: fills as never,
    ...extra,
  } as SceneNode;
}

const view = (state: 'loaded' | 'opaque'): RemoteImageView => ({
  state,
  image: { width: 200, height: 100 } as unknown as CanvasImageSource,
  width: 200,
  height: 100,
});

function imageOf(result: ReturnType<typeof renderScene>): Konva.Image {
  return result.byId.get('box')?.getChildren()[0] as Konva.Image;
}

describe('FG5: scale in the Konva group', () => {
  it('the node scale reaches scaleX/scaleY and the box center stays put', () => {
    const plain = renderScene(scene(rect())).byId.get('box')!;
    const scaled = renderScene(scene(rect({ scale: 0.5 }))).byId.get('box')!;
    expect(plain.scaleX()).toBe(1);
    expect(scaled.scaleX()).toBeCloseTo(0.5, 10);
    expect(scaled.scaleY()).toBeCloseTo(0.5, 10);
    expect(scaled.rotation()).toBeCloseTo(0, 10);
    // Center (20, 20) of the box: position moves by (1 - scale) * center.
    expect(scaled.x()).toBeCloseTo(plain.x() + (1 - 0.5) * 20, 10);
    expect(scaled.y()).toBeCloseTo(plain.y() + (1 - 0.5) * 20, 10);
    expect(scaled.visible()).toBe(true);
  });

  it('scale 0 makes the group invisible', () => {
    const group = renderScene(scene(rect({ scale: 0 }))).byId.get('box')!;
    expect(group.visible()).toBe(false);
    const shown = renderScene(scene(rect({ scale: 0.5 }))).byId.get('box')!;
    expect(shown.visible()).toBe(true);
  });
});

describe('FG5: grayscale on a remote image fill', () => {
  const image = (extra: object = {}) => [{ type: 'image', url: URL, ...extra }];

  it('a loaded image with grayscale gets one filter and is cached; without it, neither', () => {
    const gray = renderScene(scene(rect({}, image({ grayscale: 1 }))), {
      remoteImage: () => view('loaded'),
    });
    expect(imageOf(gray)).toBeInstanceOf(Konva.Image);
    expect(imageOf(gray).filters()).toHaveLength(1);
    expect(imageOf(gray).isCached()).toBe(true);

    const color = renderScene(scene(rect({}, image())), {
      remoteImage: () => view('loaded'),
    });
    expect(imageOf(color)).toBeInstanceOf(Konva.Image);
    expect(imageOf(color).filters() ?? []).toHaveLength(0);
    expect(imageOf(color).isCached()).toBe(false);
  });

  it('an opaque image with grayscale is drawn in color: no filter, no cache, no throw', () => {
    let result: ReturnType<typeof renderScene> | undefined;
    expect(() => {
      result = renderScene(scene(rect({}, image({ grayscale: 1 }))), {
        remoteImage: () => view('opaque'),
        pixelSafe: false,
      });
    }).not.toThrow();
    const drawn = imageOf(result!);
    expect(drawn).toBeInstanceOf(Konva.Image);
    expect(drawn.filters() ?? []).toHaveLength(0);
    expect(drawn.isCached()).toBe(false);
  });
});

describe('FG5: grayscale on an embedded image used as the fill of an ellipse', () => {
  const DATA = 'data:image/png;base64,AAAA';
  const element = { naturalWidth: 2, naturalHeight: 1 } as unknown as HTMLImageElement;

  function ellipse(grayscale?: number): SceneNode {
    return {
      ...rect(),
      type: 'ellipse',
      fills: [
        { type: 'image', src: DATA, ...(grayscale === undefined ? {} : { grayscale }) },
      ],
    } as unknown as SceneNode;
  }

  /** A canvas whose pixels are one saturated red; records what was put back. */
  function fakeBitmap() {
    const pixels = new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 255, 255]);
    const put: Uint8ClampedArray[] = [];
    const bitmap = {
      width: 0,
      height: 0,
      getContext: () => ({
        drawImage: () => undefined,
        getImageData: () => ({ data: pixels }),
        putImageData: (image: { data: Uint8ClampedArray }) => put.push(image.data),
      }),
    };
    return { bitmap, put };
  }

  async function render(grayscale?: number) {
    const loader = await import('../../../src/canvas/components/imageLoader');
    const { bitmap, put } = fakeBitmap();
    const create = vi.spyOn(document, 'createElement');
    create.mockImplementation(((tag: string) =>
      tag === 'canvas'
        ? bitmap
        : Document.prototype.createElement.call(document, tag)) as never);
    vi.spyOn(loader, 'loadEmbeddedImage').mockImplementation((_src, handlers) => {
      handlers.onLoad(element);
      return element;
    });
    try {
      const result = renderScene(scene(ellipse(grayscale)));
      const shape = result.byId.get('box')!.getChildren()[0] as Konva.Shape;
      return { image: shape.fillPatternImage(), put, bitmap };
    } finally {
      vi.restoreAllMocks();
    }
  }

  it('with grayscale, the pattern is the source drawn into a canvas and turned gray', async () => {
    const { image, put, bitmap } = await render(1);
    expect(image).toBe(bitmap);
    expect(put).toHaveLength(1);
    const [r, g, b] = put[0]!;
    expect(r).toBe(g);
    expect(g).toBe(b);
  });

  it('without grayscale, the pattern is the source itself', async () => {
    const { image, put } = await render();
    expect(image).toBe(element);
    expect(put).toHaveLength(0);
  });
});

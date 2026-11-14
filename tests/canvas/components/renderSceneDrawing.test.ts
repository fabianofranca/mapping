// Drawing of components and images (stage #940, phase 3): embedded image follows `paint.fit`, the shadow
// of a transparent frame goes to the first child and the warnings carry code and parameters.
import Konva from 'konva';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { installFakeCanvas } from '../harness';
import { clearEmbeddedImages } from '../../../src/canvas/components/imageLoader';
import { renderScene } from '../../../src/canvas/components/renderScene';
import {
  type FrameNode,
  type Scene,
  type SceneNode,
  baseNode,
} from '../../../src/model/components/scene';

beforeAll(() => installFakeCanvas());

const scene = (root: SceneNode): Scene => ({ root, warnings: [] });

class FakeImage {
  static instances: FakeImage[] = [];
  naturalWidth = 80;
  naturalHeight = 40;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  src = '';
  constructor() {
    FakeImage.instances.push(this);
  }
}

let original: typeof Image;
beforeEach(() => {
  original = globalThis.Image;
  FakeImage.instances = [];
  globalThis.Image = FakeImage as unknown as typeof Image;
  clearEmbeddedImages();
});
afterEach(() => {
  globalThis.Image = original;
});

describe('embedded image (data:) follows paint.fit', () => {
  const SRC = 'data:image/png;base64,AAAA';
  const rect = (fit?: 'cover' | 'contain' | 'fill'): SceneNode => ({
    ...baseNode({ id: 'img', name: 'img', width: 40, height: 40 }),
    type: 'rect',
    cornerRadius: 0,
    fills: [{ type: 'image', src: SRC, ...(fit ? { fit } : {}) }],
  });
  const draw = (fit?: 'cover' | 'contain' | 'fill') => {
    let loaded = 0;
    const result = renderScene(scene(rect(fit)), { onImageLoaded: () => (loaded += 1) });
    FakeImage.instances[0]?.onload?.();
    const image = result.byId.get('img')?.getChildren()[0] as Konva.Image;
    return { image, loaded: () => loaded };
  };

  it('contain fits the whole source at the center (80×40 in a 40×40 box)', () => {
    const { image, loaded } = draw('contain');
    expect(image.image()).toBe(FakeImage.instances[0]);
    expect(image.width()).toBe(40);
    expect(image.height()).toBe(20);
    expect(image.y()).toBe(10);
    expect(image.crop()).toEqual({ x: 0, y: 0, width: 0, height: 0 });
    expect(loaded()).toBe(1);
  });

  it('the default is cover: crops the center of the source to cover the box', () => {
    const { image } = draw();
    expect(image.width()).toBe(40);
    expect(image.height()).toBe(40);
    expect(image.crop()).toEqual({ x: 20, y: 0, width: 40, height: 40 });
  });

  it('fill stretches; a second drawing of the same URL does not create another Image', () => {
    const { image } = draw('fill');
    expect(image.width()).toBe(40);
    expect(image.height()).toBe(40);
    renderScene(scene(rect('contain')));
    expect(FakeImage.instances).toHaveLength(1);
  });

  it('with the image already loaded, the drawing uses it at once and does not ask for another frame', () => {
    draw('contain');
    let loaded = 0;
    const again = renderScene(scene(rect('contain')), {
      onImageLoaded: () => (loaded += 1),
    });
    const image = again.byId.get('img')?.getChildren()[0] as Konva.Image;
    expect(image.image()).toBe(FakeImage.instances[0]);
    expect(image.height()).toBe(20);
    expect(loaded).toBe(0);
  });
});

describe('shadow on a frame without fill or stroke', () => {
  const shadow = { color: '#000000', offset: { x: 1, y: 2 }, blur: 3 };
  const frame = (children: SceneNode[]): FrameNode => ({
    ...baseNode({ id: 'f', name: 'f', width: 50, height: 50, effects: [shadow] }),
    type: 'frame',
    clip: false,
    cornerRadius: 0,
    children,
  });
  const child: SceneNode = {
    ...baseNode({ id: 'c', name: 'c', width: 10, height: 10 }),
    type: 'rect',
    cornerRadius: 0,
    fills: [{ type: 'solid', color: '#ff0000' }],
  };

  it('the shadow goes to the first child; the invisible clickable area does not own it', () => {
    const { byId } = renderScene(scene(frame([child])));
    const hit = byId.get('f')?.getChildren()[0] as Konva.Rect;
    expect(hit.fill()).toBe('transparent');
    expect(hit.shadowBlur()).toBe(0);
    const painted = byId.get('c')?.getChildren()[0] as Konva.Rect;
    expect(painted.shadowBlur()).toBe(3);
    expect(painted.shadowOffset()).toEqual({ x: 1, y: 2 });
  });

  it('with no child at all, warns that the shadow was ignored', () => {
    const { warnings } = renderScene(scene(frame([])));
    expect(warnings).toContainEqual({ code: 'empty-group-shadow' });
  });
});

describe('drawing warnings carry code and parameters', () => {
  it('unknown node carries the source type', () => {
    const node: SceneNode = {
      ...baseNode({ id: 'u', name: 'u', width: 20, height: 10 }),
      type: 'unknown',
      sourceType: 'STICKY',
    };
    expect(renderScene(scene(node)).warnings).toEqual([
      { code: 'unknown-node', params: { type: 'STICKY' } },
    ]);
  });

  it('inner shadow warns; several outer shadows no longer warn', () => {
    const node: SceneNode = {
      ...baseNode({
        id: 'r',
        name: 'r',
        width: 5,
        height: 5,
        effects: [
          { color: '#000', offset: { x: 0, y: 0 }, blur: 2, inner: true },
          { color: '#000', offset: { x: 1, y: 1 }, blur: 2 },
          { color: '#000', offset: { x: 2, y: 2 }, blur: 2 },
        ],
      }),
      type: 'rect',
      cornerRadius: 0,
      fills: [{ type: 'solid', color: '#f00' }],
    };
    const { warnings } = renderScene(scene(node));
    expect(warnings).toContainEqual({ code: 'inner-shadow' });
    expect(warnings).toEqual([{ code: 'inner-shadow' }]);
  });

  it('the same warning is not repeated', () => {
    const rect = (id: string): SceneNode => ({
      ...baseNode({ id, name: id, width: 5, height: 5 }),
      type: 'rect',
      cornerRadius: 0,
      fills: [{ type: 'image' }],
    });
    const root: FrameNode = {
      ...baseNode({ id: 'f', name: 'f', width: 20, height: 20 }),
      type: 'frame',
      clip: false,
      cornerRadius: 0,
      children: [rect('a'), rect('b')],
    };
    const { warnings } = renderScene(scene(root));
    expect(warnings).toEqual([{ code: 'image-without-pixels' }]);
  });
});

describe('slot and unknown node: opacity and color come from the palette', () => {
  it('slotOpacity and unknownFill from the palette', () => {
    const slot: SceneNode = {
      ...baseNode({ id: 's', name: 's', width: 20, height: 10 }),
      type: 'unknown',
      sourceType: 'slot',
    };
    const rect = renderScene(scene(slot), { palette: { slotOpacity: 0.3 } })
      .byId.get('s')
      ?.getChildren()[0] as Konva.Rect;
    expect(rect.opacity()).toBe(0.3);
  });
});

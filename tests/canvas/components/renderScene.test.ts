// The scene becomes Konva nodes with the expected structure, transformations and paints.
import Konva from 'konva';
import { beforeAll, describe, expect, it } from 'vitest';
import { installFakeCanvas } from '../harness';
import type { RemoteImageView } from '../../../src/canvas/components/imageLoader';
import {
  DEFAULT_PALETTE,
  decompose,
  fontStyle,
  imageFit,
  renderScene,
  sceneIdOf,
} from '../../../src/canvas/components/renderScene';
import {
  type FrameNode,
  type Scene,
  type SceneNode,
  type Shadow,
  baseNode,
  translate,
} from '../../../src/model/components/scene';

beforeAll(() => installFakeCanvas());

function scene(root: SceneNode): Scene {
  return { root, warnings: [] };
}

const card: FrameNode = {
  ...baseNode({
    id: 'card',
    name: 'Card',
    width: 200,
    height: 100,
    transform: translate(10, 20),
  }),
  type: 'frame',
  clip: true,
  cornerRadius: 8,
  fills: [{ type: 'solid', color: '#ffffff' }],
  stroke: { paints: [{ type: 'solid', color: '#1a63cc' }], width: 2, align: 'inside' },
  effects: [{ color: 'rgba(0,0,0,0.2)', offset: { x: 0, y: 4 }, blur: 8 }],
  children: [
    {
      ...baseNode({
        id: 'title',
        name: 'Title',
        width: 0,
        height: 20,
        transform: translate(100, 10),
      }),
      type: 'text',
      text: 'Hello',
      fills: [{ type: 'solid', color: '#111111' }],
      style: {
        fontFamily: 'Inter',
        fontSize: 16,
        fontWeight: 600,
        italic: false,
        align: 'center',
        verticalAlign: 'top',
      },
    },
    {
      ...baseNode({ id: 'avatar', name: 'Avatar', width: 40, height: 40 }),
      type: 'ellipse',
      fills: [
        {
          type: 'linear',
          start: { x: 0, y: 0 },
          end: { x: 40, y: 40 },
          stops: [
            { offset: 0, color: '#5b9bff' },
            { offset: 1, color: '#7e57c2' },
          ],
        },
      ],
    },
    {
      ...baseNode({ id: 'icon', name: 'Icon', width: 8, height: 16 }),
      type: 'path',
      d: 'M0 0L8 8L0 16',
      fillRule: 'evenodd',
      fills: [],
      stroke: {
        paints: [{ type: 'solid', color: '#ffffff' }],
        width: 2,
        align: 'center',
        cap: 'round',
      },
    },
    {
      ...baseNode({ id: 'photo', name: 'Photo', width: 56, height: 40 }),
      type: 'rect',
      cornerRadius: [4, 4, 0, 0],
      fills: [{ type: 'image' }],
    },
    {
      ...baseNode({ id: 'mystery', name: '?', width: 10, height: 10 }),
      type: 'unknown',
      sourceType: 'STICKY',
    },
    {
      ...baseNode({
        id: 'ghost',
        name: 'Hidden',
        width: 10,
        height: 10,
        visible: false,
        opacity: 0.5,
      }),
      type: 'rect',
      cornerRadius: 0,
      fills: [],
    },
  ],
};

describe('renderScene', () => {
  it('creates a Konva container per node, with the sceneId, the transform and the visibility', () => {
    const { root, byId } = renderScene(scene(card));
    expect(byId.size).toBe(7);
    expect(root.getAttr('sceneId')).toBe('card');
    expect(root.position()).toEqual({ x: 10, y: 20 });
    expect(byId.get('title')?.position()).toEqual({ x: 100, y: 10 });
    const ghost = byId.get('ghost');
    expect(ghost?.visible()).toBe(false);
    expect(ghost?.opacity()).toBe(0.5);
    expect(sceneIdOf(byId.get('avatar')?.getChildren()[0])).toBe('avatar');
  });

  it('draws the frame with background, inner stroke, shadow and rounded clip', () => {
    const { root } = renderScene(scene(card));
    const rects = root.getChildren((n) => n instanceof Konva.Rect) as Konva.Rect[];
    expect(rects).toHaveLength(2);
    const [fill, stroke] = rects;
    expect(fill?.fill()).toBe('#ffffff');
    expect(fill?.cornerRadius()).toBe(8);
    expect(fill?.shadowBlur()).toBe(8);
    expect(fill?.shadowOffset()).toEqual({ x: 0, y: 4 });
    // 2px stroke on the inside: the stroke rectangle shrinks 1px on each side.
    expect(stroke?.x()).toBe(1);
    expect(stroke?.width()).toBe(198);
    expect(stroke?.stroke()).toBe('#1a63cc');
    expect(stroke?.cornerRadius()).toBe(7);
    expect(root.clipFunc()).toBeTypeOf('function');
  });

  it('text with a font stack hands the stack to Konva, without surrounding quotes', () => {
    const stack = 'system-ui, "Segoe UI", Roboto, sans-serif';
    const withFamily = (family: string): FrameNode => ({
      ...card,
      children: card.children.map((c) =>
        c.type === 'text' ? { ...c, style: { ...c.style, fontFamily: family } } : c,
      ),
    });
    const familyOf = (family: string): string => {
      const { byId } = renderScene(scene(withFamily(family)));
      return (byId.get('title')?.getChildren()[0] as Konva.Text).fontFamily();
    };
    expect(familyOf(stack)).toBe(stack);
    expect(familyOf('Inter')).toBe('"Inter", sans-serif');
    expect(familyOf('system-ui')).toBe('system-ui');
  });

  it('text: wrap none, ellipsis and maxLines reach Konva', () => {
    const textOf = (style: Record<string, unknown>, height = 60): Konva.Text => {
      const root: FrameNode = {
        ...card,
        children: card.children.map((c) =>
          c.type === 'text'
            ? {
                ...c,
                width: 40,
                height,
                text: 'aaaa bbbb cccc dddd eeee',
                style: { ...c.style, align: 'left', verticalAlign: 'middle', ...style },
              }
            : c,
        ),
      };
      const { byId } = renderScene(scene(root));
      return byId.get('title')?.getChildren()[0] as Konva.Text;
    };
    expect(textOf({}).wrap()).toBe('word');
    expect(textOf({}).ellipsis()).toBe(false);
    const single = textOf({ wrap: 'none', ellipsis: true });
    expect(single.wrap()).toBe('none');
    expect(single.ellipsis()).toBe(true);
    // maxLines: the Konva box shrinks to the allowed lines and is centered within the node's.
    const two = textOf({ maxLines: 2, ellipsis: true, fontSize: 10, lineHeight: 12 });
    expect(two.height()).toBe(24);
    expect(two.y()).toBe(18);
  });

  it('centered text without width is anchored at x; gradient, path and image without pixels', () => {
    const { byId, warnings } = renderScene(scene(card));
    const text = byId.get('title')?.getChildren()[0] as Konva.Text;
    expect(text.fontStyle()).toBe('600');
    expect(text.align()).toBe('center');
    expect(text.offsetX()).toBeCloseTo(text.width() / 2);

    const avatar = byId.get('avatar')?.getChildren()[0] as Konva.Ellipse;
    expect(avatar.fillLinearGradientColorStops()).toEqual([0, '#5b9bff', 1, '#7e57c2']);
    expect(avatar.radiusX()).toBe(20);

    const icon = byId.get('icon')?.getChildren()[0] as Konva.Path;
    expect(icon.data()).toBe('M0 0L8 8L0 16');
    expect(icon.stroke()).toBe('#ffffff');
    expect(icon.lineCap()).toBe('round');
    expect(icon.fillEnabled()).toBe(false);

    const photo = byId.get('photo')?.getChildren() ?? [];
    expect(photo).toHaveLength(2);
    expect((photo[0] as Konva.Rect).cornerRadius()).toEqual([4, 4, 0, 0]);
    expect(warnings).toContainEqual({ code: 'image-without-pixels' });
    expect(warnings).toContainEqual({ code: 'unknown-node', params: { type: 'STICKY' } });
  });

  it('a group with a shadow passes the shadow to the first descendant shape', () => {
    const group: SceneNode = {
      ...baseNode({
        id: 'g',
        name: 'g',
        effects: [{ color: '#000', offset: { x: 1, y: 2 }, blur: 3 }],
      }),
      type: 'group',
      children: [
        {
          ...baseNode({ id: 'r', name: 'r', width: 5, height: 5 }),
          type: 'rect',
          cornerRadius: 0,
          fills: [{ type: 'solid', color: '#f00' }],
        },
      ],
    };
    const { byId } = renderScene(scene(group));
    const rect = byId.get('r')?.getChildren()[0] as Konva.Rect;
    expect(rect.shadowBlur()).toBe(3);
    expect(rect.shadowOffset()).toEqual({ x: 1, y: 2 });
  });

  it('inner shadow is ignored with a warning', () => {
    const node: SceneNode = {
      ...baseNode({
        id: 'r',
        name: 'r',
        width: 5,
        height: 5,
        effects: [{ color: '#000', offset: { x: 0, y: 0 }, blur: 2, inner: true }],
      }),
      type: 'rect',
      cornerRadius: 0,
      fills: [{ type: 'solid', color: '#f00' }],
    };
    const { warnings, byId } = renderScene(scene(node));
    expect(warnings).toContainEqual({ code: 'inner-shadow' });
    expect((byId.get('r')?.getChildren()[0] as Konva.Rect).shadowEnabled()).toBe(true);
    expect((byId.get('r')?.getChildren()[0] as Konva.Rect).shadowBlur()).toBe(0);
  });

  describe('"only the first shadow" warning (extra-shadows)', () => {
    const sh = (extra: Partial<Shadow> = {}): Shadow => ({
      color: '#000',
      offset: { x: 0, y: 2 },
      blur: 4,
      ...extra,
    });
    const textNode = (effects: Shadow[]): SceneNode => ({
      ...baseNode({ id: 't', name: 't', width: 40, height: 12, effects }),
      type: 'text',
      text: 'Hello',
      fills: [{ type: 'solid', color: '#111111' }],
      style: {
        fontFamily: 'Inter',
        fontSize: 12,
        fontWeight: 400,
        italic: false,
        align: 'left',
        verticalAlign: 'top',
      },
    });
    const rectNode = (effects: Shadow[]): SceneNode => ({
      ...baseNode({ id: 'r', name: 'r', width: 5, height: 5, effects }),
      type: 'rect',
      cornerRadius: 0,
      fills: [{ type: 'solid', color: '#f00' }],
    });

    it('text with two outer shadows warns', () => {
      const { warnings } = renderScene(scene(textNode([sh(), sh({ blur: 8 })])));
      expect(warnings).toContainEqual({ code: 'extra-shadows' });
    });

    it('text with spread warns', () => {
      const { warnings } = renderScene(scene(textNode([sh({ spread: 2 })])));
      expect(warnings).toContainEqual({ code: 'extra-shadows' });
    });

    it('text with one shadow without spread, or just one outer and one inner, does not warn', () => {
      expect(renderScene(scene(textNode([sh()]))).warnings).toEqual([]);
      expect(renderScene(scene(textNode([sh(), sh({ inner: true })]))).warnings).toEqual([
        { code: 'inner-shadow' },
      ]);
    });

    it('rect with the list and the spread draws everything and does not warn', () => {
      const { warnings } = renderScene(scene(rectNode([sh(), sh({ spread: 2 })])));
      expect(warnings).toEqual([]);
    });
  });

  it('decomposes matrices with rotation and scale; fontStyle combines weight and italic', () => {
    const rotated = decompose([0, 1, -1, 0, 10, 20]);
    expect(rotated.rotation).toBeCloseTo(90);
    expect(rotated.x).toBe(10);
    expect(rotated.y).toBe(20);
    const scaled = decompose([2, 0, 0, 3, 0, 0]);
    expect(scaled.scaleX).toBe(2);
    expect(scaled.scaleY).toBe(3);
    expect(scaled.rotation).toBeCloseTo(0);
    expect(fontStyle(400, false)).toBe('normal');
    expect(fontStyle(700, false)).toBe('bold');
    expect(fontStyle(500, true)).toBe('italic 500');
  });

  it('rotation turns the container around the box center; children and clip go along', () => {
    const turned: FrameNode = {
      ...baseNode({
        id: 'turned',
        name: 'Turned',
        width: 40,
        height: 10,
        transform: translate(30, 45),
      }),
      type: 'frame',
      clip: true,
      cornerRadius: 0,
      rotation: 90,
      children: [
        {
          ...baseNode({ id: 'kid', name: 'Kid', width: 40, height: 10 }),
          type: 'rect',
          cornerRadius: 0,
          fills: [{ type: 'solid', color: '#ff0000' }],
        },
      ],
    };
    const { byId } = renderScene(scene(turned));
    const abs = byId.get('turned')!.getAbsoluteTransform();
    // 40×10 at 90° around the center (50, 50): the local corner (0, 0) goes to (55, 30)
    const corner = abs.point({ x: 0, y: 0 });
    expect(corner.x).toBeCloseTo(55, 6);
    expect(corner.y).toBeCloseTo(30, 6);
    // the child inherits the rotation: its opposite corner (40, 10) goes to (45, 70)
    const far = byId.get('kid')!.getAbsoluteTransform().point({ x: 40, y: 10 });
    expect(far.x).toBeCloseTo(45, 6);
    expect(far.y).toBeCloseTo(70, 6);
    // the unrotated node keeps only the translation
    const { byId: plain } = renderScene(scene({ ...turned, rotation: undefined }));
    expect(plain.get('turned')!.rotation()).toBeCloseTo(0, 9);
    expect(plain.get('turned')!.position()).toEqual({ x: 30, y: 45 });
  });

  it('the colors of the placeholder and of the unknown node come from the palette (lab default)', () => {
    const unknown: SceneNode = {
      ...baseNode({ id: 'u', name: 'u', width: 20, height: 10 }),
      type: 'unknown',
      sourceType: 'BLOB',
    };
    const strokeOf = (options?: Parameters<typeof renderScene>[1]) =>
      (
        renderScene(scene(unknown), options).byId.get('u')?.getChildren()[0] as Konva.Rect
      ).stroke();
    expect(strokeOf()).toBe(DEFAULT_PALETTE.unknownLine);
    expect(strokeOf({ palette: { unknownLine: '#123456' } })).toBe('#123456');

    const noPixels: SceneNode = {
      ...baseNode({ id: 'img', name: 'img', width: 20, height: 10 }),
      type: 'rect',
      cornerRadius: 0,
      fills: [{ type: 'image' }],
    };
    const { byId } = renderScene(scene(noPixels), {
      palette: { placeholderFill: '#aaaaaa', placeholderLine: '#bbbbbb' },
    });
    const [fill, cross] = byId.get('img')?.getChildren() ?? [];
    expect((fill as Konva.Rect).fill()).toBe('#aaaaaa');
    expect((cross as Konva.Line).stroke()).toBe('#bbbbbb');
  });
});

describe('slot (container placeholder)', () => {
  const slot: SceneNode = {
    ...baseNode({
      id: 's',
      name: 'slot',
      width: 50,
      height: 20,
      transform: translate(0, 0),
    }),
    type: 'unknown',
    sourceType: 'slot',
  };

  it('draws the dashed outline by default', () => {
    const rect = renderScene(scene(slot)).byId.get('s')?.getChildren()[0] as Konva.Rect;
    expect(rect.dash()).toEqual([3, 5]);
  });

  it('with showSlots: false it generates no shape, but the container exists', () => {
    const result = renderScene(scene(slot), { showSlots: false });
    expect(result.byId.get('s')?.getChildren()).toHaveLength(0);
    expect(result.warnings).toEqual([]);
  });
});

describe('remote and embedded image', () => {
  const rectWith = (fill: object): SceneNode => ({
    ...baseNode({ id: 'img', name: 'img', width: 40, height: 20 }),
    type: 'rect',
    cornerRadius: 0,
    fills: [fill as never],
  });

  /** Spies on the `Image` constructor: returns the URLs assigned to `src`. */
  function spyImage(): { sources: string[]; restore: () => void } {
    const original = globalThis.Image;
    const sources: string[] = [];
    class SpyImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      naturalWidth = 1;
      naturalHeight = 1;
      set src(value: string) {
        sources.push(value);
      }
    }
    globalThis.Image = SpyImage as unknown as typeof Image;
    return {
      sources,
      restore: () => {
        globalThis.Image = original;
      },
    };
  }

  it('the paint with a url draws the placeholder (gray shape and X), without Image and without a warning', () => {
    const spy = spyImage();
    try {
      const { byId, warnings } = renderScene(
        scene(
          rectWith({ type: 'image', fit: 'cover', url: 'https://cdn.example.com/a.png' }),
        ),
      );
      const [fill, cross] = byId.get('img')?.getChildren() ?? [];
      expect((fill as Konva.Rect).fill()).toBe(DEFAULT_PALETTE.placeholderFill);
      expect(cross).toBeInstanceOf(Konva.Line);
      expect(spy.sources).toEqual([]);
      expect(warnings).toEqual([]);
    } finally {
      spy.restore();
    }
  });

  it('src of another scheme becomes a placeholder and never creates an Image', () => {
    const spy = spyImage();
    try {
      for (const src of [
        'https://cdn.example.com/a.png',
        'http://x.com/a.png',
        'blob:x',
      ]) {
        const { byId } = renderScene(scene(rectWith({ type: 'image', src })));
        const children = byId.get('img')?.getChildren() ?? [];
        expect(children).toHaveLength(2);
        expect(children[1]).toBeInstanceOf(Konva.Line);
      }
      expect(spy.sources).toEqual([]);
    } finally {
      spy.restore();
    }
  });

  it('src data: keeps loading the embedded image', () => {
    const spy = spyImage();
    try {
      const src = 'data:image/png;base64,AAAA';
      const { byId } = renderScene(scene(rectWith({ type: 'image', src })));
      const children = byId.get('img')?.getChildren() ?? [];
      expect(children).toHaveLength(1);
      expect(children[0]).toBeInstanceOf(Konva.Image);
      expect(spy.sources).toEqual([src]);
    } finally {
      spy.restore();
    }
  });
});

describe('remote image resolved by the options function', () => {
  const URL = 'https://cdn.example.com/a.png';
  const fake = (width: number, height: number) =>
    ({ width, height }) as unknown as CanvasImageSource;
  const loaded = (width = 200, height = 100): RemoteImageView => ({
    state: 'loaded',
    image: fake(width, height),
    width,
    height,
  });
  const rectWith = (fill: object, cornerRadius = 0): SceneNode => ({
    ...baseNode({ id: 'img', name: 'img', width: 40, height: 40 }),
    type: 'rect',
    cornerRadius,
    fills: [fill as never],
  });
  const paint = (extra: object = {}) => ({ type: 'image', url: URL, ...extra });
  const imageOf = (result: ReturnType<typeof renderScene>) =>
    result.byId.get('img')?.getChildren()[0] as Konva.Image;
  const isPlaceholder = (result: ReturnType<typeof renderScene>) => {
    const children = result.byId.get('img')?.getChildren() ?? [];
    return children.length === 2 && children[1] instanceof Konva.Line;
  };

  it('loaded draws a KonvaImage and records the URL used', () => {
    const view = loaded();
    const result = renderScene(scene(rectWith(paint())), { remoteImage: () => view });
    expect(imageOf(result)).toBeInstanceOf(Konva.Image);
    expect(imageOf(result).image()).toBe(view.image);
    expect(result.imageUrls).toEqual([URL]);
    expect(result.warnings).toEqual([]);
  });

  it('asks the function for the image once per paint, with the field URL', () => {
    const calls: string[] = [];
    renderScene(scene(rectWith(paint())), {
      remoteImage: (url) => {
        calls.push(url);
        return 'loading';
      },
    });
    expect(calls).toEqual([URL]);
  });

  it('each state without pixels draws the placeholder, without a warning', () => {
    const states = [
      'loading',
      'failed',
      'too-large',
      'blocked-consent',
      'invalid',
    ] as const;
    for (const state of states) {
      const result = renderScene(scene(rectWith(paint())), {
        remoteImage: () => state,
      });
      expect(isPlaceholder(result), state).toBe(true);
      expect(result.warnings).toEqual([]);
      expect(result.imageUrls).toEqual([URL]);
    }
  });

  it('loaded without the image or with zero size falls back to the placeholder; so does a function that throws', () => {
    const noImage = renderScene(scene(rectWith(paint())), {
      remoteImage: () => ({ state: 'loaded' }),
    });
    expect(isPlaceholder(noImage)).toBe(true);
    const zero = renderScene(scene(rectWith(paint())), {
      remoteImage: () => loaded(0, 0),
    });
    expect(isPlaceholder(zero)).toBe(true);
    const throws = renderScene(scene(rectWith(paint())), {
      remoteImage: () => {
        throw new Error('x');
      },
    });
    expect(isPlaceholder(throws)).toBe(true);
  });

  it('without the function, placeholder; the URL is still registered so the layer knows', () => {
    const result = renderScene(scene(rectWith(paint())));
    expect(isPlaceholder(result)).toBe(true);
    expect(result.imageUrls).toEqual([URL]);
  });

  it('opaque shows on the main canvas and becomes a placeholder with pixelSafe', () => {
    const opaque: RemoteImageView = { ...loaded(), state: 'opaque' };
    const main = renderScene(scene(rectWith(paint())), {
      remoteImage: () => opaque,
      pixelSafe: false,
    });
    expect(imageOf(main)).toBeInstanceOf(Konva.Image);
    const safe = renderScene(scene(rectWith(paint())), {
      remoteImage: () => opaque,
      pixelSafe: true,
    });
    expect(isPlaceholder(safe)).toBe(true);
    const ofShapes = (r: ReturnType<typeof renderScene>) => r.root.find('Image').length;
    expect(ofShapes(safe)).toBe(0);
    // pixelSafe does not hide the image with CORS.
    const cors = renderScene(scene(rectWith(paint())), {
      remoteImage: () => loaded(),
      pixelSafe: true,
    });
    expect(imageOf(cors)).toBeInstanceOf(Konva.Image);
  });

  it('fit cover crops the center of the source to cover the box', () => {
    // Source 200×100 in a 40×40 box: scale 0.4, crop of 100×100 centered at x=50.
    const result = renderScene(scene(rectWith(paint({ fit: 'cover' }))), {
      remoteImage: () => loaded(200, 100),
    });
    const image = imageOf(result);
    expect(image.width()).toBe(40);
    expect(image.height()).toBe(40);
    expect(image.crop()).toEqual({ x: 50, y: 0, width: 100, height: 100 });
  });

  it('the fit is cover when absent', () => {
    const result = renderScene(scene(rectWith(paint())), {
      remoteImage: () => loaded(100, 200),
    });
    expect(imageOf(result).crop()).toEqual({ x: 0, y: 50, width: 100, height: 100 });
  });

  it('fit contain fits the whole source, centered', () => {
    const result = renderScene(scene(rectWith(paint({ fit: 'contain' }))), {
      remoteImage: () => loaded(200, 100),
    });
    const image = imageOf(result);
    expect([image.x(), image.y(), image.width(), image.height()]).toEqual([
      0, 10, 40, 20,
    ]);
    expect(image.cropWidth()).toBeFalsy();
  });

  it('fit fill stretches the image over the whole box', () => {
    const result = renderScene(scene(rectWith(paint({ fit: 'fill' }))), {
      remoteImage: () => loaded(200, 100),
    });
    const image = imageOf(result);
    expect([image.x(), image.y(), image.width(), image.height()]).toEqual([0, 0, 40, 40]);
  });

  it('respects cornerRadius and the paint opacity', () => {
    const result = renderScene(scene(rectWith(paint({ opacity: 0.5 }), 6)), {
      remoteImage: () => loaded(),
    });
    expect(imageOf(result).cornerRadius()).toBe(6);
    expect(imageOf(result).opacity()).toBe(0.5);
  });

  it('never creates an Image for the remote URL', () => {
    const original = globalThis.Image;
    let created = 0;
    globalThis.Image = class {
      constructor() {
        created += 1;
      }
    } as unknown as typeof Image;
    try {
      renderScene(scene(rectWith(paint())), { remoteImage: () => loaded() });
      renderScene(scene(rectWith(paint())), { remoteImage: () => 'loading' });
    } finally {
      globalThis.Image = original;
    }
    expect(created).toBe(0);
  });
});

describe('imageFit', () => {
  it('cover with a taller source crops top and bottom', () => {
    const fit = imageFit('cover', { width: 100, height: 50 }, { width: 50, height: 100 });
    expect(fit.crop).toEqual({ x: 0, y: 37.5, width: 50, height: 25 });
  });
});

describe('imageFit: new fits (format 4)', () => {
  const box = { width: 100, height: 50 };
  const source = { width: 40, height: 80 }; // known natural size

  it('fill-width takes the width and crops the excess height', () => {
    // scale 2.5: the source becomes 100 × 200; the box shows 50/2.5 = 20 of height, at the center
    const fit = imageFit('fill-width', box, source);
    expect(fit).toMatchObject({ x: 0, y: 0, width: 100, height: 50 });
    expect(fit.crop).toEqual({ x: 0, y: 30, width: 40, height: 20 });
  });

  it('fill-height takes the height and centers on the width, without stretching', () => {
    // scale 50/80 = 0.625: the source becomes 25 × 50, at the center of the box
    const fit = imageFit('fill-height', box, source);
    expect(fit).toEqual({ x: 37.5, y: 0, width: 25, height: 50 });
  });

  it('fill-height with a wide source crops the sides', () => {
    const fit = imageFit('fill-height', { width: 20, height: 50 }, source);
    expect(fit.crop).toEqual({ x: 4, y: 0, width: 32, height: 80 });
    expect(fit).toMatchObject({ x: 0, y: 0, width: 20, height: 50 });
  });

  it('scale-down shrinks like contain, but never enlarges', () => {
    // the 40 × 80 source does not fit in 100 × 50: shrinks to 25 × 50
    expect(imageFit('scale-down', box, source)).toEqual({
      x: 37.5,
      y: 0,
      width: 25,
      height: 50,
    });
    // in a box larger than the source, it keeps its natural size, centered
    expect(imageFit('scale-down', { width: 200, height: 200 }, source)).toEqual({
      x: 80,
      y: 60,
      width: 40,
      height: 80,
    });
  });

  it('none uses the natural size, centered, cropping what goes past the box', () => {
    expect(imageFit('none', { width: 200, height: 200 }, source)).toEqual({
      x: 80,
      y: 60,
      width: 40,
      height: 80,
    });
    const cut = imageFit('none', box, source);
    expect(cut).toMatchObject({ x: 30, y: 0, width: 40, height: 50 });
    expect(cut.crop).toEqual({ x: 0, y: 15, width: 40, height: 50 });
  });

  it('box without area or image without size does not generate a crop with NaN', () => {
    for (const fit of ['fill-width', 'fill-height', 'scale-down', 'none'] as const) {
      const empty = imageFit(fit, { width: 0, height: 0 }, source);
      expect(empty).toEqual({ x: 0, y: 0, width: 0, height: 0 });
    }
  });

  it('a scale that is not exact does not create a crop when the whole image shows', () => {
    expect(
      imageFit('scale-down', { width: 10, height: 10 }, { width: 3, height: 7 }),
    ).not.toHaveProperty('crop');
  });
});

// DX5 (stage #1903, decision 18): the component layer hands the drawing's specialization and the
// package image resolver to the renderer, and redoes only the drawings that cite an image when it
// finishes decoding (`refreshPackageImages`), at the same place in the order.
import Konva from 'konva';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { installFakeCanvas } from '../harness';
import {
  type LayerDrawing,
  ComponentLayerRenderer,
} from '../../../src/canvas/components/componentLayer';
import type { PackageImageResult } from '../../../src/canvas/components/renderScene';
import { packageImageKey } from '../../../src/model/components/imagePath';
import type { Placement } from '../../../src/model';
import {
  type FrameNode,
  type SceneNode,
  baseNode,
} from '../../../src/model/components/scene';

beforeAll(() => installFakeCanvas());

const PLACEMENTS: ReadonlyMap<string, Placement> = new Map([
  ['img-1', { x: 0, y: 0, scale: 1 }],
]);
const all = () => true;

function withAsset(
  markingId: string,
  asset: string | undefined,
  specId: string | null = 'lib',
): LayerDrawing {
  const image: SceneNode = {
    ...baseNode({
      id: `${markingId}-img`,
      name: 'img',
      width: 20,
      height: 20,
      fills: [
        asset === undefined
          ? { type: 'solid', color: '#111111' }
          : { type: 'image', asset },
      ],
    }),
    type: 'rect',
    cornerRadius: 0,
  };
  const root: FrameNode = {
    ...baseNode({ id: markingId, name: markingId, width: 100, height: 40 }),
    type: 'frame',
    clip: false,
    cornerRadius: 0,
    fills: [],
    children: [image],
  };
  return { markingId, containerId: 'img-1', root, ...(specId ? { specId } : {}) };
}

const ready: PackageImageResult = {
  state: 'ready',
  image: { width: 8, height: 4 } as unknown as CanvasImageSource,
  width: 8,
  height: 4,
};

function setup() {
  const states = new Map<string, PackageImageResult>();
  const resolve = vi.fn(
    (spec: string, asset: string): PackageImageResult =>
      states.get(packageImageKey(spec, asset)) ?? { state: 'loading' },
  );
  const parent = new Konva.Group();
  const layer = new ComponentLayerRenderer(parent, { packageImage: resolve });
  const nodeOf = (id: string) =>
    parent.find((n: Konva.Node) => n.getAttr('markingId') === id)[0] as Konva.Group;
  const render = (...list: LayerDrawing[]) =>
    layer.render(new Map(list.map((d) => [d.markingId, d])), all, PLACEMENTS);
  return { states, resolve, layer, nodeOf, parent, render };
}

describe('package images in the component layer', () => {
  it('asks with the drawing’s specialization and shows the placeholder while it decodes', () => {
    const { resolve, nodeOf, render } = setup();
    render(withAsset('a', 'images/logo.png'));
    expect(resolve).toHaveBeenCalledWith('lib', 'images/logo.png');
    expect(nodeOf('a').find('Image')).toHaveLength(0);
  });

  it('refreshPackageImages redoes only the drawings of that image, in the same order', () => {
    const { states, resolve, layer, nodeOf, parent, render } = setup();
    render(
      withAsset('a', 'images/logo.png'),
      withAsset('b', 'images/other.png'),
      withAsset('c', 'images/logo.png'),
      withAsset('d', undefined),
    );
    const before = ['a', 'b', 'c', 'd'].map(nodeOf);
    resolve.mockClear();
    states.set(packageImageKey('lib', 'images/logo.png'), ready);
    expect(
      layer.refreshPackageImages(new Set([packageImageKey('lib', 'images/logo.png')])),
    ).toBe(true);
    expect(resolve).toHaveBeenCalledTimes(2);
    expect(nodeOf('b')).toBe(before[1]);
    expect(nodeOf('d')).toBe(before[3]);
    expect(nodeOf('a')).not.toBe(before[0]);
    expect(nodeOf('a').find('Image')).toHaveLength(1);
    expect(nodeOf('c').find('Image')).toHaveLength(1);
    const group = parent.getChildren()[0] as Konva.Group;
    expect(
      group.getChildren().map((n: Konva.Node) => n.getAttr('markingId') as string),
    ).toEqual(['a', 'b', 'c', 'd']);
  });

  it('with null redoes every drawing that uses a package image (a library changed)', () => {
    const { resolve, layer, render } = setup();
    render(
      withAsset('a', 'images/logo.png'),
      withAsset('b', 'images/x.png'),
      withAsset('d', undefined),
    );
    resolve.mockClear();
    expect(layer.refreshPackageImages(null)).toBe(true);
    expect(resolve).toHaveBeenCalledTimes(2);
  });

  it('an image that no drawing uses, or another library’s, redoes nothing', () => {
    const { resolve, layer, render } = setup();
    render(withAsset('a', 'images/logo.png'));
    resolve.mockClear();
    expect(
      layer.refreshPackageImages(new Set([packageImageKey('lib', 'images/zzz.png')])),
    ).toBe(false);
    expect(
      layer.refreshPackageImages(new Set([packageImageKey('other', 'images/logo.png')])),
    ).toBe(false);
    expect(resolve).not.toHaveBeenCalled();
  });

  it('a drawing without a specialization never asks and a remote refresh leaves it alone', () => {
    const { resolve, layer, render } = setup();
    render(withAsset('a', 'images/logo.png', null));
    expect(resolve).not.toHaveBeenCalled();
    expect(layer.refreshPackageImages(null)).toBe(false);
    expect(layer.refreshImages(null)).toBe(false);
  });
});

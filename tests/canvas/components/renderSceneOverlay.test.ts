// `overlay` (format 4, stage #2915, DG5): a lone drawing (the Catalog, the Palette, the example images) draws
// its base and then its overlay in the same group; the layer asks for them apart.
import Konva from 'konva';
import { beforeAll, describe, expect, it } from 'vitest';
import { installFakeCanvas } from '../harness';
import { renderScene } from '../../../src/canvas/components/renderScene';
import {
  type FrameNode,
  type Scene,
  baseNode,
  translate,
} from '../../../src/model/components/scene';

beforeAll(() => installFakeCanvas());

const BAR = '#6b7280';

/** A Scroll: a filled frame, a content frame and a scrollbar flagged `overlay` that comes before the content. */
function scroll(withBar = true): Scene {
  const bar = {
    ...baseNode({
      id: 'bar',
      name: 'bar',
      width: 4,
      height: 80,
      transform: translate(96, 0),
      fills: [{ type: 'solid' as const, color: BAR }],
    }),
    type: 'rect' as const,
    cornerRadius: 0,
    overlay: true as const,
  };
  const content: FrameNode = {
    ...baseNode({
      id: 'content',
      name: 'content',
      width: 100,
      height: 48,
      fills: [{ type: 'solid', color: '#93c5fd' }],
    }),
    type: 'frame',
    clip: false,
    cornerRadius: 0,
    children: [],
  };
  return {
    root: {
      ...baseNode({
        id: 'r',
        name: 'r',
        width: 100,
        height: 80,
        fills: [{ type: 'solid', color: '#f9fafb' }],
      }),
      type: 'frame',
      clip: false,
      cornerRadius: 0,
      children: withBar ? [bar, content] : [content],
    },
    warnings: [],
  };
}

const fillOf = (node: Konva.Node): unknown => (node as Konva.Rect).fill();

describe('renderScene: overlay', () => {
  it('a lone root draws its base and then its overlay in the same group', () => {
    const { root, byId } = renderScene(scroll());
    const rects = root.find('Rect');
    expect(rects.map(fillOf).at(-1)).toBe(BAR);
    // The scrollbar is the last painted shape even though it comes first in the tree.
    expect(rects.map(fillOf).filter((f) => f === BAR)).toHaveLength(1);
    expect(byId.get('bar')).toBeDefined();
    // The root id still names the base root, not the overlay's copy.
    expect(byId.get('r')?.getParent()).toBe(root);
    expect(root.getChildren()).toHaveLength(2);
  });

  it('a root without overlay nodes is the very root group, as before', () => {
    const { root, byId, overlay } = renderScene(scroll(false));
    expect(byId.get('r')).toBe(root);
    expect(root.getAttr('sceneId')).toBe('r');
    expect(overlay).toBeUndefined();
  });

  it('with `overlay: "apart"` the overlay comes in its own group and the root is only the base', () => {
    const { root, overlay, byId, imageUrls } = renderScene(scroll(), {
      overlay: 'apart',
    });
    expect(overlay).toBeInstanceOf(Konva.Group);
    expect(byId.get('r')).toBe(root);
    expect(root.find('Rect').map(fillOf)).not.toContain(BAR);
    const fills = overlay?.find('Rect').map(fillOf) ?? [];
    // The ancestors keep their geometry but none of their paint.
    expect(fills).toContain(BAR);
    expect(fills).not.toContain('#f9fafb');
    expect(fills).not.toContain('#93c5fd');
    expect(imageUrls).toEqual([]);
  });
});

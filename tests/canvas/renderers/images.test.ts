import Konva from 'konva/lib/Core';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { ImageRenderer } from '../../../src/canvas/renderers/images';
import { HALO_WIDTH } from '../../../src/canvas/renderers/metrics';
import { t } from '../../../src/i18n';
import {
  addBackgroundContainer,
  removeContainer,
  renameContainer,
} from '../../../src/model';
import { canvasProject, editorFor, frameOf, installFakeCanvas, TOKENS } from '../harness';

beforeAll(installFakeCanvas);
afterAll(() => vi.restoreAllMocks());

function setup() {
  const layer = new Konva.Layer();
  const renderer = new ImageRenderer(layer);
  const editor = editorFor();
  return { layer, renderer, editor };
}

describe('ImageRenderer', () => {
  it('creates one group per image, in the project position and order', () => {
    const { layer, renderer, editor } = setup();
    const placements = renderer.render(frameOf(editor));
    expect([...placements.keys()]).toEqual(['I1', 'I2']);
    expect(layer.getChildren()).toHaveLength(2);
    const i2 = renderer.node('I2');
    expect(i2?.group.position()).toEqual({ x: 1100, y: 0 });
    expect(i2?.group.zIndex()).toBe(1);
    expect(i2?.placeholder.width()).toBe(500);
  });

  it('uses the position of the gesture preview in progress', () => {
    const { renderer, editor } = setup();
    const preview = {
      containerId: 'I2',
      placement: { x: 2000, y: 50, scale: 2 },
      valid: true,
    };
    const placements = renderer.render(frameOf(editor, { preview }));
    expect(placements.get('I2')).toEqual(preview.placement);
    expect(renderer.node('I2')?.group.position()).toEqual({ x: 2000, y: 50 });
    expect(renderer.node('I2')?.placeholder.width()).toBe(1000);
  });

  it('loading: reserved space without a warning; ready: only the bitmap', () => {
    const { renderer, editor } = setup();
    renderer.render(frameOf(editor));
    const node = renderer.node('I1');
    expect(node?.placeholder.visible()).toBe(true);
    expect(node?.bitmap.visible()).toBe(false);
    expect(node?.label.visible()).toBe(false);

    const bitmap = { width: 1000, height: 800, close: () => undefined };
    const bitmaps = new Map([
      [
        'images/a.jpg',
        { status: 'ready' as const, bitmap: bitmap as unknown as ImageBitmap },
      ],
    ]);
    renderer.render(frameOf(editor, { bitmaps }));
    expect(node?.bitmap.visible()).toBe(true);
    expect(node?.bitmap.image()).toBe(bitmap);
    expect(node?.placeholder.visible()).toBe(false);
  });

  // Finding 10: `drawImage … The image source is detached`. A closed `ImageBitmap` ends up
  // with zero width and height; drawing it throws. The node never receives a closed bitmap.
  it('does not draw a closed bitmap: the node stays without an image and goes back to the reserved space', () => {
    const { renderer, editor } = setup();
    const open = { width: 1000, height: 800, close: () => undefined };
    const ready = (bitmap: typeof open) =>
      new Map([
        [
          'images/a.jpg',
          { status: 'ready' as const, bitmap: bitmap as unknown as ImageBitmap },
        ],
      ]);
    renderer.render(frameOf(editor, { bitmaps: ready(open) }));
    const node = renderer.node('I1');
    expect(node?.bitmap.image()).toBe(open);

    const closed = { width: 0, height: 0, close: () => undefined };
    renderer.render(frameOf(editor, { bitmaps: ready(closed) }));
    expect(node?.bitmap.visible()).toBe(false);
    expect(node?.bitmap.image()).toBeUndefined();
    expect(node?.placeholder.visible()).toBe(true);
    // No warning: it is neither a missing nor a broken image, only a transition frame.
    expect(node?.label.visible()).toBe(false);
  });

  it('missing image: dashed warning border and message with the file', () => {
    const { renderer, editor } = setup();
    const bitmaps = new Map([['images/a.jpg', { status: 'missing' as const }]]);
    renderer.render(frameOf(editor, { bitmaps }));
    const node = renderer.node('I1');
    expect(node?.placeholder.stroke()).toBe(TOKENS.warningText);
    expect(node?.placeholder.dash()).toEqual([8, 6]);
    expect(node?.label.visible()).toBe(true);
    expect(node?.label.text()).toBe(`⚠ ${t('canvas.imageMissing')}\nimages/a.jpg`);
  });

  it('label: image name (or the file, dimmed); disappears when it gets narrow on screen', () => {
    const { renderer, editor } = setup();
    renderer.render(frameOf(editor));
    expect(renderer.node('I1')?.title.text()).toBe('images/a.jpg');
    expect(renderer.node('I1')?.title.fill()).toBe(TOKENS.textMuted);
    expect(renderer.node('I1')?.title.stroke()).toBe(TOKENS.surface);

    const named = renameContainer(canvasProject(), 'I1', 'Side');
    renderer.render(frameOf(editor, { project: named }));
    expect(renderer.node('I1')?.title.text()).toBe('Side');
    expect(renderer.node('I1')?.title.fill()).toBe(TOKENS.text);
    expect(renderer.node('I1')?.title.stroke()).toBe(TOKENS.surface);

    // 500 px wide × 0.05 = 25 screen px: less than the legible minimum.
    renderer.render(frameOf(editor, { viewport: { x: 0, y: 0, scale: 0.05 } }));
    expect(renderer.node('I2')?.title.visible()).toBe(false);
  });

  // TE1, decision 2: the title reads over any root; the surface-color outline has
  // a thickness in screen px (2 * HALO_WIDTH / zoom) and stays behind the letters.
  it('label: surface-color outline in screen px, with and without a name', () => {
    const { renderer, editor } = setup();
    for (const scale of [1, 2]) {
      renderer.render(frameOf(editor, { viewport: { x: 0, y: 0, scale } }));
      const title = renderer.node('I1')?.title;
      expect(title?.stroke()).toBe(TOKENS.surface);
      expect(title?.strokeWidth()).toBeCloseTo((2 * HALO_WIDTH) / scale);
      expect(title?.fillAfterStrokeEnabled()).toBe(true);
    }
    const named = renameContainer(canvasProject(), 'I1', 'Side');
    renderer.render(frameOf(editor, { project: named }));
    expect(renderer.node('I1')?.title.stroke()).toBe(TOKENS.surface);
    expect(renderer.node('I1')?.title.fillAfterStrokeEnabled()).toBe(true);
  });

  it('titleRects: only the visible label text, in canvas coordinates; disappears with zoom and removal', () => {
    const { renderer, editor } = setup();
    renderer.render(frameOf(editor));
    const rect = renderer.titleRects().get('I1');
    const title = renderer.node('I1')?.title;
    expect(rect).toEqual({
      x: 0,
      y: title?.y(),
      width: Math.min(title?.getTextWidth() ?? 0, 1000),
      height: title?.height(),
    });
    expect(rect?.y).toBeLessThan(0);

    // I2 (500 px) is too narrow on screen: no label, no rectangle.
    renderer.render(frameOf(editor, { viewport: { x: 0, y: 0, scale: 0.05 } }));
    expect(renderer.titleRects().has('I2')).toBe(false);

    renderer.render(frameOf(editor, { project: removeContainer(canvasProject(), 'I2') }));
    expect([...renderer.titleRects().keys()]).toEqual(['I1']);
  });

  it('thicknesses in screen px: divided by the zoom', () => {
    const { renderer, editor } = setup();
    const bitmaps = new Map([['images/a.jpg', { status: 'error' as const }]]);
    renderer.render(frameOf(editor, { bitmaps, viewport: { x: 0, y: 0, scale: 4 } }));
    expect(renderer.node('I1')?.placeholder.strokeWidth()).toBe(0.5);
    expect(renderer.node('I1')?.label.text()).toContain(t('canvas.imageError'));
  });

  it('removes the node of an image that left the project', () => {
    const { layer, renderer, editor } = setup();
    renderer.render(frameOf(editor));
    const node = renderer.node('I2');
    const without = removeContainer(canvasProject(), 'I2');
    renderer.render(frameOf(editor, { project: without }));
    expect(renderer.node('I2')).toBeUndefined();
    expect(layer.getChildren()).toHaveLength(1);
    expect(node?.group.getParent()).toBeFalsy();
  });

  it('container: full rectangle in the background color, never the reserved loading one', () => {
    const { renderer, editor } = setup();
    const project = addBackgroundContainer(canvasProject(), {
      id: 'B1',
      width: 400,
      height: 600,
      background: '#FFEEDD',
      center: { x: 3000, y: 300 },
    });
    // No bitmap at all in the map: still ready.
    const placements = renderer.render(frameOf(editor, { project }));
    expect(placements.has('B1')).toBe(true);
    const node = renderer.node('B1');
    expect(node?.bitmap.visible()).toBe(false);
    expect(node?.bitmap.image()).toBeUndefined();
    expect(node?.label.visible()).toBe(false);
    const scale = placements.get('B1')?.scale ?? Number.NaN;
    expect(node?.placeholder.getAttrs()).toMatchObject({
      visible: true,
      width: 400 * scale,
      height: 600 * scale,
      fill: '#FFEEDD',
      stroke: TOKENS.border,
      dash: [],
    });
    // No name: the label is the unnamed-screen one, dimmed.
    expect(node?.title.text()).toBe(t('image.containerUntitled'));
    expect(node?.title.fill()).toBe(TOKENS.textMuted);

    // The border thickness follows the zoom.
    renderer.render(frameOf(editor, { project, viewport: { x: 0, y: 0, scale: 4 } }));
    expect(node?.placeholder.strokeWidth()).toBe(0.25);
  });
});

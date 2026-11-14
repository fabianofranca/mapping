import Konva from 'konva/lib/Core';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Frame } from '../../../src/canvas/frame';
import { MarkingRenderer } from '../../../src/canvas/renderers/markings';
import { OverlayRenderer } from '../../../src/canvas/renderers/overlay';
import { visibleArrowShapes } from '../../../src/canvas/arrowGeometry';
import type { Placement } from '../../../src/model';
import { arrowProject, withArrow } from '../../model/arrowFixtures';
import { editorFor, frameOf, installFakeCanvas, TOKENS } from '../harness';

beforeAll(installFakeCanvas);
afterAll(() => vi.restoreAllMocks());

const PLACEMENTS: ReadonlyMap<string, Placement> = new Map([
  ['I1', { x: 0, y: 0, scale: 1 }],
  ['I2', { x: 1100, y: 0, scale: 1 }],
]);

function setup() {
  const container = document.createElement('div');
  const overlay = new OverlayRenderer(new Konva.Layer(), container);
  const editor = editorFor();
  const render = (overrides: Partial<Frame> = {}, placements = PLACEMENTS) =>
    overlay.render(frameOf(editor, overrides), placements);
  const handles = () => [...overlay.handles.values()];
  return { container, overlay, render, handles };
}

describe('OverlayRenderer', () => {
  it('without a selection, nothing appears', () => {
    const { overlay, render, handles } = setup();
    render();
    expect(overlay.selectionOutline.visible()).toBe(false);
    expect(handles().every((h) => !h.visible())).toBe(true);
  });

  it('selected image: outline and four corner handles', () => {
    const { overlay, render, handles } = setup();
    render({
      selection: { kind: 'image', id: 'I2' },
      viewport: { x: 0, y: 0, scale: 2 },
    });
    expect(overlay.selectionOutline.getAttrs()).toMatchObject({
      visible: true,
      x: 1100,
      y: 0,
      width: 500,
      height: 500,
      stroke: TOKENS.select,
      strokeWidth: 1,
    });
    expect(handles().filter((h) => h.visible())).toHaveLength(4);
    // `size-handle` handle (10 screen px) centered on the corner, with the selection color.
    expect(overlay.handles.get('se')?.getAttrs()).toMatchObject({
      x: 1600 - 2.5,
      y: 500 - 2.5,
      width: 5,
      fill: TOKENS.line,
      stroke: TOKENS.select,
    });
  });

  it('invalid position during the gesture: red outline, thicker', () => {
    const { overlay, render } = setup();
    const placement = { x: 500, y: 0, scale: 1 };
    render(
      {
        selection: { kind: 'image', id: 'I2' },
        preview: { containerId: 'I2', placement, valid: false },
      },
      new Map([...PLACEMENTS, ['I2', placement]]),
    );
    expect(overlay.selectionOutline.stroke()).toBe(TOKENS.invalid);
    expect(overlay.selectionOutline.strokeWidth()).toBe(4);
    expect(overlay.selectionOutline.x()).toBe(500);
  });

  it('selected marking: only the handles (its border already thickens)', () => {
    const { overlay, render, handles } = setup();
    render({ selection: { kind: 'marking', id: 'M2' } });
    expect(overlay.selectionOutline.visible()).toBe(false);
    expect(overlay.handles.get('nw')?.getAttrs()).toMatchObject({ x: 195, y: 195 });
    expect(handles().every((h) => h.visible())).toBe(true);
  });

  it('larger handle with touch (size-handle-touch)', () => {
    const { overlay, render } = setup();
    render({
      selection: { kind: 'marking', id: 'M2' },
      tokens: { ...TOKENS, handleSize: 14 },
    });
    expect(overlay.handles.get('nw')?.getAttrs()).toMatchObject({
      x: 193,
      y: 193,
      width: 14,
    });
  });

  describe('name tag of the selected marking', () => {
    const SELECTED = { kind: 'marking', id: 'M2' } as const;
    /** 380×700 screen with image I1 shifted: the top of M2 (y = 200) is at `top`. */
    const at = (top: number, scale = 1) => ({ x: 0, y: top - 200 * scale, scale });

    it('above the top left corner, with the tag colors', () => {
      const { overlay, render } = setup();
      render({ selection: SELECTED, viewport: at(100) });
      expect(overlay.nameTag.visible()).toBe(true);
      // pt-BR kept: shared fixture data (sampleProject) asserted by tests/model, tests/components
      expect(overlay.nameTagText.text()).toBe('Maçaneta');
      expect(overlay.nameTagText.getAttrs()).toMatchObject({
        fill: TOKENS.nameTagText,
        fontFamily: TOKENS.fontFamily,
        fontSize: TOKENS.type.name.size,
      });
      expect(overlay.nameTagBox.getAttrs()).toMatchObject({ fill: TOKENS.nameTag });
      // Height of 16 + 2·1 of halo and a 2 px gap: the background ends 2 px above the border.
      expect(overlay.nameTag.x()).toBe(200);
      expect(overlay.nameTag.y()).toBe(200 - 20);
    });

    it('marking removed in the review: the name tag gets the strike, at any zoom', () => {
      const removed = {
        key: 'marking:M2',
        placement: { x: 0, y: 0, scale: 1 },
        rect: { x: 200, y: 200, width: 50, height: 50 },
        name: 'Handle',
        badges: ['removed' as const],
      };
      for (const scale of [0.56, 1.1]) {
        const { overlay, render } = setup();
        render({
          selection: SELECTED,
          viewport: at(100, scale),
          review: {
            view: 'current',
            markings: new Map(),
            images: new Map(),
            ghosts: [],
            removed: [removed],
          },
        });
        // The tag is in screen px (the group has the inverse scale): so is the strike.
        const strike = overlay.nameTag.findOne('.name-tag-strike');
        expect(strike?.visible()).toBe(true);
        expect(strike?.getAttr('stroke')).toBe(TOKENS.nameTagText);
        expect(strike?.getAttr('strokeWidth')).toBe(1.5);
        const points = strike?.getAttr('points') as number[];
        expect(points[0]).toBeLessThan(points[2] ?? 0);
        expect(points[1]).toBeGreaterThan(0);
        expect(points[1]).toBeLessThan(overlay.nameTagBox.height());
      }
      // Without a review (or not removed), the tag stays as it was.
      const { overlay, render } = setup();
      render({ selection: SELECTED, viewport: at(100) });
      expect(overlay.nameTag.findOne('.name-tag-strike')?.visible()).toBe(false);
    });

    it('long name removed in the review: the strike does not go past the tag (clipped width)', () => {
      const long = 'A very long marking name that goes past the limit of the tag, okay';
      expect(long.length).toBeGreaterThan(60);
      const { overlay, render } = setup();
      const base = editorFor().store.project.peek();
      render({
        selection: SELECTED,
        viewport: at(100),
        project: base && {
          ...base,
          markings: base.markings.map((m) => (m.id === 'M2' ? { ...m, name: long } : m)),
        },
        review: {
          view: 'current',
          markings: new Map(),
          images: new Map(),
          ghosts: [],
          removed: [
            {
              key: 'marking:M2',
              placement: { x: 0, y: 0, scale: 1 },
              rect: { x: 200, y: 200, width: 50, height: 50 },
              name: long,
              badges: ['removed' as const],
            },
          ],
        },
      });
      const points = overlay.nameTag.findOne('.name-tag-strike')?.getAttr('points') as
        number[] | undefined;
      expect(points?.[2]).toBeLessThanOrEqual(overlay.nameTagBox.width());
      expect(overlay.nameTagText.text()).toBe(long);
    });

    it('keeps the screen px size with zoom', () => {
      const { overlay, render } = setup();
      render({ selection: SELECTED, viewport: at(100, 2) });
      expect(overlay.nameTag.scaleX()).toBe(0.5);
      expect(overlay.nameTag.y()).toBe(200 - 20 / 2);
    });

    it('without room above on screen: inside the marking', () => {
      const { overlay, render } = setup();
      render({ selection: SELECTED, viewport: at(5) });
      expect(overlay.nameTag.y()).toBe(200 + 2);
    });

    // Stage 6 (6.4), finding 6: a marking at the top over the image title ("Checkout").
    it('marking at the top of the image: the tag goes up above the image title', () => {
      const { overlay } = setup();
      const editor = editorFor();
      const p = editor.store.committed.value;
      if (!p) throw new Error('no project');
      const project = {
        ...p,
        markings: p.markings.map((m) =>
          m.id === 'M2' ? { ...m, rect: { x: 200, y: 4, width: 100, height: 100 } } : m,
        ),
      };
      overlay.render(
        frameOf(editor, {
          project,
          selection: SELECTED,
          viewport: { x: 0, y: 300, scale: 1 },
        }),
        PLACEMENTS,
      );
      // Image title: 16 px line ending 4 px above the top (y = 0).
      const tagBottom = overlay.nameTag.y() + overlay.nameTagBox.height();
      expect(tagBottom).toBeLessThanOrEqual(-(TOKENS.type.image.line + 4));
    });

    // Stage 7 (7.2), finding A2: at 52%, the name tag of the child touching the top of the
    // parent covered the parent's label (the two texts overlapped).
    it('child at the top of the parent: the tag does not cover the parent label', () => {
      const editor = editorFor();
      const p = editor.store.committed.value;
      if (!p) throw new Error('no project');
      const zoom = 0.52;
      const project = {
        ...p,
        markings: p.markings.map((m) =>
          m.id === 'M2' ? { ...m, rect: { x: 110, y: 120, width: 200, height: 120 } } : m,
        ),
      };
      const frame = frameOf(editor, {
        project,
        selection: SELECTED,
        size: { width: 1000, height: 800 },
        viewport: { x: 0, y: 0, scale: zoom },
      });
      const markings = new MarkingRenderer(new Konva.Layer());
      markings.render(frame, PLACEMENTS);
      const overlay = new OverlayRenderer(
        new Konva.Layer(),
        document.createElement('div'),
      );
      overlay.render(frame, PLACEMENTS, markings.headers);

      const label = markings.node('M1')?.text?.header;
      if (!label) throw new Error('no parent label');
      expect(label.visible()).toBe(true);
      const labelBox = {
        x: label.x(),
        y: label.y(),
        right: label.x() + Math.min(label.width(), label.getTextWidth()),
        bottom: label.y() + label.height(),
      };
      expect(overlay.nameTag.visible()).toBe(true);
      const tag = {
        x: overlay.nameTag.x(),
        y: overlay.nameTag.y(),
        right: overlay.nameTag.x() + overlay.nameTagBox.width() / zoom,
        bottom: overlay.nameTag.y() + overlay.nameTagBox.height() / zoom,
      };
      const overlaps =
        tag.x < labelBox.right &&
        labelBox.x < tag.right &&
        tag.y < labelBox.bottom &&
        labelBox.y < tag.bottom;
      expect(overlaps).toBe(false);
      // Moved below the parent's label, without leaving the top line of the child.
      expect(tag.y).toBeGreaterThanOrEqual(labelBox.bottom);
      expect(tag.x).toBe(110);
    });

    it('corner off screen: anchored to the visible border', () => {
      const { overlay, render } = setup();
      // M2 starts at x = 200 and y = 200; the screen shows from (250, 250) onward.
      render({ selection: SELECTED, viewport: { x: -250, y: -250, scale: 1 } });
      expect(overlay.nameTag.x()).toBe(250);
      expect(overlay.nameTag.y()).toBe(250 + 2);
    });

    it('without a name, selected image or without a selection: no tag', () => {
      const { overlay, render } = setup();
      render({ selection: { kind: 'marking', id: 'M3' }, viewport: at(100) });
      expect(overlay.nameTag.visible()).toBe(false);
      render({ selection: { kind: 'image', id: 'I1' } });
      expect(overlay.nameTag.visible()).toBe(false);
      render({ selection: SELECTED, viewport: at(100) });
      render();
      expect(overlay.nameTag.visible()).toBe(false);
    });

    it('followsView only while the tag appears (pan needs to redraw it)', () => {
      const { overlay, render } = setup();
      expect(overlay.followsView).toBe(false);
      render({ selection: SELECTED, viewport: at(100) });
      expect(overlay.followsView).toBe(true);
    });
  });

  it('without handles in Draw mode and in read-only mode', () => {
    const { render, handles } = setup();
    render({ selection: { kind: 'marking', id: 'M2' }, mode: 'draw' });
    expect(handles().some((h) => h.visible())).toBe(false);
    render({ selection: { kind: 'marking', id: 'M2' }, readOnly: true });
    expect(handles().some((h) => h.visible())).toBe(false);
  });

  it('draft: dashed; red while it is too small', () => {
    const { overlay, render } = setup();
    render({ draft: { containerId: 'I1', rect: { x: 10, y: 10, width: 2, height: 2 } } });
    expect(overlay.draftRect.visible()).toBe(true);
    expect(overlay.draftRect.stroke()).toBe(TOKENS.invalid);
    render({
      draft: { containerId: 'I1', rect: { x: 10, y: 10, width: 80, height: 60 } },
    });
    expect(overlay.draftRect.stroke()).toBe(TOKENS.select);
    expect(overlay.draftRect.dash()).toEqual([6, 4]);
    render();
    expect(overlay.draftRect.visible()).toBe(false);
  });

  it('drop target: highlighted image; empty area marks the container', () => {
    const { container, overlay, render } = setup();
    render({ dropTarget: { containerId: 'I1' } });
    expect(overlay.dropRect.visible()).toBe(true);
    expect(overlay.dropRect.width()).toBe(1000);
    expect(container.classList.contains('canvas-host--drop')).toBe(false);

    render({ dropTarget: { containerId: null } });
    expect(overlay.dropRect.visible()).toBe(false);
    expect(container.classList.contains('canvas-host--drop')).toBe(true);

    render();
    expect(container.classList.contains('canvas-host--drop')).toBe(false);
  });

  it('drop target with a marking: lights up its rectangle, without the background', () => {
    const { container, overlay, render } = setup();
    render({ dropTarget: { containerId: null, markingId: 'M1' } });
    expect(overlay.dropRect.visible()).toBe(true);
    expect(container.classList.contains('canvas-host--drop')).toBe(false);
  });
});

describe('OverlayRenderer: lock (stage 2.5)', () => {
  const lock = (
    editor: ReturnType<typeof editorFor>,
    kind: 'marking' | 'image',
    id: string,
  ) =>
    expect(
      (kind === 'marking'
        ? editor.actions.setMarkingLocked(id, true)
        : editor.actions.setImageLocked(id, true)
      ).ok,
    ).toBe(true);

  function lockedSetup() {
    const container = document.createElement('div');
    const overlay = new OverlayRenderer(new Konva.Layer(), container);
    const editor = editorFor();
    const render = (overrides: Partial<Frame> = {}, placements = PLACEMENTS) =>
      overlay.render(frameOf(editor, overrides), placements);
    return { overlay, editor, render };
  }

  it('locked and selected marking: no handles, with the lock at the top right corner', () => {
    const { overlay, editor, render } = lockedSetup();
    lock(editor, 'marking', 'M2');
    render({ selection: { kind: 'marking', id: 'M2' } });
    expect([...overlay.handles.values()].every((h) => !h.visible())).toBe(true);
    const badge = overlay.selectionLock.group;
    expect(badge.visible()).toBe(true);
    // M2 is 100×100 and the lock is 20 px: it fits inside, with a 2 px gap.
    expect(badge.x()).toBe(300 - 20 - 2);
    expect(badge.y()).toBe(200 + 2);
    expect(badge.opacity()).toBe(1);
    expect(overlay.hoverLockBadge.group.visible()).toBe(false);
  });

  it('the lock uses the tokens and keeps the screen px size with the zoom', () => {
    const { overlay, editor, render } = lockedSetup();
    lock(editor, 'marking', 'M1');
    render({
      selection: { kind: 'marking', id: 'M1' },
      viewport: { x: 0, y: 0, scale: 2 },
    });
    const badge = overlay.selectionLock.group;
    expect(badge.scaleX()).toBe(0.5);
    const [box, glyph] = badge.getChildren();
    expect(box?.getAttrs()).toMatchObject({
      width: TOKENS.lock.size,
      height: TOKENS.lock.size,
      fill: TOKENS.lock.fill,
      cornerRadius: TOKENS.radius.sm,
    });
    const paths = (glyph as Konva.Group).getChildren();
    expect(paths).toHaveLength(2);
    expect(paths.every((p) => p.getAttrs().stroke === TOKENS.lock.glyph)).toBe(true);
  });

  it('descendant of a locked parent: no handles and with the dimmed lock', () => {
    const { overlay, editor, render } = lockedSetup();
    lock(editor, 'marking', 'M1');
    render({ selection: { kind: 'marking', id: 'M2' } });
    expect([...overlay.handles.values()].every((h) => !h.visible())).toBe(true);
    expect(overlay.selectionLock.group.visible()).toBe(true);
    expect(overlay.selectionLock.group.opacity()).toBe(TOKENS.opacity.inherited);
  });

  it('small marking on screen: the lock stays outside, above the corner', () => {
    const { overlay, editor, render } = lockedSetup();
    lock(editor, 'marking', 'M2');
    render({
      selection: { kind: 'marking', id: 'M2' },
      viewport: { x: 0, y: 0, scale: 0.25 },
    });
    // 100 units at 0.25 = 25 screen px: less than two 20 px locks.
    const badge = overlay.selectionLock.group;
    expect(badge.x()).toBe(300 - 20 / 0.25);
    expect(badge.y()).toBe(200 - (20 + 2) / 0.25);
  });

  it('locked and selected image: no handles and with the lock', () => {
    const { overlay, editor, render } = lockedSetup();
    lock(editor, 'image', 'I2');
    // Half the scale: I2 (1100–1600) fits in the 380 px screen; the lock is 40 units.
    render({
      selection: { kind: 'image', id: 'I2' },
      viewport: { x: -500, y: 0, scale: 0.5 },
    });
    expect([...overlay.handles.values()].every((h) => !h.visible())).toBe(true);
    expect(overlay.selectionLock.group.visible()).toBe(true);
    expect(overlay.selectionLock.group.x()).toBe(1600 - 40 - 4);
  });

  it('free item: handles and no lock; unlocking brings the handles back', () => {
    const { overlay, editor, render } = lockedSetup();
    lock(editor, 'marking', 'M2');
    render({ selection: { kind: 'marking', id: 'M2' } });
    expect(overlay.selectionLock.group.visible()).toBe(true);
    editor.actions.setMarkingLocked('M2', false);
    render({ selection: { kind: 'marking', id: 'M2' } });
    expect(overlay.selectionLock.group.visible()).toBe(false);
    expect([...overlay.handles.values()].every((h) => h.visible())).toBe(true);
  });

  it('lock under the mouse: appears on the locked item that is not the selected one', () => {
    const { overlay, editor, render } = lockedSetup();
    lock(editor, 'marking', 'M1');
    render({ hoverLock: { kind: 'marking', id: 'M1' } });
    expect(overlay.hoverLockBadge.group.visible()).toBe(true);
    expect(overlay.selectionLock.group.visible()).toBe(false);
    // Selected, the item uses the selection lock and the mouse one disappears.
    render({
      selection: { kind: 'marking', id: 'M1' },
      hoverLock: { kind: 'marking', id: 'M1' },
    });
    expect(overlay.hoverLockBadge.group.visible()).toBe(false);
    expect(overlay.selectionLock.group.visible()).toBe(true);
    render({ hoverLock: null });
    expect(overlay.hoverLockBadge.group.visible()).toBe(false);
  });

  it('the lock follows the visible part: pan needs to redraw', () => {
    const { overlay, editor, render } = lockedSetup();
    expect(overlay.followsView).toBe(false);
    lock(editor, 'image', 'I1');
    render({ selection: { kind: 'image', id: 'I1' } });
    expect(overlay.followsView).toBe(true);
    render({ selection: null });
    expect(overlay.followsView).toBe(false);
  });

  it('the lock of the large item is anchored to the visible border', () => {
    const { overlay, editor, render } = lockedSetup();
    lock(editor, 'image', 'I1');
    // Right half of I1 off screen (380 px screen): the lock stays at the screen border.
    render({
      selection: { kind: 'image', id: 'I1' },
      viewport: { x: 0, y: 0, scale: 1 },
    });
    expect(overlay.selectionLock.group.x()).toBe(380 - 20 - 2);
  });

  it('on a narrow screen with the top off screen: anchors to the visible top', () => {
    const { overlay, editor, render } = lockedSetup();
    lock(editor, 'image', 'I1');
    render({
      selection: { kind: 'image', id: 'I1' },
      viewport: { x: 0, y: -100, scale: 1 },
    });
    expect(overlay.selectionLock.group.y()).toBe(100 + 2);
  });
});

// Canvas markings, absorption and inherited lock (Spatial markings stage, ME1).
describe('OverlayRenderer: canvas markings', () => {
  function spatialSetup() {
    const container = document.createElement('div');
    const overlay = new OverlayRenderer(new Konva.Layer(), container);
    const editor = editorFor();
    const created = editor.actions.createMarking(null, {
      x: -100,
      y: -100,
      width: 1800,
      height: 1000,
    });
    const id = created.ok ? created.value : '';
    const render = (overrides: Partial<Frame> = {}, placements = PLACEMENTS) =>
      overlay.render(frameOf(editor, overrides), placements);
    return { overlay, editor, render, id };
  }

  it('draft in the void (no image): in the canvas identity space', () => {
    const { overlay, render } = spatialSetup();
    render({
      draft: { containerId: null, rect: { x: 1050, y: 600, width: 300, height: 200 } },
    });
    expect(overlay.draftRect.getAttrs()).toMatchObject({
      visible: true,
      x: 1050,
      y: 600,
      width: 300,
      height: 200,
      stroke: TOKENS.select,
    });
  });

  it('selected canvas marking: handles at its corners and no image title tag', () => {
    const { overlay, render, id } = spatialSetup();
    render({
      selection: { kind: 'marking', id },
      viewport: { x: 100, y: 100, scale: 1 },
    });
    expect(overlay.handles.get('nw')?.getAttrs()).toMatchObject({
      visible: true,
      x: -105,
      y: -105,
    });
    expect(overlay.handles.get('se')?.getAttrs()).toMatchObject({ x: 1695, y: 895 });
  });

  it('selection rectangle: dashed, with the selection token; disappears without marquee', () => {
    const { overlay, render } = spatialSetup();
    render({
      marquee: { x: 10, y: 20, width: 300, height: 200 },
      viewport: { x: 0, y: 0, scale: 2 },
    });
    expect(overlay.marqueeRect.getAttrs()).toMatchObject({
      visible: true,
      x: 10,
      y: 20,
      width: 300,
      height: 200,
      stroke: TOKENS.select,
      fill: TOKENS.selectFill,
    });
    // Thickness and dash divided by the zoom: they stay constant on screen.
    expect(overlay.marqueeRect.dash()).toEqual([3, 2]);
    expect(overlay.marqueeRect.strokeWidth()).toBe(1);
    render({ marquee: null });
    expect(overlay.marqueeRect.visible()).toBe(false);
    expect(overlay.marqueeHalo.visible()).toBe(false);
  });

  it('selection rectangle: cv-halo halo under the border, same stroke and no fill', () => {
    const { overlay, render } = spatialSetup();
    render({
      marquee: { x: 10, y: 20, width: 300, height: 200 },
      viewport: { x: 0, y: 0, scale: 2 },
    });
    // The halo is a wider stroke (1 screen px on each side) drawn before the border.
    expect(overlay.marqueeHalo.getAttrs()).toMatchObject({
      visible: true,
      x: 10,
      y: 20,
      width: 300,
      height: 200,
      stroke: TOKENS.halo,
    });
    expect(overlay.marqueeHalo.strokeWidth()).toBe(2); // (2 + 2·1) screen px ÷ zoom 2
    expect(overlay.marqueeHalo.dash()).toEqual([3, 2]);
    expect(overlay.marqueeHalo.fillEnabled()).toBe(false);
    // The halo must be in the same layer as the border, and under it.
    const parent = overlay.marqueeRect.getParent();
    expect(parent).not.toBeNull();
    expect(overlay.marqueeHalo.getParent()).toBe(parent);
    expect(overlay.marqueeHalo.zIndex()).toBeLessThan(overlay.marqueeRect.zIndex());
  });

  it('items to absorb light up with the new token and disappear when the list empties', () => {
    const { overlay, render } = spatialSetup();
    render({ absorb: [{ x: 10, y: 20, width: 30, height: 40 }] });
    const lit = overlay.absorbHighlights();
    expect(lit).toHaveLength(1);
    expect(lit[0]?.getAttrs()).toMatchObject({
      visible: true,
      x: 10,
      y: 20,
      width: 30,
      height: 40,
      stroke: TOKENS.absorb,
      fill: TOKENS.absorbFill,
    });
    render({ absorb: [] });
    expect(overlay.absorbHighlights().every((r) => !r.visible())).toBe(true);
    // Two items, then one: the second node disappears, the first is reused.
    render({
      absorb: [
        { x: 1, y: 1, width: 5, height: 5 },
        { x: 9, y: 9, width: 5, height: 5 },
      ],
    });
    expect(overlay.absorbHighlights().filter((r) => r.visible())).toHaveLength(2);
    render({ absorb: [{ x: 1, y: 1, width: 5, height: 5 }] });
    expect(overlay.absorbHighlights().filter((r) => r.visible())).toHaveLength(1);
  });

  it('container inside a locked canvas marking: dimmed lock (inherited lock)', () => {
    const { overlay, editor, render, id } = spatialSetup();
    expect(editor.actions.setMarkingLocked(id, true).ok).toBe(true);
    render({ selection: { kind: 'image', id: 'I2' } });
    expect([...overlay.handles.values()].every((h) => !h.visible())).toBe(true);
    expect(overlay.selectionLock.group.visible()).toBe(true);
    expect(overlay.selectionLock.group.opacity()).toBe(TOKENS.opacity.inherited);
    // The lock under the mouse also shows the inheritance.
    render({ hoverLock: { kind: 'image', id: 'I1' } });
    expect(overlay.hoverLockBadge.group.visible()).toBe(true);
    expect(overlay.hoverLockBadge.group.opacity()).toBe(TOKENS.opacity.inherited);
  });

  it('the locked canvas marking has the full lock and the children of its space, the dimmed one', () => {
    const { overlay, editor, render, id } = spatialSetup();
    const inner = editor.actions.createMarking(null, {
      x: -50,
      y: -50,
      width: 60,
      height: 60,
    });
    const innerId = inner.ok ? inner.value : '';
    expect(editor.actions.setMarkingLocked(id, true).ok).toBe(true);
    render({ selection: { kind: 'marking', id } });
    expect(overlay.selectionLock.group.opacity()).toBe(1);
    render({ selection: { kind: 'marking', id: innerId } });
    expect(overlay.selectionLock.group.visible()).toBe(true);
    expect(overlay.selectionLock.group.opacity()).toBe(TOKENS.opacity.inherited);
  });
});

// Multiple selection (Spatial markings stage, ME2): handles, lock and tag only on the primary;
// secondary outline on the others.
describe('OverlayRenderer: multiple selection', () => {
  const im = (id: string) => ({ kind: 'image', id }) as const;
  const mk = (id: string) => ({ kind: 'marking', id }) as const;

  function multiSetup() {
    const container = document.createElement('div');
    const overlay = new OverlayRenderer(new Konva.Layer(), container);
    const editor = editorFor();
    const render = (overrides: Partial<Frame> = {}, placements = PLACEMENTS) =>
      overlay.render(frameOf(editor, overrides), placements);
    const lit = () =>
      overlay
        .secondaryHighlights()
        .filter((r) => r.visible())
        .map((r) => r.getAttrs());
    return { overlay, editor, render, lit };
  }

  it('without multiple selection, no secondary outline', () => {
    const { overlay, render } = multiSetup();
    render({ selection: mk('M2'), items: [mk('M2')] });
    expect(overlay.secondaryHighlights().filter((r) => r.visible())).toHaveLength(0);
    render();
    expect(overlay.secondaryHighlights().filter((r) => r.visible())).toHaveLength(0);
  });

  it('the non-primary ones get an outline on their rectangle, with the new token', () => {
    const { render, lit } = multiSetup();
    render({
      selection: mk('M2'),
      items: [im('I2'), mk('M3'), mk('M1'), mk('M2')],
      viewport: { x: 0, y: 0, scale: 2 },
    });
    const attrs = lit();
    expect(attrs).toHaveLength(3);
    // Container: its rectangle on the canvas.
    expect(attrs[0]).toMatchObject({
      x: 1100,
      y: 0,
      width: 500,
      height: 500,
      stroke: TOKENS.selectSecondary,
      strokeWidth: 1, // 2 screen px at zoom 2
    });
    // Container marking: its rectangle through the container space.
    expect(attrs[1]).toMatchObject({
      x: 1150,
      y: 50,
      width: 200,
      height: 200,
      stroke: TOKENS.selectSecondary,
    });
    expect(attrs[2]).toMatchObject({ x: 100, y: 100, width: 600, height: 500 });
    // The primary does not get a secondary outline.
    expect(attrs.some((a) => a.x === 200 && a.y === 200)).toBe(false);
  });

  it('canvas marking and container inside the canvas space', () => {
    const { editor, overlay, render, lit } = multiSetup();
    const created = editor.actions.createMarking(null, {
      x: -100,
      y: -100,
      width: 1800,
      height: 1000,
    });
    const id = created.ok ? created.value : '';
    render({ selection: im('I1'), items: [mk(id), im('I1')] });
    expect(lit()).toEqual([
      expect.objectContaining({ x: -100, y: -100, width: 1800, height: 1000 }),
    ]);
    expect(overlay.selectionOutline.visible()).toBe(true); // the outline of the primary (container)
  });

  it('handles only on the primary (marking), no handles on the others', () => {
    const { overlay, render } = multiSetup();
    render({ selection: mk('M2'), items: [im('I2'), mk('M2')] });
    const visible = [...overlay.handles.values()].filter((h) => h.visible());
    expect(visible).toHaveLength(4);
    // Around M2 (200, 200, 100×100); none at the corners of I2.
    expect(overlay.handles.get('nw')?.getAttrs()).toMatchObject({ x: 195, y: 195 });
    expect(overlay.handles.get('se')?.getAttrs()).toMatchObject({ x: 295, y: 295 });
  });

  it('handles only on the primary (container): the selection outline is its own', () => {
    const { overlay, render, lit } = multiSetup();
    render({ selection: im('I2'), items: [mk('M2'), im('I2')] });
    expect(overlay.selectionOutline.getAttrs()).toMatchObject({
      visible: true,
      x: 1100,
      stroke: TOKENS.select,
    });
    expect(overlay.handles.get('se')?.getAttrs()).toMatchObject({ x: 1595, y: 495 });
    expect(lit()).toHaveLength(1);
    expect(lit()[0]).toMatchObject({ x: 200, y: 200 });
  });

  it('the name tag and the lock belong only to the primary', () => {
    const { editor, overlay, render } = multiSetup();
    expect(editor.actions.setMarkingLocked('M3', true).ok).toBe(true);
    render({ selection: mk('M2'), items: [mk('M3'), mk('M1'), mk('M2')] });
    expect(overlay.nameTag.visible()).toBe(true);
    // pt-BR kept: shared fixture data (sampleProject) asserted by tests/model, tests/components
    expect(overlay.nameTagText.text()).toBe('Maçaneta');
    // M3 (secondary) is locked, but the selection lock belongs to the primary, which is free.
    expect(overlay.selectionLock.group.visible()).toBe(false);
    render({ selection: mk('M3'), items: [mk('M2'), mk('M3')] });
    expect(overlay.selectionLock.group.visible()).toBe(true);
    expect(overlay.nameTag.visible()).toBe(false); // M3 has no name
  });

  it('the outline follows the drag preview (frame positions) and the pool is reused', () => {
    const { overlay, render, lit } = multiSetup();
    const moved = new Map<string, Placement>([
      ['I1', { x: 0, y: 0, scale: 1 }],
      ['I2', { x: 1200, y: 40, scale: 1 }],
    ]);
    render({ selection: mk('M2'), items: [im('I2'), mk('M3'), mk('M2')] }, moved);
    expect(lit()).toEqual([
      expect.objectContaining({ x: 1200, y: 40, width: 500, height: 500 }),
      // M3 moves with the container: x = 1200 + 50, y = 40 + 50.
      expect.objectContaining({ x: 1250, y: 90, width: 200, height: 200 }),
    ]);
    const nodes = overlay.secondaryHighlights().slice();
    render({ selection: mk('M2'), items: [im('I2'), mk('M2')] }, moved);
    expect(lit()).toHaveLength(1);
    expect(overlay.secondaryHighlights()).toHaveLength(2); // the second node only disappears
    expect(overlay.secondaryHighlights()[0]).toBe(nodes[0]);
    render({ selection: mk('M2'), items: [mk('M2')] });
    expect(lit()).toHaveLength(0);
  });

  it('item that stopped existing (after undo) leaves no outline', () => {
    const { render, lit } = multiSetup();
    render({ selection: mk('M2'), items: [mk('Ghost'), im('I9'), mk('M2')] });
    expect(lit()).toHaveLength(0);
  });

  it('without a project, nothing appears', () => {
    const { render, lit } = multiSetup();
    render({ project: null, selection: mk('M2'), items: [im('I2'), mk('M2')] });
    expect(lit()).toHaveLength(0);
  });
});

// Arrows (ME4): highlight of the selected one, handles of the primary, link handle of the marking and the
// provisional arrow of the gesture.
describe('OverlayRenderer: arrows', () => {
  function arrowSetup(project = arrowProject()) {
    const container = document.createElement('div');
    const overlay = new OverlayRenderer(new Konva.Layer(), container);
    const editor = editorFor(project);
    const placements: ReadonlyMap<string, Placement> = new Map([
      ['A', { x: 0, y: 0, scale: 1 }],
      ['B', { x: 2000, y: 0, scale: 2 }],
    ]);
    const render = (overrides: Partial<Frame> = {}) =>
      overlay.render(frameOf(editor, overrides), placements);
    const visible = <T extends { visible(): boolean }>(nodes: readonly T[]) =>
      nodes.filter((n) => n.visible());
    return { overlay, editor, render, visible };
  }

  it('selected arrow: highlight in the selection color, head and one handle per end and per middle', () => {
    const { overlay, render, visible } = arrowSetup();
    render({
      selection: { kind: 'arrow', id: 'r1' },
      items: [{ kind: 'arrow', id: 'r1' }],
    });
    const [highlight] = visible(overlay.arrowHighlightNodes().map((h) => h.line));
    expect(highlight?.getAttrs()).toMatchObject({
      stroke: TOKENS.arrow.select,
      strokeWidth: TOKENS.arrow.widthSelected,
    });
    expect(visible(overlay.arrowHighlightNodes().map((h) => h.head))).toHaveLength(1);
    // Curve without waypoints: the two ends and the middle of the single segment.
    const circles = visible(overlay.arrowHandleCircles());
    expect(circles).toHaveLength(3);
    expect(circles[0]?.getAttrs()).toMatchObject({
      x: 400,
      y: 250,
      fill: TOKENS.arrow.select,
    });
    expect(circles[1]?.getAttrs()).toMatchObject({ x: 600, y: 700 });
    // The middle is smaller and dimmed; the end, larger than the waypoint.
    expect(circles[2]?.opacity()).toBe(TOKENS.opacity.inherited);
    expect(circles[2]?.radius()).toBeLessThan(circles[0]?.radius() ?? 0);
    // No outline, corner handles nor marking tag.
    expect(overlay.selectionOutline.visible()).toBe(false);
    expect([...overlay.handles.values()].every((h) => !h.visible())).toBe(true);
    expect(overlay.linkHandle.visible()).toBe(false);
  });

  it('handles and highlight at screen size: they divide by the zoom', () => {
    const { overlay, render, visible } = arrowSetup();
    render({
      selection: { kind: 'arrow', id: 'r1' },
      viewport: { x: 0, y: 0, scale: 2 },
    });
    const [line] = visible(overlay.arrowHighlightNodes().map((h) => h.line));
    expect(line?.strokeWidth()).toBe(TOKENS.arrow.widthSelected / 2);
    expect(visible(overlay.arrowHandleCircles())[0]?.radius()).toBeCloseTo(
      (TOKENS.handleSize / 2 / 2) * 1.2,
    );
  });

  it('secondary arrow: highlight in the multiple selection color, no handles', () => {
    const { overlay, render, visible } = arrowSetup(
      withArrow(arrowProject(), 'r2', 'a3', 'b2'),
    );
    render({
      selection: { kind: 'arrow', id: 'r2' },
      items: [
        { kind: 'arrow', id: 'r1' },
        { kind: 'arrow', id: 'r2' },
      ],
    });
    const lines = visible(overlay.arrowHighlightNodes().map((h) => h.line));
    expect(lines.map((l) => l.stroke())).toEqual([
      TOKENS.selectSecondary,
      TOKENS.arrow.select,
    ]);
    // Only the primary has handles: its end and the middle of its segment (2 ends and 1 middle).
    const circles = visible(overlay.arrowHandleCircles());
    expect(circles).toHaveLength(3);
    expect(circles[0]?.x()).toBe(800);
  });

  it('locked arrow: no handles and with the lock; read-only and Draw mode too', () => {
    const locked = withArrow(arrowProject(), 'r2', 'a3', 'b2', { locked: true });
    const { overlay, render, visible } = arrowSetup(locked);
    render({ selection: { kind: 'arrow', id: 'r2' } });
    expect(visible(overlay.arrowHandleCircles())).toHaveLength(0);
    expect(overlay.selectionLock.group.visible()).toBe(true);
    expect(visible(overlay.arrowHighlightNodes().map((h) => h.line))).toHaveLength(1);

    render({ selection: { kind: 'arrow', id: 'r1' }, readOnly: true });
    expect(visible(overlay.arrowHandleCircles())).toHaveLength(0);
    expect(overlay.selectionLock.group.visible()).toBe(false);
    render({ selection: { kind: 'arrow', id: 'r1' }, mode: 'draw' });
    expect(visible(overlay.arrowHandleCircles())).toHaveLength(0);
  });

  it('arrow that is not drawn (hidden head) has no highlight nor handles', () => {
    const { overlay, render, visible, editor } = arrowSetup();
    render({
      selection: { kind: 'arrow', id: 'r1' },
      arrows: visibleArrowShapes(
        editor.store.project.peek(),
        new Map([['a3', 'hidden' as const]]),
      ),
    });
    expect(visible(overlay.arrowHighlightNodes().map((h) => h.line))).toHaveLength(0);
    expect(visible(overlay.arrowHandleCircles())).toHaveLength(0);
  });

  it('selected marking: link handle outside the right border; several items, no', () => {
    const { overlay, render } = arrowSetup();
    // a1 (100,100,300,300): the handle at (400 + 14, 250).
    render({ selection: { kind: 'marking', id: 'a1' } });
    expect(overlay.linkHandle.getAttrs()).toMatchObject({
      visible: true,
      x: 414,
      y: 250,
      fill: TOKENS.arrow.select,
    });
    expect(overlay.linkHandle.radius()).toBe(TOKENS.handleSize / 2);
    render({
      selection: { kind: 'marking', id: 'a1' },
      viewport: { x: 0, y: 0, scale: 2 },
    });
    expect(overlay.linkHandle.x()).toBe(407);
    render({
      selection: { kind: 'marking', id: 'a1' },
      items: [
        { kind: 'marking', id: 'a1' },
        { kind: 'marking', id: 'a3' },
      ],
    });
    expect(overlay.linkHandle.visible()).toBe(false);
    render({ selection: { kind: 'marking', id: 'a1' }, readOnly: true });
    expect(overlay.linkHandle.visible()).toBe(false);
    render({ selection: { kind: 'marking', id: 'a1' }, mode: 'draw' });
    expect(overlay.linkHandle.visible()).toBe(false);
    render({ selection: { kind: 'image', id: 'A' } });
    expect(overlay.linkHandle.visible()).toBe(false);
  });

  it('link handle also on the locked marking (creating the arrow does not change it)', () => {
    const { overlay, render, editor } = arrowSetup();
    editor.actions.setMarkingLocked('a1', true);
    render({ selection: { kind: 'marking', id: 'a1' } });
    expect(overlay.linkHandle.visible()).toBe(true);
  });

  it('provisional arrow: dashed, with the head, up to the pointer', () => {
    const { overlay, render } = arrowSetup();
    render({
      arrowDraft: {
        line: { from: { x: 400, y: 250 }, to: { x: 700, y: 250 } },
        target: null,
      },
    });
    expect(overlay.arrowDraftLine.getAttrs()).toMatchObject({
      visible: true,
      points: [400, 250, 700, 250],
      stroke: TOKENS.arrow.select,
    });
    expect(overlay.arrowDraftLine.dash()).toHaveLength(2);
    expect(overlay.arrowDraftHead.points().slice(0, 2)).toEqual([700, 250]);
    render({ arrowDraft: { line: null, target: 'a3' } });
    expect(overlay.arrowDraftLine.visible()).toBe(false);
    expect(overlay.arrowDraftHead.visible()).toBe(false);
  });

  it('the destination marking lights up with the drop target highlight', () => {
    const { overlay, render } = arrowSetup();
    render({ dropTarget: { containerId: null, markingId: 'a3' } });
    expect(overlay.dropRect.getAttrs()).toMatchObject({
      visible: true,
      x: 600,
      y: 600,
      width: 200,
      height: 200,
      stroke: TOKENS.select,
    });
  });
});

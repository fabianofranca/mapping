import Konva from 'konva/lib/Core';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Frame } from '../../../src/canvas/frame';
import { MarkingRenderer } from '../../../src/canvas/renderers/markings';
import { ReviewRenderer } from '../../../src/canvas/renderers/review';
import type { ReviewCanvas } from '../../../src/canvas/reviewMarks';
import type { Placement } from '../../../src/model';
import { editorFor, frameOf, installFakeCanvas, TOKENS } from '../harness';

beforeAll(installFakeCanvas);
afterAll(() => vi.restoreAllMocks());

// Review marks on the canvas: the line (MarkingRenderer) and the badges, ghosts and
// removed ones (ReviewRenderer). Sizes in screen px; colors only from tokens.

const PLACEMENTS: ReadonlyMap<string, Placement> = new Map([
  ['I1', { x: 0, y: 0, scale: 1 }],
  ['I2', { x: 1100, y: 0, scale: 1 }],
]);
const SIZE = { width: 1800, height: 900 };

function review(partial: Partial<ReviewCanvas>): ReviewCanvas {
  return {
    view: 'proposed',
    markings: new Map(),
    images: new Map(),
    ghosts: [],
    removed: [],
    ...partial,
  };
}

function setup() {
  const editor = editorFor();
  const frame = (r: ReviewCanvas | null, overrides: Partial<Frame> = {}) =>
    frameOf(editor, { size: SIZE, review: r, ...overrides });
  return { editor, frame };
}

describe('marking line in the review', () => {
  it('created dashed, changed double, rejected dotted and dimmed, invalid', () => {
    const { frame } = setup();
    const renderer = new MarkingRenderer(new Konva.Layer());
    renderer.render(
      frame(
        review({
          markings: new Map([
            ['M1', { line: 'changed', dim: false, badges: ['changed'] }],
            ['M2', { line: 'created', dim: false, badges: ['created'] }],
            ['M3', { line: 'rejected', dim: true, badges: ['rejected'] }],
          ]),
        }),
      ),
      PLACEMENTS,
    );
    const m1 = renderer.node('M1');
    expect(m1?.border.strokeWidth()).toBe(3);
    expect(m1?.inner?.visible()).toBe(true);
    expect(m1?.inner?.stroke()).toBe(TOKENS.halo);
    expect(renderer.node('M2')?.border.dash()).toEqual([6, 4]);
    expect(renderer.node('M2')?.inner?.visible() ?? false).toBe(false);
    expect(renderer.node('M3')?.border.dash()).toEqual([1.5, 2.5]);

    // Rejected (Current view): dimmed (M1 has an annotation, so it is not dimmed because of that).
    renderer.render(
      frame(
        review({
          view: 'current',
          markings: new Map([
            ['M1', { line: 'rejected', dim: true, badges: ['rejected'] }],
          ]),
        }),
      ),
      PLACEMENTS,
    );
    expect(renderer.node('M1')?.group.opacity()).toBe(TOKENS.opacity.ancestor);

    renderer.render(
      frame(
        review({
          markings: new Map([
            ['M1', { line: 'invalid', dim: false, badges: ['invalid'] }],
          ]),
        }),
      ),
      PLACEMENTS,
    );
    expect(renderer.node('M1')?.border.stroke()).toBe(TOKENS.invalid);
    expect(renderer.node('M1')?.border.dash()).toEqual([6, 4]);
  });
});

describe('ReviewRenderer', () => {
  it('selos no canto superior direito, fantasma pontilhado e removida com hachura', () => {
    const { frame } = setup();
    const layer = new Konva.Layer();
    const renderer = new ReviewRenderer(layer);
    renderer.render(
      frame(
        review({
          markings: new Map([
            ['M1', { line: 'changed', dim: false, badges: ['conflict', 'changed'] }],
          ]),
          ghosts: [
            {
              key: 'moved:M2',
              placement: { x: 0, y: 0, scale: 1 },
              rect: { x: 10, y: 10, width: 100, height: 100 },
              name: null,
              badges: [],
            },
          ],
          removed: [
            {
              key: 'marking:M9',
              placement: { x: 0, y: 0, scale: 1 },
              rect: { x: 300, y: 300, width: 200, height: 100 },
              name: 'Banner',
              badges: ['removed'],
            },
          ],
        }),
      ),
      PLACEMENTS,
    );
    const rects = layer.find('Rect');
    // Two badges of M1 (conflict in cv-warning and the type in cv-line) over cv-badge.
    const badges = rects.filter((r) => r.getAttr('fill') === TOKENS.badge);
    expect(badges.map((b) => b.getAttr('stroke')).sort()).toEqual(
      [TOKENS.line, TOKENS.warning, TOKENS.line].sort(),
    );
    // Fantasma pontilhado e esmaecido.
    const ghost = rects.find(
      (r) => r.getAttr('x') === 10 && r.getAttr('stroke') === TOKENS.line,
    );
    expect(ghost?.getAttr('dash')).toEqual([1.5, 3]);
    // Removida: nome riscado.
    const name = layer.find('Text')[0];
    expect(name?.getAttr('text')).toBe('Banner');

    // Without a review, nothing is drawn.
    renderer.render(frame(null), PLACEMENTS);
    expect(layer.getChildren()).toHaveLength(0);
  });

  it('huge removed one with high zoom: the hatching only covers the visible area', () => {
    const { frame } = setup();
    const layer = new Konva.Layer();
    const renderer = new ReviewRenderer(layer);
    const zoom = 8;
    // 40,000 × 40,000 units, with the screen (1800 × 900 px at 8×) seeing only a corner of it.
    renderer.render(
      frame(
        review({
          removed: [
            {
              key: 'marking:M9',
              placement: { x: 0, y: 0, scale: 1 },
              rect: { x: 0, y: 0, width: 40000, height: 40000 },
              name: null,
              badges: ['removed'],
            },
          ],
        }),
        { viewport: { x: 0, y: 0, scale: zoom } },
      ),
      PLACEMENTS,
    );
    const hatch = layer.find('Shape').find((n) => n.getAttr('sceneFunc'));
    let strokes = 0;
    let lines = 0;
    const ctx = {
      save: () => undefined,
      restore: () => undefined,
      beginPath: () => undefined,
      rect: () => undefined,
      clip: () => undefined,
      moveTo: () => undefined,
      lineTo: () => (lines += 1),
      setAttr: () => undefined,
      stroke: () => (strokes += 1),
    };
    (hatch?.getAttr('sceneFunc') as (c: unknown) => void)(ctx);
    expect(strokes).toBe(2);
    // Only the screen diagonals (about a thousand, the period is fixed in screen px), and not the ~320 thousand
    // of the whole rectangle.
    expect(lines).toBeGreaterThan(0);
    expect(lines).toBeLessThan(2000);
  });

  it.each([0.56, 1.1])(
    'removed: the name strike is its own stroke, visible over the text, at %s of zoom',
    (zoom) => {
      const { frame } = setup();
      const layer = new Konva.Layer();
      const renderer = new ReviewRenderer(layer);
      const shape = (key: string, badges: ('removed' | 'rejected')[]) => ({
        key,
        placement: { x: 0, y: 0, scale: 1 },
        rect: { x: 300, y: 300, width: 200, height: 100 },
        name: 'Banner',
        badges,
      });
      renderer.render(
        frame(review({ removed: [shape('marking:M9', ['removed'])] }), {
          viewport: { x: 0, y: 0, scale: zoom },
        }),
        PLACEMENTS,
      );
      const name = layer.find('Text')[0];
      const strike = layer.find('.review-strike')[0];
      const halo = layer.find('.review-strike-halo')[0];
      expect(strike?.visible()).toBe(true);
      // The strike uses the canvas line and a halo underneath, so it does not vanish over the text
      // (Konva's uses the text fill, at ~0.8 px, and vanishes into it).
      expect(strike?.getAttr('stroke')).toBe(TOKENS.line);
      expect(halo?.getAttr('stroke')).toBe(TOKENS.halo);
      expect(strike?.getAttr('strokeWidth') * zoom).toBeCloseTo(1.5);
      expect(halo?.getAttr('strokeWidth')).toBeGreaterThan(
        strike?.getAttr('strokeWidth'),
      );
      // Crosses the text: starts and ends at the x of the name and stays between its top and bottom.
      const points = strike?.getAttr('points') as number[];
      const textTop = name?.y() ?? 0;
      const textHeight = Number(name?.getAttr('fontSize') ?? 0);
      expect(points[0]).toBe(name?.x());
      expect(points[2]).toBeGreaterThan(points[0] ?? 0);
      expect(points[1]).toBeGreaterThan(textTop);
      expect(points[1]).toBeLessThan(textTop + textHeight);
      // Konva no longer draws the strike (it vanishes over the white text).
      expect(name?.getAttr('textDecoration')).toBe('');

      // Rejected name (ghost) gets no strike.
      renderer.render(
        frame(review({ ghosts: [shape('rejected:M7', ['rejected'])] }), {
          viewport: { x: 0, y: 0, scale: zoom },
        }),
        PLACEMENTS,
      );
      expect(layer.find('.review-strike').every((n) => !n.visible())).toBe(true);
    },
  );

  it('ghost of the rejected creation in the Proposed view: dotted 1.5/2.5, name and ✕ badge', () => {
    const { frame } = setup();
    const layer = new Konva.Layer();
    const renderer = new ReviewRenderer(layer);
    renderer.render(
      frame(
        review({
          view: 'proposed',
          ghosts: [
            {
              key: 'rejected:M7',
              placement: { x: 0, y: 0, scale: 1 },
              rect: { x: 20, y: 30, width: 120, height: 80 },
              name: 'Novo',
              badges: ['rejected'],
            },
          ],
        }),
      ),
      PLACEMENTS,
    );
    const ghost = layer
      .find('Rect')
      .find((r) => r.getAttr('x') === 20 && r.getAttr('stroke') === TOKENS.line);
    expect(ghost?.getAttr('dash')).toEqual([1.5, 2.5]);
    expect(layer.find('Text').map((t) => t.getAttr('text'))).toContain('Novo');
    expect(layer.find('Rect').some((r) => r.getAttr('fill') === TOKENS.badge)).toBe(true);
  });
});

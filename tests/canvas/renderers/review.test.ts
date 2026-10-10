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

// Marcas de revisão no canvas: a linha (MarkingRenderer) e os selos, fantasmas e
// removidas (ReviewRenderer). Tamanhos em px de tela; cores só dos tokens.

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

describe('linha das marcações na revisão', () => {
  it('criada tracejada, alterada dupla, rejeitada pontilhada e esmaecida, inválida', () => {
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
    expect(m1?.inner.visible()).toBe(true);
    expect(m1?.inner.stroke()).toBe(TOKENS.halo);
    expect(renderer.node('M2')?.border.dash()).toEqual([6, 4]);
    expect(renderer.node('M2')?.inner.visible()).toBe(false);
    expect(renderer.node('M3')?.border.dash()).toEqual([1.5, 2.5]);

    // Rejeitada (visão Atual): esmaecida (M1 tem anotação, então não está esmaecida por isso).
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
    // Dois selos de M1 (conflito em cv-warning e o tipo em cv-line) sobre cv-badge.
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
    expect(name?.getAttr('textDecoration')).toBe('line-through');

    // Sem revisão, nada fica desenhado.
    renderer.render(frame(null), PLACEMENTS);
    expect(layer.getChildren()).toHaveLength(0);
  });
});

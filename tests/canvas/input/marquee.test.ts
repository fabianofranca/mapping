import { describe, expect, it } from 'vitest';
import { visibleArrowShapes } from '../../../src/canvas/arrowGeometry';
import {
  marqueeItems,
  rectFromCorners,
  treeOrder,
} from '../../../src/canvas/input/marquee';
import {
  setImageLocked,
  setMarkingLocked,
  type MarkingVisibility,
  type Project,
  type Rect,
} from '../../../src/model';
import type { SelectionItem } from '../../../src/store/ui';
import { arrowProject } from '../../model/arrowFixtures';
import { multiProject } from '../../model/multiSelectionFixtures';

const r = (x: number, y: number, width: number, height: number): Rect => ({
  x,
  y,
  width,
  height,
});
const image = (id: string): SelectionItem => ({ kind: 'image', id });
const marking = (id: string): SelectionItem => ({ kind: 'marking', id });
const arrow = (id: string): SelectionItem => ({ kind: 'arrow', id });
const NONE: ReadonlyMap<string, MarkingVisibility> = new Map();

/** Items inside `rect`, with the arrows drawn (or none). */
function pick(
  project: Project,
  rect: Rect,
  options: { visibility?: ReadonlyMap<string, MarkingVisibility>; arrows?: boolean } = {},
): SelectionItem[] {
  const visibility = options.visibility ?? NONE;
  return marqueeItems(project, rect, {
    visibility,
    arrows: options.arrows ? visibleArrowShapes(project, visibility) : [],
  });
}

describe('rectFromCorners', () => {
  it('normalizes the corners in any direction, without rounding', () => {
    expect(rectFromCorners({ x: 10.5, y: 40 }, { x: 2, y: 5.25 })).toEqual(
      r(2, 5.25, 8.5, 34.75),
    );
    expect(rectFromCorners({ x: 1, y: 2 }, { x: 4, y: 8 })).toEqual(r(1, 2, 3, 6));
  });
});

describe('treeOrder', () => {
  it('follows the Tree window: canvas (marking, children, member containers, arrows) and then the loose containers', () => {
    expect(treeOrder(multiProject())).toEqual([
      marking('G'),
      marking('G2'),
      image('A'),
      marking('a1'),
      marking('a2'),
      marking('a3'),
      image('B'),
      marking('b1'),
      image('C'),
      marking('c1'),
      marking('N'),
      marking('H'),
      image('D'),
      image('E'),
      marking('e1'),
    ]);
  });

  it('the arrow comes right after the children of the source marking', () => {
    const order = treeOrder(arrowProject());
    const at = (item: SelectionItem) =>
      order.findIndex((i) => i.kind === item.kind && i.id === item.id);
    expect(at(arrow('r1'))).toBe(at(marking('a2')) + 1);
  });
});

describe('marqueeItems', () => {
  const base = multiProject();

  it('what is entirely inside is picked; what crosses the edge is left out', () => {
    // A (0..1000) fits in (-10..1010); G2 (-50..1050) crosses the edge.
    expect(pick(base, r(-10, -10, 1020, 1020))).toEqual([image('A')]);
    expect(pick(base, r(10, 10, 980, 980))).not.toContainEqual(image('A'));
  });

  it('a coincident edge counts as inside', () => {
    expect(pick(base, r(0, 0, 1000, 1000))).toEqual([image('A')]);
  });

  it('container: picked with its rectangle on the canvas (scale applied)', () => {
    // B is 500×500 with scale 2 at (2000,0): 1000×1000 on the canvas.
    expect(pick(base, r(1990, -10, 1020, 1020))).toEqual([image('B')]);
    expect(pick(base, r(1990, -10, 600, 1020))).toEqual([marking('b1')]);
  });

  it('container marking is picked by its rectangle on the canvas', () => {
    expect(pick(base, r(90, 90, 320, 320))).toEqual([marking('a1')]);
    expect(pick(base, r(2090, 90, 220, 220))).toEqual([marking('b1')]);
  });

  it('canvas marking and floating marking are picked', () => {
    expect(pick(base, r(390, 1290, 220, 120))).toEqual([marking('H')]);
    expect(pick(base, r(90, 1290, 220, 120))).toEqual([marking('N')]);
  });

  it('arrow: picked with all route points inside; with no arrow drawn, it is not picked', () => {
    const p = arrowProject();
    const around = r(90, 90, 720, 720);
    expect(pick(p, around, { arrows: true })).toEqual([
      marking('a1'),
      arrow('r1'),
      marking('a3'),
    ]);
    expect(pick(p, around)).toEqual([marking('a1'), marking('a3')]);
  });

  it('arrow with one end outside the rectangle is not picked', () => {
    expect(pick(arrowProject(), r(90, 90, 320, 320), { arrows: true })).toEqual([
      marking('a1'),
    ]);
  });

  it('invisible marking is not picked; locked one is', () => {
    const hidden = new Map<string, MarkingVisibility>([['a1', 'hidden']]);
    expect(pick(base, r(90, 90, 320, 320), { visibility: hidden })).toEqual([
      marking('a2'),
    ]);
    const locked = setMarkingLocked(base, 'a1', true);
    expect(pick(locked, r(90, 90, 320, 320))).toEqual([marking('a1')]);
    expect(pick(setImageLocked(base, 'A', true), r(-10, -10, 1020, 1020))).toEqual([
      image('A'),
    ]);
  });

  it('outermost only: the marking of a container that was picked is not picked', () => {
    expect(pick(base, r(-10, -10, 1020, 1020))).toEqual([image('A')]);
  });

  it('outermost only: the descendant of a marking that was picked is not picked', () => {
    // a2 is inside a1: only a1.
    expect(pick(base, r(90, 90, 320, 320))).toEqual([marking('a1')]);
  });

  it('outermost only: on the canvas nothing carries anything (container inside a canvas marking is picked)', () => {
    expect(pick(base, r(-60, -60, 1120, 1120))).toEqual([marking('G2'), image('A')]);
  });

  it('descendant whose ancestor was not picked is still picked', () => {
    const hidden = new Map<string, MarkingVisibility>([['a1', 'hidden']]);
    expect(pick(base, r(140, 140, 120, 120), { visibility: hidden })).toEqual([
      marking('a2'),
    ]);
  });

  it('the result follows the Tree order', () => {
    expect(pick(base, r(-200, -200, 12000, 2000))).toEqual([
      marking('G'),
      marking('G2'),
      image('A'),
      image('B'),
      image('C'),
      marking('N'),
      marking('H'),
      image('D'),
      image('E'),
    ]);
  });
});

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

/** Itens dentro de `rect`, com as setas desenhadas (ou nenhuma). */
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
  it('normaliza os cantos em qualquer direção, sem arredondar', () => {
    expect(rectFromCorners({ x: 10.5, y: 40 }, { x: 2, y: 5.25 })).toEqual(
      r(2, 5.25, 8.5, 34.75),
    );
    expect(rectFromCorners({ x: 1, y: 2 }, { x: 4, y: 8 })).toEqual(r(1, 2, 3, 6));
  });
});

describe('treeOrder', () => {
  it('segue a janela Árvore: canvas (marcação, filhas, containers membros, setas) e depois os containers soltos', () => {
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

  it('a seta fica logo depois das filhas da marcação de origem', () => {
    const order = treeOrder(arrowProject());
    const at = (item: SelectionItem) =>
      order.findIndex((i) => i.kind === item.kind && i.id === item.id);
    expect(at(arrow('r1'))).toBe(at(marking('a2')) + 1);
  });
});

describe('marqueeItems', () => {
  const base = multiProject();

  it('entra o que está inteiro dentro; a borda que cruza deixa de fora', () => {
    // A (0..1000) cabe em (-10..1010); G2 (-50..1050) cruza a borda.
    expect(pick(base, r(-10, -10, 1020, 1020))).toEqual([image('A')]);
    expect(pick(base, r(10, 10, 980, 980))).not.toContainEqual(image('A'));
  });

  it('a borda coincidente conta como dentro', () => {
    expect(pick(base, r(0, 0, 1000, 1000))).toEqual([image('A')]);
  });

  it('container: entra com o retângulo dele no canvas (escala aplicada)', () => {
    // B é 500×500 com escala 2 em (2000,0): 1000×1000 no canvas.
    expect(pick(base, r(1990, -10, 1020, 1020))).toEqual([image('B')]);
    expect(pick(base, r(1990, -10, 600, 1020))).toEqual([marking('b1')]);
  });

  it('marcação de container entra pelo retângulo no canvas', () => {
    expect(pick(base, r(90, 90, 320, 320))).toEqual([marking('a1')]);
    expect(pick(base, r(2090, 90, 220, 220))).toEqual([marking('b1')]);
  });

  it('marcação do canvas e flutuante entram', () => {
    expect(pick(base, r(390, 1290, 220, 120))).toEqual([marking('H')]);
    expect(pick(base, r(90, 1290, 220, 120))).toEqual([marking('N')]);
  });

  it('seta: entra com todos os pontos da rota dentro; sem seta desenhada, não entra', () => {
    const p = arrowProject();
    const around = r(90, 90, 720, 720);
    expect(pick(p, around, { arrows: true })).toEqual([
      marking('a1'),
      arrow('r1'),
      marking('a3'),
    ]);
    expect(pick(p, around)).toEqual([marking('a1'), marking('a3')]);
  });

  it('seta com uma ponta fora do retângulo não entra', () => {
    expect(pick(arrowProject(), r(90, 90, 320, 320), { arrows: true })).toEqual([
      marking('a1'),
    ]);
  });

  it('marcação invisível não entra; trancada entra', () => {
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

  it('só os de fora: a marcação de um container que entrou não entra', () => {
    expect(pick(base, r(-10, -10, 1020, 1020))).toEqual([image('A')]);
  });

  it('só os de fora: a descendente de uma marcação que entrou não entra', () => {
    // a2 está dentro de a1: só a1.
    expect(pick(base, r(90, 90, 320, 320))).toEqual([marking('a1')]);
  });

  it('só os de fora: no canvas nada leva nada (container dentro de marcação do canvas entra)', () => {
    expect(pick(base, r(-60, -60, 1120, 1120))).toEqual([marking('G2'), image('A')]);
  });

  it('descendente cujo ancestral não entrou continua entrando', () => {
    const hidden = new Map<string, MarkingVisibility>([['a1', 'hidden']]);
    expect(pick(base, r(140, 140, 120, 120), { visibility: hidden })).toEqual([
      marking('a2'),
    ]);
  });

  it('o resultado segue a ordem da Árvore', () => {
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

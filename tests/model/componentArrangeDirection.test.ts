import { describe, expect, it } from 'vitest';
import {
  addComponentMarking,
  approximateMeasurer,
  arrangeMarking,
  componentPlacement,
  createDrawingCache,
  setContainerDirection,
  setProjectDirection,
  type NewComponentArgs,
  type Project,
  type Rect,
} from '../../src/model';
import { SPEC_ID, componentProject, testCatalog } from './componentFixtures';
import { marking } from './fixtures';

// Direção (schema v20): a efetiva do espaço da marcação chega ao Arrumar e ao desenho. Em `rtl`
// a linha corre da direita para a esquerda (R1 espelha no motor; aqui o projeto escolhe).

const catalog = testCatalog();
const box = (x: number, y: number, width: number, height: number): Rect => ({
  x,
  y,
  width,
  height,
});

function add(
  p: Project,
  id: string,
  typeId: string,
  rect: Rect,
  parentId: string | null = null,
  extra: Partial<NewComponentArgs> = {},
): Project {
  return addComponentMarking(
    p,
    catalog,
    {
      markingId: id,
      annotationId: `A_${id}`,
      containerId: 'I1',
      parentId,
      specId: SPEC_ID,
      typeId,
      rect,
      ...extra,
    },
    approximateMeasurer,
  );
}

/** Linha de 300×100 em (100,100) com duas filhas de 100×40 fora de ordem. */
function row(): Project {
  let p = add(componentProject(), 'C', 'row', box(100, 100, 300, 100));
  p = add(p, 'T1', 'text', box(150, 150, 100, 40), 'C');
  p = add(p, 'T2', 'text', box(300, 120, 100, 40), 'C');
  return p;
}

const arrange = (p: Project) => arrangeMarking(p, catalog, 'C', approximateMeasurer);
const rectOf = (p: Project, id: string): Rect => marking(p, id).rect;

describe('Arrumar com a direção efetiva', () => {
  it('ltr (padrão): a primeira filha no começo à esquerda', () => {
    const { project } = arrange(row());
    expect(rectOf(project, 'T1')).toEqual(box(100, 100, 100, 40));
    expect(rectOf(project, 'T2')).toEqual(box(208, 100, 100, 40));
  });

  it('rtl no projeto: a linha corre da direita para a esquerda', () => {
    const { project } = arrange(setProjectDirection(row(), 'rtl'));
    expect(rectOf(project, 'T1')).toEqual(box(300, 100, 100, 40));
    expect(rectOf(project, 'T2')).toEqual(box(192, 100, 100, 40));
  });

  it('rtl fixado no container vale mesmo com o projeto em ltr', () => {
    const { project } = arrange(setContainerDirection(row(), 'I1', 'rtl'));
    expect(rectOf(project, 'T1')).toEqual(box(300, 100, 100, 40));
  });

  it('o container que fixa ltr num projeto rtl arruma em ltr', () => {
    const p = setContainerDirection(setProjectDirection(row(), 'rtl'), 'I1', 'ltr');
    expect(rectOf(arrange(p).project, 'T1')).toEqual(box(100, 100, 100, 40));
  });

  it('o ponto de uma filha nova segue a direção: depois da última, à esquerda dela', () => {
    const arranged = (dir: 'ltr' | 'rtl') =>
      arrange(setProjectDirection(row(), dir)).project;
    const place = (p: Project): Rect =>
      componentPlacement(
        p,
        catalog,
        {
          containerId: 'I1',
          parentId: 'C',
          specId: SPEC_ID,
          typeId: 'text',
          size: { width: 40, height: 24 },
        },
        approximateMeasurer,
      );
    expect(place(arranged('ltr')).x).toBeGreaterThan(rectOf(arranged('ltr'), 'T2').x);
    expect(place(arranged('rtl')).x).toBeLessThan(rectOf(arranged('rtl'), 'T2').x);
  });
});

describe('desenho com a direção efetiva', () => {
  it('o desenho em rtl espelha a linha em relação ao ltr', () => {
    // `wide`: duas caixas numa linha, que o motor espelha em rtl.
    const p = add(componentProject(), 'C', 'wide', box(100, 100, 300, 100));
    const ltr = createDrawingCache()(p, catalog, approximateMeasurer, 0).get('C');
    const rtl = createDrawingCache()(
      setProjectDirection(p, 'rtl'),
      catalog,
      approximateMeasurer,
      0,
    ).get('C');
    const xs = (d: typeof ltr) => d?.root.children?.map((n) => n.transform[4]);
    expect(xs(ltr)).toHaveLength(2);
    // Caixas de 80 numa linha de 300: [0, 80] em ltr e, espelhadas, [220, 140] em rtl.
    expect(xs(ltr)).toEqual([0, 80]);
    expect(xs(rtl)).toEqual([220, 140]);
  });
});

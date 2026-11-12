// O Arrumar (`arrangeMarking`) grava as filhas nas células de um slot em grade (decisão 15 da #1078).
import { describe, expect, it } from 'vitest';
import {
  addComponentMarking,
  approximateMeasurer,
  arrangeMarking,
  canArrange,
  setFieldValue,
  type ComponentCatalog,
  type Project,
  type Rect,
} from '../../src/model';
import { SPEC_ID, componentProject } from './componentFixtures';
import { gridCatalog } from './gridFixtures';
import { expectValid, marking } from './fixtures';

const box = (x: number, y: number, width: number, height: number): Rect => ({
  x,
  y,
  width,
  height,
});

function withKids(
  catalog: ComponentCatalog,
  rect: Rect,
  kids: Rect[],
  typeId = 'row',
): Project {
  let p = addComponentMarking(
    componentProject(),
    catalog,
    {
      markingId: 'C',
      annotationId: 'A_C',
      containerId: 'I1',
      parentId: null,
      specId: SPEC_ID,
      typeId,
      rect,
      name: 'Grade',
    },
    approximateMeasurer,
  );
  kids.forEach((kid, i) => {
    p = addComponentMarking(
      p,
      catalog,
      {
        markingId: `T${i + 1}`,
        annotationId: `A_T${i + 1}`,
        containerId: 'I1',
        parentId: 'C',
        specId: SPEC_ID,
        typeId: 'text',
        rect: kid,
        name: `T${i + 1}`,
      },
      approximateMeasurer,
    );
  });
  return p;
}

const kidAt = (i: number) => box(100 + i, 100 + i, 100, 40);

describe('arrangeMarking: slot em grade', () => {
  it('um container com slot grid se arruma', () => {
    const catalog = gridCatalog('row', { columns: 3 });
    const p = withKids(catalog, box(100, 100, 340, 200), [kidAt(0)]);
    expect(canArrange(p, catalog, 'C')).toBe(true);
  });

  it('grava as filhas nas células: 3 colunas, 7 filhas', () => {
    const catalog = gridCatalog('row', { columns: 3 });
    const kids = Array.from({ length: 7 }, (_, i) => kidAt(i));
    const p = withKids(catalog, box(100, 100, 340, 400), kids);
    const { project, warnings } = arrangeMarking(p, catalog, 'C', approximateMeasurer);
    // trilha: (340 - 16) / 3 = 108; passo 116; filhas de 100 × 40, sem lineGap.
    const at = (i: number) => {
      const { x, y } = marking(project, `T${i + 1}`).rect;
      return [x, y];
    };
    expect(Array.from({ length: 7 }, (_, i) => at(i))).toEqual([
      [100, 100],
      [216, 100],
      [332, 100],
      [100, 140],
      [216, 140],
      [332, 140],
      [100, 180],
    ]);
    expect(warnings).toEqual([]);
    expectValid(project);
  });

  it('padding, lineGap e justify center valem', () => {
    const catalog = gridCatalog('row', { columns: 2, lineGap: 10, justify: 'center' });
    let p = withKids(catalog, box(100, 100, 300, 300), [kidAt(0), kidAt(1), kidAt(2)]);
    p = setFieldValue(p, 'A_C', 'padding', 4);
    const { project } = arrangeMarking(p, catalog, 'C', approximateMeasurer);
    // conteúdo 292, trilha (292 - 8) / 2 = 142; a filha de 100 centra: +21.
    expect(marking(project, 'T1').rect).toEqual(box(125, 104, 100, 40));
    expect(marking(project, 'T2').rect).toEqual(box(275, 104, 100, 40));
    expect(marking(project, 'T3').rect).toEqual(box(125, 154, 100, 40));
  });

  it('rows: 2 preenche colunas', () => {
    const catalog = gridCatalog('row', { rows: 2 });
    const p = withKids(catalog, box(100, 100, 300, 200), [kidAt(0), kidAt(1), kidAt(2)]);
    const { project } = arrangeMarking(p, catalog, 'C', approximateMeasurer);
    // trilha (linha): (200 - 8) / 2 = 96, passo 104; colunas de 100 de largura.
    expect(marking(project, 'T1').rect).toEqual(box(100, 100, 100, 40));
    expect(marking(project, 'T2').rect).toEqual(box(100, 204, 100, 40));
    expect(marking(project, 'T3').rect).toEqual(box(200, 100, 100, 40));
  });

  it('reverse põe a última filha na primeira célula', () => {
    const catalog = gridCatalog('row', { columns: 2, reverse: true });
    const p = withKids(catalog, box(100, 100, 340, 200), [kidAt(0), kidAt(1), kidAt(2)]);
    const { project } = arrangeMarking(p, catalog, 'C', approximateMeasurer);
    expect(marking(project, 'T3').rect.x).toBe(100);
    expect(marking(project, 'T3').rect.y).toBe(100);
    expect(marking(project, 'T1').rect.y).toBe(140);
  });

  it('container hug abraça a grade (colunas pela maior filha, linhas somadas)', () => {
    const catalog = gridCatalog('rowhug', { columns: 2, lineGap: 4 });
    const kids = [0, 1, 2, 3].map(kidAt);
    const p = withKids(catalog, box(100, 100, 200, 60), kids, 'rowhug');
    const { project } = arrangeMarking(p, catalog, 'C', approximateMeasurer);
    // 2 × 100 + 8 de largura; 2 linhas de 40 + 4 de altura.
    expect(marking(project, 'C').rect).toEqual(box(100, 100, 208, 84));
    expect(marking(project, 'T4').rect).toEqual(box(208, 144, 100, 40));
  });

  it('minColumnWidth: o hug mede com o espaço do slot', () => {
    const catalog = gridCatalog('row', { minColumnWidth: 100 });
    const kids = [0, 1, 2, 3].map(kidAt);
    const p = withKids(catalog, box(100, 100, 340, 300), kids);
    const { project } = arrangeMarking(p, catalog, 'C', approximateMeasurer);
    // floor((340 + 8) / 108) = 3 colunas de 108.
    expect(marking(project, 'T3').rect.x).toBe(332);
    expect(marking(project, 'T4').rect).toEqual(box(100, 140, 100, 40));
  });

  it('minColumnWidth com a altura hug: as colunas saem da largura do slot', () => {
    const catalog = gridCatalog('columnstretch', { minColumnWidth: 100, lineGap: 2 });
    const kids = [0, 1, 2, 3].map(kidAt);
    const p = withKids(catalog, box(100, 100, 340, 300), kids, 'columnstretch');
    const { project } = arrangeMarking(p, catalog, 'C', approximateMeasurer);
    // 3 colunas: 2 linhas de 40 + lineGap 2 (e não 4 linhas numa coluna só).
    expect(marking(project, 'C').rect).toEqual(box(100, 100, 340, 82));
    expect(marking(project, 'T4').rect).toEqual(box(100, 142, 100, 40));
  });
});

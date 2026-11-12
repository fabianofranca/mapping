// A filha nova entra na próxima célula livre de um slot em grade (decisão 15 da #1078).
import { describe, expect, it } from 'vitest';
import {
  addComponentMarking,
  approximateMeasurer,
  arrangeMarking,
  setFieldValue,
  type ComponentCatalog,
  type NewComponentArgs,
  type Project,
  type Rect,
} from '../../src/model';
import { SPEC_ID, componentProject } from './componentFixtures';
import { gridCatalog } from './gridFixtures';
import { expectValid, marking } from './fixtures';

function add(
  p: Project,
  catalog: ComponentCatalog,
  id: string,
  typeId: string,
  extra: Partial<NewComponentArgs> = {},
): Project {
  return addComponentMarking(
    p,
    catalog,
    {
      markingId: id,
      annotationId: `A_${id}`,
      containerId: 'I1',
      parentId: null,
      specId: SPEC_ID,
      typeId,
      ...extra,
    },
    approximateMeasurer,
  );
}

const rectOf = (p: Project, id: string): Rect => marking(p, id).rect;
const container = (catalog: ComponentCatalog, rect: Rect) =>
  add(componentProject(), catalog, 'C', 'row', { rect });
const kid = (p: Project, catalog: ComponentCatalog, n: number, rect?: Rect) =>
  add(p, catalog, `T${n}`, 'text', { parentId: 'C', ...(rect ? { rect } : {}) });

describe('componentPlacement em slot grid', () => {
  it('a primeira filha vai para a primeira célula e as seguintes para as próximas', () => {
    const catalog = gridCatalog('row', { columns: 3 });
    let p = container(catalog, { x: 100, y: 100, width: 340, height: 300 });
    for (const n of [1, 2, 3, 4]) p = kid(p, catalog, n);
    // trilha (340 - 16) / 3 = 108; passo 116; filhas de 100 × 40.
    expect(rectOf(p, 'T1')).toEqual({ x: 100, y: 100, width: 100, height: 40 });
    expect(rectOf(p, 'T2')).toEqual({ x: 216, y: 100, width: 100, height: 40 });
    expect(rectOf(p, 'T3')).toEqual({ x: 332, y: 100, width: 100, height: 40 });
    expect(rectOf(p, 'T4')).toEqual({ x: 100, y: 140, width: 100, height: 40 });
    expectValid(p);
  });

  it('com o padding e o lineGap do slot', () => {
    const catalog = gridCatalog('row', { columns: 2, lineGap: 6 });
    let p = container(catalog, { x: 100, y: 100, width: 300, height: 300 });
    p = setFieldValue(p, 'A_C', 'padding', 4);
    for (const n of [1, 2, 3]) p = kid(p, catalog, n);
    // conteúdo 292, trilha (292 - 8) / 2 = 142, passo 150.
    expect(rectOf(p, 'T2')).toEqual({ x: 254, y: 104, width: 100, height: 40 });
    expect(rectOf(p, 'T3')).toEqual({ x: 104, y: 150, width: 100, height: 40 });
  });

  it('a célula livre no meio vem antes do fim', () => {
    const catalog = gridCatalog('row', { columns: 3 });
    let p = container(catalog, { x: 100, y: 100, width: 340, height: 300 });
    p = kid(p, catalog, 1, { x: 100, y: 100, width: 100, height: 40 });
    p = kid(p, catalog, 2, { x: 332, y: 100, width: 100, height: 40 });
    p = kid(p, catalog, 3);
    expect(rectOf(p, 'T3')).toEqual({ x: 216, y: 100, width: 100, height: 40 });
  });

  it('com o Arrumar já feito, a nova entra na célula depois da última', () => {
    const catalog = gridCatalog('row', { columns: 3, lineGap: 4 });
    let p = container(catalog, { x: 100, y: 100, width: 340, height: 300 });
    for (const n of [1, 2, 3, 4]) p = kid(p, catalog, n);
    p = arrangeMarking(p, catalog, 'C', approximateMeasurer).project;
    p = kid(p, catalog, 5);
    expect(rectOf(p, 'T4')).toEqual({ x: 100, y: 144, width: 100, height: 40 });
    expect(rectOf(p, 'T5')).toEqual({ x: 216, y: 144, width: 100, height: 40 });
  });

  it('todas as células ocupadas: a primeira depois da última linha', () => {
    const catalog = gridCatalog('row', { columns: 2 });
    let p = container(catalog, { x: 100, y: 100, width: 300, height: 300 });
    for (const n of [1, 2]) p = kid(p, catalog, n);
    p = kid(p, catalog, 3);
    expect(rectOf(p, 'T3')).toEqual({ x: 100, y: 140, width: 100, height: 40 });
  });

  it('grade horizontal (rows): preenche colunas, de cima para baixo', () => {
    const catalog = gridCatalog('row', { rows: 2 });
    let p = container(catalog, { x: 100, y: 100, width: 300, height: 200 });
    for (const n of [1, 2, 3]) p = kid(p, catalog, n);
    // trilha (linha): (200 - 8) / 2 = 96, passo 104; colunas de 100.
    expect(rectOf(p, 'T2')).toEqual({ x: 100, y: 204, width: 100, height: 40 });
    expect(rectOf(p, 'T3')).toEqual({ x: 200, y: 100, width: 100, height: 40 });
  });
});

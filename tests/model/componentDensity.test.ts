import { describe, expect, it } from 'vitest';
import {
  addComponentMarking,
  approximateMeasurer,
  arrangeMarking,
  componentMinSize,
  componentSize,
  fitMarking,
  moveMarking,
  setContainerDensity,
  setFieldValue,
  setMarkingRect,
  type NewComponentArgs,
  type Project,
  type Rect,
} from '../../src/model';
import { SPEC_ID, componentProject, testCatalog } from './componentFixtures';
import { FIT_SPEC_ID, LONG_LABEL, fitCatalog, fitProject } from './fitFixtures';
import { marking } from './fixtures';

// Densidade (schema v19): `minSize`, o `size` inicial, o Arrumar e o ajuste ao conteúdo valem em
// unidades do componente e se gravam em pixels da imagem (× densidade).

const catalog = testCatalog();
const fcat = fitCatalog();
const box = (x: number, y: number, width: number, height: number): Rect => ({
  x,
  y,
  width,
  height,
});
const rectOf = (p: Project, id: string): Rect => marking(p, id).rect;

function add(
  p: Project,
  id: string,
  typeId: string,
  extra: Partial<NewComponentArgs> = {},
  cat = catalog,
  specId = SPEC_ID,
): Project {
  return addComponentMarking(
    p,
    cat,
    {
      markingId: id,
      annotationId: `A_${id}`,
      containerId: 'I1',
      parentId: null,
      specId,
      typeId,
      ...extra,
    },
    approximateMeasurer,
  );
}

describe('minSize × densidade', () => {
  it('componentMinSize multiplica o minSize do componente pela densidade do container', () => {
    const p1 = add(componentProject(), 'T', 'text', { rect: box(10, 10, 100, 40) });
    expect(componentMinSize(p1, catalog, 'T')).toEqual({ width: 60, height: 24 });
    const p3 = setContainerDensity(p1, 'I1', 3);
    expect(componentMinSize(p3, catalog, 'T')).toEqual({ width: 180, height: 72 });
    // Arredonda para cima: 60 × 1,5 = 90; 24 × 2,625 = 63 (exato); 60 × 2,625 = 157,5 → 158.
    expect(componentMinSize(setContainerDensity(p1, 'I1', 2.625), catalog, 'T')).toEqual({
      width: 158,
      height: 63,
    });
  });

  it('o redimensionar preso ao mínimo: o setMarkingRect recusa abaixo do mínimo × densidade', () => {
    const p = setContainerDensity(
      add(componentProject(), 'T', 'text', { rect: box(10, 10, 300, 100) }),
      'I1',
      3,
    );
    const min = componentMinSize(p, catalog, 'T')!;
    expect(min).toEqual({ width: 180, height: 72 });
    expect(() =>
      setMarkingRect(p, 'T', box(10, 10, 179, 100), { minSize: min }),
    ).toThrowError(/rect-too-small/);
    expect(
      rectOf(setMarkingRect(p, 'T', box(10, 10, 180, 72), { minSize: min }), 'T'),
    ).toEqual(box(10, 10, 180, 72));
  });

  it('componentMinSize no canvas (densidade 1) e sem componente não muda', () => {
    const p = add(componentProject(), 'T', 'text', { center: { x: 100, y: 100 } });
    expect(componentMinSize(p, catalog, 'T')).toEqual({ width: 60, height: 24 });
  });
});

describe('size inicial × densidade', () => {
  it('a instância nova nasce em size × densidade, inteira', () => {
    const p = setContainerDensity(componentProject(), 'I1', 3);
    expect(
      componentSize(
        p,
        catalog,
        { containerId: 'I1', parentId: null, specId: SPEC_ID, typeId: 'text' },
        approximateMeasurer,
      ),
    ).toEqual({ width: 300, height: 120 });
    const created = add(p, 'T', 'text');
    expect(rectOf(created, 'T')).toMatchObject({ width: 300, height: 120 });
  });

  it('o tamanho dado (args.size) manda e é preso ao minSize × densidade', () => {
    const p = setContainerDensity(componentProject(), 'I1', 3);
    const size = componentSize(
      p,
      catalog,
      {
        containerId: 'I1',
        parentId: null,
        specId: SPEC_ID,
        typeId: 'text',
        size: { width: 100, height: 30 },
      },
      approximateMeasurer,
    );
    expect(size).toEqual({ width: 180, height: 72 });
  });

  it('a densidade 1 não muda o tamanho de hoje', () => {
    expect(
      componentSize(
        componentProject(),
        catalog,
        { containerId: 'I1', parentId: null, specId: SPEC_ID, typeId: 'text' },
        approximateMeasurer,
      ),
    ).toEqual({ width: 100, height: 40 });
  });
});

describe('fitMarking × densidade', () => {
  const withLabel = (density: number, rect: Rect): Project => {
    const base = setContainerDensity(fitProject(), 'I1', density);
    return setFieldValue(
      add(base, 'B', 'fit-button', { rect }, fcat, FIT_SPEC_ID),
      'A_B',
      'label',
      LONG_LABEL,
    );
  };
  const fit = (p: Project) => fitMarking(p, fcat, 'B', approximateMeasurer);

  it('mede em unidades e grava × densidade: 3x dá a altura do 1x vezes 3', () => {
    const one = rectOf(fit(withLabel(1, box(100, 100, 120, 40))), 'B');
    const three = rectOf(fit(withLabel(3, box(300, 300, 360, 120))), 'B');
    expect(one.height).toBeGreaterThan(40);
    expect(three).toEqual({ x: 300, y: 300, width: 360, height: one.height * 3 });
  });

  it('o rótulo que cabe no mínimo × densidade não muda (o mesmo Project)', () => {
    const p = setFieldValue(
      add(
        setContainerDensity(fitProject(), 'I1', 3),
        'B',
        'fit-button',
        { rect: box(300, 300, 360, 120) },
        fcat,
        FIT_SPEC_ID,
      ),
      'A_B',
      'label',
      'Ok',
    );
    expect(fit(p)).toBe(p);
  });
});

describe('arrangeMarking × densidade', () => {
  it('o gap vira × densidade: 2x posiciona a segunda filha em 2 × (x do 1x - origem) + origem 2x', () => {
    const build = (density: number, k: number): Project => {
      let p = setContainerDensity(componentProject(), 'I1', density);
      p = add(p, 'C', 'row', { rect: box(40 * k, 40 * k, 300 * k, 100 * k) });
      p = add(p, 'T1', 'text', {
        parentId: 'C',
        rect: box(40 * k, 40 * k, 100 * k, 40 * k),
      });
      p = add(p, 'T2', 'text', {
        parentId: 'C',
        rect: box(200 * k, 80 * k, 100 * k, 40 * k),
      });
      return p;
    };
    const one = arrangeMarking(build(1, 1), catalog, 'C', approximateMeasurer).project;
    const two = arrangeMarking(build(2, 2), catalog, 'C', approximateMeasurer).project;
    // 1x: T1 em (40,40), T2 depois de 100 + gap 8 = x 148. 2x: tudo × 2, gap 16.
    expect(rectOf(one, 'T2').x).toBe(148);
    expect(rectOf(two, 'T1')).toEqual(box(80, 80, 200, 80));
    expect(rectOf(two, 'T2').x).toBe(296);
    expect(rectOf(two, 'T2').y).toBe(rectOf(one, 'T2').y * 2);
  });

  it('o padding do slot entra × densidade', () => {
    const build = (density: number, k: number): Project => {
      let p = setContainerDensity(componentProject(), 'I1', density);
      p = add(p, 'C', 'row', { rect: box(40 * k, 40 * k, 300 * k, 100 * k) });
      p = setFieldValue(p, 'A_C', 'padding', 4);
      return add(p, 'T1', 'text', {
        parentId: 'C',
        rect: box(60 * k, 60 * k, 100 * k, 40 * k),
      });
    };
    const one = arrangeMarking(build(1, 1), catalog, 'C', approximateMeasurer).project;
    const three = arrangeMarking(build(2, 2), catalog, 'C', approximateMeasurer).project;
    expect(rectOf(one, 'T1')).toMatchObject({ x: 44, y: 44 });
    expect(rectOf(three, 'T1')).toMatchObject({ x: 88, y: 88 });
  });

  it('mover uma marcação com componente continua válido (smoke de moveMarking)', () => {
    const p = setContainerDensity(
      add(componentProject(), 'T', 'text', { rect: box(10, 10, 180, 72) }),
      'I1',
      3,
    );
    expect(rectOf(moveMarking(p, 'T', 20, 20), 'T')).toMatchObject({ x: 30, y: 30 });
  });
});

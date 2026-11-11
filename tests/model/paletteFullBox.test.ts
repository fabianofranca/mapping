import { describe, expect, it } from 'vitest';
import { addComponentMarking, approximateMeasurer, type Rect } from '../../src/model';
import { SPEC_ID, componentProject, testCatalog } from './componentFixtures';
import { expectValid, marking } from './fixtures';

// Achado 3.1 (etapa #1533, bloco 3, R12.12a): soltar um Button da Paleta num Box sem espaço livre
// o aninhava no Button anterior (parentId dele) e sobre o 1º Button.

const catalog = testCatalog();
const rect = (x: number, y: number, width: number, height: number): Rect => ({
  x,
  y,
  width,
  height,
});

describe('Paleta solta num Box de slot cheio (3.1, caminho do slot)', () => {
  function fullBox() {
    let p = addComponentMarking(
      componentProject(),
      catalog,
      {
        markingId: 'BOX',
        annotationId: 'A_BOX',
        containerId: 'I1',
        parentId: null,
        specId: SPEC_ID,
        typeId: 'box',
        rect: rect(100, 100, 100, 80),
      },
      approximateMeasurer,
    );
    p = dropIn(p, 'T1');
    p = dropIn(p, 'T2');
    return p;
  }
  function dropIn(p: ReturnType<typeof componentProject>, id: string) {
    return addComponentMarking(
      p,
      catalog,
      {
        markingId: id,
        annotationId: `A_${id}`,
        containerId: 'I1',
        parentId: 'BOX',
        specId: SPEC_ID,
        typeId: 'text',
      },
      approximateMeasurer,
    );
  }

  it('o terceiro com o slot cheio fica filho do Box, sem coincidir com o primeiro', () => {
    const p = dropIn(fullBox(), 'T3');
    expect(marking(p, 'T3').parentId).toBe('BOX');
    expect(marking(p, 'T3').rect).not.toEqual(marking(p, 'T1').rect);
    expectValid(p);
  });

  it('soltar de novo não aninha mais um nível', () => {
    const p = dropIn(dropIn(fullBox(), 'T3'), 'T4');
    for (const id of ['T1', 'T2', 'T3', 'T4'])
      expect(marking(p, id).parentId).toBe('BOX');
  });
});

// Fase CL1 (#1630, achado 4.3 da rodada da #898): R9.26 (slot cheio). A Column de 260 × 100 com três
// Buttons sem `rect`: os dois primeiros empilham (88 de 100) e o terceiro, sem lugar abaixo, vai para
// o lugar livre mais perto de onde o slot o poria (`componentPlacement`, decisão 5 da #1087), na
// fileira ao lado, dentro da Column e encostado no fundo. É o comportamento da colocação, não do
// Arrumar: o `layout.wrap` só age ao arrumar (o Arrumar põe a fileira nova no topo).
import { describe, expect, it } from 'vitest';
import {
  addComponentMarking,
  addContainer,
  applySpecialization,
  approximateMeasurer,
  loadSpecComponents,
  placementFitsSlot,
  type ComponentCatalog,
  type Project,
  type Rect,
} from '../../src/model';
import { emptyProject } from './fixtures';
import { SPEC_FILE, files, spec, text } from '../support/material3Library';

void files;
const catalog: ComponentCatalog = new Map([
  [
    spec.id,
    loadSpecComponents(spec, SPEC_FILE, spec.version, (path) => {
      const body = text(path);
      return body === '' ? undefined : body;
    }),
  ],
]);
const at = (p: Project, id: string): Rect => p.markings.find((m) => m.id === id)!.rect;

function build(columnWidth = 260): Project {
  let p = applySpecialization(emptyProject(), spec, {
    newId: (() => {
      let n = 0;
      return () => `LM${++n}`;
    })(),
    packageSpecName: 'material3-compose.spec.json',
  });
  p = addContainer(p, { id: 'I1', file: null, width: 360, height: 640 } as never);
  const base = { containerId: 'I1', specId: spec.id } as const;
  p = addComponentMarking(
    p,
    catalog,
    {
      ...base,
      markingId: 'C',
      annotationId: 'A_C',
      parentId: null,
      typeId: 'column',
      rect: { x: 20, y: 20, width: columnWidth, height: 100 },
    },
    approximateMeasurer,
  );
  for (const id of ['B1', 'B2', 'B3']) {
    p = addComponentMarking(
      p,
      catalog,
      {
        ...base,
        markingId: id,
        annotationId: `A_${id}`,
        parentId: 'C',
        typeId: 'button',
      },
      approximateMeasurer,
    );
  }
  return p;
}

describe('R9.26: slot cheio', () => {
  it('o terceiro Button fica dentro da Column, na fileira ao lado e encostado no fundo', () => {
    const p = build();
    const [b1, b2, b3] = ['B1', 'B2', 'B3'].map((id) => at(p, id)) as [Rect, Rect, Rect];
    expect(
      ['B1', 'B2', 'B3'].map((id) => p.markings.find((m) => m.id === id)!.parentId),
    ).toEqual(['C', 'C', 'C']);
    // Os dois primeiros empilham com o gap 8; o terceiro não cabe abaixo (88 de 100 usados).
    expect(b2).toEqual({ ...b1, y: b1.y + b1.height + 8 });
    expect(b3.x).toBe(b1.x + b1.width + 8);
    expect(b3.y).toBe(20 + 100 - b3.height);
    // Coube no slot (sem `ignored-argument`): a quebra de fileira não é "slot cheio".
    const before: Project = {
      ...p,
      markings: p.markings.filter((m) => m.id !== 'B3'),
    };
    expect(placementFitsSlot(before, catalog, 'C', b3, approximateMeasurer)).toBe(true);
  });

  it('sem lugar livre no slot (Column de 100 de largura), o terceiro não cabe', () => {
    const p = build(100);
    const b3 = at(p, 'B3');
    const before: Project = { ...p, markings: p.markings.filter((m) => m.id !== 'B3') };
    expect(placementFitsSlot(before, catalog, 'C', b3, approximateMeasurer)).toBe(false);
  });
});

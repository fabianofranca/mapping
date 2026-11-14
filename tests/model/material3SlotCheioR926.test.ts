// Phase CL1 (#1630, finding 4.3 of the #898 round): R9.26 (full slot). The 260 × 100 Column with three
// Buttons without `rect`: the first two stack (88 of 100) and the third, with no room below, goes to
// the free spot closest to where the slot would put it (`componentPlacement`, decision 5 of #1087), in the
// row beside, inside the Column and against the bottom. It is the placement behavior, not Arrange's:
// `layout.wrap` only acts when arranging (Arrange puts the new row at the top).
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

describe('R9.26: full slot', () => {
  it('the third Button stays inside the Column, in the row beside and against the bottom', () => {
    const p = build();
    const [b1, b2, b3] = ['B1', 'B2', 'B3'].map((id) => at(p, id)) as [Rect, Rect, Rect];
    expect(
      ['B1', 'B2', 'B3'].map((id) => p.markings.find((m) => m.id === id)!.parentId),
    ).toEqual(['C', 'C', 'C']);
    // The first two stack with gap 8; the third does not fit below (88 of 100 used).
    expect(b2).toEqual({ ...b1, y: b1.y + b1.height + 8 });
    expect(b3.x).toBe(b1.x + b1.width + 8);
    expect(b3.y).toBe(20 + 100 - b3.height);
    // It fit the slot (without `ignored-argument`): the row break is not a "full slot".
    const before: Project = {
      ...p,
      markings: p.markings.filter((m) => m.id !== 'B3'),
    };
    expect(placementFitsSlot(before, catalog, 'C', b3, approximateMeasurer)).toBe(true);
  });

  it('without a free spot in the slot (100-wide Column), the third does not fit', () => {
    const p = build(100);
    const b3 = at(p, 'B3');
    const before: Project = { ...p, markings: p.markings.filter((m) => m.id !== 'B3') };
    expect(placementFitsSlot(before, catalog, 'C', b3, approximateMeasurer)).toBe(false);
  });
});

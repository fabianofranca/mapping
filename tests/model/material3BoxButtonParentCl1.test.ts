// Phase CL1 (#2397, finding F1 of the R12/R17 report): the first Button added inside a Box (palette add,
// no `rect`) must be born with the Box as `parentId` right after the add, without waiting for the next
// geometry operation.
import { describe, expect, it } from 'vitest';
import {
  addComponentMarking,
  addContainer,
  applySpecialization,
  approximateMeasurer,
  loadSpecComponents,
  type ComponentCatalog,
  type Project,
} from '../../src/model';
import { emptyProject } from './fixtures';
import { SPEC_FILE, spec, text } from '../support/material3Library';

const catalog: ComponentCatalog = new Map([
  [
    spec.id,
    loadSpecComponents(spec, SPEC_FILE, spec.version, (path) => {
      const body = text(path);
      return body === '' ? undefined : body;
    }),
  ],
]);
const marking = (p: Project, id: string) => p.markings.find((m) => m.id === id)!;

function base(w: number, h: number): Project {
  let p = applySpecialization(emptyProject(), spec, {
    newId: (() => {
      let n = 0;
      return () => `LM${++n}`;
    })(),
    packageSpecName: 'material3-compose.spec.json',
  });
  p = addContainer(p, { id: 'A', file: null, width: w, height: h } as never);
  p = addContainer(p, { id: 'B', file: null, width: w, height: h } as never);
  return p;
}

function add(
  p: Project,
  id: string,
  typeId: string,
  containerId: string,
  parentId: string | null,
) {
  return addComponentMarking(
    p,
    catalog,
    {
      containerId,
      parentId,
      specId: spec.id,
      typeId,
      markingId: id,
      annotationId: `A_${id}`,
    },
    approximateMeasurer,
  );
}

describe.each([
  [360, 640],
  [400, 300],
  [1000, 800],
  [200, 120],
])('F1: Box then Button inside it, container %i × %i', (w, h) => {
  it('the Button has the Box as parent right after the add', () => {
    let p = base(w, h);
    p = add(p, 'BOX', 'box', 'A', null);
    p = add(p, 'BTN', 'button', 'A', 'BOX');
    expect(marking(p, 'BTN').parentId).toBe('BOX');
  });

  it('same with another marking already in the container', () => {
    let p = base(w, h);
    p = add(p, 'BTN0', 'button', 'A', null);
    p = add(p, 'BOX', 'box', 'A', null);
    p = add(p, 'BTN', 'button', 'A', 'BOX');
    expect(marking(p, 'BTN').parentId).toBe('BOX');
  });
});

// Auxiliares dos testes da L5 (#1101): o catálogo da Material 3 (Compose) e marcações de componente nele.
import {
  addComponentMarking,
  addContainer,
  applySpecialization,
  approximateMeasurer,
  loadSpecComponents,
  setMarkingRect,
  type ComponentCatalog,
  type NewComponentArgs,
  type Project,
  type Rect,
} from '../../src/model';
import { emptyProject } from '../model/fixtures';
import { SPEC_FILE, spec, text } from './material3Library';

export { spec };
export const catalog: ComponentCatalog = new Map([
  [
    spec.id,
    loadSpecComponents(spec, SPEC_FILE, spec.version, (path) => {
      const body = text(path);
      return body === '' ? undefined : body;
    }),
  ],
]);

export type Json = Record<string, unknown>;
export const component = (id: string): Json => JSON.parse(text(`components/${id}.json`));
export const slotOf = (id: string): Json => {
  const found: Json[] = [];
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) return node.forEach(visit);
    if (node === null || typeof node !== 'object') return;
    const record = node as Json;
    if (record.type === 'slot') found.push(record);
    Object.values(record).forEach(visit);
  };
  visit(component(id).template);
  return found[0] as Json;
};
export const layoutOf = (id: string) => slotOf(id).layout as Json;

export const at = (p: Project, id: string): Rect =>
  p.markings.find((m) => m.id === id)!.rect;

export function put(p: Project, args: Partial<NewComponentArgs> & { markingId: string }) {
  return addComponentMarking(
    p,
    catalog,
    {
      containerId: 'I1',
      parentId: null,
      specId: spec.id,
      annotationId: `A_${args.markingId}`,
      typeId: 'box',
      ...args,
    } as NewComponentArgs,
    approximateMeasurer,
  );
}

export function base(): Project {
  let n = 0;
  let p = applySpecialization(emptyProject(), spec, {
    newId: () => `LA${++n}`,
    packageSpecName: 'material3-compose.spec.json',
  });
  p = addContainer(p, { id: 'I1', file: null, width: 600, height: 800 } as never);
  return p;
}

/** O container `typeId` em `rect` com `values`, e `n` botões de 100 × 40 empilhados no canto dele. */
export function withButtons(
  typeId: string,
  rect: Rect,
  values: NewComponentArgs['values'],
  n: number,
): Project {
  let p = put(base(), { markingId: 'C', typeId, rect, values });
  for (let i = 0; i < n; i++)
    p = put(p, {
      markingId: `B${i + 1}`,
      typeId: 'button',
      parentId: 'C',
      rect: { x: rect.x + 4 + i, y: rect.y + 4 + i, width: 100, height: 40 },
    });
  return p;
}

/**
 * Uma lazy-column de 200 × 100 e um Box roxo dentro dela; depois a lazy-column encolhe (a prévia de
 * um gesto, sem assentar): o Box passa da borda de baixo e da direita do slot.
 */
export function clipProject(): Project {
  let p = put(base(), {
    markingId: 'C',
    typeId: 'lazy-column',
    rect: { x: 20, y: 20, width: 200, height: 100 },
  });
  p = put(p, {
    markingId: 'K',
    typeId: 'box',
    parentId: 'C',
    rect: { x: 100, y: 60, width: 100, height: 50 },
    values: { background: 'primary', padding: 0 },
  });
  return setMarkingRect(
    p,
    'C',
    { x: 20, y: 20, width: 140, height: 70 },
    { settle: false },
  );
}

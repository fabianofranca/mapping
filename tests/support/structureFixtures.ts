import {
  addTypedAnnotation,
  type Marking,
  type Project,
  type Rect,
} from '../../src/model';
import { SPEC_ID, componentProject } from '../model/componentFixtures';

// Raw projects for the stored-structure tests (stage #3087, MS1): the markings are written as the file
// has them, before any settle, so a test states exactly what the settle receives. The container `I1`
// is 1000 × 800 at the origin (scale 1), the page is `PG1`, and the layer `LS1` holds the types that
// draw a component (`text`), `LS2` the ones that do not (`plain`).

export const COMPONENT_LAYER = 'LS1';
export const PLAIN_LAYER = 'LS2';

/** A marking as the file stores it; `container` `null` = the canvas of page `PG1`. */
export function raw(
  id: string,
  rect: Rect,
  extra: Partial<Marking> & { readonly container?: string | null } = {},
): Marking {
  const { container = 'I1', ...rest } = extra;
  return {
    id,
    containerId: container,
    parentId: null,
    pageId: container === null ? 'PG1' : null,
    name: null,
    rect,
    needsReview: false,
    locked: false,
    floating: false,
    decorative: false,
    source: null,
    ...rest,
  };
}

export const r = (x: number, y: number, width: number, height: number): Rect => ({
  x,
  y,
  width,
  height,
});

/** The component project with these markings, and a `text` annotation on each of `materialized`. */
export function structureProject(
  markings: readonly Marking[],
  materialized: readonly string[] = [],
): Project {
  let p: Project = { ...componentProject(), markings: [...markings] };
  for (const id of materialized) p = materialize(p, id);
  return p;
}

/** Adds the `text` annotation (a type that declares a component) to the marking. */
export function materialize(p: Project, markingId: string): Project {
  return addTypedAnnotation(p, {
    id: `A_${markingId}_text`,
    markingId,
    layerId: COMPONENT_LAYER,
    type: { specId: SPEC_ID, typeId: 'text' },
  });
}

/** Adds the `plain` annotation (a type with no component). */
export function plainTyped(p: Project, markingId: string): Project {
  return addTypedAnnotation(p, {
    id: `A_${markingId}_plain`,
    markingId,
    layerId: PLAIN_LAYER,
    type: { specId: SPEC_ID, typeId: 'plain' },
  });
}

/** The marking with that id. */
export function find(p: Project, id: string): Marking {
  const m = p.markings.find((x) => x.id === id);
  if (!m) throw new Error(`marking ${id} not found`);
  return m;
}

/** `{ id: parentId }` of every marking. */
export function parents(p: Project): Record<string, string | null> {
  return Object.fromEntries(p.markings.map((m) => [m.id, m.parentId]));
}

// A project built on the accessibility test library (`tests/fixtures/accessibility/`, stage #1126):
// a `button` (role + label), a `chip` (role and label per case), a `bar` (two field parts and an `actions` slot), an `icon-button`
// and `tabs` (a table part), in a container of 1080 x 2400 px. Shared by the derived-state tests and the
// component tests of the app (stage #1127, A2).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  addContainer,
  addTableRow,
  addTypedAnnotation,
  applySpecialization,
  createMarking,
  loadSpecComponents,
  parseSpec,
  setContainerDensity,
  setFieldValue,
  setTableCell,
  type ComponentCatalog,
  type Project,
  type Rect,
  type Spec,
} from '../../src/model';
import { emptyProject } from './fixtures';
import { idGen, layerOf } from './specFixtures';

const DIR = 'tests/fixtures/accessibility';
export const A11Y_SPEC_ID = 'accessibility';
const read = (path: string): string => readFileSync(join(DIR, path), 'utf8');

export const a11ySpec: Spec = (() => {
  const parsed = parseSpec(JSON.parse(read('accessibility.spec.json')));
  if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
  return parsed.spec;
})();

/** The components of the library, as the session loads them. */
export const a11yCatalog: ComponentCatalog = (() => {
  const texts = new Map(
    ['bar', 'button', 'chip', 'icon-button', 'tabs'].map((id) => [
      `specs/${A11Y_SPEC_ID}/components/${id}.json`,
      read(`components/${id}.json`),
    ]),
  );
  const loaded = loadSpecComponents(
    a11ySpec,
    `specs/${A11Y_SPEC_ID}/accessibility.spec.json`,
    1,
    (path) => texts.get(path),
  );
  if (loaded.problems.length > 0) throw new Error(loaded.problems.join('\n'));
  return new Map([[A11Y_SPEC_ID, loaded]]);
})();

/** The specialization applied to an empty project, with the container `I1` (1080 x 2400 px). */
export function a11yWorld(density = 1): Project {
  let p = applySpecialization(emptyProject(), a11ySpec, { newId: idGen('AY') });
  p = addContainer(p, { id: 'I1', file: 'images/screen.png', width: 1080, height: 2400 });
  return density === 1 ? p : setContainerDensity(p, 'I1', density);
}

export const BIG: Rect = { x: 0, y: 0, width: 600, height: 600 };

/** A marking `M_<id>` with a typed annotation `<id>` of `typeId`, and the values set one by one. */
export function a11yPut(
  p: Project,
  typeId: string,
  id: string,
  rect: Rect = BIG,
  values: Record<string, string> = {},
): Project {
  let q = createMarking(p, { id: `M_${id}`, containerId: 'I1', rect, name: id });
  q = addTypedAnnotation(q, {
    id,
    markingId: `M_${id}`,
    layerId: layerOf(q, A11Y_SPEC_ID, 'ui'),
    type: { specId: A11Y_SPEC_ID, typeId },
  });
  for (const [key, value] of Object.entries(values)) q = setFieldValue(q, id, key, value);
  return q;
}

/** Rows of the `items` table of a `tabs` annotation (ids `R1`, `R2`, …). */
export function a11yRows(
  p: Project,
  id: string,
  rows: readonly Record<string, string>[],
): Project {
  let q = p;
  rows.forEach((row, i) => {
    q = addTableRow(q, id, 'items', `R${i + 1}`);
    for (const [column, value] of Object.entries(row)) {
      q = setTableCell(q, id, 'items', `R${i + 1}`, column, value);
    }
  });
  return q;
}

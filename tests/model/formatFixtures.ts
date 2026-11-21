// Fixtures of the plugin contract tests (stage #1923, FP2): a project with the `data-model`
// specialization (two file formats), a second specialization whose items the projection must
// leave out, free-layer annotations, a marking tree, an arrow that holds an annotation and a
// second container.
//
//   C1 "Main" 800×600 (page "Page 1")        C2 "Other" 400×300
//   M1 (0,0,400,300)  holds A1 (class)        M5 (0,0,100,100) holds N1 (other/note) and F1 (free)
//   └ M2 (10,10,200,100) holds F2 (free only)
//     └ M3 (20,20,50,50) holds A3 (class "Account") with a table and a `ref` field
//   M4 (500,10,100,100) holds A4 (class "Session")
//   R1 arrow M1 → M4 holds A5 (flow, applies to arrows)
import {
  addBackgroundContainer,
  addAnnotation,
  addTableRow,
  addTypedAnnotation,
  applySpecialization,
  createArrow,
  createMarking,
  parseSpec,
  setFieldValue,
  setTableCells,
  type JsonValue,
  type Project,
  type Spec,
} from '../../src/model';
import { emptyProject } from './fixtures';
import { idGen, layerOf } from './specFixtures';

function spec(raw: unknown): Spec {
  const parsed = parseSpec(raw);
  if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
  return parsed.spec;
}

export const FORMAT_SPEC_ID = 'data-model';

/** The specialization that carries the formats (`data-model/openapi` and `data-model/csv`). */
export const formatSpec: Spec = spec({
  format: 'mapping-spec',
  formatVersion: 20,
  id: FORMAT_SPEC_ID,
  name: 'Data model',
  version: 1,
  fileFormats: [
    {
      id: 'openapi',
      name: 'OpenAPI',
      extension: 'yaml',
      plugin: 'plugins/openapi.js',
      contract: 1,
    },
    {
      id: 'csv',
      name: 'Attributes CSV',
      extension: 'csv',
      plugin: 'plugins/csv.js',
      contract: 1,
      scope: 'container',
    },
  ],
  layers: [
    {
      id: 'classes',
      name: 'Classes',
      color: '#43A047',
      annotationTypes: [
        {
          id: 'class',
          name: 'Class',
          fields: [
            { key: 'name', type: 'string' },
            { key: 'version', type: 'number', default: 1 },
            { key: 'parent', type: 'ref', accepts: { annotations: ['class'] } },
            {
              key: 'attributes',
              type: 'table',
              columns: [
                { key: 'name', type: 'string' },
                { key: 'type', type: 'string' },
                { key: 'of', type: 'ref', accepts: { annotations: ['class'] } },
              ],
            },
          ],
        },
        {
          id: 'button',
          name: 'Button',
          component: 'components/button.json',
          fields: [{ key: 'label', type: 'string' }],
        },
        {
          id: 'flow',
          name: 'Flow',
          appliesTo: ['marking', 'arrow'],
          fields: [{ key: 'note', type: 'string' }],
        },
      ],
    },
  ],
});

/** Another specialization: its items never enter the projection of `data-model`. */
export const otherSpec: Spec = spec({
  format: 'mapping-spec',
  formatVersion: 20,
  id: 'other',
  name: 'Other',
  version: 1,
  layers: [
    {
      id: 'notes',
      name: 'Notes',
      color: '#8E24AA',
      annotationTypes: [
        { id: 'note', name: 'Note', fields: [{ key: 'text', type: 'string' }] },
      ],
    },
  ],
});

const RECT = (x: number, y: number, width: number, height: number) => ({
  x,
  y,
  width,
  height,
});

function typed(
  p: Project,
  id: string,
  markingId: string,
  specId: string,
  typeId: string,
  layerId: string,
  name: string | null = null,
): Project {
  return addTypedAnnotation(p, {
    id,
    markingId,
    layerId: layerOf(p, specId, layerId),
    type: { specId, typeId },
    name,
  });
}

/** The project described at the top of the file. Ids are fixed: refs are deterministic. */
export function formatProject(): Project {
  let p = emptyProject();
  p = applySpecialization(p, formatSpec, { newId: idGen('LD') });
  p = applySpecialization(p, otherSpec, { newId: idGen('LO') });
  p = addBackgroundContainer(p, {
    id: 'C1',
    name: 'Main',
    width: 800,
    height: 600,
    background: '#FFFFFF',
  });
  p = addBackgroundContainer(p, {
    id: 'C2',
    name: 'Other',
    width: 400,
    height: 300,
    background: '#EEEEEE',
  });
  p = createMarking(p, { id: 'M1', containerId: 'C1', rect: RECT(0, 0, 400, 300) });
  p = createMarking(p, {
    id: 'M2',
    containerId: 'C1',
    rect: RECT(10, 10, 200, 100),
    name: 'Middle',
  });
  p = createMarking(p, {
    id: 'M3',
    containerId: 'C1',
    rect: RECT(20, 20, 50, 50),
    name: 'Account box',
  });
  p = createMarking(p, { id: 'M4', containerId: 'C1', rect: RECT(500, 10, 100, 100) });
  p = createMarking(p, { id: 'M5', containerId: 'C2', rect: RECT(0, 0, 100, 100) });
  p = typed(p, 'A1', 'M1', FORMAT_SPEC_ID, 'class', 'classes', 'Root');
  p = typed(p, 'A3', 'M3', FORMAT_SPEC_ID, 'class', 'classes', 'Account');
  p = typed(p, 'A4', 'M4', FORMAT_SPEC_ID, 'class', 'classes', 'Session');
  p = typed(p, 'N1', 'M5', 'other', 'note', 'notes');
  p = addAnnotation(p, { id: 'F1', markingId: 'M5', layerId: 'L1', name: 'Free one' });
  p = addAnnotation(p, { id: 'F2', markingId: 'M2', layerId: 'L1', name: 'Free two' });
  p = setFieldValue(p, 'A3', 'name', 'Account');
  p = setFieldValue(p, 'A3', 'parent', { annotationId: 'A4' } as JsonValue);
  p = addTableRow(p, 'A3', 'attributes', 'R1');
  p = setTableCells(p, 'A3', 'attributes', 'R1', {
    name: 'owner',
    type: 'Session',
    of: { annotationId: 'A4' } as JsonValue,
  });
  p = addTableRow(p, 'A3', 'attributes', 'R2');
  p = setTableCells(p, 'A3', 'attributes', 'R2', { name: 'id', type: 'String' });
  p = createArrow(p, { id: 'R1', from: 'M1', to: 'M4' });
  p = typed(p, 'A5', 'R1', FORMAT_SPEC_ID, 'flow', 'classes', 'Goes');
  return p;
}

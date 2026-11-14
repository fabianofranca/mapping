import {
  addContainer,
  addTypedAnnotation,
  applySpecialization,
  createMarking,
  parseSpec,
  setFieldValue,
  setTableCell,
  addTableRow,
  type Project,
  type Spec,
} from '../../src/model';
import { emptyProject } from '../model/fixtures';
import { idGen, layerOf } from '../model/specFixtures';

// Test v10 specialization with the four `kind`s (stage #486, AV2): `alert` has a notice on
// the type (pending, with since and ref), on the field `legacyStyle` (deprecated) and on the
// column `handler` of the table `events` (diverges); `gone` is a `removed` type; `plain` has
// no notice.
// pt-BR kept: shared fixture data asserted by tests/components and tests/model (spec id, names and notice messages)
export function noticeSpec(): Spec {
  const result = parseSpec({
    format: 'mapping-spec',
    formatVersion: 10,
    id: 'avisos',
    name: 'Avisos',
    version: 1,
    layers: [
      {
        id: 'componentes',
        name: 'Componentes',
        color: '#1E88E5',
        annotationTypes: [
          {
            id: 'alert',
            name: 'Alert',
            notices: [
              {
                kind: 'pending',
                message: 'O contrato aceita avatarVariant; o SDK ainda não tem.',
                since: '2026-11-04',
                ref: 'cross/sdui/alert.md',
              },
            ],
            fields: [
              {
                key: 'legacyStyle',
                type: 'string',
                notices: [{ kind: 'deprecated', message: 'Use variant.' }],
              },
              { key: 'variant', type: 'string' },
              {
                key: 'events',
                type: 'table',
                columns: [
                  {
                    key: 'handler',
                    type: 'string',
                    notices: [
                      { kind: 'diverges', message: 'Nome diferente no contrato.' },
                    ],
                  },
                  { key: 'note', type: 'string' },
                ],
              },
            ],
          },
          {
            id: 'gone',
            name: 'Gone',
            notices: [{ kind: 'removed', message: 'Saiu do contrato.' }],
            fields: [{ key: 'name', type: 'string' }],
          },
          { id: 'plain', name: 'Plain', fields: [{ key: 'name', type: 'string' }] },
        ],
      },
    ],
  });
  if (!result.ok) throw new Error(JSON.stringify(result));
  return result.spec;
}

/** Project with the specialization applied and one annotation of each type (AA, AG, AP) on a marking. */
export function noticeProject(): Project {
  let p = emptyProject();
  p = addContainer(p, { id: 'I1', file: 'a.png', width: 1000, height: 1000 });
  p = createMarking(p, {
    id: 'M1',
    containerId: 'I1',
    rect: { x: 10, y: 10, width: 100, height: 100 },
    name: 'Alvo',
  });
  p = applySpecialization(p, noticeSpec(), { newId: idGen('LN') });
  const layerId = layerOf(p, 'avisos', 'componentes');
  for (const [id, typeId] of [
    ['AA', 'alert'],
    ['AG', 'gone'],
    ['AP', 'plain'],
  ] as const) {
    p = addTypedAnnotation(p, {
      id,
      markingId: 'M1',
      layerId,
      type: { specId: 'avisos', typeId },
      parentAnnotationId: null,
    });
  }
  p = setFieldValue(p, 'AA', 'legacyStyle', 'x');
  p = addTableRow(p, 'AA', 'events', 'R1');
  p = setTableCell(p, 'AA', 'events', 'R1', 'handler', 'onTap');
  return p;
}

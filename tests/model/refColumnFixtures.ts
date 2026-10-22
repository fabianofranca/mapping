// Fixtures da coluna `ref` em `table` (ME4): uma especialização `rc` (v7) com o tipo `modelo`
// (a tabela `campos`, cujas linhas são alvos) e o tipo `lista` (a tabela `alvos` com a coluna
// `ref` `alvo`), e o projeto que a aplica.
import {
  addAnnotation,
  addContainer,
  addTableRow,
  addTypedAnnotation,
  applySpecialization,
  createMarking,
  parseSpec,
  setFieldValue,
  setTableCell,
  type JsonValue,
  type Project,
  type Spec,
} from '../../src/model';
import { emptyProject } from './fixtures';
import { idGen } from './specFixtures';

export type Raw = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export function spec(
  version: number,
  extra: Record<string, unknown> = {},
  edit: (raw: Raw) => void = () => undefined,
): Spec {
  const raw: Raw = {
    format: 'mapping-spec',
    formatVersion: 7,
    id: 'rc',
    name: 'Ref em coluna',
    version,
    platforms: [{ id: 'web', name: 'Web' }],
    layers: [
      {
        id: 'dados',
        name: 'Dados',
        color: '#2E7D32',
        annotationTypes: [
          {
            id: 'modelo',
            name: 'Modelo',
            labelField: 'titulo',
            fields: [
              { key: 'titulo', type: 'string' },
              {
                key: 'campos',
                type: 'table',
                tags: ['data-field'],
                rowLabel: 'nome',
                columns: [{ key: 'nome', type: 'string' }],
              },
              { key: 'solto', type: 'string', tags: ['outro'] },
            ],
          },
        ],
      },
      {
        id: 'telas',
        name: 'Telas',
        color: '#1565C0',
        annotationTypes: [
          {
            id: 'lista',
            name: 'Lista',
            labelField: 'titulo',
            fields: [
              { key: 'titulo', type: 'string' },
              {
                key: 'alvos',
                label: 'Alvos',
                type: 'table',
                columns: [
                  { key: 'nota', type: 'string' },
                  {
                    key: 'alvo',
                    label: 'Alvo',
                    type: 'ref',
                    required: true,
                    accepts: { tags: ['data-field'], free: true },
                  },
                ],
              },
              { key: 'principal', type: 'ref', accepts: { tags: ['data-field'] } },
            ],
            code: { web: { symbol: 'Lista', params: { alvos: 'destinos' } } },
          },
        ],
      },
    ],
    ...extra,
  };
  edit(raw);
  const parsed = parseSpec(raw);
  if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
  return parsed.spec;
}

/**
 * Projeto com a especialização aplicada: AM (modelo) com as linhas R1 `cpf` e R2 `nome` em
 * `campos`; AL (lista) com a linha L1 (sem alvo); AF, uma anotação livre com a tupla E1.
 */
export function build(version = 1): Project {
  let p = emptyProject();
  p = addContainer(p, { id: 'I1', file: 'images/a.png', width: 1000, height: 1000 });
  for (const id of ['M1', 'M2', 'M3']) {
    p = createMarking(p, {
      id,
      containerId: 'I1',
      rect: { x: 10, y: 10, width: 100, height: 100 },
    });
  }
  p = applySpecialization(p, spec(version), { newId: idGen('LS') });
  const layerDados = p.layers.find((l) => l.spec?.layerId === 'dados')!.id;
  const layerTelas = p.layers.find((l) => l.spec?.layerId === 'telas')!.id;
  p = addTypedAnnotation(p, {
    id: 'AM',
    markingId: 'M1',
    layerId: layerDados,
    type: { specId: 'rc', typeId: 'modelo' },
  });
  p = setFieldValue(p, 'AM', 'titulo', 'Cliente');
  p = addTableRow(p, 'AM', 'campos', 'R1');
  p = setTableCell(p, 'AM', 'campos', 'R1', 'nome', 'cpf');
  p = addTableRow(p, 'AM', 'campos', 'R2');
  p = setTableCell(p, 'AM', 'campos', 'R2', 'nome', 'nome');
  p = addTypedAnnotation(p, {
    id: 'AL',
    markingId: 'M2',
    layerId: layerTelas,
    type: { specId: 'rc', typeId: 'lista' },
  });
  p = addTableRow(p, 'AL', 'alvos', 'L1');
  p = addAnnotation(p, {
    id: 'AF',
    markingId: 'M3',
    layerId: p.layers[0]!.id,
    name: 'Glossário',
    entries: [{ id: 'E1', key: 'termo', value: 'valor' }],
  });
  return p;
}

export const R1 = { annotationId: 'AM', key: 'campos', rowId: 'R1' };
export const R2 = { annotationId: 'AM', key: 'campos', rowId: 'R2' };
export const E1 = { annotationId: 'AF', entryId: 'E1' };

export const cell = (p: Project, id = 'AL'): JsonValue | undefined => {
  const row = (p.annotations.find((a) => a.id === id)?.values?.alvos as JsonValue[])[0];
  return (row as Record<string, JsonValue>).alvo;
};

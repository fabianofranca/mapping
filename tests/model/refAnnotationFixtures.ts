// Fixtures do `ref` para a anotação inteira (etapa #679, CF1): a especialização `rc` com
// `accepts.annotations` montada em memória (sem o validador) e o projeto que a aplica.
import {
  addTypedAnnotation,
  applySpecialization,
  createMarking,
  setFieldValue,
  type Project,
  type Spec,
} from '../../src/model';
import { build, spec } from './refColumnFixtures';
import { idGen, layerOf } from './specFixtures';

export type Mutable = {
  layers: { id: string; annotationTypes: Record<string, unknown>[] }[];
};

/** A especialização `rc` com `accepts.annotations`, montada em memória (sem o validador). */
export function annotationSpec(id = 'rc'): Spec {
  const s = structuredClone(spec(1, { id })) as unknown as Mutable;
  const dados = s.layers.find((l) => l.id === 'dados')!;
  dados.annotationTypes.push({
    id: 'avulso',
    name: 'Avulso',
    fields: [{ key: 'titulo', type: 'string' }],
  });
  const lista = s.layers
    .find((l) => l.id === 'telas')!
    .annotationTypes.find((t) => t.id === 'lista')!;
  (lista.fields as unknown[]).push(
    { key: 'item', type: 'ref', accepts: { annotations: [{ layer: 'dados' }] } },
    { key: 'soAvulso', type: 'ref', accepts: { annotations: ['avulso'] } },
    {
      key: 'mix',
      type: 'ref',
      accepts: { tags: ['data-field'], annotations: ['modelo'] },
    },
    {
      key: 'itens',
      type: 'table',
      columns: [
        {
          key: 'alvo',
          type: 'ref',
          accepts: { annotations: [{ layer: 'dados' }] },
        },
      ],
    },
  );
  return s as unknown as Spec;
}

/**
 * AM (modelo "Cliente", R1 cpf, R2 nome), AL (lista), AF (livre "Glossário", E1) do `build`, mais
 * AM2 (modelo sem nome nem título), AV (avulso "Extra"), AL2 (lista), AX (modelo de outra
 * especialização `rd`, "Alheio").
 */
export function world(): Project {
  let p = build();
  p = {
    ...p,
    specializations: p.specializations.map((s) =>
      s.id === 'rc' ? { ...s, spec: annotationSpec() } : s,
    ),
  };
  p = applySpecialization(p, annotationSpec('rd'), { newId: idGen('RD') });
  const dados = layerOf(p, 'rc', 'dados');
  const telas = layerOf(p, 'rc', 'telas');
  const marking = (id: string) =>
    (p = createMarking(p, {
      id,
      containerId: 'I1',
      rect: { x: 10, y: 10, width: 100, height: 100 },
    }));
  for (const id of ['M4', 'M5', 'M6', 'M7']) marking(id);
  p = addTypedAnnotation(p, {
    id: 'AM2',
    markingId: 'M4',
    layerId: dados,
    type: { specId: 'rc', typeId: 'modelo' },
  });
  p = addTypedAnnotation(p, {
    id: 'AV',
    markingId: 'M5',
    layerId: dados,
    type: { specId: 'rc', typeId: 'avulso' },
  });
  p = setFieldValue(p, 'AV', 'titulo', 'Extra');
  p = addTypedAnnotation(p, {
    id: 'AL2',
    markingId: 'M6',
    layerId: telas,
    type: { specId: 'rc', typeId: 'lista' },
  });
  p = addTypedAnnotation(p, {
    id: 'AX',
    markingId: 'M7',
    layerId: layerOf(p, 'rd', 'dados'),
    type: { specId: 'rd', typeId: 'modelo' },
  });
  p = setFieldValue(p, 'AX', 'titulo', 'Alheio');
  return p;
}

// Fixtures of `ref` for the whole annotation (stage #679, CF1): the `rc` specialization with
// `accepts.annotations` built in memory (without the validator) and the project that applies it.
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

// pt-BR kept: shared fixture data (ids, names and keys of the spec) asserted by tests/components, tests/ui and tests/model
/** The `rc` specialization with `accepts.annotations`, built in memory (without the validator). */
export function annotationSpec(id = 'rc'): Spec {
  const s = structuredClone(spec(1, { id })) as unknown as Mutable;
  const dataLayer = s.layers.find((l) => l.id === 'dados')!;
  dataLayer.annotationTypes.push({
    id: 'avulso',
    name: 'Avulso',
    fields: [{ key: 'titulo', type: 'string' }],
  });
  const listType = s.layers
    .find((l) => l.id === 'telas')!
    .annotationTypes.find((t) => t.id === 'lista')!;
  (listType.fields as unknown[]).push(
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
 * AM (model "Cliente", R1 cpf, R2 nome), AL (list), AF (free "Glossário", E1) from `build`, plus
 * AM2 (model without a name or title), AV (standalone "Extra"), AL2 (list), AX (model from another
 * specialization `rd`, "Alheio").
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
  const dataLayer = layerOf(p, 'rc', 'dados');
  const screensLayer = layerOf(p, 'rc', 'telas');
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
    layerId: dataLayer,
    type: { specId: 'rc', typeId: 'modelo' },
  });
  p = addTypedAnnotation(p, {
    id: 'AV',
    markingId: 'M5',
    layerId: dataLayer,
    type: { specId: 'rc', typeId: 'avulso' },
  });
  p = setFieldValue(p, 'AV', 'titulo', 'Extra');
  p = addTypedAnnotation(p, {
    id: 'AL2',
    markingId: 'M6',
    layerId: screensLayer,
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

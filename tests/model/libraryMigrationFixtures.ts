import {
  addImage,
  addTypedAnnotation,
  applySpecialization,
  createMarking,
  type JsonValue,
  type Project,
  type Spec,
  type SpecAnnotationType,
  type SpecLayer,
  type SpecMigration,
  type TypedValues,
} from '../../src/model';
import { emptyProject } from './fixtures';
import { idGen, layerOf } from './specFixtures';

// Fixtures das migrações da biblioteca: uma especialização `lib` (v4) com duas camadas
// (`c`: componentes, `e`: eventos) e um projeto com as anotações pedidas.

export function buttonType(over: Partial<SpecAnnotationType> = {}): SpecAnnotationType {
  return {
    id: 'button',
    name: 'Button',
    allowedChildren: ['chip'],
    fields: [
      { key: 'label', type: 'string', tags: ['x'] },
      { key: 'style', type: 'enum', options: ['primary', 'text'] },
      { key: 'size', type: 'number' },
      {
        key: 'rows',
        type: 'table',
        tags: ['x'],
        columns: [
          { key: 'col', type: 'string' },
          { key: 'kind', type: 'enum', options: ['a', 'b'] },
          { key: 'extra', type: 'string' },
        ],
      },
    ],
    ...over,
  };
}

export function badgeType(over: Partial<SpecAnnotationType> = {}): SpecAnnotationType {
  return {
    id: 'badge',
    name: 'Badge',
    fields: [
      { key: 'text', type: 'string' },
      { key: 'target', type: 'ref', accepts: { tags: ['x'] } },
    ],
    ...over,
  };
}

export function chipType(over: Partial<SpecAnnotationType> = {}): SpecAnnotationType {
  return {
    id: 'chip',
    name: 'Chip',
    requiresOwner: true,
    fields: [
      { key: 'a', type: 'string' },
      { key: 'b', type: 'string' },
    ],
    ...over,
  };
}

export function libSpec(
  version: number,
  layers: { c: SpecAnnotationType[]; e?: SpecAnnotationType[] } = {
    c: [buttonType(), badgeType()],
    e: [chipType()],
  },
  over: Partial<Spec> & { migrations?: SpecMigration[] } = {},
): Spec {
  const specLayers: SpecLayer[] = [
    { id: 'c', name: 'Componentes', color: '#1E88E5', annotationTypes: layers.c },
  ];
  if (layers.e) {
    specLayers.push({
      id: 'e',
      name: 'Eventos',
      color: '#FB8C00',
      annotationTypes: layers.e,
    });
  }
  return {
    format: 'mapping-spec',
    formatVersion: 4,
    id: 'lib',
    name: 'Lib',
    version,
    layers: specLayers,
    ...over,
  };
}

export interface FixtureAnnotation {
  readonly id: string;
  readonly marking?: string;
  readonly type: string;
  readonly values?: TypedValues;
  readonly parent?: string;
}

/** Projeto com `spec` aplicada, duas marcações (M1, M2) e as anotações dadas (valores por cima dos padrões). */
export function libProject(
  spec: Spec,
  annotations: readonly FixtureAnnotation[],
): Project {
  let p = applySpecialization(emptyProject(), spec, { newId: idGen('S') });
  p = addImage(p, { id: 'I1', file: 'images/a.png', width: 1000, height: 1000 });
  p = createMarking(p, {
    id: 'M1',
    imageId: 'I1',
    rect: { x: 0, y: 0, width: 100, height: 100 },
  });
  p = createMarking(p, {
    id: 'M2',
    imageId: 'I1',
    rect: { x: 200, y: 0, width: 100, height: 100 },
  });
  for (const a of annotations) {
    const layer = spec.layers.find((l) => l.annotationTypes.some((t) => t.id === a.type));
    if (!layer) throw new Error(`tipo ${a.type} fora da especialização`);
    p = addTypedAnnotation(p, {
      id: a.id,
      markingId: a.marking ?? 'M1',
      layerId: layerOf(p, spec.id, layer.id),
      type: { specId: spec.id, typeId: a.type },
      parentAnnotationId: a.parent ?? null,
    });
    if (a.values) p = setRaw(p, a.id, { ...annotationOf(p, a.id).values, ...a.values });
  }
  return p;
}

export function annotationOf(p: Project, id: string) {
  const found = p.annotations.find((a) => a.id === id);
  if (!found) throw new Error(`anotação ${id} não encontrada`);
  return found;
}

/** Troca os `values` da anotação sem validar (para montar dados fora das regras do tipo). */
export function setRaw(p: Project, id: string, values: TypedValues): Project {
  return {
    ...p,
    annotations: p.annotations.map((a) => (a.id === id ? { ...a, values } : a)),
  };
}

export function valuesOf(p: Project, id: string): TypedValues {
  return annotationOf(p, id).values ?? {};
}

export const row = (id: string, cells: Record<string, JsonValue>): JsonValue => ({
  _id: id,
  ...cells,
});

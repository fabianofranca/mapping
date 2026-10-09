import {
  ENTRIES_FIELD_PREFIX,
  VALUES_FIELD_PREFIX,
  type Change,
  type ChangeEntity,
} from './proposal';
import { projectIndex } from './projectIndex';
import { isRecord, parseRefValue } from './refs';
import type {
  Annotation,
  JsonValue,
  Layer,
  Marking,
  PlatformRepo,
  Project,
  ProjectImage,
  ProjectSpecialization,
} from './types';

// Valores das mudanças (etapa 4): a forma JSON de cada entidade e de cada campo, usada
// para calcular as mudanças, conferir conflitos e aplicar. Uso interno do modelo.

/** Cópia JSON (sem `undefined`), com as chaves na ordem em que estão. */
export function toJson(value: unknown): JsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as JsonValue;
}

/** Igualdade de valores JSON, sem depender da ordem das chaves. */
export function jsonEqual(a: JsonValue | undefined, b: JsonValue | undefined): boolean {
  if (a === b) return true;
  if (a === undefined || b === undefined || a === null || b === null) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((item, i) => jsonEqual(item, b[i]));
  }
  if (!isRecord(a) || !isRecord(b)) return false;
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  return ka.every((k) => Object.hasOwn(b, k) && jsonEqual(a[k], b[k]));
}

export function imageValue(i: ProjectImage): JsonValue {
  return toJson({
    id: i.id,
    name: i.name,
    file: i.file,
    width: i.width,
    height: i.height,
    placement: i.placement,
    markingColor: i.markingColor,
    locked: i.locked,
    source: i.source,
  });
}

export function markingValue(m: Marking): JsonValue {
  return toJson({
    id: m.id,
    imageId: m.imageId,
    parentId: m.parentId,
    name: m.name,
    rect: m.rect,
    needsReview: m.needsReview,
    locked: m.locked,
    source: m.source,
  });
}

export function annotationValue(a: Annotation): JsonValue {
  return toJson({
    id: a.id,
    markingId: a.markingId,
    layerId: a.layerId,
    name: a.name,
    inherit: a.inherit,
    parentAnnotationId: a.parentAnnotationId,
    type: a.type,
    values: a.values,
    entries: a.entries,
  });
}

export function layerValue(l: Layer): JsonValue {
  return toJson({ id: l.id, name: l.name, color: l.color, spec: l.spec });
}

export function specializationValue(s: ProjectSpecialization): JsonValue {
  return toJson({ id: s.id, version: s.version, file: s.file, spec: s.spec });
}

export function platformRepoValue(r: PlatformRepo): JsonValue {
  return toJson({ urlTemplate: r.urlTemplate, localPath: r.localPath });
}

/** Campos que a revisão compara em cada entidade (os de `annotation` são os fixos). */
export const COMPARED_FIELDS = {
  image: ['name', 'file', 'placement', 'markingColor', 'locked', 'source'],
  marking: ['name', 'rect', 'parentId', 'imageId', 'locked', 'source'],
  annotation: ['name', 'inherit', 'parentAnnotationId', 'markingId', 'layerId'],
  layer: ['name', 'color', 'spec'],
} as const;

export function imageField(i: ProjectImage, field: string): JsonValue | undefined {
  switch (field) {
    case 'name':
      return i.name;
    case 'file':
      return { file: i.file, width: i.width, height: i.height };
    case 'placement':
      return toJson(i.placement);
    case 'markingColor':
      return i.markingColor;
    case 'locked':
      return i.locked;
    case 'source':
      return toJson(i.source);
    default:
      return undefined;
  }
}

export function markingField(m: Marking, field: string): JsonValue | undefined {
  switch (field) {
    case 'name':
      return m.name;
    case 'rect':
      return toJson(m.rect);
    case 'parentId':
      return m.parentId;
    case 'imageId':
      return m.imageId;
    case 'locked':
      return m.locked;
    case 'source':
      return toJson(m.source);
    default:
      return undefined;
  }
}

/** Valor do campo `type` de uma anotação: o tipo com os valores e pares. */
export function annotationTypeField(a: Annotation): JsonValue {
  return toJson({ type: a.type, values: a.values, entries: a.entries });
}

export function annotationField(a: Annotation, field: string): JsonValue | undefined {
  if (field.startsWith(VALUES_FIELD_PREFIX)) {
    const key = field.slice(VALUES_FIELD_PREFIX.length);
    // Campo ausente vale como vazio (`null`), como na leitura das tipadas.
    return a.values ? toJson(a.values[key] ?? null) : undefined;
  }
  if (field.startsWith(ENTRIES_FIELD_PREFIX)) {
    const entryId = field.slice(ENTRIES_FIELD_PREFIX.length);
    if (a.type !== null) return undefined;
    const entry = a.entries.find((e) => e.id === entryId);
    return entry ? { key: entry.key, value: entry.value } : null;
  }
  switch (field) {
    case 'name':
      return a.name;
    case 'inherit':
      return a.inherit;
    case 'parentAnnotationId':
      return a.parentAnnotationId;
    case 'markingId':
      return a.markingId;
    case 'layerId':
      return a.layerId;
    case 'type':
      return annotationTypeField(a);
    default:
      return undefined;
  }
}

export function layerField(p: Project, l: Layer, field: string): JsonValue | undefined {
  switch (field) {
    case 'name':
      return l.name;
    case 'color':
      return l.color;
    case 'spec':
      return toJson(l.spec);
    case 'position':
      return p.layers.indexOf(l);
    default:
      return undefined;
  }
}

/**
 * O valor atual que corresponde a `from`/`to` da mudança: a entidade inteira (criação,
 * remoção, especialização e repositório) ou o campo. `undefined` se a entidade (ou o
 * campo, ex: `values.*` numa anotação livre) não existe no projeto.
 */
export function currentValue(p: Project, c: Change): JsonValue | undefined {
  const index = projectIndex(p);
  const whole = c.kind !== 'update' || c.field === null;
  switch (c.entity) {
    case 'specialization': {
      const s = index.specializations.get(c.entityId);
      return s ? specializationValue(s) : undefined;
    }
    case 'platformRepo': {
      const r = Object.hasOwn(p.platformRepos, c.entityId)
        ? p.platformRepos[c.entityId]
        : undefined;
      return r ? platformRepoValue(r) : undefined;
    }
    case 'layer': {
      const l = index.layers.get(c.entityId);
      if (!l) return undefined;
      return whole ? layerValue(l) : layerField(p, l, c.field ?? '');
    }
    case 'image': {
      const i = index.images.get(c.entityId);
      if (!i) return undefined;
      return whole ? imageValue(i) : imageField(i, c.field ?? '');
    }
    case 'marking': {
      const m = index.markings.get(c.entityId);
      if (!m) return undefined;
      return whole ? markingValue(m) : markingField(m, c.field ?? '');
    }
    case 'annotation': {
      const a = index.annotations.get(c.entityId);
      if (!a) return undefined;
      return whole ? annotationValue(a) : annotationField(a, c.field ?? '');
    }
  }
}

/** Chave de uma entidade (`marking:3f2a…`) nos mapas das propostas. */
export function entityKey(entity: ChangeEntity, entityId: string): string {
  return `${entity}:${entityId}`;
}

/** Referência de uma mudança a outra entidade. `strong`: as invariantes exigem o alvo. */
export interface ValueRef {
  readonly key: string;
  readonly strong: boolean;
}

function str(value: JsonValue | undefined): string | null {
  return typeof value === 'string' && value !== '' ? value : null;
}

function field(value: JsonValue, key: string): JsonValue | undefined {
  return isRecord(value) ? value[key] : undefined;
}

/** Referências fracas (campos `ref`) dentro dos valores de uma anotação tipada. */
function valueRefs(values: JsonValue | undefined, out: ValueRef[]): void {
  if (!isRecord(values)) return;
  for (const value of Object.values(values)) refOfValue(value, out);
}

function refOfValue(value: JsonValue | undefined, out: ValueRef[]): void {
  const ref = parseRefValue(value);
  if (ref) out.push({ key: entityKey('annotation', ref.annotationId), strong: false });
}

function push(out: ValueRef[], entity: ChangeEntity, id: string | null): void {
  if (id !== null) out.push({ key: entityKey(entity, id), strong: true });
}

/** Referências de uma entidade inteira (valor de criação ou remoção). */
function entityRefs(entity: ChangeEntity, value: JsonValue): ValueRef[] {
  const out: ValueRef[] = [];
  if (entity === 'marking') {
    push(out, 'image', str(field(value, 'imageId')));
    push(out, 'marking', str(field(value, 'parentId')));
  } else if (entity === 'annotation') {
    push(out, 'marking', str(field(value, 'markingId')));
    push(out, 'layer', str(field(value, 'layerId')));
    push(out, 'annotation', str(field(value, 'parentAnnotationId')));
    push(out, 'specialization', str(field(field(value, 'type') ?? null, 'specId')));
    valueRefs(field(value, 'values'), out);
  } else if (entity === 'layer') {
    push(out, 'specialization', str(field(field(value, 'spec') ?? null, 'specId')));
  }
  return out;
}

/** Referências do valor de um campo. */
function fieldRefs(entity: ChangeEntity, name: string, value: JsonValue): ValueRef[] {
  const out: ValueRef[] = [];
  if (entity === 'marking') {
    if (name === 'parentId') push(out, 'marking', str(value));
    if (name === 'imageId') push(out, 'image', str(value));
  } else if (entity === 'annotation') {
    if (name === 'parentAnnotationId') push(out, 'annotation', str(value));
    if (name === 'markingId') push(out, 'marking', str(value));
    if (name === 'layerId') push(out, 'layer', str(value));
    if (name === 'type') {
      push(out, 'specialization', str(field(field(value, 'type') ?? null, 'specId')));
      valueRefs(field(value, 'values'), out);
    }
    if (name.startsWith(VALUES_FIELD_PREFIX)) refOfValue(value, out);
  } else if (entity === 'layer' && name === 'spec') {
    push(out, 'specialization', str(field(value, 'specId')));
  }
  return out;
}

/** O que o estado proposto (`to`) da mudança cita. */
export function toSideRefs(c: Change): ValueRef[] {
  if (c.kind === 'remove') return [];
  if (c.kind === 'create' || c.field === null) return entityRefs(c.entity, c.to);
  return fieldRefs(c.entity, c.field, c.to);
}

/** O que o estado anterior (`from`) da mudança cita. */
export function fromSideRefs(c: Change): ValueRef[] {
  if (c.kind === 'create') return [];
  if (c.kind === 'remove' || c.field === null) return entityRefs(c.entity, c.from);
  return fieldRefs(c.entity, c.field, c.from);
}

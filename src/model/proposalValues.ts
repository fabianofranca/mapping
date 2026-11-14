import {
  ENTRIES_FIELD_PREFIX,
  VALUES_FIELD_PREFIX,
  type Change,
  type ChangeEntity,
} from './proposal';
import { siblingPosition } from './markings';
import { projectIndex } from './projectIndex';
import { isRecord, parseRefValue } from './refs';
import type {
  Annotation,
  Arrow,
  JsonValue,
  Layer,
  Marking,
  DocRepo,
  PlatformRepo,
  Project,
  ProjectContainer,
  ProjectSpecialization,
} from './types';

// Values of the changes (stage 4): the JSON form of each entity and of each field, used to
// compute the changes, check conflicts and apply. Internal use of the model.

/** JSON copy (without `undefined`), with the keys in the order they are in. */
export function toJson(value: unknown): JsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as JsonValue;
}

/** Equality of JSON values, without depending on key order. */
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

export function imageValue(i: ProjectContainer): JsonValue {
  return toJson({
    id: i.id,
    name: i.name,
    file: i.file,
    background: i.background,
    width: i.width,
    height: i.height,
    placement: i.placement,
    markingColor: i.markingColor,
    locked: i.locked,
    source: i.source,
    // Only when pinned (formatVersion 6): without it the value is that of before the drawing mode.
    ...(i.drawingMode == null ? {} : { drawingMode: i.drawingMode }),
    // Only when declared (formatVersion 7).
    ...(i.density == null ? {} : { density: i.density }),
    // Only when pinned (formatVersion 8).
    ...(i.direction == null ? {} : { direction: i.direction }),
  });
}

export function markingValue(m: Marking): JsonValue {
  return toJson({
    id: m.id,
    containerId: m.containerId,
    parentId: m.parentId,
    floating: m.floating,
    name: m.name,
    rect: m.rect,
    needsReview: m.needsReview,
    locked: m.locked,
    source: m.source,
    // Only when anchored (formatVersion 9): without it the value is that of before the anchor.
    ...(m.anchor == null ? {} : { anchor: m.anchor }),
  });
}

/**
 * The arrow in a proposal: without the route (`points`), which belongs only to the person. So a
 * route the person draws later does not make the arrow's removal conflict, and creating an
 * arrow never carries it.
 */
export function arrowValue(a: Arrow): JsonValue {
  return toJson({
    id: a.id,
    from: a.from,
    to: a.to,
    fromSide: a.fromSide,
    toSide: a.toSide,
    style: a.style,
    name: a.name,
    locked: a.locked,
  });
}

export function annotationValue(a: Annotation): JsonValue {
  return toJson({
    id: a.id,
    markingId: a.markingId,
    layerId: a.layerId,
    name: a.name,
    parentAnnotationId: a.parentAnnotationId,
    parentRole: a.parentRole,
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

export function docRepoValue(r: DocRepo): JsonValue {
  return toJson({ localPath: r.localPath });
}

/**
 * What of the project the proposal carries (`project` entity, formatVersion 6): the drawing mode
 * and, only when pinned (formatVersion 8), the reading direction.
 */
export function projectValue(p: Pick<Project, 'drawingMode' | 'direction'>): JsonValue {
  return {
    drawingMode: p.drawingMode ?? null,
    ...(p.direction === undefined ? {} : { direction: p.direction }),
  };
}

export function platformRepoValue(r: PlatformRepo): JsonValue {
  return toJson({ localPath: r.localPath });
}

/**
 * Fields the review compares in each entity (those of `annotation` are the fixed ones). On the
 * marking, `space` (`{ containerId, rect }`) replaces `rect` when it changes space
 * (`markingFieldsFor`); `parentId` is derived from settling and is not included.
 */
export const COMPARED_FIELDS = {
  image: [
    'name',
    'file',
    'background',
    'size',
    'placement',
    'markingColor',
    'locked',
    'source',
    'drawingMode',
    'density',
    'direction',
  ],
  marking: ['name', 'space', 'rect', 'floating', 'locked', 'source', 'anchor'],
  // The arrow is only created and removed: none of its fields is compared (see `ARROW_FIELDS`).
  arrow: [],
  annotation: ['name', 'parentAnnotationId', 'parentRole', 'markingId', 'layerId'],
  layer: ['name', 'color', 'spec'],
} as const;

/**
 * Compared fields of a marking that exists before and after: a change of space is the composite
 * change `space` (the `rect` goes inside it); without a change, `rect` is a separate field.
 */
export function markingFieldsFor(
  before: Pick<Marking, 'containerId'>,
  after: Pick<Marking, 'containerId'>,
): readonly string[] {
  const moved = before.containerId !== after.containerId;
  return COMPARED_FIELDS.marking.filter((f) => f !== (moved ? 'rect' : 'space'));
}

export function imageField(i: ProjectContainer, field: string): JsonValue | undefined {
  switch (field) {
    case 'name':
      return i.name;
    case 'file':
      // A container without a file has no file: its size is the `size` field.
      return i.file === null
        ? undefined
        : { file: i.file, width: i.width, height: i.height };
    case 'background':
      return i.background ?? undefined;
    case 'size':
      return i.file === null ? { width: i.width, height: i.height } : undefined;
    case 'placement':
      return toJson(i.placement);
    case 'markingColor':
      return i.markingColor;
    case 'locked':
      return i.locked;
    case 'source':
      return toJson(i.source);
    case 'drawingMode':
      return i.drawingMode ?? null;
    case 'density':
      return i.density ?? null;
    case 'direction':
      return i.direction ?? null;
    default:
      return undefined;
  }
}

/** The fields of a marking that depend only on it (not on the project): each reads its value. */
const MARKING_FIELD_READERS: Readonly<Record<string, (m: Marking) => JsonValue>> = {
  name: (m) => m.name,
  rect: (m) => toJson(m.rect),
  space: (m) => toJson({ containerId: m.containerId, rect: m.rect }),
  containerId: (m) => m.containerId,
  floating: (m) => m.floating,
  locked: (m) => m.locked,
  source: (m) => toJson(m.source),
  anchor: (m) => toJson(m.anchor ?? null),
};

export function markingField(
  p: Project,
  m: Marking,
  field: string,
): JsonValue | undefined {
  if (field === 'position') return siblingPosition(p, m.id).index;
  return Object.hasOwn(MARKING_FIELD_READERS, field)
    ? MARKING_FIELD_READERS[field]?.(m)
    : undefined;
}

/** Value of the `type` field of an annotation: the type with the values and pairs. */
export function annotationTypeField(a: Annotation): JsonValue {
  return toJson({ type: a.type, values: a.values, entries: a.entries });
}

export function annotationField(a: Annotation, field: string): JsonValue | undefined {
  if (field.startsWith(VALUES_FIELD_PREFIX)) {
    const key = field.slice(VALUES_FIELD_PREFIX.length);
    // A missing field counts as empty (`null`), as when reading the typed ones.
    return a.values
      ? toJson(Object.hasOwn(a.values, key) ? (a.values[key] ?? null) : null)
      : undefined;
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
    case 'parentAnnotationId':
      return a.parentAnnotationId;
    case 'parentRole':
      return a.parentRole;
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
 * The current value that corresponds to the change's `from`/`to`: the whole entity (creation,
 * removal, specialization and repository) or the field. `undefined` if the entity (or the
 * field, e.g. `values.*` on a free annotation) does not exist in the project.
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
    case 'docRepo': {
      const r = Object.hasOwn(p.docRepos, c.entityId)
        ? p.docRepos[c.entityId]
        : undefined;
      return r ? docRepoValue(r) : undefined;
    }
    case 'project':
      return projectValue(p);
    case 'layer': {
      const l = index.layers.get(c.entityId);
      if (!l) return undefined;
      return whole ? layerValue(l) : layerField(p, l, c.field ?? '');
    }
    case 'image': {
      const i = index.containers.get(c.entityId);
      if (!i) return undefined;
      return whole ? imageValue(i) : imageField(i, c.field ?? '');
    }
    case 'marking': {
      const m = index.markings.get(c.entityId);
      if (!m) return undefined;
      return whole ? markingValue(m) : markingField(p, m, c.field ?? '');
    }
    case 'arrow': {
      // Only creation and removal (whole entity): there is no arrow field.
      const a = index.arrows.get(c.entityId);
      return a && whole ? arrowValue(a) : undefined;
    }
    case 'annotation': {
      const a = index.annotations.get(c.entityId);
      if (!a) return undefined;
      return whole ? annotationValue(a) : annotationField(a, c.field ?? '');
    }
  }
}

/**
 * Key of an entity (`marking:3f2a…`) in the proposals' maps. The arrow uses the marking's key:
 * the ids share the space and the annotation cites its owner (marking or arrow) by the same
 * `markingId`, so creating the arrow and annotating it, or deleting it, link up as on a marking.
 */
export function entityKey(entity: ChangeEntity, entityId: string): string {
  return `${entity === 'arrow' ? 'marking' : entity}:${entityId}`;
}

/** Reference from one change to another entity. `strong`: the invariants require the target. */
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

/** Weak references (`ref` fields) inside the values of a typed annotation. */
function valueRefs(values: JsonValue | undefined, out: ValueRef[]): void {
  if (!isRecord(values)) return;
  for (const value of Object.values(values)) {
    refOfValue(value, out);
    // `ref` column of `table` (decision (e)): each cell of the row can be a reference.
    if (Array.isArray(value)) {
      for (const row of value as readonly JsonValue[]) {
        if (isRecord(row)) for (const cell of Object.values(row)) refOfValue(cell, out);
      }
    }
  }
}

function refOfValue(value: JsonValue | undefined, out: ValueRef[]): void {
  const ref = parseRefValue(value);
  if (ref) out.push({ key: entityKey('annotation', ref.annotationId), strong: false });
}

function push(out: ValueRef[], entity: ChangeEntity, id: string | null): void {
  if (id !== null) out.push({ key: entityKey(entity, id), strong: true });
}

/** References of a whole entity (creation or removal value). */
function entityRefs(entity: ChangeEntity, value: JsonValue): ValueRef[] {
  const out: ValueRef[] = [];
  if (entity === 'marking') {
    push(out, 'image', str(field(value, 'containerId')));
    push(out, 'marking', str(field(value, 'parentId')));
    // The anchor (v20) is a strong reference: `anchor-missing` if the target does not exist.
    push(out, 'marking', str(field(field(value, 'anchor') ?? null, 'to')));
  } else if (entity === 'arrow') {
    // Both endpoints are markings that must exist (invariant `arrow-endpoint-missing`).
    push(out, 'marking', str(field(value, 'from')));
    push(out, 'marking', str(field(value, 'to')));
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

/** References of a field's value. */
function fieldRefs(entity: ChangeEntity, name: string, value: JsonValue): ValueRef[] {
  const out: ValueRef[] = [];
  if (entity === 'marking') {
    // `parentId` is derived (not a field): only the space cites a container.
    if (name === 'containerId') push(out, 'image', str(value));
    if (name === 'space') push(out, 'image', str(field(value, 'containerId')));
    if (name === 'anchor') push(out, 'marking', str(field(value, 'to')));
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

/** What the change's proposed state (`to`) cites. */
export function toSideRefs(c: Change): ValueRef[] {
  if (c.kind === 'remove') return [];
  if (c.kind === 'create' || c.field === null) return entityRefs(c.entity, c.to);
  return fieldRefs(c.entity, c.field, c.to);
}

/** What the change's previous state (`from`) cites. */
export function fromSideRefs(c: Change): ValueRef[] {
  if (c.kind === 'create') return [];
  if (c.kind === 'remove' || c.field === null) return entityRefs(c.entity, c.from);
  return fieldRefs(c.entity, c.field, c.from);
}

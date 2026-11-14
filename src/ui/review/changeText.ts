import { t, type TranslationKey } from '../../i18n';
import {
  ENTRIES_FIELD_PREFIX,
  VALUES_FIELD_PREFIX,
  annotationTitle,
  fieldLabel,
  fieldOf,
  findSpecType,
  isRecord,
  parseRefValue,
  projectIndex,
  proposalIndex,
  refLabel,
  roleNameOf,
  type Annotation,
  type Change,
  type JsonValue,
  type Project,
  type Proposal,
  type ReviewTarget,
} from '../../model';
import { formatDensity } from '../density';
import { imageLabel, markingLabel } from '../labels';
import { labelTexts } from '../typedText';
import { joinParts } from './format';

// Texts of the changes in review (titles, before/after values and the one-line
// summary). Presentation only: what each change is comes from the model (`Change`) and the values,
// from the proposal. The names of the cited entities are looked up in the current project, then in the
// "as it would be" and, last, in the change's own `from`/`to`.

/** Current project and the "as it would be", where the names come from. */
export interface ReviewNames {
  readonly current: Project;
  readonly preview: Project | null;
  readonly proposal: Proposal;
}

/** A piece of a value; `strong` highlights what changes (e.g. the `y` of a position). */
export interface ValuePart {
  readonly text: string;
  readonly strong?: boolean;
}

function lookup<T>(
  names: ReviewNames,
  get: (p: Project) => T | undefined,
): T | undefined {
  return get(names.current) ?? (names.preview ? get(names.preview) : undefined);
}

/** The entity as a record (on creation the `to`, on removal the `from`). */
function entityRecord(c: Change): Record<string, JsonValue> | null {
  const value = c.kind === 'remove' ? c.from : c.to;
  return isRecord(value) ? value : null;
}

const text = (v: JsonValue | undefined): string | null =>
  typeof v === 'string' && v !== '' ? v : null;

interface EntityLookup {
  /** The first change of each entity (by id). */
  readonly firstOf: ReadonlyMap<string, Change>;
  /** The whole-entity change (creation or removal: `field` null), by id. */
  readonly wholeOf: ReadonlyMap<string, Change>;
}

const lookups = new WeakMap<readonly Change[], EntityLookup>();

/** Indexes of the changes by entity id, built once per list (no `find` per row). */
function entityLookup(names: ReviewNames): EntityLookup {
  const changes = names.proposal.changes;
  const cached = lookups.get(changes);
  if (cached) return cached;
  const firstOf = new Map<string, Change>();
  const wholeOf = new Map<string, Change>();
  for (const c of changes) {
    if (!firstOf.has(c.entityId)) firstOf.set(c.entityId, c);
    if (c.field === null && !wholeOf.has(c.entityId)) wholeOf.set(c.entityId, c);
  }
  const built = { firstOf, wholeOf };
  lookups.set(changes, built);
  return built;
}

/** The whole-entity change if it is of the given `entity`. */
function wholeChange(names: ReviewNames, entity: Change['entity'], id: string) {
  const c = entityLookup(names).wholeOf.get(id);
  return c?.entity === entity ? c : undefined;
}

/**
 * Name of an arrow: its `name`, otherwise "Origin → Destination" (the ends by the names of the
 * markings). `null` if the arrow is neither in the project nor in a creation or removal of the proposal.
 */
function arrowName(names: ReviewNames, id: string): string | null {
  let source: { readonly name: string | null; from: string; to: string } | null =
    lookup(names, (p) => projectIndex(p).arrows.get(id)) ?? null;
  if (!source) {
    const c = wholeChange(names, 'arrow', id);
    const record = c && entityRecord(c);
    if (record && typeof record.from === 'string' && typeof record.to === 'string') {
      source = { name: text(record.name), from: record.from, to: record.to };
    }
  }
  if (!source) return null;
  return (
    source.name ??
    t('review.arrow.label', {
      from: markingName(names, source.from),
      to: markingName(names, source.to),
    })
  );
}

/** Name of the review item: the marking, or the arrow (the ids share the space, ME4). */
export function markingName(names: ReviewNames, id: string): string {
  // The label uses the project where the marking was found (the type comes from its annotations).
  for (const p of [names.current, names.preview]) {
    const found = p ? projectIndex(p).markings.get(id) : undefined;
    if (found && p) return markingLabel(p, found);
  }
  const arrow = arrowName(names, id);
  if (arrow !== null) return arrow;
  const created = wholeChange(names, 'marking', id);
  const name = created && text(entityRecord(created)?.name);
  return name || t('marking.unnamed');
}

/** Container without a file created by the proposal (image without a file): its default name. */
function backgroundName(
  record: Record<string, JsonValue> | null | undefined,
): string | null {
  return record && record.file === null && typeof record.background === 'string'
    ? t('image.containerUntitled')
    : null;
}

export function imageName(names: ReviewNames, id: string): string {
  const found = lookup(names, (p) => projectIndex(p).containers.get(id));
  if (found) return imageLabel(found);
  const c = wholeChange(names, 'image', id);
  if (c) {
    const record = entityRecord(c);
    const name = text(record?.name) ?? text(record?.file) ?? backgroundName(record);
    if (name) return name;
  }
  return id;
}

function layerName(names: ReviewNames, id: string): string {
  return lookup(names, (p) => projectIndex(p).layers.get(id))?.name ?? id;
}

function annotationName(names: ReviewNames, id: string): string {
  const inPreview = names.preview && projectIndex(names.preview).annotations.get(id);
  const inCurrent = projectIndex(names.current).annotations.get(id);
  const found: Annotation | undefined = inPreview || inCurrent || undefined;
  if (found) {
    const project = inPreview ? (names.preview ?? names.current) : names.current;
    return annotationTitle(project, found) ?? t('annotation.unnamed');
  }
  const c = wholeChange(names, 'annotation', id);
  if (c) {
    const record = entityRecord(c);
    const name = text(record?.name);
    if (name) return name;
    const type = record?.type;
    if (isRecord(type) && typeof type.typeId === 'string') {
      return typeName(names, type.specId, type.typeId);
    }
  }
  return t('annotation.unnamed');
}

/**
 * Name of the role of an annotation's link ("Click"): by the type of its owner in the preview and,
 * otherwise, in the current project (the owner can change in the same proposal); the id if neither offers it.
 */
function roleName(names: ReviewNames, annotationId: string, roleId: string): string {
  for (const p of [names.preview, names.current]) {
    const index = p ? projectIndex(p) : null;
    const parentId = index?.annotations.get(annotationId)?.parentAnnotationId;
    const owner = parentId ? index?.annotations.get(parentId) : undefined;
    if (p && owner) {
      const name = roleNameOf(p, owner, roleId);
      if (name !== roleId) return name;
    }
  }
  return roleId;
}

/**
 * Name of the type ("Button"), with the same casing as the list and Details: from the project's
 * specialization, otherwise from the one the proposal itself applies (new import); lastly, the id.
 */
function typeName(
  names: ReviewNames,
  specId: JsonValue | undefined,
  typeId: string,
): string {
  if (typeof specId !== 'string') return typeId;
  const found = lookup(names, (p) => findSpecType(p, { specId, typeId })?.type.name);
  if (found) return found;
  for (const c of names.proposal.changes) {
    if (c.entity !== 'specialization' || c.entityId !== specId) continue;
    const record = entityRecord(c);
    const spec = record && isRecord(record.spec) ? record.spec : null;
    const layers = spec && Array.isArray(spec.layers) ? spec.layers : [];
    for (const layer of layers) {
      const types =
        isRecord(layer) && Array.isArray(layer.annotationTypes)
          ? layer.annotationTypes
          : [];
      for (const type of types) {
        if (isRecord(type) && type.id === typeId) return text(type.name) ?? typeId;
      }
    }
  }
  return typeId;
}

function specName(names: ReviewNames, c: Change): string {
  const record = isRecord(c.to) ? c.to : isRecord(c.from) ? c.from : null;
  const spec = record && isRecord(record.spec) ? record.spec : null;
  return text(spec?.name) ?? c.entityId;
}

/** Name of a review level (proposal, Project, Canvas, image or item). */
export function targetName(names: ReviewNames, target: ReviewTarget): string {
  switch (target.level) {
    case 'proposal':
      return names.proposal.title;
    case 'project':
      return t('review.level.project');
    case 'canvas':
      return t('review.level.canvas');
    case 'image':
      return target.id === null ? '' : imageName(names, target.id);
    case 'item':
      return target.id === null ? '' : markingName(names, target.id);
    case 'change': {
      const c =
        target.id === null
          ? undefined
          : proposalIndex(names.proposal).changes.get(target.id);
      return c ? changeTitle(names, c) : '';
    }
  }
}

const FIELD_KEYS: Readonly<Record<string, TranslationKey>> = {
  'marking.name': 'review.field.name',
  'marking.rect': 'review.field.rect',
  'marking.space': 'review.field.space',
  'marking.floating': 'review.field.floating',
  'marking.containerId': 'review.field.image',
  'marking.locked': 'review.field.locked',
  'marking.source': 'review.field.source',
  'marking.position': 'review.field.position',
  'marking.anchor': 'review.field.anchor',
  'image.name': 'review.field.name',
  'image.file': 'review.field.file',
  'image.background': 'review.field.background',
  'image.size': 'review.field.size',
  'image.placement': 'review.field.placement',
  'image.markingColor': 'review.field.markingColor',
  'image.locked': 'review.field.locked',
  'image.source': 'review.field.source',
  'image.drawingMode': 'review.field.drawingMode',
  'image.density': 'review.field.density',
  'image.direction': 'review.field.direction',
  'project.drawingMode': 'review.field.drawingMode',
  'project.direction': 'review.field.direction',
  'annotation.name': 'review.field.annotationName',
  'annotation.parentAnnotationId': 'review.field.owner',
  'annotation.parentRole': 'review.field.role',
  'annotation.markingId': 'review.field.marking',
  'annotation.layerId': 'review.field.layer',
  'annotation.type': 'review.field.type',
  'layer.name': 'review.field.name',
  'layer.color': 'review.field.color',
  'layer.spec': 'review.field.spec',
  'layer.position': 'review.field.position',
};

const ENTITY_KEYS = {
  specialization: 'review.entity.specialization',
  platformRepo: 'review.entity.platformRepo',
  docRepo: 'review.entity.docRepo',
  layer: 'review.entity.layer',
  image: 'review.entity.image',
  marking: 'review.entity.marking',
  arrow: 'review.entity.arrow',
  annotation: 'review.entity.annotation',
  project: 'review.entity.project',
} as const satisfies Record<Change['entity'], TranslationKey>;

/** The entity type in full ("Layer"). */
export function entityLabel(entity: Change['entity']): string {
  return t(ENTITY_KEYS[entity]);
}

/** The type of the entity that the proposal cites with that id (by the first change on it). */
export function entityKindOf(names: ReviewNames, id: string): Change['entity'] | null {
  return entityLookup(names).firstOf.get(id)?.entity ?? null;
}

/**
 * Name of an entity cited only by id (the problems of the accepted set): looked up in the
 * preview and in the current project (marking, image, layer, annotation, specialization) and, lastly,
 * in the record of its creation or removal in the proposal. `null` if it is nowhere:
 * the target no longer exists.
 */
export function entityName(names: ReviewNames, id: string): string | null {
  for (const p of names.preview ? [names.preview, names.current] : [names.current]) {
    const index = projectIndex(p);
    if (index.markings.has(id)) return markingName(names, id);
    if (index.arrows.has(id)) return arrowName(names, id);
    if (index.containers.has(id)) return imageName(names, id);
    if (index.layers.has(id)) return layerName(names, id);
    if (index.annotations.has(id)) return annotationName(names, id);
    // Without the copy in `specs/` (`spec: null`), the name may be in the proposal itself.
    const spec = index.specializations.get(id)?.spec;
    if (spec) return spec.name;
  }
  const c = entityLookup(names).wholeOf.get(id);
  if (c) {
    const record = entityRecord(c);
    if (c.entity === 'annotation') return annotationName(names, id);
    if (c.entity === 'arrow') return arrowName(names, id);
    if (c.entity === 'specialization') {
      const name = text(record && isRecord(record.spec) ? record.spec.name : undefined);
      if (name) return name;
    } else if (c.entity !== 'platformRepo' && c.entity !== 'docRepo') {
      const name =
        text(record?.name) ??
        (c.entity === 'image' ? (text(record?.file) ?? backgroundName(record)) : null);
      if (name) return name;
    }
  }
  return null;
}

/** Label of a field of an entity (`marking` + `rect` → "Position"); the key when there is no label. */
export function entityFieldLabel(entity: Change['entity'], key: string): string {
  const label = FIELD_KEYS[`${entity}.${key}`];
  return label ? t(label) : key;
}

/** Name of a typed field (the field's label in the specialization, otherwise the key). */
export function valueFieldLabel(names: ReviewNames, c: Change, key: string): string {
  const project = names.preview ?? names.current;
  const a =
    projectIndex(project).annotations.get(c.entityId) ??
    projectIndex(names.current).annotations.get(c.entityId);
  const type = a?.type ? findSpecType(project, a.type) : null;
  const field = type ? fieldOf(type.type, key) : null;
  return field ? fieldLabel(field) : key;
}

/** Name of the change's object, for the titles ("Annotation onClick", "Layer Events"). */
function subjectName(names: ReviewNames, c: Change): string | null {
  switch (c.entity) {
    case 'annotation':
      return annotationName(names, c.entityId);
    case 'layer':
      return layerName(names, c.entityId);
    case 'specialization':
      return specName(names, c);
    case 'platformRepo':
    case 'docRepo':
      return c.entityId;
    case 'image':
      return imageName(names, c.entityId);
    case 'marking':
      return markingName(names, c.entityId);
    case 'arrow':
      return arrowName(names, c.entityId);
    case 'project':
      return null;
  }
}

/** Title of a change ("Position", "Annotation onClick created", "style"). */
export function changeTitle(names: ReviewNames, c: Change): string {
  const entity = t(ENTITY_KEYS[c.entity]);
  const subject = subjectName(names, c);
  // "Repository" is masculine in Portuguese: "criado", "removido", "atualizado".
  const form =
    c.entity === 'platformRepo' || c.entity === 'docRepo' ? 'titleMasc' : 'title';
  if (c.kind === 'create') {
    return t(`review.${form}.created`, { entity, name: subject ?? '' }).trim();
  }
  if (c.kind === 'remove') {
    return t(`review.${form}.removed`, { entity, name: subject ?? '' }).trim();
  }
  if (c.field === null)
    return t(`review.${form}.updated`, { entity, name: subject ?? '' });
  const field = c.field;
  let label: string;
  if (field.startsWith(VALUES_FIELD_PREFIX)) {
    label = valueFieldLabel(names, c, field.slice(VALUES_FIELD_PREFIX.length));
  } else if (field.startsWith(ENTRIES_FIELD_PREFIX)) {
    const entry = [c.to, c.from].find(isRecord);
    label = text(entry?.key) ?? t('review.field.entry');
  } else {
    const key = FIELD_KEYS[`${c.entity}.${field}`];
    label = key ? t(key) : field;
  }
  // In annotations, the field comes with the annotation's name ("style · Button").
  return c.entity === 'annotation' && subject ? `${label} · ${subject}` : label;
}

// ---------------------------------------------------------------------------
// Values

function rectParts(value: JsonValue, other: JsonValue | undefined): ValuePart[] | null {
  if (!isRecord(value)) return null;
  const keys = ['x', 'y', 'width', 'height'] as const;
  if (!keys.every((k) => typeof value[k] === 'number')) return null;
  const labels = {
    x: t('review.rect.x'),
    y: t('review.rect.y'),
    width: t('review.rect.width'),
    height: t('review.rect.height'),
  };
  const parts: ValuePart[] = [];
  keys.forEach((k, i) => {
    if (i > 0) parts.push({ text: ' · ' });
    const changed = isRecord(other) && other[k] !== value[k];
    parts.push({ text: `${labels[k]} ${String(value[k])}`, strong: changed });
  });
  return parts;
}

/** Marking's space: the container (or Canvas) and the `rect` in it, "Home screen · X 10 · …". */
function spaceParts(names: ReviewNames, value: JsonValue): ValuePart[] {
  if (!isRecord(value)) return [{ text: compact(value) }];
  const space =
    typeof value.containerId === 'string'
      ? imageName(names, value.containerId)
      : t('review.level.canvas');
  const rect = rectParts(value.rect ?? null, undefined);
  return [{ text: space }, ...(rect ? [{ text: ' · ' }, ...rect] : [])];
}

function placementParts(
  value: JsonValue,
  other: JsonValue | undefined,
): ValuePart[] | null {
  if (!isRecord(value)) return null;
  const keys = ['x', 'y', 'scale'] as const;
  if (!keys.every((k) => typeof value[k] === 'number')) return null;
  const parts: ValuePart[] = [];
  keys.forEach((k, i) => {
    if (i > 0) parts.push({ text: ' · ' });
    const changed = isRecord(other) && other[k] !== value[k];
    const n = value[k] as number;
    const shown =
      k === 'scale' ? String(Math.round(n * 1000) / 1000) : String(Math.round(n));
    parts.push({ text: `${t(`review.placement.${k}`)} ${shown}`, strong: changed });
  });
  return parts;
}

/** Text of a cell or of a `ref` field: the target's label; otherwise the value as text. */
function cellText(names: ReviewNames, value: JsonValue): string {
  if (typeof value === 'string') return value;
  const ref = parseRefValue(value);
  if (ref) return refLabel(names.preview ?? names.current, ref, labelTexts());
  return JSON.stringify(value);
}

/** The rows of a table (`values.<field>` with a list of records), as text. */
export function tableLines(
  names: ReviewNames,
  value: JsonValue | undefined,
): { id: string; text: string }[] | null {
  if (!Array.isArray(value)) return null;
  return value.map((row, i) => {
    if (!isRecord(row)) return { id: String(i), text: String(row) };
    const id = typeof row._id === 'string' ? row._id : String(i);
    const cells = Object.entries(row)
      .filter(([k, v]) => k !== '_id' && v !== null && v !== '')
      .map(([k, v]) => `${k}: ${cellText(names, v)}`);
    return { id, text: cells.join(' · ') };
  });
}

/** Value of `values.<field>`: table by its rows, `ref` by the target's label; otherwise `null`. */
function typedValueParts(names: ReviewNames, value: JsonValue): ValuePart[] | null {
  const lines = tableLines(names, value);
  if (lines) return [{ text: lines.map((l) => l.text).join('\n') || compact(value) }];
  return parseRefValue(value) ? [{ text: cellText(names, value) }] : null;
}

/** Compact text of any JSON value (what has no shape of its own). */
function compact(value: JsonValue): string {
  if (value === null) return t('review.value.empty');
  if (typeof value === 'boolean')
    return t(value ? 'review.value.yes' : 'review.value.no');
  if (typeof value === 'string') return value === '' ? t('review.value.empty') : value;
  if (typeof value === 'number') return String(value);
  if (Array.isArray(value)) return t('review.value.items', { count: value.length });
  const json = JSON.stringify(value);
  return json.length > 80 ? `${json.slice(0, 79)}…` : json;
}

/** A marking's anchor: "above/start of Button" (what was not said is "default") and the offset, if any. */
function anchorText(names: ReviewNames, value: JsonValue): string {
  if (!isRecord(value) || typeof value.to !== 'string') return compact(value);
  const word = (kind: 'side' | 'align', v: JsonValue | undefined): string =>
    typeof v === 'string'
      ? t(`review.value.anchor.${kind}.${v}` as TranslationKey)
      : t('review.value.anchor.default');
  const summary = t('review.value.anchor', {
    side: word('side', value.side),
    align: word('align', value.align),
    name: markingName(names, value.to),
  });
  const { offset } = value;
  return isRecord(offset)
    ? t('review.value.anchor.offset', {
        summary,
        main: String(offset.main),
        cross: String(offset.cross),
      })
    : summary;
}

/** Text of a reading direction; `null` (absent) is "Follows the project" in the container and `ltr` in the project. */
function directionText(entity: Change['entity'], value: JsonValue): string {
  if (value === 'ltr' || value === 'rtl') return t(`review.value.direction.${value}`);
  return t(entity === 'image' ? 'direction.followProject' : 'review.value.direction.ltr');
}

/** The `project` entity: the drawing mode and, when pinned, "Direction: …". */
function projectSummary(value: Record<string, JsonValue>): string {
  const parts = [
    text(value.drawingMode),
    value.direction == null
      ? null
      : `${t('review.field.direction')}: ${directionText('project', value.direction)}`,
  ].filter((part) => part !== null && part !== '');
  return parts.length > 0 ? parts.join(' · ') : t('review.value.empty');
}

/** Summary of a whole entity (creation or removal). */
function entitySummary(names: ReviewNames, c: Change, value: JsonValue): string {
  if (!isRecord(value)) return compact(value);
  switch (c.entity) {
    case 'marking': {
      const rect = rectParts(value.rect ?? null, undefined);
      const name = text(value.name) ?? t('marking.unnamed');
      const where = value.containerId === null ? ` · ${t('review.level.canvas')}` : '';
      return rect
        ? `${name} · ${rect.map((p) => p.text).join('')}${where}`
        : name + where;
    }
    case 'image': {
      const name = text(value.name) ?? text(value.file) ?? backgroundName(value) ?? '';
      const size =
        typeof value.width === 'number' && typeof value.height === 'number'
          ? t('image.dimensions', { width: value.width, height: value.height })
          : '';
      return [name, size].filter(Boolean).join(' · ');
    }
    case 'arrow':
      return arrowName(names, c.entityId) ?? '';
    case 'annotation': {
      const layer =
        typeof value.layerId === 'string' ? layerName(names, value.layerId) : '';
      return [annotationName(names, c.entityId), layer].filter(Boolean).join(' · ');
    }
    case 'layer':
      return [text(value.name), text(value.color)].filter(Boolean).join(' · ');
    case 'specialization': {
      const version = typeof value.version === 'number' ? `v${value.version}` : '';
      return [specName(names, c), version].filter(Boolean).join(' ');
    }
    case 'platformRepo':
    case 'docRepo':
      return text(value.localPath) ?? c.entityId;
    case 'project':
      return projectSummary(value);
  }
}

/**
 * Value of one side of the change, in parts (what changes highlighted). `other`: the value of the
 * other side, to highlight only the position number that changes.
 */
export function valueParts(
  names: ReviewNames,
  c: Change,
  value: JsonValue | undefined,
  other?: JsonValue,
): ValuePart[] {
  if (value === undefined) return [{ text: t('review.value.missing') }];
  if (c.field === null || c.kind !== 'update') {
    return [{ text: entitySummary(names, c, value) }];
  }
  const field = c.field;
  if (field === 'rect') return rectParts(value, other) ?? [{ text: compact(value) }];
  if (field === 'space') return spaceParts(names, value);
  if (field === 'placement')
    return placementParts(value, other) ?? [{ text: compact(value) }];
  // Density (v19): absent (`null`) is 1, and the number follows the language (2.5 in pt-BR).
  if (field === 'density') {
    return [{ text: formatDensity(typeof value === 'number' ? value : 1) }];
  }
  if (field === 'direction') return [{ text: directionText(c.entity, value) }];
  if (field === 'anchor' && value !== null) return [{ text: anchorText(names, value) }];
  if (value === null) return [{ text: t('review.value.empty') }];
  if (field.startsWith(VALUES_FIELD_PREFIX)) {
    const typedParts = typedValueParts(names, value);
    if (typedParts) return typedParts;
  }
  if (field === 'markingId' && typeof value === 'string') {
    return [{ text: markingName(names, value) }];
  }
  if (field === 'containerId' && typeof value === 'string') {
    return [{ text: imageName(names, value) }];
  }
  if (field === 'layerId' && typeof value === 'string') {
    return [{ text: layerName(names, value) }];
  }
  if (field === 'parentAnnotationId' && typeof value === 'string') {
    return [{ text: annotationName(names, value) }];
  }
  if (field === 'parentRole' && typeof value === 'string') {
    return [{ text: roleName(names, c.entityId, value) }];
  }
  if (field === 'size' && isRecord(value)) {
    if (typeof value.width === 'number' && typeof value.height === 'number') {
      return [
        { text: t('image.dimensions', { width: value.width, height: value.height }) },
      ];
    }
  }
  if (field === 'file' && isRecord(value)) {
    const size =
      typeof value.width === 'number' && typeof value.height === 'number'
        ? ` (${t('image.dimensions', { width: value.width, height: value.height })})`
        : '';
    return [{ text: `${text(value.file) ?? ''}${size}` }];
  }
  if (field === 'source' && isRecord(value)) {
    return [{ text: `${text(value.system) ?? ''}: ${text(value.id) ?? ''}` }];
  }
  if (field === 'type' && isRecord(value)) {
    const type = isRecord(value.type) ? text(value.type.typeId) : null;
    return [{ text: type ?? t('review.value.free') }];
  }
  if (field === 'spec' && isRecord(value)) {
    return [{ text: text(value.specId) ?? compact(value) }];
  }
  if (field === 'position' && typeof value === 'number') {
    return [{ text: t('review.value.position', { n: value + 1 }) }];
  }
  if (field.startsWith(ENTRIES_FIELD_PREFIX) && isRecord(value)) {
    return [{ text: `${text(value.key) ?? ''}: ${text(value.value) ?? ''}` }];
  }
  return [{ text: compact(value) }];
}

/** The running text of the parts of a value. */
export const partsText = (parts: readonly ValuePart[]) =>
  parts.map((p) => p.text).join('');

/** One-line summary of the change: "y 476 → 532", "primary → secondary", "new". */
export function changeSummary(names: ReviewNames, c: Change): string {
  if (c.kind === 'create') return partsText(valueParts(names, c, c.to));
  if (c.kind === 'remove') return partsText(valueParts(names, c, c.from));
  const from = valueParts(names, c, c.from, c.to);
  const to = valueParts(names, c, c.to, c.from);
  // For the position, only the numbers that change.
  const strongFrom = from.filter((p) => p.strong);
  const strongTo = to.filter((p) => p.strong);
  if (strongFrom.length > 0 && strongTo.length === strongFrom.length) {
    return `${strongFrom.map((p) => p.text).join(' · ')} → ${strongTo
      .map((p) => p.text.replace(/^\S+ /, ''))
      .join(' · ')}`;
  }
  return `${partsText(from)} → ${partsText(to)}`;
}

/**
 * Readable summary of a change that the agent withdrew from the proposal. It is no longer in
 * `proposal.changes`, so it is put back into the names only to resolve the type and the target.
 */
export function droppedChangeSummary(names: ReviewNames, c: Change): string {
  const withChange: ReviewNames = {
    ...names,
    proposal: { ...names.proposal, changes: [...names.proposal.changes, c] },
  };
  return joinParts([changeTitle(withChange, c), changeSummary(withChange, c)]);
}

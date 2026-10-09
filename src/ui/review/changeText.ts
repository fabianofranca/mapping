import { t, type TranslationKey } from '../../i18n';
import {
  ENTRIES_FIELD_PREFIX,
  VALUES_FIELD_PREFIX,
  annotationTitle,
  fieldLabel,
  fieldOf,
  findSpecType,
  isRecord,
  projectIndex,
  type Annotation,
  type Change,
  type JsonValue,
  type Project,
  type Proposal,
  type ReviewTarget,
} from '../../model';
import { imageLabel, markingLabel } from '../labels';

// Textos das mudanças na revisão (títulos, valores antes/depois e o resumo de uma
// linha). Só apresentação: o que é cada mudança vem do modelo (`Change`) e os valores,
// da proposta. Os nomes das entidades citadas são procurados no projeto atual, depois no
// "como ficaria" e, por último, no próprio `from`/`to` da mudança.

/** Projeto atual e o "como ficaria", de onde saem os nomes. */
export interface ReviewNames {
  readonly current: Project;
  readonly preview: Project | null;
  readonly proposal: Proposal;
}

/** Um pedaço de valor; `strong` destaca o que muda (ex: o `y` de uma posição). */
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

/** A entidade como registro (na criação o `to`, na remoção o `from`). */
function entityRecord(c: Change): Record<string, JsonValue> | null {
  const value = c.kind === 'remove' ? c.from : c.to;
  return isRecord(value) ? value : null;
}

const text = (v: JsonValue | undefined): string | null =>
  typeof v === 'string' && v !== '' ? v : null;

export function markingName(names: ReviewNames, id: string): string {
  const found = lookup(names, (p) => projectIndex(p).markings.get(id));
  if (found) return markingLabel(found);
  for (const c of names.proposal.changes) {
    if (c.entity === 'marking' && c.entityId === id && c.field === null) {
      const name = text(entityRecord(c)?.name);
      if (name) return name;
    }
  }
  return t('marking.unnamed');
}

export function imageName(names: ReviewNames, id: string): string {
  const found = lookup(names, (p) => projectIndex(p).images.get(id));
  if (found) return imageLabel(found);
  for (const c of names.proposal.changes) {
    if (c.entity === 'image' && c.entityId === id && c.field === null) {
      const record = entityRecord(c);
      const name = text(record?.name) ?? text(record?.file);
      if (name) return name;
    }
  }
  return id;
}

function layerName(names: ReviewNames, id: string): string {
  return lookup(names, (p) => p.layers.find((l) => l.id === id))?.name ?? id;
}

function annotationName(names: ReviewNames, id: string): string {
  const inPreview = names.preview && projectIndex(names.preview).annotations.get(id);
  const inCurrent = projectIndex(names.current).annotations.get(id);
  const found: Annotation | undefined = inPreview || inCurrent || undefined;
  if (found) {
    const project = inPreview ? (names.preview ?? names.current) : names.current;
    return annotationTitle(project, found) ?? t('annotation.unnamed');
  }
  for (const c of names.proposal.changes) {
    if (c.entity === 'annotation' && c.entityId === id && c.field === null) {
      const record = entityRecord(c);
      const name = text(record?.name);
      if (name) return name;
      const type = record?.type;
      if (isRecord(type) && typeof type.typeId === 'string') return type.typeId;
    }
  }
  return t('annotation.unnamed');
}

function specName(names: ReviewNames, c: Change): string {
  const record = isRecord(c.to) ? c.to : isRecord(c.from) ? c.from : null;
  const spec = record && isRecord(record.spec) ? record.spec : null;
  return text(spec?.name) ?? c.entityId;
}

/** Nome de um nível da revisão (proposta, Projeto, imagem ou item). */
export function targetName(names: ReviewNames, target: ReviewTarget): string {
  switch (target.level) {
    case 'proposal':
      return names.proposal.title;
    case 'project':
      return t('review.level.project');
    case 'image':
      return target.id === null ? '' : imageName(names, target.id);
    case 'item':
      return target.id === null ? '' : markingName(names, target.id);
    case 'change': {
      const c =
        target.id === null
          ? undefined
          : names.proposal.changes.find((x) => x.id === target.id);
      return c ? changeTitle(names, c) : '';
    }
  }
}

const FIELD_KEYS: Readonly<Record<string, TranslationKey>> = {
  'marking.name': 'review.field.name',
  'marking.rect': 'review.field.rect',
  'marking.parentId': 'review.field.parent',
  'marking.imageId': 'review.field.image',
  'marking.locked': 'review.field.locked',
  'marking.source': 'review.field.source',
  'image.name': 'review.field.name',
  'image.file': 'review.field.file',
  'image.placement': 'review.field.placement',
  'image.markingColor': 'review.field.markingColor',
  'image.locked': 'review.field.locked',
  'image.source': 'review.field.source',
  'annotation.name': 'review.field.annotationName',
  'annotation.inherit': 'review.field.inherit',
  'annotation.parentAnnotationId': 'review.field.owner',
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
  layer: 'review.entity.layer',
  image: 'review.entity.image',
  marking: 'review.entity.marking',
  annotation: 'review.entity.annotation',
} as const satisfies Record<Change['entity'], TranslationKey>;

/** Nome do campo de uma tipada (o rótulo do campo na especialização, senão a chave). */
function valueFieldLabel(names: ReviewNames, c: Change, key: string): string {
  const project = names.preview ?? names.current;
  const a =
    projectIndex(project).annotations.get(c.entityId) ??
    projectIndex(names.current).annotations.get(c.entityId);
  const type = a?.type ? findSpecType(project, a.type) : null;
  const field = type ? fieldOf(type.type, key) : null;
  return field ? fieldLabel(field) : key;
}

/** Nome do objeto da mudança, para os títulos ("Anotação onClick", "Camada Eventos"). */
function subjectName(names: ReviewNames, c: Change): string | null {
  switch (c.entity) {
    case 'annotation':
      return annotationName(names, c.entityId);
    case 'layer':
      return layerName(names, c.entityId);
    case 'specialization':
      return specName(names, c);
    case 'platformRepo':
      return c.entityId;
    case 'image':
      return imageName(names, c.entityId);
    case 'marking':
      return markingName(names, c.entityId);
  }
}

/** Título de uma mudança ("Posição", "Anotação onClick criada", "estilo"). */
export function changeTitle(names: ReviewNames, c: Change): string {
  const entity = t(ENTITY_KEYS[c.entity]);
  const subject = subjectName(names, c);
  if (c.kind === 'create') {
    return t('review.title.created', { entity, name: subject ?? '' }).trim();
  }
  if (c.kind === 'remove') {
    return t('review.title.removed', { entity, name: subject ?? '' }).trim();
  }
  if (c.field === null) return t('review.title.updated', { entity, name: subject ?? '' });
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
  // Nas anotações, o campo vem com o nome da anotação ("estilo · Button").
  return c.entity === 'annotation' && subject ? `${label} · ${subject}` : label;
}

// ---------------------------------------------------------------------------
// Valores

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

/** Texto compacto de qualquer valor JSON (o que não tem forma própria). */
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

/** Resumo de uma entidade inteira (criação ou remoção). */
function entitySummary(names: ReviewNames, c: Change, value: JsonValue): string {
  if (!isRecord(value)) return compact(value);
  switch (c.entity) {
    case 'marking': {
      const rect = rectParts(value.rect ?? null, undefined);
      const name = text(value.name) ?? t('marking.unnamed');
      return rect ? `${name} · ${rect.map((p) => p.text).join('')}` : name;
    }
    case 'image': {
      const name = text(value.name) ?? text(value.file) ?? '';
      const size =
        typeof value.width === 'number' && typeof value.height === 'number'
          ? t('image.dimensions', { width: value.width, height: value.height })
          : '';
      return [name, size].filter(Boolean).join(' · ');
    }
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
      return text(value.urlTemplate) ?? text(value.localPath) ?? c.entityId;
  }
}

/**
 * Valor de um lado da mudança, em partes (o que muda em destaque). `other`: o valor do
 * outro lado, para destacar só o número da posição que muda.
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
  if (field === 'placement')
    return placementParts(value, other) ?? [{ text: compact(value) }];
  if (value === null) return [{ text: t('review.value.empty') }];
  if (c.entity === 'marking' && field === 'parentId' && typeof value === 'string') {
    return [{ text: markingName(names, value) }];
  }
  if (field === 'markingId' && typeof value === 'string') {
    return [{ text: markingName(names, value) }];
  }
  if (field === 'imageId' && typeof value === 'string') {
    return [{ text: imageName(names, value) }];
  }
  if (field === 'layerId' && typeof value === 'string') {
    return [{ text: layerName(names, value) }];
  }
  if (field === 'parentAnnotationId' && typeof value === 'string') {
    return [{ text: annotationName(names, value) }];
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

const partsText = (parts: readonly ValuePart[]) => parts.map((p) => p.text).join('');

/** Resumo de uma linha da mudança: "y 476 → 532", "primary → secondary", "nova". */
export function changeSummary(names: ReviewNames, c: Change): string {
  if (c.kind === 'create') return partsText(valueParts(names, c, c.to));
  if (c.kind === 'remove') return partsText(valueParts(names, c, c.from));
  const from = valueParts(names, c, c.from, c.to);
  const to = valueParts(names, c, c.to, c.from);
  // Na posição, só os números que mudam.
  const strongFrom = from.filter((p) => p.strong);
  const strongTo = to.filter((p) => p.strong);
  if (strongFrom.length > 0 && strongTo.length === strongFrom.length) {
    return `${strongFrom.map((p) => p.text).join(' · ')} → ${strongTo
      .map((p) => p.text.replace(/^\S+ /, ''))
      .join(' · ')}`;
  }
  return `${partsText(from)} → ${partsText(to)}`;
}

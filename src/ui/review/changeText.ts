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
import { imageLabel, markingLabel } from '../labels';
import { joinParts } from './format';

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

interface EntityLookup {
  /** A primeira mudança de cada entidade (pelo id). */
  readonly firstOf: ReadonlyMap<string, Change>;
  /** A mudança da entidade inteira (criação ou remoção: `field` nulo), pelo id. */
  readonly wholeOf: ReadonlyMap<string, Change>;
}

const lookups = new WeakMap<readonly Change[], EntityLookup>();

/** Índices das mudanças por id de entidade, montados uma vez por lista (sem `find` por linha). */
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

/** A mudança da entidade inteira se for da `entity` dada. */
function wholeChange(names: ReviewNames, entity: Change['entity'], id: string) {
  const c = entityLookup(names).wholeOf.get(id);
  return c?.entity === entity ? c : undefined;
}

/**
 * Nome de uma seta: o `name` dela, senão "Origem → Destino" (as pontas pelos nomes das
 * marcações). `null` se a seta não está no projeto nem em uma criação ou remoção da proposta.
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

/** Nome do item da revisão: a marcação, ou a seta (os ids dividem o espaço, ME4). */
export function markingName(names: ReviewNames, id: string): string {
  // O rótulo usa o projeto em que a marcação foi encontrada (o tipo vem das anotações dele).
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

/** Container sem arquivo criada pela proposta (imagem sem arquivo): o nome padrão dela. */
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
 * Nome do papel do vínculo de uma anotação ("Clique"): pelo tipo do dono dela na prévia e,
 * senão, no projeto atual (o dono pode mudar na mesma proposta); o id se nenhum oferece.
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
 * Nome do tipo ("Button"), com a mesma caixa da lista e de Detalhes: da especialização do
 * projeto, senão da que a própria proposta aplica (importação nova); por último, o id.
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

/** Nome de um nível da revisão (proposta, Projeto, Canvas, imagem ou item). */
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
  'image.name': 'review.field.name',
  'image.file': 'review.field.file',
  'image.background': 'review.field.background',
  'image.size': 'review.field.size',
  'image.placement': 'review.field.placement',
  'image.markingColor': 'review.field.markingColor',
  'image.locked': 'review.field.locked',
  'image.source': 'review.field.source',
  'image.drawingMode': 'review.field.drawingMode',
  'project.drawingMode': 'review.field.drawingMode',
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

/** O tipo de entidade por extenso ("Camada"). */
export function entityLabel(entity: Change['entity']): string {
  return t(ENTITY_KEYS[entity]);
}

/** O tipo da entidade que a proposta cita com esse id (pela primeira mudança nela). */
export function entityKindOf(names: ReviewNames, id: string): Change['entity'] | null {
  return entityLookup(names).firstOf.get(id)?.entity ?? null;
}

/**
 * Nome de uma entidade citada só pelo id (os problemas do conjunto aceito): procurada na
 * prévia e no projeto atual (marcação, imagem, camada, anotação, especialização) e, por
 * último, no registro da criação ou da remoção dela na proposta. `null` se não está em
 * lugar nenhum: o alvo não existe mais.
 */
export function entityName(names: ReviewNames, id: string): string | null {
  for (const p of names.preview ? [names.preview, names.current] : [names.current]) {
    const index = projectIndex(p);
    if (index.markings.has(id)) return markingName(names, id);
    if (index.arrows.has(id)) return arrowName(names, id);
    if (index.containers.has(id)) return imageName(names, id);
    if (index.layers.has(id)) return layerName(names, id);
    if (index.annotations.has(id)) return annotationName(names, id);
    // Sem a cópia em `specs/` (`spec: null`), o nome pode estar na própria proposta.
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

/** Rótulo de um campo de uma entidade (`marking` + `rect` → "Posição"); a chave quando não há rótulo. */
export function entityFieldLabel(entity: Change['entity'], key: string): string {
  const label = FIELD_KEYS[`${entity}.${key}`];
  return label ? t(label) : key;
}

/** Nome do campo de uma tipada (o rótulo do campo na especialização, senão a chave). */
export function valueFieldLabel(names: ReviewNames, c: Change, key: string): string {
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

/** Título de uma mudança ("Posição", "Anotação onClick criada", "estilo"). */
export function changeTitle(names: ReviewNames, c: Change): string {
  const entity = t(ENTITY_KEYS[c.entity]);
  const subject = subjectName(names, c);
  // "Repositório" é masculino em português: "criado", "removido", "atualizado".
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

/** Espaço da marcação: o container (ou Canvas) e o `rect` nele, "Tela Home · X 10 · …". */
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

/** Texto de uma célula ou de um campo `ref`: o rótulo do alvo; senão o valor em texto. */
function cellText(names: ReviewNames, value: JsonValue): string {
  if (typeof value === 'string') return value;
  const ref = parseRefValue(value);
  if (ref) return refLabel(names.preview ?? names.current, ref);
  return JSON.stringify(value);
}

/** As linhas de uma tabela (`values.<campo>` com lista de registros), em texto. */
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

/** Valor de `values.<campo>`: tabela pelas linhas, `ref` pelo rótulo do alvo; senão `null`. */
function typedValueParts(names: ReviewNames, value: JsonValue): ValuePart[] | null {
  const lines = tableLines(names, value);
  if (lines) return [{ text: lines.map((l) => l.text).join('\n') || compact(value) }];
  return parseRefValue(value) ? [{ text: cellText(names, value) }] : null;
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
      return text(value.drawingMode) ?? t('review.value.empty');
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
  if (field === 'space') return spaceParts(names, value);
  if (field === 'placement')
    return placementParts(value, other) ?? [{ text: compact(value) }];
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

/** O texto corrido das partes de um valor. */
export const partsText = (parts: readonly ValuePart[]) =>
  parts.map((p) => p.text).join('');

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

/**
 * Resumo legível de uma mudança que o agente retirou da proposta. Ela já não está em
 * `proposal.changes`, então é posta de volta nos nomes só para resolver o tipo e o alvo.
 */
export function droppedChangeSummary(names: ReviewNames, c: Change): string {
  const withChange: ReviewNames = {
    ...names,
    proposal: { ...names.proposal, changes: [...names.proposal.changes, c] },
  };
  return joinParts([changeTitle(withChange, c), changeSummary(withChange, c)]);
}

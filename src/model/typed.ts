import { requireAnnotationOwner } from './arrows';
import { fail } from './errors';
import { annotationWithLinked } from './links';
import { findById, moveItem, normalizeOptionalName, updateById } from './project';
import { projectIndex } from './projectIndex';
import {
  DEFAULT_LABEL_TEXTS,
  isRecord,
  isRefAccepted,
  parseRefValue,
  refLabel,
  instanceLabel,
  type LabelTexts,
} from './refs';
import {
  isIsoDate,
  typeAppliesTo,
  type SpecAnnotationType,
  type SpecColumn,
  type SpecField,
  type SpecRefAccepts,
  type SpecSimpleColumn,
} from './spec';
import {
  fieldOf,
  findSpecType,
  isAllowedOwner,
  projectLayerFor,
  typeOfAnnotation,
  type ResolvedType,
} from './specLookup';
import type {
  Annotation,
  AnnotationTypeRef,
  Entry,
  JsonValue,
  Layer,
  Project,
  TableRow,
  TypedValues,
} from './types';

// Anotações tipadas: criação com defaults, edição de valores, linhas de tabela,
// vínculos com `allowedChildren`/`requiresOwner` e conversão em anotação livre. Ver
// docs/history/PLAN-etapas-1-2.md 13.2 a 13.5.

/** Campo vazio: `null`, ausente ou texto vazio. */
export function isEmptyValue(value: JsonValue | undefined): boolean {
  return value === undefined || value === null || value === '';
}

export type ValueProblem = 'invalid-value' | 'unknown-option';

/** Confere um valor não vazio contra um campo simples (ou coluna). */
export function checkSimpleValue(
  field: SpecSimpleColumn,
  value: JsonValue,
): ValueProblem | null {
  switch (field.type) {
    case 'string':
      return typeof value === 'string' ? null : 'invalid-value';
    case 'number':
      return typeof value === 'number' && Number.isFinite(value) ? null : 'invalid-value';
    case 'date':
      return typeof value === 'string' && isIsoDate(value) ? null : 'invalid-value';
    case 'enum':
      if (typeof value !== 'string') return 'invalid-value';
      return field.options.includes(value) ? null : 'unknown-option';
  }
}

/** Valor inicial do campo: o `default`, `[]` para `table` e `null` no resto. */
export function defaultFieldValue(field: SpecField): JsonValue {
  if (field.type === 'table') return [];
  if (field.type === 'ref') return null;
  return field.default ?? null;
}

/** Valores iniciais de uma anotação do tipo: todos os campos, na ordem do tipo. */
export function defaultValues(type: SpecAnnotationType): TypedValues {
  return Object.fromEntries(type.fields.map((f) => [f.key, defaultFieldValue(f)]));
}

/** Valor inicial de uma célula: o `default` da coluna; `null` na coluna `ref` e sem default. */
export function defaultColumnValue(column: SpecColumn): JsonValue {
  return column.type === 'ref' ? null : (column.default ?? null);
}

function newRow(columns: readonly SpecColumn[], rowId: string): TableRow {
  return {
    _id: rowId,
    ...Object.fromEntries(columns.map((c) => [c.key, defaultColumnValue(c)])),
  };
}

/** Donos possíveis para uma nova anotação do tipo na marcação (mesma marcação). */
export function validTypedOwners(
  p: Project,
  markingId: string,
  type: AnnotationTypeRef,
): Annotation[] {
  return (projectIndex(p).annotationsByMarking.get(markingId) ?? []).filter((a) =>
    isAllowedOwner(p, type, a),
  );
}

export interface ChildType {
  readonly type: AnnotationTypeRef;
  readonly definition: SpecAnnotationType;
  /** Camada do projeto onde o filho é criado (a do tipo filho). */
  readonly layer: Layer | null;
}

/** Tipos que podem ser vinculados à anotação (botões "+ onClick", "+ onHold"…). */
export function childTypesOf(p: Project, annotationId: string): ChildType[] {
  const owner = findById(p.annotations, annotationId);
  const resolved = typeOfAnnotation(p, owner);
  if (!resolved || !owner.type) return [];
  const specId = owner.type.specId;
  const result: ChildType[] = [];
  for (const typeId of resolved.type.allowedChildren ?? []) {
    const child = findSpecType(p, { specId, typeId });
    if (!child) continue;
    result.push({
      type: { specId, typeId },
      definition: child.type,
      layer: projectLayerFor(p, specId, child.layer.id),
    });
  }
  return result;
}

/** Tipo da anotação tipada; falha se ela for livre ou o tipo não existir mais. */
function requireType(p: Project, a: Annotation): ResolvedType {
  if (!a.type || !a.values) fail('not-typed', a.id);
  return (
    typeOfAnnotation(p, a) ?? fail('unknown-type', `${a.type.specId}/${a.type.typeId}`)
  );
}

export interface NewTypedAnnotationArgs {
  readonly id: string;
  readonly markingId: string;
  readonly layerId: string;
  readonly type: AnnotationTypeRef;
  readonly name?: string | null;
  /** Dono (obrigatório quando o tipo tem `requiresOwner`). */
  readonly parentAnnotationId?: string | null;
}

/** Cria a anotação tipada com os `default` dos campos. */
export function addTypedAnnotation(p: Project, args: NewTypedAnnotationArgs): Project {
  if (p.annotations.some((a) => a.id === args.id)) fail('duplicate-id', args.id);
  requireAnnotationOwner(p, args.markingId);
  const layer = findById(p.layers, args.layerId);
  const resolved =
    findSpecType(p, args.type) ??
    fail('unknown-type', `${args.type.specId}/${args.type.typeId}`);
  if (
    layer.spec?.specId !== args.type.specId ||
    layer.spec.layerId !== resolved.layer.id
  ) {
    fail('type-not-in-layer', args.type.typeId);
  }
  const ownerKind = projectIndex(p).arrows.has(args.markingId) ? 'arrow' : 'marking';
  if (!typeAppliesTo(resolved.type, ownerKind)) {
    fail('type-not-applicable', `${args.type.specId}/${args.type.typeId}`);
  }
  const ownerId = args.parentAnnotationId ?? null;
  if (ownerId === null) {
    if (resolved.type.requiresOwner) fail('owner-required', args.type.typeId);
  } else {
    const owner = findById(p.annotations, ownerId);
    if (owner.markingId !== args.markingId || !isAllowedOwner(p, args.type, owner)) {
      fail('invalid-annotation-parent', ownerId);
    }
  }
  const annotation: Annotation = {
    id: args.id,
    markingId: args.markingId,
    layerId: args.layerId,
    name: normalizeOptionalName(args.name ?? null),
    parentAnnotationId: ownerId,
    type: { specId: args.type.specId, typeId: args.type.typeId },
    values: defaultValues(resolved.type),
    entries: [],
  };
  return { ...p, annotations: [...p.annotations, annotation] };
}

function updateValues(
  p: Project,
  annotationId: string,
  update: (
    values: TypedValues,
    type: SpecAnnotationType,
    a: Annotation,
    resolved: ResolvedType,
  ) => TypedValues,
): Project {
  return {
    ...p,
    annotations: updateById(p.annotations, annotationId, (a) => {
      const resolved = requireType(p, a);
      return { ...a, values: update(a.values ?? {}, resolved.type, a, resolved) };
    }),
  };
}

/** Normaliza (texto vazio → `null`) e valida o valor de um campo simples. */
function checkedSimple(field: SpecSimpleColumn, value: JsonValue): JsonValue {
  if (isEmptyValue(value)) return null;
  const problem = checkSimpleValue(field, value);
  if (problem) fail(problem, field.key);
  return value;
}

/**
 * Valor de uma referência (campo `ref` ou célula de coluna `ref`): `null` limpa; senão precisa
 * ser uma referência existente, que não seja a própria anotação, aceita pelo `accepts`.
 */
function checkedRef(
  p: Project,
  annotationId: string,
  accepts: SpecRefAccepts,
  key: string,
  value: JsonValue,
): JsonValue {
  if (isEmptyValue(value)) return null;
  const ref = parseRefValue(value) ?? fail('invalid-value', key);
  if (ref.annotationId === annotationId) fail('self-ref', key);
  if (!isRefAccepted(p, annotationId, accepts, ref)) fail('ref-not-accepted', key);
  return { ...ref };
}

/**
 * Define o valor de um campo simples ou `ref` (`null` limpa). `table` usa as operações de
 * linha. A referência precisa existir e ser aceita pelo campo. Uma chave que não é campo do
 * tipo falha com `unknown-field`.
 */
export function setFieldValue(
  p: Project,
  annotationId: string,
  key: string,
  value: JsonValue,
): Project {
  return setFieldValues(p, annotationId, { [key]: value });
}

/** Valor já validado de um campo simples ou `ref` do tipo (`table` e chave desconhecida falham). */
function fieldValueOf(
  p: Project,
  type: SpecAnnotationType,
  annotationId: string,
  key: string,
  value: JsonValue,
): JsonValue {
  const field = fieldOf(type, key) ?? fail('unknown-field', key);
  if (field.type === 'table') fail('invalid-value', key);
  return field.type === 'ref'
    ? checkedRef(p, annotationId, field.accepts, key, value)
    : checkedSimple(field, value);
}

/**
 * Define vários campos de uma vez (uma só atualização do projeto, uma entrada no desfazer),
 * com as mesmas regras de `setFieldValue` para cada valor. Se algum falhar, nada é gravado.
 */
export function setFieldValues(
  p: Project,
  annotationId: string,
  values: Readonly<Record<string, JsonValue>>,
): Project {
  return updateValues(p, annotationId, (current, type, a) => {
    const next: Record<string, JsonValue> = { ...current };
    for (const [key, value] of Object.entries(values)) {
      next[key] = fieldValueOf(p, type, a.id, key, value);
    }
    return next;
  });
}

function tableField(type: SpecAnnotationType, key: string) {
  const field = fieldOf(type, key) ?? fail('unknown-field', key);
  if (field.type !== 'table') fail('invalid-value', key);
  return field;
}

/** Itens do valor da tabela (mantém itens inválidos, para não perder dados). */
function rawRows(values: TypedValues, key: string): readonly JsonValue[] {
  const value = values[key];
  return Array.isArray(value) ? value : [];
}

function rowIndex(rows: readonly JsonValue[], rowId: string): number {
  const index = rows.findIndex((r) => isRecord(r) && r._id === rowId);
  if (index < 0) fail('not-found', rowId);
  return index;
}

/** Adiciona uma linha (com os `default` das colunas) no fim da tabela. */
export function addTableRow(
  p: Project,
  annotationId: string,
  key: string,
  rowId: string,
): Project {
  return updateValues(p, annotationId, (values, type) => {
    const field = tableField(type, key);
    const rows = rawRows(values, key);
    if (rows.some((r) => isRecord(r) && r._id === rowId)) fail('duplicate-id', rowId);
    return { ...values, [key]: [...rows, newRow(field.columns, rowId)] };
  });
}

/** Define uma célula da linha `rowId` (`null` limpa). */
export function setTableCell(
  p: Project,
  annotationId: string,
  key: string,
  rowId: string,
  column: string,
  value: JsonValue,
): Project {
  return setTableCells(p, annotationId, key, rowId, { [column]: value });
}

/**
 * Define várias células da linha `rowId` de uma vez (uma só atualização do projeto), com as
 * mesmas regras de `setTableCell` para cada valor. Se alguma falhar, nada é gravado.
 */
export function setTableCells(
  p: Project,
  annotationId: string,
  key: string,
  rowId: string,
  cells: Readonly<Record<string, JsonValue>>,
): Project {
  return updateValues(p, annotationId, (values, type, a) => {
    const field = tableField(type, key);
    const checked: Record<string, JsonValue> = {};
    for (const [column, value] of Object.entries(cells)) {
      const col =
        field.columns.find((c) => c.key === column) ?? fail('unknown-field', column);
      checked[column] =
        col.type === 'ref'
          ? checkedRef(p, a.id, col.accepts, column, value)
          : checkedSimple(col, value);
    }
    const rows = rawRows(values, key);
    const index = rowIndex(rows, rowId);
    const next = rows.map((r, i) =>
      i === index && isRecord(r) ? { ...r, ...checked } : r,
    );
    return { ...values, [key]: next };
  });
}

export function removeTableRow(
  p: Project,
  annotationId: string,
  key: string,
  rowId: string,
): Project {
  return updateValues(p, annotationId, (values, type) => {
    tableField(type, key);
    const rows = rawRows(values, key);
    const index = rowIndex(rows, rowId);
    return { ...values, [key]: rows.filter((_, i) => i !== index) };
  });
}

/** Reordena a linha `rowId` para a posição `toIndex`. */
export function moveTableRow(
  p: Project,
  annotationId: string,
  key: string,
  rowId: string,
  toIndex: number,
): Project {
  return updateValues(p, annotationId, (values, type) => {
    tableField(type, key);
    const rows = rawRows(values, key);
    return { ...values, [key]: moveItem(rows, rowIndex(rows, rowId), toIndex) };
  });
}

// ---------------------------------------------------------------------------
// Conversão em anotação livre

export interface ConvertOptions {
  readonly newId?: () => string;
  readonly texts?: LabelTexts;
}

function valueText(value: JsonValue): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

/**
 * Pares equivalentes aos valores da anotação tipada (docs/history/PLAN-etapas-1-2.md 13.4): na ordem dos
 * campos; `number` e `date` como texto; vazios omitidos; `table` achatada como
 * `parametros[1].nome`; `ref` como `→ User.name`. Chaves fora do tipo vêm no fim.
 */
export function typedValuesToPairs(
  p: Project,
  a: Annotation,
  texts: LabelTexts = DEFAULT_LABEL_TEXTS,
): { key: string; value: string }[] {
  const values = a.values ?? {};
  const type = typeOfAnnotation(p, a)?.type;
  const fields = new Map<string, SpecField>(type?.fields.map((f) => [f.key, f]) ?? []);
  const keys = [
    ...(type?.fields.map((f) => f.key) ?? []),
    ...Object.keys(values).filter((k) => !fields.has(k)),
  ];
  const pairs: { key: string; value: string }[] = [];
  for (const key of keys) {
    const value = values[key];
    if (value === undefined || isEmptyValue(value)) continue;
    const field = fields.get(key);
    const ref = field?.type === 'ref' || !field ? parseRefValue(value) : null;
    if (ref || field?.type === 'ref') {
      pairs.push({ key, value: `→ ${ref ? refLabel(p, ref, texts) : texts.broken}` });
    } else if (Array.isArray(value)) {
      const columns = field?.type === 'table' ? field.columns.map((c) => c.key) : null;
      const refColumns = new Set(
        field?.type === 'table'
          ? field.columns.filter((c) => c.type === 'ref').map((c) => c.key)
          : [],
      );
      value.forEach((row, i) => {
        if (!isRecord(row)) return;
        const cols = columns ?? Object.keys(row).filter((k) => k !== '_id');
        for (const col of cols) {
          const cell = row[col];
          if (cell === undefined || isEmptyValue(cell)) continue;
          // Célula `ref` (ou, sem tipo, no formato de referência): `→ User.name`, como o campo.
          const cellRef =
            refColumns.has(col) || columns === null ? parseRefValue(cell) : null;
          const text = cellRef
            ? `→ ${refLabel(p, cellRef, texts)}`
            : refColumns.has(col)
              ? `→ ${texts.broken}`
              : valueText(cell);
          pairs.push({ key: `${key}[${i + 1}].${col}`, value: text });
        }
      });
    } else {
      pairs.push({ key, value: valueText(value) });
    }
  }
  return pairs;
}

/**
 * Versão livre da anotação tipada: pares a partir dos valores, `name` vazio
 * preenchido com o rótulo da instância ou o nome do tipo; vínculo mantido.
 */
export function freeVersionOf(
  p: Project,
  a: Annotation,
  options: ConvertOptions = {},
): Annotation {
  if (!a.type) return a;
  const newId = options.newId ?? (() => crypto.randomUUID());
  const entries: Entry[] = typedValuesToPairs(p, a, options.texts).map((pair) => ({
    id: newId(),
    ...pair,
  }));
  return {
    ...a,
    name: a.name ?? instanceLabel(p, a) ?? typeOfAnnotation(p, a)?.type.name ?? null,
    type: null,
    values: null,
    entries,
  };
}

/** Converte a anotação tipada em livre (ex.: tipo removido numa atualização). */
export function convertAnnotationToFree(
  p: Project,
  annotationId: string,
  options: ConvertOptions = {},
): Project {
  const a = findById(p.annotations, annotationId);
  if (!a.type) fail('not-typed', annotationId);
  const converted = freeVersionOf(p, a, options);
  return {
    ...p,
    annotations: p.annotations.map((x) => (x.id === annotationId ? converted : x)),
  };
}

/** Ids das anotações tipadas da especialização mais as vinculadas a elas. */
export function annotationsOfSpec(p: Project, specId: string): Set<string> {
  const ids = new Set<string>();
  const layerIds = new Set(
    p.layers.filter((l) => l.spec?.specId === specId).map((l) => l.id),
  );
  for (const a of p.annotations) {
    if (a.type?.specId !== specId && !layerIds.has(a.layerId)) continue;
    for (const id of annotationWithLinked(p, a.id)) ids.add(id);
  }
  return ids;
}

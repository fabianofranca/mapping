import {
  CODE_REF_KEYS,
  codeRefPlatforms,
  isCodeLine,
  isValidCodePath,
  normalizeCodePath,
} from './codeRefs';
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
  type Spec,
  type SpecAnnotationType,
  type SpecColumn,
  type SpecField,
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
  CodeRefEntry,
  Entry,
  JsonValue,
  Layer,
  Project,
  TableRow,
  TypedValues,
} from './types';

// Anotações tipadas: criação com defaults, edição de valores, linhas de tabela,
// entradas de `codeRef`, vínculos com `allowedChildren`/`requiresOwner` e conversão em
// anotação livre. Ver docs/history/PLAN-etapas-1-2.md 13.2 a 13.5 e a etapa 3b do PLAN.md.

/** Campo vazio: `null`, ausente ou texto vazio. */
export function isEmptyValue(value: JsonValue | undefined): boolean {
  return value === undefined || value === null || value === '';
}

export type ValueProblem = 'invalid-value' | 'unknown-option';

/** Confere um valor não vazio contra um campo simples (ou coluna). */
export function checkSimpleValue(
  field: SpecColumn,
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

/** Valor inicial do campo: o `default`, `[]` para `table` e `codeRef` e `null` no resto. */
export function defaultFieldValue(field: SpecField): JsonValue {
  if (field.type === 'table' || field.type === 'codeRef') return [];
  if (field.type === 'ref') return null;
  return field.default ?? null;
}

/** Valores iniciais de uma anotação do tipo: todos os campos, na ordem do tipo. */
export function defaultValues(type: SpecAnnotationType): TypedValues {
  return Object.fromEntries(type.fields.map((f) => [f.key, defaultFieldValue(f)]));
}

function newRow(columns: readonly SpecColumn[], rowId: string): TableRow {
  return {
    _id: rowId,
    ...Object.fromEntries(columns.map((c) => [c.key, c.default ?? null])),
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
  findById(p.markings, args.markingId);
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
    inherit: false,
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
function checkedSimple(field: SpecColumn, value: JsonValue): JsonValue {
  if (isEmptyValue(value)) return null;
  const problem = checkSimpleValue(field, value);
  if (problem) fail(problem, field.key);
  return value;
}

export interface SetFieldValueOptions {
  /** Id das entradas novas de `codeRef` (sem `_id`); padrão: `crypto.randomUUID()`. */
  readonly newId?: () => string;
}

/**
 * Define o valor de um campo simples, `ref` ou `codeRef` (`null` limpa). `table` usa as
 * operações de linha. A referência precisa existir e ser aceita pelo campo. No `codeRef`,
 * o valor é a lista inteira de entradas (ver `checkedCodeRefList`).
 */
export function setFieldValue(
  p: Project,
  annotationId: string,
  key: string,
  value: JsonValue,
  options: SetFieldValueOptions = {},
): Project {
  return updateValues(p, annotationId, (values, type, a, resolved) => {
    const field = fieldOf(type, key) ?? fail('unknown-field', key);
    let next: JsonValue;
    if (field.type === 'table') {
      fail('invalid-value', key);
    } else if (field.type === 'codeRef') {
      const newId = options.newId ?? (() => crypto.randomUUID());
      next = checkedCodeRefList(resolved.spec, field, values[key], value, newId);
    } else if (field.type === 'ref') {
      if (isEmptyValue(value)) {
        next = null;
      } else {
        const ref = parseRefValue(value) ?? fail('invalid-value', key);
        if (ref.annotationId === a.id) fail('self-ref', key);
        if (!isRefAccepted(p, a.id, field.accepts, ref)) fail('ref-not-accepted', key);
        next = { ...ref };
      }
    } else {
      next = checkedSimple(field, value);
    }
    return { ...values, [key]: next };
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
  return updateValues(p, annotationId, (values, type) => {
    const field = tableField(type, key);
    const col =
      field.columns.find((c) => c.key === column) ?? fail('unknown-field', column);
    const cell = checkedSimple(col, value);
    const rows = rawRows(values, key);
    const index = rowIndex(rows, rowId);
    const next = rows.map((r, i) =>
      i === index && isRecord(r) ? { ...r, [column]: cell } : r,
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
// Entradas de `codeRef` (etapa 3b): como as linhas de tabela, cada uma tem um `_id`
// estável e único na lista. As entradas malformadas (editadas à mão) são mantidas, para
// não perder dados: viram pendências.

/** Propriedades de uma entrada de `codeRef` a gravar (ver `CodeRefEntry`). */
export interface CodeRefEntryInput {
  readonly platform: string;
  readonly path?: string | null;
  readonly symbol?: string | null;
  readonly line?: number | null;
}

type CodeRefField = Extract<SpecField, { type: 'codeRef' }>;
type EntryChanges = {
  -readonly [K in keyof Omit<CodeRefEntry, '_id'>]?: CodeRefEntry[K];
};

function codeRefField(type: SpecAnnotationType, key: string): CodeRefField {
  const field = fieldOf(type, key) ?? fail('unknown-field', key);
  if (field.type !== 'codeRef') fail('invalid-value', key);
  return field;
}

/**
 * Valida e normaliza as propriedades informadas: a plataforma precisa ser permitida no
 * campo (`codeRefPlatforms`); o caminho é normalizado (`\` → `/`, sem `./` no começo nem `/`
 * no fim) e precisa ser relativo, sem `.`/`..`; texto vazio vira `null`; a linha é um
 * inteiro ≥ 1. Caminho vazio é permitido (fica pendente, como uma célula obrigatória vazia).
 */
function checkedEntryChanges(
  spec: Spec,
  field: CodeRefField,
  input: Partial<CodeRefEntryInput>,
): EntryChanges {
  const changes: EntryChanges = {};
  if (input.platform !== undefined) {
    if (!codeRefPlatforms(spec, field).includes(input.platform)) {
      fail('platform-not-allowed', input.platform);
    }
    changes.platform = input.platform;
  }
  if (input.path !== undefined) {
    const path = input.path === null ? null : normalizeCodePath(input.path);
    if (path !== null && !isValidCodePath(path)) fail('invalid-path', path);
    changes.path = path;
  }
  if (input.symbol !== undefined) {
    const symbol = input.symbol?.trim() ?? '';
    changes.symbol = symbol === '' ? null : symbol;
  }
  if (input.line !== undefined) {
    if (input.line !== null && !isCodeLine(input.line)) fail('invalid-value', 'line');
    changes.line = input.line;
  }
  return changes;
}

/** Lê as propriedades de uma entrada em JSON (só tipos; as regras ficam em `checkedEntryChanges`). */
function entryInputOf(
  item: { readonly [key: string]: JsonValue },
  key: string,
): Partial<CodeRefEntryInput> {
  const allowed: readonly string[] = CODE_REF_KEYS;
  for (const k of Object.keys(item)) {
    if (!allowed.includes(k)) fail('invalid-value', `${key}: ${k}`);
  }
  const { platform, path, symbol, line } = item;
  const input: { -readonly [K in keyof CodeRefEntryInput]?: CodeRefEntryInput[K] } = {};
  if (platform !== undefined) {
    if (typeof platform !== 'string') fail('invalid-value', `${key}: platform`);
    input.platform = platform;
  }
  if (path !== undefined) {
    if (path !== null && typeof path !== 'string') fail('invalid-value', `${key}: path`);
    input.path = path;
  }
  if (symbol !== undefined) {
    if (symbol !== null && typeof symbol !== 'string') {
      fail('invalid-value', `${key}: symbol`);
    }
    input.symbol = symbol;
  }
  if (line !== undefined) {
    if (line !== null && typeof line !== 'number') fail('invalid-value', `${key}: line`);
    input.line = line;
  }
  return input;
}

function newEntry(id: string, changes: EntryChanges, key: string): CodeRefEntry {
  if (changes.platform === undefined) fail('invalid-value', `${key}: platform`);
  return {
    _id: id,
    platform: changes.platform,
    path: changes.path ?? null,
    symbol: changes.symbol ?? null,
    line: changes.line ?? null,
  };
}

/**
 * Valor completo de um campo `codeRef` a partir de uma lista (o caminho do
 * `setFieldValue`, usado também pelo MCP): vazio limpa (`[]`). Cada item é um objeto
 * só com `_id`, `platform`, `path`, `symbol` e `line`.
 * - sem `_id`: entrada nova, com `newId()` e `platform` obrigatória;
 * - `_id` de uma entrada existente: mantém a identidade, e as propriedades ausentes
 *   ficam como estão (como as linhas de tabela no MCP);
 * - outro `_id`: entrada nova com esse id. Ids repetidos na lista falham.
 */
function checkedCodeRefList(
  spec: Spec,
  field: CodeRefField,
  current: JsonValue | undefined,
  value: JsonValue,
  newId: () => string,
): JsonValue {
  if (isEmptyValue(value)) return [];
  if (!Array.isArray(value)) fail('invalid-value', field.key);
  const existing = new Map<string, { readonly [key: string]: JsonValue }>();
  for (const item of Array.isArray(current) ? current : []) {
    if (isRecord(item) && typeof item._id === 'string') existing.set(item._id, item);
  }
  const seen = new Set<string>();
  return value.map((item: JsonValue): JsonValue => {
    if (!isRecord(item)) fail('invalid-value', field.key);
    const given = item._id;
    if (given !== undefined && (typeof given !== 'string' || given === '')) {
      fail('invalid-value', `${field.key}: _id`);
    }
    const id = given ?? newId();
    if (seen.has(id)) fail('duplicate-id', id);
    seen.add(id);
    const changes = checkedEntryChanges(spec, field, entryInputOf(item, field.key));
    const base = existing.get(id);
    return base ? { ...base, ...changes } : newEntry(id, changes, field.key);
  });
}

/** Adiciona uma entrada no fim da lista. Sem `path`, a entrada fica pendente. */
export function addCodeRefEntry(
  p: Project,
  annotationId: string,
  key: string,
  entryId: string,
  input: CodeRefEntryInput,
): Project {
  return updateValues(p, annotationId, (values, type, _a, resolved) => {
    const field = codeRefField(type, key);
    const entries = rawRows(values, key);
    if (entryId === '') fail('invalid-value', `${key}: _id`);
    if (entries.some((r) => isRecord(r) && r._id === entryId)) {
      fail('duplicate-id', entryId);
    }
    const entry = newEntry(
      entryId,
      checkedEntryChanges(resolved.spec, field, input),
      key,
    );
    return { ...values, [key]: [...entries, entry] };
  });
}

/** Altera as propriedades informadas da entrada `entryId`; as outras ficam como estão. */
export function updateCodeRefEntry(
  p: Project,
  annotationId: string,
  key: string,
  entryId: string,
  changes: Partial<CodeRefEntryInput>,
): Project {
  const a = findById(p.annotations, annotationId);
  const resolved = requireType(p, a);
  const field = codeRefField(resolved.type, key);
  const entries = rawRows(a.values ?? {}, key);
  const index = rowIndex(entries, entryId);
  const checked = checkedEntryChanges(resolved.spec, field, changes);
  const current = entries[index];
  if (
    isRecord(current) &&
    Object.entries(checked).every(
      ([k, v]) => Object.hasOwn(current, k) && current[k] === v,
    )
  ) {
    return p;
  }
  return updateValues(p, annotationId, (values) => ({
    ...values,
    [key]: entries.map((r, i) => (i === index && isRecord(r) ? { ...r, ...checked } : r)),
  }));
}

export function removeCodeRefEntry(
  p: Project,
  annotationId: string,
  key: string,
  entryId: string,
): Project {
  return updateValues(p, annotationId, (values, type) => {
    codeRefField(type, key);
    const entries = rawRows(values, key);
    const index = rowIndex(entries, entryId);
    return { ...values, [key]: entries.filter((_, i) => i !== index) };
  });
}

/** Reordena a entrada `entryId` para a posição `toIndex`. */
export function moveCodeRefEntry(
  p: Project,
  annotationId: string,
  key: string,
  entryId: string,
  toIndex: number,
): Project {
  return updateValues(p, annotationId, (values, type) => {
    codeRefField(type, key);
    const entries = rawRows(values, key);
    return { ...values, [key]: moveItem(entries, rowIndex(entries, entryId), toIndex) };
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
      value.forEach((row, i) => {
        if (!isRecord(row)) return;
        const cols = columns ?? Object.keys(row).filter((k) => k !== '_id');
        for (const col of cols) {
          const cell = row[col];
          if (cell === undefined || isEmptyValue(cell)) continue;
          pairs.push({ key: `${key}[${i + 1}].${col}`, value: valueText(cell) });
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
 * preenchido com o rótulo da instância ou o nome do tipo; vínculo e `inherit` mantidos.
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

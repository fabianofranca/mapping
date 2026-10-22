import { annotationWithLinked } from './links';
import { isRecord, parseRefValue } from './refs';
import type { Spec, SpecColumn, SpecMigrationStep } from './spec';
import { findTypeInSpec } from './specLookup';
import { migrationChain } from './specVersions';
import {
  checkSimpleValue,
  freeVersionOf,
  isEmptyValue,
  type ConvertOptions,
} from './typed';
import type { Annotation, JsonValue, Project, TypedValues } from './types';

// Execução das `migrations` declaradas por uma versão nova da biblioteca (etapa Biblioteca, B4).
// Ver docs/SPEC-FORMAT.md ("Contrato de versão"). Puro e sem APIs de navegador (reutilizado pelo
// MCP): recebe o projeto, a especialização NOVA e a versão que o projeto aplicou, e devolve o
// projeto com as anotações migradas mais um relatório por passo. Quem troca a cópia aplicada, as
// camadas e a versão é `updateSpecialization` (`specializations.ts`); aqui a especialização
// aplicada continua a antiga.
//
// Regras:
// - A cadeia é `migrationChain(next, from)`: as entradas de `migrations` ligadas por `from → to`,
//   e os passos de cada uma na ordem. Cada passo opera sobre o resultado do anterior, e identifica
//   o tipo pelo `typeId` ATUAL da anotação naquele ponto (depois dos renomes anteriores). Cadeia
//   rompida (ou sem `migrations`): nada roda. Só as anotações de `next.id` são tocadas.
// - Passo que não encontra nada é um no-op: continua no relatório, com zeros.
// - Uma chave de campo de passo é `key` (nível superior) ou `tabela.coluna`; numa coluna o passo
//   vale para cada linha da tabela. `rename-field` entre formas diferentes (campo × coluna, ou
//   tabelas diferentes) não tem como mover o valor: os de `from` são apagados (`removed-field`).
// - Perda é valor NÃO vazio que o passo apagou ou sobrescreveu (vazio: `isEmptyValue`, e a tabela
//   sem linhas). `map-values` e `fill-field` preferem a pendência à perda: valor fora das opções
//   fica como está (`unknown-option`); só o que não vale NADA no tipo do campo (`invalid-value`)
//   é trocado pelo `default` de `fill-field`, e isso é perda.
// - `rename-field` de campo de nível superior reescreve as referências (`ref`) do projeto inteiro
//   (de qualquer especialização) que apontam para o campo ou para uma linha da tabela dele, nas
//   anotações do tipo renomeado: o formato do valor é o que identifica uma `ref`, sem depender
//   da especialização (a aplicada ainda é a antiga). `refs` conta as reescritas.
// - `remove-type` com `delete` apaga a anotação e as vinculadas a ela (`annotationWithLinked`),
//   também as de outros tipos e as livres. Cada anotação apagada gera uma perda `removed-type`,
//   com o `typeId` dela (`''` se for livre). `annotations` conta só as do tipo do passo;
//   `deleted`, todas as apagadas. Referências que quebram saem no `countBrokenRefs` do impacto.
// - `remove-type` com `convert` usa `freeVersionOf` no projeto atual (a especialização antiga
//   ainda resolve o tipo; se não resolver, o fallback dele serve). A anotação convertida fica
//   na camada em que estava: se for da especialização, vira a pendência `layer-mismatch`.
// - `rename-type` não troca a camada da anotação (fora do contrato: vira `layer-mismatch`).
// - Imutável; ids intocados; as outras chaves de `values` seguem como estavam.

export type MigrationLossReason =
  /** `remove-field` (ou `rename-field` impossível) apagou um valor não vazio. */
  | 'removed-field'
  /** `remove-type` com `delete`: a anotação foi apagada (as vinculadas também). */
  | 'removed-type'
  /** `fill-field` trocou um valor que não vale mais no tipo do campo. */
  | 'replaced-value'
  /** `rename-field`: o campo destino já tinha um valor não vazio e foi sobrescrito. */
  | 'overwritten-value';

export interface MigrationLoss {
  readonly reason: MigrationLossReason;
  readonly annotationId: string;
  readonly markingId: string;
  /** Tipo da anotação no momento do passo (`''` numa vinculada livre apagada). */
  readonly typeId: string;
  /** Chave do campo, ou `tabela.coluna`. Ausente em `removed-type`. */
  readonly field?: string;
  /** Linha da tabela, quando a perda é numa célula. */
  readonly rowId?: string;
  /** O valor perdido. Ausente em `removed-type`. */
  readonly value?: JsonValue;
}

export interface MigrationStepReport {
  /** A entrada de `migrations` (versões) e a posição do passo nela. */
  readonly from: number;
  readonly to: number;
  readonly index: number;
  readonly step: SpecMigrationStep;
  /** Anotações do tipo do passo que ele alterou, converteu ou apagou. */
  readonly annotations: number;
  /** Valores alterados (cada célula de tabela conta uma vez). */
  readonly values: number;
  /** Anotações convertidas em livres (`remove-type` com `convert`). */
  readonly converted: number;
  /** Anotações apagadas (`remove-type` com `delete`), com as vinculadas. */
  readonly deleted: number;
  /** Referências (`ref`) reescritas por `rename-field`. */
  readonly refs: number;
  readonly losses: readonly MigrationLoss[];
}

export interface MigrationRun {
  /** O projeto com as anotações migradas; a especialização aplicada ainda é a antiga. */
  readonly project: Project;
  readonly steps: readonly MigrationStepReport[];
  /** Todas as perdas, na ordem dos passos. */
  readonly losses: readonly MigrationLoss[];
}

type Counts = Omit<MigrationStepReport, 'from' | 'to' | 'index' | 'step'>;

interface StepResult {
  readonly project: Project;
  readonly counts: Counts;
}

const NO_COUNTS: Counts = {
  annotations: 0,
  values: 0,
  converted: 0,
  deleted: 0,
  refs: 0,
  losses: [],
};

/** Vazio para fins de perda: `isEmptyValue` ou tabela sem linhas. */
function isNothingToLose(value: JsonValue | undefined): boolean {
  return isEmptyValue(value) || (Array.isArray(value) && value.length === 0);
}

function sameJson(a: JsonValue | undefined, b: JsonValue | undefined): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Onde mora o campo de um passo: no nível superior ou numa coluna de tabela. */
type Target =
  | { readonly kind: 'field'; readonly key: string }
  | { readonly kind: 'column'; readonly table: string; readonly column: string };

function parseTarget(ref: string): Target {
  const dot = ref.indexOf('.');
  if (dot < 0) return { kind: 'field', key: ref };
  return { kind: 'column', table: ref.slice(0, dot), column: ref.slice(dot + 1) };
}

/** Texto do campo nas perdas: a `key` ou `tabela.coluna`. */
const targetName = (t: Target): string =>
  t.kind === 'field' ? t.key : `${t.table}.${t.column}`;

/** O que fazer com um valor: nada (`undefined`), trocar ou apagar a chave. */
type Edit = { readonly set: JsonValue } | { readonly drop: true } | undefined;

interface CellsResult {
  readonly values: TypedValues;
  readonly changed: number;
}

/**
 * Aplica `edit` ao valor do campo (nível superior) ou a cada célula da coluna (uma por linha
 * da tabela; linhas sem `_id` texto entram com `rowId` indefinido e itens que não são objeto
 * ficam como estão). `drop` só conta se a chave existia.
 */
function editCells(
  values: TypedValues,
  target: Target,
  edit: (value: JsonValue | undefined, rowId: string | undefined) => Edit,
): CellsResult {
  if (target.kind === 'field') {
    const result = applyEdit(values, target.key, edit(values[target.key], undefined));
    return result ?? { values, changed: 0 };
  }
  const rows = values[target.table];
  if (!Array.isArray(rows)) return { values, changed: 0 };
  let changed = 0;
  const next = rows.map((row): JsonValue => {
    if (!isRecord(row)) return row;
    const rowId = typeof row._id === 'string' ? row._id : undefined;
    const result = applyEdit(row, target.column, edit(row[target.column], rowId));
    if (!result) return row;
    changed += result.changed;
    return result.values;
  });
  return changed === 0
    ? { values, changed }
    : { values: { ...values, [target.table]: next }, changed };
}

function applyEdit(
  record: { readonly [key: string]: JsonValue },
  key: string,
  edit: Edit,
): CellsResult | null {
  if (edit === undefined) return null;
  if ('drop' in edit) {
    if (!(key in record)) return null;
    return {
      values: Object.fromEntries(Object.entries(record).filter(([k]) => k !== key)),
      changed: 1,
    };
  }
  return { values: { ...record, [key]: edit.set }, changed: 1 };
}

/** Anotações de `specId` cujo tipo atual é `typeId` (as que um passo enxerga). */
const isOfType = (a: Annotation, specId: string, typeId: string): boolean =>
  a.type?.specId === specId && a.type.typeId === typeId;

/** Reescreve `a.values` com `change`; anotação sem alteração volta a mesma. */
function withValues(a: Annotation, values: TypedValues): Annotation {
  return values === a.values ? a : { ...a, values };
}

function lossBase(a: Annotation, typeId: string) {
  return { annotationId: a.id, markingId: a.markingId, typeId };
}

// ---------------------------------------------------------------------------
// Passos

function renameType(
  p: Project,
  specId: string,
  step: Extract<SpecMigrationStep, { op: 'rename-type' }>,
): StepResult {
  let annotations = 0;
  const list = p.annotations.map((a) => {
    if (!a.type || !isOfType(a, specId, step.from)) return a;
    annotations++;
    return { ...a, type: { ...a.type, typeId: step.to } };
  });
  return {
    project: annotations === 0 ? p : { ...p, annotations: list },
    counts: { ...NO_COUNTS, annotations },
  };
}

function removeType(
  p: Project,
  specId: string,
  step: Extract<SpecMigrationStep, { op: 'remove-type' }>,
  options: ConvertOptions,
): StepResult {
  const hits = p.annotations.filter((a) => isOfType(a, specId, step.type));
  if (hits.length === 0) return { project: p, counts: NO_COUNTS };
  if (step.mode === 'convert') {
    const ids = new Set(hits.map((a) => a.id));
    return {
      project: {
        ...p,
        annotations: p.annotations.map((a) =>
          ids.has(a.id) ? freeVersionOf(p, a, options) : a,
        ),
      },
      counts: { ...NO_COUNTS, annotations: hits.length, converted: hits.length },
    };
  }
  const doomed = new Set<string>();
  for (const a of hits) for (const id of annotationWithLinked(p, a.id)) doomed.add(id);
  const losses: MigrationLoss[] = [];
  for (const a of p.annotations) {
    if (!doomed.has(a.id)) continue;
    losses.push({ reason: 'removed-type', ...lossBase(a, a.type?.typeId ?? '') });
  }
  return {
    project: { ...p, annotations: p.annotations.filter((a) => !doomed.has(a.id)) },
    counts: {
      ...NO_COUNTS,
      annotations: hits.length,
      deleted: doomed.size,
      losses,
    },
  };
}

/** Reescreve a `key` das referências de campo e de linha que apontam para `ids`. */
function rewriteRefs(
  values: TypedValues,
  ids: ReadonlySet<string>,
  from: string,
  to: string,
): { values: TypedValues; refs: number } {
  let refs = 0;
  let next: { [key: string]: JsonValue } | null = null;
  for (const [key, value] of Object.entries(values)) {
    const ref = parseRefValue(value);
    if (!ref || !('key' in ref) || ref.key !== from || !ids.has(ref.annotationId)) {
      continue;
    }
    next ??= { ...values };
    next[key] = { ...ref, key: to };
    refs++;
  }
  return { values: next ?? values, refs };
}

function renameField(
  p: Project,
  specId: string,
  step: Extract<SpecMigrationStep, { op: 'rename-field' }>,
): StepResult {
  const from = parseTarget(step.from);
  const to = parseTarget(step.to);
  const topLevel = from.kind === 'field' && to.kind === 'field';
  const sameTable =
    from.kind === 'column' && to.kind === 'column' && from.table === to.table;
  // Os ids das anotações do tipo, antes de qualquer reescrita, para achar as referências.
  const ids = new Set(
    topLevel
      ? p.annotations.filter((a) => isOfType(a, specId, step.type)).map((a) => a.id)
      : [],
  );
  const losses: MigrationLoss[] = [];
  let annotations = 0;
  let values = 0;
  let refs = 0;
  const list = p.annotations.map((a) => {
    let current = a;
    if (a.values && isOfType(a, specId, step.type)) {
      const base = lossBase(a, step.type);
      let result: CellsResult;
      if (topLevel || sameTable) {
        // Lê o destino da mesma linha (ou do nível superior) para não perder o que está lá.
        result = renameInPlace(a.values, from, to, (loss) =>
          losses.push({ ...base, ...loss }),
        );
      } else {
        result = editCells(a.values, from, (value, rowId) => {
          if (isNothingToLose(value)) return { drop: true };
          losses.push({
            reason: 'removed-field',
            ...base,
            field: targetName(from),
            ...(rowId !== undefined ? { rowId } : {}),
            value: value as JsonValue,
          });
          return { drop: true };
        });
      }
      if (result.changed > 0) {
        annotations++;
        values += result.changed;
        current = withValues(a, result.values);
      }
    }
    if (topLevel && current.values) {
      const rewritten = rewriteRefs(current.values, ids, step.from, step.to);
      if (rewritten.refs > 0) {
        refs += rewritten.refs;
        current = withValues(current, rewritten.values);
      }
    }
    return current;
  });
  return {
    project: annotations === 0 && refs === 0 ? p : { ...p, annotations: list },
    counts: { ...NO_COUNTS, annotations, values, refs, losses },
  };
}

type LossPart = Pick<MigrationLoss, 'reason' | 'field' | 'rowId' | 'value'>;

/**
 * Renomeia a chave no nível superior ou, na mesma tabela, em cada linha. Valor de `from`
 * vazio não sobrescreve um destino preenchido (o destino fica e `from` sai sem perda);
 * destino preenchido e diferente de um `from` preenchido é sobrescrito, com perda.
 */
function renameInPlace(
  values: TypedValues,
  from: Target,
  to: Target,
  loss: (part: LossPart) => void,
): CellsResult {
  const toKey = to.kind === 'field' ? to.key : to.column;
  const fromKey = from.kind === 'field' ? from.key : from.column;
  const rename = (
    record: { readonly [key: string]: JsonValue },
    rowId: string | undefined,
  ): { [key: string]: JsonValue } | null => {
    if (!(fromKey in record)) return null;
    const { [fromKey]: moved, ...rest } = record;
    const old = rest[toKey];
    if (isNothingToLose(moved) && !isNothingToLose(old)) return rest;
    if (!isNothingToLose(old) && !sameJson(old, moved)) {
      loss({
        reason: 'overwritten-value',
        field: targetName(to),
        ...(rowId !== undefined ? { rowId } : {}),
        value: old as JsonValue,
      });
    }
    return { ...rest, [toKey]: moved as JsonValue };
  };
  if (from.kind === 'field') {
    const next = rename(values, undefined);
    return next ? { values: next, changed: 1 } : { values, changed: 0 };
  }
  const rows = values[from.table];
  if (!Array.isArray(rows)) return { values, changed: 0 };
  let changed = 0;
  const list = rows.map((row): JsonValue => {
    if (!isRecord(row)) return row;
    const next = rename(row, typeof row._id === 'string' ? row._id : undefined);
    if (!next) return row;
    changed++;
    return next;
  });
  return changed === 0
    ? { values, changed }
    : { values: { ...values, [from.table]: list }, changed };
}

function removeField(
  p: Project,
  specId: string,
  step: Extract<SpecMigrationStep, { op: 'remove-field' }>,
): StepResult {
  const target = parseTarget(step.field);
  const losses: MigrationLoss[] = [];
  return mapAnnotations(p, specId, step.type, losses, (a) =>
    editCells(a.values ?? {}, target, (value, rowId) => {
      if (!isNothingToLose(value)) {
        losses.push({
          reason: 'removed-field',
          ...lossBase(a, step.type),
          field: targetName(target),
          ...(rowId !== undefined ? { rowId } : {}),
          value: value as JsonValue,
        });
      }
      return { drop: true };
    }),
  );
}

function mapValues(
  p: Project,
  specId: string,
  step: Extract<SpecMigrationStep, { op: 'map-values' }>,
): StepResult {
  const target = parseTarget(step.field);
  return mapAnnotations(p, specId, step.type, [], (a) =>
    editCells(a.values ?? {}, target, (value) =>
      typeof value === 'string' && Object.hasOwn(step.values, value)
        ? { set: step.values[value] as string }
        : undefined,
    ),
  );
}

/** A coluna ou o campo simples `target` do tipo na versão nova, se existir e for simples. */
function simpleFieldIn(next: Spec, typeId: string, target: Target): SpecColumn | null {
  const type = findTypeInSpec(next, typeId)?.type;
  if (!type) return null;
  if (target.kind === 'field') {
    const field = type.fields.find((f) => f.key === target.key);
    return field && field.type !== 'table' && field.type !== 'ref' ? field : null;
  }
  const table = type.fields.find((f) => f.key === target.table);
  if (table?.type !== 'table') return null;
  return table.columns.find((c) => c.key === target.column) ?? null;
}

function fillField(
  p: Project,
  specId: string,
  next: Spec,
  step: Extract<SpecMigrationStep, { op: 'fill-field' }>,
): StepResult {
  const target = parseTarget(step.field);
  const field = simpleFieldIn(next, step.type, target);
  const losses: MigrationLoss[] = [];
  return mapAnnotations(p, specId, step.type, losses, (a) =>
    editCells(a.values ?? {}, target, (value, rowId) => {
      if (isEmptyValue(value)) return { set: step.default };
      // Só o que não vale nada no tipo do campo é trocado; `unknown-option` fica pendência.
      if (field && checkSimpleValue(field, value as JsonValue) === 'invalid-value') {
        losses.push({
          reason: 'replaced-value',
          ...lossBase(a, step.type),
          field: targetName(target),
          ...(rowId !== undefined ? { rowId } : {}),
          value: value as JsonValue,
        });
        return { set: step.default };
      }
      return undefined;
    }),
  );
}

/** Aplica `change` às anotações com `values` do tipo do passo e soma o que mudou. */
function mapAnnotations(
  p: Project,
  specId: string,
  typeId: string,
  losses: readonly MigrationLoss[],
  change: (a: Annotation) => CellsResult,
): StepResult {
  let annotations = 0;
  let values = 0;
  const list = p.annotations.map((a) => {
    if (!a.values || !isOfType(a, specId, typeId)) return a;
    const result = change(a);
    if (result.changed === 0) return a;
    annotations++;
    values += result.changed;
    return withValues(a, result.values);
  });
  return {
    project: annotations === 0 ? p : { ...p, annotations: list },
    counts: { ...NO_COUNTS, annotations, values, losses },
  };
}

function runStep(
  p: Project,
  next: Spec,
  step: SpecMigrationStep,
  options: ConvertOptions,
): StepResult {
  switch (step.op) {
    case 'rename-type':
      return renameType(p, next.id, step);
    case 'remove-type':
      return removeType(p, next.id, step, options);
    case 'rename-field':
      return renameField(p, next.id, step);
    case 'remove-field':
      return removeField(p, next.id, step);
    case 'map-values':
      return mapValues(p, next.id, step);
    case 'fill-field':
      return fillField(p, next.id, next, step);
  }
}

/**
 * Executa as migrações declaradas por `next` para um projeto que aplicou a versão `from`:
 * os passos da cadeia `from → next.version`, em ordem. Devolve o projeto migrado e o relatório
 * por passo. Não troca a especialização aplicada nem as camadas (`updateSpecialization`).
 */
export function runLibraryMigrations(
  p: Project,
  next: Spec,
  from: number,
  options: ConvertOptions = {},
): MigrationRun {
  const reports: MigrationStepReport[] = [];
  let project = p;
  for (const migration of migrationChain(next, from) ?? []) {
    migration.steps.forEach((step, index) => {
      const result = runStep(project, next, step, options);
      project = result.project;
      reports.push({
        from: migration.from,
        to: migration.to,
        index,
        step,
        ...result.counts,
      });
    });
  }
  return { project, steps: reports, losses: reports.flatMap((r) => r.losses) };
}

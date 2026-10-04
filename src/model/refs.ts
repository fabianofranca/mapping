import { fail, ModelError } from './errors';
import { memoByProject, projectIndex } from './projectIndex';
import type { SpecField, SpecRefAccepts } from './spec';
import { fieldOf, sharesTag, typeOfAnnotation } from './specLookup';
import type { Annotation, Entry, JsonValue, Project, RefValue, TableRow } from './types';

// Referências fortes (`ref`) entre anotações. Ver docs/history/PLAN-etapas-1-2.md 13.3.

/** Textos usados nos rótulos; a interface passa os traduzidos. */
export interface LabelTexts {
  /** Rótulo de anotação livre sem nome. */
  readonly untitled: string;
  /** Rótulo de referência cujo alvo não existe mais. */
  readonly broken: string;
}

export const DEFAULT_LABEL_TEXTS: LabelTexts = {
  untitled: 'Anotação',
  broken: '(referência quebrada)',
};

export function isRecord(value: unknown): value is { readonly [key: string]: JsonValue } {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Linhas válidas (objetos com `_id` texto) de um valor de `table`. */
export function tableRows(value: JsonValue | undefined): TableRow[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (row): row is TableRow => isRecord(row) && typeof row._id === 'string',
  );
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value !== '';
}

/** Interpreta um valor como referência; `null` se não tiver um dos três formatos. */
export function parseRef(value: JsonValue | undefined): RefValue | null {
  if (!isRecord(value) || !nonEmptyString(value.annotationId)) return null;
  const keys = Object.keys(value).sort().join(',');
  const { annotationId } = value;
  if (keys === 'annotationId,entryId' && nonEmptyString(value.entryId)) {
    return { annotationId, entryId: value.entryId };
  }
  if (keys === 'annotationId,key,rowId' && nonEmptyString(value.key)) {
    if (nonEmptyString(value.rowId)) {
      return { annotationId, key: value.key, rowId: value.rowId };
    }
  }
  if (keys === 'annotationId,key' && nonEmptyString(value.key)) {
    return { annotationId, key: value.key };
  }
  return null;
}

export type ResolvedRef =
  | { readonly kind: 'entry'; readonly annotation: Annotation; readonly entry: Entry }
  | {
      readonly kind: 'row';
      readonly annotation: Annotation;
      readonly key: string;
      readonly row: TableRow;
      readonly index: number;
      /** Campo `table` no tipo; `null` se o tipo não existe mais. */
      readonly field: SpecField | null;
    }
  | {
      readonly kind: 'field';
      readonly annotation: Annotation;
      readonly key: string;
      readonly field: SpecField | null;
    };

/**
 * Encontra o alvo da referência; `null` = referência quebrada. A resolução segue
 * os dados (o alvo existe?); se o alvo ainda é aceito é outra pergunta (`isRefAccepted`).
 */
export function resolveRef(p: Project, ref: RefValue): ResolvedRef | null {
  const index = projectIndex(p);
  const annotation = index.annotations.get(ref.annotationId);
  if (!annotation) return null;
  if ('entryId' in ref) {
    const entry = index.entries.get(annotation.id)?.get(ref.entryId);
    return entry && annotation.type === null
      ? { kind: 'entry', annotation, entry }
      : null;
  }
  if (!annotation.values) return null;
  const type = typeOfAnnotation(p, annotation)?.type ?? null;
  const field = type ? fieldOf(type, ref.key) : null;
  if (type && !field) return null;
  if ('rowId' in ref) {
    if (field && field.type !== 'table') return null;
    const rows = tableRows(annotation.values[ref.key]);
    const index = rows.findIndex((r) => r._id === ref.rowId);
    const row = rows[index];
    return row ? { kind: 'row', annotation, key: ref.key, row, index, field } : null;
  }
  if (!field && !(ref.key in annotation.values)) return null;
  return { kind: 'field', annotation, key: ref.key, field };
}

/** Rótulo da instância: `name`; se vazio, o valor do `labelField` do tipo. */
export function instanceLabel(p: Project, a: Annotation): string | null {
  if (a.name) return a.name;
  const labelField = typeOfAnnotation(p, a)?.type.labelField;
  const value = labelField ? a.values?.[labelField] : null;
  return nonEmptyString(value) ? value : null;
}

/**
 * Rótulo da anotação no texto das referências: `name`; senão o `labelField`;
 * senão o nome do tipo; numa anotação livre sem nome, `texts.untitled`.
 */
export function annotationRefLabel(
  p: Project,
  a: Annotation,
  texts: LabelTexts = DEFAULT_LABEL_TEXTS,
): string {
  return instanceLabel(p, a) ?? typeOfAnnotation(p, a)?.type.name ?? texts.untitled;
}

/** Texto do alvo, ex.: `User.name`, `Contato.email`, `Contato.nome`. */
export function refLabel(
  p: Project,
  ref: RefValue,
  texts: LabelTexts = DEFAULT_LABEL_TEXTS,
): string {
  const target = resolveRef(p, ref);
  if (!target) return texts.broken;
  const owner = annotationRefLabel(p, target.annotation, texts);
  switch (target.kind) {
    case 'entry':
      return `${owner}.${target.entry.key}`;
    case 'row': {
      const rowLabel = target.field?.type === 'table' ? target.field.rowLabel : undefined;
      const value = rowLabel ? target.row[rowLabel] : null;
      // Linha sem rótulo: posição (1, 2…) na tabela.
      return `${owner}.${nonEmptyString(value) ? value : `#${target.index + 1}`}`;
    }
    case 'field':
      return `${owner}.${target.field?.label ?? target.key}`;
  }
}

const SIMPLE_TYPES: ReadonlySet<string> = new Set(['string', 'number', 'date', 'enum']);

/**
 * `true` se o alvo existe e é aceito por `accepts`: tupla livre com `free`, linha
 * de `table` ou campo simples com alguma das etiquetas. Nunca a própria anotação.
 */
export function isRefAccepted(
  p: Project,
  sourceAnnotationId: string,
  accepts: SpecRefAccepts,
  ref: RefValue,
): boolean {
  if (ref.annotationId === sourceAnnotationId) return false;
  const target = resolveRef(p, ref);
  return target !== null && isTargetAccepted(target, accepts);
}

/** `true` se o alvo já resolvido é aceito por `accepts` (ver `isRefAccepted`). */
export function isTargetAccepted(target: ResolvedRef, accepts: SpecRefAccepts): boolean {
  switch (target.kind) {
    case 'entry':
      return accepts.free === true;
    case 'row':
      return target.field?.type === 'table' && sharesTag(target.field.tags, accepts.tags);
    case 'field':
      return (
        target.field !== null &&
        SIMPLE_TYPES.has(target.field.type) &&
        sharesTag(target.field.tags, accepts.tags)
      );
  }
}

/** Campo `ref` do tipo da anotação; `null` se não existir. */
export function refFieldOf(
  p: Project,
  annotationId: string,
  key: string,
): Extract<SpecField, { type: 'ref' }> | null {
  const source =
    projectIndex(p).annotations.get(annotationId) ?? fail('not-found', annotationId);
  const type = typeOfAnnotation(p, source)?.type;
  const field = type ? fieldOf(type, key) : null;
  return field?.type === 'ref' ? field : null;
}

export interface RefTarget {
  readonly ref: RefValue;
  /** Anotação que contém o alvo (para agrupar e mostrar imagem › marcação). */
  readonly annotation: Annotation;
  readonly label: string;
  /**
   * Por que o alvo é aceito: as etiquetas do campo que o campo `ref` aceita (linha de
   * tabela ou campo simples); vazio na tupla livre. Serve ao filtro do seletor.
   */
  readonly tags: readonly string[];
}

/**
 * Alvos aceitos pelo campo `ref` `key` da anotação, na ordem do projeto: em
 * qualquer marcação e imagem, nunca a própria anotação. Vazio se o campo não é `ref`.
 */
export function findRefTargets(
  p: Project,
  sourceAnnotationId: string,
  key: string,
  texts: LabelTexts = DEFAULT_LABEL_TEXTS,
): RefTarget[] {
  const field = refFieldOf(p, sourceAnnotationId, key);
  if (!field) return [];
  const { accepts } = field;
  const targets: RefTarget[] = [];
  const push = (ref: RefValue, annotation: Annotation, tags: readonly string[] = []) =>
    targets.push({ ref, annotation, label: refLabel(p, ref, texts), tags });

  for (const a of p.annotations) {
    if (a.id === sourceAnnotationId) continue;
    if (a.type === null) {
      if (!accepts.free) continue;
      for (const entry of a.entries) push({ annotationId: a.id, entryId: entry.id }, a);
      continue;
    }
    const type = typeOfAnnotation(p, a)?.type;
    if (!type || !a.values) continue;
    for (const f of type.fields) {
      if (!sharesTag(f.tags, accepts.tags)) continue;
      const tags = (f.tags ?? []).filter((tag) => accepts.tags?.includes(tag));
      if (f.type === 'table') {
        for (const row of tableRows(a.values[f.key])) {
          push({ annotationId: a.id, key: f.key, rowId: row._id }, a, tags);
        }
      } else if (SIMPLE_TYPES.has(f.type)) {
        push({ annotationId: a.id, key: f.key }, a, tags);
      }
    }
  }
  return targets;
}

export interface AnnotationRef {
  /** Chave do campo `ref`. */
  readonly key: string;
  readonly ref: RefValue;
}

/**
 * Referências feitas pela anotação: os campos `ref` preenchidos do tipo. Se o tipo
 * não existe mais, qualquer valor no formato de referência conta.
 */
export function refsOf(p: Project, a: Annotation): AnnotationRef[] {
  if (!a.values) return [];
  const values = a.values;
  const type = typeOfAnnotation(p, a)?.type;
  const keys = type
    ? type.fields.filter((f) => f.type === 'ref').map((f) => f.key)
    : Object.keys(values);
  const result: AnnotationRef[] = [];
  for (const key of keys) {
    const ref = parseRef(values[key]);
    if (ref) result.push({ key, ref });
  }
  return result;
}

export interface Backlink extends AnnotationRef {
  /** Anotação que faz a referência. */
  readonly source: Annotation;
}

/**
 * Referências recebidas pela anotação (de qualquer tupla, linha ou campo dela),
 * na ordem do projeto. Para agrupar por alvo, use `ref.entryId`/`ref.rowId`/`ref.key`.
 */
export function getBacklinks(p: Project, annotationId: string): Backlink[] {
  return [...(backlinkIndex(p).get(annotationId) ?? [])];
}

/** Referências recebidas por alvo, montadas uma vez por versão do projeto. */
const backlinkIndex = memoByProject((p) => {
  const result = new Map<string, Backlink[]>();
  for (const source of p.annotations) {
    for (const r of refsOf(p, source)) {
      if (r.ref.annotationId === source.id) continue;
      const list = result.get(r.ref.annotationId);
      if (list) list.push({ ...r, source });
      else result.set(r.ref.annotationId, [{ ...r, source }]);
    }
  }
  return result;
});

/**
 * Quantas referências válidas em `before` ficam quebradas em `after`, contando só
 * as anotações de origem que continuam existindo. Serve para as confirmações de
 * exclusão e remoção ("1 referência vai quebrar").
 */
export function countBrokenRefs(before: Project, after: Project): number {
  const existed = new Set(before.annotations.map((a) => a.id));
  let count = 0;
  for (const source of after.annotations) {
    if (!existed.has(source.id)) continue;
    for (const { ref } of refsOf(after, source)) {
      if (resolveRef(before, ref) && !resolveRef(after, ref)) count++;
    }
  }
  return count;
}

/** Referências que a operação quebraria (0 se ela falhar). */
export function refsBrokenBy(p: Project, op: (p: Project) => Project): number {
  try {
    return countBrokenRefs(p, op(p));
  } catch (e) {
    if (e instanceof ModelError) return 0;
    throw e;
  }
}

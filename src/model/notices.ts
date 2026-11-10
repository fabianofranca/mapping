import { memoByProject, projectIndex, typeKey } from './projectIndex';
import { tableRows } from './refs';
import {
  SPEC_NOTICE_KINDS,
  type SpecAnnotationType,
  type SpecNotice,
  type SpecNoticeKind,
} from './spec';
import { isEmptyValue } from './typed';
import type { Annotation, Project } from './types';

// Avisos da especialização (`formatVersion` 10, etapa #486): `removed`, `deprecated`,
// `diverges` e `pending` num tipo, campo ou coluna de `table`. Só informam: não geram
// pendência (`issues.ts`). Gravidade fixa: removed > deprecated = diverges > pending.
// Puro e sem APIs de navegador (reutilizado pelo servidor MCP).

/** Tipos de aviso na ordem de exibição (da maior gravidade à menor; empate: deprecated antes). */
export const NOTICE_KINDS: readonly SpecNoticeKind[] = SPEC_NOTICE_KINDS;

/** Posição do tipo de aviso na ordem de exibição. */
function displayOrder(kind: SpecNoticeKind): number {
  return NOTICE_KINDS.indexOf(kind);
}

/** Comparador de avisos: ordem de exibição dos tipos (empate: a ordem do arquivo, por ser estável). */
export function compareNotices(a: SpecNotice, b: SpecNotice): number {
  return displayOrder(a.kind) - displayOrder(b.kind);
}

/** Avisos na ordem de exibição; dentro do mesmo tipo, a ordem do arquivo. Não altera a lista. */
export function sortNotices(notices: readonly SpecNotice[]): SpecNotice[] {
  return [...notices].sort(compareNotices);
}

/** Avisos do tipo, depois dos campos e depois das colunas, na ordem do arquivo. */
export function typeNotices(type: SpecAnnotationType): SpecNotice[] {
  const list: SpecNotice[] = [...(type.notices ?? [])];
  const columns: SpecNotice[] = [];
  for (const field of type.fields) {
    list.push(...(field.notices ?? []));
    if (field.type === 'table') {
      for (const column of field.columns) columns.push(...(column.notices ?? []));
    }
  }
  return [...list, ...columns];
}

/**
 * O aviso de maior gravidade do tipo, contando o do tipo e os dos campos e colunas; `null` se
 * não há nenhum. Empate (inclusive `deprecated` e `diverges`): o que vem antes na ordem de
 * exibição e, no mesmo tipo de aviso, o primeiro do arquivo (tipo, campos, colunas).
 */
export function highestNotice(type: SpecAnnotationType): SpecNotice | null {
  return sortNotices(typeNotices(type))[0] ?? null;
}

export type NoticeScope = 'type' | 'field' | 'column';

/** Um aviso da especialização e as anotações do projeto que ele afeta. */
export interface NoticeUsage {
  readonly specId: string;
  readonly layerId: string;
  readonly typeId: string;
  readonly scope: NoticeScope;
  /** Chave do campo (escopo `field`) ou da tabela (escopo `column`). */
  readonly key?: string;
  /** Chave da coluna (escopo `column`). */
  readonly column?: string;
  readonly notice: SpecNotice;
  /** Ids das anotações afetadas, na ordem do projeto; vazio se nenhuma usa o aviso. */
  readonly annotationIds: readonly string[];
}

/** Anotações tipadas de cada tipo, por `typeKey`, na ordem do projeto. */
function annotationsByType(p: Project): Map<string, Annotation[]> {
  const map = new Map<string, Annotation[]>();
  for (const a of p.annotations) {
    if (!a.type || !a.values) continue;
    const key = typeKey(a.type.specId, a.type.typeId);
    const list = map.get(key);
    if (list) list.push(a);
    else map.set(key, [a]);
  }
  return map;
}

function hasValue(a: Annotation, key: string): boolean {
  return !isEmptyValue(a.values?.[key]);
}

function hasColumnValue(a: Annotation, key: string, column: string): boolean {
  return tableRows(a.values?.[key]).some((row) => !isEmptyValue(row[column]));
}

function ids(list: readonly Annotation[], keep: (a: Annotation) => boolean): string[] {
  return list.filter(keep).map((a) => a.id);
}

interface TypeContext {
  readonly specId: string;
  readonly layerId: string;
  readonly type: SpecAnnotationType;
  readonly annotations: readonly Annotation[];
}

/** Um aviso do tipo com o lugar onde está: o tipo, um campo (`key`) ou uma coluna de `table`. */
export interface PlacedNotice {
  readonly scope: NoticeScope;
  /** Chave do campo (escopo `field`) ou da tabela (escopo `column`). */
  readonly key?: string;
  /** Chave da coluna (escopo `column`). */
  readonly column?: string;
  readonly notice: SpecNotice;
}

/**
 * Cada aviso do tipo com o lugar, na ordem do `typeNotices`: os do tipo, depois os dos campos
 * e depois os das colunas (dentro de cada grupo, a ordem do arquivo).
 */
export function placedTypeNotices(type: SpecAnnotationType): PlacedNotice[] {
  const own = (type.notices ?? []).map((notice): PlacedNotice => ({
    scope: 'type',
    notice,
  }));
  const fields: PlacedNotice[] = [];
  const columns: PlacedNotice[] = [];
  for (const field of type.fields) {
    for (const notice of field.notices ?? [])
      fields.push({ scope: 'field', key: field.key, notice });
    if (field.type !== 'table') continue;
    for (const column of field.columns)
      for (const notice of column.notices ?? [])
        columns.push({ scope: 'column', key: field.key, column: column.key, notice });
  }
  return [...own, ...fields, ...columns];
}

/** Ids das anotações que o aviso afeta, pelo escopo (ver `noticeUsage`). */
function affected(placed: PlacedNotice, annotations: readonly Annotation[]): string[] {
  const { scope, key, column } = placed;
  if (scope === 'type') return ids(annotations, () => true);
  if (scope === 'field') return ids(annotations, (a) => hasValue(a, key ?? ''));
  return ids(annotations, (a) => hasColumnValue(a, key ?? '', column ?? ''));
}

function typeUsages(ctx: TypeContext): NoticeUsage[] {
  const { specId, layerId, type, annotations } = ctx;
  return placedTypeNotices(type).map((placed): NoticeUsage => ({
    specId,
    layerId,
    typeId: type.id,
    ...placed,
    annotationIds: affected(placed, annotations),
  }));
}

/**
 * Cada aviso das especializações carregadas no projeto, com as anotações que ele afeta, na
 * ordem do arquivo (especialização, camada, tipo; em cada tipo: avisos do tipo, dos campos e
 * das colunas). Aviso do tipo afeta toda anotação do tipo; o do campo, a anotação com valor não
 * vazio nele; o da coluna, a anotação com valor não vazio nela em alguma linha da tabela.
 * Anotação livre e de outro tipo ficam fora. Avisos que nenhuma anotação usa vêm com lista
 * vazia (quem mostra filtra). Memoizada pela versão do projeto.
 */
export const noticeUsage: (p: Project) => readonly NoticeUsage[] = memoByProject((p) => {
  const byType = annotationsByType(p);
  const out: NoticeUsage[] = [];
  for (const { id: specId, spec } of projectIndex(p).specializations.values()) {
    if (!spec) continue;
    for (const layer of spec.layers) {
      for (const type of layer.annotationTypes) {
        const annotations = byType.get(typeKey(specId, type.id)) ?? [];
        out.push(...typeUsages({ specId, layerId: layer.id, type, annotations }));
      }
    }
  }
  return out;
});

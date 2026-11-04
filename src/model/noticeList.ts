import { noticeUsage, NOTICE_KINDS, type NoticeUsage } from './notices';
import { memoByProject, projectIndex } from './projectIndex';
import { VALUES_FIELD_PREFIX, type Change } from './proposal';
import { tableRows } from './refs';
import type { SpecNoticeKind } from './spec';
import { isEmptyValue } from './typed';
import type { Annotation, Arrow, JsonValue, Layer, Marking, Project } from './types';

// Lista da janela Avisos (etapa #486, AV3): cada aviso da especialização com as anotações do
// projeto que ele afeta, e as contagens da aba e da barra de status. Puro e sem APIs de
// navegador; a derivação reativa fica em `store/derived.ts`.

/** Onde a anotação está: a marcação (ou a de origem da seta), o caminho até ela e a camada. */
interface Place {
  readonly annotation: Annotation;
  readonly marking: Marking;
  readonly path: readonly Marking[];
  readonly layer: Layer;
  readonly arrow?: Arrow;
  /** Posição na ordem da janela (imagens, marcações em profundidade, anotações). */
  readonly order: number;
}

/** Lugar de cada anotação (por id), na ordem de Incompletas: o canvas, depois cada imagem. */
const annotationPlaces: (p: Project) => ReadonlyMap<string, Place> = memoByProject(
  (p) => {
    const index = projectIndex(p);
    const places = new Map<string, Place>();
    const add = (
      annotation: Annotation,
      marking: Marking,
      path: readonly Marking[],
      arrow?: Arrow,
    ) => {
      const layer = index.layers.get(annotation.layerId);
      if (!layer) return;
      places.set(annotation.id, {
        annotation,
        marking,
        path,
        layer,
        arrow,
        order: places.size,
      });
    };
    const visit = (marking: Marking, parents: readonly Marking[]) => {
      const path = [...parents, marking];
      for (const a of index.annotationsByMarking.get(marking.id) ?? [])
        add(a, marking, path);
      for (const arrow of index.arrowsByMarking.get(marking.id) ?? []) {
        if (arrow.from !== marking.id) continue;
        for (const a of index.annotationsByMarking.get(arrow.id) ?? [])
          add(a, marking, path, arrow);
      }
      for (const child of index.children.get(marking.id) ?? []) visit(child, path);
    };
    for (const image of [null, ...p.containers]) {
      for (const root of index.children.get(null) ?? []) {
        if (root.containerId === (image?.id ?? null)) visit(root, []);
      }
    }
    return places;
  },
);

/** Os avisos que afetam cada anotação do projeto (só as que têm algum), na ordem do arquivo. */
export const noticesByAnnotation: (
  p: Project,
) => ReadonlyMap<string, readonly NoticeUsage[]> = memoByProject((p) => {
  const map = new Map<string, NoticeUsage[]>();
  for (const usage of noticeUsage(p)) {
    for (const id of usage.annotationIds) {
      const list = map.get(id);
      if (list) list.push(usage);
      else map.set(id, [usage]);
    }
  }
  return map;
});

/** Os avisos que afetam a anotação (vazio se nenhum). */
export function annotationNotices(
  p: Project,
  annotationId: string,
): readonly NoticeUsage[] {
  return noticesByAnnotation(p).get(annotationId) ?? [];
}

/** Uma anotação afetada por um aviso, com o contexto para achá-la e o valor no campo. */
export interface NoticeRow {
  readonly annotation: Annotation;
  /** A marcação; numa anotação de seta, a marcação de origem dela. */
  readonly marking: Marking;
  /** Da marcação raiz até ela mesma (o último item é `marking`). */
  readonly path: readonly Marking[];
  readonly layer: Layer;
  readonly arrow?: Arrow;
  /**
   * O valor da anotação onde o aviso incide: o do campo (aviso de campo); as células não vazias
   * da coluna (aviso de coluna); `undefined` no aviso de tipo.
   */
  readonly value: JsonValue | undefined;
}

/** Um aviso (grupo da janela) com as anotações que ele afeta. */
export interface NoticeGroup {
  readonly usage: NoticeUsage;
  /** Quantas anotações o aviso afeta (as linhas que passam pelos filtros). */
  readonly count: number;
  readonly rows: readonly NoticeRow[];
}

export interface NoticeFilters {
  /** Só os avisos deste tipo; sem ele, todos. */
  readonly kind?: SpecNoticeKind | null;
  /** Só o aviso com anotação afetada (padrão `true`); `false` inclui os que nenhuma usa. */
  readonly inUseOnly?: boolean;
  /** Só as anotações destas camadas (as visíveis); sem ele, todas. */
  readonly onlyLayers?: readonly Layer[];
}

function usageValue(usage: NoticeUsage, a: Annotation): JsonValue | undefined {
  if (usage.scope === 'field') return a.values?.[usage.key ?? ''];
  if (usage.scope !== 'column') return undefined;
  const cells = tableRows(a.values?.[usage.key ?? ''])
    .map((row) => row[usage.column ?? ''])
    .filter((cell): cell is JsonValue => cell !== undefined && !isEmptyValue(cell));
  return cells;
}

function rowsOf(
  usage: NoticeUsage,
  places: ReadonlyMap<string, Place>,
  allowed?: Set<string>,
) {
  const rows: { readonly order: number; readonly row: NoticeRow }[] = [];
  for (const id of usage.annotationIds) {
    const place = places.get(id);
    if (!place || (allowed && !allowed.has(place.layer.id))) continue;
    const { annotation, marking, path, layer, arrow, order } = place;
    const value = usageValue(usage, annotation);
    rows.push({ order, row: { annotation, marking, path, layer, arrow, value } });
  }
  return rows.sort((a, b) => a.order - b.order).map(({ row }) => row);
}

/** Prefere a gravidade; dentro do `kind`, a ordem do arquivo (a ordenação é estável). */
function byKind(a: NoticeUsage, b: NoticeUsage): number {
  return NOTICE_KINDS.indexOf(a.notice.kind) - NOTICE_KINDS.indexOf(b.notice.kind);
}

/**
 * Os grupos da janela Avisos: um por aviso, do mais grave ao menos (`removed`, `deprecated`,
 * `diverges`, `pending`) e, no mesmo `kind`, na ordem das especializações, camadas e tipos. As
 * linhas seguem a ordem de Incompletas (imagens, marcações em profundidade).
 */
export function buildNoticeList(p: Project, filters: NoticeFilters): NoticeGroup[] {
  const { kind = null, inUseOnly = true, onlyLayers } = filters;
  const places = annotationPlaces(p);
  const allowed = onlyLayers && new Set(onlyLayers.map((l) => l.id));
  const groups: NoticeGroup[] = [];
  for (const usage of [...noticeUsage(p)].sort(byKind)) {
    if (kind && usage.notice.kind !== kind) continue;
    const rows = rowsOf(usage, places, allowed);
    if (inUseOnly && rows.length === 0) continue;
    groups.push({ usage, count: rows.length, rows });
  }
  return groups;
}

export interface NoticeCounts {
  /** Anotações com algum aviso (não depende do filtro de `kind`). */
  readonly total: number;
  /** Anotações com aviso de cada `kind`. */
  readonly byKind: Readonly<Record<SpecNoticeKind, number>>;
  /** Os `kind` que têm aviso na especialização (com anotação ou não, conforme `inUseOnly`). */
  readonly present: readonly SpecNoticeKind[];
}

/**
 * Contagens de anotações por `kind` e no total, com os mesmos filtros de `buildNoticeList`
 * (o `kind` não conta: os botões do `Segmented` mostram todos).
 */
export function noticeCounts(p: Project, filters: NoticeFilters): NoticeCounts {
  const groups = buildNoticeList(p, { ...filters, kind: null });
  const all = new Set<string>();
  const perKind = new Map<SpecNoticeKind, Set<string>>();
  for (const { usage, rows } of groups) {
    const set = perKind.get(usage.notice.kind) ?? new Set<string>();
    for (const row of rows) {
      set.add(row.annotation.id);
      all.add(row.annotation.id);
    }
    perKind.set(usage.notice.kind, set);
  }
  const count = (k: SpecNoticeKind) => perKind.get(k)?.size ?? 0;
  return {
    total: all.size,
    byKind: {
      removed: count('removed'),
      deprecated: count('deprecated'),
      diverges: count('diverges'),
      pending: count('pending'),
    },
    present: NOTICE_KINDS.filter((k) => perKind.has(k)),
  };
}

/** Quantas anotações do projeto têm algum aviso (aba da janela e barra de status). */
export function noticedCount(p: Project): number {
  return noticesByAnnotation(p).size;
}

/**
 * Os avisos que uma mudança de proposta traz (etapa #486, decisão 10), lidos de `p`, o projeto
 * com a mudança aplicada (a prévia): a criação da anotação (`field` vazio) traz todos os que
 * ela passa a ter; a troca de tipo (`type`), os do tipo; o valor de um campo (`values.<chave>`),
 * os do campo e os das colunas dele. Remoções, outras entidades e outros campos não trazem.
 */
export function changeNotices(
  p: Project,
  change: Pick<Change, 'entity' | 'kind' | 'entityId'>,
  field: string,
): readonly NoticeUsage[] {
  if (change.entity !== 'annotation' || change.kind === 'remove') return [];
  const all = annotationNotices(p, change.entityId);
  if (field === '') return all;
  if (field === 'type') return all.filter((u) => u.scope === 'type');
  if (!field.startsWith(VALUES_FIELD_PREFIX)) return [];
  const key = field.slice(VALUES_FIELD_PREFIX.length);
  return all.filter((u) => u.scope !== 'type' && u.key === key);
}

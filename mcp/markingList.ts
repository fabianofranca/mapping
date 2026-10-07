import {
  matchShortCode,
  projectIndex,
  projectIssues,
  typeOfAnnotation,
  type Annotation,
  type JsonValue,
  type Marking,
  type Project,
  type ProjectImage,
} from '../src/model';
import { ToolError } from './errors';
import type { Refs } from './items';
import { markingRow } from './views';

export interface MarkingFilters {
  /** Imagem: referência, id, nome ou nome do arquivo. */
  readonly image?: string;
  /** Camada: id ou nome. */
  readonly layer?: string;
  /** Tipo de anotação: `typeId`, `specId/typeId` ou o nome do tipo. */
  readonly annotationType?: string;
  /** Só marcações com anotação incompleta (com pendências). */
  readonly incomplete?: boolean;
  /** Texto livre: nome da marcação, nome, chaves e valores das anotações. */
  readonly text?: string;
  readonly limit?: number;
  readonly offset?: number;
}

export const DEFAULT_LIMIT = 100;
export const MAX_LIMIT = 500;

/** Minúsculas e sem acentos: "titulo" acha "Título". */
function fold(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

function collectText(value: JsonValue | undefined, out: string[]): void {
  if (value === undefined || value === null) return;
  if (typeof value === 'string') out.push(value);
  else if (typeof value === 'number' || typeof value === 'boolean')
    out.push(String(value));
  else if (Array.isArray(value)) for (const item of value) collectText(item, out);
  else {
    for (const [key, item] of Object.entries(value)) {
      // `_id` das linhas de tabela é interno; as chaves de referência não dizem nada ao leitor.
      if (key !== '_id') collectText(item, out);
    }
  }
}

function annotationTexts(p: Project, a: Annotation): string[] {
  const out: string[] = [];
  if (a.name) out.push(a.name);
  for (const entry of a.entries) out.push(entry.key, entry.value);
  if (a.type) {
    out.push(a.type.typeId);
    const resolved = typeOfAnnotation(p, a);
    if (resolved) out.push(resolved.type.name);
    collectText(a.values ?? undefined, out);
  }
  return out;
}

function findImage(p: Project, query: string): ProjectImage {
  const index = projectIndex(p);
  const direct = index.images.get(query);
  if (direct) return direct;
  const folded = fold(query);
  const byName = p.images.filter(
    (i) =>
      (i.name !== null && fold(i.name) === folded) ||
      fold(i.file) === folded ||
      fold(i.file.split('/').pop() ?? '') === folded,
  );
  if (byName.length === 1) return byName[0]!;
  const coded = matchShortCode(p, 'i', query.replace(/^i\//, ''));
  if (coded.length === 1) return index.images.get(coded[0]!.id)!;
  throw new ToolError(
    byName.length > 1 || coded.length > 1 ? 'ambiguous-image' : 'not-found',
    `imagem não encontrada ou ambígua: ${query}`,
    { images: p.images.map((i) => i.name ?? i.file) },
  );
}

function matchesType(p: Project, a: Annotation, query: string): boolean {
  if (!a.type) return false;
  const wanted = fold(query);
  const resolved = typeOfAnnotation(p, a);
  return (
    fold(a.type.typeId) === wanted ||
    fold(`${a.type.specId}/${a.type.typeId}`) === wanted ||
    (resolved !== null && fold(resolved.type.name) === wanted)
  );
}

/** Marcações em profundidade (o pai antes das filhas), imagem por imagem. */
function inDisplayOrder(p: Project, only: ProjectImage | null): Marking[] {
  const children = projectIndex(p).children;
  const result: Marking[] = [];
  const visit = (marking: Marking) => {
    result.push(marking);
    for (const child of children.get(marking.id) ?? []) visit(child);
  };
  const images = only ? [only] : p.images;
  for (const image of images) {
    for (const root of children.get(null) ?? []) {
      if (root.imageId === image.id) visit(root);
    }
  }
  return result;
}

export function listMarkings(
  refs: Refs,
  filters: MarkingFilters,
): Record<string, unknown> {
  const p = refs.project;
  const index = projectIndex(p);
  const issues = projectIssues(p);

  const image = filters.image !== undefined ? findImage(p, filters.image) : null;
  let layerId: string | null = null;
  if (filters.layer !== undefined) {
    const wanted = fold(filters.layer);
    const layer = p.layers.find(
      (l) =>
        l.id === filters.layer || fold(l.name) === wanted || l.spec?.layerId === wanted,
    );
    if (!layer) {
      throw new ToolError('not-found', `camada não encontrada: ${filters.layer}`, {
        layers: p.layers.map((l) => ({ id: l.id, name: l.name })),
      });
    }
    layerId = layer.id;
  }
  const text = filters.text !== undefined ? fold(filters.text.trim()) : '';
  const byAnnotation =
    layerId !== null ||
    filters.annotationType !== undefined ||
    filters.incomplete === true;

  const matching = inDisplayOrder(p, image).filter((marking) => {
    let candidates = index.annotationsByMarking.get(marking.id) ?? [];
    if (byAnnotation) {
      candidates = candidates.filter(
        (a) =>
          (layerId === null || a.layerId === layerId) &&
          (filters.annotationType === undefined ||
            matchesType(p, a, filters.annotationType)) &&
          (filters.incomplete !== true || issues.has(a.id)),
      );
      if (candidates.length === 0) return false;
    }
    if (text === '') return true;
    if (fold(marking.name ?? '').includes(text)) return true;
    return candidates.some((a) =>
      annotationTexts(p, a).some((value) => fold(value).includes(text)),
    );
  });

  const limit = Math.min(
    Math.max(Math.trunc(filters.limit ?? DEFAULT_LIMIT), 1),
    MAX_LIMIT,
  );
  const offset = Math.max(Math.trunc(filters.offset ?? 0), 0);
  const page = matching.slice(offset, offset + limit);
  return {
    project: refs.projectName,
    total: matching.length,
    offset,
    returned: page.length,
    ...(offset + page.length < matching.length
      ? { truncated: true, nextOffset: offset + page.length }
      : {}),
    markings: page.map((m) => markingRow(refs, m)),
  };
}

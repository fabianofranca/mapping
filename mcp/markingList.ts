import {
  matchShortCode,
  parseRef,
  projectIndex,
  projectIssues,
  typeOfAnnotation,
  type Annotation,
  type JsonValue,
  type Marking,
  type Project,
  type ProjectContainer,
} from '../src/model';
import { ToolError } from './errors';
import { CONTAINER_LABEL, type Refs } from './items';
import { markingRow } from './views';

export interface MarkingFilters {
  /** Container: reference, id, name or file name. */
  readonly container?: string;
  /** Old: use `container` (accepted with a warning). */
  readonly image?: string;
  /** Only canvas markings (no container); does not combine with `container`. */
  readonly canvas?: boolean;
  /** Only floating ones (`true`) or only non-floating ones (`false`). */
  readonly floating?: boolean;
  /** Layer: id or name. */
  readonly layer?: string;
  /** Annotation type: `typeId`, `specId/typeId` or the type's name. */
  readonly annotationType?: string;
  /** Only markings with an incomplete annotation (with pending items). */
  readonly incomplete?: boolean;
  /** Free text: marking name, and the names, keys and values of the annotations. */
  readonly text?: string;
  readonly limit?: number;
  readonly offset?: number;
}

export const DEFAULT_LIMIT = 100;
export const MAX_LIMIT = 500;

/** Lowercase and without accents: "titulo" finds "Título". */
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
      // `_id` of table rows is internal; reference keys tell the reader nothing.
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

/** Containers whose name or file is `query` (ignoring accents and case). */
export function containersNamed(p: Project, query: string): ProjectContainer[] {
  const folded = fold(query);
  return p.containers.filter(
    (i) =>
      (i.name !== null && fold(i.name) === folded) ||
      (i.file !== null &&
        (fold(i.file) === folded || fold(i.file.split('/').pop() ?? '') === folded)),
  );
}

/** Short code or full reference (`mapping://project/i/code`); one from another project does not match. */
function matchContainerCode(refs: Refs, query: string) {
  const parsed = parseRef(query);
  if (parsed?.kind !== 'i')
    return matchShortCode(refs.project, 'i', query.replace(/^i\//, ''));
  if (parsed.project !== null && fold(parsed.project) !== fold(refs.projectName))
    return [];
  return matchShortCode(refs.project, 'i', parsed.code);
}

function findContainer(refs: Refs, query: string): ProjectContainer {
  const p = refs.project;
  const index = projectIndex(p);
  const direct = index.containers.get(query);
  if (direct) return direct;
  const byName = containersNamed(p, query);
  if (byName.length === 1) return byName[0]!;
  const coded = matchContainerCode(refs, query);
  if (coded.length === 1) return index.containers.get(coded[0]!.id)!;
  throw new ToolError(
    byName.length > 1 || coded.length > 1 ? 'ambiguous-image' : 'not-found',
    `container not found or ambiguous: ${query}`,
    { containers: p.containers.map((i) => i.name ?? i.file ?? CONTAINER_LABEL) },
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

/** Markings depth-first (the parent before its children), container by container. */
function inDisplayOrder(
  p: Project,
  only: ProjectContainer | null,
  canvas: boolean,
): Marking[] {
  const children = projectIndex(p).children;
  const result: Marking[] = [];
  const visit = (marking: Marking) => {
    result.push(marking);
    for (const child of children.get(marking.id) ?? []) visit(child);
  };
  if (canvas) {
    for (const root of projectIndex(p).canvasRoots) visit(root);
    return result;
  }
  const containers = only ? [only] : p.containers;
  for (const container of containers) {
    for (const root of children.get(null) ?? []) {
      if (root.containerId === container.id) visit(root);
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

  if (filters.container !== undefined && filters.image !== undefined) {
    throw new ToolError(
      'invalid-arguments',
      'provide `container` (the old `image` is also accepted), not both',
    );
  }
  const containerQuery = filters.container ?? filters.image;
  if (filters.canvas === true && containerQuery !== undefined) {
    throw new ToolError(
      'invalid-arguments',
      '`canvas` does not combine with `container` (nor with the old `image`): choose one of the two',
    );
  }
  const container =
    containerQuery !== undefined ? findContainer(refs, containerQuery) : null;
  let layerId: string | null = null;
  if (filters.layer !== undefined) {
    const wanted = fold(filters.layer);
    const layer = p.layers.find(
      (l) =>
        l.id === filters.layer || fold(l.name) === wanted || l.spec?.layerId === wanted,
    );
    if (!layer) {
      throw new ToolError('not-found', `layer not found: ${filters.layer}`, {
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

  // Floating ones live on the canvas: asking only for floating ones, with no container, looks at the canvas.
  const canvasSpace =
    filters.canvas === true || (filters.floating === true && container === null);
  const matching = inDisplayOrder(p, container, canvasSpace).filter((marking) => {
    if (filters.floating !== undefined && marking.floating !== filters.floating) {
      return false;
    }
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
    ...(filters.image !== undefined
      ? {
          warnings: [
            {
              code: 'deprecated-argument',
              message: 'the `image` filter of list_markings is old: use `container`',
            },
          ],
        }
      : {}),
  };
}

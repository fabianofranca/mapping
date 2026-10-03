import {
  MIN_MARKING_SIZE,
  containsRect,
  imageCanvasRect,
  imagePixelRect,
  isIntegerRect,
  rectsOverlap,
} from './geometry';
import { tableRows } from './refs';
import type { Entry, Project } from './types';

export type InvariantCode =
  | 'duplicate-id'
  | 'duplicate-file'
  | 'images-overlap'
  | 'missing-image'
  | 'missing-parent'
  | 'missing-marking'
  | 'missing-layer'
  | 'rect-not-integer'
  | 'rect-too-small'
  | 'rect-out-of-image'
  | 'parent-other-image'
  | 'rect-outside-parent'
  | 'hierarchy-cycle'
  | 'missing-parent-annotation'
  | 'annotation-parent-other-marking'
  | 'annotation-parent-same-layer'
  | 'annotation-cycle'
  | 'empty-key'
  | 'duplicate-key'
  | 'duplicate-spec-file'
  | 'duplicate-entry-id'
  | 'duplicate-row-id';

export interface InvariantIssue {
  readonly code: InvariantCode;
  /** Id do item com problema. */
  readonly id: string;
  /** Id do outro item envolvido, quando houver (ex.: a imagem sobreposta). */
  readonly otherId?: string;
}

export type EntryIssue = 'empty-key' | 'duplicate-key' | null;

/** Erro de cada par, na mesma ordem de `entries`. Usado também pelo editor (erro inline). */
export function validateEntries<T extends Pick<Entry, 'key'>>(
  entries: readonly T[],
): EntryIssue[] {
  const seen = new Set<string>();
  return entries.map(({ key }) => {
    const trimmed = key.trim();
    if (trimmed === '') return 'empty-key';
    if (seen.has(trimmed)) return 'duplicate-key';
    seen.add(trimmed);
    return null;
  });
}

/**
 * Checa os invariantes que o schema zod não expressa. Lista vazia = projeto válido.
 * Ver "Regras do modelo" no docs/history/PLAN-etapas-1-2.md. As regras das especializações (camada × tipo,
 * `allowedChildren`, referências) não bloqueiam a abertura: viram pendências
 * (`getAnnotationIssues`). Só a unicidade dos ids de tupla e de linha fica aqui.
 */
export function validateProject(p: Project): InvariantIssue[] {
  const issues: InvariantIssue[] = [];
  const push = (code: InvariantCode, id: string, otherId?: string) =>
    issues.push(otherId === undefined ? { code, id } : { code, id, otherId });

  for (const list of [p.specializations, p.layers, p.images, p.markings, p.annotations]) {
    const ids = new Set<string>();
    for (const item of list) {
      if (ids.has(item.id)) push('duplicate-id', item.id);
      ids.add(item.id);
    }
  }

  const specFiles = new Set<string>();
  for (const s of p.specializations) {
    if (specFiles.has(s.file)) push('duplicate-spec-file', s.id);
    specFiles.add(s.file);
  }

  const entryIds = new Set<string>();
  for (const a of p.annotations) {
    for (const e of a.entries) {
      if (entryIds.has(e.id)) push('duplicate-entry-id', a.id, e.id);
      entryIds.add(e.id);
    }
    for (const value of Object.values(a.values ?? {})) {
      const rowIds = new Set<string>();
      for (const row of tableRows(value)) {
        if (rowIds.has(row._id)) push('duplicate-row-id', a.id, row._id);
        rowIds.add(row._id);
      }
    }
  }

  const files = new Set<string>();
  p.images.forEach((image, i) => {
    if (files.has(image.file)) push('duplicate-file', image.id);
    files.add(image.file);
    const rect = imageCanvasRect(image, image.placement);
    for (const other of p.images.slice(i + 1)) {
      if (rectsOverlap(rect, imageCanvasRect(other, other.placement))) {
        push('images-overlap', image.id, other.id);
      }
    }
  });

  const images = new Map(p.images.map((image) => [image.id, image]));
  const markings = new Map(p.markings.map((m) => [m.id, m]));
  const annotations = new Map(p.annotations.map((a) => [a.id, a]));

  for (const m of p.markings) {
    const image = images.get(m.imageId);
    if (!image) push('missing-image', m.id, m.imageId);
    if (!isIntegerRect(m.rect)) push('rect-not-integer', m.id);
    if (m.rect.width < MIN_MARKING_SIZE || m.rect.height < MIN_MARKING_SIZE) {
      push('rect-too-small', m.id);
    }
    if (image && !containsRect(imagePixelRect(image), m.rect)) {
      push('rect-out-of-image', m.id);
    }
    if (m.parentId === null) continue;
    const parent = markings.get(m.parentId);
    if (!parent) {
      push('missing-parent', m.id, m.parentId);
      continue;
    }
    if (parent.imageId !== m.imageId) push('parent-other-image', m.id, parent.id);
    else if (!containsRect(parent.rect, m.rect))
      push('rect-outside-parent', m.id, parent.id);
  }

  for (const m of p.markings) {
    // Sobe a cadeia de pais; se passar de novo por um id já visto, há ciclo.
    const visited = new Set<string>([m.id]);
    let parentId = m.parentId;
    while (parentId !== null) {
      if (visited.has(parentId)) {
        push('hierarchy-cycle', m.id);
        break;
      }
      visited.add(parentId);
      parentId = markings.get(parentId)?.parentId ?? null;
    }
  }

  const layerIds = new Set(p.layers.map((l) => l.id));
  for (const a of p.annotations) {
    if (!markings.has(a.markingId)) push('missing-marking', a.id, a.markingId);
    if (!layerIds.has(a.layerId)) push('missing-layer', a.id, a.layerId);
    for (const issue of validateEntries(a.entries)) {
      if (issue) push(issue, a.id);
    }
    if (a.parentAnnotationId === null) continue;
    const owner = annotations.get(a.parentAnnotationId);
    if (!owner) {
      push('missing-parent-annotation', a.id, a.parentAnnotationId);
      continue;
    }
    if (owner.markingId !== a.markingId) {
      push('annotation-parent-other-marking', a.id, owner.id);
    }
    if (owner.layerId === a.layerId) push('annotation-parent-same-layer', a.id, owner.id);
  }

  for (const a of p.annotations) {
    // Mesma detecção de ciclo usada na hierarquia de marcações.
    const visited = new Set<string>([a.id]);
    let ownerId = a.parentAnnotationId;
    while (ownerId !== null) {
      if (visited.has(ownerId)) {
        push('annotation-cycle', a.id);
        break;
      }
      visited.add(ownerId);
      ownerId = annotations.get(ownerId)?.parentAnnotationId ?? null;
    }
  }

  return issues;
}

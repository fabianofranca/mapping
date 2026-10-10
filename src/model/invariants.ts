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

/** Tipo do item com problema. */
export type InvariantEntity = 'image' | 'marking' | 'annotation' | 'layer' | 'spec';

export interface InvariantIssue {
  readonly code: InvariantCode;
  readonly entity: InvariantEntity;
  /** Id do item com problema. */
  readonly id: string;
  /** Nome do item, quando houver (na imagem sem rótulo, o arquivo). */
  readonly name?: string;
  /** Id do outro item envolvido, quando houver (ex.: a imagem sobreposta). */
  readonly otherId?: string;
}

/** O que `validateProject` lê de cada item para identificar o problema. */
interface Named {
  readonly id: string;
  readonly name?: string | null;
  readonly file?: string;
}

/** Nome para a lista de problemas: o da imagem sem rótulo é o arquivo; especialização não tem. */
function itemName(entity: InvariantEntity, item: Named): string | null {
  if (entity === 'spec') return null;
  if (entity === 'image') return item.name ?? item.file ?? null;
  return item.name ?? null;
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
  // Entidade e nome só são montados quando há problema: o caminho feliz não paga nada.
  const issue =
    (entity: InvariantEntity) => (code: InvariantCode, item: Named, otherId?: string) => {
      const name = itemName(entity, item);
      issues.push({
        code,
        entity,
        id: item.id,
        ...(name === null ? {} : { name }),
        ...(otherId === undefined ? {} : { otherId }),
      });
    };
  const spec = issue('spec');
  const layer = issue('layer');
  const imageIssue = issue('image');
  const marking = issue('marking');
  const annotation = issue('annotation');

  const lists = [
    [p.specializations, spec],
    [p.layers, layer],
    [p.images, imageIssue],
    [p.markings, marking],
    [p.annotations, annotation],
  ] as const;
  for (const [list, push] of lists) {
    const ids = new Set<string>();
    for (const item of list) {
      if (ids.has(item.id)) push('duplicate-id', item);
      ids.add(item.id);
    }
  }

  const specFiles = new Set<string>();
  for (const s of p.specializations) {
    if (specFiles.has(s.file)) spec('duplicate-spec-file', s);
    specFiles.add(s.file);
  }

  const entryIds = new Set<string>();
  for (const a of p.annotations) {
    for (const e of a.entries) {
      if (entryIds.has(e.id)) annotation('duplicate-entry-id', a, e.id);
      entryIds.add(e.id);
    }
    for (const value of Object.values(a.values ?? {})) {
      const rowIds = new Set<string>();
      for (const row of tableRows(value)) {
        if (rowIds.has(row._id)) annotation('duplicate-row-id', a, row._id);
        rowIds.add(row._id);
      }
    }
  }

  const files = new Set<string>();
  p.images.forEach((image, i) => {
    if (files.has(image.file)) imageIssue('duplicate-file', image);
    files.add(image.file);
    const rect = imageCanvasRect(image, image.placement);
    for (const other of p.images.slice(i + 1)) {
      if (rectsOverlap(rect, imageCanvasRect(other, other.placement))) {
        imageIssue('images-overlap', image, other.id);
      }
    }
  });

  const images = new Map(p.images.map((image) => [image.id, image]));
  const markings = new Map(p.markings.map((m) => [m.id, m]));
  const annotations = new Map(p.annotations.map((a) => [a.id, a]));

  for (const m of p.markings) {
    const image = images.get(m.imageId);
    if (!image) marking('missing-image', m, m.imageId);
    if (!isIntegerRect(m.rect)) marking('rect-not-integer', m);
    if (m.rect.width < MIN_MARKING_SIZE || m.rect.height < MIN_MARKING_SIZE) {
      marking('rect-too-small', m);
    }
    if (image && !containsRect(imagePixelRect(image), m.rect)) {
      marking('rect-out-of-image', m);
    }
    if (m.parentId === null) continue;
    const parent = markings.get(m.parentId);
    if (!parent) {
      marking('missing-parent', m, m.parentId);
      continue;
    }
    if (parent.imageId !== m.imageId) marking('parent-other-image', m, parent.id);
    else if (!containsRect(parent.rect, m.rect))
      marking('rect-outside-parent', m, parent.id);
  }

  for (const m of p.markings) {
    // Sobe a cadeia de pais; se passar de novo por um id já visto, há ciclo.
    const visited = new Set<string>([m.id]);
    let parentId = m.parentId;
    while (parentId !== null) {
      if (visited.has(parentId)) {
        marking('hierarchy-cycle', m);
        break;
      }
      visited.add(parentId);
      parentId = markings.get(parentId)?.parentId ?? null;
    }
  }

  const layerIds = new Set(p.layers.map((l) => l.id));
  for (const a of p.annotations) {
    if (!markings.has(a.markingId)) annotation('missing-marking', a, a.markingId);
    if (!layerIds.has(a.layerId)) annotation('missing-layer', a, a.layerId);
    for (const entryIssue of validateEntries(a.entries)) {
      if (entryIssue) annotation(entryIssue, a);
    }
    if (a.parentAnnotationId === null) continue;
    const owner = annotations.get(a.parentAnnotationId);
    if (!owner) {
      annotation('missing-parent-annotation', a, a.parentAnnotationId);
      continue;
    }
    if (owner.markingId !== a.markingId) {
      annotation('annotation-parent-other-marking', a, owner.id);
    }
    if (owner.layerId === a.layerId)
      annotation('annotation-parent-same-layer', a, owner.id);
  }

  for (const a of p.annotations) {
    // Mesma detecção de ciclo usada na hierarquia de marcações.
    const visited = new Set<string>([a.id]);
    let ownerId = a.parentAnnotationId;
    while (ownerId !== null) {
      if (visited.has(ownerId)) {
        annotation('annotation-cycle', a);
        break;
      }
      visited.add(ownerId);
      ownerId = annotations.get(ownerId)?.parentAnnotationId ?? null;
    }
  }

  return issues;
}

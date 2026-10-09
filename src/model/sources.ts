import { fail } from './errors';
import { updateById } from './project';
import type { Spec, SpecAnnotationType, SpecLayer, SpecTypeSource } from './spec';
import type { ExternalSource, Marking, Project, ProjectImage } from './types';

// Identidade externa (etapa 4): `source` em imagens e marcações (schema v8) e `sources`
// nos tipos e campos das especializações (formatVersion 3). O núcleo não interpreta
// `system` nem os nomes: só valida a estrutura e devolve os dados a quem pedir.

/**
 * Normaliza e valida uma origem: `system` e `id` sem espaços nas pontas e não vazios;
 * `url` vazia vira `null`. Lança `invalid-source` se faltar `system` ou `id`.
 */
export function normalizeSource(source: ExternalSource | null): ExternalSource | null {
  if (source === null) return null;
  const system = source.system.trim();
  const id = source.id.trim();
  if (system === '' || id === '') fail('invalid-source');
  const url = source.url?.trim() ?? '';
  return { system, id, url: url === '' ? null : url };
}

/** Define (ou limpa, com `null`) a origem da imagem. Não é geometria: a trava não impede. */
export function setImageSource(
  p: Project,
  imageId: string,
  source: ExternalSource | null,
): Project {
  const normalized = normalizeSource(source);
  return {
    ...p,
    images: updateById(p.images, imageId, (i) => ({ ...i, source: normalized })),
  };
}

/** Define (ou limpa, com `null`) a origem da marcação. Não é geometria: a trava não impede. */
export function setMarkingSource(
  p: Project,
  markingId: string,
  source: ExternalSource | null,
): Project {
  const normalized = normalizeSource(source);
  return {
    ...p,
    markings: updateById(p.markings, markingId, (m) => ({ ...m, source: normalized })),
  };
}

export type SourceMatch =
  | { readonly kind: 'image'; readonly image: ProjectImage }
  | { readonly kind: 'marking'; readonly marking: Marking };

/**
 * Imagens e marcações cuja origem é `system` + `id` (comparação exata), imagens
 * primeiro, na ordem do projeto. Normalmente há no máximo um item, mas o formato não
 * proíbe repetições (ex: a mesma tela importada duas vezes), então a lista é devolvida.
 */
export function findBySource(p: Project, system: string, id: string): SourceMatch[] {
  const same = (s: ExternalSource | null) =>
    s !== null && s.system === system && s.id === id;
  return [
    ...p.images
      .filter((image) => same(image.source))
      .map((image): SourceMatch => ({ kind: 'image', image })),
    ...p.markings
      .filter((marking) => same(marking.source))
      .map((marking): SourceMatch => ({ kind: 'marking', marking })),
  ];
}

/** O que identifica o elemento de origem na busca de tipos: `id`, `name` ou os dois. */
export interface SourceQuery {
  readonly id?: string;
  readonly name?: string;
}

export interface TypeSourceMatch {
  /** Id da especialização (`spec.id`). */
  readonly specId: string;
  readonly layer: SpecLayer;
  readonly type: SpecAnnotationType;
  /** A declaração de `sources` que casou. */
  readonly source: SpecTypeSource;
  /** Casou pelo `id` (mais forte) ou só pelo `name`. */
  readonly by: 'id' | 'name';
}

/**
 * Tipos de anotação que correspondem a um elemento de origem: mesma `system` e o
 * mesmo `id` ou o mesmo `name` (comparações exatas). Os que casam pelo `id` vêm antes
 * dos que casam só pelo `name`; dentro de cada grupo, a ordem das especializações,
 * camadas e tipos. Um tipo aparece uma vez (com a melhor declaração). Sem `id` nem
 * `name` na busca, a lista é vazia.
 */
export function findTypesBySource(
  specs: readonly (Spec | null)[],
  system: string,
  query: SourceQuery,
): TypeSourceMatch[] {
  if (query.id === undefined && query.name === undefined) return [];
  const byId: TypeSourceMatch[] = [];
  const byName: TypeSourceMatch[] = [];
  for (const spec of specs) {
    if (!spec) continue;
    for (const layer of spec.layers) {
      for (const type of layer.annotationTypes) {
        const sources = (type.sources ?? []).filter((s) => s.system === system);
        const idMatch =
          query.id !== undefined ? sources.find((s) => s.id === query.id) : undefined;
        if (idMatch) {
          byId.push({ specId: spec.id, layer, type, source: idMatch, by: 'id' });
          continue;
        }
        const nameMatch =
          query.name !== undefined
            ? sources.find((s) => s.name === query.name)
            : undefined;
        if (nameMatch) {
          byName.push({ specId: spec.id, layer, type, source: nameMatch, by: 'name' });
        }
      }
    }
  }
  return [...byId, ...byName];
}

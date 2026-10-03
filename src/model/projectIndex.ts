import type { Spec, SpecLayer } from './spec';
import type { ResolvedType } from './specLookup';
import type {
  Annotation,
  Entry,
  Layer,
  Marking,
  Project,
  ProjectImage,
  ProjectSpecialization,
} from './types';

// Índice do projeto (docs/history/PLAN-etapa-2-1.md 14.3): mapas por id e agrupamentos montados uma vez
// por versão do projeto. Como o projeto é imutável, a versão é o próprio objeto:
// o `WeakMap` devolve o mesmo índice enquanto ele existir e o libera junto com
// ele. Funciona igual no navegador e no Node.

export interface ProjectIndex {
  readonly layers: ReadonlyMap<string, Layer>;
  readonly images: ReadonlyMap<string, ProjectImage>;
  readonly markings: ReadonlyMap<string, Marking>;
  readonly annotations: ReadonlyMap<string, Annotation>;
  /** Tuplas de cada anotação, por id. */
  readonly entries: ReadonlyMap<string, ReadonlyMap<string, Entry>>;
  /** Filhas diretas de cada marcação (chave `null` = sem pai), na ordem do array. */
  readonly children: ReadonlyMap<string | null, readonly Marking[]>;
  /** Anotações de cada marcação, na ordem do projeto. */
  readonly annotationsByMarking: ReadonlyMap<string, readonly Annotation[]>;
  /** Anotações vinculadas diretamente a cada dona, na ordem do projeto. */
  readonly annotationsByOwner: ReadonlyMap<string, readonly Annotation[]>;
  readonly specializations: ReadonlyMap<string, ProjectSpecialization>;
  /** Tipos das especializações carregadas, por `typeKey(specId, typeId)`. */
  readonly types: ReadonlyMap<string, ResolvedType>;
  /** Camadas das especializações carregadas, por `typeKey(specId, layerId)`. */
  readonly specLayers: ReadonlyMap<string, SpecLayer>;
}

/** Chave composta especialização + id (tipo ou camada) dos mapas do índice. */
export function typeKey(specId: string, id: string): string {
  return `${specId}\u0000${id}`;
}

function push<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

/** Mapa por id; com ids repetidos vale o primeiro, como em `find`. */
function byId<T extends { readonly id: string }>(list: readonly T[]): Map<string, T> {
  const map = new Map<string, T>();
  for (const item of list) if (!map.has(item.id)) map.set(item.id, item);
  return map;
}

function indexSpec(
  specId: string,
  spec: Spec,
  types: Map<string, ResolvedType>,
  specLayers: Map<string, SpecLayer>,
): void {
  for (const layer of spec.layers) {
    // Ids são únicos na especialização; se repetirem, vale o primeiro (como `find`).
    const layerKey = typeKey(specId, layer.id);
    if (!specLayers.has(layerKey)) specLayers.set(layerKey, layer);
    for (const type of layer.annotationTypes) {
      const key = typeKey(specId, type.id);
      if (!types.has(key)) types.set(key, { spec, layer, type });
    }
  }
}

function buildIndex(p: Project): ProjectIndex {
  const entries = new Map<string, ReadonlyMap<string, Entry>>();
  const children = new Map<string | null, Marking[]>();
  const annotationsByMarking = new Map<string, Annotation[]>();
  const annotationsByOwner = new Map<string, Annotation[]>();
  const types = new Map<string, ResolvedType>();
  const specLayers = new Map<string, SpecLayer>();

  for (const m of p.markings) push(children, m.parentId, m);
  for (const a of p.annotations) {
    if (!entries.has(a.id)) entries.set(a.id, byId(a.entries));
    push(annotationsByMarking, a.markingId, a);
    if (a.parentAnnotationId !== null) push(annotationsByOwner, a.parentAnnotationId, a);
  }
  for (const s of p.specializations) {
    // O id da especialização aplicada é o que as camadas e anotações usam.
    if (s.spec) indexSpec(s.id, s.spec, types, specLayers);
  }
  return {
    layers: byId(p.layers),
    images: byId(p.images),
    markings: byId(p.markings),
    annotations: byId(p.annotations),
    entries,
    children,
    annotationsByMarking,
    annotationsByOwner,
    specializations: byId(p.specializations),
    types,
    specLayers,
  };
}

/**
 * Memoiza `fn` por versão do projeto: a mesma versão devolve o mesmo resultado
 * (e o mesmo objeto). Serve para dados derivados que não dependem de mais nada.
 */
export function memoByProject<T>(fn: (p: Project) => T): (p: Project) => T {
  const cache = new WeakMap<Project, T>();
  return (p) => {
    if (cache.has(p)) return cache.get(p) as T;
    const value = fn(p);
    cache.set(p, value);
    return value;
  };
}

/** Índice do projeto, montado na primeira consulta de cada versão. */
export const projectIndex: (p: Project) => ProjectIndex = memoByProject(buildIndex);

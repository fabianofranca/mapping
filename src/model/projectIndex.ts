import type { Spec, SpecLayer } from './spec';
import type { ResolvedType } from './specLookup';
import type {
  Annotation,
  Arrow,
  Entry,
  Layer,
  Marking,
  Perspective,
  Project,
  ProjectContainer,
  ProjectSpecialization,
} from './types';

// Índice do projeto (docs/ARCHITECTURE.md, "Desempenho"): mapas por id e agrupamentos montados uma vez
// por versão do projeto. Como o projeto é imutável, a versão é o próprio objeto:
// o `WeakMap` devolve o mesmo índice enquanto ele existir e o libera junto com
// ele. Funciona igual no navegador e no Node.

/** O grupo de uma raiz (v16): ela e tudo o que tem o pertencimento terminando nela. */
export interface RootMembers {
  readonly markings: readonly Marking[];
  readonly containers: readonly ProjectContainer[];
}

export interface ProjectIndex {
  readonly layers: ReadonlyMap<string, Layer>;
  readonly containers: ReadonlyMap<string, ProjectContainer>;
  readonly markings: ReadonlyMap<string, Marking>;
  /** Setas por id (v13). Ids no mesmo espaço das marcações. */
  readonly arrows: ReadonlyMap<string, Arrow>;
  /**
   * Setas presas a cada marcação, na ordem do array: cada seta aparece sob a origem (`from`) e
   * sob o destino (`to`); uma seta de uma marcação a ela mesma (projeto inválido) aparece uma vez.
   */
  readonly arrowsByMarking: ReadonlyMap<string, readonly Arrow[]>;
  readonly annotations: ReadonlyMap<string, Annotation>;
  /** Tuplas de cada anotação, por id. */
  readonly entries: ReadonlyMap<string, ReadonlyMap<string, Entry>>;
  /** Filhas diretas de cada marcação (chave `null` = sem pai), na ordem do array. */
  readonly children: ReadonlyMap<string | null, readonly Marking[]>;
  /**
   * Containers de cada marcação do canvas (v13; chave `null` = containers sem pai), na ordem
   * do array. Com `children`, são os membros de uma marcação (`membersOf`).
   */
  readonly containersByParent: ReadonlyMap<string | null, readonly ProjectContainer[]>;
  /** Marcações do canvas sem pai (flutuantes inclusive), na ordem do array. */
  readonly canvasRoots: readonly Marking[];
  /**
   * Raiz de cada container e marcação (v16, perspectivas): o container ou a marcação do canvas
   * sem pai (flutuante inclusive) em que a cadeia de pertencimento termina. Container sem pai,
   * flutuante e marcação do canvas sem pai são a própria raiz. Ids de containers e de marcações
   * dividem o mapa. Num ciclo (projeto inválido) todos os da cadeia ficam com o nó em que ela
   * fecha.
   */
  readonly rootOf: ReadonlyMap<string, string>;
  /**
   * Tudo o que tem uma raiz (ela inclusive), por id da raiz, na ordem dos arrays. Toda raiz
   * tem entrada, mesmo sem mais ninguém.
   */
  readonly rootMembers: ReadonlyMap<string, RootMembers>;
  /** Ids das raízes: containers sem pai (ordem do array), depois `canvasRoots`. */
  readonly roots: readonly string[];
  /** Perspectivas "Para todos" que têm cada raiz, na ordem de `perspectives`. */
  readonly perspectivesByRoot: ReadonlyMap<string, readonly Perspective[]>;
  /** Anotações de cada marcação, na ordem do projeto. */
  readonly annotationsByMarking: ReadonlyMap<string, readonly Annotation[]>;
  /** Anotações vinculadas diretamente a cada dona, na ordem do projeto. */
  readonly annotationsByOwner: ReadonlyMap<string, readonly Annotation[]>;
  readonly specializations: ReadonlyMap<string, ProjectSpecialization>;
  /** Tipos das especializações carregadas, por `typeKey(specId, typeId)`. */
  readonly types: ReadonlyMap<string, ResolvedType>;
  /** Camadas das especializações carregadas, por `typeKey(specId, layerId)`. */
  readonly specLayers: ReadonlyMap<string, SpecLayer>;
  /** Camada do projeto criada de cada camada de especialização, por `typeKey(specId, layerId)`. */
  readonly layersBySpecLayer: ReadonlyMap<string, Layer>;
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

/**
 * O nó acima de `id` na cadeia de pertencimento, ou `null` se `id` é raiz (container sem pai,
 * marcação do canvas sem pai, flutuante) ou o nó de cima não existe (projeto inválido). Acima de
 * uma marcação de container está o container; acima de um container, a marcação pai dele.
 */
function upperNode(
  id: string,
  containers: ReadonlyMap<string, ProjectContainer>,
  markings: ReadonlyMap<string, Marking>,
): string | null {
  const c = containers.get(id);
  const m = c ? undefined : markings.get(id);
  const up = c ? c.parentId : m && !m.floating ? (m.containerId ?? m.parentId) : null;
  if (up === null) return null;
  return containers.has(up) || markings.has(up) ? up : null;
}

/** Raiz de cada nó, sem recursão (cadeias fundas) e sem travar em ciclo. */
function computeRootOf(
  ids: Iterable<string>,
  upper: (id: string) => string | null,
): Map<string, string> {
  const rootOf = new Map<string, string>();
  for (const start of ids) {
    if (rootOf.has(start)) continue;
    const path = new Set<string>();
    let current = start;
    let root: string | undefined;
    while (root === undefined) {
      const known = rootOf.get(current);
      if (known !== undefined || path.has(current)) {
        root = known ?? current;
        continue;
      }
      path.add(current);
      const up = upper(current);
      if (up === null) root = current;
      else current = up;
    }
    for (const id of path) rootOf.set(id, root);
  }
  return rootOf;
}

function rootGroups(
  p: Project,
  containers: ReadonlyMap<string, ProjectContainer>,
  markings: ReadonlyMap<string, Marking>,
  canvasRoots: readonly Marking[],
): Pick<ProjectIndex, 'rootOf' | 'rootMembers' | 'roots' | 'perspectivesByRoot'> {
  const upper = (id: string) => upperNode(id, containers, markings);
  const rootOf = computeRootOf(
    [...p.containers.map((c) => c.id), ...p.markings.map((m) => m.id)],
    upper,
  );
  const groups = new Map<
    string,
    { markings: Marking[]; containers: ProjectContainer[] }
  >();
  const groupOf = (id: string) => {
    const root = rootOf.get(id) as string;
    let group = groups.get(root);
    if (!group) groups.set(root, (group = { markings: [], containers: [] }));
    return group;
  };
  for (const c of p.containers) groupOf(c.id).containers.push(c);
  for (const m of p.markings) groupOf(m.id).markings.push(m);

  const roots = [
    ...p.containers.filter((c) => c.parentId === null).map((c) => c.id),
    ...canvasRoots.map((m) => m.id),
  ];
  const perspectivesByRoot = new Map<string, Perspective[]>();
  for (const perspective of p.perspectives) {
    for (const root of new Set(perspective.items.map((item) => item.root))) {
      push(perspectivesByRoot, root, perspective);
    }
  }
  return { rootOf, rootMembers: groups, roots, perspectivesByRoot };
}

function buildIndex(p: Project): ProjectIndex {
  const entries = new Map<string, ReadonlyMap<string, Entry>>();
  const children = new Map<string | null, Marking[]>();
  const containersByParent = new Map<string | null, ProjectContainer[]>();
  const canvasRoots: Marking[] = [];
  const arrowsByMarking = new Map<string, Arrow[]>();
  const annotationsByMarking = new Map<string, Annotation[]>();
  const annotationsByOwner = new Map<string, Annotation[]>();
  const types = new Map<string, ResolvedType>();
  const specLayers = new Map<string, SpecLayer>();
  const layersBySpecLayer = new Map<string, Layer>();
  for (const l of p.layers) {
    if (!l.spec) continue;
    const key = typeKey(l.spec.specId, l.spec.layerId);
    if (!layersBySpecLayer.has(key)) layersBySpecLayer.set(key, l);
  }
  const containersById = byId(p.containers);
  const markingsById = byId(p.markings);

  for (const m of p.markings) {
    push(children, m.parentId, m);
    if (m.containerId === null && m.parentId === null) canvasRoots.push(m);
  }
  for (const c of p.containers) push(containersByParent, c.parentId, c);
  for (const a of p.arrows) {
    push(arrowsByMarking, a.from, a);
    if (a.to !== a.from) push(arrowsByMarking, a.to, a);
  }
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
    containers: containersById,
    markings: markingsById,
    arrows: byId(p.arrows),
    arrowsByMarking,
    annotations: byId(p.annotations),
    entries,
    children,
    containersByParent,
    canvasRoots,
    ...rootGroups(p, containersById, markingsById, canvasRoots),
    annotationsByMarking,
    annotationsByOwner,
    specializations: byId(p.specializations),
    types,
    specLayers,
    layersBySpecLayer,
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

/**
 * O id já é de uma marcação, de uma seta ou de um container (`projectIndex` os trata como um
 * espaço só). Varre os arrays em vez de usar o índice: quem cria um item a cada versão do
 * projeto não pode pagar a montagem do índice por criação.
 */
export function idInUse(p: Project, id: string): boolean {
  return (
    p.markings.some((m) => m.id === id) ||
    p.arrows.some((a) => a.id === id) ||
    p.containers.some((c) => c.id === id)
  );
}

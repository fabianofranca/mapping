// Resolvedor único dos filhos de um tipo (`formatVersion` 11, decisão 10 da etapa #559): lê o
// `allowedChildren` de cada tipo da especialização, em que cada item é um id de tipo ou uma
// cláusula `{ layer, groups? }`, e devolve o conjunto de tipos filhos. É a única leitura de
// `allowedChildren`: o validador (`requiresOwner`), `isAllowedOwner`, `childTypesOf` e
// `ownerTypesOf` passam por aqui. Puro, sem APIs de navegador e sem importar `spec.ts` (o
// validador o usa): o formato que lê é estrutural.
//
// Regra: a lista é a união dos itens na ordem deles; dentro de uma cláusula, os tipos saem na
// ordem da camada (sem `groups`, a camada inteira; com `groups`, só os tipos que estão em algum
// dos grupos); um tipo repetido fica na primeira posição. O que não se resolve (id ou camada
// inexistente) é ignorado: quem aponta o erro é o validador.

/** Cláusula de `allowedChildren`: a camada inteira ou os tipos dela que estão nos grupos. */
export interface ChildClauseLike {
  readonly layer: string;
  readonly groups?: readonly string[] | undefined;
}

/** O que o resolvedor lê de um tipo. */
export interface ChildTypeLike {
  readonly id: string;
  readonly groups?: readonly string[] | undefined;
  readonly allowedChildren?: readonly (string | ChildClauseLike)[] | undefined;
}

/** O que o resolvedor lê de uma especialização. */
export interface ChildSourceLike {
  readonly layers: readonly {
    readonly id: string;
    readonly annotationTypes: readonly ChildTypeLike[];
  }[];
}

/** Os conjuntos resolvidos de uma especialização. */
export interface ChildSets {
  /** id do dono → ids dos filhos, na ordem; só donos com pelo menos um filho. */
  readonly children: ReadonlyMap<string, readonly string[]>;
  /** id do dono → os mesmos ids, para a consulta por id. */
  readonly allowed: ReadonlyMap<string, ReadonlySet<string>>;
  /** id do filho → ids dos donos que o aceitam, na ordem da especialização. */
  readonly owners: ReadonlyMap<string, readonly string[]>;
}

const NONE: readonly string[] = [];

/** Ids dos tipos da camada `clause.layer` que a cláusula cobre, na ordem da camada. */
function clauseIds(
  clause: ChildClauseLike,
  layers: ReadonlyMap<string, readonly ChildTypeLike[]>,
): string[] {
  const types = layers.get(clause.layer);
  if (types === undefined) return [];
  const wanted = clause.groups === undefined ? null : new Set(clause.groups);
  const ids: string[] = [];
  for (const type of types) {
    if (wanted === null || inAnyGroup(type, wanted)) ids.push(type.id);
  }
  return ids;
}

function inAnyGroup(type: ChildTypeLike, wanted: ReadonlySet<string>): boolean {
  for (const group of type.groups ?? []) {
    if (wanted.has(group)) return true;
  }
  return false;
}

/** O conjunto de filhos de um dono: a união dos itens, na ordem, sem repetir. */
function ownerChildren(
  type: ChildTypeLike,
  known: ReadonlySet<string>,
  layers: ReadonlyMap<string, readonly ChildTypeLike[]>,
): Set<string> {
  const ids = new Set<string>();
  for (const item of type.allowedChildren ?? []) {
    if (typeof item === 'string') {
      if (known.has(item)) ids.add(item);
    } else {
      for (const id of clauseIds(item, layers)) ids.add(id);
    }
  }
  return ids;
}

function buildChildSets(source: ChildSourceLike): ChildSets {
  const known = new Set<string>();
  const layers = new Map<string, readonly ChildTypeLike[]>();
  for (const layer of source.layers) {
    if (!layers.has(layer.id)) layers.set(layer.id, layer.annotationTypes);
    for (const type of layer.annotationTypes) known.add(type.id);
  }
  const children = new Map<string, readonly string[]>();
  const allowed = new Map<string, ReadonlySet<string>>();
  const owners = new Map<string, string[]>();
  for (const layer of source.layers) {
    for (const type of layer.annotationTypes) {
      if (allowed.has(type.id)) continue;
      const ids = ownerChildren(type, known, layers);
      if (ids.size === 0) continue;
      children.set(type.id, [...ids]);
      allowed.set(type.id, ids);
      for (const id of ids) {
        const list = owners.get(id);
        if (list === undefined) owners.set(id, [type.id]);
        else list.push(type.id);
      }
    }
  }
  return { children, allowed, owners };
}

const cache = new WeakMap<object, ChildSets>();

/** Os conjuntos resolvidos da especialização, memoizados por ela (um objeto, uma conta). */
export function childSets(source: ChildSourceLike): ChildSets {
  const hit = cache.get(source);
  if (hit !== undefined) return hit;
  const sets = buildChildSets(source);
  cache.set(source, sets);
  return sets;
}

/** Ids dos tipos que podem ser filhos do tipo `ownerTypeId`, na ordem (vazio sem filhos). */
export function childTypeIds(
  source: ChildSourceLike,
  ownerTypeId: string,
): readonly string[] {
  return childSets(source).children.get(ownerTypeId) ?? NONE;
}

/** Ids dos tipos que aceitam `childTypeId` como filho, na ordem da especialização. */
export function ownerTypeIds(
  source: ChildSourceLike,
  childTypeId: string,
): readonly string[] {
  return childSets(source).owners.get(childTypeId) ?? NONE;
}

/** `true` se o tipo `ownerTypeId` aceita `childTypeId` como filho. */
export function isChildTypeAllowed(
  source: ChildSourceLike,
  ownerTypeId: string,
  childTypeId: string,
): boolean {
  return childSets(source).allowed.get(ownerTypeId)?.has(childTypeId) ?? false;
}

import { fail } from './errors';
import { snapCoordinate } from './geometry';
import { perspectiveNameKey } from './invariants';
import {
  isMarkingRoot,
  perspectiveView,
  rootPosition,
  type CanvasPosition,
} from './perspective';
import { placeRootIn } from './perspectivePlace';
import { reconcilePerspective } from './perspectiveReconcile';
import { findById, updateById } from './project';
import { projectIndex } from './projectIndex';
import type { Perspective, PerspectiveItem, Project } from './types';

// Operações das perspectivas (v16, decisões 6, 10 e 11). As "Para todos" ficam no projeto
// (`p.perspectives`) e as operações recebem o `id`; as "Só eu" ficam no navegador, no mesmo
// formato, e usam a versão sobre o valor (`Perspective`). Ids vêm do chamador.

export type NameIssue = 'empty' | 'taken';

/**
 * O que há de errado num nome de perspectiva: vazio, ou igual (sem diferença de caixa nem de
 * espaços nas pontas) a um de `names`. `exceptName` é o nome atual de quem está sendo renomeada:
 * ele não conta como repetido.
 */
export function perspectiveNameIssue(
  names: readonly string[],
  name: string,
  exceptName?: string,
): NameIssue | null {
  const key = perspectiveNameKey(name);
  if (key === '') return 'empty';
  const except = exceptName === undefined ? null : perspectiveNameKey(exceptName);
  const taken = names.some((n) => {
    const other = perspectiveNameKey(n);
    return other === key && other !== except;
  });
  return taken ? 'taken' : null;
}

/** `perspectiveNameIssue` contra as "Para todos" do projeto e os nomes extras (as "Só eu"). */
export function projectPerspectiveNameIssue(
  p: Project,
  name: string,
  exceptName?: string,
  extraNames: readonly string[] = [],
): NameIssue | null {
  const names = [...p.perspectives.map((x) => x.name), ...extraNames];
  return perspectiveNameIssue(names, name, exceptName);
}

/** O nome sem espaços nas pontas; falha com o código do problema. */
function checkedName(
  p: Project,
  name: string,
  exceptName: string | undefined,
  extraNames: readonly string[] | undefined,
): string {
  const issue = projectPerspectiveNameIssue(p, name, exceptName, extraNames);
  if (issue === 'empty') fail('perspective-name-empty');
  if (issue === 'taken') fail('perspective-name-taken', name.trim());
  return name.trim();
}

/** Só camadas que existem, sem repetir, na ordem das camadas do projeto. */
function normalizedLayers(p: Project, layerIds: readonly string[]): string[] {
  const wanted = new Set(layerIds);
  return p.layers.filter((l) => wanted.has(l.id)).map((l) => l.id);
}

/** De onde começa uma perspectiva nova: a Principal (`null`), vazia ou a cópia de uma. */
export type PerspectiveStart = null | 'empty' | Perspective;

function startItems(p: Project, startFrom: PerspectiveStart): readonly PerspectiveItem[] {
  if (startFrom === 'empty') return [];
  if (startFrom !== null) return startFrom.items.map((item) => ({ ...item }));
  return projectIndex(p).roots.map((root) => {
    const at = rootPosition(p, root) as CanvasPosition;
    return { root, x: at.x, y: at.y };
  });
}

/**
 * Monta uma perspectiva nova (valor; quem a guarda é o projeto ou o navegador). "Começar de":
 * a Principal leva todas as raízes nas posições delas; Vazia, nenhuma; uma perspectiva, a cópia
 * das raízes, das posições e das camadas escondidas (já limpa do que o projeto não tem mais).
 * `hiddenLayers`, se vier, substitui as da origem (a Principal e a Vazia começam sem nenhuma).
 */
export function buildPerspective(
  p: Project,
  args: {
    readonly id: string;
    readonly name: string;
    readonly startFrom: PerspectiveStart;
    readonly hiddenLayers?: readonly string[];
  },
): Perspective {
  const { startFrom } = args;
  const inherited =
    startFrom !== null && startFrom !== 'empty' ? startFrom.hiddenLayers : [];
  const raw: Perspective = {
    id: args.id,
    name: args.name.trim(),
    hiddenLayers: [...(args.hiddenLayers ?? inherited)],
    items: startItems(p, startFrom),
  };
  const clean = reconcilePerspective(p, p, raw);
  return { ...clean, hiddenLayers: normalizedLayers(p, clean.hiddenLayers) };
}

/**
 * Acrescenta a perspectiva no fim das "Para todos". Falha com `perspective-name-empty`,
 * `perspective-name-taken` (contra as do projeto e `extraNames`, as "Só eu") ou `duplicate-id`.
 */
export function addPerspective(
  p: Project,
  perspective: Perspective,
  extraNames?: readonly string[],
): Project {
  const name = checkedName(p, perspective.name, undefined, extraNames);
  if (p.perspectives.some((x) => x.id === perspective.id)) {
    fail('duplicate-id', perspective.id);
  }
  return { ...p, perspectives: [...p.perspectives, { ...perspective, name }] };
}

export function renamePerspective(
  p: Project,
  id: string,
  name: string,
  extraNames?: readonly string[],
): Project {
  const current = findById(p.perspectives, id);
  const checked = checkedName(p, name, current.name, extraNames);
  return {
    ...p,
    perspectives: updateById(p.perspectives, id, (x) => ({ ...x, name: checked })),
  };
}

/** Duplica a perspectiva (raízes, posições e camadas escondidas) com id e nome novos, no fim. */
export function duplicatePerspective(
  p: Project,
  id: string,
  newId: string,
  name: string,
  extraNames?: readonly string[],
): Project {
  const source = findById(p.perspectives, id);
  const copy = buildPerspective(p, { id: newId, name, startFrom: source });
  return addPerspective(p, copy, extraNames);
}

/** Apaga a perspectiva. Só `perspectives` muda: as marcas de chegada guardam o nome (`fromName`). */
export function removePerspective(p: Project, id: string): Project {
  findById(p.perspectives, id);
  return { ...p, perspectives: p.perspectives.filter((x) => x.id !== id) };
}

/** Troca a perspectiva `id` do projeto por `next` (o mesmo objeto: nada a trocar). */
function replaced(
  p: Project,
  id: string,
  current: Perspective,
  next: Perspective,
): Project {
  if (next === current) return p;
  return { ...p, perspectives: updateById(p.perspectives, id, () => next) };
}

// ---------------------------------------------------------------------------
// Enviar e tirar

/**
 * Envia raízes para a perspectiva `target` (decisão 6): cada raiz que ainda não está entra pela
 * regra da chegada (`placeRootIn`: perto da referência, no livre mais próximo ou na área de
 * chegada), uma de cada vez (a segunda já vê a primeira), sem marca. `source` é onde as raízes
 * estão agora (`null` = a Principal). Id que não é raiz falha com `not-root`.
 */
export function sendRoots(
  p: Project,
  target: Perspective,
  rootIds: readonly string[],
  source: Perspective | null,
): Perspective {
  const roots = projectIndex(p).rootOf;
  const sourceRoots = source ? new Set(source.items.map((item) => item.root)) : null;
  let current = target;
  const have = new Set(target.items.map((item) => item.root));
  for (const id of rootIds) {
    if (roots.get(id) !== id) fail('not-root', id);
    if (have.has(id)) continue;
    // A raiz que a origem não tem é medida na Principal.
    const from = source && sourceRoots?.has(id) ? perspectiveView(p, source) : p;
    const place = placeRootIn(perspectiveView(p, current), from, id);
    current = {
      ...current,
      items: [...current.items, { root: id, x: place.x, y: place.y }],
    };
    have.add(id);
  }
  return current;
}

export function sendRootsToPerspective(
  p: Project,
  targetId: string,
  rootIds: readonly string[],
  source: Perspective | null,
): Project {
  const target = findById(p.perspectives, targetId);
  return replaced(p, targetId, target, sendRoots(p, target, rootIds, source));
}

/** Tira as raízes da perspectiva; nada do projeto é apagado. Ids que ela não tem são ignorados. */
export function removeRoots(
  target: Perspective,
  rootIds: readonly string[],
): Perspective {
  const drop = new Set(rootIds);
  const items = target.items.filter((item) => !drop.has(item.root));
  return items.length === target.items.length ? target : { ...target, items };
}

export function removeRootsFromPerspective(
  p: Project,
  id: string,
  rootIds: readonly string[],
): Project {
  const target = findById(p.perspectives, id);
  return replaced(p, id, target, removeRoots(target, rootIds));
}

// ---------------------------------------------------------------------------
// Mover e camadas

export interface RootMove {
  readonly root: string;
  readonly dx: number;
  readonly dy: number;
}

/** O item depois do movimento; marcação só anda em inteiros. */
function movedItem(p: Project, item: PerspectiveItem, move: RootMove): PerspectiveItem {
  if (!Number.isFinite(move.dx) || !Number.isFinite(move.dy)) fail('invalid-placement');
  const whole = Number.isInteger(move.dx) && Number.isInteger(move.dy);
  if (isMarkingRoot(p, item.root) && !whole) fail('rect-not-integer', item.root);
  return {
    root: item.root,
    x: snapCoordinate(item.x + move.dx),
    y: snapCoordinate(item.y + move.dy),
  };
}

/**
 * Muda só a posição das raízes na perspectiva (decisão 10): o projeto não muda. Raiz que a
 * perspectiva não tem falha com `not-found`; o deslocamento de uma marcação é inteiro, senão
 * `rect-not-integer`. Deslocamento zero devolve a mesma perspectiva.
 */
export function moveRoots(
  p: Project,
  target: Perspective,
  moves: readonly RootMove[],
): Perspective {
  const items = new Map(target.items.map((item) => [item.root, item]));
  for (const move of moves) {
    const item = items.get(move.root) ?? fail('not-found', move.root);
    items.set(move.root, movedItem(p, item, move));
  }
  const next = target.items.map((item) => items.get(item.root) as PerspectiveItem);
  const same = next.every((item, i) => {
    const old = target.items[i] as PerspectiveItem;
    return item.x === old.x && item.y === old.y;
  });
  return same ? target : { ...target, items: next };
}

export function moveRootsInPerspective(
  p: Project,
  id: string,
  moves: readonly RootMove[],
): Project {
  const target = findById(p.perspectives, id);
  return replaced(p, id, target, moveRoots(p, target, moves));
}

/** Camadas escondidas (decisão 11): só as que existem, sem repetir, na ordem do projeto. */
export function setHiddenLayers(
  p: Project,
  target: Perspective,
  layerIds: readonly string[],
): Perspective {
  const hiddenLayers = normalizedLayers(p, layerIds);
  const same =
    hiddenLayers.length === target.hiddenLayers.length &&
    hiddenLayers.every((layer, i) => layer === target.hiddenLayers[i]);
  return same ? target : { ...target, hiddenLayers };
}

export function setPerspectiveHiddenLayers(
  p: Project,
  id: string,
  layerIds: readonly string[],
): Project {
  const target = findById(p.perspectives, id);
  return replaced(p, id, target, setHiddenLayers(p, target, layerIds));
}

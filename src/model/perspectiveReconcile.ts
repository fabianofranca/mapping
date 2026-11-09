import { snapNearInteger } from './geometry';
import { rootPosition } from './perspective';
import { projectIndex } from './projectIndex';
import type { SettleDelta } from './settleDelta';
import type { Arrival, Marking, Perspective, PerspectiveItem, Project } from './types';

// Reconciliação das perspectivas com o projeto (v16, decisão 4): depois de qualquer operação
// que muda a geometria (`settleHierarchy`), as raízes de cada perspectiva e as marcas "Veio de…"
// voltam a ser válidas sem que nada mude de lugar na tela. Funções puras; sem nada a mudar
// devolvem o mesmo objeto.

type Becoming = ReadonlyMap<string, readonly string[]>;

const EMPTY: Becoming = new Map();

/**
 * Para cada raiz de antes, os itens que eram dela e agora são raiz (existiam antes, sem serem
 * raiz). Montado numa passada pelas raízes de depois.
 */
function becameRoots(before: Project, after: Project): Becoming {
  if (before === after) return EMPTY;
  const was = projectIndex(before).rootOf;
  const out = new Map<string, string[]>();
  for (const id of projectIndex(after).roots) {
    const old = was.get(id);
    if (old === undefined || old === id) continue;
    const list = out.get(old);
    if (list) list.push(id);
    else out.set(old, [id]);
  }
  return out;
}

/**
 * O item de `id` que fica onde `item` (a raiz `anchorId`) estava na tela: a posição do item mais
 * o deslocamento de `id` em relação a `anchorId` em `p`. `null` se algum dos dois não existe.
 */
function shiftedItem(
  p: Project,
  id: string,
  item: PerspectiveItem,
  anchorId: string,
): PerspectiveItem | null {
  const at = rootPosition(p, id);
  const base = rootPosition(p, anchorId);
  if (!at || !base) return null;
  return {
    root: id,
    x: snapNearInteger(item.x + at.x - base.x),
    y: snapNearInteger(item.y + at.y - base.y),
  };
}

/** O item que substitui `item` em `after`, ou `null` se ele sai. */
function survivor(
  after: Project,
  item: PerspectiveItem,
  present: ReadonlySet<string>,
): PerspectiveItem | null {
  const root = projectIndex(after).rootOf.get(item.root);
  if (root === undefined) return null;
  if (root === item.root) return item;
  // Deixou de ser raiz: a raiz nova entra de modo que o item fique onde estava na tela.
  if (present.has(root)) return null;
  return shiftedItem(after, root, item, item.root);
}

/** A posição de uma raiz que é marcação é inteira. */
function wholeIfMarking(after: Project, item: PerspectiveItem): PerspectiveItem {
  const index = projectIndex(after);
  if (index.containers.has(item.root) || !index.markings.has(item.root)) return item;
  const x = Math.round(item.x);
  const y = Math.round(item.y);
  return x === item.x && y === item.y ? item : { root: item.root, x, y };
}

function reconcileItems(
  before: Project,
  after: Project,
  items: readonly PerspectiveItem[],
  becoming: Becoming,
): readonly PerspectiveItem[] {
  const present = new Set(items.map((item) => item.root));
  const seen = new Set<string>();
  const out: PerspectiveItem[] = [];
  const add = (item: PerspectiveItem | null) => {
    if (item === null || seen.has(item.root)) return;
    seen.add(item.root);
    out.push(wholeIfMarking(after, item));
  };
  for (const item of items) {
    add(survivor(after, item, present));
    // Itens que eram desta raiz e agora são raiz entram onde estavam.
    for (const id of becoming.get(item.root) ?? []) {
      if (!present.has(id)) {
        add(shiftedItem(before, id, item, item.root));
      }
    }
  }
  const same =
    out.length === items.length &&
    out.every((item, i) => {
      const old = items[i] as PerspectiveItem;
      return item.root === old.root && item.x === old.x && item.y === old.y;
    });
  return same ? items : out;
}

function reconcileWith(
  before: Project,
  after: Project,
  perspective: Perspective,
  becoming: Becoming,
): Perspective {
  const items = reconcileItems(before, after, perspective.items, becoming);
  const layers = projectIndex(after).layers;
  const kept = new Set(perspective.hiddenLayers.filter((id) => layers.has(id)));
  const hidden =
    kept.size === perspective.hiddenLayers.length
      ? perspective.hiddenLayers
      : perspective.hiddenLayers.filter(
          (id, i, all) => kept.has(id) && all.indexOf(id) === i,
        );
  return items === perspective.items && hidden === perspective.hiddenLayers
    ? perspective
    : { ...perspective, items, hiddenLayers: hidden };
}

/**
 * Leva uma perspectiva do projeto de antes (`before`) ao de depois (`after`) sem mover nada na
 * tela: a raiz apagada sai; a que deixou de ser raiz dá lugar à raiz nova, posta de modo que ela
 * continue onde estava; o item que virou raiz entra onde estava (pela posição de antes); sem
 * raiz repetida (vale a primeira); `hiddenLayers` só com camadas que existem; posição de marcação
 * inteira. Com `before === after` (uma "Só eu" ao abrir) só limpa. Sem nada a mudar devolve a
 * própria perspectiva.
 */
export function reconcilePerspective(
  before: Project,
  after: Project,
  perspective: Perspective,
): Perspective {
  return reconcileWith(before, after, perspective, becameRoots(before, after));
}

/** A chegada que continua valendo: a raiz existe, é raiz, não se repete e não mudou de lugar. */
function arrivalHolds(
  before: Project,
  after: Project,
  arrival: Arrival,
  seen: Set<string>,
): boolean {
  if (seen.has(arrival.root)) return false;
  seen.add(arrival.root);
  if (projectIndex(after).rootOf.get(arrival.root) !== arrival.root) return false;
  const was = rootPosition(before, arrival.root);
  const now = rootPosition(after, arrival.root);
  return !was || !now || (was.x === now.x && was.y === now.y);
}

/**
 * Reconcilia as perspectivas "Para todos" e as marcas de chegada de `after` com a geometria
 * (regras em `reconcilePerspective`). A chegada sai quando a raiz some, deixa de ser raiz, se
 * repete ou muda de posição na Principal ("mover a raiz tira a marca"). Sem perspectiva nem
 * chegada, ou sem nada a mudar, devolve `after` (o mesmo objeto).
 */
export function reconcilePerspectives(before: Project, after: Project): Project {
  if (after.perspectives.length === 0 && after.arrivals.length === 0) return after;
  const becoming = becameRoots(before, after);
  const perspectives = after.perspectives.map((x) =>
    reconcileWith(before, after, x, becoming),
  );
  const seen = new Set<string>();
  const arrivals = after.arrivals.filter((a) => arrivalHolds(before, after, a, seen));
  const samePerspectives = perspectives.every((x, i) => x === after.perspectives[i]);
  if (samePerspectives && arrivals.length === after.arrivals.length) return after;
  return {
    ...after,
    perspectives: samePerspectives ? after.perspectives : perspectives,
    arrivals: arrivals.length === after.arrivals.length ? after.arrivals : arrivals,
  };
}

/**
 * Como `reconcilePerspectives`, mas sem montar o índice do projeto inteiro (#882, decisão 6): `delta` é
 * a diferença entre `before` e `after` (`settleDelta`). Uma raiz de perspectiva ou de marca de chegada
 * é container ou marcação do canvas, e a raiz de um item só muda se algo da cadeia dele mudou; então o
 * mesmo algoritmo roda sobre uma visão enxuta dos dois projetos, só com os containers, as marcações do
 * canvas e as marcações que a operação trocou (sem anotações nem setas), e o resultado dá o mesmo que
 * o do projeto inteiro. O custo deixa de seguir o número de marcações dos containers.
 */
export function reconcilePerspectivesFrom(
  before: Project,
  after: Project,
  delta: SettleDelta,
): Project {
  if (after.perspectives.length === 0 && after.arrivals.length === 0) return after;
  const changed = new Set(delta.changed);
  const gone = new Set<Marking>(delta.old);
  const lean = (p: Project, keep: (m: Marking, i: number) => boolean): Project => ({
    ...p,
    markings: p.markings.filter(keep),
    annotations: [],
    arrows: [],
  });
  const leanBefore = lean(before, (m) => m.containerId === null || gone.has(m));
  const leanAfter = lean(after, (m, i) => m.containerId === null || changed.has(i));
  const result = reconcilePerspectives(leanBefore, leanAfter);
  if (result === leanAfter) return after;
  return { ...after, perspectives: result.perspectives, arrivals: result.arrivals };
}

/**
 * Tira de `hiddenLayers` das perspectivas as camadas que o projeto não tem mais (apagar uma
 * camada, remover uma especialização). Sem nada a tirar devolve `p`.
 */
export function pruneHiddenLayers(p: Project): Project {
  if (p.perspectives.length === 0) return p;
  const layers = projectIndex(p).layers;
  let changed = false;
  const perspectives = p.perspectives.map((x) => {
    if (x.hiddenLayers.every((id) => layers.has(id))) return x;
    changed = true;
    return { ...x, hiddenLayers: x.hiddenLayers.filter((id) => layers.has(id)) };
  });
  return changed ? { ...p, perspectives } : p;
}

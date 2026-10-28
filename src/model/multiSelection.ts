import { arrowIdsAttachedTo, withoutArrows } from './arrows';
import { fail } from './errors';
import {
  MIN_MARKING_SIZE,
  area,
  boundingBox,
  containsRect,
  imageCanvasRect,
  imagePixelRect,
  isIntegerRect,
  rectsOverlap,
  translateRect,
} from './geometry';
import { ancestorsOf, descendantsOf } from './hierarchy';
import {
  markingCanvasRectOf,
  settleIf,
  spaceOf,
  type SettleOptions,
} from './hierarchySettle';
import {
  canDeleteImage,
  canDeleteMarking,
  canEditArrow,
  canEditImagePlacement,
  canEditMarkingGeometry,
  requireUnlocked,
} from './locks';
import { findById } from './project';
import { projectIndex } from './projectIndex';
import { countBrokenRefs } from './refs';
import type { Arrow, Marking, Placement, Project, ProjectContainer, Rect } from './types';

// Seleção múltipla (etapa Marcações espaciais, ME2; regras no PLAN.md, "Regras do arrasto
// conjunto"). Operações puras sobre uma lista de itens: mover junto, selecionar com o
// conteúdo, excluir e trancar. A interface guarda a seleção como `{ kind, id }`; o modelo só
// conhece esta forma mínima, sem depender do estado da UI.

/**
 * Um item da seleção: `image` = container (o nome da UI), `marking` = marcação, `arrow` = seta
 * (v13). A seta entra para excluir e trancar; mover não se aplica a ela (a rota é da pessoa e
 * acompanha as pontas), então `moveItems` a ignora.
 */
export interface ItemRef {
  readonly kind: 'image' | 'marking' | 'arrow';
  readonly id: string;
}

/** Itens existentes da seleção, sem repetidos, na ordem em que vieram. */
interface ResolvedItems {
  readonly list: readonly ItemRef[];
  readonly markings: ReadonlyMap<string, Marking>;
  readonly containers: ReadonlyMap<string, ProjectContainer>;
  readonly arrows: ReadonlyMap<string, Arrow>;
}

function resolveItems(p: Project, items: readonly ItemRef[]): ResolvedItems {
  const index = projectIndex(p);
  const list: ItemRef[] = [];
  const markings = new Map<string, Marking>();
  const containers = new Map<string, ProjectContainer>();
  const arrows = new Map<string, Arrow>();
  for (const item of items) {
    if (item.kind === 'image') {
      const container = index.containers.get(item.id);
      if (!container || containers.has(item.id)) continue;
      containers.set(item.id, container);
    } else if (item.kind === 'arrow') {
      const arrow = index.arrows.get(item.id);
      if (!arrow || arrows.has(item.id)) continue;
      arrows.set(item.id, arrow);
    } else {
      const marking = index.markings.get(item.id);
      if (!marking || markings.has(item.id)) continue;
      markings.set(item.id, marking);
    }
    list.push(item);
  }
  return { list, markings, containers, arrows };
}

// ---------------------------------------------------------------------------
// Mover

/**
 * Os itens que recebem deslocamento próprio no arrasto conjunto: descarta os inexistentes, os
 * repetidos e as marcações que já vão com outro item selecionado. Uma marcação de container
 * vai com o container selecionado dela (as coordenadas são relativas a ele) e com uma
 * ancestral selecionada (`moveMarking` dentro do container leva as descendentes). No canvas
 * nada se descarta: mover uma marcação do canvas (flutuante inclusive) não leva nada
 * (decisão 2), então ela sempre se move por conta própria. A seta nunca se move (a rota é da
 * pessoa e acompanha as pontas). Ordem: a dos itens.
 */
export function movingItems(p: Project, items: readonly ItemRef[]): ItemRef[] {
  const selected = resolveItems(p, items);
  return selected.list.filter((item) => {
    if (item.kind === 'arrow') return false;
    if (item.kind === 'image') return true;
    const marking = selected.markings.get(item.id);
    if (!marking || marking.containerId === null) return true;
    if (selected.containers.has(marking.containerId)) return false;
    return !ancestorsOf(p, marking.id).some((a) => selected.markings.has(a.id));
  });
}

/** A geometria do item pode mudar (trava própria ou herdada dos ancestrais). */
function canEditItemGeometry(p: Project, item: ItemRef): boolean {
  if (item.kind === 'arrow') return canEditArrow(p, item.id);
  return item.kind === 'image'
    ? canEditImagePlacement(p, item.id)
    : canEditMarkingGeometry(p, item.id);
}

/**
 * O arrasto conjunto pode começar: há o que mover e nenhum item que recebe deslocamento tem a
 * geometria travada (tudo ou nada). Um item descartado por `movingItems` não conta: quem o
 * leva é que decide, como no arrasto de um item só.
 */
export function canMoveItems(p: Project, items: readonly ItemRef[]): boolean {
  const moving = movingItems(p, items);
  return moving.length > 0 && moving.every((item) => canEditItemGeometry(p, item));
}

/**
 * Move os itens pelo deslocamento `dx`, `dy`, em **unidades do canvas** (finitos, podem ser
 * decimais). Cada item recebe o deslocamento no próprio espaço:
 * - container: `placement` + `dx`, `dy` (as marcações dele vão junto: coordenadas relativas);
 * - marcação do canvas, flutuante inclusive: o `rect` por `round(dx)`, `round(dy)`, sozinha;
 * - marcação de container: `round(dx / escala)`, `round(dy / escala)` da escala do container,
 *   para ela e as descendentes (trancadas inclusive), como `moveMarking`. Tem de ficar inteira
 *   dentro do container: no arrasto conjunto ela não troca de espaço (`rect-out-of-image`).
 *
 * Quando algum item é uma marcação do canvas, o deslocamento do canvas é arredondado **uma vez**
 * e vale também para os containers: o retângulo da marcação é inteiro e o do container não,
 * então cada um com o seu deslocamento deixaria um container colado na borda da marcação
 * poucas frações para fora dela e o assentar o tiraria do pertencimento. Sem marcação do canvas
 * o container anda pelo `dx`, `dy` exatos (arrasto suave com zoom).
 *
 * Tudo ou nada: com qualquer item de `movingItems` travado falha com `locked`; um container
 * movido que passe a sobrepor um container que NÃO se move falha com `image-overlap` (os
 * movidos mantêm a posição relativa entre si e não são testados entre si). Deslocamento zero,
 * ou nada para mover, devolve `p` como está, sem conferir a trava. No fim assenta uma só vez,
 * sobre o resultado inteiro (salvo `settle: false`, das prévias de gesto): é o assentar que
 * refaz o `parentId` e que faz uma marcação do canvas que acabou inteira dentro de um container
 * passar a ser dele.
 */
export function moveItems(
  p: Project,
  items: readonly ItemRef[],
  dx: number,
  dy: number,
  options?: SettleOptions,
): Project {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) fail('invalid-placement');
  if (dx === 0 && dy === 0) return p;
  const moving = movingItems(p, items);
  if (moving.length === 0) return p;
  for (const item of moving) requireUnlocked(canEditItemGeometry(p, item));

  const index = projectIndex(p);
  const sharesCanvasDelta = moving.some(
    (item) =>
      item.kind === 'marking' && index.markings.get(item.id)?.containerId === null,
  );
  const canvasDx = sharesCanvasDelta ? Math.round(dx) : dx;
  const canvasDy = sharesCanvasDelta ? Math.round(dy) : dy;

  const placements = new Map<string, Placement>();
  const rects = new Map<string, Rect>();
  for (const item of moving) {
    if (item.kind === 'image') {
      const container = index.containers.get(item.id);
      if (!container || (canvasDx === 0 && canvasDy === 0)) continue;
      const { x, y, scale } = container.placement;
      placements.set(item.id, { x: x + canvasDx, y: y + canvasDy, scale });
      continue;
    }
    const marking = index.markings.get(item.id);
    if (!marking) continue;
    if (marking.containerId === null) {
      const cx = Math.round(dx);
      const cy = Math.round(dy);
      if (cx !== 0 || cy !== 0)
        rects.set(marking.id, translateRect(marking.rect, cx, cy));
      continue;
    }
    // Marcação de container: o deslocamento do canvas em pixels do container, para ela e as
    // descendentes; nada a mudar se o arredondamento zera os dois eixos.
    const space = spaceOf(p, marking);
    const mx = Math.round(dx / space.placement.scale);
    const my = Math.round(dy / space.placement.scale);
    if (mx === 0 && my === 0) continue;
    for (const m of [marking, ...descendantsOf(p, marking.id)]) {
      const next = translateRect(m.rect, mx, my);
      if (space.bounds && !containsRect(space.bounds, next)) {
        fail('rect-out-of-image', m.id);
      }
      rects.set(m.id, next);
    }
  }

  if (placements.size > 0) {
    const fixed = p.containers
      .filter((c) => !placements.has(c.id))
      .map((c) => imageCanvasRect(c, c.placement));
    for (const [id, placement] of placements) {
      const container = index.containers.get(id);
      if (!container) continue;
      const moved = imageCanvasRect(container, placement);
      if (fixed.some((other) => rectsOverlap(moved, other))) fail('image-overlap', id);
    }
  }

  if (placements.size === 0 && rects.size === 0) return p;
  const next: Project = {
    ...p,
    containers:
      placements.size === 0
        ? p.containers
        : p.containers.map((c) => {
            const placement = placements.get(c.id);
            return placement ? { ...c, placement } : c;
          }),
    markings:
      rects.size === 0
        ? p.markings
        : p.markings.map((m) => {
            const rect = rects.get(m.id);
            return rect ? { ...m, rect } : m;
          }),
  };
  return settleIf(next, options);
}

// ---------------------------------------------------------------------------
// Selecionar com o conteúdo

/**
 * "Selecionar com o conteúdo": a marcação e tudo o que ela cobre, recursivo, pelo pertencimento
 * assentado (`parentId`). Cobre as marcações descendentes e, numa marcação do canvas, os
 * containers membros e todas as marcações de cada um deles. As flutuantes não são membros de
 * nada e nunca entram. Ordem: o conteúdo primeiro (em profundidade, cada marcação seguida do que
 * ela cobre, na ordem dos arrays) e a própria marcação por último, que vira o primário na UI.
 * Marcação inexistente falha com `not-found`.
 */
export function selectionWithContents(p: Project, markingId: string): ItemRef[] {
  const root = findById(p.markings, markingId);
  const index = projectIndex(p);
  const out: ItemRef[] = [];
  const seen = new Set<string>([`marking:${root.id}`]);
  const push = (kind: ItemRef['kind'], id: string): boolean => {
    const key = `${kind}:${id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    out.push({ kind, id });
    return true;
  };

  // Marcações de cada container, montadas uma vez e só se houver container membro.
  let byContainer: Map<string, Marking[]> | null = null;
  const markingsOf = (containerId: string): readonly Marking[] => {
    if (byContainer === null) {
      byContainer = new Map();
      for (const m of p.markings) {
        if (m.containerId === null) continue;
        const list = byContainer.get(m.containerId);
        if (list) list.push(m);
        else byContainer.set(m.containerId, [m]);
      }
    }
    return byContainer.get(containerId) ?? [];
  };

  const collect = (id: string): void => {
    for (const child of index.children.get(id) ?? []) {
      if (push('marking', child.id)) collect(child.id);
    }
    for (const container of index.containersByParent.get(id) ?? []) {
      if (!push('image', container.id)) continue;
      for (const m of markingsOf(container.id)) push('marking', m.id);
    }
  };
  collect(root.id);
  out.push({ kind: 'marking', id: root.id });
  return out;
}

// ---------------------------------------------------------------------------
// Excluir

/** Marcações que saem: as selecionadas, as descendentes delas e as dos containers selecionados. */
function removedMarkingIds(p: Project, selected: ResolvedItems): Set<string> {
  const ids = new Set<string>();
  for (const id of selected.markings.keys()) {
    ids.add(id);
    for (const d of descendantsOf(p, id)) ids.add(d.id);
  }
  if (selected.containers.size > 0) {
    for (const m of p.markings) {
      if (m.containerId !== null && selected.containers.has(m.containerId)) ids.add(m.id);
    }
  }
  return ids;
}

/** Setas que saem: as selecionadas e as presas a qualquer marcação que sai. */
function removedArrowIds(
  p: Project,
  selected: ResolvedItems,
  markingIds: ReadonlySet<string>,
): Set<string> {
  const ids = arrowIdsAttachedTo(p, markingIds);
  for (const id of selected.arrows.keys()) ids.add(id);
  return ids;
}

/** A exclusão em si, sem a trava nem o assentar: também serve para contar o impacto. */
function cascadeRemoveItems(p: Project, selected: ResolvedItems): Project {
  const markingIds = removedMarkingIds(p, selected);
  return withoutArrows(
    {
      ...p,
      containers:
        selected.containers.size === 0
          ? p.containers
          : p.containers.filter((c) => !selected.containers.has(c.id)),
      markings: p.markings.filter((m) => !markingIds.has(m.id)),
      annotations: p.annotations.filter((a) => !markingIds.has(a.markingId)),
    },
    removedArrowIds(p, selected, markingIds),
  );
}

export interface ItemsDeletionImpact {
  /** Marcações que saem: as selecionadas, as descendentes delas e as dos containers selecionados. */
  readonly markings: number;
  /** Containers selecionados, que saem. */
  readonly containers: number;
  /** Setas que saem: as selecionadas e as presas a qualquer marcação que sai. */
  readonly arrows: number;
  /** Anotações que saem, as de todas as marcações e setas que saem. */
  readonly annotations: number;
  /** Das marcações que saem junto (descendentes e as dos containers), quantas estão trancadas. */
  readonly lockedMarkings: number;
  /** Containers que estavam dentro de uma marcação que sai e não foram selecionados: ficam. */
  readonly containersStay: number;
  /** Referências entre anotações que a exclusão quebraria. */
  readonly brokenRefs: number;
}

/**
 * Impacto de excluir a seleção inteira, sem contar nada duas vezes (uma marcação e a filha dela
 * selecionadas, um container e uma marcação dele selecionados). `lockedMarkings` conta só as
 * trancadas que saem junto: uma marcação selecionada e trancada bloqueia a exclusão
 * (`canDeleteItems`) e não entra na conta. Itens inexistentes são ignorados. As setas presas a
 * uma marcação que sai entram na conta e levam as anotações delas.
 */
export function itemsDeletionImpact(
  p: Project,
  items: readonly ItemRef[],
): ItemsDeletionImpact {
  const selected = resolveItems(p, items);
  const removed = removedMarkingIds(p, selected);
  const arrowIds = removedArrowIds(p, selected, removed);
  const index = projectIndex(p);
  let annotations = 0;
  for (const a of p.annotations) {
    if (removed.has(a.markingId) || arrowIds.has(a.markingId)) annotations++;
  }
  let lockedMarkings = 0;
  let containersStay = 0;
  for (const id of removed) {
    if (!selected.markings.has(id) && index.markings.get(id)?.locked) lockedMarkings++;
    for (const c of index.containersByParent.get(id) ?? []) {
      if (!selected.containers.has(c.id)) containersStay++;
    }
  }
  return {
    markings: removed.size,
    containers: selected.containers.size,
    arrows: arrowIds.size,
    annotations,
    lockedMarkings,
    containersStay,
    brokenRefs: countBrokenRefs(p, cascadeRemoveItems(p, selected)),
  };
}

/**
 * O item selecionado sai junto com outro item selecionado (e, por isso, a trava própria dele
 * não impede a exclusão): uma marcação de container cujo container está selecionado ou que
 * tem uma ancestral selecionada, e uma seta presa a uma marcação que sai. Marcações do canvas
 * e containers não levam ninguém.
 */
function leavesWithSelection(
  p: Project,
  item: ItemRef,
  selected: ResolvedItems,
  removedMarkings: () => ReadonlySet<string>,
): boolean {
  if (item.kind === 'image') return false;
  if (item.kind === 'arrow') {
    const arrow = selected.arrows.get(item.id);
    if (!arrow) return false;
    const removed = removedMarkings();
    return removed.has(arrow.from) || removed.has(arrow.to);
  }
  const marking = selected.markings.get(item.id);
  if (!marking || marking.containerId === null) return false;
  if (selected.containers.has(marking.containerId)) return true;
  return ancestorsOf(p, marking.id).some((a) => selected.markings.has(a.id));
}

/**
 * Excluir é permitido: há o que excluir e nenhum item selecionado trancado fica de fora da
 * cascata (a trava de um ancestral é de geometria e não impede; as marcações trancadas que
 * saem junto não bloqueiam, como em `canDeleteMarking`/`canDeleteImage`; uma selecionada e
 * trancada que sai junto com a mãe ou com o container selecionados também não; a seta
 * selecionada e trancada só impede se nenhuma das pontas sai).
 */
export function canDeleteItems(p: Project, items: readonly ItemRef[]): boolean {
  const selected = resolveItems(p, items);
  let removed: ReadonlySet<string> | null = null;
  const removedMarkings = () => (removed ??= removedMarkingIds(p, selected));
  return (
    selected.list.length > 0 &&
    selected.list.every(
      (item) =>
        leavesWithSelection(p, item, selected, removedMarkings) ||
        (item.kind === 'image'
          ? canDeleteImage(p, item.id)
          : item.kind === 'arrow'
            ? canEditArrow(p, item.id)
            : canDeleteMarking(p, item.id)),
    )
  );
}

/**
 * Exclui a seleção inteira numa operação: as marcações selecionadas (com as descendentes e as
 * anotações, como `removeMarking`), os containers selecionados (com as marcações e anotações
 * deles, como `removeContainer`) e as setas selecionadas; toda seta presa a uma marcação que sai
 * sai junto, com as anotações dela. Nunca exclui um container não selecionado: os que estavam
 * dentro de uma marcação que sai passam ao pai dela, ou a nenhum (o assentar refaz). Algum item
 * selecionado trancado que não sai junto com outro selecionado (`canDeleteItems`) falha com `locked`, sem excluir nada; itens inexistentes são ignorados.
 * Assenta uma vez, no fim (salvo `settle: false`).
 */
export function removeItems(
  p: Project,
  items: readonly ItemRef[],
  options?: SettleOptions,
): Project {
  const selected = resolveItems(p, items);
  if (selected.list.length === 0) return p;
  requireUnlocked(canDeleteItems(p, items));
  return settleIf(cascadeRemoveItems(p, selected), options);
}

// ---------------------------------------------------------------------------
// Trancar

/**
 * Tranca ou destranca todos os itens selecionados (marcações, containers e setas) numa operação.
 * Itens inexistentes são ignorados; nada a mudar devolve `p` como está.
 */
export function setItemsLocked(
  p: Project,
  items: readonly ItemRef[],
  locked: boolean,
): Project {
  const selected = resolveItems(p, items);
  const markingChanges = [...selected.markings.values()].some((m) => m.locked !== locked);
  const containerChanges = [...selected.containers.values()].some(
    (c) => c.locked !== locked,
  );
  const arrowChanges = [...selected.arrows.values()].some((a) => a.locked !== locked);
  if (!markingChanges && !containerChanges && !arrowChanges) return p;
  return {
    ...p,
    containers: containerChanges
      ? p.containers.map((c) =>
          selected.containers.has(c.id) && c.locked !== locked ? { ...c, locked } : c,
        )
      : p.containers,
    markings: markingChanges
      ? p.markings.map((m) =>
          selected.markings.has(m.id) && m.locked !== locked ? { ...m, locked } : m,
        )
      : p.markings,
    arrows: arrowChanges
      ? p.arrows.map((a) =>
          selected.arrows.has(a.id) && a.locked !== locked ? { ...a, locked } : a,
        )
      : p.arrows,
  };
}

// ---------------------------------------------------------------------------
// Envolver

function sameRect(a: Rect, b: Rect): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

/** Margem, de cada lado, entre o conjunto envolvido e a marcação pai nova. */
export const WRAP_MARGIN = MIN_MARKING_SIZE;

/** Itens que entram numa marcação pai: marcações não flutuantes e containers existentes. */
function wrappable(p: Project, items: readonly ItemRef[]) {
  const selected = resolveItems(p, items);
  const markings = [...selected.markings.values()].filter((m) => !m.floating);
  const containers = [...selected.containers.values()];
  return { selected, markings, containers };
}

/** Há ao menos um item que entra numa marcação pai (setas e notas flutuantes não entram). */
export function canWrapItems(p: Project, items: readonly ItemRef[]): boolean {
  const { markings, containers } = wrappable(p, items);
  return markings.length + containers.length > 0;
}

/**
 * Espaço e retângulo da marcação pai que envolve a seleção (PLAN.md, "Etapa — Marcação pai"):
 * o retângulo do conjunto mais `WRAP_MARGIN` de cada lado, cortado ao container (espaço de
 * container) e ao pai atual do conjunto, para a nova nunca tirá-lo de dentro dele. `null` se
 * nada entra.
 */
export function wrapRect(
  p: Project,
  items: readonly ItemRef[],
): { containerId: string | null; rect: Rect } | null {
  const plan = planWrap(p, items);
  return plan && { containerId: plan.containerId, rect: plan.rect };
}

interface WrapPlan {
  readonly containerId: string | null;
  readonly rect: Rect;
  /** Índice, em `p.markings`, do pai atual do conjunto; -1 = nenhum. */
  readonly enclosingIndex: number;
}

function planWrap(p: Project, items: readonly ItemRef[]): WrapPlan | null {
  const { selected, markings, containers } = wrappable(p, items);
  if (markings.length + containers.length === 0) return null;
  const index = projectIndex(p);

  const first = markings[0]?.containerId ?? null;
  const inContainer =
    containers.length === 0 &&
    first !== null &&
    markings.every((m) => m.containerId === first);
  const containerId = inContainer ? first : null;

  let bbox: Rect;
  if (inContainer) {
    bbox = boundingBox(markings.map((m) => m.rect)) as Rect;
  } else {
    // No canvas, a marcação de container conta pelo container inteiro: só ele pode ser
    // filho de uma marcação do canvas.
    const raw = boundingBox([
      ...markings.map((m) => {
        const own = m.containerId === null ? null : index.containers.get(m.containerId);
        return own ? imageCanvasRect(own, own.placement) : markingCanvasRectOf(p, m);
      }),
      ...containers.map((c) => imageCanvasRect(c, c.placement)),
    ]) as Rect;
    const x = Math.floor(raw.x);
    const y = Math.floor(raw.y);
    bbox = {
      x,
      y,
      width: Math.ceil(raw.x + raw.width) - x,
      height: Math.ceil(raw.y + raw.height) - y,
    };
  }

  // Pai atual: a menor marcação do mesmo espaço, fora da seleção e dos descendentes dela.
  const excluded = new Set<string>();
  for (const m of selected.markings.values()) {
    excluded.add(m.id);
    for (const d of descendantsOf(p, m.id)) excluded.add(d.id);
  }
  let enclosing: Marking | null = null;
  let enclosingIndex = -1;
  p.markings.forEach((m, i) => {
    if (m.floating || m.containerId !== containerId || excluded.has(m.id)) return;
    if (!containsRect(m.rect, bbox)) return;
    if (enclosing === null || area(m.rect) <= area(enclosing.rect)) {
      enclosing = m;
      enclosingIndex = i;
    }
  });

  let limit: Rect | null = containerId
    ? imagePixelRect(index.containers.get(containerId) as ProjectContainer)
    : null;
  if (enclosing !== null) {
    const outer = (enclosing as Marking).rect;
    if (limit === null) limit = outer;
    else {
      const x = Math.max(limit.x, outer.x);
      const y = Math.max(limit.y, outer.y);
      limit = {
        x,
        y,
        width: Math.min(limit.x + limit.width, outer.x + outer.width) - x,
        height: Math.min(limit.y + limit.height, outer.y + outer.height) - y,
      };
    }
  }

  const left = limit ? Math.max(bbox.x - WRAP_MARGIN, limit.x) : bbox.x - WRAP_MARGIN;
  const top = limit ? Math.max(bbox.y - WRAP_MARGIN, limit.y) : bbox.y - WRAP_MARGIN;
  const rightEdge = bbox.x + bbox.width + WRAP_MARGIN;
  const bottomEdge = bbox.y + bbox.height + WRAP_MARGIN;
  const rightLimited = limit ? Math.min(rightEdge, limit.x + limit.width) : rightEdge;
  const bottomLimited = limit ? Math.min(bottomEdge, limit.y + limit.height) : bottomEdge;
  return {
    containerId,
    rect: { x: left, y: top, width: rightLimited - left, height: bottomLimited - top },
    enclosingIndex,
  };
}

/**
 * Cria uma marcação pai que envolve a seleção (PLAN.md, "Etapa — Marcação pai"). Entram as
 * marcações não flutuantes e os containers; setas e notas são ignoradas, e sem nada que entre
 * falha com `invalid-parent`. O espaço e o retângulo saem de `wrapRect`. A nova entra no array
 * antes da primeira marcação selecionada (ou no fim, se só há containers) para ganhar o
 * desempate de área igual; se o retângulo coincide com o do pai atual e ele vem depois dessa
 * posição, entra logo depois dele. Quem passa a ser filho sai do assentar, nunca é escolhido
 * aqui. Nenhuma geometria existente muda, então a trava não impede.
 */
export function wrapItems(
  p: Project,
  args: { readonly id: string; readonly items: readonly ItemRef[] },
  options?: SettleOptions,
): Project {
  if (
    p.markings.some((m) => m.id === args.id) ||
    p.arrows.some((a) => a.id === args.id)
  ) {
    fail('duplicate-id', args.id);
  }
  const target = planWrap(p, args.items);
  if (!target) fail('invalid-parent');
  const { rect, containerId, enclosingIndex } = target;
  if (!isIntegerRect(rect)) fail('rect-not-integer');
  if (rect.width < MIN_MARKING_SIZE || rect.height < MIN_MARKING_SIZE) {
    fail('rect-too-small');
  }

  const { markings } = wrappable(p, args.items);
  const chosen = new Set(markings.map((m) => m.id));
  let position = p.markings.findIndex((m) => chosen.has(m.id));
  if (position < 0) position = p.markings.length;

  // Pai atual com o mesmo retângulo e depois da posição escolhida: a nova entra depois dele.
  const outer = enclosingIndex >= 0 ? p.markings[enclosingIndex] : undefined;
  if (outer && enclosingIndex >= position && sameRect(outer.rect, rect)) {
    position = enclosingIndex + 1;
  }

  const marking: Marking = {
    id: args.id,
    containerId,
    parentId: null,
    name: null,
    rect,
    needsReview: false,
    locked: false,
    floating: false,
    source: null,
  };
  const list = [...p.markings];
  list.splice(position, 0, marking);
  return settleIf({ ...p, markings: list }, options);
}

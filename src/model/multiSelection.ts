import { fail } from './errors';
import { containsRect, imageCanvasRect, rectsOverlap, translateRect } from './geometry';
import { ancestorsOf, descendantsOf } from './hierarchy';
import { settleIf, spaceOf, type SettleOptions } from './hierarchySettle';
import {
  canDeleteImage,
  canDeleteMarking,
  canEditImagePlacement,
  canEditMarkingGeometry,
  requireUnlocked,
} from './locks';
import { findById } from './project';
import { projectIndex } from './projectIndex';
import { countBrokenRefs } from './refs';
import type { Marking, Placement, Project, ProjectContainer, Rect } from './types';

// Seleção múltipla (etapa Marcações espaciais, ME2; regras no PLAN.md, "Regras do arrasto
// conjunto"). Operações puras sobre uma lista de itens: mover junto, selecionar com o
// conteúdo, excluir e trancar. A interface guarda a seleção como `{ kind, id }`; o modelo só
// conhece esta forma mínima, sem depender do estado da UI.

/** Um item da seleção: `image` = container (o nome da UI), `marking` = marcação. */
export interface ItemRef {
  readonly kind: 'image' | 'marking';
  readonly id: string;
}

/** Itens existentes da seleção, sem repetidos, na ordem em que vieram. */
interface ResolvedItems {
  readonly list: readonly ItemRef[];
  readonly markings: ReadonlyMap<string, Marking>;
  readonly containers: ReadonlyMap<string, ProjectContainer>;
}

function resolveItems(p: Project, items: readonly ItemRef[]): ResolvedItems {
  const index = projectIndex(p);
  const list: ItemRef[] = [];
  const markings = new Map<string, Marking>();
  const containers = new Map<string, ProjectContainer>();
  for (const item of items) {
    if (item.kind === 'image') {
      const container = index.containers.get(item.id);
      if (!container || containers.has(item.id)) continue;
      containers.set(item.id, container);
    } else {
      const marking = index.markings.get(item.id);
      if (!marking || markings.has(item.id)) continue;
      markings.set(item.id, marking);
    }
    list.push(item);
  }
  return { list, markings, containers };
}

// ---------------------------------------------------------------------------
// Mover

/**
 * Os itens que recebem deslocamento próprio no arrasto conjunto: descarta os inexistentes, os
 * repetidos e as marcações que já vão com outro item selecionado. Uma marcação de container
 * vai com o container selecionado dela (as coordenadas são relativas a ele) e com uma
 * ancestral selecionada (`moveMarking` dentro do container leva as descendentes). No canvas
 * nada se descarta: mover uma marcação do canvas (flutuante inclusive) não leva nada
 * (decisão 2), então ela sempre se move por conta própria. Ordem: a dos itens.
 */
export function movingItems(p: Project, items: readonly ItemRef[]): ItemRef[] {
  const selected = resolveItems(p, items);
  return selected.list.filter((item) => {
    if (item.kind === 'image') return true;
    const marking = selected.markings.get(item.id);
    if (!marking || marking.containerId === null) return true;
    if (selected.containers.has(marking.containerId)) return false;
    return !ancestorsOf(p, marking.id).some((a) => selected.markings.has(a.id));
  });
}

/** A geometria do item pode mudar (trava própria ou herdada dos ancestrais). */
function canEditItemGeometry(p: Project, item: ItemRef): boolean {
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

/** A exclusão em si, sem a trava nem o assentar: também serve para contar o impacto. */
function cascadeRemoveItems(p: Project, selected: ResolvedItems): Project {
  const markingIds = removedMarkingIds(p, selected);
  return {
    ...p,
    containers:
      selected.containers.size === 0
        ? p.containers
        : p.containers.filter((c) => !selected.containers.has(c.id)),
    markings: p.markings.filter((m) => !markingIds.has(m.id)),
    annotations: p.annotations.filter((a) => !markingIds.has(a.markingId)),
  };
}

export interface ItemsDeletionImpact {
  /** Marcações que saem: as selecionadas, as descendentes delas e as dos containers selecionados. */
  readonly markings: number;
  /** Containers selecionados, que saem. */
  readonly containers: number;
  /** Anotações que saem, as de todas as marcações que saem. */
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
 * (`canDeleteItems`) e não entra na conta. Itens inexistentes são ignorados.
 */
export function itemsDeletionImpact(
  p: Project,
  items: readonly ItemRef[],
): ItemsDeletionImpact {
  const selected = resolveItems(p, items);
  const removed = removedMarkingIds(p, selected);
  const index = projectIndex(p);
  let annotations = 0;
  for (const a of p.annotations) if (removed.has(a.markingId)) annotations++;
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
    annotations,
    lockedMarkings,
    containersStay,
    brokenRefs: countBrokenRefs(p, cascadeRemoveItems(p, selected)),
  };
}

/**
 * Excluir é permitido: há o que excluir e nenhum item selecionado está trancado (a trava de um
 * ancestral é de geometria e não impede; as marcações trancadas que saem junto não bloqueiam,
 * como em `canDeleteMarking`/`canDeleteImage`).
 */
export function canDeleteItems(p: Project, items: readonly ItemRef[]): boolean {
  const { list } = resolveItems(p, items);
  return (
    list.length > 0 &&
    list.every((item) =>
      item.kind === 'image' ? canDeleteImage(p, item.id) : canDeleteMarking(p, item.id),
    )
  );
}

/**
 * Exclui a seleção inteira numa operação: as marcações selecionadas (com as descendentes e as
 * anotações, como `removeMarking`) e os containers selecionados (com as marcações e anotações
 * deles, como `removeContainer`). Nunca exclui um container não selecionado: os que estavam
 * dentro de uma marcação que sai passam ao pai dela, ou a nenhum (o assentar refaz). Algum item
 * selecionado trancado falha com `locked`, sem excluir nada; itens inexistentes são ignorados.
 * Assenta uma vez, no fim (salvo `settle: false`).
 */
export function removeItems(
  p: Project,
  items: readonly ItemRef[],
  options?: SettleOptions,
): Project {
  const selected = resolveItems(p, items);
  if (selected.list.length === 0) return p;
  for (const item of selected.list) {
    requireUnlocked(
      item.kind === 'image' ? canDeleteImage(p, item.id) : canDeleteMarking(p, item.id),
    );
  }
  return settleIf(cascadeRemoveItems(p, selected), options);
}

// ---------------------------------------------------------------------------
// Trancar

/**
 * Tranca ou destranca todos os itens selecionados (marcações e containers) numa operação.
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
  if (!markingChanges && !containerChanges) return p;
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
  };
}

import {
  IDENTITY_PLACEMENT,
  area,
  containsRect,
  containsRectApprox,
  fromCanvasRect,
  imageCanvasRect,
  imagePixelRect,
  toCanvasRect,
  type Size,
} from './geometry';
import { projectIndex } from './projectIndex';
import type { Marking, Placement, Project, ProjectContainer, Rect } from './types';

// Pertencimento por geometria (etapa Marcações espaciais, ME1; regras no PLAN.md, "Regras de
// contenção"). Quem contém quem é decidido pela ferramenta e gravado no JSON: o agente lê
// `parentId` (da marcação e do container) e nunca calcula interseções. "Dentro" é sempre
// totalmente contido; a tolerância fica na interação (`src/canvas/`), nunca aqui.

/**
 * Opções das operações que mexem na geometria. `settle: false` só nas prévias de gesto
 * (pertencimento congelado enquanto o ponteiro se move); toda outra chamada assenta.
 * `minSizeOf` dá o tamanho mínimo do componente que desenha a marcação (o modelo não conhece
 * componentes): vale ao converter o `rect` para outro espaço.
 */
export interface SettleOptions {
  readonly settle?: boolean;
  readonly minSizeOf?: (markingId: string) => Size | null;
}

/** Espaço de coordenadas de uma marcação: o container dela ou o canvas. */
export interface Space {
  /** `null` = o canvas. */
  readonly containerId: string | null;
  /** Do container, ou identidade no canvas. */
  readonly placement: Placement;
  /** Retângulo do container em pixels dele; `null` no canvas (sem limite). */
  readonly bounds: Rect | null;
}

export const CANVAS_SPACE: Space = {
  containerId: null,
  placement: IDENTITY_PLACEMENT,
  bounds: null,
};

/** Espaço do container. */
export function containerSpace(container: ProjectContainer): Space {
  return {
    containerId: container.id,
    placement: container.placement,
    bounds: imagePixelRect(container),
  };
}

/**
 * Espaço da marcação. Uma marcação de container inexistente (projeto inválido) cai no canvas,
 * para quem desenha não quebrar; o reparo é quem a resolve.
 */
export function spaceOf(p: Project, marking: Pick<Marking, 'containerId'>): Space {
  if (marking.containerId === null) return CANVAS_SPACE;
  const container = projectIndex(p).containers.get(marking.containerId);
  return container ? containerSpace(container) : CANVAS_SPACE;
}

/** Retângulo da marcação em unidades do canvas (decimal na marcação de container). */
export function markingCanvasRectOf(p: Project, marking: Marking): Rect {
  return toCanvasRect(spaceOf(p, marking).placement, marking.rect);
}

/**
 * O container que contém inteiro o retângulo `canvas` (unidades do canvas). Como os
 * containers não se sobrepõem, há no máximo um; `null` = nenhum (o espaço é o canvas).
 */
export function containerContaining(p: Project, canvas: Rect): ProjectContainer | null {
  for (const c of p.containers) {
    if (containsRectApprox(imageCanvasRect(c, c.placement), canvas)) return c;
  }
  return null;
}

/**
 * Pode `outer` (índice `io`) ser o pai de `inner` (índice `ii`)? Contém e é maior, ou é igual
 * e vem antes no array. Uma ordem estrita: nunca há ciclo.
 */
function canContain(outer: Rect, io: number, inner: Rect, ii: number): boolean {
  if (!containsRect(outer, inner)) return false;
  const ao = area(outer);
  const ai = area(inner);
  return ao > ai || (ao === ai && io < ii);
}

/** O espaço e o `rect` que a geometria dá à marcação; ela mesma se nada muda. */
function settleSpace(
  p: Project,
  m: Marking,
  options: SettleOptions | undefined,
): Marking {
  let canvas: Rect;
  if (m.containerId === null) {
    canvas = m.rect;
  } else {
    const own = projectIndex(p).containers.get(m.containerId);
    // Container inexistente: projeto inválido; o reparo resolve, o assentar não inventa.
    if (!own) return m;
    if (!m.floating && containsRect(imagePixelRect(own), m.rect)) return m;
    canvas = toCanvasRect(own.placement, m.rect);
  }
  const target = m.floating ? null : containerContaining(p, canvas);
  if (target === null && m.containerId === null) return m;
  const min = options?.minSizeOf?.(m.id) ?? null;
  const space = target ? containerSpace(target) : CANVAS_SPACE;
  return {
    ...m,
    containerId: space.containerId,
    rect: fromCanvasRect(space.placement, canvas, space.bounds, min),
  };
}

/**
 * Assenta o pertencimento: para cada marcação não flutuante decide o espaço (o container que
 * contém inteiro o retângulo dela no canvas, senão o canvas) e, se mudou, converte o `rect`;
 * a flutuante vai sempre para o canvas. Depois recalcula o `parentId` de toda marcação (a
 * menor do mesmo espaço que a contém; empate de área: a que vem antes no array é a de fora)
 * e de todo container (a menor marcação do canvas que contém o retângulo dele), com as
 * flutuantes fora da relação nos dois sentidos. Não muda a ordem dos arrays. As setas não
 * entram na relação; só perdem os `points` quando uma das pontas troca de espaço. Determinística
 * e idempotente: nada a mudar devolve `p` como está (o mesmo objeto).
 */
export function settleHierarchy(p: Project, options?: SettleOptions): Project {
  let changed = false;
  // Marcações que trocaram de espaço: a seta presa a elas perde os pontos de passagem.
  const movedSpace = new Set<string>();
  const placed = p.markings.map((m) => {
    const next = settleSpace(p, m, options);
    if (next !== m) {
      changed = true;
      if (next.containerId !== m.containerId) movedSpace.add(m.id);
    }
    return next;
  });

  // Marcações por espaço, com o índice no array (o desempate da área).
  const bySpace = new Map<string | null, { m: Marking; i: number }[]>();
  placed.forEach((m, i) => {
    if (m.floating) return;
    const group = bySpace.get(m.containerId);
    if (group) group.push({ m, i });
    else bySpace.set(m.containerId, [{ m, i }]);
  });

  const parentOf = (
    rect: Rect,
    index: number,
    group: readonly { m: Marking; i: number }[],
  ) => {
    let best: { m: Marking; i: number } | null = null;
    for (const candidate of group) {
      if (
        candidate.i === index ||
        !canContain(candidate.m.rect, candidate.i, rect, index)
      )
        continue;
      if (
        best === null ||
        area(candidate.m.rect) < area(best.m.rect) ||
        (area(candidate.m.rect) === area(best.m.rect) && candidate.i > best.i)
      ) {
        best = candidate;
      }
    }
    return best?.m.id ?? null;
  };

  const markings = placed.map((m, i) => {
    const parentId = m.floating
      ? null
      : parentOf(m.rect, i, bySpace.get(m.containerId) ?? []);
    if (parentId === m.parentId) return m;
    changed = true;
    return { ...m, parentId };
  });

  // Pai de um container: a menor marcação do canvas (não flutuante) que contém o retângulo dele.
  const canvasGroup = bySpace.get(null) ?? [];
  const containers = p.containers.map((c) => {
    const rect = imageCanvasRect(c, c.placement);
    let best: { m: Marking; i: number } | null = null;
    for (const candidate of canvasGroup) {
      if (!containsRectApprox(candidate.m.rect, rect)) continue;
      if (
        best === null ||
        area(candidate.m.rect) < area(best.m.rect) ||
        (area(candidate.m.rect) === area(best.m.rect) && candidate.i > best.i)
      ) {
        best = candidate;
      }
    }
    const parentId = best?.m.id ?? null;
    if (parentId === c.parentId) return c;
    changed = true;
    return { ...c, parentId };
  });

  // Seta (v13): fora da árvore de pertencimento, o assentar a ignora, salvo numa coisa: se uma
  // ponta mudou de espaço, os `points` (que ficam no espaço das pontas) voltam à rota padrão.
  return changed ? clearArrowRoutes({ ...p, markings, containers }, movedSpace) : p;
}

/**
 * Apaga os pontos de passagem das setas presas a alguma das marcações de `markingIds`, que
 * trocaram de espaço (decisão (d): os `points` ficam no espaço das duas pontas, e a conversão
 * da rota não existe; a seta volta ao padrão borda a borda). Sem nada a apagar devolve `p`.
 */
export function clearArrowRoutes(p: Project, markingIds: ReadonlySet<string>): Project {
  if (markingIds.size === 0) return p;
  let cleared = false;
  const arrows = p.arrows.map((a) => {
    if (a.points.length === 0 || !(markingIds.has(a.from) || markingIds.has(a.to))) {
      return a;
    }
    cleared = true;
    return { ...a, points: [] };
  });
  return cleared ? { ...p, arrows } : p;
}

/** Assenta, a menos que a operação seja uma prévia de gesto (`settle: false`). */
export function settleIf(p: Project, options?: SettleOptions): Project {
  return options?.settle === false ? p : settleHierarchy(p, options);
}

/** Membros de uma marcação: as marcações e os containers cujo pai é ela, na ordem dos arrays. */
export function membersOf(
  p: Project,
  markingId: string,
): {
  readonly markings: readonly Marking[];
  readonly containers: readonly ProjectContainer[];
} {
  const index = projectIndex(p);
  return {
    markings: index.children.get(markingId) ?? [],
    containers: index.containersByParent.get(markingId) ?? [],
  };
}

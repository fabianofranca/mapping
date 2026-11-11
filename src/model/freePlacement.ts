import { isFreeRect, nearestFreeSpotIn } from './containers';
import { containsRect, imageCanvasRect, imagePixelRect, rectsOverlap } from './geometry';
import { enclosingAmong } from './hierarchySettle';
import { projectIndex } from './projectIndex';
import type { Marking, Project, Rect } from './types';

// Colocação de uma peça nova em espaço livre (etapa #1087, decisões 3 a 5): o nível onde ela fica
// (o pai da colocação), a área em que cabe e os obstáculos que não pode cobrir nem coincidir.
// Funções puras, sem DOM; quem escolhe o pai gravado continua sendo o assentar, pela geometria.

/** Onde uma peça nova pode nascer: o pai da colocação, a área em que cabe e o que a barra. */
export interface PlacementLevel {
  /** A menor marcação do espaço que contém o retângulo pedido (e é diferente dele); `null` = a raiz. */
  readonly parent: Marking | null;
  /** O retângulo de `parent`, a imagem ou, no canvas sem `parent`, nenhuma (`null`: sem limite). */
  readonly area: Rect | null;
  /** Toda marcação não flutuante que cruza `area`, menos o pai e os ancestrais; no canvas, também os containers. */
  readonly obstacles: readonly Rect[];
}

const sameRect = (a: Rect, b: Rect): boolean =>
  a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;

/**
 * O pai da colocação: a menor marcação não flutuante de `containerId` que contém `rect` e **não é
 * igual a ele** (retângulo igual é irmã, não pai). Na cadeia de retângulos iguais, a de dentro
 * (a que o assentar escolhe, `enclosingAmong`).
 */
function levelParent(p: Project, containerId: string | null, rect: Rect): Marking | null {
  const candidates = new Set<string>();
  for (const m of p.markings) {
    if (m.floating || m.containerId !== containerId) continue;
    if (containsRect(m.rect, rect) && !sameRect(m.rect, rect)) candidates.add(m.id);
  }
  if (candidates.size === 0) return null;
  const id = enclosingAmong(p, containerId, candidates, null);
  return id === null ? null : (projectIndex(p).markings.get(id) ?? null);
}

/** O marcação e os ancestrais dela (pela cadeia de `parentId`, com guarda contra ciclo). */
function lineage(p: Project, marking: Marking): Set<string> {
  const byId = projectIndex(p).markings;
  const ids = new Set<string>();
  let current: Marking | undefined = marking;
  while (current !== undefined && !ids.has(current.id)) {
    ids.add(current.id);
    current = current.parentId === null ? undefined : byId.get(current.parentId);
  }
  return ids;
}

function levelArea(p: Project, containerId: string | null, parent: Marking | null) {
  if (parent !== null) return parent.rect;
  const image =
    containerId === null ? undefined : projectIndex(p).containers.get(containerId);
  return image === undefined ? null : imagePixelRect(image);
}

function levelObstacles(
  p: Project,
  containerId: string | null,
  area: Rect | null,
  excluded: ReadonlySet<string>,
): Rect[] {
  const crosses = (r: Rect): boolean => area === null || rectsOverlap(r, area);
  const obstacles: Rect[] = [];
  for (const m of p.markings) {
    if (m.floating || m.containerId !== containerId || excluded.has(m.id)) continue;
    if (crosses(m.rect)) obstacles.push(m.rect);
  }
  if (containerId === null) {
    for (const c of p.containers) {
      const canvas = imageCanvasRect(c, c.placement);
      if (crosses(canvas)) obstacles.push(canvas);
    }
  }
  return obstacles;
}

/**
 * O nível da colocação de `rect` (o R0) no espaço `containerId` (`null` = canvas). Com `target`
 * (componente com slot), o nível é o do alvo e a área é a caixa do slot.
 */
export function placementLevel(
  p: Project,
  containerId: string | null,
  rect: Rect,
  target?: { readonly parent: Marking; readonly area: Rect },
): PlacementLevel {
  const parent = target?.parent ?? levelParent(p, containerId, rect);
  const area = target?.area ?? levelArea(p, containerId, parent);
  const excluded = parent === null ? new Set<string>() : lineage(p, parent);
  return { parent, area, obstacles: levelObstacles(p, containerId, area, excluded) };
}

/** O retângulo ficou livre no nível (cabe na área e não se sobrepõe a obstáculo)? */
export function isFreeInLevel(level: PlacementLevel, rect: Rect): boolean {
  return isFreeRect(rect, level.obstacles, level.area);
}

/**
 * `rect` (R0) se já está livre; senão o lugar livre mais perto dele no mesmo tamanho; `null` se
 * não há nenhum na área (quem chama volta à posição de antes, sem erro).
 */
export function freeRectIn(level: PlacementLevel, rect: Rect): Rect | null {
  if (isFreeInLevel(level, rect)) return rect;
  const spot = nearestFreeSpotIn(
    level.obstacles,
    rect.width,
    rect.height,
    rect,
    level.area,
  );
  return spot === null ? null : { ...spot, width: rect.width, height: rect.height };
}

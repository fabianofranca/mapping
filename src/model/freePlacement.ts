import { isFreeRect, nearestFreeSpotIn } from './containers';
import {
  containsRect,
  imageCanvasRect,
  imagePixelRect,
  rectsOverlap,
  sameRect,
} from './geometry';
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

/** Ids das marcações não flutuantes de `containerId` que contêm `rect` e não são iguais a ele. */
function containingIds(p: Project, containerId: string | null, rect: Rect): Set<string> {
  const ids = new Set<string>();
  for (const m of p.markings) {
    if (m.floating || m.containerId !== containerId) continue;
    if (containsRect(m.rect, rect) && !sameRect(m.rect, rect)) ids.add(m.id);
  }
  return ids;
}

/**
 * O pai da colocação: a menor marcação não flutuante de `containerId` que contém `rect` e **não é
 * igual a ele** (retângulo igual é irmã, não pai). Na cadeia de retângulos iguais, a de dentro
 * (a que o assentar escolhe, `enclosingAmong`).
 */
function levelParent(p: Project, containerId: string | null, rect: Rect): Marking | null {
  const candidates = containingIds(p, containerId, rect);
  // Uma candidata só é o pai sem ordenar o espaço (o posto só desempata entre várias).
  const [only] = candidates;
  const id =
    candidates.size === 1 && only !== undefined
      ? only
      : enclosingAmong(p, containerId, candidates, null);
  return id === null ? null : (projectIndex(p).markings.get(id) ?? null);
}

/** A marcação e os ancestrais dela (pela cadeia de `parentId`, com guarda contra ciclo). */
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

function overlapArea(a: Rect, b: Rect): number {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

/** Posições candidatas de `rect` na área, de meio em meio tamanho (mais a de `rect` preso à área). */
function crowdedCandidates(area: Rect, rect: Rect): Rect[] {
  const maxX = area.x + area.width - rect.width;
  const maxY = area.y + area.height - rect.height;
  const stepX = Math.max(1, Math.floor(rect.width / 2));
  const stepY = Math.max(1, Math.floor(rect.height / 2));
  const xs = new Set<number>([Math.min(Math.max(rect.x, area.x), maxX)]);
  const ys = new Set<number>([Math.min(Math.max(rect.y, area.y), maxY)]);
  for (let x = area.x; x <= maxX; x += stepX) xs.add(x);
  for (let y = area.y; y <= maxY; y += stepY) ys.add(y);
  const out: Rect[] = [];
  for (const x of xs) for (const y of ys) out.push({ ...rect, x, y });
  return out;
}

/** Todas as candidatas coincidem com alguma peça: desloca `rect` um pixel por vez na diagonal até nenhuma o conter. */
function nudgedOut(obstacles: readonly Rect[], area: Rect, rect: Rect): Rect {
  const maxX = area.x + area.width - rect.width;
  const maxY = area.y + area.height - rect.height;
  for (let k = 1; k <= 64; k += 1) {
    const cand = {
      ...rect,
      x: Math.min(rect.x + k, maxX),
      y: Math.min(rect.y + k, maxY),
    };
    if (!obstacles.some((o) => containsRect(o, cand))) return cand;
  }
  return rect;
}

function bestCrowded(level: PlacementLevel, area: Rect, rect: Rect): Rect | null {
  let best: { rect: Rect; cost: number; dist: number } | null = null;
  for (const cand of crowdedCandidates(area, rect)) {
    if (level.obstacles.some((o) => containsRect(o, cand))) continue;
    const cost = level.obstacles.reduce((sum, o) => sum + overlapArea(o, cand), 0);
    const dist = Math.abs(cand.x - rect.x) + Math.abs(cand.y - rect.y);
    const better =
      best === null || cost < best.cost || (cost === best.cost && dist < best.dist);
    if (better) best = { rect: cand, cost, dist };
  }
  return best?.rect ?? null;
}

/**
 * Sem lugar livre na área (a peça vai ficar sobre outras): a posição que cobre menos as outras e,
 * principalmente, que nenhuma delas contém nem iguala (senão o assentar a faria filha da irmã e
 * não do nível). Empate: a mais perto de `rect`. Se nenhuma a contém, ou sem área, `rect`.
 */
export function crowdedRectIn(level: PlacementLevel, rect: Rect): Rect {
  const { area } = level;
  if (!level.obstacles.some((o) => containsRect(o, rect))) return rect;
  if (area === null || rect.width > area.width || rect.height > area.height) return rect;
  return bestCrowded(level, area, rect) ?? nudgedOut(level.obstacles, area, rect);
}

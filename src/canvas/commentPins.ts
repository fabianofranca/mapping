// Pinos das conversas no canvas (etapa Comentários, CM4, decisão 24): onde cada grupo de pinos fica,
// o tamanho da caixa e o acerto do clique. Função pura sobre o projeto desenhado e os grupos do
// estado derivado (`derived.threads.pins`), no molde de `reviewMarks.ts`; o renderer só desenha. Pan e
// zoom não passam por aqui: a posição é do projeto, e o tamanho (em pixels de tela) entra só em
// `pinBox`, na hora de desenhar e de tocar.
import {
  imageCanvasRect,
  markingCanvasRectOf,
  projectIndex,
  type MarkingVisibility,
  type PinGroup,
  type Project,
  type Rect,
} from '../model';
import { visibleArrowShapes } from './arrowGeometry';
import type { Point } from './viewport';

/** Altura do pino (px de tela). */
export const PIN_HEIGHT = 20;
/** Largura de cada caractere do rótulo e respiro dos lados (px de tela), para a largura da caixa. */
const PIN_CHAR = 7;
const PIN_PAD = 8;
/** Glifo do estado à esquerda do rótulo (px de tela): o lado dele e a folga até o rótulo. */
export const PIN_GLYPH_SIZE = 12;
const PIN_GLYPH_GAP = 2;
/** O que o glifo acrescenta à largura do pino. */
export const PIN_GLYPH_EXTRA = PIN_GLYPH_SIZE + PIN_GLYPH_GAP;

/** `corner`: o pino fica fora do item, com o canto de baixo à esquerda no canto de cima à direita. */
export type PinAlign = 'corner' | 'center';

/** Um pino a desenhar: o grupo, o ponto de referência (canvas) e como a caixa se alinha a ele. */
export interface PinPlace {
  readonly key: string;
  readonly group: PinGroup;
  readonly origin: Point;
  readonly align: PinAlign;
}

/**
 * Largura do pino (px de tela): cresce com o rótulo e, quando há, com o glifo do estado (o rascunho
 * não tem: `glyph` falso), nunca menos que a altura.
 */
export function pinWidth(label: string, glyph = true): number {
  const extra = glyph ? PIN_GLYPH_EXTRA : 0;
  return Math.max(PIN_HEIGHT, label.length * PIN_CHAR + 2 * PIN_PAD + extra);
}

/** O ponto `x`,`y` de um container (pixels dele) ou do canvas (`containerId` nulo), em unidades do canvas. */
export function pointCanvas(
  project: Project,
  containerId: string | null,
  x: number,
  y: number,
): Point | null {
  if (containerId === null) return { x, y };
  const container = projectIndex(project).containers.get(containerId);
  if (!container) return null;
  const { placement } = container;
  return { x: placement.x + x * placement.scale, y: placement.y + y * placement.scale };
}

function topRight(rect: Rect): Point {
  return { x: rect.x + rect.width, y: rect.y };
}

type Host = PinGroup['host'];

/**
 * Onde o pino de um ponto fica. Um ponto do canvas não é de nenhuma raiz: só a Principal o tem
 * (decisão 15). O de um container segue o container, que a vista já traz (ou não).
 */
function pointPlace(
  project: Project,
  host: Extract<Host, { kind: 'point' }>,
  principal: boolean,
): Pick<PinPlace, 'origin' | 'align'> | null {
  if (host.containerId === null && !principal) return null;
  const origin = pointCanvas(project, host.containerId, host.x, host.y);
  return origin ? { origin, align: 'center' } : null;
}

/** Onde o pino de `host` fica: o ponto e o alinhamento; `null` se o item não está à vista. */
function placeOf(
  project: Project,
  host: Host,
  visibility: ReadonlyMap<string, MarkingVisibility>,
  arrowLabels: ReadonlyMap<string, Point>,
  principal: boolean,
): Pick<PinPlace, 'origin' | 'align'> | null {
  const index = projectIndex(project);
  switch (host.kind) {
    case 'marking': {
      const marking = index.markings.get(host.id);
      if (!marking || visibility.get(host.id) === 'hidden') return null;
      return { origin: topRight(markingCanvasRectOf(project, marking)), align: 'corner' };
    }
    case 'container': {
      const container = index.containers.get(host.id);
      if (!container) return null;
      return {
        origin: topRight(imageCanvasRect(container, container.placement)),
        align: 'corner',
      };
    }
    case 'arrow': {
      const label = arrowLabels.get(host.id);
      return label ? { origin: label, align: 'center' } : null;
    }
    case 'point':
      return pointPlace(project, host, principal);
  }
}

/**
 * Os pinos do quadro, na ordem dos grupos. Uma marcação escondida, uma seta sem as duas pontas à
 * vista e um item que sumiu não têm pino. `principal`: `false` com uma perspectiva aberta, onde a
 * conversa num ponto do canvas (fora de container) não aparece; o padrão é a Principal.
 */
export function pinPlaces(
  project: Project,
  groups: readonly PinGroup[],
  visibility: ReadonlyMap<string, MarkingVisibility>,
  principal = true,
): readonly PinPlace[] {
  if (groups.length === 0) return [];
  const arrowLabels = new Map<string, Point>();
  if (groups.some((g) => g.host.kind === 'arrow')) {
    for (const shape of visibleArrowShapes(project, visibility)) {
      arrowLabels.set(shape.arrow.id, shape.label);
    }
  }
  const places: PinPlace[] = [];
  for (const group of groups) {
    const place = placeOf(project, group.host, visibility, arrowLabels, principal);
    if (place) places.push({ key: group.hostKey, group, ...place });
  }
  return places;
}

/** A caixa do pino em unidades do canvas, com o tamanho fixo em pixels de tela (`zoom`). */
export function pinBox(place: PinPlace, zoom: number): Rect {
  const width = pinWidth(place.group.label) / zoom;
  const height = PIN_HEIGHT / zoom;
  return place.align === 'corner'
    ? { x: place.origin.x, y: place.origin.y - height, width, height }
    : { x: place.origin.x - width / 2, y: place.origin.y - height / 2, width, height };
}

/** O pino sob `c` (canvas); o último desenhado ganha. */
export function pinHit(
  places: readonly PinPlace[],
  c: Point,
  zoom: number,
): PinPlace | null {
  for (let i = places.length - 1; i >= 0; i--) {
    const place = places[i];
    if (!place) continue;
    const box = pinBox(place, zoom);
    if (
      c.x >= box.x &&
      c.x <= box.x + box.width &&
      c.y >= box.y &&
      c.y <= box.y + box.height
    ) {
      return place;
    }
  }
  return null;
}

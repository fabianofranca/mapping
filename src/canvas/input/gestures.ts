// Gestos de arrasto em andamento e como cada intenção começa um. Sem DOM nem
// Konva: o `PointerInput` guarda o gesto e o alimenta com os eventos.
import {
  ancestorsOf,
  arrowPointsSpace,
  canEditArrow,
  canMoveItems,
  markingCanvasRectOf,
  projectIndex,
  spaceOf,
  type ArrowEnd,
  type ArrowPoint,
  type ArrowSide,
  type Placement,
  type Project,
  type ProjectContainer,
  type Rect,
} from '../../model';
import { existingItems, type SelectionItem } from '../../store/ui';
import { arrowShape, elbowLanePoints, type ArrowShape } from '../arrowGeometry';
import { absorbCandidates, type AbsorbCandidate } from '../containment';
import type { Draft } from '../frame';
import type { Corner } from '../imageGeometry';
import { canvasToImagePixel, rectFromPoints, type RectLimits } from '../markingGeometry';
import type { Point } from '../viewport';
import type { Intent } from './intents';

export type Gesture =
  /** Ponteiro pressionado, ainda sem passar do limiar de arrasto (pode ser um clique). */
  | {
      readonly kind: 'pending';
      readonly pointerId: number;
      readonly start: Point;
      /** O que o arrasto faria. */
      intent: Intent;
    }
  | { readonly kind: 'pan'; readonly pointerId: number; last: Point }
  | {
      readonly kind: 'move-image';
      readonly pointerId: number;
      readonly containerId: string;
      readonly startCanvas: Point;
      readonly startPlacement: Placement;
    }
  | {
      readonly kind: 'resize-image';
      readonly pointerId: number;
      readonly containerId: string;
      readonly corner: Corner;
      readonly startPlacement: Placement;
    }
  | {
      readonly kind: 'move-marking';
      readonly pointerId: number;
      readonly markingId: string;
      readonly startCanvas: Point;
      /** Escala do espaço da marcação: converte o deslocamento do canvas em unidades dele. */
      readonly scale: number;
      /** Último deslocamento mostrado na prévia (unidades do espaço da marcação, inteiras). */
      dx: number;
      dy: number;
    }
  /**
   * Arrasto conjunto (ME2): a seleção inteira se move junto. `dx`, `dy` guardam o último
   * deslocamento **válido** da prévia (unidades do canvas, sem arredondar): quando um movimento é
   * recusado (tudo ou nada), a prévia fica nele e é ele que o soltar grava.
   */
  | {
      readonly kind: 'move-items';
      readonly pointerId: number;
      readonly items: readonly SelectionItem[];
      readonly startCanvas: Point;
      dx: number;
      dy: number;
    }
  | {
      readonly kind: 'resize-marking';
      readonly pointerId: number;
      readonly markingId: string;
      readonly corner: Corner;
      /** Posição do espaço da marcação: a do container ou a identidade, no canvas. */
      readonly placement: Placement;
      readonly startRect: Rect;
      readonly limits: RectLimits;
      /** Itens do espaço que o redimensionamento pode absorver ao soltar. */
      readonly candidates: readonly AbsorbCandidate[];
    }
  | {
      readonly kind: 'draw';
      readonly pointerId: number;
      /** Container em que o desenho começou; `null` = no vazio, desenho no canvas. */
      readonly image: ProjectContainer | null;
      /** Onde começou, no espaço do desenho (pixels da imagem ou unidades do canvas). */
      readonly startPixel: Point;
      /** Itens do espaço que o desenho pode absorver ao soltar. */
      readonly candidates: readonly AbsorbCandidate[];
    }
  /**
   * Criar uma seta puxando a alça de ligação da marcação `markingId` (ME4): sem gesto do store; a
   * seta provisória e o destino ficam em `state.arrowDraft`, e soltar sobre uma marcação cria a
   * seta (`addArrow`).
   */
  | {
      readonly kind: 'arrow-link';
      readonly pointerId: number;
      readonly markingId: string;
      /** Onde a seta provisória sai (canvas): o meio do lado direito da marcação. */
      readonly origin: Point;
    }
  /**
   * Mover um ponto de passagem (`mode` `point`, `index` em `points`) ou criar um no meio de um
   * trecho (`mode` `mid`, `index` = onde entra), no espaço dos pontos (`placement`). No `elbow`,
   * mover em paralelo um segmento do meio (`mode` `segment`, `index` = a pista, `axis` = a
   * coordenada do ponto que o ponteiro muda; `base` já traz um ponto por pista).
   */
  | {
      readonly kind: 'arrow-route';
      readonly pointerId: number;
      readonly arrowId: string;
      readonly mode: 'point' | 'mid' | 'segment';
      readonly index: number;
      /** Só no `segment`: a coordenada do espaço dos pontos que o ponteiro muda. */
      readonly axis: 'x' | 'y' | null;
      /** Os pontos de passagem de antes do gesto. */
      readonly base: readonly ArrowPoint[];
      /** Posição do espaço dos pontos: a do container ou a identidade, no canvas. */
      readonly placement: Placement;
    }
  /**
   * Arrastar uma ponta da seta até outra marcação (troca `from`/`to`) ou, sobre a mesma, até outro
   * lado (troca `fromSide`/`toSide`). `valid` diz se o ponteiro está sobre um destino (soltar fora
   * cancela).
   */
  | {
      readonly kind: 'arrow-end';
      readonly pointerId: number;
      readonly arrowId: string;
      readonly end: ArrowEnd;
      /** A marcação da outra ponta: não pode ser o destino. */
      readonly fixed: string;
      /** Onde a outra ponta prende (canvas): a seta provisória sai dali. */
      readonly fixedAnchor: Point;
      /** A marcação e o lado que a ponta tinha (`side` nulo = automático). */
      readonly original: { readonly markingId: string; readonly side: ArrowSide | null };
      /** O lado em que a ponta prende hoje (o efetivo, mesmo com o lado automático). */
      readonly currentSide: ArrowSide;
      valid: boolean;
    }
  /** Arrasto do mouse sobre o item trancado: não faz nada até soltar (cursor "não permitido"). */
  | { readonly kind: 'blocked'; readonly pointerId: number }
  /** Dois dedos. Termina quando todos saem da tela. */
  | { readonly kind: 'pinch' };

/** Gestos que usam `beginGesture/commitGesture` do store. */
export type StoreGesture = Extract<
  Gesture,
  {
    kind:
      | 'move-image'
      | 'resize-image'
      | 'move-marking'
      | 'move-items'
      | 'resize-marking'
      | 'arrow-route'
      | 'arrow-end';
  }
>;

export function isStoreGesture(g: Gesture | null): g is StoreGesture {
  return (
    g?.kind === 'move-image' ||
    g?.kind === 'resize-image' ||
    g?.kind === 'move-marking' ||
    g?.kind === 'move-items' ||
    g?.kind === 'resize-marking' ||
    g?.kind === 'arrow-route' ||
    g?.kind === 'arrow-end'
  );
}

/** Gesto começado e, no modo Desenhar, o rascunho inicial. */
export interface StartedGesture {
  readonly gesture: Gesture;
  readonly draft: Draft | null;
}

/**
 * Começa o gesto da intenção, com o ponteiro em `startCanvas`. `null` se ela
 * não se aplica mais (item removido, edição bloqueada): o arrasto vira pan.
 * `beginGesture` abre o gesto no store (uma entrada no desfazer ao soltar).
 */
export function startGesture(
  project: Project | null,
  pointerId: number,
  startCanvas: Point,
  intent: Intent,
  beginGesture: () => boolean,
): StartedGesture | null {
  if (!project || intent.kind === 'pan') return null;
  if (intent.kind === 'locked') {
    return { gesture: { kind: 'blocked', pointerId }, draft: null };
  }
  const index = projectIndex(project);

  if (intent.kind === 'draw') {
    const image =
      intent.containerId === null
        ? null
        : (index.containers.get(intent.containerId) ?? null);
    if (intent.containerId !== null && !image) return null;
    const startPixel = image
      ? canvasToImagePixel(image.placement, startCanvas)
      : startCanvas;
    return {
      gesture: {
        kind: 'draw',
        pointerId,
        image,
        startPixel,
        candidates: absorbCandidates(project, image?.id ?? null, new Set()),
      },
      draft: {
        containerId: image?.id ?? null,
        rect: rectFromPoints(startPixel, startPixel, image),
      },
    };
  }

  if (intent.kind === 'arrow-link') {
    const origin = index.markings.get(intent.markingId);
    if (!origin) return null;
    const rect = markingCanvasRectOf(project, origin);
    return {
      gesture: {
        kind: 'arrow-link',
        pointerId,
        markingId: origin.id,
        origin: { x: rect.x + rect.width, y: rect.y + rect.height / 2 },
      },
      draft: null,
    };
  }

  if (intent.kind === 'arrow-handle') {
    const arrow = index.arrows.get(intent.arrowId);
    if (!arrow || !canEditArrow(project, arrow.id)) return null;
    const { handle } = intent;
    if (handle.kind === 'end') {
      const shape = arrowShape(project, arrow);
      if (!shape || !beginGesture()) return null;
      return { gesture: arrowEndGesture(pointerId, shape, handle.end), draft: null };
    }
    const { placement } = arrowPointsSpace(project, arrow);
    if (handle.kind === 'segment') {
      const shape = arrowShape(project, arrow);
      if (!shape || !beginGesture()) return null;
      return {
        gesture: {
          kind: 'arrow-route',
          pointerId,
          arrowId: arrow.id,
          mode: 'segment',
          index: handle.index,
          axis: handle.axis,
          base: elbowLanePoints(shape, placement),
          placement,
        },
        draft: null,
      };
    }
    if (!beginGesture()) return null;
    return {
      gesture: {
        kind: 'arrow-route',
        pointerId,
        arrowId: arrow.id,
        mode: handle.kind,
        index: handle.index,
        axis: null,
        base: arrow.points,
        placement,
      },
      draft: null,
    };
  }

  if (intent.kind === 'move-items') {
    // Os itens que sumiram desde o toque (desfazer) ficam de fora; sem nada a mover, pan.
    const items = existingItems(project, intent.items);
    if (!canMoveItems(project, items) || !beginGesture()) return null;
    return {
      gesture: { kind: 'move-items', pointerId, items, startCanvas, dx: 0, dy: 0 },
      draft: null,
    };
  }

  if (intent.kind === 'move-image' || intent.kind === 'resize-image') {
    const image = index.containers.get(intent.containerId);
    if (!image || !beginGesture()) return null;
    const gesture: Gesture =
      intent.kind === 'move-image'
        ? {
            kind: 'move-image',
            pointerId,
            containerId: image.id,
            startCanvas,
            startPlacement: image.placement,
          }
        : {
            kind: 'resize-image',
            pointerId,
            containerId: image.id,
            corner: intent.corner,
            startPlacement: image.placement,
          };
    return { gesture, draft: null };
  }

  if (intent.kind !== 'move-marking' && intent.kind !== 'resize-marking') return null;
  const marking = index.markings.get(intent.markingId);
  if (!marking) return null;
  if (marking.containerId !== null && !index.containers.has(marking.containerId)) {
    return null;
  }
  const space = spaceOf(project, marking);
  if (!beginGesture()) return null;
  const gesture: Gesture =
    intent.kind === 'move-marking'
      ? {
          kind: 'move-marking',
          pointerId,
          markingId: marking.id,
          startCanvas,
          scale: space.placement.scale,
          dx: 0,
          dy: 0,
        }
      : {
          kind: 'resize-marking',
          pointerId,
          markingId: marking.id,
          corner: intent.corner,
          placement: space.placement,
          startRect: marking.rect,
          limits: { outer: space.bounds },
          // Absorve o que cruza o retângulo, menos ela mesma e os ancestrais (que a contêm). A
          // flutuante não absorve nada: fica fora da árvore de pertencimento nos dois sentidos.
          candidates: marking.floating
            ? []
            : absorbCandidates(
                project,
                marking.containerId,
                new Set([
                  marking.id,
                  ...ancestorsOf(project, marking.id).map((a) => a.id),
                ]),
              ),
        };
  return { gesture, draft: null };
}

/** O gesto de arrastar a ponta `end` da seta de `shape`. */
function arrowEndGesture(pointerId: number, shape: ArrowShape, end: ArrowEnd): Gesture {
  const { arrow, route } = shape;
  const isFrom = end === 'from';
  const first = route.points[0] as Point;
  const last = route.points[route.points.length - 1] as Point;
  return {
    kind: 'arrow-end',
    pointerId,
    arrowId: arrow.id,
    end,
    fixed: isFrom ? arrow.to : arrow.from,
    fixedAnchor: isFrom ? last : first,
    original: {
      markingId: isFrom ? arrow.from : arrow.to,
      side: isFrom ? arrow.fromSide : arrow.toSide,
    },
    currentSide: isFrom ? route.fromSide : route.toSide,
    valid: true,
  };
}

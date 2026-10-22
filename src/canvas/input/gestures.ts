// Gestos de arrasto em andamento e como cada intenção começa um. Sem DOM nem
// Konva: o `PointerInput` guarda o gesto e o alimenta com os eventos.
import {
  ancestorsOf,
  projectIndex,
  spaceOf,
  type Placement,
  type Project,
  type ProjectContainer,
  type Rect,
} from '../../model';
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
  /** Arrasto do mouse sobre o item trancado: não faz nada até soltar (cursor "não permitido"). */
  | { readonly kind: 'blocked'; readonly pointerId: number }
  /** Dois dedos. Termina quando todos saem da tela. */
  | { readonly kind: 'pinch' };

/** Gestos que usam `beginGesture/commitGesture` do store. */
export type StoreGesture = Extract<
  Gesture,
  { kind: 'move-image' | 'resize-image' | 'move-marking' | 'resize-marking' }
>;

export function isStoreGesture(g: Gesture | null): g is StoreGesture {
  return (
    g?.kind === 'move-image' ||
    g?.kind === 'resize-image' ||
    g?.kind === 'move-marking' ||
    g?.kind === 'resize-marking'
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
    const startPixel = image ? canvasToImagePixel(image.placement, startCanvas) : startCanvas;
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
          // Absorve o que cruza o retângulo, menos ela mesma e os ancestrais (que a contêm).
          candidates: absorbCandidates(
            project,
            marking.containerId,
            new Set([marking.id, ...ancestorsOf(project, marking.id).map((a) => a.id)]),
          ),
        };
  return { gesture, draft: null };
}

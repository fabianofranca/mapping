// Gestos de arrasto em andamento e como cada intenção começa um. Sem DOM nem
// Konva: o `PointerInput` guarda o gesto e o alimenta com os eventos.
import {
  markingRectLimits,
  projectIndex,
  type Placement,
  type Project,
  type ProjectImage,
  type Rect,
} from '../../model';
import type { Draft } from '../frame';
import type { Corner } from '../imageGeometry';
import { canvasToImagePixel, rectFromPoints, type RectLimits } from '../markingGeometry';
import type { Point } from '../viewport';
import type { Intent } from './intents';

export type Gesture =
  /** Dedo pressionado, ainda sem passar do limiar de arrasto (pode ser um toque). */
  | {
      readonly kind: 'pending';
      readonly pointerId: number;
      readonly start: Point;
      /** Vira o item pego se o dedo segurar; senão é o que o arrasto direto faria. */
      intent: Intent;
    }
  | { readonly kind: 'pan'; readonly pointerId: number; last: Point }
  | {
      readonly kind: 'move-image';
      readonly pointerId: number;
      readonly imageId: string;
      readonly startCanvas: Point;
      readonly startPlacement: Placement;
    }
  | {
      readonly kind: 'resize-image';
      readonly pointerId: number;
      readonly imageId: string;
      readonly corner: Corner;
      readonly startPlacement: Placement;
    }
  | {
      readonly kind: 'move-marking';
      readonly pointerId: number;
      readonly markingId: string;
      readonly startCanvas: Point;
      /** Escala da imagem: converte o deslocamento do canvas em pixels. */
      readonly scale: number;
    }
  | {
      readonly kind: 'resize-marking';
      readonly pointerId: number;
      readonly markingId: string;
      readonly corner: Corner;
      readonly placement: Placement;
      readonly startRect: Rect;
      readonly limits: RectLimits;
    }
  | {
      readonly kind: 'draw';
      readonly pointerId: number;
      readonly image: ProjectImage;
      readonly startPixel: Point;
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
    const image = index.images.get(intent.imageId);
    if (!image) return null;
    const startPixel = canvasToImagePixel(image.placement, startCanvas);
    return {
      gesture: { kind: 'draw', pointerId, image, startPixel },
      draft: { imageId: image.id, rect: rectFromPoints(startPixel, startPixel, image) },
    };
  }

  if (intent.kind === 'move-image' || intent.kind === 'resize-image') {
    const image = index.images.get(intent.imageId);
    if (!image || !beginGesture()) return null;
    const gesture: Gesture =
      intent.kind === 'move-image'
        ? {
            kind: 'move-image',
            pointerId,
            imageId: image.id,
            startCanvas,
            startPlacement: image.placement,
          }
        : {
            kind: 'resize-image',
            pointerId,
            imageId: image.id,
            corner: intent.corner,
            startPlacement: image.placement,
          };
    return { gesture, draft: null };
  }

  const marking = index.markings.get(intent.markingId);
  const image = marking && index.images.get(marking.imageId);
  if (!marking || !image) return null;
  const limits = markingRectLimits(project, marking.id);
  if (!beginGesture()) return null;
  const gesture: Gesture =
    intent.kind === 'move-marking'
      ? {
          kind: 'move-marking',
          pointerId,
          markingId: marking.id,
          startCanvas,
          scale: image.placement.scale,
        }
      : {
          kind: 'resize-marking',
          pointerId,
          markingId: marking.id,
          corner: intent.corner,
          placement: image.placement,
          startRect: marking.rect,
          limits,
        };
  return { gesture, draft: null };
}

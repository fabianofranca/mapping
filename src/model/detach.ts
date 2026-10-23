import { addBackgroundContainer, IMAGE_GAP, INITIAL_IMAGE_SIZE } from './containers';
import { imageCanvasRect, right } from './geometry';
import { markingCanvasRectOf, type SettleOptions } from './hierarchySettle';
import { createMarking } from './markings';
import { findById } from './project';
import { projectIndex } from './projectIndex';
import type { Annotation, Project } from './types';

// Container destacado (etapa Marcações espaciais, ME4): a marcação vira um container sem arquivo
// (do tamanho do `rect` dela, em pixels) ao lado do container de origem. Com um componente na
// marcação, o conteúdo vai junto: uma cópia da marcação, ocupando o container inteiro, com
// as anotações dela. Sem componente, o container fica em branco (o recorte da imagem como
// arquivo fica para depois). A origem não muda. Operação pura: o store faz **uma** entrada de
// desfazer.

/** Cor de fundo do container destacado. */
export const DETACHED_BACKGROUND = '#FFFFFF';

export interface DetachArgs {
  /** Id do container novo. */
  readonly containerId: string;
  /** Id da cópia da marcação no container novo (usado só com `copyContent`). */
  readonly markingId: string;
  /** Gera os ids das anotações e dos pares copiados. */
  readonly newId: () => string;
  /** Copiar a marcação e as anotações dela para o container novo (a marcação tem componente). */
  readonly copyContent: boolean;
}

/**
 * Destaca a marcação num container sem arquivo. O container leva o nome da marcação e nasce à
 * direita do container de origem (`placementNear`, sem sobrepor outros); marcação do canvas usa
 * o próprio retângulo como referência. Falha com `not-found` (marcação ausente) ou
 * `invalid-dimensions` (retângulo maior que `MAX_CONTAINER_SIZE`).
 */
export function detachMarking(
  p: Project,
  markingId: string,
  args: DetachArgs,
  options?: SettleOptions,
): Project {
  const marking = findById(p.markings, markingId);
  const { width, height } = marking.rect;
  const index = projectIndex(p);
  const source = marking.containerId && index.containers.get(marking.containerId);
  const near = source
    ? imageCanvasRect(source, source.placement)
    : markingCanvasRectOf(p, marking);
  const scale = INITIAL_IMAGE_SIZE / Math.max(width, height);
  const center = {
    x: right(near) + IMAGE_GAP + (width * scale) / 2,
    y: near.y + (height * scale) / 2,
  };
  let next = addBackgroundContainer(
    p,
    {
      id: args.containerId,
      name: marking.name,
      width,
      height,
      background: DETACHED_BACKGROUND,
      center,
    },
    options,
  );
  if (!args.copyContent) return next;

  next = createMarking(
    next,
    {
      id: args.markingId,
      containerId: args.containerId,
      rect: { x: 0, y: 0, width, height },
      name: marking.name,
    },
    options,
  );
  const own = index.annotationsByMarking.get(markingId) ?? [];
  const ids = new Map(own.map((a) => [a.id, args.newId()]));
  const copies: Annotation[] = own.map((a) => ({
    ...a,
    id: ids.get(a.id)!,
    markingId: args.markingId,
    parentAnnotationId:
      a.parentAnnotationId === null ? null : (ids.get(a.parentAnnotationId) ?? null),
    entries: a.entries.map((e) => ({ ...e, id: args.newId() })),
  }));
  return { ...next, annotations: [...next.annotations, ...copies] };
}

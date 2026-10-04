// O que um toque ou arrasto faria num ponto do canvas: pan, mover/redimensionar
// o item selecionado, desenhar, pegar um item ou selecionar pelo toque.
// Funções puras (sem DOM nem Konva), testadas em `tests/canvas/input/`.
import {
  canEditImagePlacement,
  canMoveMarking,
  canResizeMarking,
  imageCanvasRect,
  type Marking,
  type MarkingVisibility,
  type Project,
} from '../../model';
import { resolveSelection, type EditorMode, type Selection } from '../../store/ui';
import type { DragMode } from '../gestureMachine';
import { cornerAt, imageAt, pointInRect, type Corner } from '../imageGeometry';
import {
  canvasToImagePixel,
  handleHitRadius,
  markingCanvasRect,
  markingChainAt,
  nextInChain,
} from '../markingGeometry';
import type { Point } from '../viewport';

/** Distância (px de tela) em que um novo toque conta como "no mesmo ponto". */
export const TAP_REPEAT_DISTANCE = 12;
/** Metade da área de toque da alça (px de tela): 22 → 44 px, acima do mínimo de 24. */
export const HANDLE_HIT_RADIUS = 22;

export type Intent =
  | { readonly kind: 'pan' }
  | { readonly kind: 'move-image'; readonly imageId: string }
  | { readonly kind: 'resize-image'; readonly imageId: string; readonly corner: Corner }
  | { readonly kind: 'move-marking'; readonly markingId: string }
  | {
      readonly kind: 'resize-marking';
      readonly markingId: string;
      readonly corner: Corner;
    }
  | { readonly kind: 'draw'; readonly imageId: string }
  /** Sobre o item selecionado e trancado: arrastar não faz nada (cursor "não permitido"). */
  | { readonly kind: 'locked' };

const PAN: Intent = { kind: 'pan' };
const LOCKED: Intent = { kind: 'locked' };

/** Estado do editor que decide a intenção (lido sem assinar, no momento do evento). */
export interface IntentContext {
  readonly project: Project | null;
  readonly readOnly: boolean;
  readonly mode: EditorMode;
  readonly selection: Selection;
  /** Pixels de tela por unidade do canvas. */
  readonly zoom: number;
  /** Espaço pressionado: arrastar sempre faz pan. */
  readonly spaceDown: boolean;
}

/**
 * O que um arrasto começando em `c` (canvas) faria. Em Navegar, as alças do
 * item selecionado redimensionam e arrastar o item o move. Em Desenhar,
 * arrastar sobre uma imagem sempre cria uma marcação (sem alças, para não
 * atrapalhar o desenho de filhas perto dos cantos do pai).
 */
export function intentAt(ctx: IntentContext, c: Point): Intent {
  const { project, zoom } = ctx;
  if (ctx.spaceDown || !project || ctx.readOnly) return PAN;
  if (ctx.mode === 'draw') {
    const image = imageAt(project.images, c);
    return image ? { kind: 'draw', imageId: image.id } : PAN;
  }
  const selected = resolveSelection(project, ctx.selection);
  if (selected?.kind === 'marking') {
    const rect = markingCanvasRect(selected.image.placement, selected.marking.rect);
    const radius = handleHitRadius(Math.min(rect.width, rect.height) * zoom) / zoom;
    const markingId = selected.marking.id;
    // Trancada (ela ou um ancestral): sem alças. Com um descendente trancado, ela só
    // redimensiona: mover levaria o descendente junto.
    const corner = canResizeMarking(project, markingId)
      ? cornerAt(rect, c, radius)
      : null;
    if (corner) return { kind: 'resize-marking', markingId, corner };
    if (pointInRect(c, rect)) {
      return canMoveMarking(project, markingId)
        ? { kind: 'move-marking', markingId }
        : LOCKED;
    }
  }
  if (selected?.kind === 'image') {
    const { image } = selected;
    const rect = imageCanvasRect(image, image.placement);
    if (!canEditImagePlacement(project, image.id)) {
      return pointInRect(c, rect) ? LOCKED : PAN;
    }
    const corner = cornerAt(rect, c, HANDLE_HIT_RADIUS / zoom);
    if (corner) return { kind: 'resize-image', imageId: image.id, corner };
    if (pointInRect(c, rect)) return { kind: 'move-image', imageId: image.id };
  }
  return PAN;
}

/** Segurar-e-mover só existe no modo Navegar, com a edição liberada. */
export function canGrab(ctx: IntentContext): boolean {
  return (
    !ctx.spaceDown && !ctx.readOnly && ctx.project !== null && ctx.mode === 'navigate'
  );
}

/** Marcações que aceitam toque: as ocultas pelo modo de exibição ficam de fora. */
export function selectableMarkings(
  project: Project,
  visibility: ReadonlyMap<string, MarkingVisibility>,
): readonly Marking[] {
  return project.markings.filter((m) => visibility.get(m.id) !== 'hidden');
}

/**
 * Item que o segurar-e-mover pega em `c` (canvas): a marcação selecionada, se o
 * dedo estiver nela; senão a mais interna sob o dedo; senão a imagem. Um item
 * trancado (ou que não pode ser movido) não é pego: o resultado é `null`.
 */
export function grabIntentAt(
  project: Project | null,
  selection: Selection,
  visibility: ReadonlyMap<string, MarkingVisibility>,
  c: Point,
): Intent | null {
  if (!project) return null;
  const image = imageAt(project.images, c);
  if (!image) return null;
  const chain = markingChainAt(
    selectableMarkings(project, visibility),
    image.id,
    canvasToImagePixel(image.placement, c),
  );
  const picked =
    chain.find((m) => selection?.kind === 'marking' && selection.id === m.id) ?? chain[0];
  if (picked) {
    return canMoveMarking(project, picked.id)
      ? { kind: 'move-marking', markingId: picked.id }
      : null;
  }
  return canEditImagePlacement(project, image.id)
    ? { kind: 'move-image', imageId: image.id }
    : null;
}

/** O toque em `c` foi perto do anterior (`last`), em px de tela? */
export function isRepeatTap(last: Point | null, c: Point, zoom: number): boolean {
  return (
    last !== null && Math.hypot(c.x - last.x, c.y - last.y) * zoom <= TAP_REPEAT_DISTANCE
  );
}

/**
 * Seleção depois de um toque em `c`: a marcação mais interna sob o ponto;
 * tocar de novo no mesmo ponto (`repeat`) sobe para o pai. Fora das
 * marcações, a imagem; fora das imagens, nada.
 */
export function tapSelection(
  project: Project | null,
  selection: Selection,
  visibility: ReadonlyMap<string, MarkingVisibility>,
  c: Point,
  repeat: boolean,
): Selection {
  const image = project && imageAt(project.images, c);
  if (!project || !image) return null;
  const chain = markingChainAt(
    selectableMarkings(project, visibility),
    image.id,
    canvasToImagePixel(image.placement, c),
  ).map((m) => m.id);
  const next = nextInChain(
    chain,
    selection?.kind === 'marking' ? selection.id : null,
    repeat,
  );
  return next ? { kind: 'marking', id: next } : { kind: 'image', id: image.id };
}

export function dragModeOf(intent: Intent): DragMode {
  if (intent.kind === 'pan' || intent.kind === 'draw') return intent.kind;
  return intent.kind === 'move-image' ||
    intent.kind === 'move-marking' ||
    intent.kind === 'locked'
    ? 'move'
    : 'resize';
}

/** Cursor do mouse parado sobre um ponto com a intenção dada. */
export function cursorFor(intent: Intent): string {
  switch (intent.kind) {
    case 'move-image':
    case 'move-marking':
      return 'move';
    case 'resize-image':
    case 'resize-marking':
      return intent.corner === 'nw' || intent.corner === 'se'
        ? 'nwse-resize'
        : 'nesw-resize';
    case 'draw':
      return 'crosshair';
    case 'locked':
      return 'not-allowed';
    case 'pan':
      return '';
  }
}

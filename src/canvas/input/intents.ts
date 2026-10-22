// O que um toque ou arrasto faria num ponto do canvas: pan, mover/redimensionar
// o item selecionado, desenhar, pegar um item ou selecionar pelo toque.
// Funções puras (sem DOM nem Konva), testadas em `tests/canvas/input/`.
import {
  canEditImagePlacement,
  canEditMarkingGeometry,
  imageCanvasRect,
  projectIndex,
  type Marking,
  type MarkingVisibility,
  type Project,
} from '../../model';
import { resolveSelection, type EditorMode, type Selection } from '../../store/ui';
import type { DragMode } from '../gestureMachine';
import { cornerAt, imageAt, pointInRect, type Corner } from '../imageGeometry';
import {
  canvasToImagePixel,
  floatingAt,
  handleHitRadius,
  markingCanvasRect,
  markingChainAt,
  nextInChain,
} from '../markingGeometry';
import type { Point } from '../viewport';

export { ABSORB_TOLERANCE } from '../containment';

/** Distância (px de tela) em que um novo toque conta como "no mesmo ponto". */
export const TAP_REPEAT_DISTANCE = 12;
/** Metade da área de toque da alça (px de tela): 22 → 44 px, acima do mínimo de 24. */
export const HANDLE_HIT_RADIUS = 22;

export type Intent =
  | { readonly kind: 'pan' }
  | { readonly kind: 'move-image'; readonly containerId: string }
  | {
      readonly kind: 'resize-image';
      readonly containerId: string;
      readonly corner: Corner;
    }
  | { readonly kind: 'move-marking'; readonly markingId: string }
  | {
      readonly kind: 'resize-marking';
      readonly markingId: string;
      readonly corner: Corner;
    }
  /** Desenhar: `containerId` nulo = no vazio do canvas (marcação do canvas). */
  | { readonly kind: 'draw'; readonly containerId: string | null }
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
 * arrastar sempre cria uma marcação (sem alças, para não atrapalhar o desenho de filhas perto
 * dos cantos do pai): sobre uma imagem, preso a ela; no vazio, uma marcação do canvas. O pan
 * no modo Desenhar fica com a barra de espaço, o botão do meio e a roda.
 */
export function intentAt(ctx: IntentContext, c: Point): Intent {
  const { project, zoom } = ctx;
  if (ctx.spaceDown || !project || ctx.readOnly) return PAN;
  if (ctx.mode === 'draw') {
    const image = imageAt(project.containers, c);
    return { kind: 'draw', containerId: image?.id ?? null };
  }
  const selected = resolveSelection(project, ctx.selection);
  if (selected?.kind === 'marking') {
    const rect = markingCanvasRect(selected.space.placement, selected.marking.rect);
    const radius = handleHitRadius(Math.min(rect.width, rect.height) * zoom) / zoom;
    const markingId = selected.marking.id;
    // Trancada (ela ou um ancestral): sem alças e sem mover. Descendentes trancados não
    // contam: mover o pai os leva junto.
    const editable = canEditMarkingGeometry(project, markingId);
    const corner = editable ? cornerAt(rect, c, radius) : null;
    if (corner) return { kind: 'resize-marking', markingId, corner };
    if (pointInRect(c, rect)) {
      return editable ? { kind: 'move-marking', markingId } : LOCKED;
    }
  }
  if (selected?.kind === 'image') {
    const { image } = selected;
    const rect = imageCanvasRect(image, image.placement);
    if (!canEditImagePlacement(project, image.id)) {
      return pointInRect(c, rect) ? LOCKED : PAN;
    }
    const corner = cornerAt(rect, c, HANDLE_HIT_RADIUS / zoom);
    if (corner) return { kind: 'resize-image', containerId: image.id, corner };
    if (pointInRect(c, rect)) return { kind: 'move-image', containerId: image.id };
  }
  return PAN;
}

/** Marcações que aceitam toque: as ocultas pelo modo de exibição ficam de fora. */
export function selectableMarkings(
  project: Project,
  visibility: ReadonlyMap<string, MarkingVisibility>,
): readonly Marking[] {
  return project.markings.filter((m) => visibility.get(m.id) !== 'hidden');
}

/** O toque em `c` foi perto do anterior (`last`), em px de tela? */
export function isRepeatTap(last: Point | null, c: Point, zoom: number): boolean {
  return (
    last !== null && Math.hypot(c.x - last.x, c.y - last.y) * zoom <= TAP_REPEAT_DISTANCE
  );
}

/** Item que um toque pode selecionar. */
export type HitItem = NonNullable<Selection>;

/**
 * Tudo o que um toque em `c` (canvas) alcança, do primeiro a receber o toque ao último (a cadeia
 * do "clicar de novo sobe"):
 *
 * 1. as marcações flutuantes sob o ponto, onde estiverem (a de cima primeiro);
 * 2. dentro de um container: a marcação mais interna → os ancestrais → o container → as marcações
 *    do canvas que o contêm (pela cadeia de `parentId` do container) → as demais marcações do
 *    canvas sobrepostas ao ponto;
 * 3. fora dos containers: as marcações do canvas sob o ponto, a mais interna primeiro e depois os
 *    ancestrais.
 *
 * As marcações ocultas pela visibilidade ficam de fora.
 */
export function hitChain(
  project: Project,
  visibility: ReadonlyMap<string, MarkingVisibility>,
  c: Point,
): HitItem[] {
  const markings = selectableMarkings(project, visibility);
  const selectable = new Set(markings.map((m) => m.id));
  const chain: HitItem[] = [];
  const seen = new Set<string>();
  const add = (pick: HitItem) => {
    const key = `${pick.kind}:${pick.id}`;
    if (seen.has(key)) return;
    seen.add(key);
    chain.push(pick);
  };
  for (const m of floatingAt(markings, c)) add({ kind: 'marking', id: m.id });
  const image = imageAt(project.containers, c);
  if (image) {
    const pixel = canvasToImagePixel(image.placement, c);
    for (const m of markingChainAt(markings, image.id, pixel)) {
      add({ kind: 'marking', id: m.id });
    }
    add({ kind: 'image', id: image.id });
    // As marcações do canvas que contêm o container, de dentro para fora.
    const byId = projectIndex(project).markings;
    let parentId = image.parentId;
    for (let guard = byId.size; parentId !== null && guard > 0; guard--) {
      const parent = byId.get(parentId);
      if (!parent) break;
      if (selectable.has(parent.id)) add({ kind: 'marking', id: parent.id });
      parentId = parent.parentId;
    }
  }
  for (const m of markingChainAt(markings, null, c)) add({ kind: 'marking', id: m.id });
  return chain;
}

/**
 * Seleção depois de um toque em `c`: o primeiro da cadeia (`hitChain`); tocar de novo no mesmo
 * ponto (`repeat`) sobe um degrau e, depois do último, volta ao primeiro. Fora de tudo, nada.
 */
export function tapSelection(
  project: Project | null,
  selection: Selection,
  visibility: ReadonlyMap<string, MarkingVisibility>,
  c: Point,
  repeat: boolean,
): Selection {
  if (!project) return null;
  const chain = hitChain(project, visibility, c);
  const keyOf = (pick: HitItem) => `${pick.kind}:${pick.id}`;
  const next = nextInChain(
    chain.map(keyOf),
    selection ? keyOf(selection) : null,
    repeat,
  );
  return chain.find((pick) => keyOf(pick) === next) ?? null;
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

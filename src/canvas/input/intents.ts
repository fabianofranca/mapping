// O que um toque ou arrasto faria num ponto do canvas: pan, mover/redimensionar
// o item selecionado, desenhar, pegar um item ou selecionar pelo toque.
// Funções puras (sem DOM nem Konva), testadas em `tests/canvas/input/`.
import {
  canEditArrow,
  canEditImagePlacement,
  canEditMarkingGeometry,
  canMoveItems,
  imageCanvasRect,
  markingCanvasRectOf,
  projectIndex,
  type Marking,
  type MarkingVisibility,
  type Project,
  type ProjectContainer,
  type Rect,
} from '../../model';
import {
  resolveSelection,
  type EditorMode,
  type Selection,
  type SelectionItem,
} from '../../store/ui';
import {
  arrowHandleAt,
  arrowsAt,
  isOnLinkHandle,
  type ArrowHandle,
  type ArrowShape,
} from '../arrowGeometry';
import type { DragMode } from '../gestureMachine';
import {
  cornerAt,
  containerTitleAt,
  imageAt,
  pointInRect,
  type Corner,
} from '../imageGeometry';
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
  /**
   * Seleção múltipla (ME2): arrastar qualquer item selecionado leva a seleção inteira, cada
   * item no próprio espaço (`moveItems`). Leva os itens que existiam ao apertar o ponteiro.
   */
  | { readonly kind: 'move-items'; readonly items: readonly SelectionItem[] }
  /**
   * Alça de ligação da marcação selecionada (ME4): puxar dela até outra marcação cria uma seta
   * que sai da selecionada.
   */
  | { readonly kind: 'arrow-link'; readonly markingId: string }
  /**
   * Alça da seta selecionada (ME4): a ponta (trocar de marcação ou de lado), um ponto de passagem
   * (mover) ou o meio de um trecho (arrastar cria um ponto de passagem).
   */
  | {
      readonly kind: 'arrow-handle';
      readonly arrowId: string;
      readonly handle: ArrowHandle;
    }
  /** Sobre o item selecionado e trancado: arrastar não faz nada (cursor "não permitido"). */
  | { readonly kind: 'locked' };

const PAN: Intent = { kind: 'pan' };
const LOCKED: Intent = { kind: 'locked' };

/** Estado do editor que decide a intenção (lido sem assinar, no momento do evento). */
export interface IntentContext {
  readonly project: Project | null;
  readonly readOnly: boolean;
  readonly mode: EditorMode;
  /** Item primário da seleção (o último clicado): é o das alças. */
  readonly selection: Selection;
  /**
   * Todos os itens selecionados que existem no projeto, o primário por último. Com dois ou mais,
   * arrastar dentro de qualquer um deles move a seleção toda; com um só, vale `selection`.
   */
  readonly items: readonly SelectionItem[];
  /**
   * Visibilidade das marcações no modo de exibição: uma marcação oculta não conta como "dentro"
   * (não aparece na tela), mas continua sendo movida com a seleção. Sem o mapa, todas contam.
   */
  readonly visibility?: ReadonlyMap<string, MarkingVisibility>;
  /**
   * Setas desenhadas (as duas pontas à vista, "Mostrar setas" ligado, fora do Ver limpo): o que o
   * toque alcança e onde ficam as alças da seta selecionada. Sem o campo, não há seta no toque.
   */
  readonly arrows?: readonly ArrowShape[];
  /**
   * Retângulos dos nomes acima dos containers (canvas): arrastar pelo nome do container selecionado
   * o move. Sem o campo, o nome não conta.
   */
  readonly titles?: ReadonlyMap<string, Rect>;
  /** Pixels de tela por unidade do canvas. */
  readonly zoom: number;
  /** Espaço pressionado: arrastar sempre faz pan. */
  readonly spaceDown: boolean;
}

/**
 * O que um arrasto começando em `c` (canvas) faria. Em Navegar, as alças do
 * item selecionado redimensionam e arrastar o item o move; com vários itens selecionados, as alças
 * continuam sendo só do primário e arrastar dentro de qualquer item selecionado move todos
 * (`move-items`, ou `locked` se algum não pode ir). Em Desenhar,
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
  if (ctx.items.length >= 2) return multiIntentAt(ctx, project, c);
  const selected = resolveSelection(project, ctx.selection);
  if (selected?.kind === 'arrow')
    return arrowIntentAt(ctx, project, selected.arrow.id, c) ?? PAN;
  if (selected?.kind === 'marking') {
    const rect = markingCanvasRect(selected.space.placement, selected.marking.rect);
    // A alça de ligação fica fora do retângulo e vale também trancada: criar a seta não muda a
    // marcação.
    if (isOnLinkHandle(rect, c, zoom)) {
      return { kind: 'arrow-link', markingId: selected.marking.id };
    }
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
    const onTitle = onContainerTitle(ctx, image.id, c);
    if (!canEditImagePlacement(project, image.id)) {
      return pointInRect(c, rect) || onTitle ? LOCKED : PAN;
    }
    const corner = cornerAt(rect, c, HANDLE_HIT_RADIUS / zoom);
    if (corner) return { kind: 'resize-image', containerId: image.id, corner };
    if (pointInRect(c, rect) || onTitle) {
      return { kind: 'move-image', containerId: image.id };
    }
  }
  return PAN;
}

/** O ponto está no rótulo do nome do container `id` (`ctx.titles`)? */
function onContainerTitle(ctx: IntentContext, id: string, c: Point): boolean {
  const title = ctx.titles?.get(id);
  return title !== undefined && pointInRect(c, title);
}

/**
 * Seleção múltipla: as alças do primário redimensionam o primário; fora delas, o ponto dentro do
 * retângulo (no canvas) de qualquer item selecionado começa o arrasto conjunto, se todos podem ir
 * (tudo ou nada), ou é `locked`; fora de todos, pan.
 */
function multiIntentAt(ctx: IntentContext, project: Project, c: Point): Intent {
  const { items, zoom } = ctx;
  const selected = resolveSelection(project, ctx.selection);
  if (selected?.kind === 'arrow') {
    // As alças da seta primária valem com vários itens; fora delas, o resto do arrasto conjunto.
    const arrowIntent = arrowIntentAt(ctx, project, selected.arrow.id, c);
    if (arrowIntent) return arrowIntent;
  }
  if (selected?.kind === 'marking') {
    const rect = markingCanvasRect(selected.space.placement, selected.marking.rect);
    const radius = handleHitRadius(Math.min(rect.width, rect.height) * zoom) / zoom;
    const markingId = selected.marking.id;
    const corner = canEditMarkingGeometry(project, markingId)
      ? cornerAt(rect, c, radius)
      : null;
    if (corner) return { kind: 'resize-marking', markingId, corner };
  } else if (selected?.kind === 'image') {
    const { image } = selected;
    const corner = canEditImagePlacement(project, image.id)
      ? cornerAt(imageCanvasRect(image, image.placement), c, HANDLE_HIT_RADIUS / zoom)
      : null;
    if (corner) return { kind: 'resize-image', containerId: image.id, corner };
  }
  const index = projectIndex(project);
  const inside = items.some((item) => {
    if (item.kind === 'image') {
      const container = index.containers.get(item.id);
      return (
        container !== undefined &&
        (pointInRect(c, imageCanvasRect(container, container.placement)) ||
          onContainerTitle(ctx, item.id, c))
      );
    }
    const marking = index.markings.get(item.id);
    if (!marking || ctx.visibility?.get(item.id) === 'hidden') return false;
    return pointInRect(c, markingCanvasRectOf(project, marking));
  });
  if (!inside) return PAN;
  return canMoveItems(project, items) ? { kind: 'move-items', items } : LOCKED;
}

/**
 * A intenção de um ponto sobre a seta selecionada (a primária): uma alça dela, ou `locked` sobre o
 * traço de uma seta trancada (sem alças); `null` fora das alças. Uma seta que não está
 * desenhada (ponta oculta, "Mostrar setas" desligado) não tem alças.
 */
function arrowIntentAt(
  ctx: IntentContext,
  project: Project,
  arrowId: string,
  c: Point,
): Intent | null {
  const shape = ctx.arrows?.find((s) => s.arrow.id === arrowId);
  if (!shape) return null;
  if (!canEditArrow(project, arrowId)) {
    return arrowsAt([shape], c, ctx.zoom).length > 0 ? LOCKED : null;
  }
  const handle = arrowHandleAt(shape, c, ctx.zoom);
  return handle ? { kind: 'arrow-handle', arrowId, handle } : null;
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

/** As setas que o toque alcança: as desenhadas e o zoom (o alcance é em px de tela). */
export interface ArrowHit {
  readonly shapes: readonly ArrowShape[];
  readonly zoom: number;
}

/**
 * Tudo o que um toque em `c` (canvas) alcança, do primeiro a receber o toque ao último (a cadeia
 * do "clicar de novo sobe"):
 *
 * 1. as marcações flutuantes sob o ponto, onde estiverem (a de cima primeiro);
 * 1b. as setas a até `ARROW_HIT_TOLERANCE` px de tela do ponto (`arrows`; a mais perto primeiro);
 * 1c. o rótulo do nome acima de um container (`titles`): o container e as marcações do canvas que
 *    o contêm, mesmo que ele esteja inteiramente coberto de marcações;
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
  arrows?: ArrowHit,
  titles?: ReadonlyMap<string, Rect>,
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
  // As setas ficam acima das marcações e dos containers, e abaixo das flutuantes.
  if (arrows) {
    for (const shape of arrowsAt(arrows.shapes, c, arrows.zoom)) {
      add({ kind: 'arrow', id: shape.arrow.id });
    }
  }
  // As marcações do canvas que contêm o container, de dentro para fora.
  const addCanvasParents = (container: ProjectContainer) => {
    const byId = projectIndex(project).markings;
    let parentId = container.parentId;
    for (let guard = byId.size; parentId !== null && guard > 0; guard--) {
      const parent = byId.get(parentId);
      if (!parent) break;
      if (selectable.has(parent.id)) add({ kind: 'marking', id: parent.id });
      parentId = parent.parentId;
    }
  };
  const titled = titles ? containerTitleAt(project.containers, titles, c) : null;
  if (titled) {
    add({ kind: 'image', id: titled.id });
    addCanvasParents(titled);
  }
  const image = imageAt(project.containers, c);
  if (image) {
    const pixel = canvasToImagePixel(image.placement, c);
    for (const m of markingChainAt(markings, image.id, pixel)) {
      add({ kind: 'marking', id: m.id });
    }
    add({ kind: 'image', id: image.id });
    addCanvasParents(image);
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
  arrows?: ArrowHit,
  titles?: ReadonlyMap<string, Rect>,
): Selection {
  if (!project) return null;
  const chain = hitChain(project, visibility, c, arrows, titles);
  const keyOf = (pick: HitItem) => `${pick.kind}:${pick.id}`;
  const next = nextInChain(chain.map(keyOf), selection ? keyOf(selection) : null, repeat);
  return chain.find((pick) => keyOf(pick) === next) ?? null;
}

export function dragModeOf(intent: Intent): DragMode {
  if (intent.kind === 'pan' || intent.kind === 'draw') return intent.kind;
  return intent.kind === 'move-image' ||
    intent.kind === 'move-marking' ||
    intent.kind === 'move-items' ||
    intent.kind === 'locked'
    ? 'move'
    : 'resize';
}

/** Cursor do mouse parado sobre um ponto com a intenção dada. */
export function cursorFor(intent: Intent): string {
  switch (intent.kind) {
    case 'move-image':
    case 'move-marking':
    case 'move-items':
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
    case 'arrow-link':
      return 'crosshair';
    case 'arrow-handle':
      if (intent.handle.kind === 'segment') {
        return intent.handle.axis === 'x' ? 'ew-resize' : 'ns-resize';
      }
      return intent.handle.kind === 'end' ? 'crosshair' : 'move';
    case 'pan':
      return '';
  }
}

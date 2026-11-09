// Imagens no canvas: bitmap (ou espaço reservado com aviso) e o nome acima.
import Konva from 'konva/lib/Core';
import { Image as KonvaImage } from 'konva/lib/shapes/Image';
import { Rect as KonvaRect } from 'konva/lib/shapes/Rect';
import { Text as KonvaText } from 'konva/lib/shapes/Text';
import { t } from '../../i18n';
import {
  imageCanvasRect,
  isBackgroundContainer,
  type Placement,
  type ProjectContainer,
  type Rect,
} from '../../model';
import type { DisplayImage } from '../../store/displayImages';
import type { Frame, ViewFrame } from '../frame';
import type { CanvasTokens } from '../theme';
import { fontStyle, sameInputs } from './metrics';

/** Rótulo da imagem (px de tela): distância da borda e largura mínima (a fonte é `t-cv-image`). */
const IMAGE_TITLE_GAP = 4;
const IMAGE_TITLE_MIN_WIDTH = 48;

export interface ImageNode {
  readonly group: Konva.Group;
  readonly bitmap: KonvaImage;
  readonly placeholder: KonvaRect;
  readonly label: KonvaText;
  /** Nome da imagem, como rótulo acima dela. */
  readonly title: KonvaText;
  /** Entradas do último `updateNode`: iguais, o nó já está certo. */
  drawn: readonly unknown[] | null;
}

export type ImageFrame = Pick<
  Frame,
  'project' | 'preview' | 'bitmaps' | 'tokens' | 'viewport' | 'view' | 'locale'
>;

/** Nós das imagens, reaproveitados entre quadros (um grupo por imagem). */
export class ImageRenderer {
  private readonly layer: Konva.Layer;
  private readonly nodes = new Map<string, ImageNode>();
  private titles: ReadonlyMap<string, Rect> = new Map();

  constructor(layer: Konva.Layer) {
    this.layer = layer;
  }

  /** Nó desenhado para a imagem (ou `undefined` se ela não está no canvas). */
  node(id: string): ImageNode | undefined {
    return this.nodes.get(id);
  }

  /**
   * Retângulo do texto do nome de cada container com o rótulo visível, em coordenadas do canvas
   * (do último `render`). Container com o rótulo escondido pelo zoom não entra.
   */
  titleRects(): ReadonlyMap<string, Rect> {
    return this.titles;
  }

  /** `true` se o último `render` mexeu em algum nó (criou, refez, reordenou ou removeu). */
  changed = false;

  /** `true` se o último `render` mexeu em algum nó levado ao grupo de arrasto. */
  draggedChanged = false;

  /** As imagens que se movem num gesto e o grupo em que ficam até soltar (decisões 5 e 6). */
  private dragIds: ReadonlySet<string> | null = null;
  private dragTarget: Konva.Container | null = null;

  /**
   * Leva as imagens de `ids` para o grupo de arrasto no próximo `render` (os nós são os mesmos,
   * movidos com `moveTo`), ou as devolve à camada com `null`.
   */
  setDragged(ids: ReadonlySet<string> | null, target: Konva.Container): void {
    this.dragIds = ids && ids.size > 0 ? ids : null;
    this.dragTarget = target;
  }

  /**
   * Desenha as imagens na ordem do projeto e devolve a posição de cada uma
   * (com a prévia do gesto em andamento aplicada). `changed` diz se algum nó mudou.
   */
  render(frame: ImageFrame): ReadonlyMap<string, Placement> {
    let changed = false;
    let draggedChanged = false;
    // Posição na pilha da camada: as imagens que se movem num gesto não contam (saíram dela).
    let position = 0;
    const images = frame.project?.containers ?? [];
    const placements = new Map<string, Placement>();
    const titles = new Map<string, Rect>();
    const seen = new Set<string>();
    images.forEach((image) => {
      seen.add(image.id);
      const one = this.renderOne(image, frame, position);
      placements.set(image.id, one.placement);
      if (one.title) titles.set(image.id, one.title);
      if (!one.dragged) position++;
      if (one.layer) changed = true;
      if (one.drag) draggedChanged = true;
    });
    this.titles = titles;
    for (const [id, node] of this.nodes) {
      if (seen.has(id)) continue;
      node.group.destroy();
      this.nodes.delete(id);
      changed = true;
    }
    this.changed = changed;
    this.draggedChanged = draggedChanged;
    return placements;
  }

  /** Onde o nó da imagem fica: o grupo de arrasto se ela se move num gesto, senão a camada. */
  private homeOf(id: string): Konva.Container {
    return this.dragTarget && this.dragIds?.has(id) ? this.dragTarget : this.layer;
  }

  /**
   * Desenha uma imagem: põe o nó no grupo certo (a camada, ou o grupo de arrasto se ela se move), o
   * refaz se as entradas mudaram e acerta a posição na pilha da camada. Devolve a posição dela
   * (com a prévia do gesto), o retângulo do nome e o que mexeu.
   */
  private renderOne(
    image: ProjectContainer,
    frame: ImageFrame,
    position: number,
  ): OneImage {
    const placement = placementOfImage(image, frame.preview);
    const fresh = !this.nodes.has(image.id);
    const node = this.nodes.get(image.id) ?? this.createNode(image.id);
    const home = this.homeOf(image.id);
    const dragged = home !== this.layer;
    // Sai de uma e entra na outra: as duas se redesenham.
    const moved = node.group.getParent() !== home;
    if (moved) node.group.moveTo(home);
    const redrawn = refreshNode(node, image, placement, frame);
    const reordered = !dragged && node.group.zIndex() !== position;
    if (reordered) node.group.zIndex(position);
    const title = titleRect(node, image, placement);
    return {
      placement,
      title,
      dragged,
      ...touchedBy(dragged, fresh, moved, redrawn, reordered),
    };
  }

  private createNode(id: string): ImageNode {
    const node: ImageNode = {
      group: new Konva.Group(),
      bitmap: new KonvaImage({ image: undefined }),
      placeholder: new KonvaRect(),
      label: new KonvaText({ align: 'center', verticalAlign: 'middle', wrap: 'char' }),
      title: new KonvaText({ wrap: 'none', ellipsis: true }),
      drawn: null,
    };
    node.group.add(node.placeholder, node.bitmap, node.label, node.title);
    this.layer.add(node.group);
    this.nodes.set(id, node);
    return node;
  }
}

/** O que `renderOne` devolve de uma imagem. */
interface OneImage {
  readonly placement: Placement;
  readonly title: Rect | null;
  readonly dragged: boolean;
  /** A camada das imagens mexeu. */
  readonly layer: boolean;
  /** O grupo de arrasto mexeu. */
  readonly drag: boolean;
}

/** Posição da imagem: a da prévia do gesto, se é a dela, ou a do projeto. */
function placementOfImage(
  image: ProjectContainer,
  preview: ImageFrame['preview'],
): Placement {
  return preview?.containerId === image.id ? preview.placement : image.placement;
}

/** Refaz o nó se as entradas mudaram; `true` se refez. */
function refreshNode(
  node: ImageNode,
  image: ProjectContainer,
  placement: Placement,
  frame: ImageFrame,
): boolean {
  const zoom = frame.viewport.scale;
  const state = image.file === null ? undefined : frame.bitmaps.get(image.file);
  const inputs = [image, placement, state, frame.tokens, zoom, frame.view, frame.locale];
  if (sameInputs(node.drawn, inputs)) return false;
  node.drawn = inputs;
  updateNode(node, image, placement, state, frame.tokens, zoom, frame.view);
  return true;
}

/** Qual grupo mexeu: a camada (nó novo, trocado, refeito ou reordenado) e/ou o de arrasto. */
function touchedBy(
  dragged: boolean,
  fresh: boolean,
  moved: boolean,
  redrawn: boolean,
  reordered: boolean,
): { layer: boolean; drag: boolean } {
  return {
    layer: fresh || reordered || moved || (redrawn && !dragged),
    drag: moved || (redrawn && dragged),
  };
}

/** Retângulo do texto do nome (canvas), ou `null` com o rótulo escondido pelo zoom. */
function titleRect(
  node: ImageNode,
  image: ProjectContainer,
  placement: Placement,
): Rect | null {
  if (!node.title.visible()) return null;
  const rect = imageCanvasRect(image, placement);
  return {
    x: rect.x,
    y: rect.y + node.title.y(),
    width: Math.min(node.title.getTextWidth(), rect.width),
    height: node.title.height(),
  };
}

/**
 * Um `ImageBitmap` fechado (`close()`) fica com largura e altura zero; desenhá-lo lança
 * `InvalidStateError`. O nó nunca recebe um, mesmo que o mapa de exibição o traga.
 */
function isClosed(bitmap: ImageBitmap): boolean {
  return bitmap.width === 0 && bitmap.height === 0;
}

function updateNode(
  node: ImageNode,
  image: ProjectContainer,
  placement: Placement,
  state: DisplayImage<ImageBitmap> | undefined,
  tokens: CanvasTokens,
  zoom: number,
  view: ViewFrame | null,
): void {
  const rect = imageCanvasRect(image, placement);
  node.group.position({ x: rect.x, y: rect.y });
  const box = { width: rect.width, height: rect.height };
  // Modo visualização: Containers liga o nome e o contorno do container; Imagens, o bitmap.
  const containers = view?.containers ?? true;
  if (isBackgroundContainer(image)) {
    updateBackground(node, image, box, tokens, zoom, containers);
  } else {
    updatePhoto(node, image, box, state, tokens, zoom, view?.images ?? true);
  }
  updateTitle(node, image, rect.width, tokens, zoom, containers);
}

/**
 * Container sem arquivo: um retângulo cheio com a cor de fundo, sempre pronto. Nunca o reservado
 * de "carregando": não há bitmap para esperar. Sem Containers (modo visualização) o contorno some
 * e o fundo continua: ele é a tela.
 */
function updateBackground(
  node: ImageNode,
  image: ProjectContainer,
  box: { readonly width: number; readonly height: number },
  tokens: CanvasTokens,
  zoom: number,
  outline: boolean,
): void {
  node.bitmap.setAttrs({ ...box, visible: false, image: undefined });
  node.placeholder.setAttrs({
    ...box,
    visible: true,
    fill: image.background ?? tokens.surface,
    stroke: tokens.border,
    strokeEnabled: outline,
    strokeWidth: 1 / zoom,
    dash: [],
  });
  node.label.visible(false);
}

/**
 * Foto: o bitmap, ou o espaço reservado com o aviso de "carregando" ou de arquivo que falta. Sem
 * Imagens (modo visualização) a foto não aparece, nem o reservado.
 */
function updatePhoto(
  node: ImageNode,
  image: ProjectContainer,
  box: { readonly width: number; readonly height: number },
  state: DisplayImage<ImageBitmap> | undefined,
  tokens: CanvasTokens,
  zoom: number,
  shown: boolean,
): void {
  const ready = shown && state?.status === 'ready' && !isClosed(state.bitmap);
  node.bitmap.setAttrs({
    ...box,
    visible: ready,
    image: ready ? state.bitmap : undefined,
  });

  const broken = state?.status === 'missing' || state?.status === 'error';
  node.placeholder.setAttrs({
    ...box,
    visible: shown && !ready,
    fill: tokens.surface,
    stroke: broken ? tokens.warningText : tokens.border,
    strokeEnabled: true,
    strokeWidth: (broken ? 2 : 1) / zoom,
    dash: broken ? [8 / zoom, 6 / zoom] : [],
  });

  const message =
    state?.status === 'missing'
      ? t('canvas.imageMissing')
      : state?.status === 'error'
        ? t('canvas.imageError')
        : null;
  const padding = Math.min(box.width, box.height) * 0.05;
  if (!shown || message === null) {
    node.label.visible(false);
    return;
  }
  node.label.setAttrs({
    visible: true,
    text: `⚠ ${message}\n${image.file ?? ''}`,
    x: padding,
    y: padding,
    width: Math.max(0, box.width - 2 * padding),
    height: Math.max(0, box.height - 2 * padding),
    fontSize: Math.max(
      Math.min(box.width, box.height) * 0.06,
      tokens.type.image.size / zoom,
    ),
    fontFamily: tokens.fontFamily,
    fill: broken ? tokens.warningText : tokens.textMuted,
  });
}

/** Rótulo com o nome da imagem (ou do arquivo) logo acima dela. */
function updateTitle(
  node: ImageNode,
  image: ProjectContainer,
  width: number,
  tokens: CanvasTokens,
  zoom: number,
  shown: boolean,
): void {
  // Tela pequena demais para caber um rótulo legível (ou sem Containers no modo visualização): esconde.
  if (!shown || width * zoom < IMAGE_TITLE_MIN_WIDTH) {
    node.title.visible(false);
    return;
  }
  const { size, line, weight } = tokens.type.image;
  node.title.setAttrs({
    visible: true,
    text: image.name ?? image.file ?? t('image.containerUntitled'),
    x: 0,
    y: -(line + IMAGE_TITLE_GAP) / zoom,
    width,
    height: line / zoom,
    fontSize: size / zoom,
    fontFamily: tokens.fontFamily,
    fontStyle: fontStyle(weight),
    fill: image.name === null ? tokens.textMuted : tokens.text,
  });
}

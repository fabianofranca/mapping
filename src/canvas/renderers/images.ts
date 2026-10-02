// Imagens no canvas: bitmap (ou espaço reservado com aviso) e o nome acima.
import Konva from 'konva/lib/Core';
import { Image as KonvaImage } from 'konva/lib/shapes/Image';
import { Rect as KonvaRect } from 'konva/lib/shapes/Rect';
import { Text as KonvaText } from 'konva/lib/shapes/Text';
import { t } from '../../i18n';
import { imageCanvasRect, type Placement, type ProjectImage } from '../../model';
import type { DisplayImage } from '../../store/displayImages';
import type { Frame } from '../frame';
import type { CanvasTokens } from '../theme';

/** Rótulo da imagem (px de tela): fonte, distância da borda e largura mínima para aparecer. */
const IMAGE_TITLE_FONT_SIZE = 12;
const IMAGE_TITLE_GAP = 4;
const IMAGE_TITLE_MIN_WIDTH = 48;

export interface ImageNode {
  readonly group: Konva.Group;
  readonly bitmap: KonvaImage;
  readonly placeholder: KonvaRect;
  readonly label: KonvaText;
  /** Nome da imagem, como rótulo acima dela. */
  readonly title: KonvaText;
}

export type ImageFrame = Pick<
  Frame,
  'project' | 'preview' | 'bitmaps' | 'tokens' | 'viewport'
>;

/** Nós das imagens, reaproveitados entre quadros (um grupo por imagem). */
export class ImageRenderer {
  private readonly layer: Konva.Layer;
  private readonly nodes = new Map<string, ImageNode>();

  constructor(layer: Konva.Layer) {
    this.layer = layer;
  }

  /** Nó desenhado para a imagem (ou `undefined` se ela não está no canvas). */
  node(id: string): ImageNode | undefined {
    return this.nodes.get(id);
  }

  /**
   * Desenha as imagens na ordem do projeto e devolve a posição de cada uma
   * (com a prévia do gesto em andamento aplicada).
   */
  render(frame: ImageFrame): ReadonlyMap<string, Placement> {
    const { project, preview, bitmaps, tokens } = frame;
    const zoom = frame.viewport.scale;
    const images = project?.images ?? [];
    const placements = new Map<string, Placement>();
    const seen = new Set<string>();
    images.forEach((image, index) => {
      seen.add(image.id);
      const placement =
        preview?.imageId === image.id ? preview.placement : image.placement;
      placements.set(image.id, placement);
      const node = this.nodes.get(image.id) ?? this.createNode(image.id);
      updateNode(node, image, placement, bitmaps.get(image.file), tokens, zoom);
      if (node.group.zIndex() !== index) node.group.zIndex(index);
    });
    for (const [id, node] of this.nodes) {
      if (seen.has(id)) continue;
      node.group.destroy();
      this.nodes.delete(id);
    }
    return placements;
  }

  private createNode(id: string): ImageNode {
    const node: ImageNode = {
      group: new Konva.Group(),
      bitmap: new KonvaImage({ image: undefined }),
      placeholder: new KonvaRect(),
      label: new KonvaText({ align: 'center', verticalAlign: 'middle', wrap: 'char' }),
      title: new KonvaText({ wrap: 'none', ellipsis: true, fontStyle: 'bold' }),
    };
    node.group.add(node.placeholder, node.bitmap, node.label, node.title);
    this.layer.add(node.group);
    this.nodes.set(id, node);
    return node;
  }
}

function updateNode(
  node: ImageNode,
  image: ProjectImage,
  placement: Placement,
  state: DisplayImage<ImageBitmap> | undefined,
  tokens: CanvasTokens,
  zoom: number,
): void {
  const rect = imageCanvasRect(image, placement);
  node.group.position({ x: rect.x, y: rect.y });
  const box = { width: rect.width, height: rect.height };

  const ready = state?.status === 'ready';
  node.bitmap.setAttrs({
    ...box,
    visible: ready,
    image: ready ? state.bitmap : undefined,
  });

  const broken = state?.status === 'missing' || state?.status === 'error';
  node.placeholder.setAttrs({
    ...box,
    visible: !ready,
    fill: tokens.surface,
    stroke: broken ? tokens.warning : tokens.border,
    strokeWidth: (broken ? 2 : 1) / zoom,
    dash: broken ? [8 / zoom, 6 / zoom] : [],
  });

  updateTitle(node, image, rect.width, tokens, zoom);

  const message =
    state?.status === 'missing'
      ? t('canvas.imageMissing')
      : state?.status === 'error'
        ? t('canvas.imageError')
        : null;
  const padding = Math.min(rect.width, rect.height) * 0.05;
  if (message === null) {
    node.label.visible(false);
    return;
  }
  node.label.setAttrs({
    visible: true,
    text: `⚠ ${message}\n${image.file}`,
    x: padding,
    y: padding,
    width: Math.max(0, rect.width - 2 * padding),
    height: Math.max(0, rect.height - 2 * padding),
    fontSize: Math.max(Math.min(rect.width, rect.height) * 0.06, 12 / zoom),
    fill: broken ? tokens.warning : tokens.textMuted,
  });
}

/** Rótulo com o nome da imagem (ou do arquivo) logo acima dela. */
function updateTitle(
  node: ImageNode,
  image: ProjectImage,
  width: number,
  tokens: CanvasTokens,
  zoom: number,
): void {
  // Tela pequena demais para caber um rótulo legível: esconde.
  if (width * zoom < IMAGE_TITLE_MIN_WIDTH) {
    node.title.visible(false);
    return;
  }
  const fontSize = IMAGE_TITLE_FONT_SIZE / zoom;
  node.title.setAttrs({
    visible: true,
    text: image.name ?? image.file,
    x: 0,
    y: -(IMAGE_TITLE_FONT_SIZE + IMAGE_TITLE_GAP) / zoom,
    width,
    height: fontSize * 1.2,
    fontSize,
    fill: image.name === null ? tokens.textMuted : tokens.text,
  });
}

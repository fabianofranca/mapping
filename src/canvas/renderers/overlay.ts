// Sobreposições: contorno e alças da seleção, destaque do item pego, rascunho
// do desenho e alvo de um arrastar-e-soltar de arquivos.
import Konva from 'konva/lib/Core';
import { Rect as KonvaRect } from 'konva/lib/shapes/Rect';
import { Text as KonvaText } from 'konva/lib/shapes/Text';
import {
  canEditImagePlacement,
  canEditMarkingGeometry,
  imageCanvasRect,
  markingCanvasRectOf,
  projectIndex,
  type Placement,
  type Rect,
} from '../../model';
import { resolveSelection, sameItem } from '../../store/ui';
import { visibleArea, type Frame } from '../frame';
import { CORNERS, cornerPoint, type Corner } from '../imageGeometry';
import { isDrawableRect, markingCanvasRect, placementOfSpace } from '../markingGeometry';
import { LockBadge } from './lockBadge';
import type { HeaderLookup } from './markings';
import { HALO_WIDTH, SELECTION_STROKE, fontStyle, intersectRects } from './metrics';

/** Etiqueta do nome (px de tela): recuo interno, vão até a borda e largura máxima. */
const NAME_TAG_PADDING = 4;
const NAME_TAG_GAP = 2;
const NAME_TAG_MAX_WIDTH = 240;
/** Vão entre o título da imagem e a borda de cima dela (o mesmo de `images.ts`). */
const IMAGE_TITLE_GAP = 4;
const NO_HEADERS: HeaderLookup = { get: () => undefined };

export type OverlayFrame = Pick<
  Frame,
  | 'project'
  | 'readOnly'
  | 'preview'
  | 'draft'
  | 'dropTarget'
  | 'absorb'
  | 'hoverLock'
  | 'tokens'
  | 'selection'
  | 'items'
  | 'mode'
  | 'viewport'
  | 'size'
>;

export class OverlayRenderer {
  /** Recebe a classe `canvas-host--drop` quando o alvo de soltar é a área vazia. */
  private readonly container: HTMLElement;
  readonly selectionOutline = new KonvaRect({ visible: false });
  readonly draftRect = new KonvaRect({ visible: false });
  readonly dropRect = new KonvaRect({ visible: false });
  /** Destaques dos itens que o desenho ou o redimensionamento absorveria ao soltar (um reaproveitado por item). */
  private readonly absorbRects: KonvaRect[] = [];
  /** Contornos dos itens selecionados que não são o primário (um reaproveitado por item). */
  private readonly secondaryRects: KonvaRect[] = [];
  private readonly layer: Konva.Layer;
  readonly handles = new Map<Corner, KonvaRect>();
  /** Etiqueta com o nome da marcação selecionada, acima do canto superior esquerdo. */
  readonly nameTag = new Konva.Group({ visible: false });
  readonly nameTagBox = new KonvaRect();
  readonly nameTagText = new KonvaText({ wrap: 'none', ellipsis: true });
  /** Emblema do cadeado: um no item selecionado e outro no item trancado sob o mouse. */
  readonly selectionLock = new LockBadge();
  readonly hoverLockBadge = new LockBadge();

  constructor(layer: Konva.Layer, container: HTMLElement) {
    this.container = container;
    this.layer = layer;
    this.nameTag.add(this.nameTagBox, this.nameTagText);
    layer.add(this.selectionOutline, this.draftRect, this.dropRect);
    for (const corner of CORNERS) {
      const handle = new KonvaRect({ visible: false });
      this.handles.set(corner, handle);
      layer.add(handle);
    }
    layer.add(this.nameTag, this.selectionLock.group, this.hoverLockBadge.group);
  }

  /** Os nós dos destaques de absorção (reaproveitados; os que não servem ficam invisíveis). */
  absorbHighlights(): readonly KonvaRect[] {
    return this.absorbRects;
  }

  /** Os nós dos contornos de seleção secundários (reaproveitados; os que não servem ficam invisíveis). */
  secondaryHighlights(): readonly KonvaRect[] {
    return this.secondaryRects;
  }

  /** Há algo ancorado na parte visível da tela (a etiqueta do nome, o cadeado): pan precisa redesenhar. */
  get followsView(): boolean {
    return (
      this.nameTag.visible() ||
      this.selectionLock.group.visible() ||
      this.hoverLockBadge.group.visible()
    );
  }

  /** `headers`: rótulos de nome desenhados pelas marcações (a etiqueta desvia do pai). */
  render(
    frame: OverlayFrame,
    placements: ReadonlyMap<string, Placement>,
    headers: HeaderLookup = NO_HEADERS,
  ): void {
    this.renderDraft(frame, placements);
    this.renderAbsorb(frame);
    this.renderSecondarySelection(frame, placements);
    this.renderSelection(frame, placements, headers);
    this.renderHoverLock(frame, placements);
    this.renderDropTarget(frame);
  }

  /** Cadeado no item trancado sob o mouse (a menos que seja o selecionado, que já tem o dele). */
  private renderHoverLock(
    frame: OverlayFrame,
    placements: ReadonlyMap<string, Placement>,
  ): void {
    const { project, hoverLock: hover, selection } = frame;
    const same = hover && selection?.kind === hover.kind && selection.id === hover.id;
    const target =
      hover && !same && project ? lockedRect(project, hover, placements) : null;
    if (!target || !hover) {
      this.hoverLockBadge.hide();
      return;
    }
    this.hoverLockBadge.show(
      target.rect,
      visibleArea(frame.size, frame.viewport),
      frame.viewport.scale,
      frame.tokens,
      target.inherited,
    );
  }

  private renderDropTarget(frame: OverlayFrame): void {
    const { project, dropTarget: target, tokens } = frame;
    const zoom = frame.viewport.scale;
    this.container.classList.toggle(
      'canvas-host--drop',
      target?.containerId === null && target.markingId === undefined,
    );
    const index = project && projectIndex(project);
    const marking = target?.markingId ? index?.markings.get(target.markingId) : undefined;
    const image = target?.containerId
      ? index?.containers.get(target.containerId)
      : undefined;
    const rect =
      marking && project
        ? markingCanvasRectOf(project, marking)
        : image && imageCanvasRect(image, image.placement);
    if (!rect) {
      this.dropRect.visible(false);
      return;
    }
    this.dropRect.setAttrs({
      ...rect,
      visible: true,
      stroke: tokens.select,
      strokeWidth: (3 * SELECTION_STROKE) / zoom,
      dash: [10 / zoom, 6 / zoom],
    });
  }

  /**
   * Itens que seriam absorvidos se o gesto terminasse agora: traço e preenchimento do token
   * novo, por cima da imagem e abaixo da seleção.
   */
  private renderAbsorb(frame: OverlayFrame): void {
    const { absorb, tokens } = frame;
    const zoom = frame.viewport.scale;
    while (this.absorbRects.length < absorb.length) {
      const rect = new KonvaRect({ visible: false, listening: false });
      this.layer.add(rect);
      rect.moveToBottom(); // Abaixo do rascunho, da seleção e das alças.
      this.absorbRects.push(rect);
    }
    this.absorbRects.forEach((node, i) => {
      const rect = absorb[i];
      if (!rect) {
        node.visible(false);
        return;
      }
      node.setAttrs({
        ...rect,
        visible: true,
        stroke: tokens.absorb,
        strokeWidth: (2 * SELECTION_STROKE) / zoom,
        fill: tokens.absorbFill,
      });
    });
  }

  /**
   * Seleção múltipla: os itens selecionados que não são o primário ganham um contorno no
   * retângulo deles (container ou marcação), sem alças, cadeado nem etiqueta de nome, que são
   * só do primário. Usa o projeto do quadro (que já tem a prévia do gesto) e as posições dos
   * containers do quadro, então acompanha o arrasto conjunto.
   */
  private renderSecondarySelection(
    frame: OverlayFrame,
    placements: ReadonlyMap<string, Placement>,
  ): void {
    const { project, items, selection, tokens } = frame;
    const zoom = frame.viewport.scale;
    const rects: Rect[] = [];
    if (project && items.length > 0) {
      const index = projectIndex(project);
      for (const item of items) {
        if (sameItem(item, selection)) continue;
        if (item.kind === 'image') {
          const image = index.containers.get(item.id);
          if (image) {
            rects.push(
              imageCanvasRect(image, placements.get(image.id) ?? image.placement),
            );
          }
          continue;
        }
        const marking = index.markings.get(item.id);
        const placement = marking && placementOfSpace(placements, marking.containerId);
        if (marking && placement) rects.push(markingCanvasRect(placement, marking.rect));
      }
    }
    while (this.secondaryRects.length < rects.length) {
      const rect = new KonvaRect({ visible: false, listening: false });
      this.layer.add(rect);
      rect.moveToBottom(); // Abaixo do rascunho, da seleção e das alças.
      this.secondaryRects.push(rect);
    }
    this.secondaryRects.forEach((node, i) => {
      const rect = rects[i];
      if (!rect) {
        node.visible(false);
        return;
      }
      node.setAttrs({
        ...rect,
        visible: true,
        stroke: tokens.selectSecondary,
        strokeWidth: SELECTION_STROKE / zoom,
      });
    });
  }

  private renderDraft(
    frame: OverlayFrame,
    placements: ReadonlyMap<string, Placement>,
  ): void {
    const { draft, tokens } = frame;
    const zoom = frame.viewport.scale;
    const placement = draft && placementOfSpace(placements, draft.containerId);
    if (!draft || !placement) {
      this.draftRect.visible(false);
      return;
    }
    const valid = isDrawableRect(draft.rect);
    this.draftRect.setAttrs({
      ...markingCanvasRect(placement, draft.rect),
      visible: true,
      stroke: valid ? tokens.select : tokens.invalid,
      strokeWidth: SELECTION_STROKE / zoom,
      dash: [6 / zoom, 4 / zoom],
    });
  }

  private renderSelection(
    frame: OverlayFrame,
    placements: ReadonlyMap<string, Placement>,
    headers: HeaderLookup,
  ): void {
    const { preview, tokens } = frame;
    const zoom = frame.viewport.scale;
    const selected = resolveSelection(frame.project, frame.selection);
    // Alças só no modo Navegar (em Desenhar, arrastar sempre desenha) e se o item pode mudar.
    const handlesAllowed = !frame.readOnly && frame.mode === 'navigate';
    // ME4: seleção da seta (canvas) — por ora a seta selecionada não tem contorno nem alças.
    if (!selected || selected.kind === 'arrow') {
      this.selectionLock.hide();
      this.selectionOutline.visible(false);
      this.nameTag.visible(false);
      for (const handle of this.handles.values()) handle.visible(false);
      return;
    }

    let rect: Rect;
    let color = tokens.select;
    if (selected.kind === 'image') {
      const { image } = selected;
      const invalid = preview?.containerId === image.id && !preview.valid;
      if (invalid) color = tokens.invalid;
      rect = imageCanvasRect(image, placements.get(image.id) ?? image.placement);
      this.selectionOutline.setAttrs({
        ...rect,
        visible: true,
        stroke: color,
        strokeWidth: (SELECTION_STROKE * (invalid ? 2 : 1)) / zoom,
      });
      this.nameTag.visible(false);
    } else {
      // A borda da marcação selecionada já fica mais grossa; aqui só as alças.
      const placement =
        placementOfSpace(placements, selected.marking.containerId) ??
        selected.space.placement;
      rect = markingCanvasRect(placement, selected.marking.rect);
      this.selectionOutline.visible(false);
      // Sem container (marcação do canvas), não há título de imagem a evitar.
      const imageTop = selected.image
        ? imageCanvasRect(selected.image, placement).y
        : -Infinity;
      const { parentId } = selected.marking;
      const parentLabel = parentId === null ? undefined : headers.get(parentId);
      this.renderNameTag(frame, rect, selected.marking.name, imageTop, parentLabel);
    }

    const selectedId =
      selected.kind === 'image' ? selected.image.id : selected.marking.id;
    const lock = frame.project
      ? lockedRect(frame.project, { kind: selected.kind, id: selectedId }, placements)
      : null;
    // Sem alças no item trancado; com o cadeado na seleção (esmaecido se vem do pai).
    const showHandles = handlesAllowed && lock === null;
    if (lock) {
      this.selectionLock.show(
        lock.rect,
        visibleArea(frame.size, frame.viewport),
        zoom,
        tokens,
        lock.inherited,
      );
    } else {
      this.selectionLock.hide();
    }

    const side = tokens.handleSize / zoom;
    for (const [corner, handle] of this.handles) {
      const c = cornerPoint(rect, corner);
      handle.setAttrs({
        visible: showHandles,
        x: c.x - side / 2,
        y: c.y - side / 2,
        width: side,
        height: side,
        fill: tokens.line,
        stroke: color,
        strokeWidth: SELECTION_STROKE / zoom,
      });
    }
  }

  /**
   * Nome da marcação selecionada numa etiqueta acima do canto superior esquerdo (por dentro
   * quando não há espaço acima na tela). Encostada no topo da imagem, sobe acima do título
   * dela em vez de cobri-lo; sobre o rótulo do pai (`parentLabel`), desce para baixo dele,
   * como o rótulo da filha não selecionada. Com o canto fora da tela, a etiqueta fica
   * ancorada na borda visível. Sem nome, sem etiqueta.
   */
  private renderNameTag(
    frame: OverlayFrame,
    rect: Rect,
    name: string | null,
    imageTop: number,
    parentLabel?: Rect,
  ): void {
    const { tokens, viewport } = frame;
    const zoom = viewport.scale;
    if (name === null || name === '') {
      this.nameTag.visible(false);
      return;
    }
    const { size, line, weight } = tokens.type.name;
    const height = line + 2 * HALO_WIDTH;
    this.nameTagText.setAttrs({
      text: name,
      fontSize: size,
      fontFamily: tokens.fontFamily,
      fontStyle: fontStyle(weight),
      fill: tokens.nameTagText,
      x: NAME_TAG_PADDING,
      y: (height - size) / 2,
      width: undefined,
    });
    const width = Math.min(
      this.nameTagText.width() + 2 * NAME_TAG_PADDING,
      NAME_TAG_MAX_WIDTH,
    );
    this.nameTagText.width(width - 2 * NAME_TAG_PADDING);
    this.nameTagText.height(size);
    this.nameTagBox.setAttrs({
      width,
      height,
      fill: tokens.nameTag,
      stroke: tokens.halo,
      strokeWidth: HALO_WIDTH,
      cornerRadius: tokens.radius.sm,
    });
    const view = visibleArea(frame.size, viewport);
    const step = (height + NAME_TAG_GAP) / zoom;
    // Faixa do título da imagem, logo acima dela: a etiqueta não a cobre.
    const titleTop = imageTop - (tokens.type.image.line + IMAGE_TITLE_GAP) / zoom;
    let aboveY = rect.y - step;
    if (aboveY < imageTop && rect.y - NAME_TAG_GAP / zoom > titleTop) {
      aboveY = titleTop - step;
    }
    const above = aboveY >= view.y;
    const top = Math.max(rect.y, view.y);
    const x = Math.max(rect.x, view.x);
    let y = above ? aboveY : top + NAME_TAG_GAP / zoom;
    const tag = { x, y, width: width / zoom, height: height / zoom };
    if (parentLabel && intersectRects(tag, parentLabel)) {
      y = parentLabel.y + parentLabel.height + NAME_TAG_GAP / zoom;
    }
    this.nameTag.setAttrs({
      visible: true,
      x,
      y,
      scaleX: 1 / zoom,
      scaleY: 1 / zoom,
    });
  }
}

/**
 * Retângulo (canvas) do item se a geometria dele está travada, com `inherited` quando a trava vem
 * de um ancestral; `null` se ele é livre. Marcação: ela ou um ancestral trancado; imagem: a
 * própria ou uma marcação do canvas que a contém (trancada, ou com ancestral trancado).
 */
function lockedRect(
  project: NonNullable<OverlayFrame['project']>,
  item: { readonly kind: 'image' | 'marking'; readonly id: string },
  placements: ReadonlyMap<string, Placement>,
): { readonly rect: Rect; readonly inherited: boolean } | null {
  const index = projectIndex(project);
  if (item.kind === 'image') {
    const image = index.containers.get(item.id);
    if (!image || canEditImagePlacement(project, image.id)) return null;
    return {
      rect: imageCanvasRect(image, placements.get(image.id) ?? image.placement),
      inherited: !image.locked,
    };
  }
  const marking = index.markings.get(item.id);
  if (!marking || canEditMarkingGeometry(project, marking.id)) return null;
  const placement =
    marking.containerId === null
      ? placementOfSpace(placements, null)
      : (placements.get(marking.containerId) ??
        index.containers.get(marking.containerId)?.placement);
  if (!placement) return null;
  return {
    rect: markingCanvasRect(placement, marking.rect),
    inherited: !marking.locked,
  };
}

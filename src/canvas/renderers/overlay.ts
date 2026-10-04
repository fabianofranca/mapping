// Sobreposições: contorno e alças da seleção, destaque do item pego, rascunho
// do desenho e alvo de um arrastar-e-soltar de arquivos.
import Konva from 'konva/lib/Core';
import { Rect as KonvaRect } from 'konva/lib/shapes/Rect';
import { Text as KonvaText } from 'konva/lib/shapes/Text';
import {
  canEditImagePlacement,
  canResizeMarking,
  imageCanvasRect,
  projectIndex,
  type Placement,
  type Rect,
} from '../../model';
import { resolveSelection } from '../../store/ui';
import { visibleArea, type Frame } from '../frame';
import { CORNERS, cornerPoint, type Corner } from '../imageGeometry';
import { isDrawableRect, markingCanvasRect } from '../markingGeometry';
import { LockBadge } from './lockBadge';
import { HALO_WIDTH, SELECTION_STROKE, fontStyle } from './metrics';

/** Etiqueta do nome (px de tela): recuo interno, vão até a borda e largura máxima. */
const NAME_TAG_PADDING = 4;
const NAME_TAG_GAP = 2;
const NAME_TAG_MAX_WIDTH = 240;

export type OverlayFrame = Pick<
  Frame,
  | 'project'
  | 'readOnly'
  | 'preview'
  | 'draft'
  | 'dropTarget'
  | 'grabbed'
  | 'hoverLock'
  | 'tokens'
  | 'selection'
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
  readonly grabRect = new KonvaRect({ visible: false });
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
    this.nameTag.add(this.nameTagBox, this.nameTagText);
    layer.add(this.selectionOutline, this.draftRect, this.dropRect, this.grabRect);
    for (const corner of CORNERS) {
      const handle = new KonvaRect({ visible: false });
      this.handles.set(corner, handle);
      layer.add(handle);
    }
    layer.add(this.nameTag, this.selectionLock.group, this.hoverLockBadge.group);
  }

  /** Há algo ancorado na parte visível da tela (a etiqueta do nome, o cadeado): pan precisa redesenhar. */
  get followsView(): boolean {
    return (
      this.nameTag.visible() ||
      this.selectionLock.group.visible() ||
      this.hoverLockBadge.group.visible()
    );
  }

  render(frame: OverlayFrame, placements: ReadonlyMap<string, Placement>): void {
    this.renderDraft(frame, placements);
    this.renderSelection(frame, placements);
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
    this.container.classList.toggle('canvas-host--drop', target?.imageId === null);
    const image = target?.imageId
      ? project && projectIndex(project).images.get(target.imageId)
      : undefined;
    if (!image) {
      this.dropRect.visible(false);
      return;
    }
    this.dropRect.setAttrs({
      ...imageCanvasRect(image, image.placement),
      visible: true,
      stroke: tokens.select,
      strokeWidth: (3 * SELECTION_STROKE) / zoom,
      dash: [10 / zoom, 6 / zoom],
    });
  }

  private renderDraft(
    frame: OverlayFrame,
    placements: ReadonlyMap<string, Placement>,
  ): void {
    const { draft, tokens } = frame;
    const zoom = frame.viewport.scale;
    const placement = draft && placements.get(draft.imageId);
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
  ): void {
    const { preview, grabbed, tokens } = frame;
    const zoom = frame.viewport.scale;
    const selected = resolveSelection(frame.project, frame.selection);
    // Alças só no modo Navegar (em Desenhar, arrastar sempre desenha) e se o item pode mudar.
    const handlesAllowed = !frame.readOnly && frame.mode === 'navigate';
    if (!selected) {
      this.selectionLock.hide();
      this.grabRect.visible(false);
      this.selectionOutline.visible(false);
      this.nameTag.visible(false);
      for (const handle of this.handles.values()) handle.visible(false);
      return;
    }

    let rect: Rect;
    let color = tokens.select;
    if (selected.kind === 'image') {
      const { image } = selected;
      const invalid = preview?.imageId === image.id && !preview.valid;
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
      const placement = placements.get(selected.image.id) ?? selected.image.placement;
      rect = markingCanvasRect(placement, selected.marking.rect);
      this.selectionOutline.visible(false);
      this.renderNameTag(frame, rect, selected.marking.name);
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
    const isGrabbed = grabbed?.kind === selected.kind && grabbed.id === selectedId;
    this.grabRect.setAttrs({
      ...rect,
      visible: isGrabbed,
      fill: tokens.select,
      opacity: tokens.opacity.grabbed,
      stroke: tokens.select,
      strokeWidth: (2 * SELECTION_STROKE) / zoom,
      shadowColor: tokens.grabShadow.color,
      shadowBlur: tokens.grabShadow.blur / zoom,
    });

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
   * quando não há espaço acima na tela). Com o canto fora da tela, a etiqueta fica ancorada
   * na borda visível. Sem nome, sem etiqueta.
   */
  private renderNameTag(frame: OverlayFrame, rect: Rect, name: string | null): void {
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
    const above = rect.y - view.y >= (height + NAME_TAG_GAP) / zoom;
    const top = Math.max(rect.y, view.y);
    this.nameTag.setAttrs({
      visible: true,
      x: Math.max(rect.x, view.x),
      y: above ? rect.y - (height + NAME_TAG_GAP) / zoom : top + NAME_TAG_GAP / zoom,
      scaleX: 1 / zoom,
      scaleY: 1 / zoom,
    });
  }
}

/**
 * Retângulo (canvas) do item se a geometria dele está travada, com `inherited` quando a
 * trava vem de um ancestral; `null` se ele é livre. Marcação: ela ou um ancestral
 * trancado; imagem: a própria.
 */
function lockedRect(
  project: NonNullable<OverlayFrame['project']>,
  item: { readonly kind: 'image' | 'marking'; readonly id: string },
  placements: ReadonlyMap<string, Placement>,
): { readonly rect: Rect; readonly inherited: boolean } | null {
  const index = projectIndex(project);
  if (item.kind === 'image') {
    const image = index.images.get(item.id);
    if (!image || canEditImagePlacement(project, image.id)) return null;
    return {
      rect: imageCanvasRect(image, placements.get(image.id) ?? image.placement),
      inherited: false,
    };
  }
  const marking = index.markings.get(item.id);
  const image = marking && index.images.get(marking.imageId);
  if (!marking || !image || canResizeMarking(project, marking.id)) return null;
  return {
    rect: markingCanvasRect(placements.get(image.id) ?? image.placement, marking.rect),
    inherited: !marking.locked,
  };
}

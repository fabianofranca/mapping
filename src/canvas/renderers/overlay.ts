// Sobreposições: contorno e alças da seleção, destaque do item pego, rascunho
// do desenho e alvo de um arrastar-e-soltar de arquivos.
import type Konva from 'konva/lib/Core';
import { Rect as KonvaRect } from 'konva/lib/shapes/Rect';
import { imageCanvasRect, projectIndex, type Placement, type Rect } from '../../model';
import { resolveSelection } from '../../store/ui';
import type { Frame } from '../frame';
import { CORNERS, cornerPoint, type Corner } from '../imageGeometry';
import { isDrawableRect, markingCanvasRect } from '../markingGeometry';
import { SELECTION_STROKE } from './metrics';

/** Lado visível da alça de redimensionamento (px de tela). */
const HANDLE_SIZE = 14;
/** Sombra do item "pego" pelo segurar-e-mover (px de tela). */
const GRAB_SHADOW_BLUR = 14;

export type OverlayFrame = Pick<
  Frame,
  | 'project'
  | 'readOnly'
  | 'preview'
  | 'draft'
  | 'dropTarget'
  | 'grabbed'
  | 'tokens'
  | 'selection'
  | 'mode'
  | 'viewport'
>;

export class OverlayRenderer {
  /** Recebe a classe `canvas-host--drop` quando o alvo de soltar é a área vazia. */
  private readonly container: HTMLElement;
  readonly selectionOutline = new KonvaRect({ visible: false });
  readonly draftRect = new KonvaRect({ visible: false });
  readonly dropRect = new KonvaRect({ visible: false });
  readonly grabRect = new KonvaRect({ visible: false });
  readonly handles = new Map<Corner, KonvaRect>();

  constructor(layer: Konva.Layer, container: HTMLElement) {
    this.container = container;
    layer.add(this.selectionOutline, this.draftRect, this.dropRect, this.grabRect);
    for (const corner of CORNERS) {
      const handle = new KonvaRect({ visible: false });
      this.handles.set(corner, handle);
      layer.add(handle);
    }
  }

  render(frame: OverlayFrame, placements: ReadonlyMap<string, Placement>): void {
    this.renderDraft(frame, placements);
    this.renderSelection(frame, placements);
    this.renderDropTarget(frame);
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
      stroke: tokens.accent,
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
      stroke: valid ? tokens.accent : tokens.danger,
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
    // Alças só no modo Navegar (em Desenhar, arrastar sempre desenha).
    const showHandles = !frame.readOnly && frame.mode === 'navigate';
    if (!selected) {
      this.grabRect.visible(false);
      this.selectionOutline.visible(false);
      for (const handle of this.handles.values()) handle.visible(false);
      return;
    }

    let rect: Rect;
    let color = tokens.accent;
    if (selected.kind === 'image') {
      const { image } = selected;
      const invalid = preview?.imageId === image.id && !preview.valid;
      if (invalid) color = tokens.danger;
      rect = imageCanvasRect(image, placements.get(image.id) ?? image.placement);
      this.selectionOutline.setAttrs({
        ...rect,
        visible: true,
        stroke: color,
        strokeWidth: (SELECTION_STROKE * (invalid ? 2 : 1)) / zoom,
      });
    } else {
      // A borda da marcação selecionada já fica mais grossa; aqui só as alças.
      const placement = placements.get(selected.image.id) ?? selected.image.placement;
      rect = markingCanvasRect(placement, selected.marking.rect);
      this.selectionOutline.visible(false);
    }

    const selectedId =
      selected.kind === 'image' ? selected.image.id : selected.marking.id;
    const isGrabbed = grabbed?.kind === selected.kind && grabbed.id === selectedId;
    this.grabRect.setAttrs({
      ...rect,
      visible: isGrabbed,
      fill: tokens.accent,
      opacity: 0.25,
      stroke: tokens.accent,
      strokeWidth: (2 * SELECTION_STROKE) / zoom,
      shadowColor: tokens.accent,
      shadowBlur: GRAB_SHADOW_BLUR / zoom,
      shadowOpacity: 0.8,
    });

    const side = HANDLE_SIZE / zoom;
    for (const [corner, handle] of this.handles) {
      const c = cornerPoint(rect, corner);
      handle.setAttrs({
        visible: showHandles,
        x: c.x - side / 2,
        y: c.y - side / 2,
        width: side,
        height: side,
        fill: tokens.surface,
        stroke: color,
        strokeWidth: SELECTION_STROKE / zoom,
      });
    }
  }
}

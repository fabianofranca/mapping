// Marcações no canvas: borda, alerta de revisão, indicadores de camada e o
// texto do zoom semântico. Só a parte visível na tela é atualizada.
import Konva from 'konva/lib/Core';
import { Circle as KonvaCircle } from 'konva/lib/shapes/Circle';
import { Rect as KonvaRect } from 'konva/lib/shapes/Rect';
import { Text as KonvaText } from 'konva/lib/shapes/Text';
import {
  memoByProject,
  projectIndex,
  topDown,
  type LayerDot,
  type Marking,
  type MarkingVisibility,
  type Placement,
  type Project,
  type Rect,
} from '../../model';
import { visibleArea, type Frame } from '../frame';
import { markingCanvasRect } from '../markingGeometry';
import type { CanvasTokens } from '../theme';
import {
  ALERT_GLYPH,
  ALERT_SIZE,
  DOT_GAP,
  DOT_MARGIN,
  DOT_RADIUS,
  MAX_DOTS,
  MORE_WIDTH,
  REVIEW_BADGE_SIZE,
  intersectRects,
  sameInputs,
} from './metrics';
import { NO_CARD, semanticPlacement } from './cards';
import {
  createSemanticNode,
  updateSemanticText,
  type SemanticNode,
} from './semanticCard';

/** Espessura da borda das marcações (px de tela): normal e selecionada. */
const MARKING_STROKE = 1;
const MARKING_SELECTED_STROKE = 2;
/** Contorno claro em volta da borda da selecionada, para ela aparecer em fotos escuras. */
const MARKING_HALO = 0.75;
/** Opacidade das marcações sem anotação em nenhuma camada visível. */
const DIMMED_OPACITY = 0.35;
/** Borda de contexto dos pais no modo Ocultar: esmaecida, mas legível sobre fotos. */
const OUTLINE_OPACITY = 0.75;

export interface MarkingNode {
  readonly group: Konva.Group;
  readonly halo: KonvaRect;
  readonly border: KonvaRect;
  readonly badge: KonvaText;
  /** Bolinhas das camadas visíveis com anotação, recortadas no retângulo da marcação. */
  readonly indicators: Konva.Group;
  readonly dots: readonly KonvaCircle[];
  readonly more: KonvaText;
  /** Alerta de anotação incompleta, depois das bolinhas. */
  readonly alert: KonvaText;
  /** Texto do zoom semântico, recortado no retângulo da marcação. */
  readonly text: SemanticNode;
  /** Entradas do último `updateMarkingNode`: iguais, o nó já está certo. */
  drawn: readonly unknown[] | null;
}

export type MarkingFrame = Pick<
  Frame,
  | 'project'
  | 'selection'
  | 'semantic'
  | 'size'
  | 'viewport'
  | 'dots'
  | 'incomplete'
  | 'visibility'
  | 'tokens'
  | 'card'
>;

const NO_LAYER_DOTS: readonly LayerDot[] = [];
const NO_CHILDREN: ReadonlyMap<string | null, readonly Marking[]> = new Map();

/** Marcações de cima para baixo na hierarquia, uma vez por versão do projeto. */
const topDownMarkings = memoByProject((p: Project) => topDown(p.markings));

/** Nós das marcações, reaproveitados entre quadros (um grupo por marcação). */
export class MarkingRenderer {
  private readonly layer: Konva.Layer;
  private readonly nodes = new Map<string, MarkingNode>();

  constructor(layer: Konva.Layer) {
    this.layer = layer;
  }

  /** Nó desenhado para a marcação (ou `undefined` se ela não está no canvas). */
  node(id: string): MarkingNode | undefined {
    return this.nodes.get(id);
  }

  /** Marcações de cima para baixo na hierarquia: as filhas ficam por cima dos pais. */
  render(frame: MarkingFrame, placements: ReadonlyMap<string, Placement>): void {
    const { project, selection, semantic, dots, incomplete, tokens } = frame;
    const zoom = frame.viewport.scale;
    const view = visibleArea(frame.size, frame.viewport);
    const lookup = project ? projectIndex(project) : null;
    const children = lookup?.children ?? NO_CHILDREN;
    const ordered = project ? topDownMarkings(project) : [];
    const seen = new Set<string>();
    let index = 0;
    for (const marking of ordered) {
      const placement = placements.get(marking.imageId);
      if (!placement) continue;
      seen.add(marking.id);
      const node = this.nodes.get(marking.id) ?? this.createNode(marking.id);
      const markingRect = markingCanvasRect(placement, marking.rect);
      // Fora da tela: nem atualiza nem desenha (a camada não recebe toques, então é seguro).
      const visibility = frame.visibility.get(marking.id) ?? 'full';
      const onScreen =
        visibility !== 'hidden' && intersectRects(markingRect, view) !== null;
      node.group.visible(onScreen);
      // Reordenar custa caro no Konva: só quando a posição na pilha mudou.
      if (node.group.zIndex() !== index) node.group.zIndex(index);
      index++;
      if (!onScreen) continue;
      const selected = selection?.kind === 'marking' && selection.id === marking.id;
      // Cor da borda escolhida para a imagem (sem escolha, a neutra do tema).
      const lineColor = lookup?.images.get(marking.imageId)?.markingColor ?? null;
      const markingDots = dots.get(marking.id) ?? NO_LAYER_DOTS;
      const markingIncomplete = incomplete.has(marking.id);
      // Pan sem mudar nada da marcação (o caso comum): borda e indicadores ficam.
      const inputs = [
        marking,
        placement,
        selected,
        visibility,
        markingDots,
        markingIncomplete,
        tokens,
        lineColor,
        zoom,
      ];
      if (!sameInputs(node.drawn, inputs)) {
        node.drawn = inputs;
        updateMarkingNode(
          node,
          marking,
          placement,
          selected,
          visibility,
          markingDots,
          markingIncomplete,
          lineColor ? { ...tokens, marking: lineColor } : tokens,
          zoom,
        );
      }
      // Ancestral de contexto (modo Ocultar): só a borda, sem cartão nem nome.
      const { mode, area } = semanticPlacement(
        marking,
        placement,
        zoom,
        semantic && visibility !== 'outline',
        children.get(marking.id) ?? [],
        frame.visibility,
      );
      updateSemanticText(
        node.text,
        {
          marking,
          markingRect,
          area: area && mode === 'full' ? markingCanvasRect(placement, area) : null,
          view,
          mode,
          card: mode === 'none' ? NO_CARD : frame.card(marking),
          incomplete: markingIncomplete,
        },
        tokens,
        zoom,
      );
    }
    for (const [id, node] of this.nodes) {
      if (seen.has(id)) continue;
      node.group.destroy();
      this.nodes.delete(id);
    }
  }

  private createNode(id: string): MarkingNode {
    const dots = Array.from({ length: MAX_DOTS }, () => new KonvaCircle());
    const node: MarkingNode = {
      group: new Konva.Group(),
      halo: new KonvaRect(),
      border: new KonvaRect(),
      badge: new KonvaText({ text: '⚠', fontStyle: 'bold' }),
      indicators: new Konva.Group(),
      dots,
      more: new KonvaText({ fontStyle: 'bold' }),
      alert: new KonvaText({ text: ALERT_GLYPH, fontStyle: 'bold' }),
      text: createSemanticNode(),
      drawn: null,
    };
    node.indicators.add(...dots, node.more, node.alert);
    node.group.add(node.halo, node.border, node.badge, node.indicators, node.text.group);
    this.layer.add(node.group);
    this.nodes.set(id, node);
    return node;
  }
}

function updateMarkingNode(
  node: MarkingNode,
  marking: Marking,
  placement: Placement,
  selected: boolean,
  visibility: MarkingVisibility,
  dots: readonly LayerDot[],
  incomplete: boolean,
  tokens: CanvasTokens,
  zoom: number,
): void {
  const rect = markingCanvasRect(placement, marking.rect);
  // Sem anotação (própria ou herdada) nas camadas visíveis: esmaecida (a selecionada, nunca).
  node.group.opacity(
    visibility === 'dim'
      ? DIMMED_OPACITY
      : visibility === 'outline'
        ? OUTLINE_OPACITY
        : 1,
  );
  const stroke = (selected ? MARKING_SELECTED_STROKE : MARKING_STROKE) / zoom;
  const dash = marking.needsReview ? [6 / zoom, 4 / zoom] : [];
  // Contorno claro só na selecionada; as demais ficam com a linha de 1 px.
  node.halo.setAttrs({
    ...rect,
    visible: selected,
    stroke: tokens.surface,
    strokeWidth: stroke + (2 * MARKING_HALO) / zoom,
    opacity: 0.7,
  });
  node.border.setAttrs({ ...rect, stroke: tokens.marking, strokeWidth: stroke, dash });
  // Texto do Konva remede a cada mudança de atributo: só mexe nos que aparecem.
  // Ancestral de contexto (modo Ocultar): só a borda, sem alerta nem bolinhas.
  const outline = visibility === 'outline';
  if (marking.needsReview && !outline) {
    const badge = REVIEW_BADGE_SIZE / zoom;
    node.badge.setAttrs({
      visible: true,
      x: rect.x + badge / 3,
      y: rect.y + badge / 3,
      fontSize: badge,
      fill: tokens.warning,
      stroke: tokens.surface,
      strokeWidth: 3 / zoom,
      fillAfterStrokeEnabled: true,
    });
  } else {
    node.badge.visible(false);
  }
  updateIndicators(
    node,
    marking,
    rect,
    outline ? [] : dots,
    incomplete && !outline,
    tokens,
    zoom,
  );
}

/**
 * Bolinhas coloridas no canto superior esquerdo, uma por camada visível com
 * anotação, e o alerta de incompleta logo depois delas.
 */
function updateIndicators(
  node: MarkingNode,
  marking: Marking,
  rect: Rect,
  layers: readonly LayerDot[],
  incomplete: boolean,
  tokens: CanvasTokens,
  zoom: number,
): void {
  if (layers.length === 0) {
    node.indicators.visible(false);
    return;
  }
  node.indicators.setAttrs({
    visible: true,
    clip: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
  });
  const radius = DOT_RADIUS / zoom;
  const step = (2 * DOT_RADIUS + DOT_GAP) / zoom;
  // Com o alerta de revisão no canto, as bolinhas começam depois dele.
  const left = marking.needsReview ? (REVIEW_BADGE_SIZE + DOT_MARGIN) / zoom : 0;
  const x0 = rect.x + left + (DOT_MARGIN + DOT_RADIUS) / zoom;
  const cy = rect.y + (DOT_MARGIN + DOT_RADIUS) / zoom;
  const shown = Math.min(layers.length, MAX_DOTS);
  node.dots.forEach((dot, i) => {
    if (i >= shown) {
      dot.visible(false);
      return;
    }
    // Só por herança: bolinha vazada (contorno na cor da camada).
    const item = layers[i];
    const hollow = item?.inheritedOnly ?? false;
    dot.setAttrs({
      visible: true,
      x: x0 + i * step,
      y: cy,
      radius: hollow ? radius - 0.5 / zoom : radius,
      fill: hollow ? tokens.surface : (item?.layer.color ?? tokens.marking),
      stroke: hollow ? (item?.layer.color ?? tokens.marking) : tokens.surface,
      strokeWidth: (hollow ? 2 : 1) / zoom,
    });
  });
  const extra = layers.length - MAX_DOTS;
  const afterDots = x0 + shown * step - radius;
  if (incomplete) {
    const size = ALERT_SIZE / zoom;
    node.alert.setAttrs({
      visible: true,
      x: afterDots + (extra > 0 ? MORE_WIDTH / zoom : 0),
      y: cy - size / 2,
      fontSize: size,
      fill: tokens.warning,
      stroke: tokens.surface,
      strokeWidth: 3 / zoom,
      fillAfterStrokeEnabled: true,
    });
  } else {
    node.alert.visible(false);
  }
  if (extra <= 0) {
    node.more.visible(false);
    return;
  }
  const fontSize = 11 / zoom;
  node.more.setAttrs({
    visible: true,
    text: `+${extra}`,
    x: afterDots,
    y: cy - fontSize / 2,
    fontSize,
    fill: tokens.marking,
    stroke: tokens.surface,
    strokeWidth: 3 / zoom,
    fillAfterStrokeEnabled: true,
  });
}

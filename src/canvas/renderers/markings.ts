// Marcações no canvas: borda, alerta de revisão, indicadores de camada e o
// nome do zoom semântico. Só a parte visível na tela é atualizada.
import Konva from 'konva/lib/Core';
import { Rect as KonvaRect } from 'konva/lib/shapes/Rect';
import { Text as KonvaText } from 'konva/lib/shapes/Text';
import {
  memoByProject,
  projectIndex,
  topDown,
  type Marking,
  type MarkingVisibility,
  type Placement,
  type Project,
  type Rect,
} from '../../model';
import { visibleArea, type Frame } from '../frame';
import { semanticMode } from '../semanticText';
import type { MarkingReviewMark } from '../reviewMarks';
import { markingCanvasRect, placementOfSpace } from '../markingGeometry';
import type { CanvasTokens } from '../theme';
import {
  ALERT_GLYPH,
  ALERT_SIZE,
  CORNER_MARGIN,
  HALO_WIDTH,
  REVIEW_BADGE_SIZE,
  fontStyle,
  intersectRects,
  sameInputs,
} from './metrics';
import {
  TEXT_HEADER_HEIGHT,
  createSemanticNode,
  updateSemanticText,
  type HeaderBand,
  type SemanticNode,
} from './semanticCard';

/** Espessura da borda das marcações (px de tela): normal e selecionada. */
const MARKING_STROKE = 1;
const MARKING_SELECTED_STROKE = 2;
/** Linha dupla da marcação alterada na revisão (px de tela). */
const REVIEW_DOUBLE_STROKE = 3;
/** Traço da borda da marcação do canvas (px de tela): traço longo e vão, para não lembrar a "a revisar". */
const CANVAS_DASH: readonly [number, number] = [10, 6];

export interface MarkingNode {
  readonly group: Konva.Group;
  readonly halo: KonvaRect;
  readonly border: KonvaRect;
  /** Linha do meio da "linha dupla" (alterada, na revisão de propostas). */
  readonly inner: KonvaRect;
  readonly badge: KonvaText;
  /** Recorta o alerta no retângulo da marcação. */
  readonly alertClip: Konva.Group;
  /** Alerta de anotação incompleta, no canto depois do selo "a revisar". */
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
  | 'size'
  | 'viewport'
  | 'incomplete'
  | 'visibility'
  | 'tokens'
  | 'review'
  | 'drawn'
  | 'hoverMarking'
  | 'view'
>;

/** Consulta do rótulo de nome desenhado de uma marcação (canvas). */
export interface HeaderLookup {
  get(id: string): Rect | undefined;
}

/** Marcações de cima para baixo na hierarquia, uma vez por versão do projeto. */
const topDownMarkings = memoByProject((p: Project) => topDown(p.markings));

/**
 * Nós das marcações, reaproveitados entre quadros (um grupo por marcação). As flutuantes vão para
 * `floatingParent`, acima de tudo (containers, componentes e as bordas das demais marcações).
 */
export class MarkingRenderer {
  private readonly layer: Konva.Container;
  private readonly floatingParent: Konva.Container;
  private readonly nodes = new Map<string, MarkingNode>();

  constructor(layer: Konva.Container, floatingParent: Konva.Container = layer) {
    this.layer = layer;
    this.floatingParent = floatingParent;
  }

  /**
   * Retângulo (canvas) do rótulo de nome de cada marcação desenhada no último quadro: a
   * etiqueta da selecionada desvia do rótulo do pai. Calculado só quando pedido.
   */
  readonly headers: HeaderLookup = { get: (id) => this.headerRect(id) };

  /** Nó desenhado para a marcação (ou `undefined` se ela não está no canvas). */
  node(id: string): MarkingNode | undefined {
    return this.nodes.get(id);
  }

  /** Marcações de cima para baixo na hierarquia: as filhas ficam por cima dos pais. */
  render(frame: MarkingFrame, placements: ReadonlyMap<string, Placement>): void {
    const { project, selection, incomplete, tokens, review, drawn } = frame;
    // Modo visualização (`null` fora dele): sem seleção, hover, alerta nem marcas da revisão.
    const mode = frame.view;
    const zoom = frame.viewport.scale;
    const area = visibleArea(frame.size, frame.viewport);
    const lookup = project ? projectIndex(project) : null;
    const ordered = project ? topDownMarkings(project) : [];
    const seen = new Set<string>();
    // Cabeçalho de cada marcação já desenhada (pais antes das filhas).
    const headers = new Map<string, HeaderBand>();
    // A ordem de desenho é por pai: cada pilha (a normal e a das flutuantes) conta a sua.
    let index = 0;
    let floatingIndex = 0;
    for (const marking of ordered) {
      const placement = placementOfSpace(placements, marking.containerId);
      if (!placement) continue;
      seen.add(marking.id);
      const node = this.nodes.get(marking.id) ?? this.createNode(marking.id);
      const parent = marking.floating ? this.floatingParent : this.layer;
      if (node.group.getParent() !== parent) node.group.moveTo(parent);
      const markingRect = markingCanvasRect(placement, marking.rect);
      // Fora da tela: nem atualiza nem desenha (a camada não recebe toques, então é seguro).
      const visibility = frame.visibility.get(marking.id) ?? 'full';
      // Modo visualização: a marcação só aparece se o contorno ou o nome estão ligados.
      const shown = mode === null || mode.outline || mode.names;
      const onScreen =
        visibility !== 'hidden' && shown && intersectRects(markingRect, area) !== null;
      node.group.visible(onScreen);
      // Reordenar custa caro no Konva: só quando a posição na pilha mudou.
      const position = marking.floating ? floatingIndex++ : index++;
      if (node.group.zIndex() !== position) node.group.zIndex(position);
      if (!onScreen) continue;
      const selected =
        mode === null && selection?.kind === 'marking' && selection.id === marking.id;
      // Cor da borda escolhida para a imagem (sem escolha, `cv-line`); a marcação do canvas não
      // tem container: usa o token dela e a borda tracejada.
      const canvasMarking = marking.containerId === null;
      const lineColor = canvasMarking
        ? tokens.canvasMarking
        : (lookup?.containers.get(marking.containerId ?? '')?.markingColor ?? null);
      const markingIncomplete = mode === null && incomplete.has(marking.id);
      const reviewMark =
        mode === null ? (review?.markings.get(marking.id) ?? null) : null;
      // Marcação com o desenho à vista: a borda só aparece sob o mouse ou selecionada (a
      // revisão de propostas, que marca a mudança na própria borda, a mantém).
      const withDrawing = drawn.has(marking.id);
      const showBorder = mode
        ? mode.outline && !withDrawing
        : !withDrawing ||
          selected ||
          frame.hoverMarking === marking.id ||
          (reviewMark?.line ?? null) !== null;
      // Pan sem mudar nada da marcação (o caso comum): borda e indicadores ficam.
      const inputs = [
        reviewMark,
        marking,
        placement,
        selected,
        showBorder,
        visibility,
        markingIncomplete,
        tokens,
        lineColor,
        zoom,
        mode === null,
      ];
      if (!sameInputs(node.drawn, inputs)) {
        node.drawn = inputs;
        updateMarkingNode(
          node,
          marking,
          placement,
          selected,
          showBorder,
          visibility,
          markingIncomplete,
          lineColor ?? tokens.line,
          tokens,
          zoom,
          reviewMark,
          canvasMarking,
          mode === null,
        );
      }
      // Ancestral de contexto (modo Ocultar): só a borda, sem nome. O desenho ocupa o
      // lugar do nome das marcações com componente à vista.
      const pxPerUnit = placement.scale * zoom;
      const textMode =
        visibility !== 'outline' && !withDrawing && (mode?.names ?? true)
          ? semanticMode({
              screenWidth: marking.rect.width * pxPerUnit,
              screenHeight: marking.rect.height * pxPerUnit,
            })
          : 'none';
      const parentHeader = marking.parentId ? headers.get(marking.parentId) : undefined;
      const header = updateSemanticText(
        node.text,
        {
          marking,
          markingRect,
          view: area,
          mode: textMode,
          incomplete: markingIncomplete,
          // Filha começando sob o nome do pai: o dela desce uma linha.
          headerFloor:
            parentHeader &&
            markingRect.y < parentHeader.bottom &&
            markingRect.x < parentHeader.right
              ? parentHeader.bottom
              : null,
        },
        tokens,
        zoom,
      );
      if (header) headers.set(marking.id, header);
    }
    for (const [id, node] of this.nodes) {
      if (seen.has(id)) continue;
      node.group.destroy();
      this.nodes.delete(id);
    }
  }

  private headerRect(id: string): Rect | undefined {
    const node = this.nodes.get(id);
    if (!node?.group.visible() || !node.text.group.visible()) return undefined;
    const { header } = node.text;
    if (!header.visible()) return undefined;
    return {
      x: header.x(),
      y: header.y(),
      width: Math.min(header.width(), header.getTextWidth()),
      height: header.height(),
    };
  }

  private createNode(id: string): MarkingNode {
    const node: MarkingNode = {
      group: new Konva.Group(),
      halo: new KonvaRect(),
      border: new KonvaRect(),
      inner: new KonvaRect(),
      badge: new KonvaText({ text: '⚠' }),
      alertClip: new Konva.Group(),
      alert: new KonvaText({ text: ALERT_GLYPH }),
      text: createSemanticNode(),
      drawn: null,
    };
    node.alertClip.add(node.alert);
    node.group.add(
      node.halo,
      node.border,
      node.inner,
      node.badge,
      node.alertClip,
      node.text.group,
    );
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
  showBorder: boolean,
  visibility: MarkingVisibility,
  incomplete: boolean,
  lineColor: string,
  tokens: CanvasTokens,
  zoom: number,
  review: MarkingReviewMark | null = null,
  canvasMarking = false,
  indicators = true,
): void {
  const rect = markingCanvasRect(placement, marking.rect);
  // Sem anotação (própria ou herdada) nas camadas visíveis: esmaecida (a selecionada, nunca).
  // Na revisão, a rejeitada (visão Atual) também.
  node.group.opacity(
    visibility === 'dim'
      ? tokens.opacity.dimmed
      : visibility === 'outline' || review?.dim
        ? tokens.opacity.ancestor
        : 1,
  );
  const line = review?.line ?? null;
  const base = selected
    ? MARKING_SELECTED_STROKE
    : line === 'changed'
      ? REVIEW_DOUBLE_STROKE
      : line === 'invalid'
        ? MARKING_SELECTED_STROKE
        : MARKING_STROKE;
  const stroke = base / zoom;
  // Tracejada: "a revisar" (reescalada) e, na revisão, criada e inválida; pontilhada: rejeitada;
  // traço longo: a marcação do canvas (sem container).
  const dash =
    line === 'rejected'
      ? [1.5 / zoom, 2.5 / zoom]
      : marking.needsReview || line === 'created' || line === 'invalid'
        ? [6 / zoom, 4 / zoom]
        : canvasMarking
          ? CANVAS_DASH.map((d) => d / zoom)
          : [];
  // Halo por fora e por dentro da linha (um traço mais largo por baixo), em toda marcação:
  // a linha aparece sobre fotos claras e escuras.
  node.halo.setAttrs({
    ...rect,
    visible: showBorder,
    stroke: tokens.halo,
    strokeWidth: stroke + (2 * HALO_WIDTH) / zoom,
    dash,
  });
  node.border.setAttrs({
    ...rect,
    visible: showBorder,
    stroke: selected ? tokens.select : line === 'invalid' ? tokens.invalid : lineColor,
    strokeWidth: stroke,
    dash,
  });
  // Alterada: linha dupla (o traço de 3px com um fio do halo no meio).
  if (line === 'changed' && showBorder) {
    node.inner.setAttrs({
      ...rect,
      visible: true,
      stroke: tokens.halo,
      strokeWidth: 1 / zoom,
      dash,
    });
  } else {
    node.inner.visible(false);
  }
  // Texto do Konva remede a cada mudança de atributo: só mexe nos que aparecem.
  // Ancestral de contexto (modo Ocultar): só a borda, sem alerta.
  const outline = visibility === 'outline' || !indicators;
  if (marking.needsReview && !outline) {
    const badge = REVIEW_BADGE_SIZE / zoom;
    node.badge.setAttrs({
      visible: true,
      x: rect.x + badge / 3,
      y: rect.y + badge / 3,
      fontSize: badge,
      fontFamily: tokens.fontFamily,
      fontStyle: fontStyle(tokens.type.name.weight),
      fill: tokens.warning,
      stroke: tokens.halo,
      strokeWidth: 3 / zoom,
      fillAfterStrokeEnabled: true,
    });
  } else {
    node.badge.visible(false);
  }
  updateAlert(node, marking, rect, incomplete && !outline, tokens, zoom);
}

/** Alerta de incompleta no canto superior esquerdo, depois do selo "a revisar" (se houver). */
function updateAlert(
  node: MarkingNode,
  marking: Marking,
  rect: Rect,
  incomplete: boolean,
  tokens: CanvasTokens,
  zoom: number,
): void {
  if (!incomplete) {
    node.alertClip.visible(false);
    node.alert.visible(false);
    return;
  }
  node.alertClip.setAttrs({
    visible: true,
    clip: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
  });
  // Com o selo de revisão no canto, o alerta começa depois dele.
  const left = marking.needsReview ? REVIEW_BADGE_SIZE : 0;
  const size = ALERT_SIZE / zoom;
  node.alert.setAttrs({
    visible: true,
    x: rect.x + (left + CORNER_MARGIN) / zoom,
    y: rect.y + TEXT_HEADER_HEIGHT / 2 / zoom - size / 2,
    fontSize: size,
    fontFamily: tokens.fontFamily,
    fontStyle: fontStyle(tokens.type.name.weight),
    fill: tokens.warning,
    stroke: tokens.halo,
    strokeWidth: 3 / zoom,
    fillAfterStrokeEnabled: true,
  });
}

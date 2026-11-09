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
import { levelOfDetail, type LevelOfDetail } from './levelOfDetail';
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
/** Máscara de todas as partes do nó penduradas (6 partes em `partsOf`). */
const ALL_PARTS = 0b111111;
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
  /** Entradas do último `updateSemanticText`: iguais, o nome já está certo. */
  textDrawn: readonly unknown[] | null;
  /** Faixa do nome devolvida pelo último `updateSemanticText` (para as filhas desviarem). */
  band: HeaderBand | null;
  /** Partes hoje penduradas no grupo (máscara de `parts`): o Konva percorre todo filho, visível ou não. */
  attached: number;
}

/**
 * O que um quadro mexeu em cada pilha de nós: `main` (camada das marcações) e `floating` (camada
 * das flutuantes). O `CanvasController` só redesenha as camadas que mudaram.
 */
export interface MarkingChanges {
  main: boolean;
  floating: boolean;
  /** Algum nó levado ao grupo de arrasto mudou (a camada de sobreposições se redesenha). */
  drag: boolean;
}

/** Onde os nós das marcações que se movem num gesto ficam: um grupo para cada pilha. */
export interface DragTargets {
  readonly main: Konva.Container;
  readonly floating: Konva.Container;
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
  | 'items'
  | 'view'
>;

/** Consulta do rótulo de nome desenhado de uma marcação (canvas). */
export interface HeaderLookup {
  get(id: string): Rect | undefined;
}

/**
 * Nível de detalhe da marcação pelo tamanho na tela (decisão 4 da etapa canvas-escala). A
 * selecionada (inclusive na seleção múltipla), a sob o mouse e a com marca da revisão são sempre
 * completas. No modo visualização (`picked` vazio, sem hover nem revisão) vale só o tamanho.
 */
function detailOf(
  marking: Marking,
  pxPerUnit: number,
  tokens: CanvasTokens,
  always: boolean,
): LevelOfDetail {
  return levelOfDetail({
    screenWidth: marking.rect.width * pxPerUnit,
    screenHeight: marking.rect.height * pxPerUnit,
    always,
    minFull: tokens.lodMinMarking,
    hide: tokens.lodHideMarking,
  });
}

/** Ids das marcações selecionadas (seleção múltipla incluída). */
function selectedMarkingIds(frame: MarkingFrame): ReadonlySet<string> {
  const ids = new Set<string>();
  if (frame.view !== null) return ids;
  for (const item of frame.items) if (item.kind === 'marking') ids.add(item.id);
  return ids;
}

/** Partes do nó na ordem de desenho. */
function partsOf(node: MarkingNode): readonly (Konva.Group | Konva.Shape)[] {
  return [
    node.halo,
    node.border,
    node.inner,
    node.badge,
    node.alertClip,
    node.text.group,
  ];
}

/**
 * Só as partes visíveis ficam penduradas no grupo: o `drawScene` do Konva percorre todo filho,
 * mesmo escondido, e de longe (nível de detalhe) quase todas estão escondidas. Mexe na árvore só
 * quando o conjunto muda.
 */
function syncParts(node: MarkingNode): void {
  const parts = partsOf(node);
  let mask = 0;
  parts.forEach((part, i) => {
    if (part.visible()) mask |= 1 << i;
  });
  if (mask === node.attached) return;
  node.attached = mask;
  node.group.removeChildren();
  node.group.add(...parts.filter((_, i) => (mask & (1 << i)) !== 0));
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
  /** As marcações que se movem num gesto e onde elas ficam até soltar (decisões 5 e 6). */
  private dragIds: ReadonlySet<string> | null = null;
  private dragTargets: DragTargets | null = null;
  /** Marcações desenhadas (com nó visível) no último quadro. */
  shown = 0;

  constructor(layer: Konva.Container, floatingParent: Konva.Container = layer) {
    this.layer = layer;
    this.floatingParent = floatingParent;
  }

  /**
   * Leva as marcações de `ids` para os grupos de arrasto no próximo `render` (os nós são os mesmos,
   * movidos com `moveTo`), ou as devolve às pilhas de sempre com `null`. Nenhum nó é clonado: o
   * `render` de sempre continua atualizando cada um onde ele estiver.
   */
  setDragged(ids: ReadonlySet<string> | null, targets: DragTargets): void {
    this.dragIds = ids && ids.size > 0 ? ids : null;
    this.dragTargets = targets;
  }

  /** O pai do nó: o grupo de arrasto, se ele se move, senão a pilha de sempre. */
  private parentFor(id: string, floating: boolean): Konva.Container {
    const targets = this.dragTargets;
    if (targets && this.dragIds?.has(id))
      return floating ? targets.floating : targets.main;
    return floating ? this.floatingParent : this.layer;
  }

  /** Qual pilha o pai é: marca no `changes` a camada (ou o grupo de arrasto) que ele mexe. */
  private touchParent(changes: MarkingChanges, parent: Konva.Container | null): void {
    const targets = this.dragTargets;
    if (targets && (parent === targets.main || parent === targets.floating)) {
      changes.drag = true;
    } else if (parent === this.floatingParent) changes.floating = true;
    else changes.main = true;
  }

  /**
   * Retângulo (canvas) do rótulo de nome de cada marcação desenhada no último quadro: a
   * etiqueta da selecionada desvia do rótulo do pai. Calculado só quando pedido.
   */
  readonly headers: HeaderLookup = { get: (id) => this.headerRect(id) };

  /** Nó da marcação (ou `undefined` se ela nunca foi desenhada: nós nascem sob demanda). */
  node(id: string): MarkingNode | undefined {
    return this.nodes.get(id);
  }

  /**
   * Marcações de cima para baixo na hierarquia: as filhas ficam por cima dos pais. Devolve em
   * qual das duas pilhas algum nó mudou (criado, movido, mostrado, escondido, refeito, removido).
   */
  render(
    frame: MarkingFrame,
    placements: ReadonlyMap<string, Placement>,
  ): MarkingChanges {
    const changes: MarkingChanges = { main: false, floating: false, drag: false };
    // O nó que se move num gesto está num grupo de arrasto: mexer nele redesenha só esse grupo.
    let dragged = false;
    const touch = (floating: boolean) => {
      if (dragged) changes.drag = true;
      else if (floating) changes.floating = true;
      else changes.main = true;
    };
    const { project, selection, incomplete, tokens, review, drawn } = frame;
    // Modo visualização (`null` fora dele): sem seleção, hover, alerta nem marcas da revisão.
    const mode = frame.view;
    const zoom = frame.viewport.scale;
    const area = visibleArea(frame.size, frame.viewport);
    const lookup = project ? projectIndex(project) : null;
    const ordered = project ? topDownMarkings(project) : [];
    const seen = new Set<string>();
    const picked = selectedMarkingIds(frame);
    // Cabeçalho de cada marcação já desenhada (pais antes das filhas).
    const headers = new Map<string, HeaderBand>();
    // A ordem de desenho é por pai: cada pilha (a normal e a das flutuantes) conta a sua.
    let index = 0;
    let floatingIndex = 0;
    this.shown = 0;
    for (const marking of ordered) {
      const placement = placementOfSpace(placements, marking.containerId);
      if (!placement) continue;
      seen.add(marking.id);
      dragged = this.dragIds?.has(marking.id) ?? false;
      const markingRect = markingCanvasRect(placement, marking.rect);
      // Fora da tela: nem atualiza nem desenha (a camada não recebe toques, então é seguro).
      const visibility = frame.visibility.get(marking.id) ?? 'full';
      // Modo visualização: a marcação só aparece se o contorno ou o nome estão ligados.
      const shown = mode === null || mode.outline || mode.names;
      const selected =
        mode === null && selection?.kind === 'marking' && selection.id === marking.id;
      const reviewMark =
        mode === null ? (review?.markings.get(marking.id) ?? null) : null;
      const pxPerUnit = placement.scale * zoom;
      const level = detailOf(
        marking,
        pxPerUnit,
        tokens,
        selected ||
          picked.has(marking.id) ||
          (mode === null && frame.hoverMarking === marking.id) ||
          reviewMark !== null,
      );
      const onScreen =
        visibility !== 'hidden' &&
        shown &&
        level !== 'hidden' &&
        intersectRects(markingRect, area) !== null;
      // Nó sob demanda (decisão 8): só nasce no primeiro quadro em que a marcação é desenhada e
      // fica até ela sair do projeto.
      let node = this.nodes.get(marking.id);
      if (!node) {
        if (!onScreen) continue;
        node = this.createNode(marking.id, this.parentFor(marking.id, marking.floating));
        touch(marking.floating);
      }
      const parent = this.parentFor(marking.id, marking.floating);
      if (node.group.getParent() !== parent) {
        this.touchParent(changes, node.group.getParent());
        touch(marking.floating);
        node.group.moveTo(parent);
      }
      if (node.group.visible() !== onScreen) {
        node.group.visible(onScreen);
        touch(marking.floating);
      }
      // Reordenar custa caro no Konva: só quando a posição na pilha mudou. O nó no grupo de arrasto
      // fica na ordem em que chegou (a de cima para baixo), e não conta na pilha de onde saiu.
      if (!dragged) {
        const position = marking.floating ? floatingIndex++ : index++;
        if (node.group.zIndex() !== position) {
          node.group.zIndex(position);
          touch(marking.floating);
        }
      }
      if (!onScreen) continue;
      this.shown++;
      // Cor da borda escolhida para a imagem (sem escolha, `cv-line`); a marcação do canvas não
      // tem container: usa o token dela e a borda tracejada.
      const canvasMarking = marking.containerId === null;
      const lineColor = canvasMarking
        ? tokens.canvasMarking
        : (lookup?.containers.get(marking.containerId ?? '')?.markingColor ?? null);
      const markingIncomplete = mode === null && incomplete.has(marking.id);
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
        level,
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
          level,
        );
        syncParts(node);
        touch(marking.floating);
      }
      // Ancestral de contexto (modo Ocultar): só a borda, sem nome. O desenho ocupa o
      // lugar do nome das marcações com componente à vista.
      const textMode =
        visibility !== 'outline' && !withDrawing && (mode?.names ?? true)
          ? semanticMode({
              screenWidth: marking.rect.width * pxPerUnit,
              screenHeight: marking.rect.height * pxPerUnit,
            })
          : 'none';
      const parentHeader = marking.parentId ? headers.get(marking.parentId) : undefined;
      // Filha começando sob o nome do pai: o dela desce uma linha.
      const headerFloor =
        parentHeader &&
        markingRect.y < parentHeader.bottom &&
        markingRect.x < parentHeader.right
          ? parentHeader.bottom
          : null;
      // O nome só se refaz quando algo que ele usa mudou (o recorte da tela entra: pan o refaz).
      const textInputs = [
        marking,
        placement,
        markingIncomplete,
        tokens,
        zoom,
        textMode,
        headerFloor,
        area.x,
        area.y,
        area.width,
        area.height,
      ];
      if (!sameInputs(node.textDrawn, textInputs)) {
        node.textDrawn = textInputs;
        node.band = updateSemanticText(
          node.text,
          {
            marking,
            markingRect,
            view: area,
            mode: textMode,
            incomplete: markingIncomplete,
            headerFloor,
          },
          tokens,
          zoom,
        );
        syncParts(node);
        touch(marking.floating);
      }
      const header = node.band;
      if (header) headers.set(marking.id, header);
    }
    for (const [id, node] of this.nodes) {
      if (seen.has(id)) continue;
      this.touchParent(changes, node.group.getParent());
      node.group.destroy();
      this.nodes.delete(id);
    }
    return changes;
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

  private createNode(id: string, parent: Konva.Container): MarkingNode {
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
      textDrawn: null,
      band: null,
      attached: ALL_PARTS,
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
    parent.add(node.group);
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
  detail: LevelOfDetail = 'full',
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
  // De longe (`border`): só a borda, sem halo, linha dupla, selo nem ⚠.
  const full = detail === 'full';
  node.halo.setAttrs({
    ...rect,
    visible: showBorder && full,
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
  if (line === 'changed' && showBorder && full) {
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
  const outline = visibility === 'outline' || !indicators || !full;
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

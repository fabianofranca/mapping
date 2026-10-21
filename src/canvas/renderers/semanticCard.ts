// Zoom semântico no Konva: nome da marcação na linha de cabeçalho. As
// anotações ficam só no painel direito (Detalhes e Lista).
import Konva from 'konva/lib/Core';
import { Text as KonvaText } from 'konva/lib/shapes/Text';
import type { Marking, Rect } from '../../model';
import type { SemanticMode } from '../semanticText';
import type { CanvasTokens } from '../theme';
import {
  ALERT_SIZE,
  DOT_GAP,
  DOT_MARGIN,
  DOT_RADIUS,
  MAX_DOTS,
  MORE_WIDTH,
  REVIEW_BADGE_SIZE,
  fontStyle,
  intersectRects,
} from './metrics';

/** Margem interna do texto do cabeçalho (px de tela); fonte e linha vêm de `t-cv-name`. */
const TEXT_PADDING = 4;
/** Altura da linha de cabeçalho (onde ficam o alerta, as bolinhas e o nome). */
const TEXT_HEADER_HEIGHT = 2 * DOT_MARGIN + 2 * DOT_RADIUS;
/** Nós do texto do zoom semântico de uma marcação, recortados no retângulo dela. */
export interface SemanticNode {
  readonly group: Konva.Group;
  /** Nome da marcação na linha de cabeçalho, ao lado das bolinhas. */
  readonly header: KonvaText;
}

export function createSemanticNode(): SemanticNode {
  const node: SemanticNode = {
    group: new Konva.Group(),
    header: new KonvaText({
      wrap: 'none',
      ellipsis: true,
      fillAfterStrokeEnabled: true,
    }),
  };
  node.group.add(node.header);
  return node;
}

/** O que `updateSemanticText` desenha numa marcação. */
export interface SemanticText {
  readonly marking: Marking;
  /** Retângulo da marcação no canvas. */
  readonly markingRect: Rect;
  /** Parte do canvas visível na tela. */
  readonly view: Rect;
  readonly mode: SemanticMode;
  /** Quantas bolinhas de camada a marcação mostra (o nome começa depois delas). */
  readonly dotCount: number;
  readonly incomplete: boolean;
  /**
   * Fim (y do canvas) do cabeçalho do pai quando ele passa pelo canto desta marcação
   * (filha no mesmo canto): o nome dela desce para baixo dele em vez de cobri-lo.
   */
  readonly headerFloor?: number | null;
}

/** Faixa ocupada pelo nome no cabeçalho (canvas), para as filhas no mesmo canto. */
export interface HeaderBand {
  readonly bottom: number;
  readonly right: number;
}

/**
 * Zoom semântico: o nome da marcação no cabeçalho, ao lado das bolinhas,
 * recortado na parte visível dela.
 */
export function updateSemanticText(
  node: SemanticNode,
  input: SemanticText,
  tokens: CanvasTokens,
  zoom: number,
): HeaderBand | null {
  const { marking, markingRect, mode, incomplete } = input;
  // Com zoom alto o canto da marcação sai da tela: o texto fica ancorado na
  // parte visível dela (e recortado nela).
  const rect = intersectRects(markingRect, input.view);
  if (mode === 'none' || !rect) {
    node.group.visible(false);
    return null;
  }
  const px = (n: number) => n / zoom;
  const name = tokens.type.name;
  node.group.setAttrs({
    visible: true,
    clip: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
  });
  // Alerta e bolinhas só ocupam o cabeçalho se o canto da marcação estiver visível.
  const atCorner = rect.x === markingRect.x && rect.y === markingRect.y;
  const dotCount = atCorner ? input.dotCount : 0;
  const shownDots = Math.min(dotCount, MAX_DOTS);
  // O nome começa depois do alerta de revisão e das bolinhas.
  const before = atCorner && marking.needsReview ? REVIEW_BADGE_SIZE + DOT_MARGIN : 0;
  const dotsWidth =
    shownDots > 0 ? shownDots * (2 * DOT_RADIUS + DOT_GAP) + DOT_MARGIN : 0;
  const more =
    (dotCount > MAX_DOTS ? MORE_WIDTH : 0) +
    (atCorner && incomplete ? ALERT_SIZE + 2 : 0);
  // Filha no mesmo canto do pai: o nome vai para a linha de baixo do cabeçalho dele.
  const floor = input.headerFloor ?? null;
  const shifted = floor !== null && floor > rect.y;
  const headerTop = shifted ? floor : rect.y;
  const headerX = shifted
    ? rect.x + px(TEXT_PADDING)
    : rect.x + px(before + dotsWidth + more + (dotsWidth + more > 0 ? 0 : TEXT_PADDING));
  const headerText = marking.name ?? '';
  if (headerText === '') {
    node.header.visible(false);
  } else {
    node.header.setAttrs({
      visible: true,
      text: headerText,
      x: headerX,
      y: headerTop + px((TEXT_HEADER_HEIGHT - name.size) / 2),
      width: Math.max(0, rect.x + rect.width - headerX - px(TEXT_PADDING)),
      height: px(name.line),
      fontSize: px(name.size),
      fontFamily: tokens.fontFamily,
      fontStyle: fontStyle(name.weight),
      fill: tokens.line,
      stroke: tokens.halo,
      strokeWidth: 2.5 / zoom,
    });
  }
  if (headerText === '') return null;
  const textRight = headerX + Math.min(node.header.width(), node.header.getTextWidth());
  return {
    bottom: Math.max(
      headerTop + px(TEXT_HEADER_HEIGHT),
      node.header.y() + node.header.height(),
    ),
    right: textRight,
  };
}

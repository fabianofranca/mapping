// Zoom semântico no Konva: nome da marcação no cabeçalho e cartão com as
// anotações das camadas visíveis. O conteúdo vem de `cards.ts`; aqui só os nós.
import Konva from 'konva/lib/Core';
import { Rect as KonvaRect } from 'konva/lib/shapes/Rect';
import { Text as KonvaText } from 'konva/lib/shapes/Text';
import type { Marking, Rect } from '../../model';
import { layoutCard, type CardRow, type SemanticMode } from '../semanticText';
import type { CanvasTokens } from '../theme';
import type { MarkingCard } from './cards';
import {
  ALERT_SIZE,
  DOT_GAP,
  DOT_MARGIN,
  DOT_RADIUS,
  ELLIPSIS,
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
/** Cartão do zoom semântico (px de tela): margem na área, padding, largura máxima. */
const CARD_MARGIN = 4;
const CARD_PADDING = 6;
const CARD_MAX_WIDTH = 300;
/** Mais estreito que isso (ex: área quase toda fora da tela), o cartão não aparece. */
const CARD_MIN_WIDTH = 120;
/** Barra da camada à esquerda (o fundo e o raio vêm de `color-card` e `radius-md`). */
const CARD_BAR_WIDTH = 3;
const CARD_BAR_GAP = 6;
/** Recuo dos pares sob o nome da anotação. */
const CARD_ENTRY_INDENT = 10;
/** Estilo de cada tipo de linha: nome da camada e notas em `t-cv-caption`, o resto em `t-cv-card`. */
const CARD_TYPE: Readonly<Record<CardRow['kind'], 'card' | 'caption'>> = {
  layer: 'caption',
  title: 'card',
  note: 'caption',
  entry: 'card',
  separator: 'card',
  more: 'card',
};

/** Nós do texto do zoom semântico de uma marcação, recortados no retângulo dela. */
export interface SemanticNode {
  readonly group: Konva.Group;
  /** Nome da marcação na linha de cabeçalho, ao lado das bolinhas. */
  readonly header: KonvaText;
  /** Fundo do cartão (`color-card`, já semiopaco). */
  readonly card: KonvaRect;
  /** Linhas do cartão, uma por nó. Crescem sob demanda. */
  readonly lines: KonvaText[];
  /** Barras das camadas e separadores do cartão. Crescem sob demanda. */
  readonly shapes: KonvaRect[];
}

export function createSemanticNode(): SemanticNode {
  const node: SemanticNode = {
    group: new Konva.Group(),
    header: new KonvaText({
      wrap: 'none',
      ellipsis: true,
      fillAfterStrokeEnabled: true,
    }),
    card: new KonvaRect(),
    lines: [],
    shapes: [],
  };
  node.group.add(node.card, node.header);
  return node;
}

/** O que `updateSemanticText` desenha numa marcação. */
export interface SemanticText {
  readonly marking: Marking;
  /** Retângulo da marcação no canvas. */
  readonly markingRect: Rect;
  /** Área do cartão no canvas (só no modo `full`). */
  readonly area: Rect | null;
  /** Parte do canvas visível na tela. */
  readonly view: Rect;
  readonly mode: SemanticMode;
  readonly card: MarkingCard;
  readonly incomplete: boolean;
}

/**
 * Zoom semântico. No cabeçalho, o nome da marcação (ao lado das bolinhas); em
 * `full`, também o cartão com uma seção por camada visível, dentro de `area`
 * (o próprio retângulo ou, com filhas, a maior área livre delas). Em `header`
 * a área é pequena demais: o nome termina com "…". Tudo é recortado na parte
 * visível da marcação, e só as linhas que cabem viram nós.
 */
export function updateSemanticText(
  node: SemanticNode,
  input: SemanticText,
  tokens: CanvasTokens,
  zoom: number,
): void {
  const { marking, markingRect, mode, card, incomplete } = input;
  // Com zoom alto o canto da marcação sai da tela: o texto fica ancorado na
  // parte visível dela (e recortado nela).
  const rect = intersectRects(markingRect, input.view);
  if (mode === 'none' || !rect) {
    node.group.visible(false);
    return;
  }
  const px = (n: number) => n / zoom;
  const name = tokens.type.name;
  node.group.setAttrs({
    visible: true,
    clip: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
  });
  // Alerta e bolinhas só ocupam o cabeçalho se o canto da marcação estiver visível.
  const atCorner = rect.x === markingRect.x && rect.y === markingRect.y;
  // Uma seção por camada que chega à marcação: o mesmo número de bolinhas.
  const dotCount = atCorner ? card.layers.length : 0;
  const shownDots = Math.min(dotCount, MAX_DOTS);
  // O nome começa depois do alerta de revisão e das bolinhas.
  const before = atCorner && marking.needsReview ? REVIEW_BADGE_SIZE + DOT_MARGIN : 0;
  const dotsWidth =
    shownDots > 0 ? shownDots * (2 * DOT_RADIUS + DOT_GAP) + DOT_MARGIN : 0;
  const more =
    (dotCount > MAX_DOTS ? MORE_WIDTH : 0) +
    (atCorner && incomplete ? ALERT_SIZE + 2 : 0);
  const headerX =
    rect.x + px(before + dotsWidth + more + (dotsWidth + more > 0 ? 0 : TEXT_PADDING));
  const cut = mode === 'header' && card.rows.length > 0;
  const headerText =
    marking.name !== null
      ? cut
        ? `${marking.name} ${ELLIPSIS}`
        : marking.name
      : cut
        ? ELLIPSIS
        : '';
  if (headerText === '') {
    node.header.visible(false);
  } else {
    node.header.setAttrs({
      visible: true,
      text: headerText,
      x: headerX,
      y: rect.y + px((TEXT_HEADER_HEIGHT - name.size) / 2),
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
  const headerUsed = headerText !== '' || before + dotsWidth > 0;
  updateCard(node, input.area, rect, headerUsed, card, tokens, zoom);
}

/** Cartão com fundo semiopaco: barra da camada, nomes, pares com recuo e separadores. */
function updateCard(
  node: SemanticNode,
  area: Rect | null,
  visible: Rect,
  headerUsed: boolean,
  card: MarkingCard,
  tokens: CanvasTokens,
  zoom: number,
): void {
  const px = (n: number) => n / zoom;
  const hide = () => {
    node.card.visible(false);
    for (const line of node.lines) line.visible(false);
    for (const shape of node.shapes) shape.visible(false);
  };
  const box = area ? intersectRects(area, visible) : null;
  if (!box || card.rows.length === 0) {
    hide();
    return;
  }
  // O cartão não cobre a linha de cabeçalho da marcação.
  const headerBottom = visible.y + px(TEXT_HEADER_HEIGHT + 2);
  const top = Math.max(box.y, headerUsed ? headerBottom : box.y) + px(CARD_MARGIN);
  const bottom = box.y + box.height - px(CARD_MARGIN);
  const x = box.x + px(CARD_MARGIN);
  const width = Math.min(box.width - px(2 * CARD_MARGIN), px(CARD_MAX_WIDTH));
  const layout = layoutCard(card.rows, (bottom - top) * zoom - 2 * CARD_PADDING);
  if (width < px(CARD_MIN_WIDTH) || layout.rows.length === 0) {
    hide();
    return;
  }
  node.card.setAttrs({
    visible: true,
    x,
    y: top,
    width,
    height: px(layout.height + 2 * CARD_PADDING),
    fill: tokens.card,
    cornerRadius: px(tokens.radius.md),
    stroke: tokens.border,
    strokeWidth: px(1),
  });

  const contentX = x + px(CARD_PADDING + CARD_BAR_WIDTH + CARD_BAR_GAP);
  const contentRight = x + width - px(CARD_PADDING);
  const rowY = (y: number) => top + px(CARD_PADDING + y);

  type Shape = { x: number; y: number; width: number; height: number; fill: string };
  const shapes: Shape[] = [];
  // Barra vertical na cor da camada, do nome dela até a última linha da seção.
  const spans = new Map<number, { from: number; to: number }>();
  for (const row of layout.rows) {
    const span = spans.get(row.section);
    const to = row.y + row.height;
    spans.set(row.section, { from: span?.from ?? row.y, to });
  }
  for (const [section, { from, to }] of spans) {
    shapes.push({
      x: x + px(CARD_PADDING),
      y: rowY(from),
      width: px(CARD_BAR_WIDTH),
      height: px(to - from),
      fill: card.layers[section]?.color ?? tokens.textMuted,
    });
  }
  type Line = {
    text: string;
    x: number;
    y: number;
    height: number;
    fontSize: number;
    fontFamily: string;
    fontStyle: string;
    fill: string;
    opacity: number;
  };
  const lines: Line[] = [];
  for (const row of layout.rows) {
    if (row.kind === 'separator') {
      shapes.push({
        x: contentX,
        y: rowY(row.y + row.height / 2),
        width: Math.max(0, contentRight - contentX),
        height: px(1),
        fill: tokens.border,
      });
      continue;
    }
    const inherited = 'inherited' in row && row.inherited;
    const italic = inherited || (row.kind === 'title' && row.untitled);
    const bold = row.kind === 'title' && !row.untitled;
    const style = tokens.type[CARD_TYPE[row.kind]];
    const muted =
      row.kind === 'layer' ||
      row.kind === 'note' ||
      row.kind === 'more' ||
      (row.kind === 'title' && row.untitled);
    lines.push({
      text: row.kind === 'more' ? ELLIPSIS : row.text,
      x: contentX + (row.kind === 'entry' ? px(CARD_ENTRY_INDENT) : 0),
      y: rowY(row.y),
      height: px(row.height),
      fontSize: px(style.size),
      fontFamily: tokens.fontFamily,
      // Título da anotação em negrito (o peso do cabeçalho do canvas), o resto no peso do estilo.
      fontStyle: fontStyle(bold ? tokens.type.name.weight : style.weight, italic),
      fill:
        'alert' in row && row.alert
          ? tokens.warningText
          : muted
            ? tokens.textMuted
            : tokens.text,
      opacity: inherited ? tokens.opacity.inherited : 1,
    });
  }

  while (node.shapes.length < shapes.length) {
    const shape = new KonvaRect();
    node.shapes.push(shape);
    node.group.add(shape);
  }
  node.shapes.forEach((node, i) => {
    const shape = shapes[i];
    if (!shape) {
      node.visible(false);
      return;
    }
    node.setAttrs({ visible: true, ...shape, cornerRadius: shape.width / 2 });
  });
  while (node.lines.length < lines.length) {
    const line = new KonvaText({
      wrap: 'none',
      ellipsis: true,
      verticalAlign: 'middle',
    });
    node.lines.push(line);
    node.group.add(line);
  }
  node.lines.forEach((textNode, i) => {
    const line = lines[i];
    if (!line) {
      textNode.visible(false);
      return;
    }
    textNode.setAttrs({
      visible: true,
      ...line,
      width: Math.max(0, contentRight - line.x),
    });
  });
}

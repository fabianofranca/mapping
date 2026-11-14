// Semantic zoom in Konva: the marking's name on the header line. The
// annotations stay only in the right panel (Details and List).
import Konva from 'konva/lib/Core';
import { Text as KonvaText } from 'konva/lib/shapes/Text';
import type { Marking, Rect } from '../../model';
import type { SemanticMode } from '../semanticText';
import type { CanvasTokens } from '../theme';
import {
  ALERT_SIZE,
  CORNER_MARGIN,
  REVIEW_BADGE_SIZE,
  fontStyle,
  intersectRects,
} from './metrics';

/** Inner margin of the header text (screen px); font and line come from `t-cv-name`. */
const TEXT_PADDING = 4;
/**
 * Height of the header line (where the badge, the alert and the name go). The value comes from when
 * the layer dots defined the line (2 × margin + 2 × radius): kept so the name does not move up.
 */
export const TEXT_HEADER_HEIGHT = 14;
/** Text nodes of a marking's semantic zoom, clipped to its rectangle. */
export interface SemanticNode {
  readonly group: Konva.Group;
  /** The marking's name on the header line, after the badge and the alert. */
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

/** What `updateSemanticText` draws on a marking. */
export interface SemanticText {
  readonly marking: Marking;
  /** The marking's rectangle on the canvas. */
  readonly markingRect: Rect;
  /** Part of the canvas visible on screen. */
  readonly view: Rect;
  readonly mode: SemanticMode;
  readonly incomplete: boolean;
  /**
   * End (canvas y) of the parent's header when it passes through the corner of this marking
   * (a child in the same corner): its name goes below it instead of covering it.
   */
  readonly headerFloor?: number | null;
}

/** Band occupied by the name in the header (canvas), for the children in the same corner. */
export interface HeaderBand {
  readonly bottom: number;
  readonly right: number;
}

/**
 * Semantic zoom: the marking's name in the header, after the badge and the alert,
 * clipped to its visible part.
 */
export function updateSemanticText(
  node: SemanticNode,
  input: SemanticText,
  tokens: CanvasTokens,
  zoom: number,
): HeaderBand | null {
  const { marking, markingRect, mode, incomplete } = input;
  // At high zoom the marking's corner leaves the screen: the text stays anchored to the
  // visible part of it (and clipped to it).
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
  // The badge and the alert only occupy the header if the marking's corner is visible.
  const atCorner = rect.x === markingRect.x && rect.y === markingRect.y;
  // The name starts after the review badge and the alert.
  const before = atCorner && marking.needsReview ? REVIEW_BADGE_SIZE + CORNER_MARGIN : 0;
  const alertWidth = atCorner && incomplete ? ALERT_SIZE + 2 : 0;
  // Child in the same corner as the parent: the name goes to the line below its header.
  const floor = input.headerFloor ?? null;
  const shifted = floor !== null && floor > rect.y;
  const headerTop = shifted ? floor : rect.y;
  const headerX = shifted
    ? rect.x + px(TEXT_PADDING)
    : rect.x + px(before + alertWidth + (alertWidth > 0 ? 0 : TEXT_PADDING));
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

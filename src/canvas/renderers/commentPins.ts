// Thread pins (Comments stage, CM4): one pill per item that hosts the anchor, with the
// initials and the message number (or the count), the color of the most urgent state, the ring of the
// selected one and the unread dot. In the mold of `ReviewRenderer`: a pool of nodes per key, the
// size in screen px (inverse scale of the zoom) and the leftover nodes destroyed. Colors and font only
// from the tokens; the drawing belongs to the usual frame (no `requestAnimationFrame` of its own).
import Konva from 'konva/lib/Core';
import { Circle as KonvaCircle } from 'konva/lib/shapes/Circle';
import { Path as KonvaPath } from 'konva/lib/shapes/Path';
import { Rect as KonvaRect } from 'konva/lib/shapes/Rect';
import { Text as KonvaText } from 'konva/lib/shapes/Text';
import type { PinColor } from '../../model';
import type { Frame } from '../frame';
import { THREAD_STATE_GLYPHS } from '../../utils/threadStateGlyph';
import {
  pinBox,
  pinGlyphExtra,
  pinWidth,
  type PinMetrics,
  type PinPlace,
} from '../commentPins';
import type { CanvasTokens } from '../theme';
import type { Point } from '../viewport';
import { HALO_WIDTH, fontStyle } from './metrics';

/** Radius of the unread dot (screen px). */
const UNREAD_RADIUS = 4;
const SELECTED_STROKE = 2;
const DRAFT_DASH = [3, 2];
const DRAFT_KEY = 'draft';
/** The glyph is drawn on the icon's 16-unit grid, with a slightly thicker stroke. */
const GLYPH_GRID = 16;
const GLYPH_STROKE = 2;
/** The states the glyph marks, in the order `data-pin-states` lists them; the draft is the last. */
const MAX_GLYPH_PATHS = Math.max(
  ...Object.values(THREAD_STATE_GLYPHS).map((paths) => paths.length),
);

export type CommentPinFrame = Pick<
  Frame,
  'pins' | 'pinSelected' | 'draftPin' | 'tokens' | 'viewport'
>;

interface PinNode {
  readonly group: Konva.Group;
  readonly box: KonvaRect;
  readonly label: KonvaText;
  /** State glyph (one `KonvaPath` per stroke); hidden on the draft. */
  readonly glyph: Konva.Group;
  readonly unread: KonvaCircle;
}

function createGlyph(): Konva.Group {
  // Position and scale of the glyph come from the token measures and are set on each draw (`paint`).
  const glyph = new Konva.Group({ visible: false });
  for (let i = 0; i < MAX_GLYPH_PATHS; i++) {
    glyph.add(
      new KonvaPath({
        data: '',
        lineCap: 'round',
        lineJoin: 'round',
        strokeWidth: GLYPH_STROKE,
        fillEnabled: false,
        visible: false,
      }),
    );
  }
  return glyph;
}

function createNode(): PinNode {
  const node: PinNode = {
    group: new Konva.Group({ listening: false }),
    box: new KonvaRect(),
    label: new KonvaText({ wrap: 'none', align: 'center', verticalAlign: 'middle' }),
    glyph: createGlyph(),
    unread: new KonvaCircle({ radius: UNREAD_RADIUS }),
  };
  node.group.add(node.box, node.label, node.glyph, node.unread);
  return node;
}

function fillOf(color: PinColor, tokens: CanvasTokens): string {
  if (color === 'awaitingHuman') return tokens.pin.human;
  return color === 'awaitingAgent' ? tokens.pin.agent : tokens.pin.resolved;
}

export class CommentPinRenderer {
  private readonly layer: Konva.Container;
  private readonly nodes = new Map<string, PinNode>();
  private drawnStates: readonly string[] = [];

  constructor(layer: Konva.Container) {
    this.layer = layer;
  }

  /** How many pins are drawn (the e2e tests wait for it). */
  get size(): number {
    return this.nodes.size;
  }

  /** The states of the drawn pins, in draw order (the draft, `draft`, last). */
  get states(): readonly string[] {
    return this.drawnStates;
  }

  node(key: string): PinNode | undefined {
    return this.nodes.get(key);
  }

  /** Draws the frame's pins (and the draft's dashes); the leftover ones are destroyed. */
  render(frame: CommentPinFrame): void {
    const { pins, tokens, draftPin } = frame;
    const zoom = frame.viewport.scale;
    const seen = new Set<string>();
    const states: string[] = [];
    for (const place of pins) {
      seen.add(place.key);
      states.push(place.group.color);
      this.draw(place, frame.pinSelected, zoom, tokens);
    }
    if (draftPin) {
      seen.add(DRAFT_KEY);
      states.push(DRAFT_KEY);
      this.drawDraft(draftPin, zoom, tokens);
    }
    for (const [key, node] of this.nodes) {
      if (seen.has(key)) continue;
      node.group.destroy();
      this.nodes.delete(key);
    }
    this.drawnStates = states;
  }

  private nodeFor(key: string): PinNode {
    let node = this.nodes.get(key);
    if (!node) {
      node = createNode();
      this.layer.add(node.group);
      this.nodes.set(key, node);
    }
    return node;
  }

  private draw(
    place: PinPlace,
    selected: string | null,
    zoom: number,
    tokens: CanvasTokens,
  ): void {
    const node = this.nodeFor(place.key);
    const { group } = place;
    const box = pinBox(place, zoom, tokens.pin);
    const isSelected = selected !== null && group.threadIds.includes(selected);
    node.group.setAttrs({ x: box.x, y: box.y, scaleX: 1 / zoom, scaleY: 1 / zoom });
    this.paint(node, group.label, fillOf(group.color, tokens), tokens, {
      selected: isSelected,
      dashed: false,
      glyph: group.color,
    });
    node.unread.visible(group.hasUnread);
    node.unread.setAttrs({
      x: pinWidth(group.label, tokens.pin),
      y: 0,
      fill: tokens.pin.unread,
      stroke: tokens.pin.halo,
      strokeWidth: HALO_WIDTH,
    });
  }

  /** The dashed pin of the new thread at a point (draft): nothing recorded yet. */
  private drawDraft(at: Point, zoom: number, tokens: CanvasTokens): void {
    const node = this.nodeFor(DRAFT_KEY);
    const label = '+';
    const width = pinWidth(label, tokens.pin, false) / zoom;
    node.group.setAttrs({
      x: at.x - width / 2,
      y: at.y - tokens.pin.height / zoom / 2,
      scaleX: 1 / zoom,
      scaleY: 1 / zoom,
    });
    this.paint(node, label, tokens.pin.resolved, tokens, {
      selected: true,
      dashed: true,
      glyph: null,
    });
    node.unread.visible(false);
  }

  private paint(
    node: PinNode,
    label: string,
    fill: string,
    tokens: CanvasTokens,
    style: {
      readonly selected: boolean;
      readonly dashed: boolean;
      /** The glyph's state; `null` on the draft, which has none. */
      readonly glyph: PinColor | null;
    },
  ): void {
    const metrics: PinMetrics = tokens.pin;
    const { height } = metrics;
    const withGlyph = style.glyph !== null;
    const width = pinWidth(label, metrics, withGlyph);
    const extra = withGlyph ? pinGlyphExtra(metrics) : 0;
    node.glyph.setAttrs({
      x: (height - metrics.glyph) / 2,
      y: (height - metrics.glyph) / 2,
      scaleX: metrics.glyph / GLYPH_GRID,
      scaleY: metrics.glyph / GLYPH_GRID,
    });
    node.box.setAttrs({
      width,
      height,
      cornerRadius: height / 2,
      fill,
      stroke: style.selected ? tokens.pin.selected : tokens.pin.halo,
      strokeWidth: style.selected ? SELECTED_STROKE : HALO_WIDTH,
      dash: style.dashed ? DRAFT_DASH : [],
    });
    paintGlyph(node.glyph, style.glyph, tokens.pin.text);
    node.label.setAttrs({
      x: extra,
      width: width - extra,
      height,
      text: label,
      fontSize: tokens.type.name.size,
      fontFamily: tokens.fontFamily,
      fontStyle: fontStyle(tokens.type.name.weight),
      fill: tokens.pin.text,
    });
  }
}

/** Sets the state's strokes on the glyph, in the pin text color; without a state (draft), hides it. */
function paintGlyph(glyph: Konva.Group, state: PinColor | null, color: string): void {
  glyph.visible(state !== null);
  const paths = state === null ? [] : glyphPaths(state);
  glyph.getChildren().forEach((child, i) => {
    const d = paths[i];
    child.visible(d !== undefined);
    child.setAttrs({ data: d ?? '', stroke: color });
  });
}

function glyphPaths(state: PinColor): readonly string[] {
  return THREAD_STATE_GLYPHS[state];
}

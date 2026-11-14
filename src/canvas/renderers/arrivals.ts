// Arrival marks (stage #659, PE3, decision 8): the "Came from <name>" badge over each root that arrived
// in Main and the dashed "Arrival area" band with its title and subtitle. Following the model of
// `CommentPinRenderer`: a pool of nodes per root, size in screen px (inverse of the zoom scale) and the
// leftover nodes destroyed. Colors and font only from the tokens; the drawing belongs to the usual frame.
// The badge pill is inverted, like the hint: `text` box and `surface` label (dark in the light theme,
// light in the dark one), so it shows over the canvas background in both themes (TE1).
import Konva from 'konva/lib/Core';
import { Rect as KonvaRect } from 'konva/lib/shapes/Rect';
import { Text as KonvaText } from 'konva/lib/shapes/Text';
import { t } from '../../i18n';
import type { Rect } from '../../model';
import {
  arrivalBadgeSpot,
  arrivalBadgeWidth,
  arrivalBandLabelFit,
  arrivalBandLabelSpot,
  type ArrivalBadge,
  type ArrivalRoot,
} from '../arrivals';
import { visibleArea, type Frame } from '../frame';
import type { CanvasTokens } from '../theme';
import { HALO_WIDTH, fontStyle } from './metrics';

/** Band dashing and gap between the band and the title (screen px). */
const BAND_DASH = [6, 4];
const BAND_STROKE = 1.5;
const TITLE_GAP = 4;
const BADGE_RADIUS = 4;

export type ArrivalFrame = Pick<
  Frame,
  'arrivals' | 'tokens' | 'viewport' | 'locale' | 'size'
>;

export interface ArrivalBadgeNode {
  readonly group: Konva.Group;
  readonly box: KonvaRect;
  readonly label: KonvaText;
}

export interface ArrivalBandNode {
  readonly group: Konva.Group;
  readonly box: KonvaRect;
  readonly title: KonvaText;
  readonly hint: KonvaText;
}

function textAttrs(tokens: CanvasTokens, fill: string, weight: number) {
  return {
    wrap: 'none',
    fontSize: tokens.type.name.size,
    fontFamily: tokens.fontFamily,
    fontStyle: fontStyle(weight),
    fill,
  };
}

/** `box` (px de tela, relativo ao canto do canvas) em unidades do canvas; `undefined` se vazio. */
function screenToCanvasRect(
  box: Rect,
  { x, y, scale }: Frame['viewport'],
): Rect | undefined {
  if (box.width === 0 || box.height === 0) return undefined;
  return {
    x: (box.x - x) / scale,
    y: (box.y - y) / scale,
    width: box.width / scale,
    height: box.height / scale,
  };
}

export class ArrivalRenderer {
  private readonly layer: Konva.Container;
  private readonly badges = new Map<string, ArrivalBadgeNode>();
  readonly band: ArrivalBandNode;
  /**
   * Minimap rectangle (HTML over the canvas) in screen px, relative to the canvas: kept and
   * redone only when the canvas or the minimap itself changes size (no `querySelector`
   * nor `getBoundingClientRect` per frame, which force layout).
   */
  private minimapBox: Rect | undefined;
  private minimapStale = true;
  private measuredSize: Frame['size'] | null = null;
  private watched: Element | null = null;
  private watcher: ResizeObserver | null = null;
  /** Tells the drawer the minimap changed size: the badge needs a new frame. */
  private readonly onMinimapResize: (() => void) | undefined;

  constructor(layer: Konva.Container, onMinimapResize?: () => void) {
    this.layer = layer;
    this.onMinimapResize = onMinimapResize;
    this.band = {
      group: new Konva.Group({ listening: false, visible: false }),
      box: new KonvaRect({ listening: false }),
      title: new KonvaText({ listening: false }),
      hint: new KonvaText({ listening: false }),
    };
    this.band.group.add(this.band.box, this.band.title, this.band.hint);
    layer.add(this.band.group);
  }

  /** How many badges are drawn (the tests wait on it). */
  get badgeCount(): number {
    return this.badges.size;
  }

  get bandVisible(): boolean {
    return this.band.group.visible();
  }

  badge(root: string): ArrivalBadgeNode | undefined {
    return this.badges.get(root);
  }

  /** Draws the frame's band and badges; the leftover badges are destroyed. */
  render(frame: ArrivalFrame): void {
    const { arrivals, tokens } = frame;
    const zoom = frame.viewport.scale;
    const view = visibleArea(frame.size, frame.viewport);
    const avoid = this.minimapArea(frame);
    // The band first: its title (which changes side with the view) is a place to avoid.
    const label = this.drawBand(arrivals?.band ?? null, zoom, tokens, view);
    const seen = new Set<string>();
    for (const badge of arrivals?.badges ?? []) {
      seen.add(badge.root);
      this.drawBadge(badge, zoom, tokens, view, avoid, arrivals?.roots, label);
    }
    for (const [root, node] of this.badges) {
      if (seen.has(root)) continue;
      node.group.destroy();
      this.badges.delete(root);
    }
  }

  /** The minimap (HTML over the canvas) in canvas units, or `undefined` without it. */
  private minimapArea(frame: ArrivalFrame): Rect | undefined {
    if (!frame.arrivals?.badges.length) return undefined;
    if (this.measuredSize !== frame.size) {
      this.measuredSize = frame.size;
      this.minimapStale = true;
    }
    if (this.minimapStale || (this.watched === null && this.minimapBox === undefined)) {
      this.measureMinimap();
    }
    return this.minimapBox && screenToCanvasRect(this.minimapBox, frame.viewport);
  }

  private measureMinimap(): void {
    this.minimapStale = false;
    const host = this.layer.getStage()?.container();
    const map = host?.parentElement?.querySelector('.minimap') ?? null;
    this.watch(map);
    if (!host || !map) {
      this.minimapBox = undefined;
      return;
    }
    const origin = host.getBoundingClientRect();
    const box = map.getBoundingClientRect();
    this.minimapBox = {
      x: box.left - origin.left,
      y: box.top - origin.top,
      width: box.width,
      height: box.height,
    };
  }

  /** Follows the size of the minimap element: it grows and shrinks with the view. */
  private watch(map: Element | null): void {
    if (map === this.watched) return;
    this.watcher?.disconnect();
    this.watched = map;
    if (!map || typeof ResizeObserver === 'undefined') return;
    this.watcher ??= new ResizeObserver(() => {
      this.minimapStale = true;
      this.onMinimapResize?.();
    });
    this.watcher.observe(map);
  }

  /** Solta o acompanhamento do minimapa. */
  destroy(): void {
    this.watcher?.disconnect();
    this.watcher = null;
    this.watched = null;
  }

  private badgeFor(root: string): ArrivalBadgeNode {
    let node = this.badges.get(root);
    if (!node) {
      const group = new Konva.Group({ listening: false });
      const box = new KonvaRect({ listening: false });
      const label = new KonvaText({
        listening: false,
        align: 'center',
        verticalAlign: 'middle',
      });
      group.add(box, label);
      this.layer.add(group);
      node = { group, box, label };
      this.badges.set(root, node);
    }
    return node;
  }

  private drawBadge(
    badge: ArrivalBadge,
    zoom: number,
    tokens: CanvasTokens,
    view: Rect,
    avoid: Rect | undefined,
    roots: readonly ArrivalRoot[] | undefined,
    label: Rect | null,
  ): void {
    const node = this.badgeFor(badge.root);
    const text = t('perspective.canvas.cameFrom', { name: badge.name });
    // The token's font is loaded before measuring: the first drawing would measure with the default font.
    node.label.setAttrs({
      ...textAttrs(tokens, tokens.surface, tokens.type.name.weight),
      text,
    });
    // The measured text can exceed the estimate (wide letters): the badge grows with it.
    const width = Math.max(
      arrivalBadgeWidth(text, tokens.arrival),
      node.label.getTextWidth() + 2 * tokens.arrival.pad,
    );
    const at = arrivalBadgeSpot(
      badge.rect,
      zoom,
      width,
      tokens.arrival,
      view,
      avoid,
      roots,
      badge.root,
      label ? [label] : [],
    );
    node.group.setAttrs({ x: at.x, y: at.y, scaleX: 1 / zoom, scaleY: 1 / zoom });
    node.box.setAttrs({
      width,
      height: tokens.arrival.height,
      cornerRadius: BADGE_RADIUS,
      fill: tokens.text,
      stroke: tokens.halo,
      strokeWidth: HALO_WIDTH,
    });
    node.label.setAttrs({
      ...textAttrs(tokens, tokens.surface, tokens.type.name.weight),
      width,
      height: tokens.arrival.height,
      text,
    });
  }

  /** Draws the band and returns the rectangle of its title (canvas), or `null` without a band. */
  private drawBand(
    band: Rect | null,
    zoom: number,
    tokens: CanvasTokens,
    view: Rect,
  ): Rect | null {
    const node = this.band;
    node.group.visible(band !== null);
    if (!band) return null;
    const line = tokens.type.name.line;
    node.group.setAttrs({ x: band.x, y: band.y });
    node.box.setAttrs({
      width: band.width,
      height: band.height,
      fill: tokens.selectFill,
      stroke: tokens.selectSecondary,
      strokeWidth: BAND_STROKE / zoom,
      dash: BAND_DASH.map((d) => d / zoom),
    });
    // Title and subtitle (screen px) stay above the band and the containers' name row; without
    // room, below it; always inside the visible area.
    node.title.setAttrs({
      ...textAttrs(tokens, tokens.text, tokens.type.name.weight),
      text: t('perspective.canvas.arrivalArea'),
      x: 0,
      y: 0,
    });
    node.hint.setAttrs({
      ...textAttrs(tokens, tokens.textMuted, 400),
      text: t('perspective.canvas.arrivalAreaHint'),
      x: 0,
      y: line,
    });
    // Natural width of the text (not depending on `width`, which the ellipsis shortens).
    const natural = Math.max(
      node.title.measureSize(node.title.text()).width,
      node.hint.measureSize(node.hint.text()).width,
    );
    const size = { width: natural, height: 2 * line };
    const fit = arrivalBandLabelFit(natural, zoom, view, tokens.arrival);
    // Without `width` Konva measures the whole text; with it, a single line, cut with an ellipsis.
    const clip = { width: fit ?? undefined, ellipsis: fit !== null };
    const at = arrivalBandLabelSpot(
      band,
      zoom,
      size,
      view,
      line + TITLE_GAP,
      tokens.arrival,
    );
    node.title.setAttrs({ scaleX: 1 / zoom, scaleY: 1 / zoom, ...clip });
    node.hint.setAttrs({ scaleX: 1 / zoom, scaleY: 1 / zoom, ...clip });
    node.title.x(at.x - band.x);
    node.title.y(at.y - band.y);
    node.hint.x(at.x - band.x);
    node.hint.y(at.y - band.y + line / zoom);
    return {
      x: at.x,
      y: at.y,
      width: (fit ?? natural) / zoom,
      height: size.height / zoom,
    };
  }
}

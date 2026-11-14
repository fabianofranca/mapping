// Thread pins on the canvas (Comments stage, CM4, decision 24): where each group of pins sits,
// the box size and the click hit-testing. A pure function over the drawn project and the groups of the
// derived state (`derived.threads.pins`), modeled on `reviewMarks.ts`; the renderer only draws. Pan and
// zoom do not go through here: the position belongs to the project, and the size (in screen pixels) enters only in
// `pinBox`, when drawing and touching.
import {
  imageCanvasRect,
  markingCanvasRectOf,
  projectIndex,
  type MarkingVisibility,
  type PinGroup,
  type Project,
  type Rect,
} from '../model';
import { visibleArrowShapes } from './arrowGeometry';
import type { CanvasTokens } from './theme';
import type { Point } from './viewport';

/** The pin's measurements (screen px), from the canvas tokens (`size-cv-pin-*`). */
export type PinMetrics = Pick<
  CanvasTokens['pin'],
  'height' | 'pad' | 'glyph' | 'glyphGap' | 'charWidth'
>;

/** What the state glyph adds to the pin's width. */
export function pinGlyphExtra(pin: PinMetrics): number {
  return pin.glyph + pin.glyphGap;
}

/** `corner`: the pin sits outside the item, with its lower-left corner at the upper-right corner. */
export type PinAlign = 'corner' | 'center';

/** A pin to draw: the group, the reference point (canvas) and how the box aligns to it. */
export interface PinPlace {
  readonly key: string;
  readonly group: PinGroup;
  readonly origin: Point;
  readonly align: PinAlign;
}

/**
 * Pin width (screen px): grows with the label and, when there is one, with the state glyph (the draft
 * has none: `glyph` false), never less than the height.
 */
export function pinWidth(label: string, pin: PinMetrics, glyph = true): number {
  const extra = glyph ? pinGlyphExtra(pin) : 0;
  return Math.max(pin.height, label.length * pin.charWidth + 2 * pin.pad + extra);
}

/** The point `x`,`y` of a container (its pixels) or of the canvas (null `containerId`), in canvas units. */
export function pointCanvas(
  project: Project,
  containerId: string | null,
  x: number,
  y: number,
): Point | null {
  if (containerId === null) return { x, y };
  const container = projectIndex(project).containers.get(containerId);
  if (!container) return null;
  const { placement } = container;
  return { x: placement.x + x * placement.scale, y: placement.y + y * placement.scale };
}

function topRight(rect: Rect): Point {
  return { x: rect.x + rect.width, y: rect.y };
}

type Host = PinGroup['host'];

/**
 * Where the pin of a point sits. A canvas point belongs to no root: only the Main one has it
 * (decision 15). That of a container follows the container, which the view already brings (or not).
 */
function pointPlace(
  project: Project,
  host: Extract<Host, { kind: 'point' }>,
  principal: boolean,
): Pick<PinPlace, 'origin' | 'align'> | null {
  if (host.containerId === null && !principal) return null;
  const origin = pointCanvas(project, host.containerId, host.x, host.y);
  return origin ? { origin, align: 'center' } : null;
}

/** Where the pin of `host` sits: the point and the alignment; `null` if the item is not in view. */
function placeOf(
  project: Project,
  host: Host,
  visibility: ReadonlyMap<string, MarkingVisibility>,
  arrowLabels: ReadonlyMap<string, Point>,
  principal: boolean,
): Pick<PinPlace, 'origin' | 'align'> | null {
  const index = projectIndex(project);
  switch (host.kind) {
    case 'marking': {
      const marking = index.markings.get(host.id);
      if (!marking || visibility.get(host.id) === 'hidden') return null;
      return { origin: topRight(markingCanvasRectOf(project, marking)), align: 'corner' };
    }
    case 'container': {
      const container = index.containers.get(host.id);
      if (!container) return null;
      return {
        origin: topRight(imageCanvasRect(container, container.placement)),
        align: 'corner',
      };
    }
    case 'arrow': {
      const label = arrowLabels.get(host.id);
      return label ? { origin: label, align: 'center' } : null;
    }
    case 'point':
      return pointPlace(project, host, principal);
  }
}

/**
 * The frame's pins, in group order. A hidden marking, an arrow without both ends in
 * view and an item that disappeared have no pin. `principal`: `false` with a perspective open, where the
 * thread on a canvas point (outside a container) does not appear; the default is the Main one.
 */
export function pinPlaces(
  project: Project,
  groups: readonly PinGroup[],
  visibility: ReadonlyMap<string, MarkingVisibility>,
  principal = true,
): readonly PinPlace[] {
  if (groups.length === 0) return [];
  const arrowLabels = new Map<string, Point>();
  if (groups.some((g) => g.host.kind === 'arrow')) {
    for (const shape of visibleArrowShapes(project, visibility)) {
      arrowLabels.set(shape.arrow.id, shape.label);
    }
  }
  const places: PinPlace[] = [];
  for (const group of groups) {
    const place = placeOf(project, group.host, visibility, arrowLabels, principal);
    if (place) places.push({ key: group.hostKey, group, ...place });
  }
  return places;
}

/** The pin's box in canvas units, with a fixed size in screen pixels (`zoom`). */
export function pinBox(place: PinPlace, zoom: number, pin: PinMetrics): Rect {
  const width = pinWidth(place.group.label, pin) / zoom;
  const height = pin.height / zoom;
  return place.align === 'corner'
    ? { x: place.origin.x, y: place.origin.y - height, width, height }
    : { x: place.origin.x - width / 2, y: place.origin.y - height / 2, width, height };
}

/** The pin under `c` (canvas); the last drawn wins. */
export function pinHit(
  places: readonly PinPlace[],
  c: Point,
  zoom: number,
  pin: PinMetrics,
): PinPlace | null {
  for (let i = places.length - 1; i >= 0; i--) {
    const place = places[i];
    if (!place) continue;
    const box = pinBox(place, zoom, pin);
    if (
      c.x >= box.x &&
      c.x <= box.x + box.width &&
      c.y >= box.y &&
      c.y <= box.y + box.height
    ) {
      return place;
    }
  }
  return null;
}

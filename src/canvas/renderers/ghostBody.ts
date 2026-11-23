// The outline of the quick-review ghost's markings (stage #1932, QR2). The ghost does not use
// `MarkingRenderer`, which is where the review line (dashed for created, double for changed) is
// normally drawn, so a marking with no component drawing would show only its badge. This draws
// that line with the same measures: a very light fill, the halo, the border and, for changed, the
// inner thread. Screen px (value / zoom); colors only from the tokens.
import Konva from 'konva/lib/Core';
import { Rect as KonvaRect } from 'konva/lib/shapes/Rect';
import type { Placement, Rect } from '../../model';
import { markingCanvasRect, placementOfSpace } from '../markingGeometry';
import type { ReviewCanvas } from '../reviewMarks';
import type { CanvasTokens } from '../theme';
import type { GhostSpot } from '../quickGhost';
import { HALO_WIDTH, intersectRects } from './metrics';
import { MARKING_STROKE, REVIEW_DASH, REVIEW_DOUBLE_STROKE } from './markings';

interface BodyNodes {
  readonly group: Konva.Group;
  readonly fill: KonvaRect;
  readonly halo: KonvaRect;
  readonly border: KonvaRect;
  readonly inner: KonvaRect;
}

export interface GhostBodyFrame {
  readonly review: ReviewCanvas;
  readonly spots: ReadonlyMap<string, GhostSpot>;
  readonly tokens: CanvasTokens;
  readonly zoom: number;
  /** Canvas area that is drawn; a marking outside it is skipped. */
  readonly view: Rect;
}

function createBody(id: string): BodyNodes {
  const nodes: BodyNodes = {
    group: new Konva.Group({ listening: false }),
    fill: new KonvaRect({ listening: false, name: `ghost-fill-${id}` }),
    halo: new KonvaRect({ listening: false, name: `ghost-halo-${id}` }),
    border: new KonvaRect({ listening: false, name: `ghost-body-${id}` }),
    inner: new KonvaRect({ listening: false, name: `ghost-body-inner-${id}` }),
  };
  nodes.group.add(nodes.fill, nodes.halo, nodes.border, nodes.inner);
  return nodes;
}

function drawBody(
  nodes: BodyNodes,
  line: 'created' | 'changed',
  rect: Rect,
  zoom: number,
  tokens: CanvasTokens,
): void {
  const changed = line === 'changed';
  const stroke = (changed ? REVIEW_DOUBLE_STROKE : MARKING_STROKE) / zoom;
  const dash = changed ? [] : REVIEW_DASH.map((d) => d / zoom);
  nodes.fill.setAttrs({ ...rect, fill: tokens.line, opacity: tokens.opacity.dimmed });
  nodes.halo.setAttrs({
    ...rect,
    stroke: tokens.halo,
    strokeWidth: stroke + (2 * HALO_WIDTH) / zoom,
    dash,
  });
  nodes.border.setAttrs({ ...rect, stroke: tokens.line, strokeWidth: stroke, dash });
  nodes.inner.setAttrs({
    ...rect,
    visible: changed,
    stroke: tokens.halo,
    strokeWidth: 1 / zoom,
    dash,
  });
}

/** The canvas rect of the ghost marking `id`'s line, or `null` when it has none or is out of view. */
function bodyRect(
  id: string,
  frame: GhostBodyFrame,
  placements: ReadonlyMap<string, Placement>,
): { line: 'created' | 'changed'; rect: Rect } | null {
  const line = frame.review.markings.get(id)?.line;
  const spot = frame.spots.get(id);
  if (!spot || (line !== 'created' && line !== 'changed')) return null;
  const placement = placementOfSpace(placements, spot.containerId);
  if (!placement) return null;
  const rect = markingCanvasRect(placement, spot.rect);
  return intersectRects(rect, frame.view) ? { line, rect } : null;
}

export class GhostBodyRenderer {
  private readonly bodies = new Map<string, BodyNodes>();

  constructor(private readonly layer: Konva.Container) {}

  /** Draws the line of the created and changed markings; everything else goes away. */
  render(frame: GhostBodyFrame, placements: ReadonlyMap<string, Placement>): void {
    const seen = new Set<string>();
    for (const id of frame.review.markings.keys()) {
      const body = bodyRect(id, frame, placements);
      if (!body) continue;
      seen.add(id);
      let nodes = this.bodies.get(id);
      if (!nodes) {
        nodes = createBody(id);
        this.bodies.set(id, nodes);
        this.layer.add(nodes.group);
      }
      drawBody(nodes, body.line, body.rect, frame.zoom, frame.tokens);
    }
    for (const [id, nodes] of this.bodies) {
      if (seen.has(id)) continue;
      nodes.group.destroy();
      this.bodies.delete(id);
    }
  }
}

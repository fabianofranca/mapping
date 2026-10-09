// Marcas de revisão de propostas no canvas (HANDOFF-PROPOSALS 4): selos de tipo no canto
// superior direito (sobre `cv-badge`), fantasmas pontilhados, removidas com hachura e
// nome riscado, e a moldura tracejada da imagem criada. A linha das marcações (tracejada,
// dupla, pontilhada, inválida) fica no `MarkingRenderer`. Tudo em px de tela, na escala
// inversa do zoom; cores e fontes só dos tokens.
import Konva from 'konva/lib/Core';
import { Path as KonvaPath } from 'konva/lib/shapes/Path';
import { Rect as KonvaRect } from 'konva/lib/shapes/Rect';
import { Text as KonvaText } from 'konva/lib/shapes/Text';
import { imageCanvasRect, projectIndex, type Placement, type Rect } from '../../model';
import {
  CHANGED_PATHS,
  CLOSE_PATHS,
  MINUS_PATHS,
  MOVED_PATHS,
  PLUS_PATHS,
  REPLACED_PATHS,
  WARNING_PATHS,
} from '../../utils/reviewGlyphs';
import { visibleArea, type Frame } from '../frame';
import { markingCanvasRect } from '../markingGeometry';
import { importantBadge, type ReviewBadge, type ReviewShape } from '../reviewMarks';
import type { CanvasTokens } from '../theme';
import { HALO_WIDTH, fontStyle, intersectRects } from './metrics';

/** Selo (px de tela): lado, vão entre selos e distância da borda. */
export const REVIEW_KIND_BADGE = 16;
const BADGE_GAP = 3;
const BADGE_INSET = 3;
/** O traço ocupa esta fração do selo (grade de 16 unidades). */
const GLYPH_RATIO = 0.72;
const GLYPH_GRID = 16;
const GLYPH_STROKE = 1.75;
/** Abaixo deste lado na tela, só os selos importantes; abaixo do selo, nenhum. */
const SMALL_SIDE = 3 * REVIEW_KIND_BADGE;
/** Hachura das removidas (px de tela): faixa clara e escura. */
const HATCH_LIGHT = 2;
const HATCH_DARK = 4;
const GHOST_DASH = [1.5, 3];
const CREATED_DASH = [6, 4];

const GLYPHS: Readonly<Record<ReviewBadge, readonly string[]>> = {
  created: PLUS_PATHS,
  removed: MINUS_PATHS,
  moved: MOVED_PATHS,
  changed: CHANGED_PATHS,
  replaced: REPLACED_PATHS,
  conflict: WARNING_PATHS,
  invalid: WARNING_PATHS,
  rejected: CLOSE_PATHS,
};

export type ReviewFrame = Pick<
  Frame,
  'project' | 'review' | 'tokens' | 'size' | 'viewport'
>;

interface BadgeNode {
  readonly group: Konva.Group;
  readonly box: KonvaRect;
  readonly glyph: Konva.Group;
  kind: ReviewBadge | null;
}

interface ShapeNode {
  readonly group: Konva.Group;
  readonly hatch: Konva.Shape;
  readonly halo: KonvaRect;
  readonly line: KonvaRect;
  readonly name: KonvaText;
  readonly badges: readonly BadgeNode[];
}

function createBadge(): BadgeNode {
  const node: BadgeNode = {
    group: new Konva.Group(),
    box: new KonvaRect(),
    glyph: new Konva.Group(),
    kind: null,
  };
  node.group.add(node.box, node.glyph);
  return node;
}

function badgeColor(kind: ReviewBadge, tokens: CanvasTokens): string {
  if (kind === 'conflict') return tokens.warning;
  if (kind === 'invalid') return tokens.invalid;
  return tokens.line;
}

/** Desenha o selo `kind` com o canto superior esquerdo em `x`,`y` (canvas). */
function drawBadge(
  node: BadgeNode,
  kind: ReviewBadge,
  x: number,
  y: number,
  zoom: number,
  tokens: CanvasTokens,
): void {
  const size = REVIEW_KIND_BADGE;
  const color = badgeColor(kind, tokens);
  node.group.setAttrs({ visible: true, x, y, scaleX: 1 / zoom, scaleY: 1 / zoom });
  node.box.setAttrs({
    width: size,
    height: size,
    fill: tokens.badge,
    stroke: color,
    strokeWidth: 1,
    cornerRadius: tokens.radius.sm / 2,
    dash: kind === 'rejected' ? [1.5, 1.5] : [],
  });
  if (node.kind !== kind) {
    node.glyph.destroyChildren();
    node.glyph.add(
      ...GLYPHS[kind].map(
        (data) => new KonvaPath({ data, lineCap: 'round', lineJoin: 'round' }),
      ),
    );
    node.kind = kind;
  }
  const scale = (size * GLYPH_RATIO) / GLYPH_GRID;
  const offset = (size * (1 - GLYPH_RATIO)) / 2;
  node.glyph.setAttrs({ x: offset, y: offset, scaleX: scale, scaleY: scale });
  for (const path of node.glyph.getChildren()) {
    path.setAttrs({ stroke: color, strokeWidth: GLYPH_STROKE });
  }
}

/**
 * Selos no canto superior direito de `rect` (canvas), por dentro. Com a marcação pequena
 * na tela só os importantes (alterada, removida, conflito); menor que um selo, nenhum.
 */
export function visibleBadges(
  badges: readonly ReviewBadge[],
  rect: Rect,
  zoom: number,
): ReviewBadge[] {
  const side = Math.min(rect.width, rect.height) * zoom;
  if (side < REVIEW_KIND_BADGE + 2 * BADGE_INSET) return [];
  const shown = side < SMALL_SIDE ? badges.filter(importantBadge) : [...badges];
  return shown.slice(0, 2);
}

function placeBadges(
  nodes: readonly BadgeNode[],
  badges: readonly ReviewBadge[],
  rect: Rect,
  zoom: number,
  tokens: CanvasTokens,
): void {
  const shown = visibleBadges(badges, rect, zoom);
  const step = (REVIEW_KIND_BADGE + BADGE_GAP) / zoom;
  const right = rect.x + rect.width - BADGE_INSET / zoom;
  const top = rect.y + BADGE_INSET / zoom;
  nodes.forEach((node, i) => {
    const kind = shown[shown.length - 1 - i];
    if (kind === undefined) {
      node.group.visible(false);
      return;
    }
    drawBadge(node, kind, right - (i + 1) * step + BADGE_GAP / zoom, top, zoom, tokens);
  });
}

export class ReviewRenderer {
  private readonly layer: Konva.Container;
  private readonly shapes = new Map<string, ShapeNode>();
  private readonly badges = new Map<string, readonly BadgeNode[]>();
  private readonly frames = new Map<string, KonvaRect>();

  constructor(layer: Konva.Container) {
    this.layer = layer;
  }

  /** Desenha as marcas da revisão; sem revisão, esconde tudo. */
  render(frame: ReviewFrame, placements: ReadonlyMap<string, Placement>): void {
    const { review, project, tokens } = frame;
    const zoom = frame.viewport.scale;
    const view = visibleArea(frame.size, frame.viewport);
    const seenShapes = new Set<string>();
    const seenBadges = new Set<string>();
    const seenFrames = new Set<string>();

    if (review && project) {
      const index = projectIndex(project);
      // Removidas (hachura) por baixo dos fantasmas.
      for (const shape of [...review.removed, ...review.ghosts]) {
        const rect = markingCanvasRect(shape.placement, shape.rect);
        if (!intersectRects(rect, view)) continue;
        seenShapes.add(shape.key);
        this.drawShape(shape, rect, review.removed.includes(shape), zoom, tokens);
      }
      for (const [id, mark] of review.markings) {
        const marking = index.markings.get(id);
        const placement = marking ? placements.get(marking.imageId) : undefined;
        if (!marking || !placement || mark.badges.length === 0) continue;
        const rect = markingCanvasRect(placement, marking.rect);
        if (!intersectRects(rect, view)) continue;
        const key = `m:${id}`;
        seenBadges.add(key);
        placeBadges(this.badgeNodes(key), mark.badges, rect, zoom, tokens);
      }
      for (const [id, mark] of review.images) {
        const image = index.images.get(id);
        const placement = placements.get(id);
        if (!image || !placement) continue;
        const rect = imageCanvasRect(image, placement);
        if (!intersectRects(rect, view)) continue;
        const key = `i:${id}`;
        seenBadges.add(key);
        placeBadges(this.badgeNodes(key), mark.badges, rect, zoom, tokens);
        if (mark.line === 'created') {
          seenFrames.add(id);
          this.drawFrame(id, rect, zoom, tokens);
        }
      }
    }

    for (const [key, node] of this.shapes) {
      if (seenShapes.has(key)) continue;
      node.group.destroy();
      this.shapes.delete(key);
    }
    for (const [key, nodes] of this.badges) {
      if (seenBadges.has(key)) continue;
      for (const node of nodes) node.group.destroy();
      this.badges.delete(key);
    }
    for (const [key, node] of this.frames) {
      if (seenFrames.has(key)) continue;
      node.destroy();
      this.frames.delete(key);
    }
  }

  private badgeNodes(key: string): readonly BadgeNode[] {
    const existing = this.badges.get(key);
    if (existing) return existing;
    const nodes = [createBadge(), createBadge()];
    for (const node of nodes) this.layer.add(node.group);
    this.badges.set(key, nodes);
    return nodes;
  }

  /** Moldura tracejada da imagem criada pela proposta. */
  private drawFrame(id: string, rect: Rect, zoom: number, tokens: CanvasTokens): void {
    let node = this.frames.get(id);
    if (!node) {
      node = new KonvaRect({ listening: false });
      this.layer.add(node);
      this.frames.set(id, node);
    }
    node.setAttrs({
      ...rect,
      stroke: tokens.line,
      strokeWidth: 2 / zoom,
      dash: CREATED_DASH.map((d) => d / zoom),
      shadowColor: tokens.halo,
      shadowBlur: 2 / zoom,
      shadowOpacity: 1,
    });
  }

  private drawShape(
    shape: ReviewShape,
    rect: Rect,
    removed: boolean,
    zoom: number,
    tokens: CanvasTokens,
  ): void {
    let node = this.shapes.get(shape.key);
    if (!node) {
      node = {
        group: new Konva.Group(),
        hatch: new Konva.Shape(),
        halo: new KonvaRect(),
        line: new KonvaRect(),
        name: new KonvaText({ textDecoration: 'line-through', wrap: 'none' }),
        badges: [createBadge(), createBadge()],
      };
      node.group.add(node.hatch, node.halo, node.line, node.name);
      for (const badge of node.badges) node.group.add(badge.group);
      this.layer.add(node.group);
      this.shapes.set(shape.key, node);
    }
    const rejected = shape.badges.includes('rejected');
    // Fantasma (posição antiga ou rejeitada): pontilhado e esmaecido.
    node.group.opacity(removed ? 1 : tokens.opacity.ancestor);
    const dash = removed ? [] : GHOST_DASH.map((d) => d / zoom);
    node.halo.setAttrs({
      ...rect,
      stroke: tokens.halo,
      strokeWidth: (1 + 2 * HALO_WIDTH) / zoom,
      dash,
    });
    node.line.setAttrs({ ...rect, stroke: tokens.line, strokeWidth: 1 / zoom, dash });
    if (removed) {
      const light = tokens.line;
      const dark = tokens.halo;
      node.hatch.setAttrs({
        visible: true,
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        opacity: tokens.opacity.ancestor,
        sceneFunc: (ctx: Konva.Context) => {
          const w = rect.width;
          const h = rect.height;
          const period = (HATCH_LIGHT + HATCH_DARK) / zoom;
          ctx.save();
          ctx.beginPath();
          ctx.rect(0, 0, w, h);
          ctx.clip();
          for (const [color, width, shift] of [
            [dark, HATCH_DARK / zoom, 0],
            [light, HATCH_LIGHT / zoom, (HATCH_DARK + HATCH_LIGHT) / 2 / zoom],
          ] as const) {
            ctx.beginPath();
            for (let s = -h; s < w + h; s += period) {
              ctx.moveTo(s + shift, h);
              ctx.lineTo(s + shift + h, 0);
            }
            ctx.setAttr('strokeStyle', color);
            ctx.setAttr('lineWidth', width);
            ctx.stroke();
          }
          ctx.restore();
        },
      });
    } else {
      node.hatch.visible(false);
    }
    // Nome riscado (removida) ou do item rejeitado, acima da caixa.
    const name = removed || rejected ? shape.name : null;
    if (name) {
      const size = tokens.type.name.size / zoom;
      node.name.setAttrs({
        visible: true,
        text: name,
        x: rect.x,
        y: rect.y - (tokens.type.name.line + 2) / zoom,
        fontSize: size,
        fontFamily: tokens.fontFamily,
        fontStyle: fontStyle(tokens.type.name.weight),
        fill: tokens.line,
        stroke: tokens.halo,
        strokeWidth: 3 / zoom,
        fillAfterStrokeEnabled: true,
        textDecoration: removed ? 'line-through' : '',
      });
    } else {
      node.name.visible(false);
    }
    placeBadges(node.badges, shape.badges, rect, zoom, tokens);
  }
}

/**
 * Draws a `Scene` (the instance of a component) with Konva.
 *
 * Each scene node becomes a `Konva.Group` (the node's "container", with the transform,
 * opacity and visibility) that holds the node's own shapes (one shape per
 * fill, plus one for the stroke) and, after them, the children's containers. Every
 * shape and every container carries the `sceneId` attribute, so the viewer can find the scene node
 * from the target of a Konva event.
 */
import {
  growRadius,
  sideSegments,
  spreadRadius,
  strokeAlignInset,
} from '../../model/components/strokeSides';
import { gapOutlines } from '../../model/components/strokeGaps';
import {
  CUT_REACH,
  WRAP_SLACK,
  cutLineLeft,
  cutsText,
} from '../../model/components/textWrap';
import { canvasFontFamily } from '../../model/components/fontFamily';
import Konva from 'konva/lib/Core';
import { Ellipse as KonvaEllipse } from 'konva/lib/shapes/Ellipse';
import { Image as KonvaImage } from 'konva/lib/shapes/Image';
import { Line as KonvaLine } from 'konva/lib/shapes/Line';
import { Path as KonvaPath } from 'konva/lib/shapes/Path';
import { Rect as KonvaRect } from 'konva/lib/shapes/Rect';
import { PixelRect } from './pixelRect';
import { Shape as KonvaShape } from 'konva/lib/Shape';
import { Text as KonvaText, type TextConfig } from 'konva/lib/shapes/Text';
import {
  type CornerRadius,
  type Matrix,
  type Paint,
  type Scene,
  type SceneNode,
  type SceneTextRun,
  type Shadow,
  type Stroke,
  type TextNode,
  type TextStyle,
  hasChildren,
  nodeMatrix,
} from '../../model/components/scene';
import type { ImageFit } from '../../model/components/componentFormat';
import type { RunLayout, RunPiece } from '../../model/components/richText';
import { textBoxLimits } from './textLimits';
import { wordSafeText } from './wordWidth';
import { capMiddleShift, lineBaseline } from '../../model/components/baseline';
import { capMetricsOf } from './capMiddle';
import { cachedEmbeddedImage, loadEmbeddedImage } from './imageLoader';
import { DEFAULT_PALETTE, type RenderPalette } from './palette';
import type { RenderWarning, RenderWarningCode } from './renderWarnings';
import type { RemoteImageView, RemoteImageViewState } from './remoteImageTypes';

/** The only image origin the renderer loads by itself (a legacy of the lab). */
const DATA_URL = /^data:/i;

export { DEFAULT_PALETTE, type RenderPalette };
export type { RenderWarning, RenderWarningCode };

/** What the remote image function returns: the full view or just the state (placeholder). */
export type RemoteImageResult = RemoteImageView | RemoteImageViewState;

export interface RenderOptions {
  /**
   * Resolves the URL of the component's `image` node (RI3): already passed through the URL policy
   * and consent, with the loader behind it. Without it, every remote image is the placeholder.
   * `renderScene` never creates an `Image` for a remote URL.
   */
  readonly remoteImage?: (url: string) => RemoteImageResult;
  /**
   * `true` when the result will be read back (`toDataURL`, `toBlob`, `getImageData`):
   * an `opaque` image (loaded without CORS) is not drawn, the placeholder takes its place.
   */
  readonly pixelSafe?: boolean;
  /** An embedded image (`data:`) finished loading: time to redraw. */
  readonly onImageLoaded?: () => void;
  /** Colors of the placeholder and of the unknown node (default: `DEFAULT_PALETTE`). */
  readonly palette?: Partial<RenderPalette>;
  /**
   * Draws the placeholder outline of a `slot` (default `true`; the product layer uses `false`).
   */
  readonly showSlots?: boolean;
}

export interface RenderResult {
  readonly root: Konva.Group;
  /** Konva container of each scene node, by id. */
  readonly byId: ReadonlyMap<string, Konva.Group>;
  /** Approximations made while drawing (besides the converter's), with code and parameters. */
  readonly warnings: readonly RenderWarning[];
  /** Remote URLs (`url` of the `image` fill) that the scene uses, without repeats. */
  readonly imageUrls: readonly string[];
}

export const SCENE_ID_ATTR = 'sceneId';

/** Shape that exists only to receive the pointer: it neither paints nor receives a shadow. */
const HIT_ONLY_ATTR = 'hitOnly';

interface Box {
  readonly width: number;
  readonly height: number;
}

type ShapeWithFill = Konva.Shape;

class Renderer {
  readonly byId = new Map<string, Konva.Group>();
  private readonly warned = new Map<string, RenderWarning>();
  readonly imageUrls = new Set<string>();

  private readonly palette: RenderPalette;

  constructor(private readonly options: RenderOptions) {
    this.palette = { ...DEFAULT_PALETTE, ...options.palette };
  }

  get warnings(): readonly RenderWarning[] {
    return [...this.warned.values()];
  }

  private warn(code: RenderWarningCode, params?: RenderWarning['params']): void {
    const key = params ? `${code}|${JSON.stringify(params)}` : code;
    if (!this.warned.has(key)) this.warned.set(key, params ? { code, params } : { code });
  }

  render(node: SceneNode, pendingShadows: readonly Shadow[] = []): Konva.Group {
    const container = new Konva.Group({
      ...decompose(nodeMatrix(node)),
      opacity: node.opacity,
      visible: node.visible,
      name: node.name,
    });
    container.setAttr(SCENE_ID_ATTR, node.id);
    this.byId.set(node.id, container);

    // The shadow goes on the first shape that accepts it. A group with an effect
    // (e.g. `filter` on a group that wraps the shape) passes the shadow to the first descendant
    // shape.
    const shadows = this.outerShadows([...pendingShadows, ...node.effects]);

    if (node.type === 'frame' && node.clip) {
      const { width, height, cornerRadius, clipBox } = node;
      container.clipFunc((ctx) => {
        if (clipBox) {
          // Enlarged clip (stroke outside the box, shadow): straight rectangle, without the
          // corners.
          ctx.beginPath();
          ctx.rect(clipBox.x, clipBox.y, clipBox.width, clipBox.height);
          ctx.closePath();
        } else roundedRectPath(ctx, width, height, cornerRadius);
      });
    }

    if (node.type === 'text' && cutsText(node)) {
      const { width } = node;
      // Clip only horizontally (the text box); vertically, what the text draws stays.
      container.clipFunc((ctx) => {
        ctx.beginPath();
        ctx.rect(0, -CUT_REACH, width, 2 * CUT_REACH);
        ctx.closePath();
      });
    }

    const shapes = this.shapesOf(node);
    // The invisible clickable area of a transparent frame does not paint: it does not own the
    // shadow.
    const shadowOwner =
      shadows.length > 0 ? shapes.find((s) => !s.getAttr(HIT_ONLY_ATTR)) : undefined;
    // Several shadows (or `spread`) on a rectangle or ellipse: one shadow-only shape per shadow,
    // below the node's shapes, the last of the list first (the first stays on top).
    const casters = shadowOwner !== undefined && castsShadows(node, shadows);
    if (casters) {
      for (const shadow of [...shadows].reverse()) {
        const caster = shadowCaster(node, shadow);
        caster.setAttr(SCENE_ID_ATTR, node.id);
        container.add(caster);
      }
    }
    for (const shape of shapes) {
      shape.setAttr(SCENE_ID_ATTR, node.id);
      container.add(shape);
    }

    if (hasChildren(node)) {
      let forward = shadows.length > 0 && !shadowOwner ? shadows : [];
      // Frame with an enlarged clip (shadow, stroke) and radius: the enlarged one applies to the
      // frame; the children go in a group clipped by the shape (the radius), and their corner does
      // not come out straight.
      let holder: Konva.Group = container;
      if (
        node.type === 'frame' &&
        node.clip &&
        node.clipBox &&
        !isSquare(node.cornerRadius)
      ) {
        const { width, height, cornerRadius } = node;
        holder = new Konva.Group({
          clipFunc: (ctx) => roundedRectPath(ctx, width, height, cornerRadius),
        });
        container.add(holder);
      }
      for (const child of node.children) {
        holder.add(this.render(child, forward));
        // Only the first child inherits the group's shadows.
        forward = [];
      }
      if (shadows.length > 0 && !shadowOwner && node.children.length === 0) {
        this.warn('empty-group-shadow');
      }
    }

    const [first] = shadows;
    if (first && shadowOwner && !casters) {
      applyShadow(shadowOwner, first);
      if (shadows.length > 1 || (first.spread ?? 0) !== 0) this.warn('extra-shadows');
    }
    return container;
  }

  private hitOnly(shape: Konva.Shape): Konva.Shape {
    shape.setAttr(HIT_ONLY_ATTR, true);
    return shape;
  }

  /**
   * The outer shadows, in order; the inner one does not exist in canvas 2D: ignored, with a
   * warning.
   */
  private outerShadows(shadows: readonly Shadow[]): Shadow[] {
    if (shadows.some((s) => s.inner)) this.warn('inner-shadow');
    return shadows.filter((s) => !s.inner);
  }

  /** The node's own shapes (without the children). */
  private shapesOf(node: SceneNode): Konva.Shape[] {
    const box: Box = { width: node.width, height: node.height };
    const shapes: Konva.Shape[] = [];
    switch (node.type) {
      case 'frame':
      case 'rect': {
        for (const paint of node.fills) {
          const config = {
            width: node.width,
            height: node.height,
            cornerRadius: konvaRadius(node.cornerRadius),
            listening: true,
          };
          // Solid color without a rounded corner: borders in whole pixels (no seam line).
          const shape =
            paint.type === 'solid' && isSquare(node.cornerRadius)
              ? new PixelRect(config)
              : new KonvaRect(config);
          shapes.push(...this.fillShape(shape, paint, box));
        }
        if (node.stroke) {
          if (node.stroke.sides) shapes.push(...this.sideStrokes(node.stroke, box));
          else {
            const gapped = this.gapStrokes(node.stroke, box, node.cornerRadius);
            shapes.push(
              ...(gapped.length > 0
                ? gapped
                : [this.rectStroke(node.stroke, box, node.cornerRadius)]),
            );
          }
        }
        if (node.fills.length === 0 && !node.stroke && node.type === 'frame') {
          // Transparent frame: an invisible clickable area, so hover finds the frame.
          shapes.push(
            this.hitOnly(
              new KonvaRect({
                width: node.width,
                height: node.height,
                fill: 'transparent',
              }),
            ),
          );
        }
        return shapes;
      }
      case 'ellipse': {
        const geometry = {
          x: node.width / 2,
          y: node.height / 2,
          radiusX: node.width / 2,
          radiusY: node.height / 2,
        };
        for (const paint of node.fills) {
          shapes.push(...this.fillShape(new KonvaEllipse(geometry), paint, box));
        }
        if (node.stroke) {
          const inset = strokeAlignInset(node.stroke) - (node.stroke.offset ?? 0);
          const shape = new KonvaEllipse({
            ...geometry,
            radiusX: Math.max(0, geometry.radiusX - inset),
            radiusY: Math.max(0, geometry.radiusY - inset),
          });
          this.applyStroke(shape, node.stroke);
          shapes.push(shape);
        }
        return shapes;
      }
      case 'line': {
        const points = node.points.flatMap((p) => [p.x, p.y]);
        for (const paint of node.fills) {
          const shape = new KonvaLine({ points, closed: node.closed });
          shapes.push(...this.fillShape(shape, paint, box));
        }
        if (node.stroke) {
          const shape = new KonvaLine({ points, closed: node.closed });
          this.applyStroke(shape, node.stroke, 'line');
          shapes.push(shape);
        }
        return shapes;
      }
      case 'path': {
        for (const paint of node.fills) {
          const shape = new KonvaPath({ data: node.d, fillRule: node.fillRule });
          shapes.push(...this.fillShape(shape, paint, box));
        }
        if (node.stroke) {
          const shape = new KonvaPath({ data: node.d });
          this.applyStroke(shape, node.stroke, 'path');
          shapes.push(shape);
        }
        return shapes;
      }
      case 'text': {
        if (node.runs && node.runLayout) return this.richTextShapes(node, node.runs);
        const { style } = node;
        const attrs: TextConfig = {
          text: node.text,
          fontFamily: canvasFontFamily(style.fontFamily),
          fontSize: style.fontSize,
          fontStyle: fontStyle(style.fontWeight, style.italic),
          align: style.align,
          // `cap-middle` belongs to `capMiddleY`: Konva draws at `top` and the node moves down by
          // the offset.
          verticalAlign:
            style.verticalAlign === 'cap-middle' ? 'top' : style.verticalAlign,
          lineHeight: style.lineHeight ? style.lineHeight / style.fontSize : 1.2,
          letterSpacing: style.letterSpacing ?? 0,
          textDecoration: style.decoration ?? '',
          wrap: style.wrap === 'none' ? 'none' : 'word',
          ellipsis: style.ellipsis === true,
          ...(style.direction === 'rtl' ? { direction: 'rtl' as const } : {}),
        };
        // `wrap: none` without `ellipsis` in a fixed box: the Text gets no `width` (Konva would
        // drop the whole letter) and the group clips by pixel in the box; the `align` belongs to
        // the `x` (decision 19).
        const cut = cutsText(node);
        if (node.width > 0 && !cut) {
          // The wrap slack (0.5 px), the same as the measurer's; the `x` undoes the `align` shift.
          // A word wider than the box stays whole on the line and the others wrap where the
          // model and the measurer wrap.
          const breaks = style.wrap !== 'none' && style.ellipsis !== true;
          const safe = breaks
            ? wordSafeText(node.text, attrs, node.width)
            : { text: node.text, width: node.width };
          attrs.text = safe.text;
          attrs.width = safe.width + WRAP_SLACK;
          attrs.x = slackShift(style.align);
        }
        if (node.height > 0) attrs.height = node.height;
        const clipped = maxLinesBox(attrs, node, style);
        if (clipped) {
          attrs.height = clipped.height;
          attrs.y = clipped.offsetY;
        }
        if (style.verticalAlign === 'cap-middle')
          attrs.y = capMiddleY(attrs, node, style);
        if (style.baselineTop !== undefined)
          attrs.y = baselineY(attrs, style.baselineTop);
        // SVG text without width: the x is the anchor (`text-anchor`), so centered text
        // or right-aligned text grows to the left from it.
        const anchor = (shape: KonvaText): KonvaText => {
          if (cut) {
            // The block (the widest line) aligns in the box; Konva aligns the lines inside it.
            shape.x(cutLineLeft(style.align, node.width, shape.width(), shape.width()));
            return shape;
          }
          if (node.width > 0 || style.align === 'left' || style.align === 'justify')
            return shape;
          shape.offsetX(style.align === 'center' ? shape.width() / 2 : shape.width());
          return shape;
        };
        for (const paint of node.fills) {
          shapes.push(...this.fillShape(anchor(new KonvaText(attrs)), paint, box));
        }
        if (node.stroke) {
          const shape = anchor(new KonvaText(attrs));
          this.applyStroke(shape, node.stroke, 'path');
          shapes.push(shape);
        }
        return shapes;
      }
      case 'group':
        return shapes;
      case 'unknown': {
        // A `slot` (component lab) is a reserved space, not a failure:
        // discreet outline and no warning.
        const slot = node.sourceType === 'slot';
        if (slot && this.options.showSlots === false) return shapes;
        // The unknown icon already got the engine's warning (`unknown icon: <name>`).
        if (!slot && node.sourceType !== 'icon') {
          this.warn('unknown-node', { type: node.sourceType });
        }
        shapes.push(
          new KonvaRect({
            width: node.width,
            height: node.height,
            stroke: slot ? this.palette.placeholderLine : this.palette.unknownLine,
            strokeWidth: 1,
            dash: slot ? [3, 5] : [4, 4],
            opacity: slot ? this.palette.slotOpacity : 1,
            strokeScaleEnabled: false,
          }),
        );
        return shapes;
      }
    }
  }

  /**
   * Rich text (`runs`): one background (`KonvaRect`) per inline box and one `KonvaText` per piece
   * of text, at the `runLayout` positions of the scene, shifted by the node's `verticalAlign`. The
   * background comes before the chip's text; the node's stroke applies to each piece of text.
   */
  private richTextShapes(node: TextNode, runs: readonly SceneTextRun[]): Konva.Shape[] {
    const shapes: Konva.Shape[] = [];
    const layout = node.runLayout;
    if (!layout) return shapes;
    const shift = richShift(node, layout);
    for (const line of layout.lines) {
      for (const piece of line.pieces) {
        const run = runs[piece.run];
        if (!run) continue;
        const top = line.y + (line.height - piece.height) / 2 + shift;
        if (piece.chip) shapes.push(chipShape(piece, run, top));
        shapes.push(runTextShape(node, run, piece, top));
        if (node.stroke) {
          // As in plain text: the fill and the outline are separate shapes.
          const outline = runTextShape(node, run, piece, top);
          this.applyStroke(outline, node.stroke, 'path');
          shapes.push(outline);
        }
      }
    }
    return shapes;
  }

  /** Applies a fill to a shape; an image becomes the shape itself (`KonvaImage`). */
  private fillShape(shape: ShapeWithFill, paint: Paint, box: Box): Konva.Shape[] {
    shape.opacity(paint.opacity ?? 1);
    switch (paint.type) {
      case 'solid':
        shape.fill(paint.color);
        return [shape];
      case 'linear':
        shape.fillPriority('linear-gradient');
        shape.fillLinearGradientStartPoint(paint.start);
        shape.fillLinearGradientEndPoint(paint.end);
        shape.fillLinearGradientColorStops(flattenStops(paint.stops));
        return [shape];
      case 'radial':
        shape.fillPriority('radial-gradient');
        shape.fillRadialGradientStartPoint(paint.center);
        shape.fillRadialGradientEndPoint(paint.center);
        shape.fillRadialGradientStartRadius(0);
        shape.fillRadialGradientEndRadius(paint.radius);
        shape.fillRadialGradientColorStops(flattenStops(paint.stops));
        return [shape];
      case 'image':
        return this.imageFill(shape, paint, box);
    }
  }

  private imageFill(shape: ShapeWithFill, paint: Paint & { type: 'image' }, box: Box) {
    // `paint.url` is the remote image of the component's `image` node: the renderer does not
    // download it; the options function returns the state (and the ready image, already passed
    // through the policy and consent). Everything but `loaded`/`opaque` is the placeholder, with no
    // warning (normal state).
    if (!paint.src && paint.url !== undefined) {
      this.imageUrls.add(paint.url);
      return this.remoteImageFill(shape, paint, paint.url, box);
    }
    // Only the embedded image (`data:`) is loaded here; any other scheme becomes a placeholder.
    if (!paint.src || !DATA_URL.test(paint.src)) {
      this.warn('image-without-pixels');
      return placeholder(shape, box, this.palette);
    }
    if (shape instanceof KonvaRect) {
      const fit = paint.fit ?? 'cover';
      const image = new KonvaImage({
        image: undefined,
        width: box.width,
        height: box.height,
        cornerRadius: shape.cornerRadius(),
        opacity: paint.opacity ?? 1,
      });
      const apply = (element: HTMLImageElement): void => {
        const size = { width: element.naturalWidth, height: element.naturalHeight };
        image.setAttrs({
          image: element,
          ...(size.width > 0 && size.height > 0 ? imageFit(fit, box, size) : {}),
        });
      };
      const ready = cachedEmbeddedImage(paint.src);
      if (ready) {
        // Already decoded: use it at once (without requesting a frame, or the drawing would
        // repeat).
        apply(ready);
        return [image];
      }
      loadEmbeddedImage(paint.src, {
        onLoad: (element) => {
          apply(element);
          this.options.onImageLoaded?.();
        },
        onError: () => {
          this.warn('image-decode-failed');
        },
      });
      return [image];
    }
    // Image as a fill of an ellipse/path: Konva uses `fillPatternImage`.
    loadEmbeddedImage(paint.src, {
      onLoad: (element) => {
        shape.fillPriority('pattern');
        shape.fillPatternImage(element);
        shape.fillPatternScale({
          x: box.width / Math.max(1, element.naturalWidth),
          y: box.height / Math.max(1, element.naturalHeight),
        });
        this.options.onImageLoaded?.();
      },
    });
    shape.fill(this.palette.placeholderFill);
    return [shape];
  }

  private remoteImageFill(
    shape: ShapeWithFill,
    paint: Paint & { type: 'image' },
    url: string,
    box: Box,
  ): Konva.Shape[] {
    const view = this.resolveRemote(url);
    const drawable =
      view.image !== undefined &&
      (view.state === 'loaded' || (view.state === 'opaque' && !this.options.pixelSafe));
    if (!drawable || view.image === undefined || !(shape instanceof KonvaRect)) {
      return placeholder(shape, box, this.palette);
    }
    const size = sourceSize(view);
    if (size === null) return placeholder(shape, box, this.palette);
    const image = new KonvaImage({
      image: view.image,
      ...imageFit(paint.fit ?? 'cover', box, size),
      cornerRadius: shape.cornerRadius(),
      opacity: paint.opacity ?? 1,
      listening: true,
    });
    return [image];
  }

  /**
   * The options function may throw or return only the state: neither of the two breaks the drawing.
   */
  private resolveRemote(url: string): RemoteImageView {
    const resolve = this.options.remoteImage;
    if (!resolve) return { state: 'invalid' };
    try {
      const result = resolve(url);
      return typeof result === 'string' ? { state: result } : result;
    } catch {
      return { state: 'failed' };
    }
  }

  /**
   * `stroke.sides`: one straight line per requested side (no arc at the corner, even with a
   * radius).
   */
  private sideStrokes(stroke: Stroke, box: Box): Konva.Shape[] {
    return sideSegments(stroke, box.width, box.height).map((seg) => {
      const line = new KonvaLine({ points: [seg.x1, seg.y1, seg.x2, seg.y2] });
      this.applyStroke(line, stroke, 'line', true);
      return line;
    });
  }

  /** `stroke.gap`: the outline with each corner's radius, in open lines that skip the gaps. */
  private gapStrokes(stroke: Stroke, box: Box, radius: CornerRadius): Konva.Shape[] {
    return gapOutlines(stroke, box.width, box.height, radius).map((points) => {
      const line = new KonvaLine({ points: points.flatMap((p) => [p.x, p.y]) });
      this.applyStroke(line, stroke, 'line', true);
      return line;
    });
  }

  private rectStroke(stroke: Stroke, box: Box, radius: CornerRadius): Konva.Shape {
    // `offset`: the outline moved away from the shape (the ring grows on each side, by the radius +
    // offset).
    const offset = stroke.offset ?? 0;
    const align = strokeAlignInset(stroke);
    const inset = align - offset;
    const shape = new KonvaRect({
      x: inset,
      y: inset,
      width: Math.max(0, box.width - inset * 2),
      height: Math.max(0, box.height - inset * 2),
      cornerRadius: konvaRadius(shrinkRadius(growRadius(radius, offset), align)),
    });
    this.applyStroke(shape, stroke);
    return shape;
  }

  private applyStroke(
    shape: Konva.Shape,
    stroke: Stroke,
    kind: 'box' | 'line' | 'path' = 'box',
    sideLine = false,
  ): void {
    const [paint, ...rest] = stroke.paints;
    if (rest.length > 0) this.warn('stroke-extra-paints');
    if (kind !== 'box' && !sideLine && stroke.align !== 'center') {
      this.warn('stroke-align-centered');
    }
    shape.strokeWidth(stroke.width);
    // `scale: false`: the width is in screen pixels, at any zoom.
    if (stroke.scale === false) shape.strokeScaleEnabled(false);
    shape.lineCap(stroke.cap ?? 'butt');
    shape.lineJoin(stroke.join ?? 'miter');
    if (stroke.dash && stroke.dash.length > 0) shape.dash([...stroke.dash]);
    shape.fillEnabled(false);
    if (!paint) return;
    shape.opacity(paint.opacity ?? 1);
    switch (paint.type) {
      case 'solid':
        shape.stroke(paint.color);
        return;
      case 'linear':
        shape.strokeLinearGradientStartPoint(paint.start);
        shape.strokeLinearGradientEndPoint(paint.end);
        shape.strokeLinearGradientColorStops(flattenStops(paint.stops));
        return;
      case 'radial': {
        this.warn('stroke-radial-first-color');
        shape.stroke(paint.stops[0]?.color ?? this.palette.placeholderLine);
        return;
      }
      case 'image':
        this.warn('stroke-image-gray');
        shape.stroke(this.palette.placeholderLine);
        return;
    }
  }
}

/** Vertical shift of rich text in the node's box: slack × 0, ½ or 1 (`verticalAlign`). */
function verticalShift(node: TextNode, contentHeight: number): number {
  if (node.height <= 0) return 0;
  const free = node.height - contentHeight;
  switch (node.style.verticalAlign) {
    case 'middle':
      return free / 2;
    case 'bottom':
      return free;
    default:
      return 0;
  }
}

/**
 * `cap-middle` in plain text: the node's `y` so the block (top of the first line's capital to the
 * base of the last) sits at the center of the box. `attrs` already carries the width, the height
 * (the `maxLines` one, if it cut) and `verticalAlign: top`; the lines are the ones Konva draws with
 * them.
 */
function capMiddleY(attrs: TextConfig, node: TextNode, style: TextStyle): number {
  if (node.height <= 0) return 0;
  const probe = new KonvaText(attrs);
  const metrics = capMetricsOf(probe, style.fontSize);
  const lines = Math.max(1, probe.textArr.length);
  probe.destroy();
  const lineHeight = (attrs.lineHeight ?? 1.2) * style.fontSize;
  const first = lineBaseline(0, lineHeight, metrics);
  return capMiddleShift({
    boxHeight: node.height,
    capHeight: metrics.capHeight,
    firstBaseline: first,
    lastBaseline: first + (lines - 1) * lineHeight,
  });
}

/**
 * `baselinePadding.top`: the node's `y` so the first baseline sits `top` below its top. The
 * baseline is the node's font one, by the same measures as `cap-middle` and `konvaMeasurer`.
 */
function baselineY(attrs: TextConfig, top: number): number {
  const probe = new KonvaText(attrs);
  const fontSize = attrs.fontSize ?? 12;
  const metrics = capMetricsOf(probe, fontSize);
  probe.destroy();
  const lineHeight = (attrs.lineHeight ?? 1.2) * fontSize;
  return top - lineBaseline(0, lineHeight, metrics);
}

/** Vertical shift of rich text: `baselinePadding.top`, `cap-middle` or the `verticalAlign`. */
function richShift(node: TextNode, layout: RunLayout): number {
  const top = node.style.baselineTop;
  if (top !== undefined) {
    const first = layout.lines[0];
    return first ? top - baseOfLine(node, first) : 0;
  }
  return node.style.verticalAlign === 'cap-middle'
    ? capMiddleRunsShift(node, layout)
    : verticalShift(node, layout.height);
}

/** The baseline of a `runLayout` line, with the node's base font. */
function baseOfLine(node: TextNode, line: { y: number; height: number }): number {
  const { style } = node;
  const sample = new KonvaText({
    text: 'M',
    fontFamily: canvasFontFamily(style.fontFamily),
    fontSize: style.fontSize,
    fontStyle: fontStyle(style.fontWeight, style.italic),
  });
  const metrics = capMetricsOf(sample, style.fontSize);
  sample.destroy();
  return lineBaseline(line.y, line.height, metrics);
}

/**
 * `cap-middle` in the runs: the same rule with the node's base font `capHeight` and the baselines
 * of the first and last `runLayout` line (the piece is centered on the line height,
 * so the baseline is the piece's one with the base font).
 */
function capMiddleRunsShift(node: TextNode, layout: RunLayout): number {
  const first = layout.lines[0];
  const last = layout.lines[layout.lines.length - 1];
  if (node.height <= 0 || !first || !last) return 0;
  const { style } = node;
  const sample = new KonvaText({
    text: 'M',
    fontFamily: canvasFontFamily(style.fontFamily),
    fontSize: style.fontSize,
    fontStyle: fontStyle(style.fontWeight, style.italic),
  });
  const metrics = capMetricsOf(sample, style.fontSize);
  sample.destroy();
  const baseline = (line: { y: number; height: number }): number =>
    lineBaseline(line.y, line.height, metrics);
  return capMiddleShift({
    boxHeight: node.height,
    capHeight: metrics.capHeight,
    firstBaseline: baseline(first),
    lastBaseline: baseline(last),
  });
}

/** The run's color as a Konva fill (`none` = no fill). */
function runFill(color: string): string | undefined {
  return /^(none|transparent)$/i.test(color.trim()) ? undefined : color;
}

/** The background of an inline box: the whole box of the piece, with the run's radius. */
function chipShape(piece: RunPiece, run: SceneTextRun, top: number): KonvaRect {
  return new KonvaRect({
    x: piece.x,
    y: top,
    width: piece.width,
    height: piece.height,
    cornerRadius: run.radius ?? 0,
    fill: run.background,
  });
}

/**
 * The text of a piece: a single line, without width (the chip's leading space stays) and in the
 * run's font. In the chip the text sits `padding` inside the box; the line height comes from the
 * piece's height (the run's, without the chip's vertical breathing room).
 */
function runTextShape(
  node: TextNode,
  run: SceneTextRun,
  piece: RunPiece,
  top: number,
): KonvaText {
  const [padV, padH] = piece.chip ? (run.padding ?? [0, 0]) : [0, 0];
  const lineHeight = piece.height - 2 * (padV ?? 0);
  return new KonvaText({
    x: piece.x + (padH ?? 0),
    y: top + (padV ?? 0),
    text: piece.text,
    fontFamily: canvasFontFamily(run.fontFamily),
    fontSize: run.fontSize,
    fontStyle: fontStyle(run.fontWeight, run.italic),
    lineHeight: run.fontSize > 0 ? lineHeight / run.fontSize : 1.2,
    letterSpacing: node.style.letterSpacing ?? 0,
    textDecoration: run.decoration ?? '',
    wrap: 'none',
    fill: runFill(run.color),
    ...(node.style.direction === 'rtl' ? { direction: 'rtl' as const } : {}),
  });
}

/** Width and height of the source of a ready image; `null` if there is no way to know. */
function sourceSize(view: RemoteImageView): { width: number; height: number } | null {
  let width = view.width;
  let height = view.height;
  const image = view.image;
  if ((width === undefined || height === undefined) && image) {
    if ('naturalWidth' in image) {
      width = image.naturalWidth;
      height = image.naturalHeight;
    } else if ('width' in image && typeof image.width === 'number') {
      width = image.width;
      height = (image as { height: number }).height;
    }
  }
  if (!width || !height || width <= 0 || height <= 0) return null;
  return { width, height };
}

/**
 * Position, size and crop of the `KonvaImage` for the `fit`: `cover` crops the center of the source
 * to cover the box, `contain` fits the whole source in the center, `fill` stretches.
 */
export function imageFit(
  fit: ImageFit,
  box: Box,
  source: { width: number; height: number },
): {
  x: number;
  y: number;
  width: number;
  height: number;
  crop?: { x: number; y: number; width: number; height: number };
} {
  if (fit === 'fill') return { x: 0, y: 0, width: box.width, height: box.height };
  if (fit !== 'cover' && fit !== 'contain') return placedFit(fit, box, source);
  if (fit === 'contain') {
    const scale = Math.min(box.width / source.width, box.height / source.height);
    const width = source.width * scale;
    const height = source.height * scale;
    return { x: (box.width - width) / 2, y: (box.height - height) / 2, width, height };
  }
  const scale = Math.max(box.width / source.width, box.height / source.height);
  const cropWidth = box.width / scale;
  const cropHeight = box.height / scale;
  return {
    x: 0,
    y: 0,
    width: box.width,
    height: box.height,
    crop: {
      x: (source.width - cropWidth) / 2,
      y: (source.height - cropHeight) / 2,
      width: cropWidth,
      height: cropHeight,
    },
  };
}

const EPSILON = 1e-9;

/**
 * `fill-width`, `fill-height`, `scale-down` and `none` (format 4): the image at the `fit` scale,
 * centered in the box and clipped where it exceeds it (the `ContentScale` `FillWidth`,
 * `FillHeight`,
 * `Inside` and `None`). `scale-down` never enlarges; `none` and `scale-down` use the natural size.
 */
function placedFit(
  fit: Exclude<ImageFit, 'cover' | 'contain' | 'fill'>,
  box: Box,
  source: { width: number; height: number },
): ReturnType<typeof imageFit> {
  if (box.width <= 0 || box.height <= 0 || source.width <= 0 || source.height <= 0)
    return { x: 0, y: 0, width: Math.max(0, box.width), height: Math.max(0, box.height) };
  const scale =
    fit === 'fill-width'
      ? box.width / source.width
      : fit === 'fill-height'
        ? box.height / source.height
        : fit === 'none'
          ? 1
          : Math.min(1, box.width / source.width, box.height / source.height);
  const width = Math.min(source.width * scale, box.width);
  const height = Math.min(source.height * scale, box.height);
  const placed = {
    x: (box.width - width) / 2,
    y: (box.height - height) / 2,
    width,
    height,
  };
  const cropWidth = width / scale;
  const cropHeight = height / scale;
  if (cropWidth >= source.width - EPSILON && cropHeight >= source.height - EPSILON)
    return placed;
  return {
    ...placed,
    crop: {
      x: (source.width - cropWidth) / 2,
      y: (source.height - cropHeight) / 2,
      width: cropWidth,
      height: cropHeight,
    },
  };
}

/** Image placeholder: the shape in gray, with an X. */
function placeholder(
  shape: Konva.Shape,
  box: Box,
  palette: RenderPalette,
): Konva.Shape[] {
  shape.fill(palette.placeholderFill);
  const cross = new KonvaLine({
    points: [0, 0, box.width, box.height, box.width, 0, 0, box.height],
    stroke: palette.placeholderLine,
    strokeWidth: 1,
    strokeScaleEnabled: false,
    listening: false,
  });
  // A polygon with two crossed segments: draws 0→end, end→(w,0), (w,0)→(0,h).
  return [shape, cross];
}

/**
 * A fully transparent shadow, or one without blur, offset or `spread` that grows the shape:
 * costs nothing to draw.
 */
export function isInvisibleShadow(shadow: Shadow): boolean {
  if (
    shadow.blur <= 0 &&
    shadow.offset.x === 0 &&
    shadow.offset.y === 0 &&
    (shadow.spread ?? 0) <= 0
  )
    return true;
  const color = shadow.color.trim().toLowerCase();
  if (color === 'transparent' || color === 'none') return true;
  const rgba = /^rgba?\(([^)]*)\)$/.exec(color);
  if (rgba) {
    const parts = (rgba[1] ?? '').split(',').map((p) => p.trim());
    return parts.length === 4 && Number(parts[3]) === 0;
  }
  const hex8 = /^#([0-9a-f]{8})$/.exec(color);
  if (hex8) return (hex8[1] ?? '').endsWith('00');
  const hex4 = /^#([0-9a-f]{4})$/.exec(color);
  if (hex4) return (hex4[1] ?? '').endsWith('0');
  return false;
}

/**
 * `maxLines`: if the text has more lines than the limit, the Konva box shrinks to `maxLines`
 * lines (it cuts, and puts the … with `ellipsis`) and moves down `offsetY` to keep the vertical
 * alignment of the node's box. `null` = the node's box will do.
 */
function maxLinesBox(
  attrs: TextConfig,
  node: TextNode,
  style: TextStyle,
): { height: number; offsetY: number } | null {
  if (style.maxLines === undefined || node.height <= 0) return null;
  const lineHeight = (attrs.lineHeight ?? 1.2) * style.fontSize;
  const probe = new KonvaText({ ...attrs, height: undefined });
  const natural = probe.height();
  probe.destroy();
  const { height, cut } = textBoxLimits(natural, style.maxLines, lineHeight);
  if (!cut || height >= node.height) return null;
  const free = node.height - height;
  const offsetY =
    style.verticalAlign === 'middle'
      ? free / 2
      : style.verticalAlign === 'bottom'
        ? free
        : 0;
  return { height, offsetY };
}

/**
 * Does this list's shadow call for separate shapes (several shadows or `spread`) and does the node
 * accept them?
 */
function castsShadows(node: SceneNode, shadows: readonly Shadow[]): boolean {
  const boxed = node.type === 'frame' || node.type === 'rect' || node.type === 'ellipse';
  return boxed && (shadows.length > 1 || shadows.some((s) => (s.spread ?? 0) !== 0));
}

/**
 * The shape that carries only one shadow: draws the node's silhouette (grown by `spread`) far away
 * from the screen and brings the shadow back through the shadow offset, which canvas 2D applies in
 * screen pixels (it neither rotates nor scales with the matrix). So the shape never shows and the
 * node's color does not change, with a translucent fill or not.
 */
function shadowCaster(node: SceneNode, shadow: Shadow): Konva.Shape {
  return new KonvaShape({
    width: node.width,
    height: node.height,
    listening: false,
    sceneFunc: (ctx) => castShadow(ctx._context, node, shadow),
  });
}

function castShadow(
  native: CanvasRenderingContext2D,
  node: SceneNode,
  shadow: Shadow,
): void {
  if (isInvisibleShadow(shadow)) return;
  const spread = shadow.spread ?? 0;
  const width = node.width + 2 * spread;
  const height = node.height + 2 * spread;
  if (width <= 0 || height <= 0) return;
  const m = native.getTransform();
  const sx = Math.hypot(m.a, m.b) || 1;
  const sy = Math.hypot(m.c, m.d) || 1;
  // How far the shape goes sideways: more than the screen, the shape and the blur together.
  const reach =
    native.canvas.width +
    native.canvas.height +
    Math.hypot(width * sx, height * sy) +
    2 * shadow.blur * Math.max(sx, sy) +
    1000;
  const away = reach / sx;
  native.save();
  native.shadowColor = shadow.color;
  native.shadowBlur = shadow.blur * Math.min(sx, sy);
  native.shadowOffsetX = shadow.offset.x * sx + away * m.a;
  native.shadowOffsetY = shadow.offset.y * sy + away * m.b;
  native.translate(-away - spread, -spread);
  if (node.type === 'ellipse') {
    native.beginPath();
    native.ellipse(width / 2, height / 2, width / 2, height / 2, 0, 0, Math.PI * 2);
  } else if (node.type === 'frame' || node.type === 'rect')
    roundedRectPath(native, width, height, spreadRadius(node.cornerRadius, spread));
  native.fillStyle = '#000000';
  native.fill();
  native.restore();
}

function applyShadow(shape: Konva.Shape, shadow: Shadow): void {
  // An invisible shadow still costs a canvas `shadowBlur` per draw: left out.
  if (isInvisibleShadow(shadow)) return;
  shape.shadowColor(shadow.color);
  shape.shadowBlur(shadow.blur);
  shape.shadowOffset(shadow.offset);
  shape.shadowOpacity(1);
  shape.shadowEnabled(true);
}

/**
 * The Text width carries the wrap slack; the `x` gives back what the `align` shifts because of it.
 */
function slackShift(align: TextStyle['align']): number {
  if (align === 'center') return -WRAP_SLACK / 2;
  return align === 'right' ? -WRAP_SLACK : 0;
}

function shrinkRadius(radius: CornerRadius, by: number): CornerRadius {
  if (typeof radius === 'number') return Math.max(0, radius - by);
  return [
    Math.max(0, radius[0] - by),
    Math.max(0, radius[1] - by),
    Math.max(0, radius[2] - by),
    Math.max(0, radius[3] - by),
  ];
}

function isSquare(radius: CornerRadius): boolean {
  return typeof radius === 'number' ? radius === 0 : radius.every((r) => r === 0);
}

function konvaRadius(radius: CornerRadius): number | number[] {
  return typeof radius === 'number' ? radius : [...radius];
}

function flattenStops(
  stops: readonly { offset: number; color: string }[],
): Array<number | string> {
  return stops.flatMap((s) => [s.offset, s.color]);
}

/** Konva `fontStyle`: "italic 600", "bold", "normal"… (it builds the canvas font from this). */
export function fontStyle(weight: number, italic: boolean): string {
  const parts: string[] = [];
  if (italic) parts.push('italic');
  if (weight !== 400) parts.push(weight === 700 ? 'bold' : String(weight));
  return parts.length > 0 ? parts.join(' ') : 'normal';
}

/**
 * Decomposes the node's matrix into x, y, rotation, scale and skew, as Konva expects. With
 * a negative determinant (the `mirror` flip in rtl) Konva would return a 180° rotation and a
 * negative `scaleY`; here the flip stays in `scaleX` (the same geometry, without a spurious
 * rotation).
 */
export function decompose(m: Matrix): {
  x: number;
  y: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
  skewX: number;
  skewY: number;
} {
  if (m[0] * m[3] - m[1] * m[2] >= 0) return new Konva.Transform([...m]).decompose();
  const flipped = new Konva.Transform([-m[0], -m[1], m[2], m[3], m[4], m[5]]).decompose();
  return { ...flipped, scaleX: -flipped.scaleX };
}

/** What `roundedRectPath` uses of the context: it serves Konva's and the native canvas 2D one. */
type PathContext = Pick<
  CanvasRenderingContext2D,
  'beginPath' | 'moveTo' | 'lineTo' | 'arcTo' | 'closePath'
>;

/** Rounded rectangle path on the context (for the frames' clip). */
function roundedRectPath(
  ctx: PathContext,
  width: number,
  height: number,
  radius: CornerRadius,
): void {
  const [tl, tr, br, bl] =
    typeof radius === 'number' ? [radius, radius, radius, radius] : radius;
  const clamp = (r: number) => Math.max(0, Math.min(r, width / 2, height / 2));
  const [a, b, c, d] = [clamp(tl), clamp(tr), clamp(br), clamp(bl)];
  ctx.beginPath();
  ctx.moveTo(a, 0);
  ctx.lineTo(width - b, 0);
  ctx.arcTo(width, 0, width, b, b);
  ctx.lineTo(width, height - c);
  ctx.arcTo(width, height, width - c, height, c);
  ctx.lineTo(d, height);
  ctx.arcTo(0, height, 0, height - d, d);
  ctx.lineTo(0, a);
  ctx.arcTo(0, 0, a, 0, a);
  ctx.closePath();
}

export function renderScene(scene: Scene, options: RenderOptions = {}): RenderResult {
  const renderer = new Renderer(options);
  const root = renderer.render(scene.root);
  return {
    root,
    byId: renderer.byId,
    warnings: renderer.warnings,
    imageUrls: [...renderer.imageUrls],
  };
}

/** The id of the scene node that owns a Konva event target (shape or container), if any. */
export function sceneIdOf(target: Konva.Node | null | undefined): string | undefined {
  let node: Konva.Node | null | undefined = target;
  while (node) {
    const id: unknown = node.getAttr(SCENE_ID_ATTR);
    if (typeof id === 'string') return id;
    node = node.getParent();
  }
  return undefined;
}

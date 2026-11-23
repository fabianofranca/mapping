import {
  containerBackgroundColor,
  isBackgroundContainer,
  projectIndex,
  type ReadingDirection,
  type Marking,
  type ProjectContainer,
} from '../src/model';
import type { TokenSelection } from '../src/model/components/tokens';
import { ToolError } from './errors';
import { encodeImage } from './image/codecs';
import { hexToRgb } from './image/compose';
import { paintContainerDrawingsWithImages } from './image/containerDrawing';
import { drawingModeToPin, type DrawingModeInput } from './drawingModeInput';
import { MAX_PIXELS, MIME, type ImageFormat } from './image/formats';
import { clampRect, createRaster, crop, resize, type PixelRect } from './image/raster';
import { loadImage, rectJson, scaleRect, sizeWarning, urlFields } from './imageTools';
import type { ImageResult, ImageSource } from './imageTools';
import type { ImageServer } from './imageServer';
import type { Refs } from './items';
import type { Roots } from './paths';
import { packageImageResolver } from './projects';

// `render_marking` and `render_container` (decision 32): the components' drawing as PNG, with real
// text, at the requested zoom and mode. It is the server's drawing, not a capture of the app.

export const MIN_ZOOM = 0.05;
export const MAX_ZOOM = 8;

export interface RenderOptions {
  readonly zoom?: number;
  /** A map axis -> entry (the listed axes are pinned) or one entry for every axis that declares it. */
  readonly drawingMode?: DrawingModeInput;
  /** Pins the reading direction in the image (like `drawingMode`); absent = each container's effective one. */
  readonly direction?: ReadingDirection;
  /** `image` (default): the container's file (or the background color, without a file); `none`: transparent. */
  readonly background?: 'image' | 'none';
  /** Margin around the marking, in container pixels (`render_marking` only). */
  readonly padding?: number;
  readonly format?: ImageFormat;
}

/** The ids of the marking and of all its descendants. */
function subtree(refs: Refs, marking: Marking): Set<string> {
  const children = projectIndex(refs.project).children;
  const ids = new Set<string>();
  const visit = (id: string) => {
    ids.add(id);
    for (const child of children.get(id) ?? []) visit(child.id);
  };
  visit(marking.id);
  return ids;
}

/** The background of the region: the container's file cropped and scaled, the background color or nothing. */
async function backdrop(
  roots: Roots,
  refs: Refs,
  container: ProjectContainer,
  region: PixelRect,
  size: { width: number; height: number },
  background: 'image' | 'none',
  imageSource: ImageSource | undefined,
  pinned: TokenSelection | undefined,
) {
  const out = createRaster(size.width, size.height);
  if (background === 'none') return { raster: out, warning: undefined };
  if (isBackgroundContainer(container)) {
    const [r, g, b] = hexToRgb(
      containerBackgroundColor(refs.project, container.id, pinned) ?? '#FFFFFF',
    );
    for (let i = 0; i < out.data.length; i += 4) {
      out.data[i] = r;
      out.data[i + 1] = g;
      out.data[i + 2] = b;
      out.data[i + 3] = 255;
    }
    return { raster: out, warning: undefined };
  }
  const loaded = await loadImage(roots, refs, container, imageSource, pinned);
  const warning = sizeWarning(loaded, container).warning;
  const scaled = scaleRect(region, loaded);
  const source = clampRect(scaled, loaded.raster);
  if (source === null) return { raster: out, warning };
  const cut = crop(loaded.raster, source);
  // The fractional window inside the whole-pixel crop: the background aligns with the drawing at any scale.
  const area = {
    x: scaled.x - source.x,
    y: scaled.y - source.y,
    width: Math.min(scaled.width, source.width - (scaled.x - source.x)),
    height: Math.min(scaled.height, source.height - (scaled.y - source.y)),
  };
  const raster = resize(cut, size.width, size.height, area);
  return { raster, warning };
}

/** Refuses output with too many pixels or a transparent background in JPEG. */
function checkLimits(
  size: { width: number; height: number; zoom: number },
  background: 'image' | 'none',
  format: ImageFormat,
): void {
  if (size.width * size.height > MAX_PIXELS) {
    throw new ToolError(
      'image-too-large',
      `image with too many pixels (${size.width}×${size.height}; maximum ${MAX_PIXELS}): reduce the zoom or the region`,
      size,
    );
  }
  if (background === 'none' && format === 'jpeg') {
    throw new ToolError(
      'invalid-arguments',
      'a transparent background (`background: "none"`) requires png or webp: jpeg has no transparency',
    );
  }
}

/** The map a `drawingMode` option pins (checked against the declared axes); absent without the option. */
function pinnedMode(refs: Refs, mode: DrawingModeInput | undefined) {
  return mode === undefined ? undefined : drawingModeToPin(refs.project, mode);
}

async function renderRegion(
  roots: Roots,
  refs: Refs,
  container: ProjectContainer,
  region: PixelRect,
  options: RenderOptions,
  markingIds: ReadonlySet<string> | undefined,
  images: ImageServer | null,
  source: ImageSource | undefined,
): Promise<{ json: Record<string, unknown>; image: ImageResult['image'] }> {
  const pinned = pinnedMode(refs, options.drawingMode);
  const zoom = options.zoom ?? 1;
  const width = Math.max(1, Math.round(region.width * zoom));
  const height = Math.max(1, Math.round(region.height * zoom));
  const background = options.background ?? 'image';
  const format = options.format ?? 'png';
  checkLimits({ width, height, zoom }, background, format);
  const { raster, warning } = await backdrop(
    roots,
    refs,
    container,
    region,
    { width, height },
    background,
    source,
    pinned,
  );
  const scaleX = width / region.width;
  const scaleY = height / region.height;
  const drawn = await paintContainerDrawingsWithImages(
    raster,
    {
      project: refs.project,
      catalog: refs.loaded.catalog,
      fonts: refs.loaded.fonts,
      images: packageImageResolver(roots, refs.loaded),
    },
    container.id,
    {
      scaleX,
      scaleY,
      originX: -region.x * scaleX,
      originY: -region.y * scaleY,
      clip: { x: 0, y: 0, width, height },
    },
    {
      ...(markingIds === undefined ? {} : { markingIds }),
      ...(pinned === undefined ? {} : { drawingMode: pinned }),
      ...(options.direction === undefined ? {} : { direction: options.direction }),
    },
  );
  const warnings = [warning, ...drawn.notes].filter((w) => w !== undefined);
  const bytes = await encodeImage(raster, format);
  return {
    json: {
      container: { ref: refs.ref('i', container.id), file: container.file },
      format,
      width,
      height,
      zoom,
      background,
      drawingMode: options.drawingMode ?? null,
      direction: options.direction ?? null,
      region: rectJson(region),
      drawings: drawn.count,
      ...(warnings.length === 0 ? {} : { warning: warnings.join('; ') }),
      note: "the server's drawing (bundled free font or the library's), not a capture of the app; the images of the library package are drawn from its files; a remote image becomes a placeholder",
      ...(await urlFields(images, bytes, format, 'drawing')),
    },
    image: { bytes, mimeType: MIME[format] },
  };
}

/** `render_marking`: the drawing of the marking and its subtree. */
export async function renderMarking(
  roots: Roots,
  refs: Refs,
  marking: Marking,
  options: RenderOptions,
  images: ImageServer | null = null,
  source?: ImageSource,
): Promise<ImageResult> {
  const container =
    marking.containerId === null
      ? undefined
      : projectIndex(refs.project).containers.get(marking.containerId);
  if (!container)
    throw new ToolError('not-found', "the marking's container was not found");
  const padding = options.padding ?? 0;
  const region = clampRect(
    {
      x: marking.rect.x - padding,
      y: marking.rect.y - padding,
      width: marking.rect.width + 2 * padding,
      height: marking.rect.height + 2 * padding,
    },
    container,
  );
  if (!region) {
    throw new ToolError(
      'marking-outside-image',
      'the marking is outside the container: nothing to draw',
      {
        rect: rectJson(marking.rect),
        container: { width: container.width, height: container.height },
      },
    );
  }
  const result = await renderRegion(
    roots,
    refs,
    container,
    region,
    options,
    subtree(refs, marking),
    images,
    source,
  );
  return {
    json: { ref: refs.ref('m', marking.id), ...result.json },
    image: result.image,
  };
}

/** `render_container`: the drawing of the components of the whole container. */
export async function renderContainer(
  roots: Roots,
  refs: Refs,
  container: ProjectContainer,
  options: RenderOptions,
  images: ImageServer | null = null,
  source?: ImageSource,
): Promise<ImageResult> {
  const region = { x: 0, y: 0, width: container.width, height: container.height };
  const result = await renderRegion(
    roots,
    refs,
    container,
    region,
    options,
    undefined,
    images,
    source,
  );
  return {
    json: { ref: refs.ref('i', container.id), ...result.json },
    image: result.image,
  };
}

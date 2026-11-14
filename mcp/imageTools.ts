import { readFile, stat } from 'node:fs/promises';
import { basename } from 'node:path';
import {
  isBackgroundContainer,
  projectIndex,
  type ExifOrientation,
  type Marking,
  type ProjectContainer,
} from '../src/model';
import { ToolError } from './errors';
import { assertFileSize, decodeImage, encodeImage } from './image/codecs';
import {
  CHILD_COLORS,
  DEFAULT_MAX_SIZE,
  MARKING_OUTLINE,
  MAX_OUTLINED_CHILDREN,
  compose,
  hexToRgb,
  type Outline,
} from './image/compose';
import { MIME, type ImageFormat } from './image/formats';
import {
  clampRect,
  createRaster,
  OUTLINE_THICKNESS,
  fitSize,
  resize,
  type PixelRect,
  type Raster,
} from './image/raster';
import { paintContainerDrawings } from './image/containerDrawing';
import type { ImageServer } from './imageServer';
import type { Refs } from './items';
import { resolveProjectFile, type Roots } from './paths';

export type ImageMode = 'crop' | 'context';

export interface MarkingImageOptions {
  readonly padding?: number;
  readonly mode?: ImageMode;
  readonly outlineChildren?: boolean;
  readonly maxSize?: number;
  readonly format?: ImageFormat;
}

export interface ImageFileOptions {
  readonly maxSize?: number;
  readonly format?: ImageFormat;
}

/** Text (JSON) and the image the tool returns. */
export interface ImageResult {
  readonly json: Record<string, unknown>;
  readonly image: { readonly bytes: Uint8Array; readonly mimeType: string };
}

export interface LoadedImage {
  readonly raster: Raster;
  readonly bytes: Uint8Array;
  readonly format: ImageFormat;
  /** The file's EXIF orientation (1 = no rotation); the `raster` is already rotated. */
  readonly orientation: ExifOrientation;
  readonly file: string | null;
  /** File / project ratio: ≠ 1 if the file does not have the dimensions saved in `mapping.json`. */
  readonly scaleX: number;
  readonly scaleY: number;
}

export const EXTENSION: Record<ImageFormat, string> = {
  png: 'png',
  jpeg: 'jpg',
  webp: 'webp',
};

/**
 * `url` (local HTTP) and `markdown` of the returned image. Without a server, or if it does not
 * start (warning on stderr), the tool responds without these fields.
 */
export async function urlFields(
  images: ImageServer | null,
  bytes: Uint8Array,
  format: ImageFormat,
  alt: string,
): Promise<{ url?: string; markdown?: string }> {
  if (!images) return {};
  try {
    const url = await images.publish(bytes, MIME[format], EXTENSION[format]);
    const cleanAlt = alt.replace(/[\]\r\n]+/g, ' ').trim();
    return { url, markdown: `![${cleanAlt}](${url})` };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`mapping-mcp: image server unavailable: ${message}\n`);
    return {};
  }
}

/** Above this many pixels, a container without a file is rasterized downscaled (it is a single color). */
const MAX_BACKGROUND_PIXELS = 4096 * 4096;

/**
 * Container without a file: a flat raster with the `background` color, the size of the image
 * (the components' drawing is painted over it afterwards, only in the requested region) (downscaled
 * if huge: `scaleX`/`scaleY` ≠ 1 are already handled).
 */
function backgroundImage(image: ProjectContainer): LoadedImage {
  const shrink = Math.min(
    1,
    Math.sqrt(MAX_BACKGROUND_PIXELS / (image.width * image.height)),
  );
  const raster = createRaster(
    Math.max(1, Math.round(image.width * shrink)),
    Math.max(1, Math.round(image.height * shrink)),
  );
  const [r, g, b] = hexToRgb(image.background ?? '#FFFFFF');
  for (let i = 0; i < raster.data.length; i += 4) {
    raster.data[i] = r;
    raster.data[i + 1] = g;
    raster.data[i + 2] = b;
    raster.data[i + 3] = 255;
  }
  return {
    raster,
    bytes: new Uint8Array(),
    format: 'png',
    orientation: 1,
    file: null,
    scaleX: raster.width / image.width,
    scaleY: raster.height / image.height,
  };
}

export async function loadImage(
  roots: Roots,
  refs: Refs,
  image: ProjectContainer,
): Promise<LoadedImage> {
  if (image.file === null) return backgroundImage(image);
  const absolute = await resolveProjectFile(roots, refs.loaded.location.dir, image.file);
  if (absolute === null) {
    throw new ToolError(
      'image-file-missing',
      `the image file does not exist (or is outside the roots): ${image.file}`,
      { image: refs.ref('i', image.id), file: image.file },
    );
  }
  assertFileSize((await stat(absolute)).size);
  const bytes = await readFile(absolute);
  const { format, raster, orientation } = await decodeImage(bytes);
  return {
    raster,
    bytes,
    format,
    orientation,
    file: basename(absolute),
    scaleX: raster.width / image.width,
    scaleY: raster.height / image.height,
  };
}

/** Default output format: JPEG for photos (JPEG source), PNG otherwise (screenshots and text, lossless). */
function outputFormat(requested: ImageFormat | undefined, source: ImageFormat) {
  return requested ?? (source === 'jpeg' ? 'jpeg' : 'png');
}

export function scaleRect(rect: PixelRect, loaded: LoadedImage): PixelRect {
  return {
    x: rect.x * loaded.scaleX,
    y: rect.y * loaded.scaleY,
    width: rect.width * loaded.scaleX,
    height: rect.height * loaded.scaleY,
  };
}

export const sizeWarning = (loaded: LoadedImage, image: ProjectContainer) =>
  (loaded.scaleX === 1 && loaded.scaleY === 1) || loaded.file === null
    ? {}
    : {
        warning: `the file is ${loaded.raster.width}×${loaded.raster.height}, but the project records ${image.width}×${image.height}: the coordinates were proportionally adjusted`,
      };

export const rectJson = (r: PixelRect) => ({
  x: r.x,
  y: r.y,
  width: r.width,
  height: r.height,
});

/** `get_marking_image`: crop of the marking, or the whole image with it highlighted. */
export async function markingImage(
  roots: Roots,
  refs: Refs,
  marking: Marking,
  options: MarkingImageOptions,
  images: ImageServer | null = null,
): Promise<ImageResult> {
  const index = projectIndex(refs.project);
  if (marking.containerId === null) {
    throw new ToolError(
      'invalid-arguments',
      'a canvas marking has no image of its own: use get_container_file of the containers under it',
    );
  }
  const image = index.containers.get(marking.containerId);
  if (!image) throw new ToolError('not-found', "the marking's container was not found");
  const mode = options.mode ?? 'crop';
  const padding = options.padding ?? 0;
  const maxSize = options.maxSize ?? DEFAULT_MAX_SIZE;
  const loaded = await loadImage(roots, refs, image);

  const own = scaleRect(marking.rect, loaded);
  const region =
    mode === 'context'
      ? { x: 0, y: 0, width: loaded.raster.width, height: loaded.raster.height }
      : clampRect(
          {
            x: own.x - padding * loaded.scaleX,
            y: own.y - padding * loaded.scaleY,
            width: own.width + 2 * padding * loaded.scaleX,
            height: own.height + 2 * padding * loaded.scaleY,
          },
          loaded.raster,
        );
  if (!region) {
    throw new ToolError(
      'marking-outside-image',
      'the marking is outside the container: nothing to crop',
      {
        rect: rectJson(marking.rect),
        container: { width: image.width, height: image.height },
      },
    );
  }

  // Container without a file: paints the components' drawing (the same as `render_container`, with the
  // bundled font or the library's) in the region the output shows.
  const bgContainer = isBackgroundContainer(image);
  if (bgContainer) {
    paintContainerDrawings(
      loaded.raster,
      { project: refs.project, catalog: refs.loaded.catalog, fonts: refs.loaded.fonts },
      image.id,
      {
        scaleX: loaded.scaleX,
        scaleY: loaded.scaleY,
        clip: region,
      },
    );
  }

  const legend: { color: string; name: string; ref: string; rect: PixelRect }[] = [];
  const outlines: Outline[] = [];
  if (mode === 'context') outlines.push({ rect: own, color: MARKING_OUTLINE });
  let omitted = 0;
  if (options.outlineChildren) {
    const children = index.children.get(marking.id) ?? [];
    children.forEach((child, i) => {
      if (i >= MAX_OUTLINED_CHILDREN) {
        omitted++;
        return;
      }
      const color = CHILD_COLORS[i % CHILD_COLORS.length]!;
      outlines.push({ rect: scaleRect(child.rect, loaded), color });
      legend.push({
        color,
        name: refs.markingName(child.id),
        ref: refs.ref('m', child.id),
        rect: child.rect,
      });
    });
  }

  const composed = compose(loaded.raster, region, outlines, maxSize);
  const format = outputFormat(options.format, loaded.format);
  const bytes = await encodeImage(composed.raster, format);

  const markingOutline = mode === 'context' ? composed.outlines[0]! : null;
  const markingInOutput =
    markingOutline?.output ??
    ((): PixelRect => {
      const s = composed.scale;
      return {
        x: Math.round((own.x - composed.region.x) * s),
        y: Math.round((own.y - composed.region.y) * s),
        width: Math.max(1, Math.round(own.width * s)),
        height: Math.max(1, Math.round(own.height * s)),
      };
    })();

  return {
    json: {
      ref: refs.ref('m', marking.id),
      mode,
      container: {
        ref: refs.ref('i', image.id),
        file: image.file,
        background: image.background,
      },
      ...(bgContainer
        ? {
            drawing: 'rendered',
            drawingNote:
              "drawing of the components with real text (bundled font or the library's), shadow, dashes and icons; no gradient (the first color applies) and no remote image (it becomes a placeholder)",
          }
        : {}),
      format,
      width: composed.raster.width,
      height: composed.raster.height,
      scale: composed.scale,
      // The region of the original image the output shows (image pixels; x = y = 0 on the whole image).
      region: rectJson(composed.region),
      padding,
      // Where the marking ended up in the output (pixels of the returned image).
      markingInOutput: rectJson(markingInOutput),
      ...(mode === 'context'
        ? { markingOutline: { color: MARKING_OUTLINE, thickness: OUTLINE_THICKNESS } }
        : {}),
      ...(options.outlineChildren
        ? {
            childrenLegend: legend.map((l) => ({
              color: l.color,
              name: l.name,
              ref: l.ref,
              rect: rectJson(l.rect),
            })),
            ...(omitted > 0 ? { childrenNotOutlined: omitted } : {}),
          }
        : {}),
      ...sizeWarning(loaded, image),
      ...(await urlFields(images, bytes, format, refs.markingName(marking.id))),
    },
    image: { bytes, mimeType: MIME[format] },
  };
}

/** `get_container_file`: the container's whole image, scaled down if it exceeds `maxSize`. */
export async function imageFile(
  roots: Roots,
  refs: Refs,
  image: ProjectContainer,
  options: ImageFileOptions,
  images: ImageServer | null = null,
): Promise<ImageResult> {
  if (isBackgroundContainer(image)) {
    throw new ToolError(
      'container-without-file',
      'The container has no image file (background color only): use get_marking_image to see the drawing.',
      { container: refs.ref('i', image.id) },
    );
  }
  const maxSize = options.maxSize ?? DEFAULT_MAX_SIZE;
  const loaded = await loadImage(roots, refs, image);
  const { raster } = loaded;
  const target = fitSize(raster.width, raster.height, maxSize);

  // With EXIF orientation the file's bytes contradict the JSON's already-rotated dimensions: re-encode.
  const same =
    target.scale === 1 &&
    loaded.orientation === 1 &&
    (!options.format || options.format === loaded.format);
  const format = outputFormat(options.format, loaded.format);
  // It fits and the format did not change: returns the file as is, without re-encoding.
  const bytes = same
    ? loaded.bytes
    : await encodeImage(
        target.scale === 1 ? raster : resize(raster, target.width, target.height),
        format,
      );
  return {
    json: {
      ref: refs.ref('i', image.id),
      file: image.file,
      format: same ? loaded.format : format,
      width: target.width,
      height: target.height,
      originalWidth: raster.width,
      originalHeight: raster.height,
      scale: target.scale,
      recoded: !same,
      ...sizeWarning(loaded, image),
      ...(await urlFields(
        images,
        bytes,
        same ? loaded.format : format,
        image.file ?? '',
      )),
    },
    image: { bytes, mimeType: MIME[same ? loaded.format : format] },
  };
}

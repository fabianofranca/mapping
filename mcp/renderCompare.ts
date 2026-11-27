import type { ProjectContainer } from '../src/model';
import { ToolError } from './errors';
import { encodeImage } from './image/codecs';
import { MAX_PIXELS, MIME, type ImageFormat } from './image/formats';
import type { PixelRect, Raster } from './image/raster';
import {
  DIFF_GAP,
  diffRasters,
  sideBySide,
  unionRegion,
  type DiffGeometry,
} from './image/rasterDiff';
import type { ImageServer } from './imageServer';
import { rectJson, urlFields } from './imageTools';
import type { ImageResult, ImageSource } from './imageTools';
import type { Refs } from './items';
import type { Operation } from './operations';
import type { Roots } from './paths';
import {
  drawContainer,
  MAX_ZOOM,
  MIN_ZOOM,
  type DrawnContainer,
  type RenderOptions,
} from './renderImage';
import {
  hasPreview,
  openContainerSide,
  previewFields,
  type PreviewArgs,
} from './renderPreview';

// The compare mode of `render_container` (stage #2928, decisions 8 to 10): the call's own side (the
// project, a batch or a proposal) against the before side that `compare` describes. Both sides are drawn
// to rasters (nothing is written); `mcp/image/rasterDiff.ts` counts, boxes and lays out the differences.

/** The before side: the project as it is (`{}`), a batch or a proposal; `ref` names the container there. */
export interface CompareArgs {
  readonly ref?: string | undefined;
  readonly proposal?: string | undefined;
  readonly operations?: readonly Operation[] | undefined;
  readonly operationsFile?: string | undefined;
}

/** The container of the project as it is on disk (a side with no batch or proposal). */
export type TodaySide = (
  ref: string,
  project: string | undefined,
) => Promise<{ refs: Refs; container: ProjectContainer }>;

type SideName = 'before' | 'after';

interface Side {
  readonly refs: Refs;
  readonly container: ProjectContainer;
  readonly source: ImageSource | undefined;
  /** `alias`, `provisional` and `preview`, as the preview of a render returns them. */
  readonly fields: Record<string, unknown>;
  readonly warning: string | undefined;
}

/** Runs `work` and names the side in the refusal it throws: `<side> side: …` and `side` in the details. */
async function onSide<T>(side: SideName, work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (!(error instanceof ToolError)) throw error;
    throw new ToolError(error.code, `${side} side: ${error.message}`, {
      ...error.details,
      side,
    });
  }
}

async function openSide(
  roots: Roots,
  now: () => number,
  args: PreviewArgs,
  today: TodaySide,
): Promise<Side> {
  if (hasPreview(args)) {
    const { preview, target, container } = await openContainerSide(roots, now, args);
    return {
      refs: preview.refs,
      container,
      source: preview.source,
      fields: previewFields(preview, target, 'i'),
      warning: preview.warning,
    };
  }
  if (args.ref.startsWith('$')) {
    throw new ToolError(
      'not-found',
      `container not found: ${args.ref} (an alias names a container that a batch creates, and this side has no batch: give the container's reference in \`compare.ref\`)`,
      { ref: args.ref },
    );
  }
  const { refs, container } = await today(args.ref, args.project);
  return { refs, container, source: undefined, fields: {}, warning: undefined };
}

/** Both sides are in one project (a proposal or a reference of another one is `project-mismatch`). */
function requireSameProject(before: Side, after: Side): void {
  const [a, b] = [before.refs.loaded.location, after.refs.loaded.location];
  if (a.dir === b.dir) return;
  throw new ToolError(
    'project-mismatch',
    `the two sides are in different projects ("${a.name}" and "${b.name}"): a compare is within one project`,
  );
}

/** The warnings of both sides: the same text on both is said once, the others are named by their side. */
function warningsOf(
  opened: Record<SideName, Side>,
  drawn: Record<SideName, DrawnContainer>,
): string[] {
  const of = (side: SideName) =>
    [opened[side].warning, drawn[side].json.warning, drawn[side].warning].filter(
      (w): w is string => typeof w === 'string' && w !== '',
    );
  const [before, after] = [of('before'), of('after')];
  const both = before.filter((w) => after.includes(w));
  return [
    ...both,
    ...before.filter((w) => !both.includes(w)).map((w) => `before side: ${w}`),
    ...after.filter((w) => !both.includes(w)).map((w) => `after side: ${w}`),
  ];
}

/** WebP cannot encode a side above 16,383 pixels. */
const WEBP_MAX_SIDE = 16383;

/** The side-by-side crop size of a union box at a zoom: two halves and the gap. */
const cropSize = (union: PixelRect, zoom: number) => ({
  width: Math.ceil(union.width * zoom) * 2 + DIFF_GAP,
  height: Math.ceil(union.height * zoom),
});

/** The largest zoom (two decimals) at which the crop of `union` fits the limits of `format`, or the minimum zoom. */
function fittingZoom(union: PixelRect, format: ImageFormat): number {
  const side = format === 'webp' ? WEBP_MAX_SIDE : Infinity;
  for (
    let zoom = MAX_ZOOM;
    zoom > MIN_ZOOM;
    zoom = Math.round((zoom - 0.01) * 100) / 100
  ) {
    const size = cropSize(union, zoom);
    if (
      size.width * size.height <= MAX_PIXELS &&
      Math.max(size.width, size.height) <= side
    ) {
      return zoom;
    }
  }
  return MIN_ZOOM;
}

/** The side-by-side of the changes, or the after drawing when nothing differs. */
function composedImage(
  before: Raster,
  after: Raster,
  diff: ReturnType<typeof diffRasters>,
  geometry: DiffGeometry,
  fallback: PixelRect,
  format: ImageFormat,
): { raster: Raster; region: PixelRect } {
  const union = unionRegion(diff.boxes, diff.area, geometry);
  if (union === null) return { raster: after, region: fallback };
  const size = cropSize(union, geometry.zoom);
  const tooWide = format === 'webp' && Math.max(size.width, size.height) > WEBP_MAX_SIDE;
  if (size.width * size.height > MAX_PIXELS || tooWide) {
    const fits = fittingZoom(union, format);
    throw new ToolError(
      'image-too-large',
      `the side-by-side of the changes is too large (${size.width}×${size.height}; maximum ${MAX_PIXELS} pixels${format === 'webp' ? `, ${WEBP_MAX_SIDE} per side in webp` : ''}): call again with \`zoom\` ${fits} or lower, or with a \`region\` that is a part of the one in the details (the box that covers all the changes)`,
      { ...size, zoom: geometry.zoom, fittingZoom: fits, region: rectJson(union) },
    );
  }
  return sideBySide(before, after, diff, geometry, format === 'jpeg')!;
}

/** What one side of the response says: its reference and preview fields, the size of its drawing and its `url`. */
async function sideJson(
  opened: Side,
  drawn: DrawnContainer,
  images: ImageServer | null,
  name: SideName,
): Promise<Record<string, unknown>> {
  const urls =
    images === null
      ? {}
      : await urlFields(
          images,
          await encodeImage(drawn.raster, drawn.format),
          drawn.format,
          name,
        );
  return {
    ref: opened.refs.ref('i', opened.container.id),
    ...opened.fields,
    width: drawn.raster.width,
    height: drawn.raster.height,
    ...urls,
  };
}

/**
 * `render_container` with `compare`: draws the before side (`compare`) and the call's own side
 * (`after`, its preview arguments or the project as it is), and returns the count of different pixels,
 * the boxes of the changed regions and a side-by-side crop of them.
 */
export async function renderCompare(
  roots: Roots,
  now: () => number,
  today: TodaySide,
  after: PreviewArgs,
  compare: CompareArgs,
  options: RenderOptions,
  images: ImageServer | null,
): Promise<ImageResult> {
  const beforeArgs: PreviewArgs = {
    ref: compare.ref ?? after.ref,
    project: after.project,
    proposal: compare.proposal,
    operations: compare.operations,
    operationsFile: compare.operationsFile,
  };
  const opened = {
    before: await onSide('before', () => openSide(roots, now, beforeArgs, today)),
    after: await onSide('after', () => openSide(roots, now, after, today)),
  };
  requireSameProject(opened.before, opened.after);
  const drawn = {
    before: await onSide('before', () =>
      drawContainer(
        roots,
        opened.before.refs,
        opened.before.container,
        options,
        opened.before.source,
      ),
    ),
    after: await onSide('after', () =>
      drawContainer(
        roots,
        opened.after.refs,
        opened.after.container,
        options,
        opened.after.source,
      ),
    ),
  };
  const zoom = options.zoom ?? 1;
  const geometry: DiffGeometry = {
    zoom,
    origin: { x: drawn.before.region.x, y: drawn.before.region.y },
  };
  const diff = diffRasters(drawn.before.raster, drawn.after.raster, geometry);
  const format = drawn.after.format;
  const image = composedImage(
    drawn.before.raster,
    drawn.after.raster,
    diff,
    geometry,
    drawn.after.region,
    format,
  );
  const bytes = await encodeImage(image.raster, format);
  const warnings = warningsOf(opened, drawn);
  return {
    json: {
      ref: opened.after.refs.ref('i', opened.after.container.id),
      ...opened.after.fields,
      container: {
        ref: opened.after.refs.ref('i', opened.after.container.id),
        file: opened.after.container.file,
      },
      format,
      width: image.raster.width,
      height: image.raster.height,
      zoom,
      background: options.background ?? 'image',
      drawingMode: options.drawingMode ?? null,
      direction: options.direction ?? null,
      region: rectJson(image.region),
      compare: {
        pixels: diff.pixels,
        ratio:
          Math.round((diff.pixels / (diff.area.width * diff.area.height)) * 1e4) / 1e4,
        regions: diff.boxes.map(rectJson),
        ...(diff.omitted > 0 ? { regionsOmitted: diff.omitted } : {}),
        ...(diff.sizeChanged ? { sizeChanged: true } : {}),
        before: await sideJson(opened.before, drawn.before, images, 'before'),
        after: await sideJson(opened.after, drawn.after, images, 'after'),
      },
      ...(warnings.length === 0 ? {} : { warning: warnings.join('; ') }),
      note:
        diff.pixels === 0
          ? 'the two drawings are identical (every pixel, exact): the image is the after drawing'
          : 'the image is the side-by-side crop of the changed regions (before on the left, after on the right, each region outlined in magenta); `regions` are in container pixels and the pixels are compared exactly',
      ...(await urlFields(images, bytes, format, 'compare')),
    },
    image: { bytes, mimeType: MIME[format] },
  };
}

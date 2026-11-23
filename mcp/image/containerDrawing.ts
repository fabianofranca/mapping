import {
  createDrawingCache,
  type DrawingModeMap,
  type ComponentCatalog,
  type ComponentDrawing,
  type Project,
  type ReadingDirection,
} from '../../src/model';
import { imageRefsOf, type ImageResolver } from './packageImages';
import type { Raster } from './raster';
import { paintScene, type SceneView } from './sceneRaster';
import type { TextMeasurer } from '../../src/model/components/instantiate';
import { builtinFontBook, measurerFor, type FontBook } from './textMeasurer';

// The drawing of a container's components onto a raster: the same for `get_marking_image`
// (container without a file), `render_marking` and `render_container`.

export interface DrawingSource {
  readonly project: Project;
  readonly catalog: ComponentCatalog;
  readonly fonts?: FontBook;
  /** Finds and decodes the package images the drawings cite; absent = every package image is the placeholder. */
  readonly images?: ImageResolver;
}

export interface PaintOptions {
  /** Only these markings (and no others); absent = all those of the container. */
  readonly markingIds?: ReadonlySet<string>;
  /** Pins the drawing mode across the whole container; absent = each one's effective mode. */
  readonly drawingMode?: DrawingModeMap;
  /** Pins the reading direction across the whole container; absent = each one's effective direction. */
  readonly direction?: ReadingDirection;
}

const caches = new WeakMap<FontBook, ReturnType<typeof createDrawingCache>>();

/**
 * The project with the axes of `mode` pinned everywhere (on the project and on the containers that pin their
 * own); the other axes stay as each container's effective mode has them.
 */
export function withDrawingMode(p: Project, mode: DrawingModeMap): Project {
  return {
    ...p,
    drawingMode: { ...p.drawingMode, ...mode },
    containers: p.containers.map((c) =>
      c.drawingMode == null ? c : { ...c, drawingMode: { ...c.drawingMode, ...mode } },
    ),
  };
}

/** The project with `direction` everywhere (the project's and that of the containers that pin their own). */
export function withDirection(p: Project, direction: ReadingDirection): Project {
  return {
    ...p,
    direction,
    containers: p.containers.map((c) => (c.direction == null ? c : { ...c, direction })),
  };
}

interface Selected {
  readonly drawings: ComponentDrawing[];
  readonly measure: TextMeasurer;
  readonly fonts: FontBook;
}

/** The drawings of the container's components that `options` asks for, in drawing order. */
function selectDrawings(
  source: DrawingSource,
  containerId: string,
  options: PaintOptions,
): Selected {
  const fonts = source.fonts ?? builtinFontBook();
  const measure = measurerFor(fonts);
  let cache = caches.get(fonts);
  if (cache === undefined) {
    cache = createDrawingCache();
    caches.set(fonts, cache);
  }
  const moded =
    options.drawingMode === undefined
      ? source.project
      : withDrawingMode(source.project, options.drawingMode);
  const project =
    options.direction === undefined ? moded : withDirection(moded, options.direction);
  const drawings = [...cache(project, source.catalog, measure, 0).values()].filter(
    (d) =>
      d.containerId === containerId &&
      // What sits in a slot hidden by `visible`, or under one, is not drawn (as in the app).
      d.hidden !== true &&
      (options.markingIds === undefined || options.markingIds.has(d.markingId)),
  );
  return { drawings, measure, fonts };
}

/**
 * Paints onto `raster` the drawing of the components of the markings of `containerId`, in drawing order.
 * Without the package images (a package image is the placeholder); `paintContainerDrawingsWithImages`
 * decodes them first.
 */
export function paintContainerDrawings(
  raster: Raster,
  source: DrawingSource,
  containerId: string,
  view: Omit<SceneView, 'fonts' | 'images'>,
  options: PaintOptions = {},
): number {
  const { drawings, measure, fonts } = selectDrawings(source, containerId, options);
  paintScene(raster, drawings, measure, { ...view, fonts });
  return drawings.length;
}

/** What `paintContainerDrawingsWithImages` did: the drawings painted and why an image was not drawn. */
export interface PaintedContainer {
  readonly count: number;
  /** One line for each package image that is the placeholder (missing, corrupt, over a limit). */
  readonly notes: readonly string[];
}

/**
 * `paintContainerDrawings` with the package images: the ones the drawings cite are decoded
 * (`source.images`: cached by file stamp, within the limits of decision 12) before painting.
 */
export async function paintContainerDrawingsWithImages(
  raster: Raster,
  source: DrawingSource,
  containerId: string,
  view: Omit<SceneView, 'fonts' | 'images'>,
  options: PaintOptions = {},
): Promise<PaintedContainer> {
  const { drawings, measure, fonts } = selectDrawings(source, containerId, options);
  const refs = source.images === undefined ? [] : imageRefsOf(drawings);
  const images =
    source.images !== undefined && refs.length > 0
      ? await source.images(refs)
      : undefined;
  paintScene(raster, drawings, measure, {
    ...view,
    fonts,
    ...(images === undefined ? {} : { images }),
  });
  return { count: drawings.length, notes: images?.notes ?? [] };
}

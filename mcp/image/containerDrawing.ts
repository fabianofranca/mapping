import {
  createDrawingCache,
  drawingModesOf,
  type ComponentCatalog,
  type Project,
  type ReadingDirection,
} from '../../src/model';
import type { Raster } from './raster';
import { paintScene, type SceneView } from './sceneRaster';
import { builtinFontBook, measurerFor, type FontBook } from './textMeasurer';

// The drawing of a container's components onto a raster: the same for `get_marking_image`
// (container without a file), `render_marking` and `render_container`.

export interface DrawingSource {
  readonly project: Project;
  readonly catalog: ComponentCatalog;
  readonly fonts?: FontBook;
}

export interface PaintOptions {
  /** Only these markings (and no others); absent = all those of the container. */
  readonly markingIds?: ReadonlySet<string>;
  /** Pins the drawing mode across the whole container; absent = each one's effective mode. */
  readonly drawingMode?: string;
  /** Pins the reading direction across the whole container; absent = each one's effective direction. */
  readonly direction?: ReadingDirection;
}

const caches = new WeakMap<FontBook, ReturnType<typeof createDrawingCache>>();

/** The project with `mode` everywhere (the project's and that of the containers that pin their own). */
export function withDrawingMode(p: Project, mode: string): Project {
  return {
    ...p,
    drawingMode: mode,
    containers: p.containers.map((c) =>
      c.drawingMode == null ? c : { ...c, drawingMode: mode },
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

/** The drawing modes that the applied specializations declare. */
export function declaredModes(p: Project): string[] {
  return drawingModesOf(p.specializations.map((s) => s.spec?.tokens));
}

/** Paints onto `raster` the drawing of the components of the markings of `containerId`, in drawing order. */
export function paintContainerDrawings(
  raster: Raster,
  source: DrawingSource,
  containerId: string,
  view: Omit<SceneView, 'fonts'>,
  options: PaintOptions = {},
): number {
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
      (options.markingIds === undefined || options.markingIds.has(d.markingId)),
  );
  paintScene(raster, drawings, measure, { ...view, fonts });
  return drawings.length;
}

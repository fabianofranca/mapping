import {
  createDrawingCache,
  drawingModesOf,
  type ComponentCatalog,
  type Project,
} from '../../src/model';
import type { Raster } from './raster';
import { paintScene, type SceneView } from './sceneRaster';
import { builtinFontBook, measurerFor, type FontBook } from './textMeasurer';

// O desenho dos componentes de um container sobre um raster: o mesmo para `get_marking_image`
// (container sem arquivo), `render_marking` e `render_container`.

export interface DrawingSource {
  readonly project: Project;
  readonly catalog: ComponentCatalog;
  readonly fonts?: FontBook;
}

export interface PaintOptions {
  /** Só estas marcações (e mais nenhuma); ausente = todas as do container. */
  readonly markingIds?: ReadonlySet<string>;
  /** Fixa o modo do desenho em todo o container; ausente = o efetivo de cada um. */
  readonly drawingMode?: string;
}

const caches = new WeakMap<FontBook, ReturnType<typeof createDrawingCache>>();

/** O projeto com `mode` em todo lugar (o do projeto e o dos containers que fixam o seu). */
export function withDrawingMode(p: Project, mode: string): Project {
  return {
    ...p,
    drawingMode: mode,
    containers: p.containers.map((c) =>
      c.drawingMode == null ? c : { ...c, drawingMode: mode },
    ),
  };
}

/** Os modos do desenho que as especializações aplicadas declaram. */
export function declaredModes(p: Project): string[] {
  return drawingModesOf(p.specializations.map((s) => s.spec?.tokens));
}

/** Pinta no `raster` o desenho dos componentes das marcações de `containerId`, na ordem do desenho. */
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
  const project =
    options.drawingMode === undefined
      ? source.project
      : withDrawingMode(source.project, options.drawingMode);
  const drawings = [...cache(project, source.catalog, measure, 0).values()].filter(
    (d) =>
      d.containerId === containerId &&
      (options.markingIds === undefined || options.markingIds.has(d.markingId)),
  );
  paintScene(raster, drawings, measure, { ...view, fonts });
  return drawings.length;
}

import type { Catalog, CatalogFormat, CatalogFormatExample } from './catalog';
import type { SpecComponents } from './componentCatalog';
import { createDrawingCache, type ComponentDrawing } from './componentDrawings';
import { baseNode, type FrameNode } from './components/scene';
import type { TextMeasurer } from './components/instantiate';
import type { ModelMessage } from './modelMessage';
import { applyFormatExample, type FormatCheckDeps } from './formatChecks';
import type { FormatRunner } from './formatPlugin';
import { projectIndex } from './projectIndex';
import type { Project, ProjectContainer, Rect } from './types';

// The Catalog's "File formats" page (stage #2035, AF5, decision 14): an example's `parse` result applied
// to an empty project with the specialization, and each container that has component markings drawn as a
// frame with every instance at its rectangle. Pure: the plugin runs in the injected `FormatRunner` and
// nothing here reads a file or touches the browser.

export interface FormatDrawDeps {
  readonly run: FormatRunner;
  readonly measure: TextMeasurer;
}

/** One component marking of a drawn container. */
export interface FormatInstance {
  readonly markingId: string;
  readonly typeId: string;
  /** In pixels of the container. */
  readonly rect: Rect;
}

/** A container the example built, drawn as a frame (the same `CatalogDrawing` shape of the other examples). */
export interface FormatContainerDrawing {
  readonly id: string;
  readonly name: string;
  readonly drawing: {
    readonly root: FrameNode;
    readonly warnings: readonly ModelMessage[];
  };
  readonly instances: readonly FormatInstance[];
}

export type FormatExampleView =
  /** The example is drawn: a frame per container that has component markings. */
  | { readonly kind: 'drawing'; readonly containers: readonly FormatContainerDrawing[] }
  /** `parse` worked, but no container has a component marking: the page shows only the text. */
  | { readonly kind: 'nothing' }
  /** The plugin, its result or an operation failed: the page shows the code and the message. */
  | { readonly kind: 'failed'; readonly code: string; readonly message: string }
  /** The Catalog has no text for the plugin or the example (a missing file, or a type it does not read). */
  | { readonly kind: 'unavailable' }
  /** An example with an `input` feeds `generate`: there is no screen to draw from it. */
  | { readonly kind: 'generate' };

/** The specialization file name the example runs under: only the plugin's relative path depends on it. */
const SPEC_PATH = 'library.spec.json';

function componentsOf(catalog: Catalog): SpecComponents | null {
  const { spec } = catalog;
  if (spec === null) return null;
  const byType = new Map(
    catalog.layers.flatMap((layer) =>
      layer.entries.flatMap((entry) =>
        entry.component === null ? [] : [[entry.type.id, entry.component] as const],
      ),
    ),
  );
  return {
    specId: spec.id,
    version: spec.version,
    byType,
    problems: [],
    problemMessages: [],
  };
}

function frameOf(
  container: ProjectContainer,
  drawings: readonly ComponentDrawing[],
): FrameNode {
  return {
    ...baseNode({
      id: container.id,
      name: container.name ?? container.id,
      width: container.width,
      height: container.height,
      fills:
        container.background === null
          ? []
          : [{ type: 'solid', color: container.background }],
    }),
    type: 'frame',
    clip: false,
    cornerRadius: 0,
    children: drawings.map((drawing) => drawing.root),
  };
}

function instancesOf(
  project: Project,
  drawings: readonly ComponentDrawing[],
): FormatInstance[] {
  const index = projectIndex(project);
  return drawings.flatMap((drawing) => {
    const marking = index.markings.get(drawing.markingId);
    const typeId = index.annotations.get(drawing.annotationId)?.type?.typeId;
    return marking === undefined || typeId === undefined
      ? []
      : [{ markingId: marking.id, typeId, rect: marking.rect }];
  });
}

/** Each container of `project` that has component markings, drawn, in the order of the project. */
function containersOf(
  project: Project,
  drawings: ReadonlyMap<string, ComponentDrawing>,
): FormatContainerDrawing[] {
  const found: FormatContainerDrawing[] = [];
  for (const container of project.containers) {
    const own = [...drawings.values()].filter((d) => d.containerId === container.id);
    if (own.length === 0) continue;
    found.push({
      id: container.id,
      name: container.name ?? container.id,
      drawing: {
        root: frameOf(container, own),
        warnings: own.flatMap((drawing) => drawing.warnings),
      },
      instances: instancesOf(project, own),
    });
  }
  return found;
}

/**
 * Draws one example of a format of the Catalog: its text goes through `parse` on an empty in-memory project
 * with the specialization and the result is drawn container by container. Never throws.
 */
export async function drawFormatExample(
  catalog: Catalog,
  format: CatalogFormat,
  example: CatalogFormatExample,
  deps: FormatDrawDeps,
): Promise<FormatExampleView> {
  const { spec } = catalog;
  const declared = spec?.fileFormats?.find((f) => f.id === format.id);
  const components = componentsOf(catalog);
  if (example.input !== undefined) return { kind: 'generate' };
  if (
    spec === null ||
    declared === undefined ||
    components === null ||
    format.pluginText === null ||
    example.text === null
  ) {
    return { kind: 'unavailable' };
  }
  try {
    const checkDeps: FormatCheckDeps = deps;
    const applied = await applyFormatExample(
      {
        spec,
        specPath: SPEC_PATH,
        format: declared,
        pluginText: format.pluginText,
        components,
      },
      example.text,
      checkDeps,
    );
    if (!applied.ok)
      return { kind: 'failed', code: applied.code, message: applied.message };
    const drawings = createDrawingCache()(
      applied.project,
      applied.catalog,
      deps.measure,
      0,
    );
    const containers = containersOf(applied.project, drawings);
    return containers.length === 0
      ? { kind: 'nothing' }
      : { kind: 'drawing', containers };
  } catch (error) {
    return {
      kind: 'failed',
      code: 'plugin-failed',
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

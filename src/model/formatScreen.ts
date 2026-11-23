import type { SpecComponents } from './componentCatalog';
import { createDrawingCache, type ComponentDrawing } from './componentDrawings';
import { drawingValues } from './componentValues';
import { resolveBackground } from './containerBackground';
import { effectiveDensity } from './density';
import { effectiveDirection } from './direction';
import { applyFormatExample, type FormatExampleInput } from './formatChecks';
import type { FormatFailureCode, FormatRunner } from './formatPlugin';
import type { Library } from './components/library';
import type { TextMeasurer } from './components/instantiate';
import type { Instance, Screen } from './components/screen';
import { parseSpec, type Spec } from './spec';
import { findSpecType } from './specLookup';
import { projectIndex } from './projectIndex';
import type { Marking, Project, ProjectContainer } from './types';

// From a format plugin's result to the screens the viewer draws (stage #2059, VF1, decisions 9 and 10).
// Pure: the plugin runs in the injected `FormatRunner` and nothing here reads a file or touches the
// browser, so the `model` project of Vitest runs it in Node. It never throws: every failure is a code and
// a message in `error`.

/** The codes of this function's own failures; the others are those of the runner and of the applier. */
export type FormatScreenCode =
  | 'format-not-found'
  | 'spec-invalid'
  | 'nothing-to-draw'
  | 'sandbox-unavailable'
  | FormatFailureCode;

export interface FormatScreenError {
  /** A `FormatScreenCode`, or the code of an operation the applier refused. */
  readonly code: string;
  readonly message: string;
  /** Where the plugin's own code threw (1-based), when the runner says. */
  readonly line?: number;
  readonly column?: number;
}

export interface FormatScreenOptions {
  /** `<specId>/<formatId>`, as the MCP cites a format. */
  readonly format: string;
  /** The text measurer that sizes the component markings without a `rect`; the host passes the one that draws. */
  readonly measure: TextMeasurer;
  /** Runs the plugin (the sandbox's in the viewer, QuickJS in Node). */
  readonly run: FormatRunner;
}

export interface FormatScreenResult {
  /** One per container with component markings, in project order; empty with `error`. */
  readonly screens: readonly Screen[];
  /** The first of `screens`. */
  readonly screen?: Screen;
  /** The plugin's warnings and the drawing values' warnings, as texts. */
  readonly warnings: readonly string[];
  readonly error?: FormatScreenError;
}

const SANDBOX_PHASE = 'sandbox';

/** The code a failed call is reported with: a failure of the phase `sandbox` is `sandbox-unavailable`. */
export function sandboxFailureCode(failure: {
  readonly code: string;
  readonly phase?: string;
}): string {
  return failure.phase === SANDBOX_PHASE ? 'sandbox-unavailable' : failure.code;
}

const failed = (
  code: string,
  message: string,
  place: { readonly line?: number; readonly column?: number } = {},
): FormatScreenResult => ({
  screens: [],
  warnings: [],
  error: {
    code,
    message,
    ...(place.line === undefined ? {} : { line: place.line }),
    ...(place.column === undefined ? {} : { column: place.column }),
  },
});

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

// --------------------------------------------------------------------------------- the inputs

/** The format cited, with its plugin text, or why the library has none. */
function findFormat(
  library: Library,
  cite: string,
): { readonly id: string; readonly pluginText: string } | FormatScreenResult {
  const cited = library.fileFormats.map((f) => ({
    ...f,
    cite: `${library.specId}/${f.id}`,
  }));
  const found = cited.find((f) => f.cite === cite);
  if (found === undefined) {
    const available =
      cited.length === 0
        ? 'this library declares no file formats'
        : `available: ${cited.map((f) => f.cite).join(', ')}`;
    return failed('format-not-found', `No file format "${cite}" (${available}).`);
  }
  if (found.pluginText === null) {
    return failed(
      'format-not-found',
      `The plugin of "${cite}" (${found.plugin}) did not come with the library.`,
    );
  }
  return { id: found.id, pluginText: found.pluginText };
}

/** The components of the library's types, as `SpecComponents` (what the applier and the drawings read). */
function componentsOf(library: Library, spec: Spec): SpecComponents {
  return {
    specId: spec.id,
    version: spec.version,
    byType: new Map(
      library.types.flatMap((type) =>
        type.component === undefined ? [] : [[type.id, type.component] as const],
      ),
    ),
    problems: [],
    problemMessages: [],
  };
}

function isFailure(value: unknown): value is FormatScreenResult {
  return typeof value === 'object' && value !== null && 'screens' in value;
}

// ------------------------------------------------------------------------------ the instances

/** The id of each marking: its `source.id` when it has one and it is unique, otherwise `m<n>`. */
function instanceIds(markings: readonly Marking[]): Map<string, string> {
  const counts = new Map<string, number>();
  for (const marking of markings) {
    const id = marking.source?.id;
    if (id !== undefined) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  const usable = (id: string | undefined): id is string =>
    id !== undefined && counts.get(id) === 1 && !/^m\d+$/.test(id);
  return new Map(
    markings.map((marking, index) => {
      const own = marking.source?.id;
      return [marking.id, usable(own) ? own : `m${index + 1}`] as const;
    }),
  );
}

/** The nearest ancestor of `marking` that has a drawing in this container, or `undefined`. */
function componentParent(
  project: Project,
  marking: Marking,
  drawings: ReadonlyMap<string, ComponentDrawing>,
): Marking | undefined {
  const markings = projectIndex(project).markings;
  let id = marking.parentId;
  for (let hops = 0; id !== null && hops <= markings.size; hops++) {
    const parent = markings.get(id);
    if (parent === undefined) return undefined;
    if (drawings.has(parent.id)) return parent;
    id = parent.parentId;
  }
  return undefined;
}

/** The slot of the parent the child sits in, only for a parent with more than one slot. */
function slotOf(
  parent: ComponentDrawing | undefined,
  markingId: string,
): string | undefined {
  if (parent === undefined || parent.slots.length <= 1) return undefined;
  const id = parent.slotOf.get(markingId) ?? '';
  return id === '' ? undefined : id;
}

interface Drawn {
  readonly instances: Instance[];
  readonly warnings: string[];
}

/** The component markings (those with a drawing) of each container, in project order, in a single pass. */
function markingsByContainer(
  project: Project,
  drawings: ReadonlyMap<string, ComponentDrawing>,
): Map<string, Marking[]> {
  const byContainer = new Map<string, Marking[]>();
  for (const marking of project.markings) {
    if (marking.containerId === null || !drawings.has(marking.id)) continue;
    const list = byContainer.get(marking.containerId);
    if (list === undefined) byContainer.set(marking.containerId, [marking]);
    else list.push(marking);
  }
  return byContainer;
}

function instancesOf(
  project: Project,
  own: readonly Marking[],
  drawings: ReadonlyMap<string, ComponentDrawing>,
  density: number,
): Drawn {
  const ids = instanceIds(own);
  const index = projectIndex(project);
  const warnings: string[] = [];
  const instances = own.flatMap((marking) => {
    const drawing = drawings.get(marking.id)!;
    const annotation = index.annotations.get(drawing.annotationId);
    const type = annotation?.type == null ? null : findSpecType(project, annotation.type);
    if (annotation === undefined || type === null) return [];
    const values = drawingValues(project, annotation, type.type);
    warnings.push(...values.warnings.map((w) => w.text));
    const parent = componentParent(project, marking, drawings);
    const slot = slotOf(
      parent === undefined ? undefined : drawings.get(parent.id),
      marking.id,
    );
    const { x, y, width, height } = marking.rect;
    const instance: Instance = {
      id: ids.get(marking.id)!,
      typeId: type.type.id,
      box: {
        x: x / density,
        y: y / density,
        width: width / density,
        height: height / density,
      },
      values: values.values,
      ...(parent === undefined ? {} : { parentId: ids.get(parent.id)! }),
      ...(slot === undefined ? {} : { slot }),
    };
    return [instance];
  });
  return { instances, warnings };
}

// -------------------------------------------------------------------------------- the screens

function screenOf(
  project: Project,
  container: ProjectContainer,
  order: number,
  drawn: Drawn,
  density: number,
): Screen {
  const background =
    container.background === null
      ? '#FFFFFF'
      : resolveBackground(project, container.background);
  const direction = effectiveDirection(project, container.id);
  return {
    id: `s${order}`,
    name: container.name ?? `Container ${order}`,
    width: container.width / density,
    height: container.height / density,
    background,
    ...(direction === 'rtl' ? { direction } : {}),
    instances: drawn.instances,
  };
}

function screensOf(
  project: Project,
  drawings: ReadonlyMap<string, ComponentDrawing>,
): { readonly screens: Screen[]; readonly warnings: string[] } {
  const screens: Screen[] = [];
  const warnings: string[] = [];
  const byContainer = markingsByContainer(project, drawings);
  for (const container of project.containers) {
    const own = byContainer.get(container.id);
    if (own === undefined) continue;
    const density = effectiveDensity(project, container.id);
    const drawn = instancesOf(project, own, drawings, density);
    screens.push(screenOf(project, container, screens.length + 1, drawn, density));
    warnings.push(...drawn.warnings);
  }
  return { screens, warnings };
}

// ------------------------------------------------------------------------------------ the entry

async function build(
  library: Library,
  text: string,
  options: FormatScreenOptions,
): Promise<FormatScreenResult> {
  const found = findFormat(library, options.format);
  if (isFailure(found)) return found;
  const parsed = parseSpec(library.specJson);
  if (!parsed.ok)
    return failed('spec-invalid', parsed.errors[0] ?? 'The specialization is invalid.');
  const { spec } = parsed;
  const declared = spec.fileFormats?.find((f) => f.id === found.id);
  if (declared === undefined) {
    return failed(
      'format-not-found',
      `The specialization does not declare the format "${options.format}".`,
    );
  }
  const input: FormatExampleInput = {
    spec,
    specPath: library.specPath,
    format: declared,
    pluginText: found.pluginText,
    components: componentsOf(library, spec),
  };
  const applied = await applyFormatExample(input, text, options);
  if (!applied.ok) {
    const { failure } = applied;
    return failed(
      failure === undefined ? applied.code : sandboxFailureCode(failure),
      applied.message,
      failure,
    );
  }
  const drawings = createDrawingCache()(
    applied.project,
    applied.catalog,
    options.measure,
    0,
  );
  const { screens, warnings } = screensOf(applied.project, drawings);
  if (screens.length === 0) {
    return failed(
      'nothing-to-draw',
      'The file has no container with component markings to draw.',
    );
  }
  return { screens, screen: screens[0]!, warnings: [...applied.warnings, ...warnings] };
}

/**
 * The screens of a file in a format of the library: `text` goes through the plugin's `parse` on an empty
 * in-memory project with the specialization, as the Catalog does, and each container that has component
 * markings becomes a `Screen` (size and boxes ÷ the density, ids that survive a re-read). Never throws.
 */
export async function formatScreens(
  library: Library,
  text: string,
  options: FormatScreenOptions,
): Promise<FormatScreenResult> {
  try {
    return await build(library, text, options);
  } catch (error) {
    return failed('plugin-failed', messageOf(error));
  }
}

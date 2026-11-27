import { dirname } from 'node:path';
import {
  ModelError,
  applySpecialization,
  getSpecialization,
  loadSpecComponents,
  measureComponentSize,
  removeSpecialization,
  type ComponentMeasure,
  type JsonValue,
  type Spec,
  type SpecAnnotationType,
} from '../src/model';
import { ToolError } from './errors';
import { storedRefValues } from './batch';
import { modelToolError } from './modelErrors';
import { findTypeEntry, openPackage, type ComponentArgs } from './componentTools';
import { resolveItem } from './items';
import { builtinFontBook, measurerFor, type FontBook } from './image/textMeasurer';
import { anyApproximate, recordingMeasurer } from './approximateText';
import { findProject, loadProject, type LoadedProject } from './projects';
import type { Roots } from './paths';
import {
  buildPreviewFonts,
  readPackageBytes,
  readProjectBytes,
  type FontReader,
} from './previewFonts';
import { packageByPath, type PackageSource } from './library';

// `measure_component` (FM3 of #2089): the size of a component for given field values, in units and
// in pixels, with no marking created and no batch planned. Read-only. It measures with
// `measureComponentSize`, the same function `fit_marking` and a new instance go through.

type Json = Record<string, unknown>;

export interface MeasureComponentToolArgs extends ComponentArgs {
  type: string;
  values?: Record<string, unknown> | undefined;
  container?: string | undefined;
  size?: { width?: number | undefined; height?: number | undefined } | undefined;
}

const EMPTY_SLOT_HINT =
  "this is the size with the slots empty: a new instance is born at the component's `size`; add the children and fit with Arrange or `fit_marking`";

const NOT_FOLLOWING_HINT =
  "the component's sizing does not follow the content: this is its size (`fit_marking` would give `not-fittable`)";

/** The container's id: a reference, a short code or the full id; `null` without `container` (the canvas). */
async function containerIdOf(
  roots: Roots,
  project: string,
  container: string | undefined,
): Promise<string | null> {
  if (container === undefined) return null;
  return (await resolveItem(roots, container, project, 'i')).id;
}

/** The `size` argument without the absent axes. */
function sizeOf(size: MeasureComponentToolArgs['size']): {
  width?: number;
  height?: number;
} {
  const { width, height } = size ?? {};
  return {
    ...(width === undefined ? {} : { width }),
    ...(height === undefined ? {} : { height }),
  };
}

interface Measured {
  readonly result: ComponentMeasure;
  /** Some text the fit measured fell to the embedded font in place of its family. */
  readonly approximate: boolean;
}

/** `measureComponentSize` over the loaded project; a model rule error becomes a tool error. */
function measured(
  loaded: LoadedProject,
  ids: { specId: string; typeId: string; containerId: string | null },
  args: MeasureComponentToolArgs,
  fonts: FontBook,
  type: SpecAnnotationType,
): Measured {
  const recorder = recordingMeasurer(measurerFor(fonts));
  try {
    const result = measureComponentSize(
      loaded.project,
      loaded.catalog,
      {
        ...ids,
        ...(args.values === undefined
          ? {}
          : {
              values: storedRefValues(
                loaded,
                type,
                args.values as Record<string, JsonValue>,
              ),
            }),
        size: sizeOf(args.size),
      },
      recorder.measure,
    );
    return { result, approximate: anyApproximate(fonts, recorder.families) };
  } catch (error) {
    throw error instanceof ModelError ? modelToolError(error) : error;
  }
}

/** The package-relative path of a project path under `prefix/`, or `null` outside it. */
const underPrefix = (path: string, prefix: string): string | null =>
  path.startsWith(`${prefix}/`) ? path.slice(prefix.length + 1) : null;

/**
 * The folder's components as the catalog reads them: `loadSpecComponents` is synchronous, so the files it asks
 * for are read between passes until it asks for no new one.
 */
async function folderComponents(
  source: PackageSource,
  file: string,
): Promise<ReturnType<typeof loadSpecComponents>> {
  const prefix = dirname(file);
  const texts = new Map<string, string>();
  const tried = new Set<string>();
  let result = loadSpecComponents(
    source.spec,
    file,
    source.spec.version,
    () => undefined,
  );
  for (let pass = 0; pass < 5; pass++) {
    const wanted = new Set<string>();
    result = loadSpecComponents(source.spec, file, source.spec.version, (path) => {
      if (!tried.has(path)) wanted.add(path);
      return texts.get(path);
    });
    if (wanted.size === 0) break;
    for (const path of wanted) {
      tried.add(path);
      const inside = underPrefix(path, prefix);
      const text = inside === null ? null : await source.read(inside);
      if (text !== null) texts.set(path, text);
    }
  }
  return result;
}

/** Fonts: the folder's own files for the folder's library, the project's copy for the others. */
function pathFontReader(
  roots: Roots,
  loaded: LoadedProject,
  source: PackageSource,
  prefix: string,
): FontReader {
  return async (path) => {
    const inside = underPrefix(path, prefix);
    if (inside !== null) return readPackageBytes(roots, source.dir, inside);
    return readProjectBytes(roots, loaded.location.dir, path);
  };
}

/** The project with the folder's library in place of the applied copy of the same id, and what measures it. */
async function workingCopy(
  roots: Roots,
  loaded: LoadedProject,
  source: PackageSource,
): Promise<{ loaded: LoadedProject; fonts: ReturnType<typeof builtinFontBook> }> {
  const { spec } = source;
  const base = getSpecialization(loaded.project, spec.id)
    ? removeSpecialization(loaded.project, spec.id, 'delete')
    : loaded.project;
  const project = applySpecialization(base, spec, { packageSpecName: source.specPath });
  const applied = getSpecialization(project, spec.id)!;
  const catalog = new Map(loaded.catalog);
  catalog.set(spec.id, await folderComponents(source, applied.file));
  const read = pathFontReader(roots, loaded, source, dirname(applied.file));
  const { book } = await buildPreviewFonts(project, read);
  return { loaded: { ...loaded, project, catalog }, fonts: book };
}

/** The response of `measure_component`. */
function describeMeasure(
  spec: Spec,
  type: SpecAnnotationType,
  result: ComponentMeasure,
  approximate: boolean,
): Json {
  const follows = result.follows.width || result.follows.height;
  return {
    type: { specId: spec.id, id: type.id, name: type.name },
    units: result.units,
    pixels: result.pixels,
    density: result.density,
    follows: result.follows,
    approximate,
    ...(result.messages.length === 0
      ? {}
      : { messages: result.messages.map((m) => m.text) }),
    ...(follows ? {} : { hint: NOT_FOLLOWING_HINT }),
    ...(result.emptySlot ? { hint: EMPTY_SLOT_HINT } : {}),
  };
}

function typeWithComponent(spec: Spec, typeRef: string): SpecAnnotationType {
  const { type } = findTypeEntry(spec, typeRef);
  if (type.component === undefined) {
    throw new ToolError(
      'invalid-arguments',
      `type ${spec.id}/${type.id} has no component: nothing to measure`,
    );
  }
  return type;
}

/** `path` + `project`: a working copy measured with its own components and fonts over the project; nothing is applied. */
async function measureByPath(
  roots: Roots,
  args: MeasureComponentToolArgs,
): Promise<Json> {
  if (args.project === undefined || args.specId !== undefined) {
    throw new ToolError(
      'invalid-arguments',
      'with `path`, provide `project` (the project to measure over) and no `specId`: the folder carries its own library',
    );
  }
  const source = await packageByPath(roots, args.path!);
  const type = typeWithComponent(source.spec, args.type);
  const location = await findProject(roots, args.project);
  const disk = await loadProject(roots, location);
  const { loaded, fonts } = await workingCopy(roots, disk, source);
  const containerId = await containerIdOf(roots, args.project, args.container);
  const ids = { specId: source.spec.id, typeId: type.id, containerId };
  const { result, approximate } = measured(loaded, ids, args, fonts, type);
  return describeMeasure(source.spec, type, result, approximate);
}

/** `measure_component`: the size of the type's component for the defaults plus `values`. */
export async function measureComponent(
  roots: Roots,
  args: MeasureComponentToolArgs,
): Promise<Json> {
  if (args.path !== undefined) return measureByPath(roots, args);
  if (args.project === undefined) {
    throw new ToolError(
      'invalid-arguments',
      'provide `project` + `specId` (the applied copy) or `project` + `path` (a package folder)',
    );
  }
  const { source, loaded } = await openPackage(roots, args);
  const type = typeWithComponent(source.spec, args.type);
  const containerId = await containerIdOf(roots, args.project, args.container);
  const fonts = loaded!.fonts ?? builtinFontBook();
  const ids = { specId: source.spec.id, typeId: type.id, containerId };
  const { result, approximate } = measured(loaded!, ids, args, fonts, type);
  return describeMeasure(source.spec, type, result, approximate);
}

import {
  ModelError,
  measureComponentSize,
  type ComponentMeasure,
  type JsonValue,
} from '../src/model';
import { ToolError } from './errors';
import { modelToolError } from './modelErrors';
import { findTypeEntry, openPackage, type ComponentArgs } from './componentTools';
import { resolveItem } from './items';
import { builtinFontBook, measurerFor, type FontBook } from './image/textMeasurer';
import type { LoadedProject } from './projects';
import type { Roots } from './paths';

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

/** `measureComponentSize` over the loaded project; a model rule error becomes a tool error. */
function measured(
  loaded: LoadedProject,
  ids: { specId: string; typeId: string; containerId: string | null },
  args: MeasureComponentToolArgs,
  fonts: FontBook,
): ComponentMeasure {
  try {
    return measureComponentSize(
      loaded.project,
      loaded.catalog,
      {
        ...ids,
        ...(args.values === undefined
          ? {}
          : { values: args.values as Record<string, JsonValue> }),
        size: sizeOf(args.size),
      },
      measurerFor(fonts),
    );
  } catch (error) {
    throw error instanceof ModelError ? modelToolError(error) : error;
  }
}

/** `measure_component`: the size of the type's component for the defaults plus `values`. */
export async function measureComponent(
  roots: Roots,
  args: MeasureComponentToolArgs,
): Promise<Json> {
  if (args.path !== undefined || args.project === undefined) {
    throw new ToolError(
      'invalid-arguments',
      "provide `project` + `specId` (the applied copy): the fonts are the project's",
    );
  }
  const { source, loaded } = await openPackage(roots, args);
  const { type } = findTypeEntry(source.spec, args.type);
  if (type.component === undefined) {
    throw new ToolError(
      'invalid-arguments',
      `type ${source.spec.id}/${type.id} has no component: nothing to measure`,
    );
  }
  const containerId = await containerIdOf(roots, args.project, args.container);
  const fonts = loaded!.fonts ?? builtinFontBook();
  const ids = { specId: source.spec.id, typeId: type.id, containerId };
  const result = measured(loaded!, ids, args, fonts);
  const follows = result.follows.width || result.follows.height;
  return {
    type: { specId: source.spec.id, id: type.id, name: type.name },
    units: result.units,
    pixels: result.pixels,
    density: result.density,
    follows: result.follows,
    approximate: !fonts.hasLibraryFonts,
    ...(result.messages.length === 0
      ? {}
      : { messages: result.messages.map((m) => m.text) }),
    ...(follows ? {} : { hint: NOT_FOLLOWING_HINT }),
  };
}

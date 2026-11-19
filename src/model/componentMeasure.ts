import type { Annotation, JsonValue } from './types';
import type { ModelMessage } from './modelMessage';
import { fail } from './errors';
import { findById } from './project';
import { findSpecType } from './specLookup';
import { defaultValues, setFieldValues } from './typed';
import { drawingValues } from './componentValues';
import { componentForDrawing, drawOptions } from './drawingMode';
import { effectiveDensity, unitsToPixels } from './density';
import type { ComponentCatalog } from './componentCatalog';
import type { TextMeasurer } from './components/instantiate';
import type { ComponentFile } from './components/componentFormat';
import { fitComponentSize, followedAxes, resolveSizing } from './components/sizing';

// `measure_component` (decision 9 of #2089): the size a component has for given field values, in
// component units and in image pixels, without a marking and without a batch. Pure: it builds a
// scratch typed annotation in a throwaway copy of the project and measures it the way `fitMarking`
// and the creation of an instance do.

const SCRATCH_ANNOTATION_ID = '__measure__';

export interface MeasureComponentArgs {
  readonly specId: string;
  readonly typeId: string;
  /** Field values over the type's defaults, as in `create_marking`'s `annotation.values`. */
  readonly values?: Readonly<Record<string, JsonValue>>;
  /** Container whose density and drawing options apply; `null` = the canvas's (density 1). */
  readonly containerId: string | null;
  /** The base for the axes that do not follow the content, in units (default: the component's `size`). */
  readonly size?: { readonly width?: number; readonly height?: number };
}

export interface ComponentMeasure {
  readonly units: { readonly width: number; readonly height: number };
  readonly pixels: { readonly width: number; readonly height: number };
  readonly density: number;
  /** The axes that follow the content (or an expression's px). */
  readonly follows: { readonly width: boolean; readonly height: boolean };
  readonly messages: readonly ModelMessage[];
}

/** The project with a scratch annotation of the type: its defaults plus `values`, which are checked. */
function scratchProject(
  p: Parameters<typeof findSpecType>[0],
  args: MeasureComponentArgs,
): { project: typeof p; annotation: Annotation } {
  const found =
    findSpecType(p, { specId: args.specId, typeId: args.typeId }) ??
    fail('unknown-type', `${args.specId}/${args.typeId}`);
  const annotation: Annotation = {
    id: SCRATCH_ANNOTATION_ID,
    markingId: SCRATCH_ANNOTATION_ID,
    layerId: found.layer.id,
    name: null,
    parentAnnotationId: null,
    parentRole: null,
    type: { specId: args.specId, typeId: args.typeId },
    values: defaultValues(found.type),
    entries: [],
  };
  const withScratch = { ...p, annotations: [...p.annotations, annotation] };
  const project =
    args.values === undefined
      ? withScratch
      : setFieldValues(withScratch, SCRATCH_ANNOTATION_ID, args.values);
  const scratch = project.annotations.find((a) => a.id === SCRATCH_ANNOTATION_ID);
  return { project, annotation: scratch ?? annotation };
}

/** The base of the axes that do not follow the content: the given `size` over the component's. */
function baseSize(
  component: ComponentFile,
  size: MeasureComponentArgs['size'],
): { width: number; height: number } {
  return {
    width: size?.width ?? component.size.width,
    height: size?.height ?? component.size.height,
  };
}

/**
 * The size of the component of `specId/typeId` for the type's defaults plus `values`: the units that
 * `fitComponentSize` gives (the same function `fit_marking` and a new instance use) and the pixels in
 * the container's density (`unitsToPixels`, the rounding of `fitMarking`). With no axis that follows the
 * content the units are the base (`size` or the component's `size`). `unknown-type` for a type with no
 * component, `unknown-field` / `invalid-value` from the values, `not-found` for the container.
 */
export function measureComponentSize(
  p: Parameters<typeof findSpecType>[0],
  catalog: ComponentCatalog,
  args: MeasureComponentArgs,
  measure: TextMeasurer,
): ComponentMeasure {
  const component =
    catalog.get(args.specId)?.byType.get(args.typeId) ??
    fail('unknown-type', `${args.specId}/${args.typeId}`);
  if (args.containerId !== null) findById(p.containers, args.containerId);
  const { project, annotation } = scratchProject(p, args);
  const type = findSpecType(project, { specId: args.specId, typeId: args.typeId })!.type;
  const { values, warnings } = drawingValues(project, annotation, type);
  const drawn = componentForDrawing(project, component, args.containerId);
  const base = baseSize(component, args.size);
  const fitted = fitComponentSize(
    drawn.component,
    values,
    { measure, ...drawOptions({ ...drawn, anchor: undefined }) },
    { base },
  );
  const units =
    fitted === undefined ? base : { width: fitted.width, height: fitted.height };
  const density = effectiveDensity(project, args.containerId);
  return {
    units,
    pixels: {
      width: unitsToPixels(units.width, density),
      height: unitsToPixels(units.height, density),
    },
    density,
    follows: followedAxes(resolveSizing(component, values)),
    messages: [...warnings, ...(fitted?.messages ?? [])],
  };
}

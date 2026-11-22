import type { Annotation, JsonValue } from './types';
import type { ModelMessage } from './modelMessage';
import { fail } from './errors';
import { findById } from './project';
import { findSpecType } from './specLookup';
import { addTableRow, defaultValues, setFieldValues, setTableCells } from './typed';
import { fieldOf } from './specLookup';
import { isRecord } from './isRecord';
import { drawingValues } from './componentValues';
import { componentForDrawing, drawOptions } from './drawingMode';
import { effectiveDensity, unitsToPixels } from './density';
import { hasSlotComponent, type ComponentCatalog } from './componentCatalog';
import type { TextMeasurer } from './components/instantiate';
import type { ComponentFile } from './components/componentFormat';
import {
  fitComponentSize,
  followedAxes,
  resolveSizing,
  sizingFollowsContent,
} from './components/sizing';

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
  /**
   * The component has a slot and an axis that follows the content: the size is the one with the slots empty (the
   * empty slot measures its `fallback`), while a new instance is born at the component's `size` (stage #2267,
   * decision 6).
   */
  readonly emptySlot: boolean;
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
      : applyValues(withScratch, found.type, args.values);
  const scratch = project.annotations.find((a) => a.id === SCRATCH_ANNOTATION_ID);
  return { project, annotation: scratch ?? annotation };
}

/**
 * The scratch annotation's values: a `table` field takes its rows (a list of objects, `null` = none) through
 * the row operations, as `create_marking` does; the other fields go through `setFieldValues`.
 */
function applyValues(
  p: Parameters<typeof findSpecType>[0],
  type: NonNullable<ReturnType<typeof findSpecType>>['type'],
  values: Readonly<Record<string, JsonValue>>,
): typeof p {
  const simple: Record<string, JsonValue> = {};
  const tables: [string, JsonValue][] = [];
  for (const [key, value] of Object.entries(values)) {
    if (fieldOf(type, key)?.type === 'table') tables.push([key, value]);
    else simple[key] = value;
  }
  let next = setFieldValues(p, SCRATCH_ANNOTATION_ID, simple);
  for (const [key, rows] of tables) next = withRows(next, key, rows);
  return next;
}

/** The table `key` with exactly `rows` (the defaults of a column stay where a cell is absent). */
function withRows(p: Parameters<typeof findSpecType>[0], key: string, rows: JsonValue) {
  if (rows !== null && !Array.isArray(rows)) fail('invalid-value', key);
  let next = p;
  (rows ?? []).forEach((row, i) => {
    if (!isRecord(row)) fail('invalid-value', `${key}[${i}]`);
    const rowId = `__row${i}__`;
    const cells = Object.fromEntries(
      Object.entries(row).filter(([column]) => column !== '_id' && column !== '_as'),
    );
    next = addTableRow(next, SCRATCH_ANNOTATION_ID, key, rowId);
    next = setTableCells(next, SCRATCH_ANNOTATION_ID, key, rowId, cells);
  });
  return next;
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
  const reserved = { direction: drawn.direction, container: drawn.container };
  const sizing = resolveSizing(component, values, drawn.tokens, reserved);
  return {
    units,
    pixels: {
      width: unitsToPixels(units.width, density),
      height: unitsToPixels(units.height, density),
    },
    density,
    follows: followedAxes(sizing),
    messages: [...warnings, ...(fitted?.messages ?? [])],
    emptySlot:
      hasSlotComponent(component) && sizingFollowsContent(component, values, reserved),
  };
}

import { anchorValues, containerValues } from './componentValues';
import {
  readContainer,
  readsContainer,
  type InstanceContainer,
} from './components/container';
import { componentAnchorDefaults, type InstanceAnchor } from './components/anchor';
import type { AnchorSide, ComponentFile } from './components/componentFormat';
import {
  applyTokens,
  tokenAxes,
  type ResolvedTokens,
  type SpecTokens,
} from './components/tokens';
import { effectiveDensity } from './density';
import { effectiveDirection } from './direction';
import { fail } from './errors';
import { updateById } from './project';
import { projectIndex } from './projectIndex';
import { DRAWING_NAME_PATTERN } from './schema';
import type { DrawingModeMap, Marking, Project, ReadingDirection, Rect } from './types';

// Drawing mode (schema v18; a map axis → entry from schema v24, stage #1900): picks the entry of each axis of
// the specializations' `tokens` (`mode: dark`, or `theme: dark` and `contrast: high`). It belongs to the
// project; the container can pin some axes and follows the project in the others. It does not depend on the
// interface's light/dark theme. Pure functions, no DOM.

/** The drawing mode as stored: axis → entry. */
export type DrawingModeSelection = DrawingModeMap;

/** Same axes and entries (key order is not part of the mode). */
export function sameDrawingMode(
  a: DrawingModeSelection | null | undefined,
  b: DrawingModeSelection | null | undefined,
): boolean {
  if (a === b) return true;
  const left = Object.entries(a ?? {});
  if (left.length !== Object.keys(b ?? {}).length) return false;
  return left.every(([axis, entry]) => b?.[axis] === entry);
}

/** The mode as text: `theme: dark, contrast: high` (the axes in the order stored). */
export function drawingModeText(selection: DrawingModeSelection): string {
  return Object.entries(selection)
    .map(([axis, entry]) => `${axis}: ${entry}`)
    .join(', ');
}

/** A checked copy of a selection: every axis and entry name matches the pattern; an empty map is `null`. */
function checkedSelection(
  selection: DrawingModeSelection | null,
): DrawingModeSelection | null {
  if (selection === null || Object.keys(selection).length === 0) return null;
  for (const [axis, entry] of Object.entries(selection)) {
    if (!DRAWING_NAME_PATTERN.test(axis) || !DRAWING_NAME_PATTERN.test(entry)) {
      return fail('invalid-name');
    }
  }
  return { ...selection };
}

/** Replaces the project's whole map; `null` (or an empty map) removes it (back to the default of each axis). */
export function setProjectDrawingMode(
  p: Project,
  selection: DrawingModeSelection | null,
): Project {
  const next = checkedSelection(selection);
  if (sameDrawingMode(p.drawingMode, next)) return p;
  if (next === null) {
    return Object.fromEntries(
      Object.entries(p).filter(([key]) => key !== 'drawingMode'),
    ) as unknown as Project;
  }
  return { ...p, drawingMode: next };
}

/** Replaces the whole map the container pins; `null` (or an empty map) goes back to following the project. */
export function setContainerDrawingMode(
  p: Project,
  containerId: string,
  selection: DrawingModeSelection | null,
): Project {
  const container = p.containers.find((c) => c.id === containerId);
  if (container === undefined) return fail('not-found', containerId);
  const next = checkedSelection(selection);
  if (sameDrawingMode(container.drawingMode, next)) return p;
  return {
    ...p,
    containers: updateById(p.containers, containerId, (c) => ({
      ...c,
      drawingMode: next,
    })),
  };
}

/** `selection` with `axis` set to `entry`, or removed when `entry` is `null`; `null` when no axis is left. */
function withAxis(
  selection: DrawingModeSelection | null | undefined,
  axis: string,
  entry: string | null,
): DrawingModeSelection | null {
  const rest = Object.fromEntries(
    Object.entries(selection ?? {}).filter(([a]) => a !== axis),
  );
  if (entry === null) return rest;
  // The axis keeps its place when it is already there.
  return axis in (selection ?? {})
    ? { ...selection, [axis]: entry }
    : { ...rest, [axis]: entry };
}

/** Changes one axis of the project's mode; `null` removes that axis (the last one removes the map). */
export function setProjectDrawingAxis(
  p: Project,
  axis: string,
  entry: string | null,
): Project {
  return setProjectDrawingMode(p, withAxis(p.drawingMode, axis, entry));
}

/** Changes one axis the container pins; `null` removes that axis (the last one goes back to following the project). */
export function setContainerDrawingAxis(
  p: Project,
  containerId: string,
  axis: string,
  entry: string | null,
): Project {
  const container = p.containers.find((c) => c.id === containerId);
  if (container === undefined) return fail('not-found', containerId);
  return setContainerDrawingMode(
    p,
    containerId,
    withAxis(container.drawingMode, axis, entry),
  );
}

/**
 * Effective mode of a space: the axes the container pins over the project's, so each axis is the
 * container's, else the project's, else absent (the first entry of the axis, applied by the token
 * table). `undefined` when nothing is pinned. A null `containerId` = the canvas (follows the project).
 * The project's own object is returned when the container adds nothing.
 */
export function effectiveDrawingMode(
  p: Project,
  containerId: string | null,
): DrawingModeSelection | undefined {
  const fixed =
    containerId === null
      ? undefined
      : projectIndex(p).containers.get(containerId)?.drawingMode;
  if (fixed == null || Object.keys(fixed).length === 0) return p.drawingMode;
  if (p.drawingMode === undefined) return fixed;
  return { ...p.drawingMode, ...fixed };
}

/**
 * The axes the specializations' tokens declare (`axes`, or `modes` as the axis `mode`), merged by axis name
 * across specializations, the entries of each in the order they appear and without repeats.
 */
export function drawingAxesOf(
  tokens: ReadonlyArray<SpecTokens | undefined>,
): ReadonlyMap<string, readonly string[]> {
  const out = new Map<string, string[]>();
  for (const entry of tokens) {
    for (const [axis, entries] of tokenAxes(entry)) {
      const merged = out.get(axis) ?? [];
      for (const name of entries) if (!merged.includes(name)) merged.push(name);
      out.set(axis, merged);
    }
  }
  return out;
}

/** A stored axis or entry that no specialization declares. */
export interface UndeclaredDrawingMode {
  readonly axis: string;
  readonly entry: string;
}

/**
 * The (axis, entry) pairs stored on the project and the containers that no specialization declares: an axis
 * that none has, or an entry its axis lacks. Without repeats, in order of appearance.
 */
export function undeclaredDrawingMode(
  p: Project,
  declared: ReadonlyMap<string, readonly string[]>,
): UndeclaredDrawingMode[] {
  const out: UndeclaredDrawingMode[] = [];
  for (const mode of [p.drawingMode, ...p.containers.map((c) => c.drawingMode)]) {
    for (const [axis, entry] of Object.entries(mode ?? {})) {
      const known = declared.get(axis)?.includes(entry) === true;
      if (!known && !out.some((u) => u.axis === axis && u.entry === entry)) {
        out.push({ axis, entry });
      }
    }
  }
  return out;
}

/**
 * The part of the container the component reads (`readContainer`), without building the container's
 * context at all for a component that reads none (the common case: nothing is paid for).
 */
export function readContainerOf(
  p: Project,
  component: ComponentFile,
  containerId: string | null,
): InstanceContainer | undefined {
  return readsContainer(component)
    ? readContainer(component, containerValues(p, containerId))
    : undefined;
}

/**
 * The component as the drawing uses it: with each `$token` replaced by the table of the space's
 * effective mode (`tokenTables.get(mode)`, the mode being a map axis → entry; with no mode or no
 * tables, the one in `resolvedTokens`). Arranging, positioning and measuring go through here before reading the slot,
 * so that a `gap` and `padding` in `$token` are worth the same as on screen. `tokens` goes in the
 * `tokens` option of `instantiate`; `direction` is the space's effective reading direction
 * (`effectiveDirection`), which goes in the engine's `direction` option (`drawOptions`).
 */
export function componentForDrawing(
  p: Project,
  component: ComponentFile,
  containerId: string | null,
): {
  readonly component: ComponentFile;
  readonly tokens: ResolvedTokens | undefined;
  readonly direction: ReadingDirection;
  readonly container: InstanceContainer | undefined;
} {
  const mode = effectiveDrawingMode(p, containerId);
  const tokens =
    (mode === undefined ? undefined : component.tokenTables?.get(mode)) ??
    component.resolvedTokens;
  return {
    component: tokens === undefined ? component : applyTokens(component, tokens),
    tokens,
    direction: effectiveDirection(p, containerId),
    // Only a component that reads `$container.*` pays for the container's size and classes.
    container: readContainerOf(p, component, containerId),
  };
}

/**
 * The `$anchor.*` of an instance (`anchorValues` with the component's defaults at the space's
 * density): the one builder the drawing (`componentDrawings`) and the measurements
 * (`measuringAnchor`) share, so the measured size is the drawn one.
 */
export function instanceAnchorOf(input: {
  /** The marking's `rect` (pixels of its own space). */
  readonly rect: Rect;
  /** The `rect` of the anchor marking, in the same space. */
  readonly anchorRect: Rect;
  /** The `side` declared on `marking.anchor`, if any. */
  readonly side: AnchorSide | undefined;
  readonly component: ComponentFile;
  /** The density of the marking's space (`effectiveDensity`). */
  readonly density: number;
}): InstanceAnchor {
  return anchorValues({
    rect: input.rect,
    anchorRect: input.anchorRect,
    side: input.side,
    defaults: componentAnchorDefaults(input.component, input.density),
    density: input.density,
  });
}

/**
 * The anchor of an existing marking in the form the instance reads (`$anchor.*`), for the
 * MEASUREMENTS (`fitMarking`, the arranging): the same one the drawing receives
 * (`componentDrawings`), with the marking's current `rect`, the stored side or, without it, the
 * component's default. `undefined` without an anchor or without the target. Without this,
 * `$anchor.*` stays null and a `sizing` that depends on the side measures in another branch.
 */
export function measuringAnchor(
  p: Project,
  marking: Marking,
  component: ComponentFile,
): InstanceAnchor | undefined {
  const { anchor } = marking;
  if (anchor == null) return undefined;
  const target = projectIndex(p).markings.get(anchor.to);
  if (target === undefined) return undefined;
  return instanceAnchorOf({
    rect: marking.rect,
    anchorRect: target.rect,
    side: anchor.side,
    component,
    density: effectiveDensity(p, marking.containerId),
  });
}

/**
 * The engine options that come from the space (`tokens`, `direction`, on an anchored marking
 * `anchor` and, for a component that reads it, `container`): it only carries the key when there is something to pass (defined `tokens`, `rtl`
 * direction, anchor), so in `ltr` and without an anchor the options are the same as before.
 */
export function drawOptions(drawn: {
  readonly tokens: ResolvedTokens | undefined;
  readonly direction: ReadingDirection;
  readonly anchor?: InstanceAnchor | undefined;
  readonly container?: InstanceContainer | undefined;
}): {
  tokens?: ResolvedTokens;
  direction?: 'rtl';
  anchor?: InstanceAnchor;
  container?: InstanceContainer;
} {
  return {
    ...(drawn.tokens === undefined ? {} : { tokens: drawn.tokens }),
    ...(drawn.direction === 'rtl' ? { direction: 'rtl' as const } : {}),
    ...(drawn.anchor === undefined ? {} : { anchor: drawn.anchor }),
    ...(drawn.container === undefined ? {} : { container: drawn.container }),
  };
}

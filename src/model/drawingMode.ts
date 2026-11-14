import { anchorValues } from './componentValues';
import { componentAnchorDefaults, type InstanceAnchor } from './components/anchor';
import type { ComponentFile } from './components/componentFormat';
import { applyTokens, type ResolvedTokens } from './components/tokens';
import { effectiveDensity } from './density';
import { effectiveDirection } from './direction';
import { fail } from './errors';
import { updateById } from './project';
import { projectIndex } from './projectIndex';
import type { Marking, Project, ReadingDirection } from './types';

// Drawing mode (schema v18, "faithful components" stage): picks the mode of the specializations'
// `tokens` (`light`, `dark`…). It belongs to the project; the container can pin its own. It does
// not depend on the interface's light/dark theme. Pure functions, no DOM.

/** Pattern of a mode name (the same as `tokens.modes` in the specialization). */
const MODE_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

function checkMode(mode: string): string {
  if (!MODE_PATTERN.test(mode)) fail('invalid-name');
  return mode;
}

/** Changes the project's mode; `null` removes it (back to the first mode of each specialization). */
export function setProjectDrawingMode(p: Project, mode: string | null): Project {
  if (mode === null) {
    if (p.drawingMode === undefined) return p;
    return Object.fromEntries(
      Object.entries(p).filter(([key]) => key !== 'drawingMode'),
    ) as unknown as Project;
  }
  checkMode(mode);
  return p.drawingMode === mode ? p : { ...p, drawingMode: mode };
}

/** Pins the container's mode; `null` goes back to following the project's. */
export function setContainerDrawingMode(
  p: Project,
  containerId: string,
  mode: string | null,
): Project {
  const container = p.containers.find((c) => c.id === containerId);
  if (container === undefined) return fail('not-found', containerId);
  const next = mode === null ? null : checkMode(mode);
  if ((container.drawingMode ?? null) === next) return p;
  return {
    ...p,
    containers: updateById(p.containers, containerId, (c) => ({
      ...c,
      drawingMode: next,
    })),
  };
}

/**
 * Effective mode of a space: the one the container pins, otherwise the project's, otherwise
 * `undefined` (the first mode of each specialization). A null `containerId` = the canvas (follows
 * the project).
 */
export function effectiveDrawingMode(
  p: Project,
  containerId: string | null,
): string | undefined {
  if (containerId !== null) {
    const fixed = projectIndex(p).containers.get(containerId)?.drawingMode;
    if (fixed != null) return fixed;
  }
  return p.drawingMode;
}

/** The union of the specializations' `modes` (in the order they appear, without repeats). */
export function drawingModesOf(
  tokens: ReadonlyArray<{ readonly modes: readonly string[] } | undefined>,
): string[] {
  const out: string[] = [];
  for (const entry of tokens) {
    for (const mode of entry?.modes ?? []) if (!out.includes(mode)) out.push(mode);
  }
  return out;
}

/** Stored modes (of the project and the containers) that no specialization declares. */
export function undeclaredDrawingMode(p: Project, declared: readonly string[]): string[] {
  const stored = [p.drawingMode, ...p.containers.map((c) => c.drawingMode)];
  const out: string[] = [];
  for (const mode of stored) {
    if (mode != null && !declared.includes(mode) && !out.includes(mode)) out.push(mode);
  }
  return out;
}

/**
 * The component as the drawing uses it: with each `$token` replaced by the table of the space's
 * effective mode (`resolvedTokensByMode[mode]`; with no mode or no such table, the one in
 * `resolvedTokens`). Arranging, positioning and measuring go through here before reading the slot,
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
} {
  const mode = effectiveDrawingMode(p, containerId);
  const tokens =
    (mode === undefined ? undefined : component.resolvedTokensByMode?.[mode]) ??
    component.resolvedTokens;
  return {
    component: tokens === undefined ? component : applyTokens(component, tokens),
    tokens,
    direction: effectiveDirection(p, containerId),
  };
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
  const density = effectiveDensity(p, marking.containerId);
  return anchorValues({
    rect: marking.rect,
    anchorRect: target.rect,
    side: anchor.side,
    defaults: componentAnchorDefaults(component, density),
    density,
  });
}

/**
 * The engine options that come from the space (`tokens`, `direction` and, on an anchored marking,
 * `anchor`): it only carries the key when there is something to pass (defined `tokens`, `rtl`
 * direction, anchor), so in `ltr` and without an anchor the options are the same as before.
 */
export function drawOptions(drawn: {
  readonly tokens: ResolvedTokens | undefined;
  readonly direction: ReadingDirection;
  readonly anchor?: InstanceAnchor | undefined;
}): { tokens?: ResolvedTokens; direction?: 'rtl'; anchor?: InstanceAnchor } {
  return {
    ...(drawn.tokens === undefined ? {} : { tokens: drawn.tokens }),
    ...(drawn.direction === 'rtl' ? { direction: 'rtl' as const } : {}),
    ...(drawn.anchor === undefined ? {} : { anchor: drawn.anchor }),
  };
}

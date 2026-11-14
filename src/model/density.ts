import { fail } from './errors';
import { updateById } from './project';
import { projectIndex } from './projectIndex';
import type { Spec, SpecContainer } from './spec';
import type { Project, ProjectContainer, Rect } from './types';

// Container density (schema v19): how many image pixels one component unit is worth
// (dp, pt, logical px at 1x). The component's numbers are units; the markings stay in image
// pixels. Pure functions, no DOM.

export const MIN_DENSITY = 0.5;
export const MAX_DENSITY = 8;

/** A finite number from `MIN_DENSITY` to `MAX_DENSITY`. */
export function isValidDensity(value: number): boolean {
  return Number.isFinite(value) && value >= MIN_DENSITY && value <= MAX_DENSITY;
}

/**
 * Density of a space: the container's (1 if absent) or 1 on the canvas (null `containerId`, the
 * floating ones) and for an unknown id.
 */
export function effectiveDensity(
  p: Pick<Project, 'containers'>,
  containerId: string | null,
): number {
  if (containerId === null) return 1;
  return projectIndex(p as Project).containers.get(containerId)?.density ?? 1;
}

/** The container without the `density` key (goes back to 1). */
export function withoutDensity(container: ProjectContainer): ProjectContainer {
  const { density, ...rest } = container;
  void density;
  return rest;
}

/**
 * Sets the container's density; `null` and 1 go back to 1 (removes the key). Outside 0.5 to 8 it
 * fails with `container-density`. It does not touch the pixels: only the components' drawing, the
 * `minSize` and the fitting start to multiply.
 */
export function setContainerDensity(
  p: Project,
  containerId: string,
  density: number | null,
): Project {
  const container = projectIndex(p).containers.get(containerId);
  if (container === undefined) return fail('not-found', containerId);
  if (density !== null && !isValidDensity(density)) {
    return fail('container-density', String(density), { density });
  }
  const next = density === 1 ? null : density;
  if ((container.density ?? null) === next) return p;
  return {
    ...p,
    containers: updateById(p.containers, containerId, (c) =>
      next === null ? withoutDensity(c) : { ...c, density: next },
    ),
  };
}

/**
 * The space in which a component is instantiated in a marking: the box **in units** (`box`), the
 * density and the conversion of a scene box (in units, relative to the marking) to image pixels.
 * With density 1 the scene is already in pixels, in the marking's own box (`box = rect`), and
 * nothing is converted; with another, the box is `{ 0, 0, width ÷ d, height ÷ d }` and the scene
 * root carries `translate(rect.x, rect.y) · scale(d)`.
 */
export interface UnitSpace {
  readonly density: number;
  readonly box: Rect;
  readonly toPixels: (box: Rect) => Rect;
}

export function unitSpaceOf(rect: Rect, density: number): UnitSpace {
  if (density === 1) return { density, box: rect, toPixels: (box) => box };
  return {
    density,
    box: { x: 0, y: 0, width: rect.width / density, height: rect.height / density },
    toPixels: (b) => ({
      x: rect.x + b.x * density,
      y: rect.y + b.y * density,
      width: b.width * density,
      height: b.height * density,
    }),
  };
}

/** Component units → image pixels, rounding up (the `minSize` and the initial size). */
export function unitsToPixels(units: number, density: number): number {
  return density === 1 ? units : Math.ceil(units * density - 1e-9);
}

/** A rectangle in image pixels → in component units (÷ density). */
export function rectToUnits(rect: Rect, density: number): Rect {
  if (density === 1) return rect;
  return {
    x: rect.x / density,
    y: rect.y / density,
    width: rect.width / density,
    height: rect.height / density,
  };
}

/** How much two numbers in units may differ and still count as the same (floating-point residue). */
const UNIT_EPS = 1e-6;

/**
 * A rectangle in units → in whole image pixels (× density): the four edges are rounded and the
 * size comes from the difference (minimum 1). `original` is the rectangle in pixels that `unit`
 * came from: if `unit` is still the same (no difference beyond floating-point residue), the exact
 * `original` comes back.
 */
export function rectFromUnits(unit: Rect, original: Rect, density: number): Rect {
  if (density === 1) return unit;
  const back = rectToUnits(original, density);
  const same =
    Math.abs(unit.x - back.x) < UNIT_EPS &&
    Math.abs(unit.y - back.y) < UNIT_EPS &&
    Math.abs(unit.width - back.width) < UNIT_EPS &&
    Math.abs(unit.height - back.height) < UNIT_EPS;
  if (same) return original;
  // The edges are rounded (left/top and right/bottom) and the size comes from the difference: a
  // child inside the slot in units never goes past the slot's edge in pixels.
  const left = Math.round(unit.x * density);
  const top = Math.round(unit.y * density);
  const right = Math.round((unit.x + unit.width) * density);
  const bottom = Math.round((unit.y + unit.height) * density);
  return {
    x: left,
    y: top,
    width: Math.max(1, right - left),
    height: Math.max(1, bottom - top),
  };
}

/** The factors the app suggests (the field's ready-made list also includes 1). */
export const SUGGESTED_DENSITIES = [1.5, 2, 3, 4] as const;

/** The compared factors: 1x is included so the suggestion does not push 3x on whoever already matches 1x. */
const COMPARED_DENSITIES = [1, ...SUGGESTED_DENSITIES] as const;

/** How many pixels the container's width may differ from `factor × preset width`. */
const SUGGEST_TOLERANCE = 2;

/** What the app suggests: the factor and the preset size (from an applied specialization) that explains it. */
export interface DensitySuggestion {
  readonly density: number;
  readonly specId: string;
  readonly preset: SpecContainer;
}

/** The list factor whose width (`factor × presetWidth`) comes closest to `width`, within the tolerance. */
function closestFactor(width: number, presetWidth: number): number | undefined {
  let best: number | undefined;
  let bestGap = SUGGEST_TOLERANCE + 1;
  for (const factor of COMPARED_DENSITIES) {
    const gap = Math.abs(width - factor * presetWidth);
    if (gap <= SUGGEST_TOLERANCE && gap < bestGap) {
      best = factor;
      bestGap = gap;
    }
  }
  return best;
}

/**
 * Density suggestion for a container from the preset sizes (`containers[]`) of the applied
 * specializations: the container's width ÷ the preset's is 1.5, 2, 3 or 4 (2 px tolerance for
 * rounding; with two factors within the tolerance, the closest wins). The height only breaks ties
 * (a capture often crops bars): among the candidates the one whose height is closest to
 * `factor × preset height` wins and, on a tie, the first in the order of the specializations. It
 * only suggests; the person or the agent decides.
 */
export function suggestDensity(
  container: { readonly width: number; readonly height: number },
  specs: readonly { readonly id: string; readonly spec: Spec | null }[],
): DensitySuggestion | null {
  let best: DensitySuggestion | null = null;
  let bestGap = Infinity;
  for (const { id, spec } of specs) {
    for (const preset of spec?.containers ?? []) {
      const density = closestFactor(container.width, preset.width);
      if (density === undefined) continue;
      const gap = Math.abs(container.height - density * preset.height);
      if (gap < bestGap) {
        best = { density, specId: id, preset };
        bestGap = gap;
      }
    }
  }
  // The best being 1x means the container is already at the preset size: nothing to suggest.
  return best?.density === 1 ? null : best;
}

/**
 * The suggestion for each project container that has one (the others do not appear). With no preset
 * size in any applied specialization, it does not even walk the containers.

 */
export function suggestDensities(
  p: Pick<Project, 'containers' | 'specializations'>,
): Map<string, DensitySuggestion> {
  const found = new Map<string, DensitySuggestion>();
  if (!p.specializations.some((s) => (s.spec?.containers?.length ?? 0) > 0)) return found;
  for (const container of p.containers) {
    const suggestion = suggestDensity(container, p.specializations);
    if (suggestion !== null) found.set(container.id, suggestion);
  }
  return found;
}

import { fail } from './errors';
import { updateById } from './project';
import { projectIndex } from './projectIndex';
import type { Project, ReadingDirection } from './types';

// Reading direction of the project and of the container (schema v20, stage "direction and anchor"):
// `ltr` or `rtl`. It belongs to the project (absent = `ltr`); the container may pin its own. The
// components engine (`components/direction.ts`) receives the effective one and mirrors rows, grids,
// `start`/`end` and `mirror`. Pure functions, no DOM.

/** Changes the project direction; `null` removes it (back to `ltr`). */
export function setProjectDirection(
  p: Project,
  direction: ReadingDirection | null,
): Project {
  if (direction === null) {
    if (p.direction === undefined) return p;
    return Object.fromEntries(
      Object.entries(p).filter(([key]) => key !== 'direction'),
    ) as unknown as Project;
  }
  return p.direction === direction ? p : { ...p, direction };
}

/** Pins the container direction; `null` goes back to following the project's. */
export function setContainerDirection(
  p: Project,
  containerId: string,
  direction: ReadingDirection | null,
): Project {
  const container = projectIndex(p).containers.get(containerId);
  if (container === undefined) return fail('not-found', containerId);
  if ((container.direction ?? null) === direction) return p;
  return {
    ...p,
    containers: updateById(p.containers, containerId, (c) => ({ ...c, direction })),
  };
}

/**
 * Effective direction of a space: the one the container pins, else the project's, else `ltr`.
 * A null `containerId` (the canvas and the floating ones) and an unknown id follow the project.
 */
export function effectiveDirection(
  p: Project,
  containerId: string | null,
): ReadingDirection {
  if (containerId !== null) {
    const fixed = projectIndex(p).containers.get(containerId)?.direction;
    if (fixed != null) return fixed;
  }
  return p.direction ?? 'ltr';
}

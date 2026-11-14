import { memoByProject } from './projectIndex';
import { findSpecType } from './specLookup';
import type { Project } from './types';

// Structural type (stage #747, CF8; `structural: true` in the specialization, `formatVersion`
// 15): the type groups and does not draw. Its marking does not show the header with the name
// and, like the ones that have a drawing, only shows the outline on hover or when selected.

const NONE: ReadonlySet<string> = new Set();

/**
 * Markings with some typed annotation of their own whose type is structural. Memoized by
 * project version (the immutable object).
 */
export const structuralMarkingIds: (p: Project) => ReadonlySet<string> = memoByProject(
  (p) => {
    const ids = new Set<string>();
    for (const annotation of p.annotations) {
      if (annotation.type === null || annotation.values === null) continue;
      if (findSpecType(p, annotation.type)?.type.structural === true) {
        ids.add(annotation.markingId);
      }
    }
    return ids.size === 0 ? NONE : ids;
  },
);

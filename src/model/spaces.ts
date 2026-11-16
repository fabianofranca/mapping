import type { Marking } from './types';

/**
 * Do the two markings live in the same space (v21)? A container is a space of its own; the canvas
 * is one space **per page**: two canvas markings on different pages are in different spaces.
 */
export function sameSpace(
  a: Pick<Marking, 'containerId' | 'pageId'>,
  b: Pick<Marking, 'containerId' | 'pageId'>,
): boolean {
  if (a.containerId !== b.containerId) return false;
  return a.containerId !== null || a.pageId === b.pageId;
}

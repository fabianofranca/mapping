// Anchor sides and alignments (v20; the corner alignments are v22). Leaf file, no imports: the component format and the project
// types share it without the viewer declarations reaching the schema (zod).

/** Side of the target where the anchored marking sits; `start`/`end` follow the reading direction. */
export const ANCHOR_SIDES = ['top', 'bottom', 'start', 'end'] as const;
export type AnchorSide = (typeof ANCHOR_SIDES)[number];
/**
 * Alignment along the anchor's side: `start`, `center` and `end` position the marking's edge along the
 * side; `corner-start` and `corner-end` (schema v22) put its CENTER on the anchor's corner, so it stays
 * there while the marking grows (a Badge on a bare icon).
 */
export const ANCHOR_ALIGNS = [
  'start',
  'center',
  'end',
  'corner-start',
  'corner-end',
] as const;
export type AnchorAlign = (typeof ANCHOR_ALIGNS)[number];

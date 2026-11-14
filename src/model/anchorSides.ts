// Anchor sides and alignments (v20). Leaf file, no imports: the component format and the project
// types share it without the viewer declarations reaching the schema (zod).

/** Side of the target where the anchored marking sits; `start`/`end` follow the reading direction. */
export const ANCHOR_SIDES = ['top', 'bottom', 'start', 'end'] as const;
export type AnchorSide = (typeof ANCHOR_SIDES)[number];
/** Alignment along the anchor's side. */

export const ANCHOR_ALIGNS = ['start', 'center', 'end'] as const;
export type AnchorAlign = (typeof ANCHOR_ALIGNS)[number];

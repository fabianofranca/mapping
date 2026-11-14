// Strokes of the thread state glyphs on the 16px grid, shared by the interface icons
// (`ui/icons.tsx`: badges of the Comments window and the Threads section) and by the pin drawn on the canvas
// (`canvas/renderers/commentPins.ts`). Stroke only, no fill (like the lock in `lockGlyph.ts`).

/** The state the glyph marks; the same names as `PinColor` (the pin's most urgent state). */
export type ThreadStateKey = 'awaitingHuman' | 'awaitingAgent' | 'resolved';

/** Resolved: the check mark (the same stroke as the `check` icon). */
export const CHECK_PATHS: readonly string[] = ['m3 8.5 3.2 3.2L13 4.8'];

/** Waiting on you: the silhouette of a person (head and shoulders). */
export const AWAITING_HUMAN_PATHS: readonly string[] = [
  'M10.25 5.25a2.25 2.25 0 1 0-4.5 0a2.25 2.25 0 1 0 4.5 0Z',
  'M3.5 13.5c0-2.6 2-4.2 4.5-4.2s4.5 1.6 4.5 4.2',
];

/** Waiting on the agent: the four-pointed spark. */
export const AWAITING_AGENT_PATHS: readonly string[] = [
  'M8 2c.5 3.3 2.7 5.5 6 6-3.3.5-5.5 2.7-6 6-.5-3.3-2.7-5.5-6-6 3.3-.5 5.5-2.7 6-6Z',
];

/** The strokes of each state. */
export const THREAD_STATE_GLYPHS: Readonly<Record<ThreadStateKey, readonly string[]>> = {
  awaitingHuman: AWAITING_HUMAN_PATHS,
  awaitingAgent: AWAITING_AGENT_PATHS,
  resolved: CHECK_PATHS,
};

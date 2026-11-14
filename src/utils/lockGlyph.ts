// Strokes of the padlock on the 16px grid, shared by the interface icon
// (`ui/icons.tsx`) and the badge drawn on the canvas (`canvas/renderers/overlay.ts`).

/** Closed padlock: body and shackle. */
export const LOCK_PATHS: readonly string[] = [
  'M4.5 7.5h7a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1Z',
  'M5.5 7.5v-2a2.5 2.5 0 0 1 5 0v2',
];

/** Open padlock: the shackle lifts off one side. */
export const UNLOCK_PATHS: readonly string[] = [
  LOCK_PATHS[0] as string,
  'M5.5 7.5v-2a2.5 2.5 0 0 1 4.8-1',
];

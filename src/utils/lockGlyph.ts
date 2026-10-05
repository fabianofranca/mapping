// Traços do cadeado na grade de 16px, compartilhados pelo ícone da interface
// (`ui/icons.tsx`) e pelo emblema desenhado no canvas (`canvas/renderers/overlay.ts`).

/** Cadeado fechado: corpo e arco. */
export const LOCK_PATHS: readonly string[] = [
  'M4.5 7.5h7a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1Z',
  'M5.5 7.5v-2a2.5 2.5 0 0 1 5 0v2',
];

/** Cadeado aberto: o arco sai de um lado. */
export const UNLOCK_PATHS: readonly string[] = [
  LOCK_PATHS[0] as string,
  'M5.5 7.5v-2a2.5 2.5 0 0 1 4.8-1',
];

// Traços dos selos de revisão na grade de 16px, compartilhados pelos ícones da interface
// (`ui/icons.tsx`) e pelos selos desenhados no canvas (`canvas/renderers/review.ts`).

export const PLUS_PATHS: readonly string[] = ['M8 3v10', 'M3 8h10'];
export const MINUS_PATHS: readonly string[] = ['M3 8h10'];
export const MOVED_PATHS: readonly string[] = [
  'M2.5 5.5h9',
  'm9 3 2.5 2.5L9 8',
  'M13.5 10.5h-9',
  'm7 8-2.5 2.5L7 13',
];
export const CHANGED_PATHS: readonly string[] = [
  'M1.5 8c1.25-3 2.5-3 3.75 0s2.5 3 3.75 0 2.5-3 3.75 0 1.25 1.5 1.75 1.5',
];
export const REPLACED_PATHS: readonly string[] = ['M3 3.5h7v5H3Z', 'M6 7.5h7v5H6Z'];
/** O ⚠ sem o ponto (o ponto é desenhado à parte, cheio). */
export const WARNING_PATHS: readonly string[] = ['M8 2.5 14 13H2Z', 'M8 6.5v3'];
export const CLOSE_PATHS: readonly string[] = ['m3.5 3.5 9 9', 'm12.5 3.5-9 9'];

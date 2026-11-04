// Tipos de `round-guide.mjs` para quem o importa de TypeScript (tests/tooling/roundGuide.test.ts).
export function listRoteiros(markdown: string): string[];
export function buildRoundGuide(
  markdown: string,
  roteiros: string[],
  options?: { commit?: string },
): string;

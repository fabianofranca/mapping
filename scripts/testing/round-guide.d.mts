// Tipos de `round-guide.mjs` para quem o importa de TypeScript (tests/tooling/roundGuide.test.ts).
export function listRoteiros(markdown: string): string[];
/** `roteiros` aceita `all`, `R6` e faixas de passos como `R6.3-R6.7`. */
export function buildRoundGuide(
  markdown: string,
  roteiros: string[],
  options?: { commit?: string },
): string;

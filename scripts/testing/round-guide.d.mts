// Tipos de `round-guide.mjs` para quem o importa de TypeScript (tests/tooling/roundGuide.test.ts).
export function listRoteiros(markdown: string): string[];
/** `roteiros` aceita `all`, `R6` e faixas de passos como `R6.3-R6.7`. */
export function buildRoundGuide(
  markdown: string,
  roteiros: string[],
  options?: { commit?: string },
): string;

export const GROUP_LIMIT: number;
export const MAX_GROUPS: number;
export const CHAINS: { name: string; items: string[] }[];
export interface GroupPlan {
  items: { token: string; steps: number }[];
  total: number;
  single: boolean;
  groups: { n: number; tokens: string[]; steps: number }[];
}
/** Divide a dirigida em grupos de até `limit` passos (sem o R0), no máximo 5, sem separar cadeias. */
export function planGroups(
  markdown: string,
  roteiros: string[],
  options?: { limit?: number },
): GroupPlan;
export function formatGroupPlan(plan: GroupPlan, options?: { limit?: number }): string;

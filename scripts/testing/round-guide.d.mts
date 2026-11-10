// Tipos de `round-guide.mjs` para quem o importa de TypeScript (tests/tooling/roundGuide.test.ts).
export function listRoteiros(markdown: string): string[];
/** `roteiros` aceita `all`, `R6` e faixas de passos como `R6.3-R6.7`. */
export function buildRoundGuide(
  markdown: string,
  roteiros: string[],
  options?: { commit?: string },
): string;
/** A base do guia: sem as seções `### R<n>`, cada uma trocada pela linha do `cloud.mjs passo`. */
export function buildGuideBase(
  markdown: string,
  roteiros: string[],
  options?: { commit?: string; name?: string },
): string;
/** O índice TSV (`tipo`, `chave`, `ini`, `fim`, `título`) com linhas 1-based do guia da rodada. */
export function buildGuideIndex(guideText: string): string;
/** O trecho do guia da rodada para `R<n>`, `R<n>.<m>` ou `R<n>.<a>-R<n>.<b>`; erro de item lança `Error`. */
export function guideExcerpt(guideText: string, itens: string[]): string;
export const EXCERPT_LIMIT: number;

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

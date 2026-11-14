// Types of `round-guide.mjs` for whoever imports it from TypeScript (tests/tooling/roundGuide.test.ts).
export function listRoteiros(markdown: string): string[];
/**
 * `roteiros` accepts `all`, `R6` and step ranges such as `R6.3-R6.7`. With `mandatoryOnly`, the
 * `SECOES_SOB_DEMANDA` sections of the guide become a line with the `cloud.mjs secao` command (the measure of the blocks).
 */
export function buildRoundGuide(
  markdown: string,
  roteiros: string[],
  options?: { commit?: string; mandatoryOnly?: boolean },
): string;
/** The base of the guide: only the mandatory part, without the `### R<n>` sections (a `cloud.mjs passo` line) or the on-demand ones (a `secao` line). */
export function buildGuideBase(
  markdown: string,
  roteiros: string[],
  options?: { commit?: string; name?: string },
): string;
/** The TSV index (`tipo`, `chave`, `ini`, `fim`, `título`) with 1-based lines of the round guide. */
export function buildGuideIndex(guideText: string): string;
/** The part of the round guide for `R<n>`, `R<n>.<m>` or `R<n>.<a>-R<n>.<b>`; an item error throws `Error`. */
export const FORA_DO_GUIA: string;
export function guideExcerpt(
  guideText: string,
  itens: string[],
  fallbackText?: string,
): string;
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
/** Splits the directed round into groups of up to `limit` steps (without R0), at most 5, without splitting chains. */
export function planGroups(
  markdown: string,
  roteiros: string[],
  options?: { limit?: number },
): GroupPlan;
export function formatGroupPlan(plan: GroupPlan, options?: { limit?: number }): string;

export const FAIXA_LIMIT: number;
export interface Faixa {
  token: string;
  steps: number;
}
/** The batches of the tester's subagents (without R0), in the guide's order: a script of up to `limit` steps whole, above that consecutive ranges; a dependent step (R22.6a) stays with the previous one. */
export function planFaixas(
  markdown: string,
  roteiros: string[],
  options?: { limit?: number },
): Faixa[];
/** The text of `--faixas`: one line `batch k of n: <token> (<m> steps)` per batch. */
export function formatFaixas(lotes: Faixa[]): string;
/** The setup text of whole scripts (before the first step), cut at 25 thousand; an item that is not a whole script throws `Error`. */
export function guidePreparo(
  guideText: string,
  itens: string[],
  fallbackText?: string,
): string;

export interface SecaoSobDemanda {
  chave: string;
  titulo: string;
  nivel: number;
  fonte: 'guia' | 'consulta';
  quando: string;
}
/** The sections the tester reads on demand through `cloud.mjs secao` (stage #1533, decisions 1 and 4). */
export const SECOES_SOB_DEMANDA: SecaoSobDemanda[];
/** The sections cut out by key, separated by `---`; `consultaText` serves the `consulta.*` keys; an unknown key throws `Error`. */
export function guideSection(
  guideText: string,
  chaves: string[],
  consultaText?: string,
): string;
/** The list of `cloud.mjs secao` without a key: key, size and "when to read". */
export function listSecoes(guideText: string, consultaText?: string): string;

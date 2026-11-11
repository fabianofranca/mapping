// Tipos de `round-guide.mjs` para quem o importa de TypeScript (tests/tooling/roundGuide.test.ts).
export function listRoteiros(markdown: string): string[];
/**
 * `roteiros` aceita `all`, `R6` e faixas de passos como `R6.3-R6.7`. Com `mandatoryOnly`, as seções de
 * `SECOES_SOB_DEMANDA` do guia viram uma linha com o comando `cloud.mjs secao` (a medida dos blocos).
 */
export function buildRoundGuide(
  markdown: string,
  roteiros: string[],
  options?: { commit?: string; mandatoryOnly?: boolean },
): string;
/** A base do guia: só o obrigatório, sem as seções `### R<n>` (linha do `cloud.mjs passo`) nem as sob demanda (linha do `secao`). */
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

export interface SecaoSobDemanda {
  chave: string;
  titulo: string;
  nivel: number;
  fonte: 'guia' | 'consulta';
  quando: string;
}
/** As seções que o testador lê sob demanda pelo `cloud.mjs secao` (etapa #1533, decisões 1 e 4). */
export const SECOES_SOB_DEMANDA: SecaoSobDemanda[];
/** O recorte das seções por chave, separadas por `---`; `consultaText` atende as chaves `consulta.*`; chave desconhecida lança `Error`. */
export function guideSection(
  guideText: string,
  chaves: string[],
  consultaText?: string,
): string;
/** A lista do `cloud.mjs secao` sem chave: chave, tamanho e "quando ler". */
export function listSecoes(guideText: string, consultaText?: string): string;

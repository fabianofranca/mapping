/**
 * Folga da quebra de linha (FX4, decisão 20 da #896): uma linha só quebra quando passa da largura
 * da caixa por mais de 0,5 px. A soma das larguras das palavras e a largura medida do DOM diferem
 * na ponta do ponto flutuante; sem a folga a última palavra caía para a linha de baixo por uma
 * fração de pixel. É a única constante: o modelo (`measureLines`), o medidor e o desenho do Konva
 * (app) e o desenho do servidor MCP leem esta.
 */
export const WRAP_SLACK = 0.5;

/** Alcance vertical (px) do recorte horizontal de um texto cortado: bem além de qualquer texto. */
export const CUT_REACH = 10000;

/**
 * `wrap: none` sem `ellipsis` numa caixa de largura fixa (FX4, decisão 19): a linha é recortada por
 * pixel na caixa do texto (a letra que passa sai cortada no meio). A app e o PNG do MCP leem esta.
 */
export function cutsText(node: {
  readonly width: number;
  readonly style: { readonly wrap?: string; readonly ellipsis?: boolean };
}): boolean {
  return node.style.wrap === 'none' && node.style.ellipsis !== true && node.width > 0;
}

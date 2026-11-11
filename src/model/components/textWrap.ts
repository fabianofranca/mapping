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

/**
 * Onde começa a linha de largura `lineWidth` do texto cortado (`cutsText`, decisão 30 da #898): as
 * linhas se alinham entre si pela mais larga (o bloco, de largura `blockWidth`) e o bloco se alinha
 * na caixa de largura `boxWidth` pelo `align`; um bloco mais largo que a caixa começa na borda
 * esquerda. `justify` conta como `left`. É o que o `Text` do Konva faz sem `width`; a app e o PNG do
 * MCP leem esta.
 */
export function cutLineLeft(
  align: 'left' | 'center' | 'right' | 'justify',
  boxWidth: number,
  blockWidth: number,
  lineWidth: number,
): number {
  const blockLeft =
    blockWidth >= boxWidth
      ? 0
      : align === 'center'
        ? (boxWidth - blockWidth) / 2
        : align === 'right'
          ? boxWidth - blockWidth
          : 0;
  const inBlock =
    align === 'center'
      ? (blockWidth - lineWidth) / 2
      : align === 'right'
        ? blockWidth - lineWidth
        : 0;
  return blockLeft + inBlock;
}

/** A altura da linha como o Konva a calcula: `lineHeight / fontSize × fontSize` (a mesma aritmética). */
export const konvaLineHeight = (lineHeight: number, fontSize: number): number =>
  (lineHeight / fontSize) * fontSize;

/**
 * Quantas das `total` linhas cabem numa caixa de altura `boxHeight` (decisão 31 da #898): o laço do
 * `_setTextData` do Konva 10.7.1. A primeira linha fica sempre e cada seguinte enquanto
 * `(k + 1) × lineHeight ≤ boxHeight`, somando `lineHeight` linha a linha. Sem altura
 * (`boxHeight ≤ 0`), todas. Com `total` infinito, devolve quantas linhas cabem. Passe a
 * `lineHeight` por `konvaLineHeight` para bater com o Konva.
 */
export function visibleLineCount(
  total: number,
  boxHeight: number,
  lineHeight: number,
): number {
  if (!(boxHeight > 0) || !(lineHeight > 0)) return total;
  let used = 0;
  let count = 0;
  while (count < total) {
    count += 1;
    used += lineHeight;
    if (used + lineHeight > boxHeight) break;
  }
  return count;
}

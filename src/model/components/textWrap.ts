/**
 * Folga da quebra de linha (FX4, decisão 20 da #896): uma linha só quebra quando passa da largura
 * da caixa por mais de 0,5 px. A soma das larguras das palavras e a largura medida do DOM diferem
 * na ponta do ponto flutuante; sem a folga a última palavra caía para a linha de baixo por uma
 * fração de pixel. É a única constante: o modelo (`measureLines`), o medidor e o desenho do Konva
 * (app) e o desenho do servidor MCP leem esta.
 */
export const WRAP_SLACK = 0.5;

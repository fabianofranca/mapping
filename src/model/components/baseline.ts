/**
 * Conta única da linha de base e do `cap-middle` (decisão 28 da #898). A app (Konva) e o PNG do MCP
 * (glifos e barras) leem estas funções; cada um traz só as medidas da fonte que desenha. Puro, sem
 * navegador: o modelo não conhece fonte, quem mede entra por parâmetro.
 */

/** Medidas verticais da fonte do nó, em px no tamanho do nó. */
export interface CapMetrics {
  readonly ascent: number;
  readonly descent: number;
  /** Altura da maiúscula. */
  readonly capHeight: number;
}

/** Sem medida de fonte, o ascendente vale esta fração do corpo. */
export const ASCENT_RATIO = 0.8;
/** Sem medida de fonte, o descendente vale esta fração do corpo. */
export const DESCENT_RATIO = 0.2;
/** Sem a medida do `H`, a maiúscula vale esta fração do corpo. */
export const CAP_HEIGHT_RATIO = 0.7;

/** A reserva de quando não há medida de fonte: as proporções usuais do corpo `size`. */
export const capMetricsFallback = (size: number): CapMetrics => ({
  ascent: ASCENT_RATIO * size,
  descent: DESCENT_RATIO * size,
  capHeight: CAP_HEIGHT_RATIO * size,
});

/**
 * A linha de base de uma linha de altura `lineHeight` que começa em `top`: o centro da linha
 * mais metade da diferença entre ascendente e descendente (a mesma do Konva e do desenho dos
 * glifos).
 */
export function lineBaseline(
  top: number,
  lineHeight: number,
  metrics: Pick<CapMetrics, 'ascent' | 'descent'>,
): number {
  return top + lineHeight / 2 + (metrics.ascent - metrics.descent) / 2;
}

/**
 * `cap-middle`: quanto descer o texto, posto no topo, para o bloco do topo da maiúscula da
 * primeira linha à linha de base da última ficar no centro da caixa. 0 com `boxHeight ≤ 0`.
 */
export function capMiddleShift(input: {
  readonly boxHeight: number;
  readonly capHeight: number;
  readonly firstBaseline: number;
  readonly lastBaseline: number;
}): number {
  const { boxHeight, capHeight, firstBaseline, lastBaseline } = input;
  if (boxHeight <= 0) return 0;
  const block = lastBaseline - firstBaseline + capHeight;
  return (boxHeight - block) / 2 + capHeight - firstBaseline;
}

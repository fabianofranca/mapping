/**
 * `font.verticalAlign: "cap-middle"` (formato 4): o bloco que vai do topo da maiúscula da
 * primeira linha à linha de base da última fica centrado na caixa do nó. O desenho continua sendo
 * o `Text` do Konva: aqui só se calcula quanto descer o nó a partir da posição que o Konva usaria
 * com `verticalAlign: "top"`. A conta é pura (as métricas entram por parâmetro) e o `capHeight`
 * vem do canvas do navegador, com a mesma fonte do texto.
 */
import type { Text as KonvaText } from 'konva/lib/shapes/Text';

/** Sem a medida do `H`, a maiúscula vale esta fração do tamanho da fonte. */
export const CAP_HEIGHT_FALLBACK = 0.7;
/** Sem as medidas da fonte (canvas sem `fontBoundingBox`), as proporções usuais. */
const ASCENT_FALLBACK = 0.8;
const DESCENT_FALLBACK = 0.2;

export interface CapMetrics {
  readonly ascent: number;
  readonly descent: number;
  /** Altura da maiúscula, em px fracionários, no tamanho do nó. */
  readonly capHeight: number;
}

const positive = (n: unknown): n is number =>
  typeof n === 'number' && Number.isFinite(n) && n > 0;
const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

/** `capHeight`, `ascent` e `descent` da fonte do nó, pelas mesmas medidas que o Konva usa. */
export function capMetricsOf(sample: KonvaText, fontSize: number): CapMetrics {
  const m = sample.measureSize('M');
  const h = sample.measureSize('H');
  const ascent = m.fontBoundingBoxAscent ?? m.actualBoundingBoxAscent;
  const descent = m.fontBoundingBoxDescent ?? m.actualBoundingBoxDescent;
  return {
    ascent: finite(ascent) ? ascent : ASCENT_FALLBACK * fontSize,
    descent: finite(descent) ? descent : DESCENT_FALLBACK * fontSize,
    capHeight: positive(h.actualBoundingBoxAscent)
      ? h.actualBoundingBoxAscent
      : CAP_HEIGHT_FALLBACK * fontSize,
  };
}

/** A linha de base de uma linha de altura `lineHeight` que começa em `top`, como o Konva a põe. */
export function konvaBaseline(top: number, lineHeight: number, m: CapMetrics): number {
  return top + (m.ascent - m.descent) / 2 + lineHeight / 2;
}

/**
 * Quanto descer o texto a partir de onde está: leva o bloco (topo da maiúscula da primeira
 * linha até a base da última, `capHeight + (n − 1) × lineHeight` com linhas iguais) ao centro da
 * caixa de altura `boxHeight`. Texto mais alto que a caixa segue a mesma conta.
 */
export function capMiddleShift(input: {
  readonly boxHeight: number;
  readonly capHeight: number;
  readonly firstBaseline: number;
  readonly lastBaseline: number;
}): number {
  const { boxHeight, capHeight, firstBaseline, lastBaseline } = input;
  const block = lastBaseline - firstBaseline + capHeight;
  return (boxHeight - block) / 2 + capHeight - firstBaseline;
}

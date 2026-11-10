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

/**
 * O canvas do navegador arredonda ascent, descent e a altura do `H` ao pixel nos tamanhos
 * pequenos (a 16 px: 14, 3 e 12, quando valem 14,5, 3,4 e 11,25); o desvio de ~0,5 unidade
 * aparece como 2 a 3 px de tela a 420%. Por isso as medidas saem de um tamanho grande e voltam
 * ao do nó.
 */
const MEASURE_SCALE = 32;

/** `capHeight`, `ascent` e `descent` da fonte do nó, pelas mesmas medidas que o Konva usa. */
export function capMetricsOf(sample: KonvaText, fontSize: number): CapMetrics {
  const original = sample.fontSize();
  sample.fontSize(fontSize * MEASURE_SCALE);
  const m = sample.measureSize('M');
  const h = sample.measureSize('H');
  sample.fontSize(original);
  const ascent = m.fontBoundingBoxAscent ?? m.actualBoundingBoxAscent;
  const descent = m.fontBoundingBoxDescent ?? m.actualBoundingBoxDescent;
  const down = (n: number): number => n / MEASURE_SCALE;
  return {
    ascent: finite(ascent) ? down(ascent) : ASCENT_FALLBACK * fontSize,
    descent: finite(descent) ? down(descent) : DESCENT_FALLBACK * fontSize,
    capHeight: positive(h.actualBoundingBoxAscent)
      ? down(h.actualBoundingBoxAscent)
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

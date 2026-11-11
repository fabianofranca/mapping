/**
 * `font.verticalAlign: "cap-middle"` (formato 4): o bloco que vai do topo da maiúscula da
 * primeira linha à linha de base da última fica centrado na caixa do nó. O desenho continua sendo
 * o `Text` do Konva; a conta (`lineBaseline`, `capMiddleShift`) é a de `src/model/components/baseline.ts`.
 * Aqui fica só a medida da fonte pelo canvas do navegador (`capMetricsOf`), com a mesma fonte do texto.
 */
import type { Text as KonvaText } from 'konva/lib/shapes/Text';
import {
  ASCENT_RATIO,
  CAP_HEIGHT_RATIO,
  DESCENT_RATIO,
  type CapMetrics,
} from '../../model/components/baseline';

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
    ascent: finite(ascent) ? down(ascent) : ASCENT_RATIO * fontSize,
    descent: finite(descent) ? down(descent) : DESCENT_RATIO * fontSize,
    capHeight: positive(h.actualBoundingBoxAscent)
      ? down(h.actualBoundingBoxAscent)
      : CAP_HEIGHT_RATIO * fontSize,
  };
}

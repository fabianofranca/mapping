/**
 * `font.verticalAlign: "cap-middle"` (format 4): the block that runs from the top of the
 * capital letter of the first line to the baseline of the last one is centered in the
 * node's box. The drawing is still the Konva `Text`; the computation (`lineBaseline`,
 * `capMiddleShift`) is the one in `src/model/components/baseline.ts`. Only the font
 * measurement by the browser canvas (`capMetricsOf`) lives here, with the same font as the
 * text.
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
 * The browser canvas rounds ascent, descent and the height of the `H` to the pixel at small
 * sizes (at 16 px: 14, 3 and 12, when they are 14.5, 3.4 and 11.25); the deviation of ~0.5
 * unit shows up as 2 to 3 screen px at 420%. That is why the measurements are taken at a
 * large size and scaled back to the node's size.
 */
const MEASURE_SCALE = 32;

/** `capHeight`, `ascent` and `descent` of the node's font, by the same measures Konva uses. */
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

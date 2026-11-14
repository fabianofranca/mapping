/**
 * The text measurer that uses Konva itself, so the layout matches the drawing.
 * It depends on the browser canvas (so it stays out of the pure `instantiate` engine); in tests
 * without a canvas use `approximateMeasurer`.
 */
import { Text as KonvaText } from 'konva/lib/shapes/Text';
import { canvasFontFamily } from '../../model/components/fontFamily';
import {
  lineBaselines,
  type MeasureFont,
  type TextMeasurer,
} from '../../model/components/instantiate';
import { WRAP_SLACK } from '../../model/components/textWrap';
import { capMetricsOf } from './capMiddle';
import { textBoxLimits } from './textLimits';
import { wordSafeText } from './wordWidth';

function fontStyle(font: MeasureFont): string {
  return `${font.italic ? 'italic ' : ''}${font.weight === 400 ? 'normal' : String(font.weight)}`;
}

/** Konva's text with the measurer's font, without height (the height is that of the wrapped lines). */
function probeOf(
  text: string,
  font: MeasureFont,
  maxWidth: number | undefined,
): KonvaText {
  const face = {
    fontFamily: canvasFontFamily(font.family),
    fontSize: font.size,
    fontStyle: fontStyle(font),
    letterSpacing: font.letterSpacing,
  };
  const wraps = font.wrap !== 'none';
  // A word wider than the box stays whole on the line, as in the model (Konva would split it
  // letter by letter), and the other lines wrap where the model wraps.
  const safe =
    maxWidth !== undefined && wraps && font.ellipsis !== true
      ? wordSafeText(text, face, maxWidth)
      : { text, width: maxWidth };
  return new KonvaText({
    ...face,
    text: safe.text,
    lineHeight: font.lineHeight / font.size,
    wrap: wraps ? 'word' : 'none',
    ellipsis: font.ellipsis === true,
    ...(font.direction === 'rtl' ? { direction: 'rtl' as const } : {}),
    // The 0.5 px slack: the line only wraps beyond it (the drawing uses the same).
    ...(safe.width !== undefined ? { width: safe.width + WRAP_SLACK } : {}),
  });
}

/** Measures text with Konva itself, so the layout matches the drawing. */
export const konvaMeasurer: TextMeasurer = (text, font, maxWidth) => {
  const probe = probeOf(text, font, maxWidth);
  const { height } = textBoxLimits(probe.height(), font.maxLines, font.lineHeight);
  if (height !== probe.height()) {
    // `maxLines`: Konva truncates (and adds the …) by the fixed height.
    probe.height(height);
  }
  const lines = probe.textArr.map((line) => line.text);
  // `width()` returns the fixed width (the `maxWidth`); the text's is that of the widest line.
  const natural = probe.getTextWidth();
  const metrics = {
    width: maxWidth === undefined ? natural : Math.min(natural, maxWidth),
    height,
    lines,
    // The baseline is the drawing's: the `ascent`/`descent` of Konva's canvas (decision 2).
    ...lineBaselines(
      font.lineHeight,
      Math.max(1, lines.length),
      capMetricsOf(probe, font.size),
    ),
  };
  probe.destroy();
  return metrics;
};

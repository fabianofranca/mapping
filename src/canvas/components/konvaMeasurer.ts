/**
 * O medidor de texto que usa o próprio Konva, para o layout bater com o desenho.
 * Depende do canvas do navegador (por isso fica fora do motor puro de `instantiate`); em testes
 * sem canvas use `approximateMeasurer`.
 */
import { Text as KonvaText } from 'konva/lib/shapes/Text';
import { canvasFontFamily } from '../../model/components/fontFamily';
import type { MeasureFont, TextMeasurer } from '../../model/components/instantiate';
import { textBoxLimits } from './textLimits';

function fontStyle(font: MeasureFont): string {
  return `${font.italic ? 'italic ' : ''}${font.weight === 400 ? 'normal' : String(font.weight)}`;
}

/** O texto do Konva com a fonte do medidor, sem altura (a altura é a das linhas quebradas). */
function probeOf(
  text: string,
  font: MeasureFont,
  maxWidth: number | undefined,
): KonvaText {
  return new KonvaText({
    text,
    fontFamily: canvasFontFamily(font.family),
    fontSize: font.size,
    fontStyle: fontStyle(font),
    lineHeight: font.lineHeight / font.size,
    letterSpacing: font.letterSpacing,
    wrap: font.wrap === 'none' ? 'none' : 'word',
    ellipsis: font.ellipsis === true,
    ...(maxWidth !== undefined ? { width: maxWidth } : {}),
  });
}

/** Mede texto com o próprio Konva, para o layout bater com o desenho. */
export const konvaMeasurer: TextMeasurer = (text, font, maxWidth) => {
  const probe = probeOf(text, font, maxWidth);
  const { height } = textBoxLimits(probe.height(), font.maxLines, font.lineHeight);
  if (height !== probe.height()) {
    // `maxLines`: o Konva corta (e põe o …) pela altura fixa.
    probe.height(height);
  }
  const lines = probe.textArr.map((line) => line.text);
  // `width()` devolve a largura fixada (o `maxWidth`); a do texto é a da linha mais larga.
  const natural = probe.getTextWidth();
  const metrics = {
    width: maxWidth === undefined ? natural : Math.min(natural, maxWidth),
    height,
    lines,
  };
  probe.destroy();
  return metrics;
};

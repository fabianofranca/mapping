/**
 * O medidor de texto que usa o próprio Konva, para o layout bater com o desenho.
 * Depende do canvas do navegador (por isso fica fora do motor puro de `instantiate`); em testes
 * sem canvas use `approximateMeasurer`.
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
import { wordSafeWidth } from './wordWidth';

function fontStyle(font: MeasureFont): string {
  return `${font.italic ? 'italic ' : ''}${font.weight === 400 ? 'normal' : String(font.weight)}`;
}

/** O texto do Konva com a fonte do medidor, sem altura (a altura é a das linhas quebradas). */
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
  return new KonvaText({
    text,
    ...face,
    lineHeight: font.lineHeight / font.size,
    wrap: wraps ? 'word' : 'none',
    ellipsis: font.ellipsis === true,
    // A folga de 0,5 px: a linha só quebra além dela (o desenho usa a mesma). A palavra mais larga
    // que a caixa fica inteira na linha, como no modelo (o Konva a partiria letra por letra).
    ...(maxWidth !== undefined
      ? {
          width:
            (wraps && font.ellipsis !== true
              ? wordSafeWidth(text, face, maxWidth)
              : maxWidth) + WRAP_SLACK,
        }
      : {}),
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
    // A linha de base é a do desenho: o `ascent`/`descent` do canvas do Konva (decisão 2).
    ...lineBaselines(
      font.lineHeight,
      Math.max(1, lines.length),
      capMetricsOf(probe, font.size),
    ),
  };
  probe.destroy();
  return metrics;
};

/**
 * O medidor de texto que usa o próprio Konva, para o layout bater com o desenho.
 * Depende do canvas do navegador (por isso fica fora do motor puro de `instantiate`); em testes
 * sem canvas use `approximateMeasurer`.
 */
import { Text as KonvaText } from 'konva/lib/shapes/Text';
import type { TextMeasurer } from '../../model/components/instantiate';

/** Mede texto com o próprio Konva, para o layout bater com o desenho. */
export const konvaMeasurer: TextMeasurer = (text, font, maxWidth) => {
  const probe = new KonvaText({
    text,
    fontFamily: `"${font.family}", sans-serif`,
    fontSize: font.size,
    fontStyle: `${font.italic ? 'italic ' : ''}${font.weight === 400 ? 'normal' : String(font.weight)}`,
    lineHeight: font.lineHeight / font.size,
    letterSpacing: font.letterSpacing,
    wrap: 'word',
    ...(maxWidth !== undefined ? { width: maxWidth } : {}),
  });
  const metrics = { width: probe.width(), height: probe.height() };
  probe.destroy();
  return metrics;
};

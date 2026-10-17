import { signal } from '@preact/signals';
import { approximateMeasurer, type TextMeasurer } from '../model/components/instantiate';

/**
 * Medidor de texto dos desenhos dos componentes. Começa no aproximado (testes, Node); o canvas
 * troca para o medidor real (Konva) ao montar, e os desenhos remedem na hora. Estado da UI, não
 * do projeto.
 */
export const textMeasurer = signal<TextMeasurer>(approximateMeasurer);

import { signal } from '@preact/signals';
import { approximateMeasurer, type TextMeasurer } from '../model/components/instantiate';
import { cachedMeasurer, MEASURE_CACHE_LIMIT } from '../model/components/measureCache';

/**
 * Medidor de texto dos desenhos dos componentes. Começa no aproximado (testes, Node); o canvas
 * troca para o medidor real (Konva) ao montar, e os desenhos remedem na hora. Estado da UI, não
 * do projeto.
 */
export const textMeasurer = signal<TextMeasurer>(approximateMeasurer);

/** Quantas épocas de fontes um medidor guarda antes de esquecer as mais antigas. */
const EPOCHS_KEPT = 4;
const memoized = new WeakMap<TextMeasurer, Map<number, TextMeasurer>>();

/**
 * O `measure` memoizado (LRU por texto, fonte e limite; decisão 19 da #1078) com que os desenhos
 * dos componentes medem. Um por medidor e por época das fontes: o medidor novo e as fontes que
 * terminam de carregar (`fontsEpoch`) trocam o medidor devolvido, então o cache de desenhos
 * (que compara o medidor por identidade) redesenha tudo e nenhuma medida velha sobrevive.
 */
export function memoizedTextMeasurer(
  measure: TextMeasurer,
  fontsEpoch: number,
): TextMeasurer {
  let epochs = memoized.get(measure);
  if (epochs === undefined) {
    epochs = new Map();
    memoized.set(measure, epochs);
  }
  let cached = epochs.get(fontsEpoch);
  if (cached === undefined) {
    // Sai só a época mais antiga (a primeira inserida): a atual e as recentes mantêm o medidor.
    if (epochs.size >= EPOCHS_KEPT) {
      const oldest = epochs.keys().next();
      if (!oldest.done) epochs.delete(oldest.value);
    }
    cached = cachedMeasurer(measure, { limit: MEASURE_CACHE_LIMIT });
    epochs.set(fontsEpoch, cached);
  }
  return cached;
}

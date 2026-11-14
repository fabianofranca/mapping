import { signal } from '@preact/signals';
import { approximateMeasurer, type TextMeasurer } from '../model/components/instantiate';
import { cachedMeasurer, MEASURE_CACHE_LIMIT } from '../model/components/measureCache';

/**
 * Text measurer of the component drawings. Starts as the approximate one (tests, Node); the canvas
 * switches to the real measurer (Konva) on mount, and the drawings re-measure on the spot. UI state, not
 * project state.
 */
export const textMeasurer = signal<TextMeasurer>(approximateMeasurer);

/** How many font epochs a measurer keeps before forgetting the oldest. */
const EPOCHS_KEPT = 4;
const memoized = new WeakMap<TextMeasurer, Map<number, TextMeasurer>>();

/**
 * The memoized `measure` (LRU by text, font and limit; decision 19 of #1078) that the drawings
 * of the components measure with. One per measurer and per font epoch: the new measurer and the fonts that
 * finish loading (`fontsEpoch`) swap the returned measurer, so the drawings cache
 * (which compares the measurer by identity) redraws everything and no old measure survives.
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
    // Only the oldest epoch goes out (the first inserted): the current and recent ones keep the measurer.
    if (epochs.size >= EPOCHS_KEPT) {
      const oldest = epochs.keys().next();
      if (!oldest.done) epochs.delete(oldest.value);
    }
    cached = cachedMeasurer(measure, { limit: MEASURE_CACHE_LIMIT });
    epochs.set(fontsEpoch, cached);
  }
  return cached;
}

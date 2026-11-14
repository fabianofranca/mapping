// Text measurement cache (#1078, decision 19): pure, no DOM. The engine recreates the nodes on each
// instantiation, so the cache is by content and constraint (text, font, limit), like Yoga's
// `measure`, and not by node.
import type { MeasureFont, TextMeasurer } from './instantiate';

/** Size of the LRU of the app's and the MCP's measurer (decision 19). */
export const MEASURE_CACHE_LIMIT = 4096;

/** `maxWidth` enters the key rounded to 1/64 px: smaller differences do not change the wrapping. */
const WIDTH_STEPS_PER_PX = 64;

const SEPARATOR = '\u0000';

/** The `MeasureFont` fields that change the measurement, as text (the base of the key). */
export function fontKey(font: MeasureFont): string {
  return [
    font.family,
    font.size,
    font.weight,
    font.italic ? 1 : 0,
    font.lineHeight,
    font.letterSpacing,
    font.wrap ?? '',
    font.ellipsis === true ? 1 : 0,
    font.maxLines ?? '',
    font.direction ?? '',
  ].join(SEPARATOR);
}

/** Key of a measurement: the font, the limit (at 1/64 px; empty = no limit) and, last, the text. */
export function measureKey(
  text: string,
  font: MeasureFont,
  maxWidth: number | undefined,
): string {
  const width =
    maxWidth === undefined ? '' : String(Math.round(maxWidth * WIDTH_STEPS_PER_PX));
  return `${fontKey(font)}${SEPARATOR}${width}${SEPARATOR}${text}`;
}

/** The measurers that already memoize (`cachedMeasurer` and `withMeasureMemo`): not wrapped again. */
const memoized = new WeakSet<TextMeasurer>();

/**
 * Memoizes a measurer by (text, `MeasureFont`, `maxWidth` at 1/64 px) in an LRU of `limit` entries.
 * The same `TextMetrics` comes back for the same key (whoever reads it does not change it). A new
 * measurer means a new cache: the app and the MCP swap the measurer (and the `fontsEpoch`) and the
 * drawing cache, which compares the measurer by identity, redraws everything.
 */
export function cachedMeasurer(
  measure: TextMeasurer,
  options: { readonly limit: number },
): TextMeasurer {
  const limit = Math.max(1, Math.floor(options.limit));
  // The insertion order of the `Map` is the order of use: the first key is the least recent.
  const entries = new Map<string, ReturnType<TextMeasurer>>();
  const cached: TextMeasurer = (text, font, maxWidth) => {
    const key = measureKey(text, font, maxWidth);
    const hit = entries.get(key);
    if (hit !== undefined) {
      entries.delete(key);
      entries.set(key, hit);
      return hit;
    }
    const metrics = measure(text, font, maxWidth);
    entries.set(key, metrics);
    if (entries.size > limit) {
      const oldest = entries.keys().next();
      if (!oldest.done) entries.delete(oldest.value);
    }
    return metrics;
  };
  memoized.add(cached);
  return cached;
}

/**
 * The measurer the engine uses inside an instantiation (the two passes of `$lines` included):
 * the same one, if it already memoizes (the app's and the MCP's); otherwise one that remembers each
 * (text, font, exact limit) while the instantiation lasts. A measurer without a cache (tests,
 * `approximateMeasurer`) stays that way without repeating the same measurement of equal texts in
 * different nodes.
 */
export function withMeasureMemo(measure: TextMeasurer): TextMeasurer {
  if (memoized.has(measure)) return measure;
  const entries = new Map<string, ReturnType<TextMeasurer>>();
  const once: TextMeasurer = (text, font, maxWidth) => {
    const key = `${fontKey(font)}${SEPARATOR}${maxWidth ?? ''}${SEPARATOR}${text}`;
    let metrics = entries.get(key);
    if (metrics === undefined) {
      metrics = measure(text, font, maxWidth);
      entries.set(key, metrics);
    }
    return metrics;
  };
  return once;
}

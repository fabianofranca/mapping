// Cache de medida de texto (#1078, decisão 19): puro, sem DOM. O motor recria os nós a cada
// instanciação, então o cache é por conteúdo e restrição (texto, fonte, limite), como o `measure`
// do Yoga, e não por nó.
import type { MeasureFont, TextMeasurer } from './instantiate';

/** Tamanho do LRU do medidor da app e do MCP (decisão 19). */
export const MEASURE_CACHE_LIMIT = 4096;

/** O `maxWidth` entra na chave arredondado a 1/64 px: diferenças menores não mudam a quebra. */
const WIDTH_STEPS_PER_PX = 64;

const SEPARATOR = '\u0000';

/** Os campos de `MeasureFont` que mudam a medida, em texto (a base da chave). */
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
  ].join(SEPARATOR);
}

/** Chave de uma medida: a fonte, o limite (a 1/64 px; vazio = sem limite) e, por último, o texto. */
export function measureKey(
  text: string,
  font: MeasureFont,
  maxWidth: number | undefined,
): string {
  const width =
    maxWidth === undefined ? '' : String(Math.round(maxWidth * WIDTH_STEPS_PER_PX));
  return `${fontKey(font)}${SEPARATOR}${width}${SEPARATOR}${text}`;
}

/** Os medidores que já memoizam (o `cachedMeasurer` e o `withMeasureMemo`): não se embrulham de novo. */
const memoized = new WeakSet<TextMeasurer>();

/**
 * Memoiza um medidor por (texto, `MeasureFont`, `maxWidth` a 1/64 px) num LRU de `limit` entradas.
 * O mesmo `TextMetrics` volta para a mesma chave (quem lê não o altera). Um medidor novo vale um
 * cache novo: a app e o MCP trocam o medidor (e o `fontsEpoch`) e o cache de desenhos, que compara
 * o medidor por identidade, redesenha tudo.
 */
export function cachedMeasurer(
  measure: TextMeasurer,
  options: { readonly limit: number },
): TextMeasurer {
  const limit = Math.max(1, Math.floor(options.limit));
  // A ordem de inserção do `Map` é a do uso: a primeira chave é a menos recente.
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
 * O medidor que o motor usa dentro de uma instanciação (as duas passagens do `$lines` incluídas):
 * o mesmo, se já memoiza (o da app e o do MCP); senão um que lembra cada (texto, fonte, limite
 * exato) enquanto a instanciação dura. Um medidor sem cache (testes, `approximateMeasurer`) fica
 * assim sem repetir a mesma medida de textos iguais em nós diferentes.
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

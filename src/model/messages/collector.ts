import type { ModelMessage } from '../modelMessage';
import { templateMessage, type ModelMessageTemplateCode } from './index';

// Collector of the drawing engine's warnings: each warning is a catalog message (`engine`,
// `origins`), without repetition and in the order it came in, the same as the `Set<string>` of
// `warnings` did (same code and parameters, same text). Text `warnings` = `textsOf(messages)`.

export type Params = Readonly<Record<string, string | number>>;

export interface MessageSet {
  /** Adds the catalog message; one that already came in (same code and parameters) is not repeated. */
  readonly add: (code: ModelMessageTemplateCode, params?: Params) => ModelMessage;
  /** The messages, in order of entry. */
  readonly list: () => ModelMessage[];
}

/**
 * The identity of a warning, without building the text: the code (alone, without allocating,
 * when there are no parameters) and the name and value pairs of the parameters, sorted by name
 * (the order they came in does not count; different names do not merge), concatenated in a
 * loop. The value's type is left out on purpose: `1` and `'1'` give the same text, and the
 * collector keeps deduplicating like the `Set<string>` of `warnings` it replaced.
 */
const keyOf = (code: string, params: Params): string => {
  const names = Object.keys(params);
  if (names.length === 0) return code;
  if (names.length > 1) names.sort();
  let key = code;
  for (const name of names) key += `\u0000${name}\u0001${params[name]}`;
  return key;
};

export function createMessageSet(initial: readonly ModelMessage[] = []): MessageSet {
  const byKey = new Map<string, ModelMessage>();
  for (const m of initial) {
    const key = keyOf(m.code, m.params);
    if (!byKey.has(key)) byKey.set(key, m);
  }
  return {
    add(code, params = {}) {
      const key = keyOf(code, params);
      const known = byKey.get(key);
      if (known !== undefined) return known;
      const message = templateMessage(code, params);
      byKey.set(key, message);
      return message;
    },
    list: () => [...byKey.values()],
  };
}

/** The texts of a list of messages (the `warnings` that the MCP and the viewer read). */
export const textsOf = (messages: readonly ModelMessage[]): string[] =>
  messages.map((m) => m.text);

/** Merges lists of messages without repeating, in order (the first one wins). */
export function mergeMessages(
  ...lists: readonly (readonly ModelMessage[])[]
): ModelMessage[] {
  return createMessageSet(lists.flat()).list();
}

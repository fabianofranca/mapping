import type { ModelMessage } from '../modelMessage';
import { templateMessage, type ModelMessageTemplateCode } from './index';

// Coletor dos avisos do motor de desenho: cada aviso é uma mensagem do catálogo (`engine`,
// `origins`), sem repetição e na ordem em que entrou, o mesmo que o `Set<string>` de `warnings`
// fazia (mesmo código e parâmetros, mesmo texto). `warnings` de texto = `textsOf(messages)`.

export type Params = Readonly<Record<string, string | number>>;

export interface MessageSet {
  /** Acrescenta a mensagem do catálogo; a que já entrou (mesmo código e parâmetros) não se repete. */
  readonly add: (code: ModelMessageTemplateCode, params?: Params) => ModelMessage;
  /** As mensagens, na ordem de entrada. */
  readonly list: () => ModelMessage[];
}

/** A identidade de um aviso, sem montar o texto: o código e os valores dos parâmetros. */
const keyOf = (code: string, params: Params): string =>
  `${code}\u0000${Object.values(params).join('\u0000')}`;

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

/** Os textos de uma lista de mensagens (o `warnings` que o MCP e o visualizador leem). */
export const textsOf = (messages: readonly ModelMessage[]): string[] =>
  messages.map((m) => m.text);

/** Une listas de mensagens sem repetir, na ordem (a primeira vence). */
export function mergeMessages(
  ...lists: readonly (readonly ModelMessage[])[]
): ModelMessage[] {
  return createMessageSet(lists.flat()).list();
}

import type { ModelMessage } from '../modelMessage';
import { templateMessage, type ModelMessageTemplateCode } from './index';

// Coletor dos avisos do motor de desenho: cada aviso é uma mensagem do catálogo (`engine`,
// `origins`), sem repetição pelo texto e na ordem em que entrou, o mesmo que o `Set<string>` de
// `warnings` fazia. `warnings` de texto = `messages.map((m) => m.text)`. Sem DOM.

export type Params = Readonly<Record<string, string | number>>;

export interface MessageSet {
  /** Acrescenta a mensagem do catálogo; a que já entrou (mesmo texto) não se repete. */
  readonly add: (code: ModelMessageTemplateCode, params?: Params) => ModelMessage;
  /** As mensagens, na ordem de entrada. */
  readonly list: () => ModelMessage[];
}

export function createMessageSet(initial: readonly ModelMessage[] = []): MessageSet {
  const byText = new Map<string, ModelMessage>();
  for (const message of initial)
    if (!byText.has(message.text)) byText.set(message.text, message);
  return {
    add(code, params = {}) {
      const message = templateMessage(code, params);
      const known = byText.get(message.text);
      if (known !== undefined) return known;
      byText.set(message.text, message);
      return message;
    },
    list: () => [...byText.values()],
  };
}

/** Os textos de uma lista de mensagens (o `warnings` que o MCP e o visualizador leem). */
export const textsOf = (messages: readonly ModelMessage[]): string[] =>
  messages.map((m) => m.text);

/** Une listas de mensagens sem repetir o texto (a primeira vence), na ordem. */
export function mergeMessages(
  ...lists: readonly (readonly ModelMessage[])[]
): ModelMessage[] {
  return createMessageSet(lists.flat()).list();
}

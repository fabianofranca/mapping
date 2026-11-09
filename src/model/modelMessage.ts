// Mensagem do modelo para a interface: código + parâmetros (a interface traduz por `t()`) e o
// texto em pt-BR de sempre (o que o MCP e os testes do modelo continuam lendo). Sem DOM.

export interface ModelMessage {
  /** Identifica a mensagem; `'raw'` = sem tradução, vale só o `text`. */
  readonly code: string;
  /** Valores que entram no texto traduzido, por nome (`{label}`). */
  readonly params: Readonly<Record<string, string | number>>;
  /** Texto em pt-BR (idêntico ao que o modelo devolvia como `string`). */
  readonly text: string;
}

export const RAW_MESSAGE_CODE = 'raw';

/** Mensagem com código e parâmetros; `text` é o pt-BR já montado. */
export function modelMessage(
  code: string,
  params: Readonly<Record<string, string | number>>,
  text: string,
): ModelMessage {
  return { code, params, text };
}

/** Mensagem sem tradução (vinda do motor, de um parser ou de texto livre): segue em texto. */
export function rawMessage(text: string): ModelMessage {
  return { code: RAW_MESSAGE_CODE, params: {}, text };
}

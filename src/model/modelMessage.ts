// Mensagem do modelo para a interface: código + parâmetros (a interface traduz por `t()`) e o
// texto em pt-BR de sempre (o que o MCP e os testes do modelo continuam lendo). Sem DOM.

export interface ModelMessage {
  /** Identifica a mensagem; `'raw'` = sem tradução, vale só o `text`. */
  readonly code: string;
  /** Valores que entram no texto traduzido, por nome (`{label}`). */
  readonly params: Readonly<Record<string, string | number>>;
  /** Texto em pt-BR (idêntico ao que o modelo devolvia como `string`). */
  readonly text: string;
  /** Mensagem de dentro (o motivo de outro módulo): a interface a traduz e a põe em `{reason}`. */
  readonly detail?: ModelMessage;
}

export const RAW_MESSAGE_CODE = 'raw';

/** Mensagem com código e parâmetros; `text` é o pt-BR já montado. */
export function modelMessage(
  code: string,
  params: Readonly<Record<string, string | number>>,
  text: string,
  detail?: ModelMessage,
): ModelMessage {
  return detail === undefined ? { code, params, text } : { code, params, text, detail };
}

/** Um problema de um parser (componente, ícones): caminho, texto pt-BR e o código que o traduz. */
export interface IssueLike {
  readonly path: string;
  readonly message: string;
  readonly code?: string | undefined;
  readonly params?: Readonly<Record<string, string | number>> | undefined;
}

/**
 * O problema do parser como pedaços de uma mensagem de fora: `at` é o caminho com `": "`
 * (vazio sem caminho), `reason` o texto pt-BR e `detail` o motivo com código (quando há), que a
 * interface traduz e põe no lugar de `{reason}`.
 */
export function issueParts(issue: IssueLike): {
  readonly at: string;
  readonly reason: string;
  readonly detail?: ModelMessage;
} {
  const at = issue.path === '' ? '' : `${issue.path}: `;
  if (issue.code === undefined) return { at, reason: issue.message };
  return {
    at,
    reason: issue.message,
    detail: modelMessage(issue.code, issue.params ?? {}, issue.message),
  };
}

/** Mensagem sem tradução (vinda do motor, de um parser ou de texto livre): segue em texto. */
export function rawMessage(text: string): ModelMessage {
  return { code: RAW_MESSAGE_CODE, params: {}, text };
}

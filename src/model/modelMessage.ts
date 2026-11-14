// Model message for the interface: code + parameters (the interface translates through `t()`)
// and the default English text (what the MCP and the model tests keep reading). No DOM.

export interface ModelMessage {
  /** Identifies the message; `'raw'` = no translation, only the `text` counts. */
  readonly code: string;
  /** Values that go into the translated text, by name (`{label}`). */
  readonly params: Readonly<Record<string, string | number>>;
  /** Default English text (identical to what the model used to return as a `string`). */
  readonly text: string;
  /**
   * Inner message (the reason from another module): the interface translates it and puts it in
   * `{reason}`. Rule: with `detail`, `params` does not carry `reason` (the inner text lives only
   * here).
   */
  readonly detail?: ModelMessage;
}

export const RAW_MESSAGE_CODE = 'raw';

/** Message with code and parameters; `text` is the already assembled English text. */
export function modelMessage(
  code: string,
  params: Readonly<Record<string, string | number>>,
  text: string,
  detail?: ModelMessage,
): ModelMessage {
  return detail === undefined ? { code, params, text } : { code, params, text, detail };
}

/** A parser issue (component, icons): path, English text and the code that translates it. */
export interface IssueLike {
  readonly path: string;
  readonly message: string;
  readonly code?: string | undefined;
  readonly params?: Readonly<Record<string, string | number>> | undefined;
}

/**
 * The parser issue as pieces of an outer message: `at` is the path with `": "` (empty without
 * a path), `reason` the English text and `detail` the reason with a code (when there is one),
 * which the interface translates and puts in place of `{reason}`. `reasonParam` is what goes
 * into the `params`: `{ reason }` without `detail` and `{}` with `detail` (the rule of
 * `ModelMessage.detail`); `reason` still serves to assemble the English `text`.
 */
export function issueParts(issue: IssueLike): {
  readonly at: string;
  readonly reason: string;
  readonly reasonParam: { readonly reason?: string };
  readonly detail?: ModelMessage;
} {
  const at = issue.path === '' ? '' : `${issue.path}: `;
  if (issue.code === undefined) {
    return { at, reason: issue.message, reasonParam: { reason: issue.message } };
  }
  return {
    at,
    reason: issue.message,
    reasonParam: {},
    detail: modelMessage(issue.code, issue.params ?? {}, issue.message),
  };
}

/** Message without translation (from the engine, a parser or free text): stays as text. */
export function rawMessage(text: string): ModelMessage {
  return { code: RAW_MESSAGE_CODE, params: {}, text };
}

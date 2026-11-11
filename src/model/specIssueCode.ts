import type { z } from 'zod';
import {
  fillTemplate,
  MODEL_MESSAGE_TEMPLATES,
  type ModelMessageTemplateCode,
} from './messages';
import { specCodeForText, type SpecMessageCode } from './messages/textLookup';

// Códigos dos problemas da especialização (`parseSpec`): cada problema do zod sai com o código e
// os parâmetros do catálogo `spec` (`src/model/messages/spec.ts`), por esta ordem: o
// `params.messageCode` posto no `addIssue`; o texto exato de uma mensagem pronta que o zod recebe
// (`known`: `SpecMsg` com valores constantes); o texto exato de um modelo sem parâmetro; o padrão
// dos `SPEC_PATTERN_CODES` (o texto que o zod monta com o valor recebido); o texto padrão do zod
// (`spec.zod.<código do zod>`). Sem DOM.

export type MessageParams = Readonly<Record<string, string | number>>;

export interface IssueCoding {
  readonly code: ModelMessageTemplateCode;
  readonly params?: MessageParams;
}

/** Uma mensagem do catálogo `spec` já preenchida, para o `addIssue`. */
export interface SpecMsg {
  readonly code: SpecMessageCode;
  readonly params: MessageParams;
  readonly text: string;
}

export function specMsg(code: SpecMessageCode, params: MessageParams = {}): SpecMsg {
  return { code, params, text: fillTemplate(MODEL_MESSAGE_TEMPLATES[code], params) };
}

const quoted = (keys: readonly string[]): string => keys.map((k) => `"${k}"`).join(', ');

/** Reemite no `ctx`: o texto fixo como veio, ou a mensagem do catálogo com o `messageCode`. */
export function addSpecIssue(
  ctx: z.RefinementCtx,
  path: (string | number)[],
  message: string | SpecMsg,
): void {
  if (typeof message === 'string') {
    ctx.addIssue({ code: 'custom', path, message });
    return;
  }
  ctx.addIssue({
    code: 'custom',
    path,
    message: message.text,
    params: { messageCode: message.code, ...message.params },
  });
}

/** O nome do tipo do valor recebido (`string`, `number`, `boolean`, `object`, `array`, `null`, `undefined`). */
export function receivedName(input: unknown): string {
  if (input === null) return 'null';
  if (Array.isArray(input)) return 'array';
  return typeof input;
}

const ZOD_DEFAULT = /^(Invalid |Too (small|big): |Unrecognized keys?: )/;

/** Os parâmetros do texto padrão de cada código do zod (o `input` vem do `reportInput`). */
function zodParams(issue: z.core.$ZodIssue): MessageParams {
  switch (issue.code) {
    case 'invalid_type':
      return { expected: issue.expected, received: receivedName(issue.input) };
    case 'unrecognized_keys':
      return { keys: quoted(issue.keys) };
    case 'too_small':
      return { minimum: String(issue.minimum) };
    case 'too_big':
      return { maximum: String(issue.maximum) };
    case 'invalid_value':
      return {
        values: issue.values.map((v) => JSON.stringify(v) ?? String(v)).join(', '),
      };
    case 'not_multiple_of':
      return { divisor: String(issue.divisor) };
    default:
      return {};
  }
}

const ZOD_CODES: ReadonlySet<string> = new Set([
  'invalid_type',
  'unrecognized_keys',
  'too_small',
  'too_big',
  'invalid_value',
  'invalid_format',
  'invalid_union',
  'invalid_key',
  'invalid_element',
  'not_multiple_of',
]);

function explicitCoding(issue: z.core.$ZodIssue): IssueCoding | undefined {
  const params: unknown = 'params' in issue ? issue.params : undefined;
  if (typeof params !== 'object' || params === null) return undefined;
  const { messageCode, ...rest } = params as Record<string, unknown>;
  if (typeof messageCode !== 'string') return undefined;
  const code = messageCode as ModelMessageTemplateCode;
  return Object.keys(rest).length > 0
    ? { code, params: rest as MessageParams }
    : { code };
}

/** A mensagem pronta (`known`) cujo texto é o do problema; os parâmetros são os dela. */
function knownCoding(
  issue: z.core.$ZodIssue,
  known: readonly SpecMsg[],
): IssueCoding | undefined {
  const msg = known.find((k) => k.text === issue.message);
  if (msg === undefined) return undefined;
  return Object.keys(msg.params).length > 0
    ? { code: msg.code, params: msg.params }
    : { code: msg.code };
}

/** O código achado pelo texto: o exato dos modelos sem parâmetro, ou o padrão dos três enums. */
function textCoding(issue: z.core.$ZodIssue): IssueCoding | undefined {
  const hit = specCodeForText(issue.message);
  if (hit === undefined) return undefined;
  return hit.params === undefined
    ? { code: hit.code }
    : { code: hit.code, params: hit.params };
}

/**
 * O código e os parâmetros do problema do zod; `undefined` fica como texto cru. `known` são as
 * mensagens prontas com valores constantes que o schema entrega ao zod (achadas pelo texto exato).
 */
export function issueCoding(
  issue: z.core.$ZodIssue,
  known: readonly SpecMsg[],
): IssueCoding | undefined {
  const found = explicitCoding(issue) ?? knownCoding(issue, known) ?? textCoding(issue);
  if (found !== undefined) return found;
  if (!ZOD_CODES.has(issue.code) || !ZOD_DEFAULT.test(issue.message)) return undefined;
  const params = zodParams(issue);
  const code = `spec.zod.${issue.code}` as ModelMessageTemplateCode;
  return Object.keys(params).length > 0 ? { code, params } : { code };
}

/**
 * Reemite no `ctx` um problema de outro schema, sob `prefix`, com o mesmo código. Com
 * `localizeKeys`, a propriedade a mais (`unrecognized_keys`) sai na mensagem própria da
 * especialização, no molde dos outros erros; sem ele, o texto do zod segue como veio.
 */
export function forwardIssue(
  ctx: z.RefinementCtx,
  issue: z.core.$ZodIssue,
  prefix: (string | number)[],
  localizeKeys: boolean,
  known: readonly SpecMsg[],
): void {
  const path = [...prefix, ...issue.path] as (string | number)[];
  if (localizeKeys && issue.code === 'unrecognized_keys') {
    addSpecIssue(ctx, path, specMsg('spec.unknownKeys', { keys: quoted(issue.keys) }));
    return;
  }
  const coding = issueCoding(issue, known);
  ctx.addIssue({
    code: 'custom',
    path,
    message: issue.message,
    ...(coding === undefined
      ? {}
      : { params: { messageCode: coding.code, ...coding.params } }),
  });
}

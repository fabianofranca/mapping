import type { z } from 'zod';
import {
  fillTemplate,
  MODEL_MESSAGE_TEMPLATES,
  type ModelMessageTemplateCode,
} from './messages';
import { specCodeForText, type SpecMessageCode } from './messages/textLookup';
import type { PackagePathError } from './packagePaths';

// Codes of the specialization's problems (`parseSpec`): each zod problem comes out with the code and
// the parameters of the `spec` catalog (`src/model/messages/spec.ts`), in this order: the
// `params.messageCode` set in `addIssue`; the exact text of a ready-made message that zod receives
// (`known`: `SpecMsg` with constant values); the exact text of a model without parameters; the pattern
// of `SPEC_PATTERN_CODES` (the text zod builds with the received value); zod's default text
// (`spec.zod.<zod code>`). No DOM.

export type MessageParams = Readonly<Record<string, string | number>>;

export interface IssueCoding {
  readonly code: ModelMessageTemplateCode;
  readonly params?: MessageParams;
}

/** A `spec` catalog message already filled in, for `addIssue`. */
export interface SpecMsg {
  readonly code: SpecMessageCode;
  readonly params: MessageParams;
  readonly text: string;
}

export function specMsg(code: SpecMessageCode, params: MessageParams = {}): SpecMsg {
  return { code, params, text: fillTemplate(MODEL_MESSAGE_TEMPLATES[code], params) };
}

/** The package path error as a message with a code (the catalog's text, without duplicating it). */
export function packagePathMsg(error: PackagePathError): SpecMsg {
  return error.kind === 'path'
    ? specMsg('spec.packagePathInvalid')
    : specMsg('spec.invalidExtension', { exts: error.exts.join(', ') });
}

/**
 * The `parsePath` error (fixed text from the path reader, which returns only text) as the message with
 * the variant's code. Serves `spec.ts` (`fieldPathProblem`) and `components/origin.ts`
 * (`checkPath`); it lives here because `origin.ts` cannot import `spec.ts` (cycle).
 */
export function pathErrorMsg(path: string, error: string): SpecMsg {
  const index = /^índice inválido: \[(.*)\]$/s.exec(error)?.[1];
  if (index !== undefined) return specMsg('spec.fieldPathBadIndex', { path, index });
  const char = /^caractere inesperado: (.*)$/s.exec(error)?.[1];
  if (char !== undefined) return specMsg('spec.fieldPathBadChar', { path, char });
  return specMsg(
    error === 'faltou "]"'
      ? 'spec.fieldPathMissingBracket'
      : 'spec.fieldPathEmptySegment',
    { path },
  );
}

const quoted = (keys: readonly string[]): string => keys.map((k) => `"${k}"`).join(', ');

/** Re-emits on `ctx`: the fixed text as it came, or the catalog message with the `messageCode`. */
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

/** The type name of the received value (`string`, `number`, `boolean`, `object`, `array`, `null`, `undefined`). */
export function receivedName(input: unknown): string {
  if (input === null) return 'null';
  if (Array.isArray(input)) return 'array';
  return typeof input;
}

const ZOD_DEFAULT = /^(Invalid |Too (small|big): |Unrecognized keys?: )/;

/** The parameters of the default text of each zod code (the `input` comes from `reportInput`). */
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

/** The ready-made message (`known`) whose text is the problem's; the parameters are its own. */
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

/** The code found by the text: the exact one of the models without parameters, or the pattern of the three enums. */
function textCoding(issue: z.core.$ZodIssue): IssueCoding | undefined {
  const hit = specCodeForText(issue.message);
  if (hit === undefined) return undefined;
  return hit.params === undefined
    ? { code: hit.code }
    : { code: hit.code, params: hit.params };
}

/**
 * The code and parameters of the zod problem; `undefined` stays as raw text. `known` are the
 * ready-made messages with constant values that the schema hands to zod (found by exact text).
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
 * Re-emits on `ctx` a problem of another schema, under `prefix`, with the same code. With
 * `localizeKeys`, the extra property (`unrecognized_keys`) comes out in the specialization's own
 * message, in the mold of the other errors; without it, zod's text stays as it came.
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

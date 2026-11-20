import type {
  SignatureLiteral,
  SignatureValue,
  SignatureValueKind,
} from '../../src/model/signatures';
import type { EnumTable } from '../paramList';

// The `kind` of a Swift `value` by type name, and the `default` when the default is a
// representable literal (`true`, `3`, `0.5`, `"OK"`, `CGFloat(8)`, `.filled`).

const KIND_BY_TYPE: Readonly<Record<string, SignatureValueKind>> = {
  String: 'text',
  LocalizedStringKey: 'text',
  AttributedString: 'text',
  Bool: 'boolean',
  Int: 'integer',
  Int8: 'integer',
  Int16: 'integer',
  Int32: 'integer',
  Int64: 'integer',
  UInt: 'integer',
  UInt8: 'integer',
  UInt16: 'integer',
  UInt32: 'integer',
  UInt64: 'integer',
  Double: 'number',
  Float: 'number',
  CGFloat: 'dimension',
  Color: 'color',
};

const INTEGER = /^-?\d[\d_]*$/;
const DECIMAL = /^-?\d[\d_]*(?:\.\d[\d_]*)?(?:[eE][+-]?\d+)?$/;
const SIMPLE_STRING = /^"([^"\\]*)"$/;
const RAW_OPEN = /^(#+)"/;
const NUMBER_CALL = /^(?:CGFloat|Double|Float)\((-?\d[\d_]*(?:\.\d[\d_]*)?)\)$/;
const SHORT_CASE = /^\.(\w+)$/;
const QUALIFIED_CASE = /^(?:\w+\.)*(\w+)\.(\w+)$/;

/**
 * The content of a raw string `#"…"#` (any number of `#`) written on a single line, as it is, with no
 * escape or interpolation (`\#` followed by anything decodes to something else); `undefined` for any other
 * text (multi-line, with an escape, an expression).
 */
export function rawStringContent(text: string): string | undefined {
  const hashes = RAW_OPEN.exec(text)?.[1];
  if (hashes === undefined || text.startsWith(`${hashes}"""`)) return undefined;
  const close = `"${hashes}`;
  if (text.length < hashes.length + 1 + close.length || !text.endsWith(close))
    return undefined;
  const content = text.slice(hashes.length + 1, text.length - close.length);
  const opaque = content.includes('\n') || content.includes(close);
  return opaque || content.includes(`\\${hashes}`) ? undefined : content;
}

const toNumber = (text: string): number | undefined => {
  const value = Number(text.replace(/_/g, ''));
  return Number.isFinite(value) ? value : undefined;
};

function decimal(text: string): number | undefined {
  const call = NUMBER_CALL.exec(text);
  if (call !== null) return toNumber(call[1]!);
  return DECIMAL.test(text) ? toNumber(text) : undefined;
}

type LiteralParser = (text: string) => SignatureLiteral | undefined;

const PARSERS: Readonly<Partial<Record<SignatureValueKind, LiteralParser>>> = {
  boolean: (text) => (text === 'true' || text === 'false' ? text === 'true' : undefined),
  text: (text) => SIMPLE_STRING.exec(text)?.[1] ?? rawStringContent(text),
  integer: (text) => (INTEGER.test(text) ? toNumber(text) : undefined),
  number: decimal,
  dimension: decimal,
};

/** The name of a case without the backticks (`` `default` `` → `default`). */
export const caseName = (text: string): string => text.replace(/^`|`$/g, '');

/** The option the default (`.a`, `Type.a`, `Module.Type.a`) refers to, if it exists in the enum. */
function enumCase(
  text: string,
  name: string,
  options: readonly string[],
): string | undefined {
  const short = SHORT_CASE.exec(text);
  const qualified = QUALIFIED_CASE.exec(text);
  const found =
    short !== null ? short[1] : qualified?.[1] === name ? qualified[2] : undefined;
  const option = found === undefined ? undefined : caseName(found);
  return option !== undefined && options.includes(option) ? option : undefined;
}

/** The `value` of a parameter with role `value`, by type name (already without `?` or qualification). */
export function valueFor(
  typeName: string,
  defaultText: string | undefined,
  enums: EnumTable,
): SignatureValue {
  const options = enums.get(typeName);
  if (options !== undefined) {
    const literal =
      defaultText === undefined ? undefined : enumCase(defaultText, typeName, options);
    return literal === undefined
      ? { kind: 'enum', options }
      : { kind: 'enum', default: literal, options };
  }
  const kind = KIND_BY_TYPE[typeName];
  if (kind === undefined) return { kind: 'opaque' };
  const literal = defaultText === undefined ? undefined : PARSERS[kind]?.(defaultText);
  return literal === undefined ? { kind } : { kind, default: literal };
}

/** The type of a property with no written type (`var count = 0`), from the literal or the initializer; `_` if it cannot be told. */
export function inferType(defaultText: string | undefined): string {
  if (defaultText === undefined) return '_';
  if (defaultText === 'true' || defaultText === 'false') return 'Bool';
  if (INTEGER.test(defaultText)) return 'Int';
  if (DECIMAL.test(defaultText)) return 'Double';
  if (SIMPLE_STRING.test(defaultText) || rawStringContent(defaultText) !== undefined)
    return 'String';
  return /^([A-Z]\w*)\(/.exec(defaultText)?.[1] ?? '_';
}

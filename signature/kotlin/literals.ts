import type {
  SignatureLiteral,
  SignatureValue,
  SignatureValueKind,
} from '../../src/model/signatures';

// O `kind` de um `value` pelo nome do tipo e o `default` quando o padrão é um literal representável.

const KIND_BY_TYPE: Readonly<Record<string, SignatureValueKind>> = {
  String: 'text',
  AnnotatedString: 'text',
  Boolean: 'boolean',
  Int: 'integer',
  Long: 'integer',
  Short: 'integer',
  Byte: 'integer',
  Float: 'number',
  Double: 'number',
  Dp: 'dimension',
  Color: 'color',
};

const INTEGER = /^-?\d[\d_]*[lL]?$/;
const DECIMAL = /^-?\d[\d_]*(?:\.\d[\d_]*)?(?:[eE][+-]?\d+)?[fF]?$/;
const SIMPLE_STRING = /^"([^"\\$]*)"$/;
const DIMENSION = /^(-?\d[\d_]*(?:\.\d[\d_]*)?)\.dp$/;
const ENUM_CONSTANT = /^(\w+)\.(\w+)$/;

const toNumber = (text: string): number | undefined => {
  const value = Number(text.replace(/[_fFlL]/g, ''));
  return Number.isFinite(value) ? value : undefined;
};

export interface EnumInfo {
  readonly name: string;
  readonly options: readonly string[];
}

type LiteralParser = (text: string) => SignatureLiteral | undefined;

const PARSERS: Readonly<Partial<Record<SignatureValueKind, LiteralParser>>> = {
  boolean: (text) => (text === 'true' || text === 'false' ? text === 'true' : undefined),
  text: (text) => SIMPLE_STRING.exec(text)?.[1],
  integer: (text) => (INTEGER.test(text) ? toNumber(text) : undefined),
  number: (text) => (DECIMAL.test(text) ? toNumber(text) : undefined),
  dimension: (text) => {
    const dimension = DIMENSION.exec(text);
    return dimension === null ? undefined : toNumber(dimension[1]!);
  },
};

/** O padrão como literal para o kind dado, ou `undefined` quando é uma expressão. */
export function literalFor(
  kind: SignatureValueKind,
  text: string | undefined,
  enumInfo?: EnumInfo,
): SignatureLiteral | undefined {
  if (text === undefined) return undefined;
  if (kind === 'enum') return enumConstant(text, enumInfo);
  return PARSERS[kind]?.(text);
}

function enumConstant(text: string, info: EnumInfo | undefined): string | undefined {
  const match = ENUM_CONSTANT.exec(text);
  if (match === null || info === undefined || match[1] !== info.name) return undefined;
  return info.options.includes(match[2]!) ? match[2] : undefined;
}

/** O `value` de um parâmetro de role `value`, pelo nome do tipo (já sem `?` nem qualificação). */
export function valueFor(
  typeName: string,
  defaultText: string | undefined,
  enums: ReadonlyMap<string, readonly string[]>,
): SignatureValue {
  const options = enums.get(typeName);
  if (options !== undefined) {
    const literal = literalFor('enum', defaultText, { name: typeName, options });
    return literal === undefined
      ? { kind: 'enum', options }
      : { kind: 'enum', default: literal, options };
  }
  const kind = KIND_BY_TYPE[typeName];
  if (kind === undefined) return { kind: 'opaque' };
  const literal = literalFor(kind, defaultText);
  return literal === undefined ? { kind } : { kind, default: literal };
}

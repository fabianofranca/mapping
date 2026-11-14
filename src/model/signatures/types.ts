// Signature sheet `mapping-signature` (formatVersion 1; stage #1079, decision 4): the
// signature of a component (parameters of a `@Composable` function, the `init` of a SwiftUI
// view, the properties of a Figma component) in a neutral form. Types only: no browser,
// reusable by the MCP server and by the extractor.

export const SIGNATURE_FORMAT = 'mapping-signature';
export const SIGNATURE_FORMAT_VERSION = 1;

/** What the parameter is for the screen: data (`value`), content, event, modifier, state or other. */
export const SIGNATURE_ROLES = [
  'value',
  'slot',
  'callback',
  'modifier',
  'state',
  'other',
] as const;
export type SignatureRole = (typeof SIGNATURE_ROLES)[number];

/** The nature of a `value`; `dimension` is in component units (1 dp, 1 pt or 1 CSS px at 1x). */
export const SIGNATURE_VALUE_KINDS = [
  'text',
  'boolean',
  'number',
  'integer',
  'dimension',
  'enum',
  'color',
  'opaque',
] as const;
export type SignatureValueKind = (typeof SIGNATURE_VALUE_KINDS)[number];

/** A literal default that can be represented (text, number or boolean). */
export type SignatureLiteral = string | number | boolean;

export interface SignatureValue {
  readonly kind: SignatureValueKind;
  /** Only when the default is a representable literal. */
  readonly default?: SignatureLiteral;
  /** `enum`: the constants, as written in the source. */
  readonly options?: readonly string[];
}

export interface SignatureParam {
  readonly name: string;
  /** Swift's external label; `_` is positional. */
  readonly label?: string;
  /** The parameter's id in the source (the `#<id>` suffix of the name in Figma). */
  readonly id?: string;
  readonly role: SignatureRole;
  /** The type's text in the source, normalized only for whitespace. */
  readonly type: string;
  /** The default's text in the source. */
  readonly default?: string;
  readonly required?: boolean;
  /** Only for `role: value`. */
  readonly value?: SignatureValue;
  /** The default's factory (`ButtonDefaults.buttonColors()`), a single level deep. */
  readonly factory?: SignatureFactory;
}

export interface SignatureFactory {
  /** The factory's symbol (`androidx.compose.material3.ButtonDefaults.buttonColors`). */
  readonly call: string;
  /** The factory's parameters; none of them has a `factory`. */
  readonly params: readonly SignatureParam[];
}

export interface CodeSignatureSource {
  readonly kind: 'code';
  readonly platform: string;
  readonly language: string;
  /** What is called (`androidx.compose.material3.Button`). */
  readonly symbol: string;
  /** The file that defines it, relative to the repository root. */
  readonly path: string;
  /** The commit, tag or branch read. */
  readonly ref?: string;
  /** `mapping-signature/<reader>@<version>` or `agent`. */
  readonly extractor: string;
  /** The overload chosen (Kotlin, `--overload`). */
  readonly overload?: number;
  /** The `init` chosen (Swift, `--init`). */
  readonly init?: number;
}

export interface DesignSignatureSource {
  readonly kind: 'design';
  readonly system: string;
  readonly id: string;
  readonly name: string;
  readonly extractor: string;
}

export type SignatureSource = CodeSignatureSource | DesignSignatureSource;

export interface Signature {
  readonly format: typeof SIGNATURE_FORMAT;
  readonly formatVersion: typeof SIGNATURE_FORMAT_VERSION;
  readonly source: SignatureSource;
  /** In the source's order. */
  readonly params: readonly SignatureParam[];
  /** Documentation per parameter name (KDoc `@param`, `///`, Figma's `description`). */
  readonly doc?: Readonly<Record<string, string>>;
}

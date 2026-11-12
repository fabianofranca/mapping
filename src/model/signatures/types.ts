// Ficha de assinatura `mapping-signature` (formatVersion 1; etapa #1079, decisão 4): a
// assinatura de um componente (parâmetros de uma função `@Composable`, o `init` de uma view
// SwiftUI, as propriedades de um componente do Figma) numa forma neutra. Só tipos: sem
// navegador, reutilizável pelo servidor MCP e pelo extrator.

export const SIGNATURE_FORMAT = 'mapping-signature';
export const SIGNATURE_FORMAT_VERSION = 1;

/** O que o parâmetro é para a tela: dado (`value`), conteúdo, evento, modificador, estado ou outro. */
export const SIGNATURE_ROLES = [
  'value',
  'slot',
  'callback',
  'modifier',
  'state',
  'other',
] as const;
export type SignatureRole = (typeof SIGNATURE_ROLES)[number];

/** A natureza de um `value`; `dimension` é em unidades do componente (1 dp, 1 pt ou 1 px CSS a 1x). */
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

/** Padrão literal que dá para representar (texto, número ou booleano). */
export type SignatureLiteral = string | number | boolean;

export interface SignatureValue {
  readonly kind: SignatureValueKind;
  /** Só quando o padrão é um literal representável. */
  readonly default?: SignatureLiteral;
  /** `enum`: as constantes, no texto da fonte. */
  readonly options?: readonly string[];
}

export interface SignatureParam {
  readonly name: string;
  /** Rótulo externo do Swift; `_` é posicional. */
  readonly label?: string;
  /** Id do parâmetro na fonte (o sufixo `#<id>` do nome no Figma). */
  readonly id?: string;
  readonly role: SignatureRole;
  /** O texto do tipo na fonte, normalizado só nos espaços. */
  readonly type: string;
  /** O texto do padrão na fonte. */
  readonly default?: string;
  readonly required?: boolean;
  /** Só em `role: value`. */
  readonly value?: SignatureValue;
  /** A fábrica do padrão (`ButtonDefaults.buttonColors()`), num nível só. */
  readonly factory?: SignatureFactory;
}

export interface SignatureFactory {
  /** O símbolo da fábrica (`androidx.compose.material3.ButtonDefaults.buttonColors`). */
  readonly call: string;
  /** Os parâmetros da fábrica; nenhum deles tem `factory`. */
  readonly params: readonly SignatureParam[];
}

export interface CodeSignatureSource {
  readonly kind: 'code';
  readonly platform: string;
  readonly language: string;
  /** O que se chama (`androidx.compose.material3.Button`). */
  readonly symbol: string;
  /** Arquivo que o define, relativo à raiz do repositório. */
  readonly path: string;
  /** Commit, tag ou branch lido. */
  readonly ref?: string;
  /** `mapping-signature/<leitor>@<versão>` ou `agent`. */
  readonly extractor: string;
  /** Sobrecarga escolhida (Kotlin, `--overload`). */
  readonly overload?: number;
  /** `init` escolhido (Swift, `--init`). */
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
  /** Na ordem da fonte. */
  readonly params: readonly SignatureParam[];
  /** Documentação por nome de parâmetro (KDoc `@param`, `///`, `description` do Figma). */
  readonly doc?: Readonly<Record<string, string>>;
}

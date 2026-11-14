// The library and the signatures of the importer tests (stage #1079, S2).
import { parseSignature, type Signature } from '../../../src/model/signatures';
import { parseSpec, type Spec } from '../../../src/model/spec';
import type { Json } from './fixtures';

export const BUTTON_PATH = 'compose/Button.kt';
export const BUTTON_SYMBOL = 'androidx.compose.material3.Button';

/** The field models of `fieldModels.compose` of the test library. */
const COMPOSE_MODELS: Json = {
  Color: { like: 'surface.color' },
  Dp: { type: 'number', format: '{value}.dp' },
  PaddingValues: {
    expand: { call: 'PaddingValues', params: { horizontal: 'Dp', vertical: 'Dp' } },
  },
  '@Composable () -> Unit': { type: 'string', format: '{ Text({value}) }' },
  Modifier: { ignore: true },
};

const SURFACE: Json = {
  id: 'surface',
  name: 'Surface',
  fields: [{ key: 'color', type: 'enum', options: ['primary', 'secondary'] }],
  code: {
    compose: {
      symbol: 'androidx.compose.material3.Surface',
      values: {
        color: {
          primary: 'MaterialTheme.colorScheme.primary',
          secondary: 'MaterialTheme.colorScheme.secondary',
        },
      },
    },
  },
};

/** A test library with `surface` (the roles color) and an empty `button` (new type). */
export function librarySpec(edit?: (s: Json) => void): Spec {
  const raw: Json = {
    format: 'mapping-spec',
    formatVersion: 16,
    id: 'lib',
    name: 'Lib',
    version: 1,
    platforms: [
      { id: 'compose', name: 'Compose', language: 'kotlin' },
      { id: 'swiftui', name: 'SwiftUI', language: 'swift' },
    ],
    fieldModels: { compose: COMPOSE_MODELS },
    layers: [
      {
        id: 'ui',
        name: 'UI',
        color: '#336699',
        annotationTypes: [SURFACE, { id: 'button', name: 'Button', fields: [] }],
      },
    ],
  };
  edit?.(raw);
  const parsed = parseSpec(structuredClone(raw));
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.errors));
  return parsed.spec;
}

export const buttonOf = (raw: Json): Json =>
  raw.layers[0].annotationTypes.find((t: Json) => t.id === 'button');

const value = (kind: string, extra: Json = {}): Json => ({ kind, ...extra });

/** A Compose signature of `Button` with the given parameters. */
export function composeSignature(params: Json[], edit?: (s: Json) => void): Signature {
  const raw: Json = {
    format: 'mapping-signature',
    formatVersion: 1,
    source: {
      kind: 'code',
      platform: 'compose',
      language: 'kotlin',
      symbol: BUTTON_SYMBOL,
      path: BUTTON_PATH,
      extractor: 'mapping-signature/kotlin@1',
    },
    params,
  };
  edit?.(raw);
  const parsed = parseSignature(raw);
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.issues));
  return parsed.signature;
}

export const text = (name: string, extra: Json = {}): Json => ({
  name,
  role: 'value',
  type: 'String',
  value: value('text'),
  ...extra,
});
export const dimension = (name: string, extra: Json = {}): Json => ({
  name,
  role: 'value',
  type: 'Dp',
  value: value('dimension'),
  ...extra,
});
export const bool = (name: string, extra: Json = {}): Json => ({
  name,
  role: 'value',
  type: 'Boolean',
  default: 'true',
  value: value('boolean', { default: true }),
  ...extra,
});
export const enumParam = (name: string, options: string[], extra: Json = {}): Json => ({
  name,
  role: 'value',
  type: 'Size',
  value: value('enum', { options }),
  ...extra,
});
export const colorParam = (name: string, extra: Json = {}): Json => ({
  name,
  role: 'value',
  type: 'Color',
  value: value('color'),
  ...extra,
});
export const callback = (name: string): Json => ({
  name,
  role: 'callback',
  type: '() -> Unit',
  required: true,
});
export const factory = (
  name: string,
  call: string,
  params: Json[],
  extra: Json = {},
) => ({
  name,
  role: 'value',
  type: `${name}Type`,
  factory: { call, params },
  ...extra,
});

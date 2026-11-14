import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  REMOVED_FIELD_TYPE,
  parseSpec,
  parseSpecText,
  removedFieldKeys,
  type SpecParseResult,
} from '../../src/model';

const read = (path: string): string => readFileSync(path, 'utf8');
const sdui = read('examples/specs/sdui.json');
// The SDUI from before `repo` (formatVersion 2): base of the platform and code cases.
const sduiV2 = read('tests/fixtures/sdui-v2.json');
// pt-BR kept: file names of shared fixtures (examples/specs/, tests/fixtures/specs/), outside this phase
const dataModel = read('examples/specs/modelo-de-dados.json');
const library = read('tests/fixtures/specs/biblioteca.json');
const jsonSchema = JSON.parse(read('docs/spec.schema.json')) as Record<string, unknown>;
const jsonValidator = z.fromJSONSchema(jsonSchema as never);

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Copy of the SDUI for the test to change. */
function base(): Json {
  return JSON.parse(sduiV2) as Json;
}

function errorsOf(result: SpecParseResult): string[] {
  if (result.ok) throw new Error('should have failed');
  return result.errors;
}

describe('specialization examples', () => {
  it.each([
    ['sdui', sdui],
    ['modelo-de-dados', dataModel],
    ['biblioteca', library],
  ])('%s validates in zod and in the JSON Schema', (_name, text) => {
    const result = parseSpecText(text);
    expect(result.ok).toBe(true);
    expect(jsonValidator.safeParse(JSON.parse(text)).success).toBe(true);
  });

  it('reads the expected fields of the SDUI (formatVersion 12, with the repo of each platform)', () => {
    const result = parseSpecText(sdui);
    if (!result.ok) throw new Error('failed');
    const { spec } = result;
    expect(spec.formatVersion).toBe(12);
    expect(spec.version).toBe(4);
    // pt-BR kept: shared fixture data (examples/specs/sdui.json, outside this phase)
    expect(spec.layers.map((l) => l.id)).toEqual(['componentes', 'eventos', 'telas']);
    expect(spec.layers[1]?.annotationTypes[0]?.requiresOwner).toBe(true);
    const repo = (name: string) => ({
      url: `https://github.com/org/${name}`,
      urlTemplate: `https://github.com/org/${name}/blob/v3/{path}`,
      ref: 'v3',
    });
    expect(spec.platforms).toEqual([
      { id: 'android', name: 'Android', language: 'kotlin', repo: repo('app-android') },
      { id: 'ios', name: 'iOS', language: 'swift', repo: repo('app-ios') },
      { id: 'bff', name: 'BFF', language: 'kotlin', repo: repo('bff') },
    ]);
  });

  it('the SDUI carries `code` for the three platforms in every component and event type', () => {
    const result = parseSpecText(sdui);
    if (!result.ok) throw new Error('failed');
    const types = result.spec.layers
      .filter((l) => l.id !== 'telas')
      .flatMap((l) => l.annotationTypes);
    expect(types.map((t) => t.id)).toEqual([
      'button',
      'input',
      'text',
      'image',
      'action',
      'feedback',
      'validation',
    ]);
    for (const type of types) {
      expect(Object.keys(type.code ?? {}), type.id).toEqual(['android', 'ios', 'bff']);
    }
    const button = types[0]?.code?.android;
    expect(button?.symbol).toBe('com.app.ds.DSButton');
    expect(button?.path).toBe('app/src/main/java/com/app/ds/DSButton.kt');
    // pt-BR kept: shared fixture data (examples/specs/sdui.json, outside this phase)
    expect(button?.params).toMatchObject({ texto: 'text', estilo: 'style' });
    expect(button?.values?.estilo?.primary).toBe('ButtonStyle.Primary');
    // The bff points to the Kotlin function that generates the component node, not to the node.
    const bff = types[0]?.code?.bff;
    expect(bff?.symbol).toBe('com.app.bff.sdui.button');
    expect(bff?.path).toBe('src/main/kotlin/com/app/bff/sdui/Components.kt');
    for (const type of types) {
      const entry = type.code?.bff;
      expect(entry?.symbol, type.id).toBe(`com.app.bff.sdui.${type.id}`);
      expect(entry?.path, type.id).toMatch(
        /^src\/main\/kotlin\/com\/app\/bff\/sdui\/\w+\.kt$/,
      );
    }
  });

  it('the Telas layer has the Screen, with only name and route', () => {
    const result = parseSpecText(sdui);
    if (!result.ok) throw new Error('failed');
    const layer = result.spec.layers[2];
    // pt-BR kept: shared fixture data (examples/specs/sdui.json, outside this phase)
    expect(layer?.name).toBe('Telas');
    const screen = layer?.annotationTypes[0];
    expect(screen?.name).toBe('Screen');
    expect(screen?.labelField).toBe('nome');
    expect(screen?.fields.map((f) => [f.key, f.type])).toEqual([
      ['nome', 'string'],
      ['rota', 'string'],
    ]);
    expect(screen?.code).toBeUndefined();
    expect(result.ignored).toEqual([]);
  });

  it('the data model stays at formatVersion 1, without platforms', () => {
    const result = parseSpecText(dataModel);
    if (!result.ok) throw new Error('failed');
    expect(result.spec.formatVersion).toBe(1);
    expect(result.spec.platforms).toBeUndefined();
  });
});

/** Each case: the mutation and the path (and excerpt) expected in the message. */
const semantic: [string, (s: Json) => void, string][] = [
  ['wrong format', (s) => (s.format = 'x'), 'format:'],
  ['wrong formatVersion', (s) => (s.formatVersion = 17), 'formatVersion:'],
  ['missing id', (s) => delete s.id, 'id:'],
  ['missing name', (s) => delete s.name, 'name:'],
  ['version zero', (s) => (s.version = 0), 'version:'],
  ['fractional version', (s) => (s.version = 1.5), 'version:'],
  ['repeated layer id', (s) => (s.layers[1].id = 'componentes'), 'layers[1].id:'],
  [
    'repeated type id across layers',
    (s) => (s.layers[1].annotationTypes[0].id = 'button'),
    'layers[1].annotationTypes[0].id:',
  ],
  [
    'repeated key in the type',
    (s) => (s.layers[0].annotationTypes[0].fields[1].key = 'id'),
    'layers[0].annotationTypes[0].fields[1].key:',
  ],
  [
    'key starting with _',
    (s) => (s.layers[0].annotationTypes[0].fields[0].key = '_id'),
    'layers[0].annotationTypes[0].fields[0].key:',
  ],
  [
    'key with a space',
    (s) => (s.layers[0].annotationTypes[0].fields[0].key = 'a b'),
    'layers[0].annotationTypes[0].fields[0].key:',
  ],
  [
    'repeated key in a column',
    (s) => (s.layers[1].annotationTypes[0].fields[2].columns[1].key = 'nome'),
    'layers[1].annotationTypes[0].fields[2].columns[1].key:',
  ],
  [
    'nonexistent allowedChildren',
    (s) => (s.layers[0].annotationTypes[0].allowedChildren = ['nothing']),
    'layers[0].annotationTypes[0].allowedChildren[0]:',
  ],
  [
    'allowedChildren in the same layer',
    (s) => (s.layers[0].annotationTypes[0].allowedChildren = ['input']),
    'layers[0].annotationTypes[0].allowedChildren[0]:',
  ],
  [
    'requiresOwner without a possible owner',
    (s) => {
      s.layers[0].annotationTypes[0].allowedChildren = ['onHold'];
      s.layers[0].annotationTypes[3].allowedChildren = [];
    },
    'layers[1].annotationTypes[0].requiresOwner:',
  ],
  [
    'invalid field type',
    (s) => (s.layers[0].annotationTypes[1].fields[2].type = 'bogus'),
    'layers[0].annotationTypes[1].fields[2].type: "bogus" is invalid',
  ],
  [
    'incompatible default (number)',
    (s) => (s.layers[1].annotationTypes[1].fields[1].default = 'x'),
    'layers[1].annotationTypes[1].fields[1].default:',
  ],
  [
    'default outside the options',
    (s) => (s.layers[0].annotationTypes[0].fields[2].default = 'pink'),
    'layers[0].annotationTypes[0].fields[2].default:',
  ],
  [
    'default on ref',
    (s) => (s.layers[0].annotationTypes[1].fields[5].default = {}),
    'layers[0].annotationTypes[1].fields[5].default:',
  ],
  [
    'enum without options',
    (s) => delete s.layers[0].annotationTypes[0].fields[2].options,
    'layers[0].annotationTypes[0].fields[2].options:',
  ],
  [
    'enum with repeated options',
    (s) => (s.layers[0].annotationTypes[0].fields[2].options = ['a', 'a']),
    'layers[0].annotationTypes[0].fields[2].options:',
  ],
  [
    'column ref without accepts',
    (s) =>
      (s.layers[1].annotationTypes[0].fields[2].columns[0] = {
        key: 'r',
        type: 'ref',
      }),
    'layers[1].annotationTypes[0].fields[2].columns[0].accepts:',
  ],
  [
    'column ref in formatVersion 2 (only exists from 7)',
    (s) =>
      (s.layers[1].annotationTypes[0].fields[2].columns[0] = {
        key: 'r',
        type: 'ref',
        accepts: { free: true },
      }),
    'layers[1].annotationTypes[0].fields[2].columns[0].type: only allowed with formatVersion 7',
  ],
  [
    'table inside table',
    (s) =>
      (s.layers[1].annotationTypes[0].fields[2].columns[0] = {
        key: 't',
        type: 'table',
        columns: [],
      }),
    'layers[1].annotationTypes[0].fields[2].columns[0].type:',
  ],
  [
    'table without columns',
    (s) => delete s.layers[1].annotationTypes[0].fields[2].columns,
    'layers[1].annotationTypes[0].fields[2].columns:',
  ],
  [
    'table with tags without rowLabel',
    (s) => (s.layers[1].annotationTypes[0].fields[2].tags = ['data-field']),
    'layers[1].annotationTypes[0].fields[2].rowLabel:',
  ],
  [
    'rowLabel on a non-string column',
    (s) => {
      const f = s.layers[1].annotationTypes[0].fields[2];
      f.tags = ['data-field'];
      f.rowLabel = 'nonexistent';
    },
    'layers[1].annotationTypes[0].fields[2].rowLabel:',
  ],
  [
    'nonexistent labelField',
    (s) => (s.layers[0].annotationTypes[0].labelField = 'nothing'),
    'layers[0].annotationTypes[0].labelField:',
  ],
  [
    'labelField of a non-string field',
    (s) => (s.layers[0].annotationTypes[1].labelField = 'maxLength'),
    'layers[0].annotationTypes[1].labelField:',
  ],
  [
    'empty accepts',
    (s) => (s.layers[0].annotationTypes[1].fields[5].accepts = { tags: [] }),
    'layers[0].annotationTypes[1].fields[5].accepts:',
  ],
  [
    'ref without accepts',
    (s) => delete s.layers[0].annotationTypes[1].fields[5].accepts,
    'layers[0].annotationTypes[1].fields[5].accepts:',
  ],
  [
    'tag with an invalid format',
    (s) => (s.layers[0].annotationTypes[1].fields[5].accepts.tags = ['Data Field']),
    'layers[0].annotationTypes[1].fields[5].accepts.tags[0]:',
  ],
  ['invalid color', (s) => (s.layers[0].color = 'blue'), 'layers[0].color:'],
  [
    'unknown property',
    (s) => (s.layers[0].annotationTypes[0].extra = 1),
    'layers[0].annotationTypes[0]:',
  ],
];

describe('format validation (13.2)', () => {
  it.each(semantic)('rejects: %s', (_name, mutate, expected) => {
    const spec = base();
    mutate(spec);
    const errors = errorsOf(parseSpec(spec));
    expect(errors.some((e) => e.startsWith(expected))).toBe(true);
  });

  it('the type error suggests the valid values', () => {
    const spec = base();
    spec.layers[0].annotationTypes[1].fields[2].type = 'bogus';
    const error = errorsOf(parseSpec(spec))[0];
    expect(error).toContain('"bogus" is invalid; use');
    expect(error).toContain('"table" or "ref"');
    // The type removed in stage 9 is not suggested.
    expect(error).not.toContain('codeRef');
  });

  it('malformed JSON becomes a readable error', () => {
    expect(errorsOf(parseSpecText('{'))[0]).toMatch(/^invalid JSON/);
  });

  it('accepts ref with free without tags and a valid date default', () => {
    const spec = base();
    spec.layers[0].annotationTypes[1].fields[5].accepts = { free: true };
    spec.layers[0].annotationTypes[0].fields.push({
      key: 'when',
      type: 'date',
      default: '2024-02-29',
    });
    expect(parseSpec(spec).ok).toBe(true);
  });

  it('rejeita nonexistent date no default', () => {
    const spec = base();
    spec.layers[0].annotationTypes[0].fields.push({
      key: 'when',
      type: 'date',
      default: '2023-02-30',
    });
    expect(parseSpec(spec).ok).toBe(false);
  });
});

/** Purely structural errors: the JSON Schema must reject them too. */
const structural: [string, (s: Json) => void][] = [
  ['wrong format', (s) => (s.format = 'x')],
  ['wrong formatVersion', (s) => (s.formatVersion = 17)],
  ['missing id', (s) => delete s.id],
  ['version zero', (s) => (s.version = 0)],
  ['key with a space', (s) => (s.layers[0].annotationTypes[0].fields[0].key = 'a b')],
  ['key starting with _', (s) => (s.layers[0].annotationTypes[0].fields[0].key = '_id')],
  [
    'invalid field type',
    (s) => (s.layers[0].annotationTypes[1].fields[2].type = 'bogus'),
  ],
  ['enum without options', (s) => delete s.layers[0].annotationTypes[0].fields[2].options],
  [
    'column ref without accepts',
    (s) =>
      (s.layers[1].annotationTypes[0].fields[2].columns[0] = {
        key: 'r',
        type: 'ref',
      }),
  ],
  ['table without columns', (s) => delete s.layers[1].annotationTypes[0].fields[2].columns],
  [
    'empty accepts',
    (s) => (s.layers[0].annotationTypes[1].fields[5].accepts = { tags: [] }),
  ],
  ['ref without accepts', (s) => delete s.layers[0].annotationTypes[1].fields[5].accepts],
  [
    'invalid tag',
    (s) => (s.layers[0].annotationTypes[1].fields[5].accepts.tags = ['Data Field']),
  ],
  ['invalid color', (s) => (s.layers[0].color = 'blue')],
  ['unknown property', (s) => (s.layers[0].annotationTypes[0].extra = 1)],
];

describe('product name (format)', () => {
  it('the examples use `mapping-spec`', () => {
    expect(base().format).toBe('mapping-spec');
  });

  it('the import still accepts `mapeador-spec`, in zod and in the JSON Schema', () => {
    const spec = { ...base(), format: 'mapeador-spec' };
    expect(parseSpec(spec).ok).toBe(true);
    expect(jsonValidator.safeParse(spec).success).toBe(true);
  });

  it('rejects another `format`', () => {
    const spec = { ...base(), format: 'other' };
    expect(parseSpec(spec).ok).toBe(false);
    expect(jsonValidator.safeParse(spec).success).toBe(false);
  });
});

describe('zod × JSON Schema consistency', () => {
  it.each(structural)('both reject: %s', (_name, mutate) => {
    const spec = base();
    mutate(spec);
    expect(parseSpec(spec).ok).toBe(false);
    expect(jsonValidator.safeParse(spec).success).toBe(false);
  });
});

const BUTTON = 'layers[0].annotationTypes[0]';
const SCREEN = 'layers[2].annotationTypes[0]';

/** v1 specialization: the SDUI without platforms, without `code` and without the Telas layer. */
function asV1(spec: Json): Json {
  const v1 = structuredClone(spec);
  v1.formatVersion = 1;
  delete v1.platforms;
  v1.layers = v1.layers.slice(0, 2);
  for (const layer of v1.layers) {
    for (const type of layer.annotationTypes) delete type.code;
  }
  return v1;
}

/** Removes `platforms`, all `code` and the Telas layer: what is left is a valid specialization. */
function withoutPlatforms(spec: Json): Json {
  const out = asV1(spec);
  out.formatVersion = 2;
  return out;
}

describe('formatVersion 1 e 2', () => {
  it('a v1 specialization (without platforms and without code) is still valid', () => {
    const v1 = asV1(base());
    const result = parseSpec(v1);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.spec.formatVersion).toBe(1);
      expect(result.spec.platforms).toBeUndefined();
    }
    expect(jsonValidator.safeParse(v1).success).toBe(true);
  });

  it('a v2 without platforms is also valid', () => {
    expect(parseSpec(withoutPlatforms(base())).ok).toBe(true);
  });

  it('formatVersion outside 1 to 16 is rejected, with the valid list in the message', () => {
    for (const bad of [0, 17, '2', null]) {
      const spec = { ...base(), formatVersion: bad };
      const errors = errorsOf(parseSpec(spec));
      expect(
        errors.some((e) =>
          e.startsWith(
            'formatVersion: must be 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15 or 16',
          ),
        ),
      ).toBe(true);
    }
  });
});

/** Each new validation case: the SDUI v2 mutation and the path expected at the start of the message. */
const platformCases: [string, (s: Json) => void, string][] = [
  // platforms
  [
    'platforms[].id outside [a-z0-9-]+',
    (s) => (s.platforms[0].id = 'Android'),
    'platforms[0].id:',
  ],
  ['platforms[].id with a space', (s) => (s.platforms[1].id = 'i os'), 'platforms[1].id:'],
  ['platforms[].id empty', (s) => (s.platforms[2].id = ''), 'platforms[2].id:'],
  ['platforms[].id missing', (s) => delete s.platforms[0].id, 'platforms[0].id:'],
  [
    'platforms[].id repeated',
    (s) => (s.platforms[1].id = 'android'),
    'platforms[1].id: id "android" repeated',
  ],
  ['platforms[].name missing', (s) => delete s.platforms[0].name, 'platforms[0].name:'],
  ['platforms[].name empty', (s) => (s.platforms[0].name = ''), 'platforms[0].name:'],
  [
    'platforms[].language that is not text',
    (s) => (s.platforms[0].language = 1),
    'platforms[0].language:',
  ],
  [
    'platforms[] with an unknown property',
    (s) => (s.platforms[0].extra = 1),
    'platforms[0]:',
  ],
  ['platforms that is not a list', (s) => (s.platforms = {}), 'platforms:'],
  // code
  [
    'code without platforms in the specialization',
    (s) => delete s.platforms,
    `${BUTTON}.code: only allowed in specializations that declare platforms`,
  ],
  [
    'code with empty platforms',
    (s) => (s.platforms = []),
    `${BUTTON}.code: only allowed in specializations that declare platforms`,
  ],
  [
    'code with an undeclared platform',
    (s) => (s.layers[0].annotationTypes[0].code.web = { symbol: 'X' }),
    `${BUTTON}.code.web: platform "web" is not declared in platforms`,
  ],
  [
    'code with a platform id outside the format (in a type of the Eventos layer)',
    (s) => (s.layers[1].annotationTypes[0].code.Web = { symbol: 'X' }),
    'layers[1].annotationTypes[0].code.Web:',
  ],
  [
    'code without symbol',
    (s) => delete s.layers[0].annotationTypes[0].code.android.symbol,
    `${BUTTON}.code.android.symbol: required`,
  ],
  [
    'code with empty symbol',
    (s) => (s.layers[0].annotationTypes[0].code.ios.symbol = ''),
    `${BUTTON}.code.ios.symbol:`,
  ],
  [
    'code with a symbol that is not text',
    (s) => (s.layers[0].annotationTypes[0].code.bff.symbol = 3),
    `${BUTTON}.code.bff.symbol: must be text`,
  ],
  [
    'code with empty path',
    (s) => (s.layers[0].annotationTypes[0].code.android.path = ''),
    `${BUTTON}.code.android.path: cannot be empty`,
  ],
  [
    'code with a path that is not text',
    (s) => (s.layers[0].annotationTypes[0].code.android.path = 3),
    `${BUTTON}.code.android.path: must be text`,
  ],
  [
    'code with absolute path',
    (s) => (s.layers[0].annotationTypes[0].code.android.path = '/app/DSButton.kt'),
    `${BUTTON}.code.android.path: invalid path`,
  ],
  [
    'code with path containing ..',
    (s) => (s.layers[0].annotationTypes[0].code.ios.path = '../DSButton.swift'),
    `${BUTTON}.code.ios.path: invalid path`,
  ],
  [
    'code with path containing a backslash and a drive',
    (s) => (s.layers[0].annotationTypes[0].code.bff.path = 'C:\\app\\DSButton.kt'),
    `${BUTTON}.code.bff.path: invalid path`,
  ],
  [
    'code with path starting with ./',
    (s) => (s.layers[0].annotationTypes[0].code.android.path = './app/DSButton.kt'),
    `${BUTTON}.code.android.path: invalid path`,
  ],
  [
    'code that is not an object',
    (s) => (s.layers[0].annotationTypes[0].code = []),
    `${BUTTON}.code:`,
  ],
  [
    'code with an unknown property',
    (s) => (s.layers[0].annotationTypes[0].code.android.extra = 1),
    `${BUTTON}.code.android:`,
  ],
  [
    'code.notes that is not text',
    (s) => (s.layers[0].annotationTypes[0].code.android.notes = 1),
    `${BUTTON}.code.android.notes:`,
  ],
  [
    'params with a key that is not a field of the type',
    (s) => (s.layers[0].annotationTypes[0].code.android.params.doesNotExist = 'x'),
    `${BUTTON}.code.android.params.doesNotExist: "doesNotExist" is not a field of the type`,
  ],
  // pt-BR kept: shared fixture data (examples/specs/sdui.json, outside this phase)
  [
    'params with an empty parameter name',
    (s) => (s.layers[0].annotationTypes[0].code.android.params.texto = ''),
    `${BUTTON}.code.android.params.texto:`,
  ],
  [
    'params with a parameter name that is not text',
    (s) => (s.layers[0].annotationTypes[0].code.android.params.texto = 1),
    `${BUTTON}.code.android.params.texto:`,
  ],
  [
    'values with a key that is not a field of the type',
    (s) => (s.layers[0].annotationTypes[0].code.android.values.doesNotExist = { a: 'b' }),
    `${BUTTON}.code.android.values.doesNotExist: "doesNotExist" is not a field of the type`,
  ],
  [
    'values for a field that is not enum',
    (s) => (s.layers[0].annotationTypes[0].code.android.values.texto = { a: 'b' }),
    // pt-BR kept: shared fixture data (examples/specs/sdui.json, outside this phase)
    `${BUTTON}.code.android.values.texto: "texto" must be an enum field of the type`,
  ],
  [
    'values for a table field (not enum)',
    (s) =>
      (s.layers[1].annotationTypes[0].code.android.values = { parametros: { a: 'b' } }),
    'layers[1].annotationTypes[0].code.android.values.parametros:',
  ],
  [
    'values with a value that is not in the options',
    (s) => (s.layers[0].annotationTypes[0].code.android.values.estilo.pink = 'X'),
    `${BUTTON}.code.android.values.estilo.pink: "pink" is not in the options of "estilo"`,
  ],
  [
    'values with an empty translation',
    (s) => (s.layers[0].annotationTypes[0].code.android.values.estilo.primary = ''),
    `${BUTTON}.code.android.values.estilo.primary:`,
  ],
  // Fields
  [
    'platforms on a field (only existed on the removed field type)',
    (s) => (s.layers[2].annotationTypes[0].fields[0].platforms = ['android']),
    `${SCREEN}.fields[0].platforms: not allowed in this field type`,
  ],
  [
    'codeRef as a table column',
    (s) =>
      (s.layers[1].annotationTypes[0].fields[2].columns[0] = {
        key: 'impl',
        type: 'codeRef',
      }),
    'layers[1].annotationTypes[0].fields[2].columns[0].type: "codeRef" is not allowed inside a table',
  ],
  // formatVersion 1
  [
    'platforms in a formatVersion 1 specialization',
    (s) => {
      s.formatVersion = 1;
    },
    'platforms: only allowed with formatVersion 2',
  ],
  [
    'code in a formatVersion 1 specialization (without platforms)',
    (s) => {
      s.formatVersion = 1;
      delete s.platforms;
    },
    `${BUTTON}.code: only allowed in specializations that declare platforms`,
  ],
];

describe('formatVersion 2 validation (platforms and code)', () => {
  it.each(platformCases)('rejects: %s', (_name, mutate, expected) => {
    const spec = base();
    mutate(spec);
    const errors = errorsOf(parseSpec(spec));
    expect(
      errors.some((e) => e.startsWith(expected)),
      errors.join('\n'),
    ).toBe(true);
  });

  it("the code's `path` is optional and valid in formatVersion 2 and 3", () => {
    for (const formatVersion of [2, 3]) {
      const spec: Json = { ...base(), formatVersion };
      spec.layers[0].annotationTypes[0].code.bff.path = 'bff/src/TDSButton.kt';
      delete spec.layers[0].annotationTypes[0].code.android.path;
      const result = parseSpec(spec);
      if (!result.ok) throw new Error(result.errors.join('\n'));
      const code = result.spec.layers[0]?.annotationTypes[0]?.code;
      expect(code?.bff?.path).toBe('bff/src/TDSButton.kt');
      expect(code?.android?.path).toBeUndefined();
      expect(jsonValidator.safeParse(spec).success).toBe(true);
    }
  });

  it('the JSON Schema refuses `path` that is empty, absolute or with ..', () => {
    for (const path of [
      '',
      '/app/A.kt',
      '../A.kt',
      'app/../A.kt',
      'C:/A.kt',
      'app//A.kt',
    ]) {
      const spec = base();
      spec.layers[0].annotationTypes[0].code.android.path = path;
      expect(jsonValidator.safeParse(spec).success, path).toBe(false);
    }
  });

  it('the errors also arrive in `issues` with the path separated from the message', () => {
    const spec = base();
    spec.layers[0].annotationTypes[0].code.android.params.doesNotExist = 'x';
    const result = parseSpec(spec);
    if (result.ok) throw new Error('should have failed');
    expect(result.issues).toContainEqual({
      path: `${BUTTON}.code.android.params.doesNotExist`,
      message: '"doesNotExist" is not a field of the type',
      code: 'spec.notTypeField',
      params: { key: 'doesNotExist' },
    });
  });

  it('accepts partial code: platforms without an entry, optional params/values/notes', () => {
    const spec = base();
    spec.layers[0].annotationTypes[0].code = { ios: { symbol: 'DSButton' } };
    expect(parseSpec(spec).ok).toBe(true);
  });

  it('accepts platform without language', () => {
    const spec = base();
    delete spec.platforms[0].language;
    expect(parseSpec(spec).ok).toBe(true);
  });

  it('accepts params that cite a table field', () => {
    const spec = base();
    spec.layers[1].annotationTypes[0].code.android.params.parametros = 'params';
    expect(parseSpec(spec).ok).toBe(true);
  });
});

/** Structural v2 errors that the JSON Schema must reject too. */
const structuralV2: [string, (s: Json) => void][] = [
  ['formatVersion 17', (s) => (s.formatVersion = 17)],
  ['platforms[].id outside the format', (s) => (s.platforms[0].id = 'Android')],
  ['platforms[].name missing', (s) => delete s.platforms[0].name],
  ['platforms[] with an unknown property', (s) => (s.platforms[0].extra = 1)],
  ['code without symbol', (s) => delete s.layers[0].annotationTypes[0].code.android.symbol],
  [
    'code with a platform id outside the format',
    (s) => (s.layers[0].annotationTypes[0].code.Web = { symbol: 'X' }),
  ],
  [
    'code with an unknown property',
    (s) => (s.layers[0].annotationTypes[0].code.android.extra = 1),
  ],
  // pt-BR kept: shared fixture data (examples/specs/sdui.json, outside this phase)
  [
    'params with a value that is not text',
    (s) => (s.layers[0].annotationTypes[0].code.android.params.texto = 1),
  ],
  [
    'values with a translation that is not text',
    (s) => (s.layers[0].annotationTypes[0].code.android.values.estilo.primary = 1),
  ],
  [
    'codeRef as a table column',
    (s) =>
      (s.layers[1].annotationTypes[0].fields[2].columns[0] = {
        key: 'impl',
        type: 'codeRef',
      }),
  ],
  [
    'platforms on a regular field',
    (s) => (s.layers[2].annotationTypes[0].fields[0].platforms = ['android']),
  ],
];

describe('zod × JSON Schema consistency (formatVersion 2)', () => {
  it.each(structuralV2)('both reject: %s', (_name, mutate) => {
    const spec = base();
    mutate(spec);
    expect(parseSpec(spec).ok).toBe(false);
    expect(jsonValidator.safeParse(spec).success).toBe(false);
  });

  it('the JSON Schema declares the same versions, field types and properties as zod', () => {
    const schema = jsonSchema as Json;
    expect(schema.properties.formatVersion.enum).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16,
    ]);
    expect(Object.keys(schema.$defs.annotationType.properties)).toContain('sources');
    expect(Object.keys(schema.$defs.tableField.properties)).toContain('sources');
    expect(Object.keys(schema.properties)).toContain('platforms');
    expect(Object.keys(schema.$defs.annotationType.properties)).toContain('code');
    // The field type removed in stage 9 is not part of the format (the app only reads and ignores it).
    expect(schema.$defs).not.toHaveProperty('codeRefField');
    expect(JSON.stringify(schema)).not.toContain('codeRef');
    expect(Object.keys(schema.$defs.codeEntry.properties).sort()).toEqual([
      'calls',
      'formats',
      'ignore',
      'notes',
      'params',
      'path',
      'signature',
      'symbol',
      'values',
      'variants',
    ]);
  });
});

describe('field of the removed type (codeRef, stage 9): read and ignored', () => {
  /** The SDUI with the removed field put back on the Screen (like the old specializations). */
  function legacy(field: Json = {}): Json {
    const spec = base();
    spec.layers[2].annotationTypes[0].fields.push({
      key: 'implementation',
      label: 'implementation',
      type: REMOVED_FIELD_TYPE,
      ...field,
    });
    return spec;
  }

  it('import: the field leaves the type and comes back in `ignored`, with the path in the file', () => {
    const result = parseSpec(legacy());
    if (!result.ok) throw new Error(result.errors.join('\n'));
    const screen = result.spec.layers[2]?.annotationTypes[0];
    expect(screen?.fields.map((f) => f.key)).toEqual(['nome', 'rota']);
    expect(result.ignored).toEqual([
      { path: `${SCREEN}.fields[2]`, typeId: 'screen', key: 'implementation' },
    ]);
  });

  it('the old rules of the field no longer apply: platforms, default, tags and v1', () => {
    for (const field of [
      { platforms: ['android', 'web'] },
      { platforms: [] },
      { default: [] },
      { tags: ['data-field'] },
      { required: true, description: 'where it was implemented' },
    ]) {
      const result = parseSpec(legacy(field));
      expect(result.ok, JSON.stringify(field)).toBe(true);
    }
    // In a v1 (without platforms) the field is also just ignored.
    const v1 = asV1(base());
    v1.layers[1].annotationTypes[0].fields.push({
      key: 'impl',
      type: REMOVED_FIELD_TYPE,
    });
    const result = parseSpec(v1);
    expect(result.ok && result.ignored.map((f) => f.key)).toEqual(['impl']);
  });

  it('the code params that cite the field go along with it (and an empty params disappears)', () => {
    const spec = legacy();
    spec.layers[2].annotationTypes[0].code = {
      android: { symbol: 'Screen', params: { implementation: 'impl' } },
      ios: { symbol: 'ScreenView', params: { nome: 'title', implementation: 'impl' } },
    };
    const result = parseSpec(spec);
    if (!result.ok) throw new Error(result.errors.join('\n'));
    const code = result.spec.layers[2]?.annotationTypes[0]?.code;
    expect(code?.android).toEqual({ symbol: 'Screen' });
    expect(code?.ios).toEqual({ symbol: 'ScreenView', params: { nome: 'title' } });
  });

  it('still refuses a key repeated with another field of the type', () => {
    const duplicated = legacy({ key: 'nome' });
    expect(errorsOf(parseSpec(duplicated))).toContain(
      `${SCREEN}.fields[2].key: key "nome" repeated`,
    );
  });

  it('removedFieldKeys reads the keys of the raw JSON, by type, without validating', () => {
    const spec = legacy();
    spec.layers[0].annotationTypes[0].fields.push({ key: 'x', type: REMOVED_FIELD_TYPE });
    expect(removedFieldKeys(spec)).toEqual(
      new Map([
        ['button', new Set(['x'])],
        ['screen', new Set(['implementation'])],
      ]),
    );
    expect(removedFieldKeys(null)).toEqual(new Map());
    expect(removedFieldKeys({ layers: 'x' })).toEqual(new Map());
    expect(removedFieldKeys(base())).toEqual(new Map());
  });

  it('the JSON Schema (current format) refuses the removed field; the app accepts and ignores it', () => {
    const spec = legacy();
    expect(parseSpec(spec).ok).toBe(true);
    expect(jsonValidator.safeParse(spec).success).toBe(false);
  });
});

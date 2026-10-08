import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { parseSpec, parseSpecText, type SpecParseResult } from '../../src/model';

const read = (path: string): string => readFileSync(path, 'utf8');
const sdui = read('examples/specs/sdui.json');
const modelo = read('examples/specs/modelo-de-dados.json');
const jsonSchema = JSON.parse(read('docs/spec.schema.json')) as Record<string, unknown>;
const jsonValidator = z.fromJSONSchema(jsonSchema as never);

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Cópia do SDUI para o teste alterar. */
function base(): Json {
  return JSON.parse(sdui) as Json;
}

function errorsOf(result: SpecParseResult): string[] {
  if (result.ok) throw new Error('era para falhar');
  return result.errors;
}

describe('exemplos de especialização', () => {
  it.each([
    ['sdui', sdui],
    ['modelo-de-dados', modelo],
  ])('%s valida no zod e no JSON Schema', (_name, text) => {
    const result = parseSpecText(text);
    expect(result.ok).toBe(true);
    expect(jsonValidator.safeParse(JSON.parse(text)).success).toBe(true);
  });

  it('lê os campos esperados do SDUI (formatVersion 2)', () => {
    const result = parseSpecText(sdui);
    if (!result.ok) throw new Error('falhou');
    const { spec } = result;
    expect(spec.formatVersion).toBe(2);
    expect(spec.layers.map((l) => l.id)).toEqual(['componentes', 'eventos', 'telas']);
    expect(spec.layers[1]?.annotationTypes[0]?.requiresOwner).toBe(true);
    expect(spec.platforms).toEqual([
      { id: 'android', name: 'Android', language: 'kotlin' },
      { id: 'ios', name: 'iOS', language: 'swift' },
      { id: 'bff', name: 'Contrato SDUI', language: 'json' },
    ]);
  });

  it('o SDUI traz `code` das três plataformas em todos os tipos de componentes e eventos', () => {
    const result = parseSpecText(sdui);
    if (!result.ok) throw new Error('falhou');
    const types = result.spec.layers
      .filter((l) => l.id !== 'telas')
      .flatMap((l) => l.annotationTypes);
    expect(types.map((t) => t.id)).toEqual([
      'button',
      'input',
      'text',
      'image',
      'onClick',
      'onHold',
      'onChange',
    ]);
    for (const type of types) {
      expect(Object.keys(type.code ?? {}), type.id).toEqual(['android', 'ios', 'bff']);
    }
    const button = types[0]?.code?.android;
    expect(button?.symbol).toBe('com.app.ds.DSButton');
    expect(button?.params).toMatchObject({ texto: 'text', estilo: 'style' });
    expect(button?.values?.estilo?.primary).toBe('ButtonStyle.Primary');
  });

  it('a camada Telas tem o Screen com um campo codeRef', () => {
    const result = parseSpecText(sdui);
    if (!result.ok) throw new Error('falhou');
    const layer = result.spec.layers[2];
    expect(layer?.name).toBe('Telas');
    const screen = layer?.annotationTypes[0];
    expect(screen?.name).toBe('Screen');
    expect(screen?.labelField).toBe('nome');
    expect(screen?.fields.map((f) => [f.key, f.type])).toEqual([
      ['nome', 'string'],
      ['rota', 'string'],
      ['implementacao', 'codeRef'],
    ]);
    expect(screen?.code).toBeUndefined();
  });

  it('o modelo de dados continua em formatVersion 1, sem plataformas', () => {
    const result = parseSpecText(modelo);
    if (!result.ok) throw new Error('falhou');
    expect(result.spec.formatVersion).toBe(1);
    expect(result.spec.platforms).toBeUndefined();
  });
});

/** Cada caso: a mutação e o caminho (e trecho) esperado na mensagem. */
const semantic: [string, (s: Json) => void, string][] = [
  ['format errado', (s) => (s.format = 'x'), 'format:'],
  ['formatVersion errado', (s) => (s.formatVersion = 3), 'formatVersion:'],
  ['id ausente', (s) => delete s.id, 'id:'],
  ['name ausente', (s) => delete s.name, 'name:'],
  ['version zero', (s) => (s.version = 0), 'version:'],
  ['version fracionária', (s) => (s.version = 1.5), 'version:'],
  ['id de camada repetido', (s) => (s.layers[1].id = 'componentes'), 'layers[1].id:'],
  [
    'id de tipo repetido entre camadas',
    (s) => (s.layers[1].annotationTypes[0].id = 'button'),
    'layers[1].annotationTypes[0].id:',
  ],
  [
    'key repetida no tipo',
    (s) => (s.layers[0].annotationTypes[0].fields[1].key = 'id'),
    'layers[0].annotationTypes[0].fields[1].key:',
  ],
  [
    'key começando com _',
    (s) => (s.layers[0].annotationTypes[0].fields[0].key = '_id'),
    'layers[0].annotationTypes[0].fields[0].key:',
  ],
  [
    'key com espaço',
    (s) => (s.layers[0].annotationTypes[0].fields[0].key = 'a b'),
    'layers[0].annotationTypes[0].fields[0].key:',
  ],
  [
    'key repetida em coluna',
    (s) => (s.layers[1].annotationTypes[0].fields[2].columns[1].key = 'nome'),
    'layers[1].annotationTypes[0].fields[2].columns[1].key:',
  ],
  [
    'allowedChildren inexistente',
    (s) => (s.layers[0].annotationTypes[0].allowedChildren = ['nada']),
    'layers[0].annotationTypes[0].allowedChildren[0]:',
  ],
  [
    'allowedChildren na mesma camada',
    (s) => (s.layers[0].annotationTypes[0].allowedChildren = ['input']),
    'layers[0].annotationTypes[0].allowedChildren[0]:',
  ],
  [
    'requiresOwner sem dono possível',
    (s) => {
      s.layers[0].annotationTypes[0].allowedChildren = ['onHold'];
      s.layers[0].annotationTypes[3].allowedChildren = [];
    },
    'layers[1].annotationTypes[0].requiresOwner:',
  ],
  [
    'tipo de campo inválido',
    (s) => (s.layers[0].annotationTypes[1].fields[2].type = 'numero'),
    'layers[0].annotationTypes[1].fields[2].type: "numero" inválido',
  ],
  [
    'default incompatível (number)',
    (s) => (s.layers[1].annotationTypes[1].fields[1].default = 'x'),
    'layers[1].annotationTypes[1].fields[1].default:',
  ],
  [
    'default fora das options',
    (s) => (s.layers[0].annotationTypes[0].fields[2].default = 'rosa'),
    'layers[0].annotationTypes[0].fields[2].default:',
  ],
  [
    'default em ref',
    (s) => (s.layers[0].annotationTypes[1].fields[5].default = {}),
    'layers[0].annotationTypes[1].fields[5].default:',
  ],
  [
    'enum sem options',
    (s) => delete s.layers[0].annotationTypes[0].fields[2].options,
    'layers[0].annotationTypes[0].fields[2].options:',
  ],
  [
    'enum com options repetidas',
    (s) => (s.layers[0].annotationTypes[0].fields[2].options = ['a', 'a']),
    'layers[0].annotationTypes[0].fields[2].options:',
  ],
  [
    'ref dentro de table',
    (s) =>
      (s.layers[1].annotationTypes[0].fields[2].columns[0] = {
        key: 'r',
        type: 'ref',
        accepts: { free: true },
      }),
    'layers[1].annotationTypes[0].fields[2].columns[0].type:',
  ],
  [
    'table dentro de table',
    (s) =>
      (s.layers[1].annotationTypes[0].fields[2].columns[0] = {
        key: 't',
        type: 'table',
        columns: [],
      }),
    'layers[1].annotationTypes[0].fields[2].columns[0].type:',
  ],
  [
    'table sem columns',
    (s) => delete s.layers[1].annotationTypes[0].fields[2].columns,
    'layers[1].annotationTypes[0].fields[2].columns:',
  ],
  [
    'table com tags sem rowLabel',
    (s) => (s.layers[1].annotationTypes[0].fields[2].tags = ['data-field']),
    'layers[1].annotationTypes[0].fields[2].rowLabel:',
  ],
  [
    'rowLabel numa coluna não-string',
    (s) => {
      const f = s.layers[1].annotationTypes[0].fields[2];
      f.tags = ['data-field'];
      f.rowLabel = 'inexistente';
    },
    'layers[1].annotationTypes[0].fields[2].rowLabel:',
  ],
  [
    'labelField inexistente',
    (s) => (s.layers[0].annotationTypes[0].labelField = 'nada'),
    'layers[0].annotationTypes[0].labelField:',
  ],
  [
    'labelField de campo não-string',
    (s) => (s.layers[0].annotationTypes[1].labelField = 'maxLength'),
    'layers[0].annotationTypes[1].labelField:',
  ],
  [
    'accepts vazio',
    (s) => (s.layers[0].annotationTypes[1].fields[5].accepts = { tags: [] }),
    'layers[0].annotationTypes[1].fields[5].accepts:',
  ],
  [
    'ref sem accepts',
    (s) => delete s.layers[0].annotationTypes[1].fields[5].accepts,
    'layers[0].annotationTypes[1].fields[5].accepts:',
  ],
  [
    'etiqueta com formato inválido',
    (s) => (s.layers[0].annotationTypes[1].fields[5].accepts.tags = ['Data Field']),
    'layers[0].annotationTypes[1].fields[5].accepts.tags[0]:',
  ],
  ['cor inválida', (s) => (s.layers[0].color = 'azul'), 'layers[0].color:'],
  [
    'propriedade desconhecida',
    (s) => (s.layers[0].annotationTypes[0].extra = 1),
    'layers[0].annotationTypes[0]:',
  ],
];

describe('validação do formato (13.2)', () => {
  it.each(semantic)('rejeita: %s', (_name, mutate, expected) => {
    const spec = base();
    mutate(spec);
    const errors = errorsOf(parseSpec(spec));
    expect(errors.some((e) => e.startsWith(expected))).toBe(true);
  });

  it('o erro de tipo sugere os valores válidos', () => {
    const spec = base();
    spec.layers[0].annotationTypes[1].fields[2].type = 'numero';
    const error = errorsOf(parseSpec(spec))[0];
    expect(error).toContain('"numero" inválido; use');
    expect(error).toContain('"codeRef"');
  });

  it('JSON malformado vira um erro legível', () => {
    expect(errorsOf(parseSpecText('{'))[0]).toMatch(/^JSON inválido/);
  });

  it('aceita ref com free sem etiquetas e date default válida', () => {
    const spec = base();
    spec.layers[0].annotationTypes[1].fields[5].accepts = { free: true };
    spec.layers[0].annotationTypes[0].fields.push({
      key: 'quando',
      type: 'date',
      default: '2024-02-29',
    });
    expect(parseSpec(spec).ok).toBe(true);
  });

  it('rejeita data inexistente no default', () => {
    const spec = base();
    spec.layers[0].annotationTypes[0].fields.push({
      key: 'quando',
      type: 'date',
      default: '2023-02-30',
    });
    expect(parseSpec(spec).ok).toBe(false);
  });
});

/** Erros puramente estruturais: o JSON Schema também precisa rejeitar. */
const structural: [string, (s: Json) => void][] = [
  ['format errado', (s) => (s.format = 'x')],
  ['formatVersion errado', (s) => (s.formatVersion = 3)],
  ['id ausente', (s) => delete s.id],
  ['version zero', (s) => (s.version = 0)],
  ['key com espaço', (s) => (s.layers[0].annotationTypes[0].fields[0].key = 'a b')],
  ['key começando com _', (s) => (s.layers[0].annotationTypes[0].fields[0].key = '_id')],
  [
    'tipo de campo inválido',
    (s) => (s.layers[0].annotationTypes[1].fields[2].type = 'numero'),
  ],
  ['enum sem options', (s) => delete s.layers[0].annotationTypes[0].fields[2].options],
  [
    'ref dentro de table',
    (s) =>
      (s.layers[1].annotationTypes[0].fields[2].columns[0] = {
        key: 'r',
        type: 'ref',
        accepts: { free: true },
      }),
  ],
  ['table sem columns', (s) => delete s.layers[1].annotationTypes[0].fields[2].columns],
  [
    'accepts vazio',
    (s) => (s.layers[0].annotationTypes[1].fields[5].accepts = { tags: [] }),
  ],
  ['ref sem accepts', (s) => delete s.layers[0].annotationTypes[1].fields[5].accepts],
  [
    'etiqueta inválida',
    (s) => (s.layers[0].annotationTypes[1].fields[5].accepts.tags = ['Data Field']),
  ],
  ['cor inválida', (s) => (s.layers[0].color = 'azul')],
  ['propriedade desconhecida', (s) => (s.layers[0].annotationTypes[0].extra = 1)],
];

describe('nome do produto (format)', () => {
  it('os exemplos usam `mapping-spec`', () => {
    expect(base().format).toBe('mapping-spec');
  });

  it('a importação ainda aceita `mapeador-spec`, no zod e no JSON Schema', () => {
    const spec = { ...base(), format: 'mapeador-spec' };
    expect(parseSpec(spec).ok).toBe(true);
    expect(jsonValidator.safeParse(spec).success).toBe(true);
  });

  it('rejeita outro `format`', () => {
    const spec = { ...base(), format: 'outro' };
    expect(parseSpec(spec).ok).toBe(false);
    expect(jsonValidator.safeParse(spec).success).toBe(false);
  });
});

describe('consistência zod × JSON Schema', () => {
  it.each(structural)('os dois rejeitam: %s', (_name, mutate) => {
    const spec = base();
    mutate(spec);
    expect(parseSpec(spec).ok).toBe(false);
    expect(jsonValidator.safeParse(spec).success).toBe(false);
  });
});

const BUTTON = 'layers[0].annotationTypes[0]';
const SCREEN = 'layers[2].annotationTypes[0]';
const SCREEN_REF = `${SCREEN}.fields[2]`;

/** Especialização v1: o SDUI sem plataformas, sem `code` e sem a camada Telas (codeRef). */
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

/** Remove `platforms`, todo `code` e o campo codeRef: o que sobra é uma especialização válida. */
function withoutPlatforms(spec: Json): Json {
  const out = asV1(spec);
  out.formatVersion = 2;
  return out;
}

describe('formatVersion 1 e 2', () => {
  it('uma especialização v1 (sem plataformas e sem code) continua válida', () => {
    const v1 = asV1(base());
    const result = parseSpec(v1);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.spec.formatVersion).toBe(1);
      expect(result.spec.platforms).toBeUndefined();
    }
    expect(jsonValidator.safeParse(v1).success).toBe(true);
  });

  it('uma v2 sem platforms também é válida', () => {
    expect(parseSpec(withoutPlatforms(base())).ok).toBe(true);
  });

  it('formatVersion fora de 1 e 2 é rejeitado, com a lista válida na mensagem', () => {
    for (const bad of [0, 3, '2', null]) {
      const spec = { ...base(), formatVersion: bad };
      const errors = errorsOf(parseSpec(spec));
      expect(errors.some((e) => e.startsWith('formatVersion: deve ser 1 ou 2'))).toBe(
        true,
      );
    }
  });
});

/** Cada caso novo da validação: a mutação do SDUI v2 e o caminho esperado no início da mensagem. */
const platformCases: [string, (s: Json) => void, string][] = [
  // platforms
  [
    'platforms[].id fora de [a-z0-9-]+',
    (s) => (s.platforms[0].id = 'Android'),
    'platforms[0].id:',
  ],
  ['platforms[].id com espaço', (s) => (s.platforms[1].id = 'i os'), 'platforms[1].id:'],
  ['platforms[].id vazio', (s) => (s.platforms[2].id = ''), 'platforms[2].id:'],
  ['platforms[].id ausente', (s) => delete s.platforms[0].id, 'platforms[0].id:'],
  [
    'platforms[].id repetido',
    (s) => (s.platforms[1].id = 'android'),
    'platforms[1].id: id "android" repetido',
  ],
  ['platforms[].name ausente', (s) => delete s.platforms[0].name, 'platforms[0].name:'],
  ['platforms[].name vazio', (s) => (s.platforms[0].name = ''), 'platforms[0].name:'],
  [
    'platforms[].language que não é texto',
    (s) => (s.platforms[0].language = 1),
    'platforms[0].language:',
  ],
  [
    'platforms[] com propriedade desconhecida',
    (s) => (s.platforms[0].extra = 1),
    'platforms[0]:',
  ],
  ['platforms que não é lista', (s) => (s.platforms = {}), 'platforms:'],
  // code
  [
    'code sem platforms na especialização',
    (s) => delete s.platforms,
    `${BUTTON}.code: só é permitido em especializações que declaram platforms`,
  ],
  [
    'code com platforms vazio',
    (s) => (s.platforms = []),
    `${BUTTON}.code: só é permitido em especializações que declaram platforms`,
  ],
  [
    'code com plataforma não declarada',
    (s) => (s.layers[0].annotationTypes[0].code.web = { symbol: 'X' }),
    `${BUTTON}.code.web: plataforma "web" não declarada em platforms`,
  ],
  [
    'code com id de plataforma fora do formato (em tipo da camada Eventos)',
    (s) => (s.layers[1].annotationTypes[0].code.Web = { symbol: 'X' }),
    'layers[1].annotationTypes[0].code.Web:',
  ],
  [
    'code sem symbol',
    (s) => delete s.layers[0].annotationTypes[0].code.android.symbol,
    `${BUTTON}.code.android.symbol: obrigatório`,
  ],
  [
    'code com symbol vazio',
    (s) => (s.layers[0].annotationTypes[0].code.ios.symbol = ''),
    `${BUTTON}.code.ios.symbol:`,
  ],
  [
    'code com symbol que não é texto',
    (s) => (s.layers[0].annotationTypes[0].code.bff.symbol = 3),
    `${BUTTON}.code.bff.symbol: deve ser texto`,
  ],
  [
    'code que não é objeto',
    (s) => (s.layers[0].annotationTypes[0].code = []),
    `${BUTTON}.code:`,
  ],
  [
    'code com propriedade desconhecida',
    (s) => (s.layers[0].annotationTypes[0].code.android.extra = 1),
    `${BUTTON}.code.android:`,
  ],
  [
    'code.notes que não é texto',
    (s) => (s.layers[0].annotationTypes[0].code.android.notes = 1),
    `${BUTTON}.code.android.notes:`,
  ],
  [
    'params com chave que não é campo do tipo',
    (s) => (s.layers[0].annotationTypes[0].code.android.params.naoExiste = 'x'),
    `${BUTTON}.code.android.params.naoExiste: "naoExiste" não é um campo do tipo`,
  ],
  [
    'params com nome de parâmetro vazio',
    (s) => (s.layers[0].annotationTypes[0].code.android.params.texto = ''),
    `${BUTTON}.code.android.params.texto:`,
  ],
  [
    'params com nome de parâmetro que não é texto',
    (s) => (s.layers[0].annotationTypes[0].code.android.params.texto = 1),
    `${BUTTON}.code.android.params.texto:`,
  ],
  [
    'values com chave que não é campo do tipo',
    (s) => (s.layers[0].annotationTypes[0].code.android.values.naoExiste = { a: 'b' }),
    `${BUTTON}.code.android.values.naoExiste: "naoExiste" não é um campo do tipo`,
  ],
  [
    'values para campo que não é enum',
    (s) => (s.layers[0].annotationTypes[0].code.android.values.texto = { a: 'b' }),
    `${BUTTON}.code.android.values.texto: "texto" deve ser um campo enum do tipo`,
  ],
  [
    'values para campo table (não enum)',
    (s) =>
      (s.layers[1].annotationTypes[0].code.android.values = { parametros: { a: 'b' } }),
    'layers[1].annotationTypes[0].code.android.values.parametros:',
  ],
  [
    'values com valor que não está nas options',
    (s) => (s.layers[0].annotationTypes[0].code.android.values.estilo.rosa = 'X'),
    `${BUTTON}.code.android.values.estilo.rosa: "rosa" não está nas options de "estilo"`,
  ],
  [
    'values com tradução vazia',
    (s) => (s.layers[0].annotationTypes[0].code.android.values.estilo.primary = ''),
    `${BUTTON}.code.android.values.estilo.primary:`,
  ],
  // codeRef
  [
    'codeRef sem platforms na especialização',
    (s) => {
      delete s.platforms;
      for (const l of s.layers) for (const t of l.annotationTypes) delete t.code;
    },
    `${SCREEN_REF}.type: "codeRef" só é permitido em especializações que declaram platforms`,
  ],
  [
    'codeRef.platforms com plataforma não declarada',
    (s) => (s.layers[2].annotationTypes[0].fields[2].platforms = ['android', 'web']),
    `${SCREEN_REF}.platforms[1]: plataforma "web" não declarada em platforms`,
  ],
  [
    'codeRef.platforms vazio',
    (s) => (s.layers[2].annotationTypes[0].fields[2].platforms = []),
    `${SCREEN_REF}.platforms: não pode ser vazio`,
  ],
  [
    'codeRef.platforms repetido',
    (s) => (s.layers[2].annotationTypes[0].fields[2].platforms = ['ios', 'ios']),
    `${SCREEN_REF}.platforms: plataformas repetidas`,
  ],
  [
    'codeRef.platforms com id fora do formato',
    (s) => (s.layers[2].annotationTypes[0].fields[2].platforms = ['Android']),
    `${SCREEN_REF}.platforms[0]:`,
  ],
  [
    'platforms em campo que não é codeRef',
    (s) => (s.layers[2].annotationTypes[0].fields[0].platforms = ['android']),
    `${SCREEN}.fields[0].platforms: só é permitido em codeRef`,
  ],
  [
    'codeRef como coluna de table',
    (s) =>
      (s.layers[1].annotationTypes[0].fields[2].columns[0] = {
        key: 'impl',
        type: 'codeRef',
      }),
    'layers[1].annotationTypes[0].fields[2].columns[0].type: "codeRef" não é permitido dentro de table',
  ],
  [
    'codeRef como default',
    (s) => (s.layers[2].annotationTypes[0].fields[2].default = []),
    `${SCREEN_REF}.default: não existe para codeRef`,
  ],
  [
    'codeRef com etiquetas',
    (s) => (s.layers[2].annotationTypes[0].fields[2].tags = ['data-field']),
    `${SCREEN_REF}.tags: codeRef não pode ter etiquetas`,
  ],
  [
    'codeRef com accepts',
    (s) => (s.layers[2].annotationTypes[0].fields[2].accepts = { free: true }),
    `${SCREEN_REF}.accepts: só é permitido em ref`,
  ],
  // formatVersion 1
  [
    'platforms numa especialização formatVersion 1',
    (s) => {
      s.formatVersion = 1;
    },
    'platforms: só é permitido com formatVersion 2',
  ],
  [
    'code numa especialização formatVersion 1 (sem platforms)',
    (s) => {
      s.formatVersion = 1;
      delete s.platforms;
    },
    `${BUTTON}.code: só é permitido em especializações que declaram platforms`,
  ],
  [
    'codeRef numa especialização formatVersion 1 (sem platforms)',
    (s) => {
      s.formatVersion = 1;
      delete s.platforms;
    },
    `${SCREEN_REF}.type: "codeRef" só é permitido`,
  ],
];

describe('validação do formatVersion 2 (plataformas, code e codeRef)', () => {
  it.each(platformCases)('rejeita: %s', (_name, mutate, expected) => {
    const spec = base();
    mutate(spec);
    const errors = errorsOf(parseSpec(spec));
    expect(
      errors.some((e) => e.startsWith(expected)),
      errors.join('\n'),
    ).toBe(true);
  });

  it('os erros também chegam em `issues` com o caminho separado da mensagem', () => {
    const spec = base();
    spec.layers[0].annotationTypes[0].code.android.params.naoExiste = 'x';
    const result = parseSpec(spec);
    if (result.ok) throw new Error('era para falhar');
    expect(result.issues).toContainEqual({
      path: `${BUTTON}.code.android.params.naoExiste`,
      message: '"naoExiste" não é um campo do tipo',
    });
  });

  it('aceita codeRef restrito a um subconjunto de plataformas', () => {
    const spec = base();
    spec.layers[2].annotationTypes[0].fields[2].platforms = ['android', 'ios'];
    expect(parseSpec(spec).ok).toBe(true);
    expect(jsonValidator.safeParse(spec).success).toBe(true);
  });

  it('aceita code parcial: plataformas sem entrada, params/values/notes opcionais', () => {
    const spec = base();
    spec.layers[0].annotationTypes[0].code = { ios: { symbol: 'DSButton' } };
    expect(parseSpec(spec).ok).toBe(true);
  });

  it('aceita platform sem language', () => {
    const spec = base();
    delete spec.platforms[0].language;
    expect(parseSpec(spec).ok).toBe(true);
  });

  it('aceita params que citam um campo table ou codeRef', () => {
    const spec = base();
    spec.layers[1].annotationTypes[0].code.android.params.parametros = 'params';
    spec.layers[2].annotationTypes[0].code = {
      android: { symbol: 'Screen', params: { implementacao: 'impl' } },
    };
    expect(parseSpec(spec).ok).toBe(true);
  });
});

/** Erros estruturais do v2 que o JSON Schema também precisa rejeitar. */
const structuralV2: [string, (s: Json) => void][] = [
  ['formatVersion 3', (s) => (s.formatVersion = 3)],
  ['platforms[].id fora do formato', (s) => (s.platforms[0].id = 'Android')],
  ['platforms[].name ausente', (s) => delete s.platforms[0].name],
  ['platforms[] com propriedade desconhecida', (s) => (s.platforms[0].extra = 1)],
  ['code sem symbol', (s) => delete s.layers[0].annotationTypes[0].code.android.symbol],
  [
    'code com id de plataforma fora do formato',
    (s) => (s.layers[0].annotationTypes[0].code.Web = { symbol: 'X' }),
  ],
  [
    'code com propriedade desconhecida',
    (s) => (s.layers[0].annotationTypes[0].code.android.extra = 1),
  ],
  [
    'params com valor que não é texto',
    (s) => (s.layers[0].annotationTypes[0].code.android.params.texto = 1),
  ],
  [
    'values com tradução que não é texto',
    (s) => (s.layers[0].annotationTypes[0].code.android.values.estilo.primary = 1),
  ],
  [
    'codeRef como coluna de table',
    (s) =>
      (s.layers[1].annotationTypes[0].fields[2].columns[0] = {
        key: 'impl',
        type: 'codeRef',
      }),
  ],
  [
    'codeRef com platforms vazio',
    (s) => (s.layers[2].annotationTypes[0].fields[2].platforms = []),
  ],
  [
    'codeRef com platforms repetido',
    (s) => (s.layers[2].annotationTypes[0].fields[2].platforms = ['ios', 'ios']),
  ],
  [
    'codeRef com accepts',
    (s) => (s.layers[2].annotationTypes[0].fields[2].accepts = { free: true }),
  ],
];

describe('consistência zod × JSON Schema (formatVersion 2)', () => {
  it.each(structuralV2)('os dois rejeitam: %s', (_name, mutate) => {
    const spec = base();
    mutate(spec);
    expect(parseSpec(spec).ok).toBe(false);
    expect(jsonValidator.safeParse(spec).success).toBe(false);
  });

  it('o JSON Schema declara as mesmas versões, tipos de campo e propriedades do zod', () => {
    const schema = jsonSchema as Json;
    expect(schema.properties.formatVersion.enum).toEqual([1, 2]);
    expect(Object.keys(schema.properties)).toContain('platforms');
    expect(Object.keys(schema.$defs.annotationType.properties)).toContain('code');
    expect(schema.$defs.codeRefField.properties.type.const).toBe('codeRef');
    expect(Object.keys(schema.$defs.codeEntry.properties).sort()).toEqual([
      'notes',
      'params',
      'symbol',
      'values',
    ]);
    // codeRef não existe como coluna.
    expect(JSON.stringify(schema.$defs.column)).not.toContain('codeRef');
  });
});

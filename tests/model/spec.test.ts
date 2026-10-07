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

  it('lê os campos esperados do SDUI', () => {
    const result = parseSpecText(sdui);
    if (!result.ok) throw new Error('falhou');
    expect(result.spec.layers.map((l) => l.id)).toEqual(['componentes', 'eventos']);
    expect(result.spec.layers[1]?.annotationTypes[0]?.requiresOwner).toBe(true);
  });
});

/** Cada caso: a mutação e o caminho (e trecho) esperado na mensagem. */
const semantic: [string, (s: Json) => void, string][] = [
  ['format errado', (s) => (s.format = 'x'), 'format:'],
  ['formatVersion errado', (s) => (s.formatVersion = 2), 'formatVersion:'],
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
    expect(errorsOf(parseSpec(spec))[0]).toContain('"numero" inválido; use');
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
  ['formatVersion errado', (s) => (s.formatVersion = 2)],
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

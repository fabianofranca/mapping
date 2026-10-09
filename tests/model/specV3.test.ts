import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  SPEC_FORMAT_VERSION,
  findTypesBySource,
  parseSpec,
  parseSpecText,
  type Spec,
  type SpecParseResult,
} from '../../src/model';

// Especialização formatVersion 3 (etapa 4): `sources` nos tipos e nos campos (inclusive
// nas colunas de table). v1 e v2 continuam abrindo; `sources` só existe na v3.

const read = (path: string): string => readFileSync(path, 'utf8');
const sdui = read('examples/specs/sdui.json');
const modelo = read('examples/specs/modelo-de-dados.json');
const jsonSchema = JSON.parse(read('docs/spec.schema.json')) as Record<string, unknown>;
const jsonValidator = z.fromJSONSchema(jsonSchema as never);

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const BUTTON = 'layers[0].annotationTypes[0]';
const ON_CLICK = 'layers[1].annotationTypes[0]';

/** O SDUI de exemplo em v3, com origens no Button (tipo, campo enum e campo texto) e numa coluna. */
function v3(): Json {
  const spec = JSON.parse(sdui) as Json;
  spec.formatVersion = 3;
  const button = spec.layers[0].annotationTypes[0];
  button.sources = [
    { system: 'figma', id: '3f2a9c', name: 'DS/Button' },
    { system: 'figma', name: 'DS/Button (legado)' },
  ];
  button.fields[1].sources = [{ system: 'figma', name: 'Label' }];
  button.fields[2].sources = [
    {
      system: 'figma',
      name: 'Style',
      values: { Primary: 'primary', Secondary: 'secondary', Text: 'text' },
    },
  ];
  const onClick = spec.layers[1].annotationTypes[0];
  onClick.sources = [{ system: 'figma', id: 'evt-1' }];
  onClick.fields[2].columns[0].sources = [{ system: 'figma', name: 'Param' }];
  return spec;
}

function errorsOf(result: SpecParseResult): string[] {
  if (result.ok) throw new Error('era para falhar');
  return result.errors;
}

function parsed(data: Json): Spec {
  const result = parseSpec(data);
  if (!result.ok) throw new Error(result.errors.join('\n'));
  return result.spec;
}

describe('especialização formatVersion 3 (sources)', () => {
  it('a versão atual do formato é a 3', () => {
    expect(SPEC_FORMAT_VERSION).toBe(3);
  });

  it('aceita sources em tipos, campos e colunas de table, no zod e no JSON Schema', () => {
    const spec = parsed(v3());
    expect(spec.formatVersion).toBe(3);
    const button = spec.layers[0]?.annotationTypes[0];
    expect(button?.sources).toEqual([
      { system: 'figma', id: '3f2a9c', name: 'DS/Button' },
      { system: 'figma', name: 'DS/Button (legado)' },
    ]);
    expect(button?.fields[2]?.sources?.[0]?.values).toEqual({
      Primary: 'primary',
      Secondary: 'secondary',
      Text: 'text',
    });
    const table = spec.layers[1]?.annotationTypes[0]?.fields[2];
    expect(table?.type === 'table' && table.columns[0]?.sources).toEqual([
      { system: 'figma', name: 'Param' },
    ]);
    expect(jsonValidator.safeParse(v3()).success).toBe(true);
  });

  it('uma v3 sem sources é a v2 (plataformas e code continuam valendo)', () => {
    const spec = JSON.parse(sdui) as Json;
    spec.formatVersion = 3;
    const result = parsed(spec);
    expect(result.platforms?.map((p) => p.id)).toEqual(['android', 'ios', 'bff']);
    expect(jsonValidator.safeParse(spec).success).toBe(true);
  });

  it('values só em campo enum e com destinos que existem nas options', () => {
    const cases: [string, (s: Json) => void, string][] = [
      [
        'destino fora das options',
        (s) =>
          (s.layers[0].annotationTypes[0].fields[2].sources[0].values.Primary = 'main'),
        `${BUTTON}.fields[2].sources[0].values.Primary: "main" não está nas options`,
      ],
      [
        'values em campo string',
        (s) => (s.layers[0].annotationTypes[0].fields[1].sources[0].values = { A: 'a' }),
        `${BUTTON}.fields[1].sources[0].values: só é permitido em campos enum`,
      ],
      [
        'values em coluna string de table',
        (s) =>
          (s.layers[1].annotationTypes[0].fields[2].columns[0].sources[0].values = {
            A: 'a',
          }),
        `${ON_CLICK}.fields[2].columns[0].sources[0].values: só é permitido em campos enum`,
      ],
      [
        'origem de tipo sem id nem name',
        (s) => (s.layers[0].annotationTypes[0].sources[1] = { system: 'figma' }),
        `${BUTTON}.sources[1]: precisa de "id" ou "name"`,
      ],
      [
        'origem de tipo sem system',
        (s) => delete s.layers[0].annotationTypes[0].sources[0].system,
        `${BUTTON}.sources[0].system:`,
      ],
      [
        'origem de campo sem name',
        (s) => delete s.layers[0].annotationTypes[0].fields[1].sources[0].name,
        `${BUTTON}.fields[1].sources[0].name:`,
      ],
      [
        'propriedade desconhecida na origem',
        (s) => (s.layers[0].annotationTypes[0].sources[0].extra = 1),
        `${BUTTON}.sources[0]:`,
      ],
    ];
    for (const [name, mutate, expected] of cases) {
      const spec = v3();
      mutate(spec);
      const errors = errorsOf(parseSpec(spec));
      expect(
        errors.some((e) => e.startsWith(expected)),
        `${name}: ${errors.join(' | ')}`,
      ).toBe(true);
    }
  });

  it('o JSON Schema também recusa os erros estruturais das origens', () => {
    const structural: ((s: Json) => void)[] = [
      (s) => (s.layers[0].annotationTypes[0].sources[1] = { system: 'figma' }),
      (s) => delete s.layers[0].annotationTypes[0].fields[1].sources[0].name,
      (s) => (s.layers[0].annotationTypes[0].sources[0].extra = 1),
      (s) => (s.layers[0].annotationTypes[0].fields[2].sources[0].values.Primary = 1),
    ];
    for (const mutate of structural) {
      const spec = v3();
      mutate(spec);
      expect(parseSpec(spec).ok).toBe(false);
      expect(jsonValidator.safeParse(spec).success).toBe(false);
    }
  });

  it('sources só é permitido com formatVersion 3, apontando cada uso', () => {
    const spec = v3();
    spec.formatVersion = 2;
    const errors = errorsOf(parseSpec(spec));
    expect(errors).toEqual(
      expect.arrayContaining([
        `${BUTTON}.sources: só é permitido com formatVersion 3`,
        `${BUTTON}.fields[1].sources: só é permitido com formatVersion 3`,
        `${BUTTON}.fields[2].sources: só é permitido com formatVersion 3`,
        `${ON_CLICK}.sources: só é permitido com formatVersion 3`,
        `${ON_CLICK}.fields[2].columns[0].sources: só é permitido com formatVersion 3`,
      ]),
    );
  });

  it('v1 e v2 continuam abrindo (os exemplos não usam sources)', () => {
    const v2 = parseSpecText(sdui);
    const v1 = parseSpecText(modelo);
    expect(v2.ok && v2.spec.formatVersion).toBe(2);
    expect(v1.ok && v1.spec.formatVersion).toBe(1);
  });
});

describe('findTypesBySource', () => {
  const sduiV3 = () => parsed(v3());
  const other = (): Spec => {
    const spec = JSON.parse(modelo) as Json;
    spec.formatVersion = 3;
    spec.layers[0].annotationTypes[0].sources = [{ system: 'figma', name: 'DS/Button' }];
    return parsed(spec);
  };

  it('acha pelo id e pelo nome, com os de id primeiro', () => {
    const byId = findTypesBySource([sduiV3(), other()], 'figma', { id: '3f2a9c' });
    expect(byId.map((m) => [m.specId, m.type.id, m.by])).toEqual([
      ['sdui', 'button', 'id'],
    ]);
    const both = findTypesBySource([other(), sduiV3()], 'figma', {
      id: '3f2a9c',
      name: 'DS/Button',
    });
    expect(both.map((m) => [m.specId, m.type.id, m.by])).toEqual([
      ['sdui', 'button', 'id'],
      ['modelo-dados', 'classe', 'name'],
    ]);
    expect(both[0]?.layer.id).toBe('componentes');
    expect(both[0]?.source).toEqual({ system: 'figma', id: '3f2a9c', name: 'DS/Button' });
  });

  it('um tipo pode corresponder a vários elementos (variante antiga e nova)', () => {
    const old = findTypesBySource([sduiV3()], 'figma', { name: 'DS/Button (legado)' });
    expect(old.map((m) => m.type.id)).toEqual(['button']);
    expect(old[0]?.by).toBe('name');
  });

  it('não interpreta o sistema: outro sistema, nome diferente ou busca vazia não acham nada', () => {
    expect(findTypesBySource([sduiV3()], 'sketch', { name: 'DS/Button' })).toEqual([]);
    expect(findTypesBySource([sduiV3()], 'figma', { name: 'ds/button' })).toEqual([]);
    expect(findTypesBySource([sduiV3()], 'figma', {})).toEqual([]);
    expect(findTypesBySource([null], 'figma', { id: '3f2a9c' })).toEqual([]);
  });
});

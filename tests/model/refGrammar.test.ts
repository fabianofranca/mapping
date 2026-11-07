import { describe, expect, it } from 'vitest';
import {
  formatAnyRef,
  formatRef,
  formatSubRef,
  layerShortCode,
  layerShortCodes,
  matchLayerCode,
  parseAnyRef,
  parseRef,
  shortCodesFor,
  threadShortCodes,
  type AnyRef,
} from '../../src/model';
import { emptyProject } from './fixtures';

const item = (kind: 'm' | 'i' | 'a' | 'p' | 'l' | 'c', code: string): AnyRef => ({
  type: 'item',
  kind,
  code,
});

describe('gramática da referência: item', () => {
  it.each(['m', 'i', 'a', 'p', 'l', 'c'] as const)('formata e lê %s', (kind) => {
    const url = formatAnyRef('Meu projeto', item(kind, '3f2a9c1e'));
    expect(url).toBe(`mapping://Meu%20projeto/${kind}/3f2a9c1e`);
    expect(parseAnyRef(url)).toEqual({
      project: 'Meu projeto',
      ref: item(kind, '3f2a9c1e'),
    });
  });

  it('o formato de m/i/a é o mesmo de formatRef', () => {
    expect(formatAnyRef('proj', item('a', 'abc123'))).toBe(
      formatRef({ project: 'proj', kind: 'a', code: 'abc123' }),
    );
  });

  it('forma curta: projeto nulo', () => {
    expect(parseAnyRef('l/abcd1234')).toEqual({
      project: null,
      ref: item('l', 'abcd1234'),
    });
    expect(parseAnyRef('c/abcd1234')).toEqual({
      project: null,
      ref: item('c', 'abcd1234'),
    });
    expect(parseAnyRef('p/abcd1234')).toEqual({
      project: null,
      ref: item('p', 'abcd1234'),
    });
  });

  it('p, l e c aceitam ponto e sublinhado no código, sem alterá-lo', () => {
    expect(parseAnyRef('mapping://proj/p/Prop_1.v2-x')).toEqual({
      project: 'proj',
      ref: item('p', 'Prop_1.v2-x'),
    });
    expect(parseAnyRef('c/A.b_c')?.ref).toEqual(item('c', 'A.b_c'));
  });

  it('m, i e a normalizam o código como parseRef e não aceitam ponto', () => {
    expect(parseAnyRef('mapping://proj/m/3F2A-9C1E')?.ref).toEqual(item('m', '3f2a9c1e'));
    expect(parseAnyRef('m/ab.cd')).toBeNull();
    expect(parseAnyRef('mapping://proj/i/ab_cd')).toBeNull();
  });

  it('m, i e a leem igual a parseRef', () => {
    for (const text of [
      'mapping://proj/m/3f2a9c1e',
      'i/ABCD-1234',
      'mapping://a%20b/a/zz9',
    ]) {
      const old = parseRef(text)!;
      const next = parseAnyRef(text)!;
      expect(next.project).toBe(old.project);
      expect(next.ref).toEqual(item(old.kind!, old.code));
    }
  });

  it('projeto com acento e símbolos faz o round-trip', () => {
    const name = "Café (v2)! a/b 100%'";
    const url = formatAnyRef(name, item('c', 'abc'));
    expect(url).not.toMatch(/[ ()!'%](?![0-9A-F]{2})/);
    expect(parseAnyRef(url)?.project).toBe(name);
  });

  it('aceita espaço nas pontas do texto colado', () => {
    expect(parseAnyRef('  c/abc  ')?.ref).toEqual(item('c', 'abc'));
  });
});

describe('gramática da referência: campo, par e linha', () => {
  it('campo tipado: a key é codificada e decodificada', () => {
    const key = 'a b/c%d';
    const url = formatSubRef('proj', { type: 'field', annotation: '3f2a9c1e', key });
    expect(url).toBe('mapping://proj/a/3f2a9c1e/f/a%20b%2Fc%25d');
    expect(parseAnyRef(url)).toEqual({
      project: 'proj',
      ref: { type: 'field', annotation: '3f2a9c1e', key },
    });
  });

  it('campo com acentos e símbolos', () => {
    const key = "variação (útil)! 'x' *";
    const ref: AnyRef = { type: 'field', annotation: 'abc123', key };
    const url = formatAnyRef('Mapeamento ç', ref);
    expect(url).toMatch(
      /^mapping:\/\/Mapeamento%20%C3%A7\/a\/abc123\/f\/[A-Za-z0-9%._~-]+$/,
    );
    expect(parseAnyRef(url)).toEqual({ project: 'Mapeamento ç', ref });
  });

  it('par da anotação livre', () => {
    const ref: AnyRef = { type: 'entry', annotation: 'abc123', entry: 'e5f6a7b8' };
    const url = formatAnyRef('proj', ref);
    expect(url).toBe('mapping://proj/a/abc123/e/e5f6a7b8');
    expect(parseAnyRef(url)).toEqual({ project: 'proj', ref });
  });

  it('linha de table', () => {
    const ref: AnyRef = {
      type: 'row',
      annotation: 'abc123',
      key: 'Colunas 1',
      row: 'r0ab12',
    };
    const url = formatAnyRef('proj', ref);
    expect(url).toBe('mapping://proj/a/abc123/f/Colunas%201/r/r0ab12');
    expect(parseAnyRef(url)).toEqual({ project: 'proj', ref });
  });

  it('formatSubRef e formatAnyRef dão o mesmo texto', () => {
    const ref = { type: 'row', annotation: 'a1', key: 'k', row: 'r1' } as const;
    expect(formatSubRef('p', ref)).toBe(formatAnyRef('p', ref));
  });

  it('formas curtas, com projeto nulo', () => {
    expect(parseAnyRef('a/abc/f/x%20y')).toEqual({
      project: null,
      ref: { type: 'field', annotation: 'abc', key: 'x y' },
    });
    expect(parseAnyRef('a/abc/e/9f')).toEqual({
      project: null,
      ref: { type: 'entry', annotation: 'abc', entry: '9f' },
    });
    expect(parseAnyRef('a/abc/f/k/r/7')).toEqual({
      project: null,
      ref: { type: 'row', annotation: 'abc', key: 'k', row: '7' },
    });
  });

  it('o código da anotação é normalizado como o de parseRef', () => {
    expect(parseAnyRef('a/AB-CD/f/k')?.ref).toEqual({
      type: 'field',
      annotation: 'abcd',
      key: 'k',
    });
  });
});

describe('gramática da referência: leitura estrita', () => {
  const invalid = [
    '',
    '   ',
    'mapping://',
    'mapping://proj',
    'mapping://proj/',
    'mapping://proj/m',
    'mapping://proj/m/',
    'mapping://proj/m/abc/x', // sufixo
    'mapping://proj/m/abc/',
    'mapping://proj/m/abc?q=1',
    'mapping://proj/m/abc#h',
    'mapping://proj/m/ab c',
    'mapping://proj/m/abc d',
    'mapping://pr oj/m/abc',
    'mapping://proj/x/abc', // letra desconhecida
    'mapping://proj/M/abc',
    'mapping://proj//m/abc', // segmento vazio
    'mapping://proj/m//abc',
    'mapping:///m/abc',
    'mapping://proj/c/abc/f/k', // f só depois de a
    'mapping://proj/a/abc/f', // campo vazio
    'mapping://proj/a/abc/f/',
    'mapping://proj/a/abc/e',
    'mapping://proj/a/abc/e/',
    'mapping://proj/a/abc/f/k/r', // linha vazia
    'mapping://proj/a/abc/f/k/r/',
    'mapping://proj/a/abc/e/x/r/y', // r só depois de f
    'mapping://proj/a/abc/e/x/extra',
    'mapping://proj/a/abc/f/k/r/x/extra',
    'mapping://proj/a/abc/f/k/q/x',
    'mapping://proj/a/abc/g/k',
    'mapping://proj/a/abc/f/k?x',
    'mapping://proj/a/abc/f/k#x',
    'mapping://proj/a/abc/f/a b',
    'mapping://proj/a/abc/f/a%ZZ', // % inválido
    'mapping://proj/a/abc/f/%',
    'mapping://proj/a/abc/f/%C3', // UTF-8 truncado
    'mapping://%ZZ/a/abc',
    'mapping://proj/a/abc/e/a b',
    'a/abc/f/k/x',
    'a/abc/f/',
    'a/abc/f/k?q',
    'a/abc/f/a b',
    'a/abc/f/%ZZ',
    'l/',
    'c//x',
    'x/abc',
    'p/ab c',
    'p/ab/c',
    'abc', // código solto não é referência desta gramática
    'mapping://proj/m/abc\nmais',
  ];
  it.each(invalid)('recusa %j', (text) => {
    expect(parseAnyRef(text)).toBeNull();
  });
});

describe('gramática da referência: links da biblioteca', () => {
  it('mapping://<typeId>, mapping://<specId>/<typeId> e afins não casam', () => {
    expect(parseAnyRef('mapping://typeId')).toBeNull();
    expect(parseAnyRef('mapping://spec/type')).toBeNull();
    expect(parseAnyRef('mapping://spec/Button')).toBeNull();
    expect(parseAnyRef('mapping://projeto/x/abc')).toBeNull();
    expect(parseAnyRef('mapping://spec/a')).toBeNull(); // typeId de uma letra, sem código
    expect(parseAnyRef('mapping://spec/type/extra')).toBeNull();
  });
});

describe('códigos curtos de camada e conversa', () => {
  it('layerShortCodes usa shortCodesFor sobre os ids das camadas', () => {
    const p = {
      ...emptyProject(),
      layers: [
        {
          id: '3f2a9c1e-7b4d-4e0a-9d51-0a1b2c3d4e5f',
          name: 'A',
          color: '#111111',
          spec: null,
        },
        {
          id: '9a8b7c6d-1111-4222-8333-444455556666',
          name: 'B',
          color: '#222222',
          spec: null,
        },
      ],
    };
    const codes = layerShortCodes(p);
    expect(codes).toEqual(shortCodesFor(p.layers.map((l) => l.id)));
    expect(layerShortCodes(p)).toBe(codes); // memoizado por projeto
    expect(layerShortCode(p, p.layers[0]!.id)).toBe('3f2a9c1e');
    expect(() => layerShortCode(p, 'nada')).toThrow();
    expect(matchLayerCode(p, '9a8b')).toEqual([p.layers[1]!.id]);
    expect(matchLayerCode(p, '')).toEqual([]);
    expect(matchLayerCode(p, 'zzzz')).toEqual([]);
  });

  it('threadShortCodes é único entre as conversas', () => {
    const a = '3f2a9c1e-aaaa-4000-8000-000000000001';
    const b = '3f2a9c1e-aaaa-4000-8000-000000000002';
    const codes = threadShortCodes([a, b, 'zzz-0000-1111']);
    expect(new Set(codes.values()).size).toBe(3);
    expect(codes.get('zzz-0000-1111')).toBe('zzz00001');
  });
});

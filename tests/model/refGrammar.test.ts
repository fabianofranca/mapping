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

describe('reference grammar: item', () => {
  it.each(['m', 'i', 'a', 'p', 'l', 'c'] as const)('formats and reads %s', (kind) => {
    const url = formatAnyRef('My project', item(kind, '3f2a9c1e'));
    expect(url).toBe(`mapping://My%20project/${kind}/3f2a9c1e`);
    expect(parseAnyRef(url)).toEqual({
      project: 'My project',
      ref: item(kind, '3f2a9c1e'),
    });
  });

  it('the format of m/i/a is the same as formatRef', () => {
    expect(formatAnyRef('proj', item('a', 'abc123'))).toBe(
      formatRef({ project: 'proj', kind: 'a', code: 'abc123' }),
    );
  });

  it('short form: null project', () => {
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

  it('p, l and c accept dot and underscore in the code, without altering it', () => {
    expect(parseAnyRef('mapping://proj/p/Prop_1.v2-x')).toEqual({
      project: 'proj',
      ref: item('p', 'Prop_1.v2-x'),
    });
    expect(parseAnyRef('c/A.b_c')?.ref).toEqual(item('c', 'A.b_c'));
  });

  it('m, i and a normalize the code like parseRef and do not accept a dot', () => {
    expect(parseAnyRef('mapping://proj/m/3F2A-9C1E')?.ref).toEqual(item('m', '3f2a9c1e'));
    expect(parseAnyRef('m/ab.cd')).toBeNull();
    expect(parseAnyRef('mapping://proj/i/ab_cd')).toBeNull();
  });

  it('m, i and a read the same as parseRef', () => {
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

  it('a project with accents and symbols round-trips', () => {
    // pt-BR kept: accented characters are the object of the round-trip test
    const name = "Café (v2)! a/b 100%'";
    const url = formatAnyRef(name, item('c', 'abc'));
    expect(url).not.toMatch(/[ ()!'%](?![0-9A-F]{2})/);
    expect(parseAnyRef(url)?.project).toBe(name);
  });

  it('accepts whitespace at the ends of the pasted text', () => {
    expect(parseAnyRef('  c/abc  ')?.ref).toEqual(item('c', 'abc'));
  });
});

describe('reference grammar: field, pair and row', () => {
  it('typed field: the key is encoded and decoded', () => {
    const key = 'a b/c%d';
    const url = formatSubRef('proj', { type: 'field', annotation: '3f2a9c1e', key });
    expect(url).toBe('mapping://proj/a/3f2a9c1e/f/a%20b%2Fc%25d');
    expect(parseAnyRef(url)).toEqual({
      project: 'proj',
      ref: { type: 'field', annotation: '3f2a9c1e', key },
    });
  });

  it('field with accents and symbols', () => {
    // pt-BR kept: accented characters are the object of the round-trip test
    const key = "variação (útil)! 'x' *";
    const ref: AnyRef = { type: 'field', annotation: 'abc123', key };
    const url = formatAnyRef('Mapping ç', ref);
    expect(url).toMatch(
      /^mapping:\/\/Mapping%20%C3%A7\/a\/abc123\/f\/[A-Za-z0-9%._~-]+$/,
    );
    expect(parseAnyRef(url)).toEqual({ project: 'Mapping ç', ref });
  });

  it('pair of a free annotation', () => {
    const ref: AnyRef = { type: 'entry', annotation: 'abc123', entry: 'e5f6a7b8' };
    const url = formatAnyRef('proj', ref);
    expect(url).toBe('mapping://proj/a/abc123/e/e5f6a7b8');
    expect(parseAnyRef(url)).toEqual({ project: 'proj', ref });
  });

  it('table row', () => {
    const ref: AnyRef = {
      type: 'row',
      annotation: 'abc123',
      key: 'Columns 1',
      row: 'r0ab12',
    };
    const url = formatAnyRef('proj', ref);
    expect(url).toBe('mapping://proj/a/abc123/f/Columns%201/r/r0ab12');
    expect(parseAnyRef(url)).toEqual({ project: 'proj', ref });
  });

  it('formatSubRef and formatAnyRef give the same text', () => {
    const ref = { type: 'row', annotation: 'a1', key: 'k', row: 'r1' } as const;
    expect(formatSubRef('p', ref)).toBe(formatAnyRef('p', ref));
  });

  it('short forms, with a null project', () => {
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

  it('the annotation code is normalized like the one of parseRef', () => {
    expect(parseAnyRef('a/AB-CD/f/k')?.ref).toEqual({
      type: 'field',
      annotation: 'abcd',
      key: 'k',
    });
  });
});

describe('reference grammar: strict reading', () => {
  const invalid = [
    '',
    '   ',
    'mapping://',
    'mapping://proj',
    'mapping://proj/',
    'mapping://proj/m',
    'mapping://proj/m/',
    'mapping://proj/m/abc/x', // suffix
    'mapping://proj/m/abc/',
    'mapping://proj/m/abc?q=1',
    'mapping://proj/m/abc#h',
    'mapping://proj/m/ab c',
    'mapping://proj/m/abc d',
    'mapping://pr oj/m/abc',
    'mapping://proj/x/abc', // unknown letter
    'mapping://proj/M/abc',
    'mapping://proj//m/abc', // empty segment
    'mapping://proj/m//abc',
    'mapping:///m/abc',
    'mapping://proj/c/abc/f/k', // f only after a
    'mapping://proj/a/abc/f', // empty field
    'mapping://proj/a/abc/f/',
    'mapping://proj/a/abc/e',
    'mapping://proj/a/abc/e/',
    'mapping://proj/a/abc/f/k/r', // empty row
    'mapping://proj/a/abc/f/k/r/',
    'mapping://proj/a/abc/e/x/r/y', // r only after f
    'mapping://proj/a/abc/e/x/extra',
    'mapping://proj/a/abc/f/k/r/x/extra',
    'mapping://proj/a/abc/f/k/q/x',
    'mapping://proj/a/abc/g/k',
    'mapping://proj/a/abc/f/k?x',
    'mapping://proj/a/abc/f/k#x',
    'mapping://proj/a/abc/f/a b',
    'mapping://proj/a/abc/f/a%ZZ', // invalid %
    'mapping://proj/a/abc/f/%',
    'mapping://proj/a/abc/f/%C3', // truncated UTF-8
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
    'abc', // a loose code is not a reference of this grammar
    'mapping://proj/m/abc
more',
  ];
  it.each(invalid)('refuses %j', (text) => {
    expect(parseAnyRef(text)).toBeNull();
  });
});

describe('reference grammar: library links', () => {
  it('mapping://<typeId>, mapping://<specId>/<typeId> and the like do not match', () => {
    expect(parseAnyRef('mapping://typeId')).toBeNull();
    expect(parseAnyRef('mapping://spec/type')).toBeNull();
    expect(parseAnyRef('mapping://spec/Button')).toBeNull();
    expect(parseAnyRef('mapping://project/x/abc')).toBeNull();
    expect(parseAnyRef('mapping://spec/a')).toBeNull(); // one-letter typeId, without a code
    expect(parseAnyRef('mapping://spec/type/extra')).toBeNull();
  });
});

describe('short codes of layer and thread', () => {
  it('layerShortCodes uses shortCodesFor over the layer ids', () => {
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
    expect(layerShortCodes(p)).toBe(codes); // memoized per project
    expect(layerShortCode(p, p.layers[0]!.id)).toBe('3f2a9c1e');
    expect(() => layerShortCode(p, 'nothing')).toThrow();
    expect(matchLayerCode(p, '9a8b')).toEqual([p.layers[1]!.id]);
    expect(matchLayerCode(p, '')).toEqual([]);
    expect(matchLayerCode(p, 'zzzz')).toEqual([]);
  });

  it('threadShortCodes is unique among the threads', () => {
    const a = '3f2a9c1e-aaaa-4000-8000-000000000001';
    const b = '3f2a9c1e-aaaa-4000-8000-000000000002';
    const codes = threadShortCodes([a, b, 'zzz-0000-1111']);
    expect(new Set(codes.values()).size).toBe(3);
    expect(codes.get('zzz-0000-1111')).toBe('zzz00001');
  });
});

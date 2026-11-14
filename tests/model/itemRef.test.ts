import { describe, expect, it } from 'vitest';
import {
  addContainer,
  createMarking,
  encodeRefSegment,
  formatRef,
  matchShortCode,
  parseRef,
  shortCode,
  shortCodes,
  shortCodesFor,
  type Project,
} from '../../src/model';
import { emptyProject, sampleProject } from './fixtures';

const UUID_A = '3f2a9c1e-7b4d-4e0a-9d51-0a1b2c3d4e5f';
const UUID_B = '9a8b7c6d-1111-4222-8333-444455556666';

/** Project with markings of the given ids, all in the same image. */
function withMarkings(ids: readonly string[]): Project {
  let p = addContainer(emptyProject(), {
    id: 'I1',
    file: 'images/a.jpg',
    width: 1000,
    height: 1000,
  });
  ids.forEach((id, i) => {
    p = createMarking(p, {
      id,
      containerId: 'I1',
      rect: { x: i * 100, y: 0, width: 50, height: 50 },
      name: null,
    });
  });
  return p;
}

describe('shortCode', () => {
  it('uses the first 8 characters of the id, without hyphens and in lowercase', () => {
    const p = withMarkings([UUID_A, UUID_B.toUpperCase()]);
    expect(shortCode(p, 'm', UUID_A)).toBe('3f2a9c1e');
    expect(shortCode(p, 'm', UUID_B.toUpperCase())).toBe('9a8b7c6d');
  });

  it('grows 4 characters at a time until it is unique', () => {
    const a = '3f2a9c1e-aaaa-4000-8000-000000000001';
    const b = '3f2a9c1e-aaaa-4000-8000-000000000002';
    const c = '3f2a9c1e-bbbb-4000-8000-000000000003';
    const p = withMarkings([a, b, c, UUID_B]);
    const codes = shortCodes(p, 'm');
    // a and b differ only in the last character: the code is the whole id (32).
    expect(codes.get(a)).toBe('3f2a9c1eaaaa4000800000000000' + '0001');
    expect(codes.get(b)).toBe('3f2a9c1eaaaa4000800000000000' + '0002');
    expect(codes.get(c)).toBe('3f2a9c1ebbbb');
    expect(codes.get(UUID_B)).toBe('9a8b7c6d');
    const all = [...codes.values()];
    expect(new Set(all).size).toBe(all.length);
    expect(codes.get(a)!.length % 4).toBe(0);
  });

  it('goes from 8 to 12 when only the first 8 collide', () => {
    const a = '3f2a9c1e-1000-4000-8000-000000000001';
    const b = '3f2a9c1e-2000-4000-8000-000000000001';
    const codes = shortCodes(withMarkings([a, b]), 'm');
    expect(codes.get(a)).toBe('3f2a9c1e1000');
    expect(codes.get(b)).toBe('3f2a9c1e2000');
  });

  it('is computed per kind: a marking and an image with the same start do not collide', () => {
    let p = withMarkings(['3f2a9c1e-0000-4000-8000-000000000001']);
    p = addContainer(p, {
      id: '3f2a9c1e-9999-4000-8000-000000000002',
      file: 'images/b.jpg',
      width: 10,
      height: 10,
    });
    expect(shortCode(p, 'm', '3f2a9c1e-0000-4000-8000-000000000001')).toBe('3f2a9c1e');
    expect(shortCode(p, 'i', '3f2a9c1e-9999-4000-8000-000000000002')).toBe('3f2a9c1e');
  });

  it('covers the three kinds (annotations too) and fails with not-found', () => {
    const p = sampleProject();
    expect(shortCode(p, 'a', 'A1')).toBe('a1');
    expect(shortCode(p, 'i', 'I1')).toBe('i1');
    expect(shortCode(p, 'm', 'M1')).toBe('m1');
    expect(() => shortCode(p, 'm', 'does-not-exist')).toThrow();
  });

  it('is memoized per project', () => {
    const p = sampleProject();
    expect(shortCodes(p, 'm')).toBe(shortCodes(p, 'm'));
    expect(shortCodes({ ...p }, 'm')).not.toBe(shortCodes(p, 'm'));
  });
});

describe('shortCodesFor', () => {
  it('works for any list of ids (e.g. the proposals of a project)', () => {
    const a = '3f2a9c1e-1000-4000-8000-000000000001';
    const b = '3f2a9c1e-2000-4000-8000-000000000001';
    const c = '9b1c0000-0000-4000-8000-000000000003';
    const codes = shortCodesFor([a, b, c]);
    expect(codes.get(a)).toBe('3f2a9c1e1000');
    expect(codes.get(b)).toBe('3f2a9c1e2000');
    expect(codes.get(c)).toBe('9b1c0000');
    expect(shortCodesFor([]).size).toBe(0);
  });
});

describe('matchShortCode', () => {
  const a = '3f2a9c1e-1000-4000-8000-000000000001';
  const b = '3f2a9c1e-2000-4000-8000-000000000001';
  const p = withMarkings([a, b, UUID_A.replace('3f2a9c1e', '77777777')]);

  it('finds by code, by prefix, by full id and ignores hyphens and case', () => {
    expect(matchShortCode(p, 'm', '3f2a9c1e1000')).toEqual([{ kind: 'm', id: a }]);
    expect(matchShortCode(p, 'm', a.toUpperCase())).toEqual([{ kind: 'm', id: a }]);
    expect(matchShortCode(p, 'm', '7777')).toHaveLength(1);
  });

  it('returns the candidates when the code is ambiguous and empty when nothing is found', () => {
    expect(matchShortCode(p, 'm', '3f2a9c1e').map((m) => m.id)).toEqual([a, b]);
    expect(matchShortCode(p, 'm', 'ffff')).toEqual([]);
    expect(matchShortCode(p, 'm', '')).toEqual([]);
  });

  it('with a null kind searches the three kinds; the exact id beats the prefix', () => {
    const q = sampleProject();
    expect(matchShortCode(q, null, 'm1')).toEqual([{ kind: 'm', id: 'M1' }]);
    expect(matchShortCode(q, null, 'i')).toHaveLength(2);
    expect(matchShortCode(q, 'a', 'm1')).toEqual([]);
  });
});

describe('formatRef', () => {
  it('builds only the URL', () => {
    expect(formatRef({ project: 'car', kind: 'm', code: '3f2a9c1e' })).toBe(
      'mapping://car/m/3f2a9c1e',
    );
  });

  it('encodes the project by the unreserved set', () => {
    const cases: [string, string][] = [
      ['My Project (v2)', 'My%20Project%20%28v2%29'],
      // pt-BR kept: the non-ASCII character is the object of the encoding test
      ['ç', '%C3%A7'],
      ['a~b.c-d_e', 'a~b.c-d_e'],
      ["a!b'c*d", 'a%21b%27c%2Ad'],
      ['my app/v 2', 'my%20app%2Fv%202'],
    ];
    for (const [project, encoded] of cases) {
      const ref = formatRef({ project, kind: 'i', code: 'ab12cd34' });
      expect(ref).toBe(`mapping://${encoded}/i/ab12cd34`);
      expect(ref).toMatch(/^[A-Za-z0-9\-._~%:/]+$/);
      expect(new URL(ref).href).toBe(ref);
    }
  });

  it('encodeRefSegment encodes everything outside unreserved', () => {
    expect(encodeRefSegment('a b(c)')).toBe('a%20b%28c%29');
  });
});

describe('parseRef', () => {
  it('accepts `_` in the code (component ids such as A_N0)', () => {
    expect(parseRef('mapping://components/a/a_n0')).toEqual({
      project: 'components',
      kind: 'a',
      code: 'a_n0',
    });
    expect(parseRef('m/B_x1')).toEqual({ project: null, kind: 'm', code: 'b_x1' });
    expect(parseRef('A_N0')).toEqual({ project: null, kind: null, code: 'a_n0' });
  });

  it('reads the full reference', () => {
    expect(parseRef('mapping://car/m/3f2a9c1e')).toEqual({
      project: 'car',
      kind: 'm',
      code: '3f2a9c1e',
    });
    expect(parseRef('  mapping://car/i/3F2A9C1E  ')).toEqual({
      project: 'car',
      kind: 'i',
      code: '3f2a9c1e',
    });
  });

  it('decodes the project, with uppercase or lowercase %xx', () => {
    expect(parseRef('mapping://my%20app/a/ab12cd34')?.project).toBe('my app');
    // pt-BR kept: the non-ASCII character is the object of the decoding test
    expect(parseRef('mapping://pro%c3%a7/a/ab12cd34')?.project).toBe('proç');
    expect(parseRef('mapping://pro%C3%A7/a/ab12cd34')?.project).toBe('proç');
  });

  it('reads "m/code" without a project and the full id or the code alone', () => {
    expect(parseRef('m/3f2a9c1e')).toEqual({
      project: null,
      kind: 'm',
      code: '3f2a9c1e',
    });
    expect(parseRef(UUID_A)).toEqual({
      project: null,
      kind: null,
      code: UUID_A.replaceAll('-', ''),
    });
    expect(parseRef('3f2a9c1e')).toEqual({ project: null, kind: null, code: '3f2a9c1e' });
  });

  it('refuses what is not a reference', () => {
    for (const bad of [
      '',
      '   ',
      'x/3f2a9c1e',
      'mapping://carro',
      'mapping://car/x/3f2a9c1e',
      'mapping:///m/3f2a9c1e',
      'mapping://car/m/',
      'http://carro/m/3f2a9c1e',
      'two words',
      '---',
    ]) {
      expect(parseRef(bad), bad).toBeNull();
    }
  });

  it('refuses the old format and the badly encoded project', () => {
    for (const bad of [
      'mapping://signup/m/2f7c4a1d (signup.png › Form)',
      'mapping://My Project/m/2f7c4a1d',
      // pt-BR kept: an unencoded non-ASCII project is the object of the test
      'mapping://café/m/2f7c4a1d',
      'mapping://p%ZZ/m/2f7c4a1d',
      'mapping://p%C3/m/2f7c4a1d',
      'mapping://p%/m/2f7c4a1d',
      'mapping://p(1)/m/2f7c4a1d',
      'mapping://p/m/2f7c4a1d?x=1',
      'mapping://p/m/2f7c4a1d#x',
    ]) {
      expect(parseRef(bad), bad).toBeNull();
    }
  });

  it('is the inverse of formatRef', () => {
    const p = withMarkings([UUID_A, UUID_B]);
    // pt-BR kept: the non-ASCII character is the object of the round trip
    for (const project of ['my app', 'My Project (v2)', 'ç~.']) {
      const text = formatRef({
        project,
        kind: 'm',
        code: shortCode(p, 'm', UUID_A),
      });
      const parsed = parseRef(text);
      expect(parsed).toEqual({ project, kind: 'm', code: '3f2a9c1e' });
      expect(matchShortCode(p, parsed!.kind, parsed!.code)).toEqual([
        { kind: 'm', id: UUID_A },
      ]);
    }
  });
});

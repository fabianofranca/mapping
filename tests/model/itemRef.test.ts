import { describe, expect, it } from 'vitest';
import {
  addImage,
  createMarking,
  formatRef,
  matchShortCode,
  parseRef,
  shortCode,
  shortCodes,
  type Project,
} from '../../src/model';
import { emptyProject, sampleProject } from './fixtures';

const UUID_A = '3f2a9c1e-7b4d-4e0a-9d51-0a1b2c3d4e5f';
const UUID_B = '9a8b7c6d-1111-4222-8333-444455556666';

/** Projeto com marcações de ids dados, todas na mesma imagem. */
function withMarkings(ids: readonly string[]): Project {
  let p = addImage(emptyProject(), {
    id: 'I1',
    file: 'images/a.jpg',
    width: 1000,
    height: 1000,
  });
  ids.forEach((id, i) => {
    p = createMarking(p, {
      id,
      imageId: 'I1',
      rect: { x: i * 100, y: 0, width: 50, height: 50 },
      name: null,
    });
  });
  return p;
}

describe('shortCode', () => {
  it('usa os 8 primeiros caracteres do id, sem hífens e em minúsculas', () => {
    const p = withMarkings([UUID_A, UUID_B.toUpperCase()]);
    expect(shortCode(p, 'm', UUID_A)).toBe('3f2a9c1e');
    expect(shortCode(p, 'm', UUID_B.toUpperCase())).toBe('9a8b7c6d');
  });

  it('cresce de 4 em 4 caracteres até ficar único', () => {
    const a = '3f2a9c1e-aaaa-4000-8000-000000000001';
    const b = '3f2a9c1e-aaaa-4000-8000-000000000002';
    const c = '3f2a9c1e-bbbb-4000-8000-000000000003';
    const p = withMarkings([a, b, c, UUID_B]);
    const codes = shortCodes(p, 'm');
    // a e b só diferem no último caractere: o código é o id inteiro (32).
    expect(codes.get(a)).toBe('3f2a9c1eaaaa4000800000000000' + '0001');
    expect(codes.get(b)).toBe('3f2a9c1eaaaa4000800000000000' + '0002');
    expect(codes.get(c)).toBe('3f2a9c1ebbbb');
    expect(codes.get(UUID_B)).toBe('9a8b7c6d');
    const all = [...codes.values()];
    expect(new Set(all).size).toBe(all.length);
    expect(codes.get(a)!.length % 4).toBe(0);
  });

  it('passa de 8 para 12 quando só os 8 primeiros colidem', () => {
    const a = '3f2a9c1e-1000-4000-8000-000000000001';
    const b = '3f2a9c1e-2000-4000-8000-000000000001';
    const codes = shortCodes(withMarkings([a, b]), 'm');
    expect(codes.get(a)).toBe('3f2a9c1e1000');
    expect(codes.get(b)).toBe('3f2a9c1e2000');
  });

  it('é calculado por tipo: marcação e imagem com o mesmo começo não colidem', () => {
    let p = withMarkings(['3f2a9c1e-0000-4000-8000-000000000001']);
    p = addImage(p, {
      id: '3f2a9c1e-9999-4000-8000-000000000002',
      file: 'images/b.jpg',
      width: 10,
      height: 10,
    });
    expect(shortCode(p, 'm', '3f2a9c1e-0000-4000-8000-000000000001')).toBe('3f2a9c1e');
    expect(shortCode(p, 'i', '3f2a9c1e-9999-4000-8000-000000000002')).toBe('3f2a9c1e');
  });

  it('cobre os três tipos (anotações também) e falha com not-found', () => {
    const p = sampleProject();
    expect(shortCode(p, 'a', 'A1')).toBe('a1');
    expect(shortCode(p, 'i', 'I1')).toBe('i1');
    expect(shortCode(p, 'm', 'M1')).toBe('m1');
    expect(() => shortCode(p, 'm', 'nao-existe')).toThrow();
  });

  it('é memoizado por projeto', () => {
    const p = sampleProject();
    expect(shortCodes(p, 'm')).toBe(shortCodes(p, 'm'));
    expect(shortCodes({ ...p }, 'm')).not.toBe(shortCodes(p, 'm'));
  });
});

describe('matchShortCode', () => {
  const a = '3f2a9c1e-1000-4000-8000-000000000001';
  const b = '3f2a9c1e-2000-4000-8000-000000000001';
  const p = withMarkings([a, b, UUID_A.replace('3f2a9c1e', '77777777')]);

  it('acha por código, por prefixo, por id completo e ignora hífens e caixa', () => {
    expect(matchShortCode(p, 'm', '3f2a9c1e1000')).toEqual([{ kind: 'm', id: a }]);
    expect(matchShortCode(p, 'm', a.toUpperCase())).toEqual([{ kind: 'm', id: a }]);
    expect(matchShortCode(p, 'm', '7777')).toHaveLength(1);
  });

  it('devolve os candidatos quando o código é ambíguo e vazio quando não acha', () => {
    expect(matchShortCode(p, 'm', '3f2a9c1e').map((m) => m.id)).toEqual([a, b]);
    expect(matchShortCode(p, 'm', 'ffff')).toEqual([]);
    expect(matchShortCode(p, 'm', '')).toEqual([]);
  });

  it('com kind nulo procura nos três tipos; o id exato vence o prefixo', () => {
    const q = sampleProject();
    expect(matchShortCode(q, null, 'm1')).toEqual([{ kind: 'm', id: 'M1' }]);
    expect(matchShortCode(q, null, 'i')).toHaveLength(2);
    expect(matchShortCode(q, 'a', 'm1')).toEqual([]);
  });
});

describe('formatRef', () => {
  it('monta a referência com e sem o caminho legível', () => {
    expect(formatRef({ project: 'carro', kind: 'm', code: '3f2a9c1e' })).toBe(
      'mapping://carro/m/3f2a9c1e',
    );
    expect(
      formatRef({
        project: 'carro',
        kind: 'm',
        code: '3f2a9c1e',
        label: 'Lateral › Porta dianteira',
      }),
    ).toBe('mapping://carro/m/3f2a9c1e (Lateral › Porta dianteira)');
  });

  it('codifica o nome do projeto e ignora caminho vazio ou com quebras de linha', () => {
    expect(formatRef({ project: 'meu app/v 2', kind: 'i', code: 'ab12cd34' })).toBe(
      'mapping://meu%20app%2Fv%202/i/ab12cd34',
    );
    expect(formatRef({ project: 'p', kind: 'a', code: 'ab12cd34', label: '  ' })).toBe(
      'mapping://p/a/ab12cd34',
    );
    expect(formatRef({ project: 'p', kind: 'a', code: 'ab12cd34', label: 'a\nb' })).toBe(
      'mapping://p/a/ab12cd34 (a b)',
    );
  });
});

describe('parseRef', () => {
  it('lê a referência completa, ignorando o caminho legível', () => {
    expect(parseRef('mapping://carro/m/3f2a9c1e (Lateral › Porta (esq.))')).toEqual({
      project: 'carro',
      kind: 'm',
      code: '3f2a9c1e',
    });
    expect(parseRef('  mapping://carro/i/3F2A9C1E  ')).toEqual({
      project: 'carro',
      kind: 'i',
      code: '3f2a9c1e',
    });
  });

  it('decodifica o nome do projeto (e tolera % inválido)', () => {
    expect(parseRef('mapping://meu%20app/a/ab12cd34')?.project).toBe('meu app');
    expect(parseRef('mapping://100%/a/ab12cd34')?.project).toBe('100%');
  });

  it('lê "m/código" sem projeto e o id completo ou código sozinho', () => {
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

  it('recusa o que não é referência', () => {
    for (const bad of [
      '',
      '   ',
      'x/3f2a9c1e',
      'mapping://carro',
      'mapping://carro/x/3f2a9c1e',
      'mapping:///m/3f2a9c1e',
      'mapping://carro/m/',
      'http://carro/m/3f2a9c1e',
      'duas palavras',
      '---',
    ]) {
      expect(parseRef(bad), bad).toBeNull();
    }
  });

  it('é o inverso de formatRef', () => {
    const p = withMarkings([UUID_A, UUID_B]);
    const text = formatRef({
      project: 'meu app',
      kind: 'm',
      code: shortCode(p, 'm', UUID_A),
      label: 'Imagem › Marcação',
    });
    const parsed = parseRef(text);
    expect(parsed).toEqual({ project: 'meu app', kind: 'm', code: '3f2a9c1e' });
    expect(matchShortCode(p, parsed!.kind, parsed!.code)).toEqual([
      { kind: 'm', id: UUID_A },
    ]);
  });
});

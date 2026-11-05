import { describe, expect, it } from 'vitest';
import {
  chooseTypes,
  normalizeSearch,
  typeMatchesQuery,
} from '../../src/model/typeChoice';
import type { SpecAnnotationType, SpecLayerGroup } from '../../src/model/spec';

function type(
  id: string,
  name: string,
  extra: Partial<SpecAnnotationType> = {},
): SpecAnnotationType {
  return { id, name, fields: [], ...extra };
}

const groups: SpecLayerGroup[] = [
  { id: 'g-b', name: 'Segundo' },
  { id: 'g-a', name: 'Primeiro' },
];

const botao = type('botao', 'Botão', {
  groups: ['g-a'],
  description: 'Dispara uma ação',
});
const campo = type('campo', 'Campo', { groups: ['g-b'] });

const types: SpecAnnotationType[] = [
  botao,
  campo,
  type('card', 'Cartão', { groups: ['g-a', 'g-b'] }),
  type('solto', 'Solto'),
  type('fantasma', 'Fantasma', { groups: ['nao-existe'] }),
];

const ids = (list: readonly SpecAnnotationType[]): string[] => list.map((t) => t.id);

describe('normalizeSearch', () => {
  it('remove acentos, caixa e espaços das pontas', () => {
    expect(normalizeSearch('  AÇÃO Já ')).toBe('acao ja');
  });
});

describe('typeMatchesQuery', () => {
  it('casa por nome, id e descrição, sem acento e sem caixa', () => {
    expect(typeMatchesQuery(botao, 'BOTAO')).toBe(true);
    expect(typeMatchesQuery(botao, 'acao')).toBe(true);
    expect(typeMatchesQuery(campo, 'camp')).toBe(true);
    expect(typeMatchesQuery(campo, 'acao')).toBe(false);
  });

  it('busca vazia ou só com espaços casa tudo', () => {
    expect(typeMatchesQuery(campo, '')).toBe(true);
    expect(typeMatchesQuery(campo, '   ')).toBe(true);
  });
});

describe('chooseTypes', () => {
  it('agrupa na ordem dos grupos da camada, com o tipo em vários grupos em cada um', () => {
    const r = chooseTypes(types, groups, '');
    expect(r.headers).toBe(true);
    expect(r.sections.map((s) => s.key)).toEqual(['g-b', 'g-a', 'others']);
    expect(r.sections[0]!.group).toEqual(groups[0]);
    expect(ids(r.sections[0]!.types)).toEqual(['campo', 'card']);
    expect(ids(r.sections[1]!.types)).toEqual(['botao', 'card']);
  });

  it('põe os tipos sem grupo existente em Outros, no fim', () => {
    const r = chooseTypes(types, groups, '');
    const last = r.sections.at(-1)!;
    expect(last.others).toBe(true);
    expect(last.group).toBeNull();
    expect(ids(last.types)).toEqual(['solto', 'fantasma']);
  });

  it('não cria Outros quando todos têm grupo', () => {
    const r = chooseTypes(types.slice(0, 3), groups, '');
    expect(r.sections.map((s) => s.key)).toEqual(['g-b', 'g-a']);
  });

  it('camada sem grupos: lista plana', () => {
    for (const g of [undefined, []]) {
      const r = chooseTypes(types, g, '');
      expect(r.headers).toBe(false);
      expect(r.sections).toHaveLength(1);
      expect(r.sections[0]).toMatchObject({ key: 'all', group: null, others: false });
      expect(ids(r.sections[0]!.types)).toEqual(ids(types));
    }
  });

  it('camada com grupos mas nenhum tipo agrupado: lista plana', () => {
    const r = chooseTypes(types.slice(3), groups, '');
    expect(r.headers).toBe(false);
    expect(r.sections[0]!.key).toBe('all');
  });

  it('sem tipos: sem cabeçalhos, seção plana vazia e total 0', () => {
    const r = chooseTypes([], groups, 'x');
    expect(r.headers).toBe(false);
    expect(r.total).toBe(0);
    expect(r.matches).toBe(0);
    expect(r.sections).toHaveLength(1);
    expect(r.sections[0]!.types).toEqual([]);
  });

  it('busca por nome, id e descrição mantém só os grupos com resultado', () => {
    const byName = chooseTypes(types, groups, 'campo');
    expect(byName.headers).toBe(true);
    expect(byName.sections.map((s) => s.key)).toEqual(['g-b']);
    const byId = chooseTypes(types, groups, 'SOLTO');
    expect(byId.sections.map((s) => s.key)).toEqual(['others']);
    const byDesc = chooseTypes(types, groups, 'acao');
    expect(byDesc.sections.map((s) => s.key)).toEqual(['g-a']);
    expect(ids(byDesc.sections[0]!.types)).toEqual(['botao']);
  });

  it('a busca não desliga os cabeçalhos nem some com a lista plana', () => {
    expect(chooseTypes(types, groups, 'zzz').headers).toBe(true);
    expect(chooseTypes(types, groups, 'zzz').sections).toEqual([]);
    const flat = chooseTypes(types, undefined, 'campo');
    expect(flat.headers).toBe(false);
    expect(ids(flat.sections[0]!.types)).toEqual(['campo']);
  });

  it('total conta antes da busca e matches não repete o tipo de vários grupos', () => {
    const all = chooseTypes(types, groups, '   ');
    expect(all.total).toBe(5);
    expect(all.matches).toBe(5);
    const some = chooseTypes(types, groups, 'cartao');
    expect(some.total).toBe(5);
    expect(some.matches).toBe(1);
    expect(some.sections).toHaveLength(2);
  });
});

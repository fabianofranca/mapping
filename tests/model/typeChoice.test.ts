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
  { id: 'g-b', name: 'Second' },
  { id: 'g-a', name: 'First' },
];

// pt-BR kept: accent-insensitive search is the object (Botão, ação, Cartão below)
const button = type('button', 'Botão', {
  groups: ['g-a'],
  description: 'Dispara uma ação',
});
const fieldType = type('field', 'Field', { groups: ['g-b'] });

const types: SpecAnnotationType[] = [
  button,
  fieldType,
  // pt-BR kept: accent-insensitive search is the object ('cartao' query)
  type('card', 'Cartão', { groups: ['g-a', 'g-b'] }),
  type('loose', 'Loose'),
  type('ghost', 'Ghost', { groups: ['nonexistent'] }),
];

const ids = (list: readonly SpecAnnotationType[]): string[] => list.map((t) => t.id);

describe('normalizeSearch', () => {
  it('removes accents, case and surrounding spaces (pt-BR)', () => {
    // pt-BR kept: accent normalization of Portuguese text is the object
    expect(normalizeSearch('  AÇÃO Já ')).toBe('acao ja');
  });
});

describe('typeMatchesQuery', () => {
  it('matches by name, id and description, ignoring accents and case', () => {
    expect(typeMatchesQuery(button, 'BOTAO')).toBe(true);
    expect(typeMatchesQuery(button, 'acao')).toBe(true);
    expect(typeMatchesQuery(fieldType, 'fie')).toBe(true);
    expect(typeMatchesQuery(fieldType, 'acao')).toBe(false);
  });

  it('an empty search or one with only spaces matches everything', () => {
    expect(typeMatchesQuery(fieldType, '')).toBe(true);
    expect(typeMatchesQuery(fieldType, '   ')).toBe(true);
  });
});

describe('chooseTypes', () => {
  it('groups in the order of the layer groups, with the type in several groups in each one', () => {
    const r = chooseTypes(types, groups, '');
    expect(r.headers).toBe(true);
    expect(r.sections.map((s) => s.key)).toEqual(['g-b', 'g-a', 'others']);
    expect(r.sections[0]!.group).toEqual(groups[0]);
    expect(ids(r.sections[0]!.types)).toEqual(['field', 'card']);
    expect(ids(r.sections[1]!.types)).toEqual(['button', 'card']);
  });

  it('puts the types without an existing group in Others, at the end', () => {
    const r = chooseTypes(types, groups, '');
    const last = r.sections.at(-1)!;
    expect(last.others).toBe(true);
    expect(last.group).toBeNull();
    expect(ids(last.types)).toEqual(['loose', 'ghost']);
  });

  it('does not create Others when all have a group', () => {
    const r = chooseTypes(types.slice(0, 3), groups, '');
    expect(r.sections.map((s) => s.key)).toEqual(['g-b', 'g-a']);
  });

  it('layer without groups: flat list', () => {
    for (const g of [undefined, []]) {
      const r = chooseTypes(types, g, '');
      expect(r.headers).toBe(false);
      expect(r.sections).toHaveLength(1);
      expect(r.sections[0]).toMatchObject({ key: 'all', group: null, others: false });
      expect(ids(r.sections[0]!.types)).toEqual(ids(types));
    }
  });

  it('layer with groups but no grouped type: flat list', () => {
    const r = chooseTypes(types.slice(3), groups, '');
    expect(r.headers).toBe(false);
    expect(r.sections[0]!.key).toBe('all');
  });

  it('without types: no headers, an empty flat section and total 0', () => {
    const r = chooseTypes([], groups, 'x');
    expect(r.headers).toBe(false);
    expect(r.total).toBe(0);
    expect(r.matches).toBe(0);
    expect(r.sections).toHaveLength(1);
    expect(r.sections[0]!.types).toEqual([]);
  });

  it('search by name, id and description keeps only the groups with results', () => {
    const byName = chooseTypes(types, groups, 'field');
    expect(byName.headers).toBe(true);
    expect(byName.sections.map((s) => s.key)).toEqual(['g-b']);
    const byId = chooseTypes(types, groups, 'LOOSE');
    expect(byId.sections.map((s) => s.key)).toEqual(['others']);
    const byDesc = chooseTypes(types, groups, 'acao');
    expect(byDesc.sections.map((s) => s.key)).toEqual(['g-a']);
    expect(ids(byDesc.sections[0]!.types)).toEqual(['button']);
  });

  it('the search does not turn off the headers nor remove the flat list', () => {
    expect(chooseTypes(types, groups, 'zzz').headers).toBe(true);
    expect(chooseTypes(types, groups, 'zzz').sections).toEqual([]);
    const flat = chooseTypes(types, undefined, 'field');
    expect(flat.headers).toBe(false);
    expect(ids(flat.sections[0]!.types)).toEqual(['field']);
  });

  it('total counts before the search and matches does not repeat the type of several groups', () => {
    const all = chooseTypes(types, groups, '   ');
    expect(all.total).toBe(5);
    expect(all.matches).toBe(5);
    const some = chooseTypes(types, groups, 'cartao');
    expect(some.total).toBe(5);
    expect(some.matches).toBe(1);
    expect(some.sections).toHaveLength(2);
  });
});

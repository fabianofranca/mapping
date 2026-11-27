// `fieldDisplay(type, values, keep)` (stage #2918, FG2; decisions 4, 7 and 8): the pure resolver of
// what Details shows. Ungrouped fields stay in place, a group sits at its first field's position, a
// group with every field hidden is left out, a condition reads the stored value (or the `default`),
// and `keep` shows a hidden field and its group.
import { describe, expect, it } from 'vitest';
import { fieldDisplay, type DisplayItem } from '../../src/model/specFieldDisplay';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const type = (fields: Json[], fieldGroups?: Json[]) =>
  ({ fields, ...(fieldGroups === undefined ? {} : { fieldGroups }) }) as never;

const NONE = new Set<string>();

/** A compact view: a field is its key, a group is `[id, key, key…]`. */
function shape(items: readonly DisplayItem[]): (string | string[])[] {
  return items.map((item) =>
    item.kind === 'field'
      ? item.field.key
      : [item.group.id, ...item.fields.map((f) => f.key)],
  );
}

const fields: Json[] = [
  { key: 'variant', type: 'enum', options: ['plain', 'htmlTagged'], default: 'plain' },
  { key: 'a', type: 'string', group: 'g' },
  { key: 'plain', type: 'string' },
  { key: 'b', type: 'string', group: 'g' },
  { key: 'last', type: 'string' },
];
const groups: Json[] = [{ id: 'g', name: 'G' }];

describe('fieldDisplay', () => {
  it('a type with no keys gives the plain list of fields', () => {
    const result = fieldDisplay(
      type([
        { key: 'x', type: 'string' },
        { key: 'y', type: 'number' },
      ]),
      {},
      NONE,
    );
    expect(shape(result.items)).toEqual(['x', 'y']);
    expect(result.hidden).toEqual([]);
    expect(result.items.every((i) => i.kind === 'field')).toBe(true);
  });

  it('ungrouped fields stay in place and a group sits at its first field', () => {
    const result = fieldDisplay(type(fields, groups), {}, NONE);
    expect(shape(result.items)).toEqual(['variant', ['g', 'a', 'b'], 'plain', 'last']);
  });

  it('a group appears with its fields in the declared order', () => {
    const swapped: Json[] = [fields[2]!, fields[3]!, fields[1]!];
    expect(shape(fieldDisplay(type(swapped, groups), {}, NONE).items)).toEqual([
      'plain',
      ['g', 'b', 'a'],
    ]);
  });

  describe('conditions', () => {
    const grouped: Json[] = [
      { key: 'mode', type: 'enum', options: ['x', 'y', 'z'], default: 'x' },
      { key: 'n', type: 'number' },
      { key: 'always', type: 'string' },
      { key: 'one', type: 'string', visibleWhen: { mode: 'y' } },
    ];
    const keysOf = (values: Json, list = grouped) =>
      fieldDisplay(type(list), values, NONE).items.map((i) =>
        i.kind === 'field' ? i.field.key : i.group.id,
      );

    it('a scalar matches its value', () => {
      expect(keysOf({ mode: 'y' })).toContain('one');
      expect(keysOf({ mode: 'z' })).not.toContain('one');
    });

    it('a list means any of its values', () => {
      const list: Json[] = [
        grouped[0]!,
        { key: 'multi', type: 'string', visibleWhen: { mode: ['y', 'z'] } },
      ];
      expect(keysOf({ mode: 'z' }, list)).toContain('multi');
      expect(keysOf({ mode: 'y' }, list)).toContain('multi');
      expect(keysOf({ mode: 'x' }, list)).not.toContain('multi');
    });

    it('several keys mean all of them', () => {
      const list: Json[] = [
        grouped[0]!,
        grouped[1]!,
        { key: 'both', type: 'string', visibleWhen: { mode: 'y', n: [1, 2] } },
      ];
      expect(keysOf({ mode: 'y', n: 2 }, list)).toContain('both');
      expect(keysOf({ mode: 'y', n: 3 }, list)).not.toContain('both');
      expect(keysOf({ mode: 'z', n: 2 }, list)).not.toContain('both');
    });

    it('an absent value reads the default', () => {
      const list: Json[] = [
        grouped[0]!,
        { key: 'onDefault', type: 'string', visibleWhen: { mode: 'x' } },
      ];
      expect(keysOf({}, list)).toContain('onDefault');
      expect(keysOf({ mode: null }, list)).toContain('onDefault');
      expect(keysOf({ mode: 'y' }, list)).not.toContain('onDefault');
    });

    it('with no default an absent value matches nothing', () => {
      const list: Json[] = [
        { key: 'free', type: 'string' },
        { key: 'dep', type: 'string', visibleWhen: { free: ['', 'a'] } },
      ];
      expect(keysOf({}, list)).toEqual(['free']);
      expect(keysOf({ free: null }, list)).toEqual(['free']);
      expect(keysOf({ free: 'a' }, list)).toEqual(['free', 'dep']);
    });

    it('the hidden keys come back in order', () => {
      const list: Json[] = [
        { key: 'mode', type: 'enum', options: ['x', 'y'], default: 'x' },
        { key: 'h1', type: 'string', visibleWhen: { mode: 'y' } },
        { key: 'shown', type: 'string' },
        { key: 'h2', type: 'string', visibleWhen: { mode: 'y' } },
      ];
      expect(fieldDisplay(type(list), {}, NONE).hidden).toEqual(['h1', 'h2']);
      expect(fieldDisplay(type(list), { mode: 'y' }, NONE).hidden).toEqual([]);
    });
  });

  describe('groups', () => {
    const list: Json[] = [
      { key: 'mode', type: 'enum', options: ['x', 'y'], default: 'x' },
      { key: 'a', type: 'string', group: 'g' },
      { key: 'b', type: 'string', group: 'g', visibleWhen: { mode: 'y' } },
      { key: 'tail', type: 'string' },
    ];

    it('a group with every field hidden is left out', () => {
      const hidden: Json[] = [{ id: 'g', name: 'G', visibleWhen: { mode: 'y' } }];
      const result = fieldDisplay(type(list, hidden), {}, NONE);
      expect(shape(result.items)).toEqual(['mode', 'tail']);
      expect(result.hidden).toEqual(['a', 'b']);
    });

    it('a field condition and its group condition must both hold', () => {
      const cond: Json[] = [{ id: 'g', name: 'G', visibleWhen: { mode: ['x', 'y'] } }];
      expect(shape(fieldDisplay(type(list, cond), { mode: 'x' }, NONE).items)).toEqual([
        'mode',
        ['g', 'a'],
        'tail',
      ]);
      const onlyY: Json[] = [{ id: 'g', name: 'G', visibleWhen: { mode: 'y' } }];
      // The group needs `y` and so does `b`: at `y` both fields show.
      expect(shape(fieldDisplay(type(list, onlyY), { mode: 'y' }, NONE).items)).toEqual([
        'mode',
        ['g', 'a', 'b'],
        'tail',
      ]);
    });

    it('a field whose own condition fails stays out of a shown group', () => {
      const result = fieldDisplay(type(list, [{ id: 'g', name: 'G' }]), {}, NONE);
      expect(shape(result.items)).toEqual(['mode', ['g', 'a'], 'tail']);
      expect(result.hidden).toEqual(['b']);
    });
  });

  describe('keep', () => {
    const list: Json[] = [
      { key: 'mode', type: 'enum', options: ['x', 'y'], default: 'x' },
      { key: 'a', type: 'string', group: 'g' },
      { key: 'b', type: 'string', group: 'g' },
      { key: 'lone', type: 'string', visibleWhen: { mode: 'y' } },
    ];
    const gated: Json[] = [{ id: 'g', name: 'G', visibleWhen: { mode: 'y' } }];

    it('shows a hidden field and takes it out of the hidden keys', () => {
      const result = fieldDisplay(type(list, gated), {}, new Set(['lone']));
      expect(shape(result.items)).toEqual(['mode', 'lone']);
      expect(result.hidden).toEqual(['a', 'b']);
    });

    it('shows a hidden field with its group, and only the kept fields of it', () => {
      const result = fieldDisplay(type(list, gated), {}, new Set(['b']));
      expect(shape(result.items)).toEqual(['mode', ['g', 'b']]);
      expect(result.hidden).toEqual(['a', 'lone']);
    });

    it('keep of a field that is already shown changes nothing', () => {
      const result = fieldDisplay(type(list, gated), { mode: 'y' }, new Set(['a']));
      expect(shape(result.items)).toEqual(['mode', ['g', 'a', 'b'], 'lone']);
      expect(result.hidden).toEqual([]);
    });

    it('a key that is not a field of the type is ignored', () => {
      const result = fieldDisplay(type(list, gated), {}, new Set(['ghost']));
      expect(result.hidden).toEqual(['a', 'b', 'lone']);
    });
  });
});

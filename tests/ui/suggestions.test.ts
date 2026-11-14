import { describe, expect, it } from 'vitest';
import {
  containsWord,
  filterSuggestions,
  mergeLinkedItems,
  replaceWord,
  toItems,
  wordAtCursor,
} from '../../src/ui/suggestions';

const items = toItems(['String', 'Int', 'MutableList', 'List', 'Unit', 'Pair']);
const labels = (word: string) => filterSuggestions(items, word).map((i) => i.label);

describe('wordAtCursor', () => {
  it('picks up letters, digits, _ and . before the cursor', () => {
    expect(wordAtCursor('List<Acc', 8)).toEqual({ start: 5, text: 'Acc' });
    expect(wordAtCursor('a.b_c9', 6)).toEqual({ start: 0, text: 'a.b_c9' });
    // pt-BR kept: accented Portuguese letters are the object (Unicode word characters)
    expect(wordAtCursor('Ação', 4)).toEqual({ start: 0, text: 'Ação' });
  });

  it('empty when the character before the cursor is not a word character', () => {
    expect(wordAtCursor('List<', 5)).toEqual({ start: 5, text: '' });
    expect(wordAtCursor('', 0)).toEqual({ start: 0, text: '' });
  });

  it('ignores what comes after the cursor and clamps the cursor to the text', () => {
    expect(wordAtCursor('Str Int', 3)).toEqual({ start: 0, text: 'Str' });
    expect(wordAtCursor('abc', 99)).toEqual({ start: 0, text: 'abc' });
  });
});

describe('filterSuggestions', () => {
  it('an empty word returns everything', () => {
    expect(labels('')).toHaveLength(items.length);
  });

  it('ignores case; what starts with comes before what contains, in the original order', () => {
    expect(labels('li')).toEqual(['List', 'MutableList']);
    expect(labels('IN')).toEqual(['Int', 'String']);
  });

  it('no match, empty', () => {
    expect(labels('zzz')).toEqual([]);
  });

  it('closes when the only match is identical to the word', () => {
    expect(labels('Pair')).toEqual([]);
    expect(labels('pair')).toEqual(['Pair']);
    expect(labels('List')).toEqual(['List', 'MutableList']);
    expect(filterSuggestions(items, 'Pair', true).map((i) => i.label)).toEqual(['Pair']);
  });

  it('keeps the secondary text', () => {
    const found = filterSuggestions([{ label: 'Account', detail: 'Class' }], 'acc');
    expect(found).toEqual([{ label: 'Account', detail: 'Class' }]);
  });
});

describe('replaceWord', () => {
  it('replaces only the word before the cursor', () => {
    expect(replaceWord('List<Acc', 8, 'Account')).toEqual({
      text: 'List<Account',
      cursor: 12,
    });
    expect(replaceWord('Str', 3, 'String')).toEqual({ text: 'String', cursor: 6 });
  });

  it('with an empty word inserts at the cursor and preserves the rest', () => {
    expect(replaceWord('List<>', 5, 'Int')).toEqual({ text: 'List<Int>', cursor: 8 });
    expect(replaceWord('Str, x', 3, 'String')).toEqual({
      text: 'String, x',
      cursor: 6,
    });
  });
});

describe('containsWord', () => {
  it('the label must be free of word characters on both sides', () => {
    expect(containsWord('Account', 'Account')).toBe(true);
    expect(containsWord('List<Account>', 'Account')).toBe(true);
    expect(containsWord('Map<Account, Int>', 'Account')).toBe(true);
    expect(containsWord('Account?', 'Account')).toBe(true);
    expect(containsWord('AccountDto', 'Account')).toBe(false);
    expect(containsWord('MyAccount', 'Account')).toBe(false);
    expect(containsWord('Account_1', 'Account')).toBe(false);
    expect(containsWord('a.Account', 'Account')).toBe(false);
    expect(containsWord('Account2', 'Account')).toBe(false);
  });

  it('looks at the other occurrences and is case sensitive', () => {
    expect(containsWord('AccountDto Account', 'Account')).toBe(true);
    expect(containsWord('account', 'Account')).toBe(false);
    expect(containsWord('Person', '')).toBe(false);
    expect(containsWord('', 'Account')).toBe(false);
  });

  it('treats Unicode letters as part of the word', () => {
    // pt-BR kept: accented Portuguese letters are the object (Unicode word characters)
    expect(containsWord('Endereço', 'Endere')).toBe(false);
    expect(containsWord('List<Endereço>', 'Endereço')).toBe(true);
  });
});

describe('mergeLinkedItems', () => {
  it('targets first; the fixed one with the same text is dropped', () => {
    const targets = [{ label: 'Account', detail: 'Class', id: '1' }];
    expect(mergeLinkedItems(targets, ['String', 'Account', { label: 'Int' }])).toEqual([
      { label: 'Account', detail: 'Class', id: '1' },
      { label: 'String' },
      { label: 'Int' },
    ]);
  });
});

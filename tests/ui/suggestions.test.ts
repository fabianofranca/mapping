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
  it('pega letras, dígitos, _ e . antes do cursor', () => {
    expect(wordAtCursor('List<Usu', 8)).toEqual({ start: 5, text: 'Usu' });
    expect(wordAtCursor('a.b_c9', 6)).toEqual({ start: 0, text: 'a.b_c9' });
    expect(wordAtCursor('Ação', 4)).toEqual({ start: 0, text: 'Ação' });
  });

  it('vazia quando o caractere antes do cursor não é de palavra', () => {
    expect(wordAtCursor('List<', 5)).toEqual({ start: 5, text: '' });
    expect(wordAtCursor('', 0)).toEqual({ start: 0, text: '' });
  });

  it('ignora o que vem depois do cursor e limita o cursor ao texto', () => {
    expect(wordAtCursor('Str Int', 3)).toEqual({ start: 0, text: 'Str' });
    expect(wordAtCursor('abc', 99)).toEqual({ start: 0, text: 'abc' });
  });
});

describe('filterSuggestions', () => {
  it('palavra vazia devolve tudo', () => {
    expect(labels('')).toHaveLength(items.length);
  });

  it('ignora maiúsculas; quem começa vem antes de quem contém, na ordem original', () => {
    expect(labels('li')).toEqual(['List', 'MutableList']);
    expect(labels('IN')).toEqual(['Int', 'String']);
  });

  it('sem correspondência, vazio', () => {
    expect(labels('zzz')).toEqual([]);
  });

  it('fecha quando a única correspondência é idêntica à palavra', () => {
    expect(labels('Pair')).toEqual([]);
    expect(labels('pair')).toEqual(['Pair']);
    expect(labels('List')).toEqual(['List', 'MutableList']);
    expect(filterSuggestions(items, 'Pair', true).map((i) => i.label)).toEqual(['Pair']);
  });

  it('mantém o texto secundário', () => {
    const found = filterSuggestions([{ label: 'Usuario', detail: 'Classe' }], 'usu');
    expect(found).toEqual([{ label: 'Usuario', detail: 'Classe' }]);
  });
});

describe('replaceWord', () => {
  it('troca só a palavra antes do cursor', () => {
    expect(replaceWord('List<Usu', 8, 'Usuario')).toEqual({
      text: 'List<Usuario',
      cursor: 12,
    });
    expect(replaceWord('Str', 3, 'String')).toEqual({ text: 'String', cursor: 6 });
  });

  it('com palavra vazia insere no cursor e preserva o resto', () => {
    expect(replaceWord('List<>', 5, 'Int')).toEqual({ text: 'List<Int>', cursor: 8 });
    expect(replaceWord('Str, x', 3, 'String')).toEqual({
      text: 'String, x',
      cursor: 6,
    });
  });
});

describe('containsWord', () => {
  it('o rótulo precisa estar solto de caracteres de palavra dos dois lados', () => {
    expect(containsWord('Usuario', 'Usuario')).toBe(true);
    expect(containsWord('List<Usuario>', 'Usuario')).toBe(true);
    expect(containsWord('Map<Usuario, Int>', 'Usuario')).toBe(true);
    expect(containsWord('Usuario?', 'Usuario')).toBe(true);
    expect(containsWord('UsuarioDto', 'Usuario')).toBe(false);
    expect(containsWord('MeuUsuario', 'Usuario')).toBe(false);
    expect(containsWord('Usuario_1', 'Usuario')).toBe(false);
    expect(containsWord('a.Usuario', 'Usuario')).toBe(false);
    expect(containsWord('Usuario2', 'Usuario')).toBe(false);
  });

  it('procura nas outras ocorrências e diferencia maiúsculas', () => {
    expect(containsWord('UsuarioDto Usuario', 'Usuario')).toBe(true);
    expect(containsWord('usuario', 'Usuario')).toBe(false);
    expect(containsWord('Pessoa', '')).toBe(false);
    expect(containsWord('', 'Usuario')).toBe(false);
  });

  it('trata letras Unicode como parte da palavra', () => {
    expect(containsWord('Endereço', 'Endere')).toBe(false);
    expect(containsWord('List<Endereço>', 'Endereço')).toBe(true);
  });
});

describe('mergeLinkedItems', () => {
  it('alvos primeiro; a fixa de mesmo texto é descartada', () => {
    const targets = [{ label: 'Usuario', detail: 'Classe', id: '1' }];
    expect(mergeLinkedItems(targets, ['String', 'Usuario', { label: 'Int' }])).toEqual([
      { label: 'Usuario', detail: 'Classe', id: '1' },
      { label: 'String' },
      { label: 'Int' },
    ]);
  });
});

import { describe, expect, it } from 'vitest';
import { createMessageSet } from '../../src/model/messages/collector';

// Item 7 da #1530 (decisão 5): a chave de dedup do coletor usa os pares nome e valor, ordenados
// pelo nome; o tipo do valor fica de fora (`1` e `'1'` dão o mesmo texto).

describe('coletor de mensagens (chave de dedup)', () => {
  it('parâmetros de nomes diferentes não se fundem', () => {
    const set = createMessageSet();
    set.add('engine.fieldMissing', { a: 'x' });
    set.add('engine.fieldMissing', { b: 'x' });
    expect(set.list()).toHaveLength(2);
  });

  it('a ordem em que os parâmetros entraram não conta', () => {
    const set = createMessageSet();
    set.add('engine.invalidValue', { a: '1', b: '2' });
    set.add('engine.invalidValue', { b: '2', a: '1' });
    expect(set.list()).toHaveLength(1);
  });

  it('o tipo do valor não conta (`1` e `"1"` dão o mesmo texto)', () => {
    const set = createMessageSet();
    set.add('engine.fieldMissing', { n: 1 });
    set.add('engine.fieldMissing', { n: '1' });
    expect(set.list()).toHaveLength(1);
  });

  it('a lista inicial segue a mesma chave', () => {
    const first = createMessageSet();
    const m1 = first.add('engine.invalidValue', { a: '1', b: '2' });
    const m2 = createMessageSet([m1]).add('engine.invalidValue', { b: '2', a: '1' });
    expect(m2).toBe(m1);
  });
});

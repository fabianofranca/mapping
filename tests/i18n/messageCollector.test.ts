import { describe, expect, it } from 'vitest';
import { createMessageSet } from '../../src/model/messages/collector';

// Item 7 of #1530 (decision 5): the collector's dedup key uses the name and value pairs, sorted
// by name; the value type is left out (`1` and `'1'` give the same text).

describe('message collector (dedup key)', () => {
  it('parameters with different names do not merge', () => {
    const set = createMessageSet();
    set.add('engine.fieldMissing', { a: 'x' });
    set.add('engine.fieldMissing', { b: 'x' });
    expect(set.list()).toHaveLength(2);
  });

  it('the order in which the parameters came in does not matter', () => {
    const set = createMessageSet();
    set.add('engine.invalidValue', { a: '1', b: '2' });
    set.add('engine.invalidValue', { b: '2', a: '1' });
    expect(set.list()).toHaveLength(1);
  });

  it('the value type does not matter (`1` and `"1"` give the same text)', () => {
    const set = createMessageSet();
    set.add('engine.fieldMissing', { n: 1 });
    set.add('engine.fieldMissing', { n: '1' });
    expect(set.list()).toHaveLength(1);
  });

  it('the initial list follows the same key', () => {
    const first = createMessageSet();
    const m1 = first.add('engine.invalidValue', { a: '1', b: '2' });
    const m2 = createMessageSet([m1]).add('engine.invalidValue', { b: '2', a: '1' });
    expect(m2).toBe(m1);
  });
});
